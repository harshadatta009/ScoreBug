import type { MatchRules } from "../match";
import type { BallEvent } from "../ball";

/**
 * Delivery-legality and run-attribution primitives.
 *
 * These pure predicates are the single source of truth for "what kind of ball
 * was this" so the reducer, striker rotation and aggregations never disagree
 * about (e.g.) whether a delivery advanced the over count. Keeping them here —
 * rather than inlined — guarantees the wide/no-ball rules are applied
 * identically everywhere.
 */

/**
 * A delivery is legal (counts toward the over) unless it is a wide or no-ball.
 * Byes and leg-byes ARE legal deliveries — they only re-attribute the runs.
 */
export const isLegalDelivery = (ball: BallEvent): boolean =>
  ball.extraType !== "wide" && ball.extraType !== "no_ball";

/** A wide is the only delivery the striker is NOT deemed to have faced. */
export const batterFaced = (ball: BallEvent): boolean => ball.extraType !== "wide";

/**
 * Total runs added to the team total for this delivery: runs off the bat plus
 * whatever the extra carried (penalty + any runs physically run). This is the
 * authoritative team-total contribution and is independent of who is credited.
 */
export const runsOffBall = (ball: BallEvent): number =>
  ball.batRuns + ball.extraRuns;

/**
 * Runs physically run between the wickets that can rotate the strike.
 *
 * - Bat runs always count (a single, three, etc.).
 * - Byes / leg-byes are runs the batters ran, so they count for rotation.
 * - Wide / no-ball `extraRuns` includes a non-running penalty, so we strip one
 *   penalty unit before counting; the remainder is runs actually run (e.g. a
 *   no-ball plus two run = penalty 1 + 2 ran -> 2 ran rotate as even).
 *
 * Boundaries (4/6) are runs but are never "ran", yet the convention of swapping
 * on odd run-totals still yields the correct end (a four = 0 odd swaps, a single
 * = 1 swaps). We therefore treat bat boundary runs the same as ran runs for the
 * odd/even parity, which matches real scoring (a 4 keeps strike, a 3 swaps).
 */
export const ranRunsForRotation = (ball: BallEvent, rules: MatchRules): number => {
  if (ball.extraType === "bye" || ball.extraType === "leg_bye") {
    return ball.batRuns + ball.extraRuns;
  }
  if (ball.extraType === "wide") {
    // A wide carries a penalty (widePenalty) that is not run; the rest are byes
    // off the wide that the batters ran and which do swap ends.
    return Math.max(0, ball.extraRuns - rules.widePenalty) + ball.batRuns;
  }
  if (ball.extraType === "no_ball") {
    // no-ball penalty is not run; bat runs + any extra runs run off it count.
    return ball.batRuns + Math.max(0, ball.extraRuns - rules.noBallPenalty);
  }
  // Legal delivery: only bat runs.
  return ball.batRuns;
};

/**
 * Whether the strike rotates as a consequence of THIS delivery's runs.
 * (End-of-over rotation is handled separately in striker.ts.)
 * Strike swaps when an odd number of runs were physically run.
 */
export const strikeRotates = (ball: BallEvent, rules: MatchRules): boolean =>
  ranRunsForRotation(ball, rules) % 2 === 1;
