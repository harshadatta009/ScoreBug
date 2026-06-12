/**
 * IndexedDB schema for Scorebug's offline-first scoring layer.
 *
 * WHY IDB?
 * localStorage is synchronous and size-limited (~5 MB). IndexedDB is async,
 * can store structured objects, supports indexes for efficient queries, and
 * works inside service workers. We use the `idb` wrapper for ergonomic,
 * promise-based access with full TypeScript generics.
 *
 * STORES
 * ──────
 * pending_balls   — BallEvent rows that have been scored but not yet
 *                   acknowledged by the server. Keyed by client UUID.
 *                   The (inningsId, sequence) compound index lets the sync
 *                   engine retrieve all balls for a given innings in order.
 *
 * matches_cache   — Last-known InningsScore per match, so the scoring UI can
 *                   render instantly without a network round-trip.
 *
 * outbox_meta     — Lightweight bookkeeping: last-synced sequence per innings,
 *                   last successful sync timestamp, pending-count snapshot.
 *                   One row per inningsId (keyed by inningsId string).
 */

import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { BallEvent } from "@/domain/cricket/ball";
import type { BallId, InningsId, MatchId } from "@/domain/shared/ids";

/**
 * Augmented InningsScore stored in the matches_cache store.
 * We add `matchId` (not present in InningsScore) so the store can be
 * indexed by match — allowing all innings for a match to be fetched at once.
 */
export type CachedInningsScore = import("@/domain/cricket/scorecard").InningsScore & {
  /** Denormalised matchId for the IDB index. */
  matchId: MatchId;
  /** ISO timestamp when this entry was last written to the cache. */
  cachedAt: string;
};

// ─── Augmented stored type (adds queue metadata to BallEvent) ────────────────

/** Status lifecycle: queued → syncing → synced | failed */
export type PendingBallStatus = "queued" | "syncing" | "synced" | "failed";

/**
 * A BallEvent extended with offline-queue metadata.
 *
 * `clientUuid` is the IDB key — identical to `ball.id` for new balls, but
 * kept separate so the server can reject the id and reassign without orphaning
 * the queue entry.
 *
 * `retryCount` tracks transient failures so the sync engine can back off after
 * repeated 5xx errors and surface a warning in the UI.
 */
export interface PendingBall extends BallEvent {
  /** IDB key — same as BallEvent.id at creation time. */
  clientUuid: BallId;
  /** Which innings this ball belongs to (denormalised for the index). */
  matchId: MatchId;
  status: PendingBallStatus;
  /** Wall-clock time this entry was enqueued. */
  enqueuedAt: string;
  /** Number of failed sync attempts (for exponential back-off display). */
  retryCount: number;
  /** Server-assigned sequence after a successful sync (may differ from local). */
  serverSequence?: number;
}

/** Bookkeeping row stored per-innings in outbox_meta. */
export interface OutboxMeta {
  inningsId: InningsId;
  /** Highest sequence number the server has confirmed. */
  lastSyncedSequence: number;
  /** ISO timestamp of the last successful flush. */
  lastSyncedAt: string | null;
  /** Count of balls currently in "queued" or "failed" state. */
  pendingCount: number;
}

// ─── DB type definition for idb's TypeScript generics ────────────────────────

export interface ScorebugDB {
  pending_balls: {
    key: string; // clientUuid (BallId)
    value: PendingBall;
    indexes: {
      "by-innings": InningsId;
      "by-innings-sequence": [InningsId, number];
      "by-match": MatchId;
      "by-status": PendingBallStatus;
    };
  };
  matches_cache: {
    key: string; // inningsId (InningsId)
    value: CachedInningsScore;
    indexes: {
      "by-match": MatchId;
    };
  };
  outbox_meta: {
    key: string; // inningsId
    value: OutboxMeta;
    indexes: Record<never, never>;
  };
}

// ─── Singleton DB promise ─────────────────────────────────────────────────────

let _db: IDBPDatabase<ScorebugDB> | null = null;

/**
 * Open (or reuse) the "scorebug" IDB database.
 *
 * VERSION STRATEGY: bump `DB_VERSION` when adding/removing stores or indexes.
 * Migration callbacks in `upgrade` are additive; never delete data in place.
 */
const DB_NAME = "scorebug";
const DB_VERSION = 1;

export async function getDB(): Promise<IDBPDatabase<ScorebugDB>> {
  if (_db) return _db;

  _db = await openDB<ScorebugDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v0 → v1 ──────────────────────────────────────────────────────────
      if (oldVersion < 1) {
        // pending_balls store
        const ballStore = db.createObjectStore("pending_balls", {
          keyPath: "clientUuid",
        });
        ballStore.createIndex("by-innings", "inningsId");
        ballStore.createIndex("by-innings-sequence", ["inningsId", "sequence"]);
        ballStore.createIndex("by-match", "matchId");
        ballStore.createIndex("by-status", "status");

        // matches_cache store — keyed by inningsId, indexed by matchId.
        // CachedInningsScore extends InningsScore with a matchId field that
        // callers must supply on write (InningsScore itself omits matchId).
        const cacheStore = db.createObjectStore("matches_cache", {
          keyPath: "inningsId",
        });
        cacheStore.createIndex("by-match", "matchId");

        // outbox_meta store
        db.createObjectStore("outbox_meta", { keyPath: "inningsId" });
      }
    },

    blocked() {
      // Another tab is blocking the upgrade — prompt the user to close other tabs.
      console.warn("[Scorebug IDB] Upgrade blocked. Please close other Scorebug tabs.");
    },

    blocking() {
      // This tab is blocking a newer version — close our connection gracefully.
      _db?.close();
      _db = null;
    },
  });

  return _db;
}

/**
 * Reset the singleton (for testing only — do not call in production).
 * @internal
 */
export function _resetDBSingleton(): void {
  _db?.close();
  _db = null;
}
