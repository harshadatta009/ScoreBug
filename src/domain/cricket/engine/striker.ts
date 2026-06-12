import type { MatchRules } from "../match";
import type { BallEvent } from "../ball";
import type { PlayerId } from "../../shared/ids";
import { isLegalDelivery, strikeRotates } from "./legality";

/** A striker / non-striker pair at the crease. */
export interface CreasePair {
  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
}

/** Swap the two ends. */
export const swapEnds = (pair: CreasePair): CreasePair => ({
  strikerId: pair.nonStrikerId,
  nonStrikerId: pair.strikerId,
});

/**
 * Compute the crease pair after a delivery, applying:
 *   1. mid-delivery rotation when an odd number of runs were run, and
 *   2. end-of-over rotation when this delivery completed the over.
 *
 * `legalBallsBeforeThisBall` is the bowler-innings legal-ball count BEFORE this
 * delivery, used to detect whether the delivery just completed an over.
 *
 * Note: both effects can apply on the last ball of an over and they compose —
 * an odd run off the 6th ball means the striker who is "on strike" after the
 * single is then swapped back by the end-of-over change, so the original
 * striker keeps strike. We model that by applying them sequentially.
 */
export const rotateAfterBall = (
  pair: CreasePair,
  ball: BallEvent,
  rules: MatchRules,
  legalBallsBeforeThisBall: number,
): CreasePair => {
  let next = pair;

  if (strikeRotates(ball, rules)) {
    next = swapEnds(next);
  }

  if (isLegalDelivery(ball)) {
    const legalAfter = legalBallsBeforeThisBall + 1;
    const overComplete = legalAfter % rules.ballsPerOver === 0;
    if (overComplete) {
      next = swapEnds(next);
    }
  }

  return next;
};
