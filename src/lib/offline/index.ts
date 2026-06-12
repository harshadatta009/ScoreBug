/**
 * Barrel export for the Scorebug offline-first scoring layer.
 *
 * Import from "@/lib/offline" to access:
 *   - IDB database (getDB, schema types)
 *   - Ball queue (enqueueBall, getPending, markSynced, …)
 *   - Sync engine (syncPending, addSyncListener, registerBackgroundSync)
 */

// Database / schema
export { getDB, _resetDBSingleton } from "./db";
export type { PendingBall, PendingBallStatus, OutboxMeta, ScorebugDB, CachedInningsScore } from "./db";

// Queue operations
export {
  enqueueBall,
  getPending,
  getAllForInnings,
  markSynced,
  markFailed,
  markSyncing,
  resequenceBall,
  getPendingBall,
  purgeSynced,
} from "./queue";

// Sync engine
export {
  syncPending,
  defaultSyncCallback,
  addSyncListener,
  registerBackgroundSync,
  SyncTransportError,
} from "./sync";
export type { SyncCallback, SyncEvent, SyncListener } from "./sync";
