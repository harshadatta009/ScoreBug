import type { InningsId, PlayerId, TeamId } from "../shared/ids";
import type { DismissalType } from "./enums";

/** Per-batter line in a scorecard, derived from ball events. */
export interface BattingCard {
  player: PlayerId;
  runs: number;
  ballsFaced: number; // legal + no-balls faced (wides excluded)
  fours: number;
  sixes: number;
  strikeRate: number; // runs / ballsFaced * 100
  isOut: boolean;
  dismissal: {
    type: DismissalType;
    bowler: PlayerId | null;
    fielders: PlayerId[];
  } | null;
}

/** Per-bowler line in a scorecard, derived from ball events. */
export interface BowlingCard {
  player: PlayerId;
  /** Balls bowled that count as legal deliveries. */
  legalBalls: number;
  oversText: string; // e.g. "3.4"
  maidens: number;
  runsConceded: number; // includes wides + no-balls; excludes byes/leg-byes
  wickets: number; // bowler-credited only
  economy: number; // runsConceded / (legalBalls/6)
  wides: number;
  noBalls: number;
  dots: number;
}

/** A fall-of-wicket marker. */
export interface FallOfWicket {
  wicketNumber: number; // 1..n
  score: number; // team score when the wicket fell
  over: string; // "12.3"
  playerOut: PlayerId;
}

export interface Partnership {
  batters: [PlayerId, PlayerId];
  runs: number;
  balls: number;
}

export interface ExtrasBreakdown {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
  total: number;
}

/** Fully derived state of one innings. Output of the scoring engine. */
export interface InningsScore {
  inningsId: InningsId;
  battingTeam: TeamId;
  bowlingTeam: TeamId;

  runs: number;
  wickets: number;
  legalBalls: number;
  oversText: string; // "18.2"
  oversDecimal: number; // 18.333… for NRR maths (overs as legalBalls/6)

  extras: ExtrasBreakdown;
  runRate: number;

  /** Present only when chasing. */
  target: number | null;
  runsRequired: number | null;
  ballsRemaining: number | null;
  requiredRunRate: number | null;

  battingCards: BattingCard[];
  bowlingCards: BowlingCard[];
  fallOfWickets: FallOfWicket[];
  partnerships: Partnership[];

  /** Strike/non-strike at the current point of the innings. */
  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
  currentBowlerId: PlayerId | null;

  isComplete: boolean;
  isFreeHitNext: boolean;
  inPowerplay: boolean;
}
