import type { MatchRules } from "../match";
import type { BallEvent } from "../ball";
import type { BowlingCard } from "../scorecard";
import type { PlayerId } from "../../shared/ids";
import { BOWLER_CREDITED_DISMISSALS } from "../enums";
import { isLegalDelivery } from "./legality";

/**
 * Per-bowler aggregation.
 *
 * Runs conceded by a bowler = bat runs + wide runs + no-ball runs (penalty and
 * anything run off a no-ball), but NOT byes or leg-byes — those are the team's
 * fault, not the bowler's. Maidens and economy follow from that figure.
 */

/** Mutable inner accumulator for one bowler while folding the innings. */
export interface BowlerAccumulator {
  player: PlayerId;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  dots: number;
  /** Runs conceded in the over currently in progress for this bowler. */
  runsThisOver: number;
  /** Legal balls bowled in the over currently in progress. */
  legalBallsThisOver: number;
  /** Did any illegal (wide/no-ball) delivery occur this over for this bowler? */
  illegalThisOver: boolean;
  maidens: number;
}

export const newBowlerAcc = (player: PlayerId): BowlerAccumulator => ({
  player,
  legalBalls: 0,
  runsConceded: 0,
  wickets: 0,
  wides: 0,
  noBalls: 0,
  dots: 0,
  runsThisOver: 0,
  legalBallsThisOver: 0,
  illegalThisOver: false,
  maidens: 0,
});

/**
 * Runs charged to the bowler for a delivery: everything except byes/leg-byes.
 *
 * The subtle case is a no-ball off which the batters ran byes/leg-byes (i.e.
 * not off the bat). Per the BallEvent contract, runs off the BAT are recorded
 * in `batRuns`, so for a no-ball the non-penalty portion of `extraRuns`
 * (`extraRuns - noBallPenalty`) is byes/leg-byes that the batters ran — and
 * byes/leg-byes are NEVER charged to the bowler. The bowler is therefore
 * charged only the no-ball penalty plus any runs off the bat. A wide, by
 * contrast, charges the bowler the entire wide amount (penalty + runs run),
 * since a wide is the bowler's fault.
 */
export const bowlerRunsConceded = (ball: BallEvent, rules: MatchRules): number => {
  if (ball.extraType === "bye" || ball.extraType === "leg_bye") {
    // Only bat runs would be charged, but a bye/leg-bye delivery has batRuns 0
    // by contract; still, be defensive and charge any bat runs.
    return ball.batRuns;
  }
  if (ball.extraType === "no_ball") {
    // Penalty + bat runs only; byes/leg-byes run off the no-ball are excluded.
    return rules.noBallPenalty + ball.batRuns;
  }
  // wide / legal: bat runs + the full extra amount are the bowler's.
  return ball.batRuns + ball.extraRuns;
};

/** Fold one delivery into a bowler accumulator (mutates the passed acc). */
export const applyBallToBowler = (
  acc: BowlerAccumulator,
  ball: BallEvent,
  rules: MatchRules,
): void => {
  const conceded = bowlerRunsConceded(ball, rules);
  acc.runsConceded += conceded;
  acc.runsThisOver += conceded;

  if (ball.extraType === "wide") acc.wides += ball.extraRuns;
  if (ball.extraType === "no_ball") acc.noBalls += 1;

  if (isLegalDelivery(ball)) {
    acc.legalBalls += 1;
    acc.legalBallsThisOver += 1;
    // A dot ball for the bowler: a legal delivery off which no run was conceded.
    if (conceded === 0) acc.dots += 1;
  } else {
    acc.illegalThisOver = true;
  }

  if (ball.wicket && ball.wicket.bowler !== null) {
    if (BOWLER_CREDITED_DISMISSALS.includes(ball.wicket.type)) {
      acc.wickets += 1;
    }
  }
};

/**
 * Close out an over for a bowler and decide whether it was a maiden.
 *
 * Maiden rule implemented: an over is a maiden iff a full over of legal balls
 * was completed (legalBallsThisOver === ballsPerOver), no illegal delivery
 * occurred, and zero runs were conceded off it. Conceding a wide or no-ball
 * (which would mean an extra delivery) therefore disqualifies a maiden — this
 * matches the standard scoring convention that any run charged to the bowler
 * breaks the maiden.
 */
export const closeBowlerOver = (acc: BowlerAccumulator, rules: MatchRules): void => {
  const completedFullOver = acc.legalBallsThisOver === rules.ballsPerOver;
  if (completedFullOver && !acc.illegalThisOver && acc.runsThisOver === 0) {
    acc.maidens += 1;
  }
  acc.runsThisOver = 0;
  acc.legalBallsThisOver = 0;
  acc.illegalThisOver = false;
};

/** Format legal-ball count as cricket overs text, e.g. 22 balls -> "3.4". */
export const oversText = (legalBalls: number, ballsPerOver: number): string => {
  const completed = Math.floor(legalBalls / ballsPerOver);
  const remainder = legalBalls % ballsPerOver;
  return `${completed}.${remainder}`;
};

/** Overs as a decimal for economy/NRR maths: legalBalls / ballsPerOver. */
export const oversDecimal = (legalBalls: number, ballsPerOver: number): number =>
  legalBalls / ballsPerOver;

/** Finalize a bowler accumulator into the immutable scorecard line. */
export const finalizeBowlingCard = (
  acc: BowlerAccumulator,
  rules: MatchRules,
): BowlingCard => {
  const overs = oversDecimal(acc.legalBalls, rules.ballsPerOver);
  return {
    player: acc.player,
    legalBalls: acc.legalBalls,
    oversText: oversText(acc.legalBalls, rules.ballsPerOver),
    maidens: acc.maidens,
    runsConceded: acc.runsConceded,
    wickets: acc.wickets,
    economy: overs > 0 ? acc.runsConceded / overs : 0,
    wides: acc.wides,
    noBalls: acc.noBalls,
    dots: acc.dots,
  };
};
