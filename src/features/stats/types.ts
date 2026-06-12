/**
 * Presentational row models for the leaderboards.
 *
 * These flatten the repository stats + a resolved player display name into the
 * minimal shape each leaderboard table renders. Keeping them separate from the
 * repository view models means the table components have no dependency on
 * server-only modules and stay trivially testable / reusable.
 */

export interface LeaderboardRowVM {
  rank: number;
  playerId: string;
  /** Resolved display name; falls back to a short id when unknown. */
  name: string;
  /** Primary metric, already formatted (e.g. "342", "18"). */
  metric: string;
  /** Optional secondary detail shown muted (e.g. "SR 142.5", "Econ 6.20"). */
  detail?: string;
}

export type LeaderboardKind = "batting" | "bowling" | "fielding" | "mvp";
