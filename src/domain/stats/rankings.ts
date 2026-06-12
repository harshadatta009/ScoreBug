import type { PlayerId } from "@/domain/shared/ids";
import type {
  BattingAggregate,
  BowlingAggregate,
  FieldingAggregate,
} from "./aggregate";

/**
 * Leaderboards & MVP ranking.
 *
 * Pure, deterministic ordering of the aggregates produced by `aggregate.ts`.
 * Every leaderboard applies a minimum-qualification threshold (so a player with
 * one lucky ball doesn't top a rate-based board) and a fully-specified
 * tie-break chain, so the ordering is total and stable regardless of input
 * order. Rate metrics are guarded against divide-by-zero upstream in the
 * aggregates; here we only sort.
 */

// ─── Qualification thresholds ────────────────────────────────────────────────
// Exported so callers / tests can reason about who is eligible. Kept small so
// fledgling datasets still produce a board.

/** A batter must have faced at least this many balls to rank. */
export const MIN_BALLS_FACED = 1;
/** A bowler must have bowled at least this many legal balls to rank. */
export const MIN_BALLS_BOWLED = 1;

export interface LeaderboardEntry<T> {
  rank: number; // 1-based, dense within the board
  value: T;
}

export type BattingLeaderboard = LeaderboardEntry<BattingAggregate>[];
export type BowlingLeaderboard = LeaderboardEntry<BowlingAggregate>[];
export type FieldingLeaderboard = LeaderboardEntry<FieldingAggregate>[];

/** Assign 1-based ranks in the already-sorted order. */
function withRanks<T>(sorted: T[]): LeaderboardEntry<T>[] {
  return sorted.map((value, i) => ({ rank: i + 1, value }));
}

/**
 * Most-runs batting board.
 *
 * Order: runs desc → strike rate desc → fewer balls faced (more efficient) →
 * playerId asc (stable final tie-break). Players below the balls-faced
 * threshold are excluded.
 */
export function buildBattingLeaderboard(
  aggregates: Iterable<BattingAggregate>,
  minBallsFaced: number = MIN_BALLS_FACED,
): BattingLeaderboard {
  const eligible = [...aggregates].filter(
    (a) => a.ballsFaced >= minBallsFaced,
  );
  eligible.sort(
    (a, b) =>
      b.runs - a.runs ||
      b.strikeRate - a.strikeRate ||
      a.ballsFaced - b.ballsFaced ||
      compareIds(a.player, b.player),
  );
  return withRanks(eligible);
}

/**
 * Most-wickets bowling board.
 *
 * Order: wickets desc → economy asc (lower is better) → more balls bowled
 * (workhorse) → playerId asc. Players below the balls-bowled threshold are
 * excluded.
 */
export function buildBowlingLeaderboard(
  aggregates: Iterable<BowlingAggregate>,
  minBallsBowled: number = MIN_BALLS_BOWLED,
): BowlingLeaderboard {
  const eligible = [...aggregates].filter(
    (a) => a.ballsBowled >= minBallsBowled,
  );
  eligible.sort(
    (a, b) =>
      b.wickets - a.wickets ||
      a.economy - b.economy ||
      b.ballsBowled - a.ballsBowled ||
      compareIds(a.player, b.player),
  );
  return withRanks(eligible);
}

/**
 * Fielding board ranked by total dismissals (catches + stumpings + run-outs).
 *
 * Order: dismissals desc → catches desc → stumpings desc → playerId asc.
 * Players with zero dismissals are excluded — a fielding board of empty rows is
 * noise.
 */
export function buildFieldingLeaderboard(
  aggregates: Iterable<FieldingAggregate>,
): FieldingLeaderboard {
  const eligible = [...aggregates].filter((a) => a.dismissals > 0);
  eligible.sort(
    (a, b) =>
      b.dismissals - a.dismissals ||
      b.catches - a.catches ||
      b.stumpings - a.stumpings ||
      compareIds(a.player, b.player),
  );
  return withRanks(eligible);
}

// ─── MVP ─────────────────────────────────────────────────────────────────────

/**
 * MVP points weights.
 *
 * A single scalar that blends batting, bowling and fielding into one "impact"
 * score. The weights are deliberately wicket-heavy (a wicket is rarer and more
 * decisive than a run) and reward milestones, mirroring common fantasy-cricket
 * scoring. All weights are exported so the formula is transparent and tunable.
 *
 *   points =
 *       RUN * runs
 *     + BOUNDARY_FOUR * fours
 *     + BOUNDARY_SIX  * sixes
 *     + FIFTY * fifties + HUNDRED * hundreds
 *     + WICKET * wickets
 *     + MAIDEN * maidens
 *     + CATCH * catches + STUMPING * stumpings + RUN_OUT * runOuts
 */
export const MVP_WEIGHTS = {
  RUN: 1,
  BOUNDARY_FOUR: 1,
  BOUNDARY_SIX: 2,
  FIFTY: 8,
  HUNDRED: 16,
  WICKET: 25,
  MAIDEN: 4,
  CATCH: 8,
  STUMPING: 10,
  RUN_OUT: 6,
} as const;

export interface MVPInput {
  player: PlayerId;
  batting?: BattingAggregate;
  bowling?: BowlingAggregate;
  fielding?: FieldingAggregate;
}

export interface MVPResult {
  rank: number; // 1-based
  player: PlayerId;
  points: number;
  /** Component breakdown for transparency in the UI. */
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
}

function battingPoints(b: BattingAggregate | undefined): number {
  if (!b) return 0;
  return (
    MVP_WEIGHTS.RUN * b.runs +
    MVP_WEIGHTS.BOUNDARY_FOUR * b.fours +
    MVP_WEIGHTS.BOUNDARY_SIX * b.sixes +
    MVP_WEIGHTS.FIFTY * b.fifties +
    MVP_WEIGHTS.HUNDRED * b.hundreds
  );
}

function bowlingPoints(b: BowlingAggregate | undefined): number {
  if (!b) return 0;
  return MVP_WEIGHTS.WICKET * b.wickets + MVP_WEIGHTS.MAIDEN * b.maidens;
}

function fieldingPoints(f: FieldingAggregate | undefined): number {
  if (!f) return 0;
  return (
    MVP_WEIGHTS.CATCH * f.catches +
    MVP_WEIGHTS.STUMPING * f.stumpings +
    MVP_WEIGHTS.RUN_OUT * f.runOuts
  );
}

/**
 * Compute the MVP ranking. Combines each player's batting/bowling/fielding
 * aggregates into a single points total and orders by points desc, then
 * playerId asc for a stable tie-break.
 */
export function computeMVP(players: Iterable<MVPInput>): MVPResult[] {
  const scored = [...players].map((p) => {
    const bat = battingPoints(p.batting);
    const bowl = bowlingPoints(p.bowling);
    const field = fieldingPoints(p.fielding);
    return {
      player: p.player,
      points: bat + bowl + field,
      battingPoints: bat,
      bowlingPoints: bowl,
      fieldingPoints: field,
    };
  });

  scored.sort((a, b) => b.points - a.points || compareIds(a.player, b.player));
  return scored.map((s, i) => ({ rank: i + 1, ...s }));
}

/**
 * Convenience: assemble MVP inputs from the three aggregate maps (the typical
 * source). The union of all player ids across the maps is ranked.
 */
export function buildMVPInputs(
  batting: ReadonlyMap<PlayerId, BattingAggregate>,
  bowling: ReadonlyMap<PlayerId, BowlingAggregate>,
  fielding: ReadonlyMap<PlayerId, FieldingAggregate>,
): MVPInput[] {
  const ids = new Set<PlayerId>([
    ...batting.keys(),
    ...bowling.keys(),
    ...fielding.keys(),
  ]);
  return [...ids].map((player) => ({
    player,
    batting: batting.get(player),
    bowling: bowling.get(player),
    fielding: fielding.get(player),
  }));
}

/** Total ordering on branded player ids (their underlying string value). */
function compareIds(a: PlayerId, b: PlayerId): number {
  return (a as string) < (b as string)
    ? -1
    : (a as string) > (b as string)
      ? 1
      : 0;
}
