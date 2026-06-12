/**
 * Statistics domain — public surface.
 *
 * Pure, deterministic, IO-free. `aggregate.*` folds ball-by-ball events into
 * per-player career numbers (reusing the scoring engine's per-ball rules);
 * `rankings.*` orders those aggregates into leaderboards and a single MVP score.
 */

export {
  aggregateBatting,
  aggregateBowling,
  aggregateFielding,
  type BattingAggregate,
  type BowlingAggregate,
  type FieldingAggregate,
} from "./aggregate";

export {
  buildBattingLeaderboard,
  buildBowlingLeaderboard,
  buildFieldingLeaderboard,
  computeMVP,
  buildMVPInputs,
  MVP_WEIGHTS,
  MIN_BALLS_FACED,
  MIN_BALLS_BOWLED,
  type LeaderboardEntry,
  type BattingLeaderboard,
  type BowlingLeaderboard,
  type FieldingLeaderboard,
  type MVPInput,
  type MVPResult,
} from "./rankings";
