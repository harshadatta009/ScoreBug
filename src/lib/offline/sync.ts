/**
 * Offline→online sync engine for ball events.
 *
 * CONFLICT RESOLUTION STRATEGY
 * ─────────────────────────────
 * The server is the source of truth for sequence numbers. The `balls` table
 * has a UNIQUE constraint on (innings_id, sequence). If two clients (or a
 * client that restarted mid-over) submit a ball with the same sequence, the
 * second write is a conflict:
 *
 *   • The server returns HTTP 409 with the body:
 *       { code: "SEQUENCE_CONFLICT", nextFreeSequence: <n> }
 *
 *   • The sync engine re-sequences the offending ball to `nextFreeSequence`
 *     and retries immediately (once). This is last-write-wins-by-sequence:
 *     whichever ball arrives second will occupy a later sequence position.
 *
 *   • DIVERGENCE DETECTION: if the server's highest confirmed sequence for an
 *     innings diverges from the client's last-synced sequence by more than
 *     `DIVERGENCE_THRESHOLD`, we emit a "SCORE_DIVERGED" message to the UI so
 *     the scorer can review and manually reconcile. This guards against a
 *     full reset of the innings or a bulk import on another device.
 *
 * LAST-WRITE-WINS NOTES
 * ─────────────────────
 * For a live match with a single scorer (the common case), sequence conflicts
 * are rare — they happen only after forced app restarts or multi-device scoring.
 * The strategy favours simplicity and low-latency scoring over linearisability.
 * For multi-scorer scenarios, a collaborative CRDT approach would be needed but
 * is out of scope for v1.
 *
 * BACKGROUND SYNC WIRING
 * ──────────────────────
 * The service worker registers a 'scorebug-ball-sync' sync tag whenever the
 * app queues a ball while offline. On reconnect, the SW fires the 'sync' event,
 * posts a SYNC_PENDING message to the app, and the app calls syncPending().
 *
 * Fallback (browsers without Background Sync API, e.g. Firefox Desktop):
 *   useOnlineStatus() watches the 'online' window event and calls syncPending()
 *   directly. See src/hooks/use-online-status.ts.
 */

import { getDB } from "./db";
import {
  getPending,
  getAllForInnings,
  markSynced,
  markFailed,
  markSyncing,
  resequenceBall,
  purgeSynced,
} from "./queue";
import type { PendingBall } from "./db";
import type { BallId, InningsId } from "@/domain/shared/ids";
import { asId } from "@/domain/shared/ids";

// ─── Configuration ────────────────────────────────────────────────────────────

/** After this many consecutive failures, back off and emit a warning. */
const MAX_RETRY_COUNT = 5;

/**
 * If the server's last confirmed sequence exceeds ours by this many balls,
 * we assume another device or a manual import has written scoring data that
 * we don't have locally, and we surface a divergence warning.
 */
const DIVERGENCE_THRESHOLD = 3;

// ─── Server response shapes ───────────────────────────────────────────────────

interface SyncBallSuccess {
  ok: true;
  serverSequence: number;
  clientUuid: string;
}

interface SyncBallConflict {
  ok: false;
  code: "SEQUENCE_CONFLICT";
  nextFreeSequence: number;
  clientUuid: string;
}

interface SyncBallError {
  ok: false;
  code: "SERVER_ERROR" | "VALIDATION_ERROR" | string;
  message?: string;
  clientUuid: string;
}

type SyncBallResponse = SyncBallSuccess | SyncBallConflict | SyncBallError;

/** Batch response from POST /api/sync. */
interface SyncBatchResponse {
  results: SyncBallResponse[];
  /**
   * The highest sequence the server has stored for this innings, regardless of
   * which client wrote it. Used for divergence detection.
   */
  serverMaxSequence: number;
  inningsId: string;
}

// ─── Sync callback type ───────────────────────────────────────────────────────

/**
 * A function that takes a batch of pending balls and submits them to the
 * server. The default implementation POSTs to /api/sync. Callers may inject
 * a custom function (e.g., directly calling a Supabase RPC) in tests or
 * in contexts where fetch isn't available.
 */
export type SyncCallback = (
  balls: PendingBall[],
  inningsId: InningsId,
) => Promise<SyncBatchResponse>;

// ─── Default sync transport: POST /api/sync ──────────────────────────────────

export async function defaultSyncCallback(
  balls: PendingBall[],
  inningsId: InningsId,
): Promise<SyncBatchResponse> {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Strip the queue-metadata fields before sending to the server.
    body: JSON.stringify({
      inningsId,
      balls: balls.map(({ clientUuid, matchId, status, enqueuedAt, retryCount, serverSequence: _s, ...ball }) => ({
        ...ball,
        clientUuid,
      })),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new SyncTransportError(response.status, await response.text());
  }

  return response.json() as Promise<SyncBatchResponse>;
}

/** Thrown when the HTTP layer itself fails (network error or non-2xx). */
export class SyncTransportError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Sync transport error: HTTP ${status}`);
    this.name = "SyncTransportError";
  }
}

// ─── Sync events emitted to the UI ───────────────────────────────────────────

export type SyncEvent =
  | { type: "SYNC_STARTED"; inningsId: InningsId; ballCount: number }
  | { type: "SYNC_COMPLETED"; inningsId: InningsId; syncedCount: number }
  | { type: "SYNC_CONFLICT_RESOLVED"; inningsId: InningsId; clientUuid: BallId; newSequence: number }
  | { type: "SYNC_FAILED"; inningsId: InningsId; error: unknown }
  | { type: "SCORE_DIVERGED"; inningsId: InningsId; serverMaxSequence: number; localMaxSequence: number };

export type SyncListener = (event: SyncEvent) => void;

const _listeners = new Set<SyncListener>();

export function addSyncListener(listener: SyncListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _emit(event: SyncEvent): void {
  _listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      // Never let a listener crash the sync engine.
    }
  });
}

// ─── Main sync function ───────────────────────────────────────────────────────

/** Guard against concurrent flushes for the same innings. */
const _inFlightInnings = new Set<InningsId>();

/**
 * Flush all queued balls for the given innings to the server.
 *
 * If called with no `inningsId`, it flushes all innings that have pending balls.
 * Safe to call multiple times concurrently — per-innings mutex prevents double
 * submission.
 *
 * @param inningsId   - Scope the flush to one innings (optional).
 * @param syncCallback - Override the default HTTP transport (for testing).
 * @returns Total number of balls successfully synced.
 */
export async function syncPending(
  inningsId?: InningsId,
  syncCallback: SyncCallback = defaultSyncCallback,
): Promise<number> {
  if (inningsId) {
    return _flushInnings(inningsId, syncCallback);
  }

  // No inningsId — discover all innings with pending balls.
  const db = await getDB();
  const allPending = await db.getAllFromIndex("pending_balls", "by-status", "queued");
  const failedPending = await db.getAllFromIndex("pending_balls", "by-status", "failed");
  const combined = [...allPending, ...failedPending];

  // Deduplicate innings IDs.
  const inningsIds = [...new Set(combined.map((b) => b.inningsId))];

  let total = 0;
  for (const iid of inningsIds) {
    total += await _flushInnings(iid, syncCallback);
  }

  // Opportunistically purge synced balls older than 24 h.
  await purgeSynced().catch(() => {/* non-critical */});

  return total;
}

async function _flushInnings(
  inningsId: InningsId,
  syncCallback: SyncCallback,
): Promise<number> {
  if (_inFlightInnings.has(inningsId)) {
    // Another flush is in progress for this innings — skip to avoid duplicates.
    return 0;
  }

  const pending = await getPending(inningsId);
  if (pending.length === 0) return 0;

  _inFlightInnings.add(inningsId);
  _emit({ type: "SYNC_STARTED", inningsId, ballCount: pending.length });

  try {
    // Mark all as "syncing" so concurrent getPending() calls skip them.
    await Promise.all(pending.map((b) => markSyncing(b.clientUuid)));

    let batch: PendingBatch = { balls: pending, retryCount: 0 };
    let syncedCount = 0;

    // Allow one re-sequence retry per flush.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await _submitBatch(batch.balls, inningsId, syncCallback);
      syncedCount += result.syncedCount;
      _detectDivergence(inningsId, result.serverMaxSequence, pending);

      if (result.resequenced.length === 0) break;

      // Prepare the re-sequenced balls for a second attempt.
      batch = { balls: result.resequenced, retryCount: attempt + 1 };
    }

    _emit({ type: "SYNC_COMPLETED", inningsId, syncedCount });
    return syncedCount;

  } catch (error) {
    // Transport-level failure — reset syncing → queued so they retry next time.
    await _resetSyncingBalls(inningsId);
    _emit({ type: "SYNC_FAILED", inningsId, error });
    return 0;
  } finally {
    _inFlightInnings.delete(inningsId);
  }
}

interface PendingBatch {
  balls: PendingBall[];
  retryCount: number;
}

interface BatchResult {
  syncedCount: number;
  resequenced: PendingBall[];
  serverMaxSequence: number;
}

async function _submitBatch(
  balls: PendingBall[],
  inningsId: InningsId,
  syncCallback: SyncCallback,
): Promise<BatchResult> {
  const response = await syncCallback(balls, inningsId);
  const resequenced: PendingBall[] = [];
  let syncedCount = 0;

  for (const result of response.results) {
    const clientUuid = asId<"BallId">(result.clientUuid) as BallId;

    if (result.ok) {
      await markSynced(clientUuid, result.serverSequence);
      syncedCount++;
    } else if (result.code === "SEQUENCE_CONFLICT") {
      // Re-sequence the local ball to the server's suggested next free sequence.
      const conflict = result as SyncBallConflict;
      await resequenceBall(clientUuid, conflict.nextFreeSequence);
      _emit({
        type: "SYNC_CONFLICT_RESOLVED",
        inningsId,
        clientUuid,
        newSequence: conflict.nextFreeSequence,
      });

      // Retrieve the updated ball for the retry batch.
      const ball = balls.find((b) => (b.clientUuid as string) === result.clientUuid);
      if (ball) {
        resequenced.push({ ...ball, sequence: conflict.nextFreeSequence, status: "queued" });
      }
    } else {
      // Non-retryable error (validation failure, auth, etc.).
      const ball = balls.find((b) => (b.clientUuid as string) === result.clientUuid);
      const newRetryCount = (ball?.retryCount ?? 0) + 1;

      if (newRetryCount >= MAX_RETRY_COUNT) {
        await markFailed(clientUuid, newRetryCount);
      } else {
        // Put it back in the queue for the next sync attempt.
        await markFailed(clientUuid, newRetryCount);
      }
    }
  }

  return { syncedCount, resequenced, serverMaxSequence: response.serverMaxSequence };
}

/**
 * DIVERGENCE DETECTION
 *
 * If `serverMaxSequence` is ahead of our highest local sequence by more than
 * DIVERGENCE_THRESHOLD, another device has written balls we don't know about.
 * We surface this to the UI so the scorer can reload and review.
 */
function _detectDivergence(
  inningsId: InningsId,
  serverMaxSequence: number,
  localBalls: PendingBall[],
): void {
  if (localBalls.length === 0) return;

  const localMaxSequence = Math.max(...localBalls.map((b) => b.sequence));

  if (serverMaxSequence - localMaxSequence > DIVERGENCE_THRESHOLD) {
    _emit({ type: "SCORE_DIVERGED", inningsId, serverMaxSequence, localMaxSequence });
  }
}

/** Reset any "syncing" balls back to "queued" after a transport failure. */
async function _resetSyncingBalls(inningsId: InningsId): Promise<void> {
  const db = await getDB();
  const syncingBalls = await getAllForInnings(inningsId).then((balls) =>
    balls.filter((b) => b.status === "syncing"),
  );
  await Promise.all(
    syncingBalls.map((b) =>
      db.put("pending_balls", { ...b, status: "queued" }),
    ),
  );
}

// ─── Background Sync registration ────────────────────────────────────────────

/**
 * Register a Background Sync tag so the service worker will call syncPending()
 * when connectivity is restored (even if the app tab is closed).
 *
 * Falls back gracefully: if the Background Sync API is unavailable, this is a
 * no-op — the 'online' event handler in useOnlineStatus() will trigger instead.
 */
export async function registerBackgroundSync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  // `sync` property exists in Chrome/Edge; absent in Firefox and Safari.
  const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
  if (syncManager) {
    await syncManager.register("scorebug-ball-sync").catch((err: unknown) => {
      console.warn("[Scorebug] Background Sync registration failed:", err);
    });
  }
}
