import type { BallEvent } from "../ball";
import type { BattingCard } from "../scorecard";
import type { PlayerId } from "../../shared/ids";
import { NOT_OUT_DISMISSALS } from "../enums";
import { batterFaced } from "./legality";

/**
 * Per-batter aggregation.
 *
 * A batter scores ONLY off the bat; extras (wides/byes/leg-byes/no-ball
 * penalties) never accrue to a batter's individual runs. A batter is recorded
 * as having faced every delivery except a wide (a no-ball is faced). Strike
 * rate is runs/ballsFaced*100, guarded against division by zero.
 */

export interface BatterAccumulator {
  player: PlayerId;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissal: BattingCard["dismissal"];
}

export const newBatterAcc = (player: PlayerId): BatterAccumulator => ({
  player,
  runs: 0,
  ballsFaced: 0,
  fours: 0,
  sixes: 0,
  isOut: false,
  dismissal: null,
});

/**
 * Fold one delivery's batting contribution into the striker's accumulator.
 * Only the striker's bat runs / balls faced are affected here; dismissals are
 * handled separately because the player out is not always the striker (run-out).
 */
export const applyBallToStriker = (acc: BatterAccumulator, ball: BallEvent): void => {
  acc.runs += ball.batRuns;
  if (batterFaced(ball)) acc.ballsFaced += 1;
  if (ball.batRuns === 4) acc.fours += 1;
  if (ball.batRuns === 6) acc.sixes += 1;
};

/**
 * Record a dismissal against the dismissed batter. `retired_hurt` (and any
 * NOT_OUT_DISMISSALS) marks the batter as not out and leaves him able to return,
 * so it is NOT flagged as out and does not populate the dismissal line as an
 * "out" — but we still capture it so the UI can show "retired hurt".
 */
export const applyWicketToBatter = (acc: BatterAccumulator, ball: BallEvent): void => {
  const w = ball.wicket;
  if (!w) return;
  const isNotOut = NOT_OUT_DISMISSALS.includes(w.type);
  acc.isOut = !isNotOut;
  acc.dismissal = {
    type: w.type,
    bowler: w.bowler,
    fielders: [...w.fielders],
  };
};

export const strikeRate = (runs: number, ballsFaced: number): number =>
  ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;

export const finalizeBattingCard = (acc: BatterAccumulator): BattingCard => ({
  player: acc.player,
  runs: acc.runs,
  ballsFaced: acc.ballsFaced,
  fours: acc.fours,
  sixes: acc.sixes,
  strikeRate: strikeRate(acc.runs, acc.ballsFaced),
  // A retired_hurt batter is not out; isOut already reflects that.
  isOut: acc.isOut,
  dismissal: acc.dismissal,
});
