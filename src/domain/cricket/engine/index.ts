/**
 * Ball-by-ball scoring engine — public surface.
 *
 * The engine is pure and side-effect-free: an `InningsScore` is a deterministic
 * function of an ordered `BallEvent[]`. Consumers should prefer `reduceInnings`
 * for a full replay and `applyBall` + `projectScore` for incremental UI updates.
 */

export {
  reduceInnings,
  applyBall,
  initialState,
  projectScore,
  type InningsState,
} from "./reducer";

export {
  isLegalDelivery,
  batterFaced,
  runsOffBall,
  ranRunsForRotation,
  strikeRotates,
} from "./legality";

export {
  rotateAfterBall,
  swapEnds,
  type CreasePair,
} from "./striker";

export {
  bowlerRunsConceded,
  applyBallToBowler,
  closeBowlerOver,
  finalizeBowlingCard,
  newBowlerAcc,
  oversText,
  oversDecimal,
  type BowlerAccumulator,
} from "./bowling";

export {
  applyBallToStriker,
  applyWicketToBatter,
  finalizeBattingCard,
  newBatterAcc,
  strikeRate,
  type BatterAccumulator,
} from "./batting";

export { addExtras, emptyExtras } from "./extras";

export {
  computeChase,
  isChaseComplete,
  totalChaseBalls,
  type ChaseMaths,
} from "./chase";

export { isOverInPowerplay, triggersFreeHit } from "./powerplay";
