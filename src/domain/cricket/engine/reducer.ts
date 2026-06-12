import type { InningsConfig, MatchRules } from "../match";
import type { BallEvent } from "../ball";
import type {
  BattingCard,
  BowlingCard,
  ExtrasBreakdown,
  FallOfWicket,
  InningsScore,
  Partnership,
} from "../scorecard";
import type { PlayerId } from "../../shared/ids";
import { NOT_OUT_DISMISSALS } from "../enums";

import { addExtras, emptyExtras } from "./extras";
import {
  applyBallToStriker,
  applyWicketToBatter,
  finalizeBattingCard,
  newBatterAcc,
  type BatterAccumulator,
} from "./batting";
import {
  applyBallToBowler,
  closeBowlerOver,
  finalizeBowlingCard,
  newBowlerAcc,
  oversDecimal,
  oversText,
  type BowlerAccumulator,
} from "./bowling";
import { rotateAfterBall, type CreasePair } from "./striker";
import { isLegalDelivery, runsOffBall } from "./legality";
import {
  isDismissalValidOnFreeHit,
  isOverInPowerplay,
  triggersFreeHit,
} from "./powerplay";
import { computeChase, isChaseComplete } from "./chase";

/**
 * Internal mutable fold state. Kept distinct from the immutable `InningsScore`
 * output so we can aggregate efficiently (Maps, in-progress over counters) and
 * only project to the contract shape at the end / on demand.
 *
 * Insertion order of the Maps is preserved, which gives us a stable batting and
 * bowling card order matching the order players first appeared.
 */
export interface InningsState {
  config: InningsConfig;
  rules: MatchRules;

  runs: number;
  wickets: number;
  legalBalls: number;
  extras: ExtrasBreakdown;

  batters: Map<string, BatterAccumulator>;
  bowlers: Map<string, BowlerAccumulator>;

  crease: CreasePair;
  currentBowlerId: PlayerId | null;

  /** 0-based over currently in progress (for powerplay + over-close detection). */
  currentOver: number;

  fallOfWickets: FallOfWicket[];

  /** Partnership tracking: runs+balls accumulated for the current pair. */
  currentPartnershipRuns: number;
  currentPartnershipBalls: number;
  partnerships: Partnership[];

  isComplete: boolean;
  isFreeHitNext: boolean;
}

const getBatter = (state: InningsState, id: PlayerId): BatterAccumulator => {
  let acc = state.batters.get(id);
  if (!acc) {
    acc = newBatterAcc(id);
    state.batters.set(id, acc);
  }
  return acc;
};

const getBowler = (state: InningsState, id: PlayerId): BowlerAccumulator => {
  let acc = state.bowlers.get(id);
  if (!acc) {
    acc = newBowlerAcc(id);
    state.bowlers.set(id, acc);
  }
  return acc;
};

/** Maximum legal balls in the innings, or null when unlimited (Tests). */
const maxLegalBalls = (rules: MatchRules): number | null =>
  rules.oversPerInnings === null
    ? null
    : rules.oversPerInnings * rules.ballsPerOver;

/** Wickets that end the innings (all out). */
const allOutWickets = (rules: MatchRules): number => rules.playersPerSide - 1;

/**
 * Create the initial empty state for an innings. The opening crease pair and
 * first bowler are seeded from the first delivery as it arrives, so callers do
 * not need to pre-populate them.
 */
export const initialState = (
  config: InningsConfig,
  rules: MatchRules,
): InningsState => ({
  config,
  rules,
  runs: 0,
  wickets: 0,
  legalBalls: 0,
  extras: emptyExtras(),
  batters: new Map(),
  bowlers: new Map(),
  crease: { strikerId: null, nonStrikerId: null },
  currentBowlerId: null,
  currentOver: 0,
  fallOfWickets: [],
  currentPartnershipRuns: 0,
  currentPartnershipBalls: 0,
  partnerships: [],
  isComplete: false,
  isFreeHitNext: false,
});

/**
 * Apply a single delivery to a state, returning a NEW state (the engine is
 * side-effect-free with respect to the caller's reference; internally we clone
 * then mutate the clone for speed). Safe to call incrementally from the UI.
 *
 * Ordering authority is the ball's position in the sequence the caller feeds —
 * we do not re-sort here; `reduceInnings` sorts by `sequence` first.
 */
export const applyBall = (
  prev: InningsState,
  ball: BallEvent,
  rules: MatchRules,
): InningsState => {
  // Once complete, further balls are ignored (defensive; callers should stop).
  if (prev.isComplete) return prev;

  const state: InningsState = {
    ...prev,
    extras: { ...prev.extras },
    batters: new Map(prev.batters),
    bowlers: new Map(prev.bowlers),
    crease: { ...prev.crease },
    fallOfWickets: [...prev.fallOfWickets],
    partnerships: [...prev.partnerships],
  };
  const striker = ball.striker;
  const bowler = ball.bowler;

  // The delivery is the authority on who is at each end before rotation: the
  // caller assigns striker/nonStriker (including the new batter after a wicket),
  // so we adopt them and then apply this engine's rotation logic on top.
  state.crease.strikerId = ball.striker;
  state.crease.nonStrikerId = ball.nonStriker;

  state.currentBowlerId = bowler;
  state.currentOver = ball.over;

  // --- free-hit dismissal restriction ---
  // On a free hit only certain dismissals stand (run out and the player-fault
  // modes); a recorded bowled/caught/lbw/stumped/hit_wicket must be ignored.
  // We neutralise an invalid free-hit wicket here so it affects nothing
  // downstream — neither the team wicket count, the batter's card, nor the
  // bowler's figures. The ball still counts (legal-ball/run logic is unchanged).
  const effectiveWicket =
    ball.wicket && ball.isFreeHit && !isDismissalValidOnFreeHit(ball.wicket.type)
      ? null
      : ball.wicket;
  const effectiveBall: BallEvent =
    effectiveWicket === ball.wicket ? ball : { ...ball, wicket: effectiveWicket };

  // --- team totals & extras ---
  const delta = runsOffBall(ball);
  state.runs += delta;
  state.extras = addExtras(state.extras, ball, rules);

  // --- batter (striker) aggregation ---
  const strikerAcc = { ...getBatter(state, striker) };
  applyBallToStriker(strikerAcc, ball);
  state.batters.set(striker, strikerAcc);

  // --- bowler aggregation (uses the effective wicket for crediting) ---
  const bowlerAcc = { ...getBowler(state, bowler) };
  applyBallToBowler(bowlerAcc, effectiveBall, rules);

  // --- partnership running totals (team runs scored while this pair batted) ---
  state.currentPartnershipRuns += delta;
  if (isLegalDelivery(ball)) {
    state.currentPartnershipBalls += 1;
    state.legalBalls += 1;
  }

  // --- wicket handling ---
  if (effectiveWicket) {
    const w = effectiveWicket;
    const isNotOut = NOT_OUT_DISMISSALS.includes(w.type);
    const outAcc = { ...getBatter(state, w.playerOut) };
    applyWicketToBatter(outAcc, effectiveBall);
    state.batters.set(w.playerOut, outAcc);

    if (!isNotOut) {
      state.wickets += 1;
      state.fallOfWickets.push({
        wicketNumber: state.wickets,
        score: state.runs,
        over: oversText(state.legalBalls, rules.ballsPerOver),
        playerOut: w.playerOut,
      });
      // Close the partnership at the dismissal.
      state.partnerships.push({
        batters: [
          state.crease.strikerId ?? w.playerOut,
          state.crease.nonStrikerId ?? w.playerOut,
        ],
        runs: state.currentPartnershipRuns,
        balls: state.currentPartnershipBalls,
      });
      state.currentPartnershipRuns = 0;
      state.currentPartnershipBalls = 0;
    }
  }

  // --- over-close handling for the bowler (maiden detection) ---
  // applyBallToBowler has already incremented legalBallsThisOver, so reaching
  // ballsPerOver here means this legal delivery just completed the over.
  const completedOver =
    isLegalDelivery(ball) &&
    bowlerAcc.legalBallsThisOver === rules.ballsPerOver;
  if (completedOver) {
    closeBowlerOver(bowlerAcc, rules);
  }
  state.bowlers.set(bowler, bowlerAcc);

  // --- strike rotation (mid-ball + end-of-over) ---
  state.crease = rotateAfterBall(
    state.crease,
    ball,
    rules,
    state.legalBalls - (isLegalDelivery(ball) ? 1 : 0),
  );

  // --- free-hit carry-over for the NEXT delivery ---
  state.isFreeHitNext = triggersFreeHit(ball, rules);

  // --- termination checks ---
  const limit = maxLegalBalls(rules);
  const oversExhausted = limit !== null && state.legalBalls >= limit;
  const allOut = state.wickets >= allOutWickets(rules);
  const chased =
    state.config.target !== null && isChaseComplete(state.config.target, state.runs);
  state.isComplete = oversExhausted || allOut || chased;

  return state;
};

/** Project the mutable fold state into the immutable contract scorecard. */
export const projectScore = (state: InningsState): InningsScore => {
  const { rules, config } = state;

  const battingCards: BattingCard[] = [];
  for (const acc of state.batters.values()) {
    battingCards.push(finalizeBattingCard(acc));
  }

  const bowlingCards: BowlingCard[] = [];
  for (const acc of state.bowlers.values()) {
    bowlingCards.push(finalizeBowlingCard(acc, rules));
  }

  const overs = oversDecimal(state.legalBalls, rules.ballsPerOver);
  const runRate = overs > 0 ? state.runs / overs : 0;

  // Include the unbroken current partnership in the output so the UI can show it.
  const partnerships: Partnership[] = [...state.partnerships];
  if (state.currentPartnershipBalls > 0 || state.currentPartnershipRuns > 0) {
    partnerships.push({
      batters: [
        state.crease.strikerId ?? (battingCards[0]?.player as PlayerId),
        state.crease.nonStrikerId ?? (battingCards[0]?.player as PlayerId),
      ],
      runs: state.currentPartnershipRuns,
      balls: state.currentPartnershipBalls,
    });
  }

  let target: number | null = null;
  let runsRequired: number | null = null;
  let ballsRemaining: number | null = null;
  let requiredRunRate: number | null = null;
  if (config.target !== null) {
    const chase = computeChase(
      config.target,
      rules,
      state.runs,
      state.legalBalls,
    );
    target = chase.target;
    runsRequired = chase.runsRequired;
    ballsRemaining = chase.ballsRemaining;
    requiredRunRate = chase.requiredRunRate;
  }

  return {
    inningsId: config.id,
    battingTeam: config.battingTeam,
    bowlingTeam: config.bowlingTeam,
    runs: state.runs,
    wickets: state.wickets,
    legalBalls: state.legalBalls,
    oversText: oversText(state.legalBalls, rules.ballsPerOver),
    oversDecimal: overs,
    extras: state.extras,
    runRate,
    target,
    runsRequired,
    ballsRemaining,
    requiredRunRate,
    battingCards,
    bowlingCards,
    fallOfWickets: state.fallOfWickets,
    partnerships,
    strikerId: state.crease.strikerId,
    nonStrikerId: state.crease.nonStrikerId,
    currentBowlerId: state.currentBowlerId,
    isComplete: state.isComplete,
    isFreeHitNext: state.isFreeHitNext,
    inPowerplay: isOverInPowerplay(state.currentOver, rules),
  };
};

/**
 * Reduce an ordered sequence of deliveries into a fully-derived InningsScore.
 *
 * Pure: identical inputs always yield an identical score. Balls are sorted by
 * their canonical `sequence` first so out-of-order arrival (offline sync) is
 * handled deterministically. Folding stops materially once the innings is
 * complete (subsequent balls are ignored by `applyBall`).
 */
export const reduceInnings = (
  config: InningsConfig,
  rules: MatchRules,
  balls: BallEvent[],
): InningsScore => {
  const ordered = [...balls].sort((a, b) => a.sequence - b.sequence);
  let state = initialState(config, rules);
  for (const ball of ordered) {
    state = applyBall(state, ball, rules);
  }
  return projectScore(state);
};
