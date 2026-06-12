import type { MatchRules } from "../match";
import type { ChaseTarget } from "../match";

/**
 * Chase mathematics for a second (or super-over) innings.
 *
 * `target` is the runs the chasing side must REACH to win (i.e. one more than
 * the runs to tie), so runsRequired = target - runs and the chase is won when
 * runs >= target. Overs may be rain-revised via `ChaseTarget.revisedOvers`.
 */

export interface ChaseMaths {
  target: number;
  runsRequired: number;
  ballsRemaining: number;
  /** Required run rate per over for the remaining balls; 0 when none remain. */
  requiredRunRate: number;
}

/** Effective total balls available given (possibly revised) overs. */
export const totalChaseBalls = (target: ChaseTarget, rules: MatchRules): number => {
  const overs =
    target.revisedOvers ?? rules.oversPerInnings ?? 0;
  return overs * rules.ballsPerOver;
};

/**
 * Compute live chase figures. `runs` and `legalBalls` are the chasing innings'
 * current totals. runsRequired is floored at 0 (never negative once won).
 */
export const computeChase = (
  target: ChaseTarget,
  rules: MatchRules,
  runs: number,
  legalBalls: number,
): ChaseMaths => {
  const totalBalls = totalChaseBalls(target, rules);
  const ballsRemaining = Math.max(0, totalBalls - legalBalls);
  const runsRequired = Math.max(0, target.runs - runs);
  const requiredRunRate =
    ballsRemaining > 0
      ? (runsRequired / ballsRemaining) * rules.ballsPerOver
      : 0;
  return {
    target: target.runs,
    runsRequired,
    ballsRemaining,
    requiredRunRate,
  };
};

/** Has the chasing side reached its target (won)? */
export const isChaseComplete = (target: ChaseTarget, runs: number): boolean =>
  runs >= target.runs;
