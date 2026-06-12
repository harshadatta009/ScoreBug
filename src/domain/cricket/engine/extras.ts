import type { MatchRules } from "../match";
import type { BallEvent } from "../ball";
import type { ExtrasBreakdown } from "../scorecard";

/**
 * Extras (sundries) accounting.
 *
 * The four extra buckets are kept separate because they attribute differently:
 * wides & no-balls are charged to the bowler's runs conceded, whereas byes &
 * leg-byes are not — but ALL of them add to the team's extras total and the
 * team score. The `penalty` field tracks the fixed no-ball/wide penalty
 * component so a scorecard can show, e.g., a no-ball that was also hit for four.
 */

export const emptyExtras = (): ExtrasBreakdown => ({
  wides: 0,
  noBalls: 0,
  byes: 0,
  legByes: 0,
  penalty: 0,
  total: 0,
});

/**
 * Fold a single delivery's extras into a running breakdown (returns a new
 * object; never mutates the input — the engine is side-effect-free).
 */
export const addExtras = (
  acc: ExtrasBreakdown,
  ball: BallEvent,
  rules: MatchRules,
): ExtrasBreakdown => {
  const next: ExtrasBreakdown = { ...acc };
  switch (ball.extraType) {
    case "wide":
      // Entire wide amount (penalty + any runs run) is "wides".
      next.wides += ball.extraRuns;
      next.penalty += rules.widePenalty;
      next.total += ball.extraRuns;
      break;
    case "no_ball": {
      // The no-ball line shows only the penalty; runs run off it (the extraRuns
      // beyond the penalty) are byes/leg-byes territory but, by convention here,
      // a no-ball's non-penalty runs run are tracked as part of the no-ball
      // extra so the team total stays correct.
      next.noBalls += ball.extraRuns;
      next.penalty += rules.noBallPenalty;
      next.total += ball.extraRuns;
      break;
    }
    case "bye":
      next.byes += ball.extraRuns;
      next.total += ball.extraRuns;
      break;
    case "leg_bye":
      next.legByes += ball.extraRuns;
      next.total += ball.extraRuns;
      break;
    case null:
      break;
  }
  return next;
};
