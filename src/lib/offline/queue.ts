/**
 * Offline ball-event queue.
 *
 * DESIGN INTENT
 * ─────────────
 * The scorer's primary concern is recording deliveries without interruption.
 * Network availability is a secondary concern. This queue decouples delivery
 * from transmission:
 *
 *   1. enqueueBall()  — immediately persists the BallEvent to IDB and assigns
 *      a client-side UUID (= BallEvent.id). Returns instantly; the network is
 *      never awaited on the scoring hot path.
 *
 *   2. getPending()   — returns all un-synced balls for an innings in sequence
 *      order, so the sync engine can replay them server-side in the correct
 *      order.
 *
 *   3. markSynced()   — called by the sync engine after the server confirms a
 *      ball. Updates the status to "synced" and records the server-assigned
 *      sequence (which may differ from the local one after conflict resolution).
 *
 * IDEMPOTENCY
 * ───────────
 * Each ball carries a client UUID (client_uuid column on the server). The
 * server performs an UPSERT keyed on (innings_id, sequence), with a secondary
 * unique constraint on client_uuid. If the client retries a failed request,
 * the second write is a no-op. If there is a sequence collision (two offline
 * clients scored balls 12 at the same time), the server's constraint wins and
 * the losing ball gets re-sequenced by syncPending() — see sync.ts.
 *
 * SEQUENCE ASSIGNMENT
 * ───────────────────
 * Local sequences are optimistic and 1-based within the innings. The sync
 * engine may renumber them; what matters for the game state is the server's
 * canonical ordering. The `serverSequence` field on PendingBall stores the
 * confirmed server value.
 */

import { getDB } from "./db";
import type { PendingBall, PendingBallStatus } from "./db";
import type { BallEvent } from "@/domain/cricket/ball";
import type { BallId, InningsId, MatchId } from "@/domain/shared/ids";
import { asId } from "@/domain/shared/ids";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a RFC-4122 v4 UUID for client-side IDs. */
function newUuid(): string {
  // crypto.randomUUID() is available in all modern browsers and Node ≥ 19.
  // For older environments a polyfill is unnecessary — the PWA requires a
  // modern browser anyway.
  return crypto.randomUUID();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a BallEvent for offline storage.
 *
 * A fresh client UUID is generated and used as both `ball.id` and the IDB key.
 * The ball is stored with status "queued" and `retryCount` 0.
 *
 * @param input - The complete BallEvent (id must be provided by the caller or
 *   generated here — we always override it with a fresh UUID to guarantee
 *   uniqueness on the client side).
 * @param matchId - Denormalised match reference for the IDB index.
 * @returns The stored PendingBall (including the assigned clientUuid).
 */
export async function enqueueBall(
  input: BallEvent,
  matchId: MatchId,
): Promise<PendingBall> {
  const db = await getDB();

  const clientUuid = asId<"BallId">(newUuid()) as BallId;

  const pending: PendingBall = {
    ...input,
    id: clientUuid, // override with fresh UUID to prevent collisions
    clientUuid,
    matchId,
    status: "queued",
    enqueuedAt: new Date().toISOString(),
    retryCount: 0,
  };

  await db.put("pending_balls", pending);

  // Update outbox_meta pendingCount.
  await _incrementPendingCount(input.inningsId, db);

  return pending;
}

/**
 * Return all pending balls for a given innings in ascending sequence order.
 *
 * Only "queued" and "failed" balls are returned — "syncing" and "synced" are
 * excluded so callers don't double-submit in-flight requests.
 */
export async function getPending(inningsId: InningsId): Promise<PendingBall[]> {
  const db = await getDB();

  // Use the compound index to retrieve balls ordered by [inningsId, sequence].
  const range = IDBKeyRange.bound([inningsId, 0], [inningsId, Number.MAX_SAFE_INTEGER]);
  const balls = await db.getAllFromIndex("pending_balls", "by-innings-sequence", range);

  return balls.filter(
    (b) => b.status === "queued" || b.status === "failed",
  );
}

/**
 * Return ALL balls for an innings (any status), useful for conflict resolution.
 */
export async function getAllForInnings(inningsId: InningsId): Promise<PendingBall[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound([inningsId, 0], [inningsId, Number.MAX_SAFE_INTEGER]);
  return db.getAllFromIndex("pending_balls", "by-innings-sequence", range);
}

/**
 * Mark a ball as successfully synced and record the server-confirmed sequence.
 *
 * @param clientUuid - The client-side UUID of the ball.
 * @param serverSequence - The sequence number the server accepted / assigned.
 */
export async function markSynced(
  clientUuid: BallId,
  serverSequence: number,
): Promise<void> {
  const db = await getDB();

  const ball = await db.get("pending_balls", clientUuid as string);
  if (!ball) return; // already cleaned up or never existed

  await db.put("pending_balls", {
    ...ball,
    status: "synced" satisfies PendingBallStatus,
    serverSequence,
  });

  // Decrement outbox_meta pendingCount.
  await _decrementPendingCount(ball.inningsId, db);
}

/**
 * Mark a ball as failed (e.g., after a non-retryable server error).
 * The sync engine increments retryCount before calling this.
 */
export async function markFailed(
  clientUuid: BallId,
  retryCount: number,
): Promise<void> {
  const db = await getDB();

  const ball = await db.get("pending_balls", clientUuid as string);
  if (!ball) return;

  await db.put("pending_balls", {
    ...ball,
    status: "failed" satisfies PendingBallStatus,
    retryCount,
  });
}

/**
 * Mark a ball as "syncing" (in-flight) to prevent duplicate submissions
 * if syncPending() is called concurrently (e.g., Background Sync fires while
 * the user manually triggers a flush).
 */
export async function markSyncing(clientUuid: BallId): Promise<void> {
  const db = await getDB();

  const ball = await db.get("pending_balls", clientUuid as string);
  if (!ball) return;

  await db.put("pending_balls", {
    ...ball,
    status: "syncing" satisfies PendingBallStatus,
  });
}

/**
 * Update the local sequence of a ball — used during conflict resolution when
 * the server tells us the sequence we chose is already taken.
 */
export async function resequenceBall(
  clientUuid: BallId,
  newSequence: number,
): Promise<void> {
  const db = await getDB();

  const ball = await db.get("pending_balls", clientUuid as string);
  if (!ball) return;

  await db.put("pending_balls", {
    ...ball,
    sequence: newSequence,
    status: "queued" satisfies PendingBallStatus,
  });
}

/** Retrieve a single pending ball by its clientUuid. */
export async function getPendingBall(clientUuid: BallId): Promise<PendingBall | undefined> {
  const db = await getDB();
  return db.get("pending_balls", clientUuid as string);
}

/**
 * Delete synced balls older than `maxAgeMs` to keep IDB storage lean.
 * Call this periodically (e.g., on app startup or after a successful sync).
 */
export async function purgeSynced(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDB();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const all = await db.getAllFromIndex("pending_balls", "by-status", "synced");
  const toDelete = all.filter((b) => b.enqueuedAt < cutoff);

  const tx = db.transaction("pending_balls", "readwrite");
  await Promise.all([
    ...toDelete.map((b) => tx.store.delete(b.clientUuid as string)),
    tx.done,
  ]);

  return toDelete.length;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type DB = Awaited<ReturnType<typeof getDB>>;

async function _incrementPendingCount(inningsId: InningsId, db: DB): Promise<void> {
  const meta = await db.get("outbox_meta", inningsId as string);
  await db.put("outbox_meta", {
    inningsId,
    lastSyncedSequence: meta?.lastSyncedSequence ?? 0,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
    pendingCount: (meta?.pendingCount ?? 0) + 1,
  });
}

async function _decrementPendingCount(inningsId: InningsId, db: DB): Promise<void> {
  const meta = await db.get("outbox_meta", inningsId as string);
  if (!meta) return;
  await db.put("outbox_meta", {
    ...meta,
    pendingCount: Math.max(0, meta.pendingCount - 1),
  });
}
