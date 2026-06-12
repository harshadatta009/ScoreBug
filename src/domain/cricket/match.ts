import type {
  InningsId,
  MatchId,
  PlayerId,
  TeamId,
  TournamentId,
  VenueId,
} from "../shared/ids";
import type { MatchFormat, MatchStatus, TossDecision } from "./enums";

/** Rules that govern how the scoring engine behaves for a match. */
export interface MatchRules {
  /** Overs per innings (e.g. 20 for T20). Null for unlimited (Tests). */
  oversPerInnings: number | null;
  ballsPerOver: number; // usually 6
  /** Max overs a single bowler may bowl. Null = no limit. */
  maxOversPerBowler: number | null;
  playersPerSide: number; // usually 11

  /** A no-ball results in a free hit on the next legal delivery. */
  freeHitOnNoBall: boolean;
  /** Wides and no-balls concede this many penalty runs (usually 1). */
  noBallPenalty: number;
  widePenalty: number;

  /** Powerplay over ranges (0-based, end-exclusive), e.g. [{from:0,to:6}]. */
  powerplayOvers: ReadonlyArray<{ from: number; to: number }>;

  /** Whether a tied result is decided by a Super Over. */
  superOverOnTie: boolean;

  /** DLS / rain handling is delegated to a target adjustment, applied externally. */
}

export interface PlayingXIMember {
  player: PlayerId;
  battingOrder: number; // 1-based intended order
  isCaptain: boolean;
  isWicketKeeper: boolean;
  isSubstitute: boolean;
}

export interface MatchTeam {
  teamId: TeamId;
  playingXI: PlayingXIMember[];
}

export interface Toss {
  wonBy: TeamId;
  decision: TossDecision;
}

/** Static configuration of a match (the engine's setup input). */
export interface MatchConfig {
  id: MatchId;
  tournamentId: TournamentId | null;
  venueId: VenueId | null;
  format: MatchFormat;
  rules: MatchRules;
  teamA: MatchTeam;
  teamB: MatchTeam;
  toss: Toss | null;
  status: MatchStatus;
  scheduledAt: string | null;
}

/**
 * A target an innings is chasing, optionally rain-adjusted (DLS/VJD).
 * `revisedOvers` shortens the innings; `parScore` supports interruption checks.
 */
export interface ChaseTarget {
  runs: number;
  revisedOvers?: number | null;
  parScore?: number | null;
}

/** Setup for a single innings, fed to the scoring engine. */
export interface InningsConfig {
  id: InningsId;
  matchId: MatchId;
  /** 1-based innings number within the match (1,2 for limited overs). */
  inningsNumber: number;
  battingTeam: TeamId;
  bowlingTeam: TeamId;
  isSuperOver: boolean;
  target: ChaseTarget | null;
}

export const DEFAULT_T20_RULES: MatchRules = {
  oversPerInnings: 20,
  ballsPerOver: 6,
  maxOversPerBowler: 4,
  playersPerSide: 11,
  freeHitOnNoBall: true,
  noBallPenalty: 1,
  widePenalty: 1,
  powerplayOvers: [{ from: 0, to: 6 }],
  superOverOnTie: true,
};
