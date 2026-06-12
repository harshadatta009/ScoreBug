import type { MatchRules } from "../match";
import type { BallEvent } from "../ball";
import type { DismissalType } from "../enums";

/**
 * Powerplay & free-hit helpers.
 *
 * Powerplay membership is decided by the over number (0-based) against the
 * configured ranges, which are end-exclusive: {from:0,to:6} covers overs 0..5.
 */

/** Is the given 0-based over within any configured powerplay window? */
export const isOverInPowerplay = (over: number, rules: MatchRules): boolean =>
  rules.powerplayOvers.some((p) => over >= p.from && over < p.to);

/**
 * Does THIS delivery cause the NEXT legal delivery to be a free hit?
 *
 * A free hit is awarded on the delivery following a no-ball when the rules
 * enable it. Wides do not trigger a free hit. (A free-hit delivery that is
 * itself a no-ball re-arms the free hit; the reducer handles that carry-over.)
 */
export const triggersFreeHit = (ball: BallEvent, rules: MatchRules): boolean =>
  rules.freeHitOnNoBall && ball.extraType === "no_ball";

/**
 * Dismissals that remain VALID on a free-hit delivery.
 *
 * On a free hit the striker cannot be dismissed in any manner that would
 * otherwise credit the bowler (bowled, caught, lbw, stumped, hit_wicket).
 * He can still be out by means that do not involve the bowler delivering a
 * "fair" wicket — primarily run out, plus the player-fault dismissals
 * (obstructing the field, hitting the ball twice, handled the ball). Not-out
 * "dismissals" such as retired_hurt are also harmless to leave through.
 *
 * Anything NOT in this set, if recorded on a free hit, must be ignored by the
 * engine so a mis-recording (or a UI that forgot the rule) cannot wrongly cost
 * the batting side a wicket.
 */
export const FREE_HIT_VALID_DISMISSALS: readonly DismissalType[] = [
  "run_out",
  "obstructing_field",
  "hit_ball_twice",
  "handled_ball",
  "retired_out",
  "retired_hurt",
] as const;

/** Is this dismissal type permitted to stand on a free-hit delivery? */
export const isDismissalValidOnFreeHit = (type: DismissalType): boolean =>
  FREE_HIT_VALID_DISMISSALS.includes(type);
