import type { BallEvent, WicketEvent } from "../../ball";
import type { InningsConfig, MatchRules } from "../../match";
import type { BatRuns, DismissalType, ExtraType } from "../../enums";
import { DEFAULT_T20_RULES } from "../../match";
import { asId } from "../../../shared/ids";
import type {
  BallId,
  InningsId,
  MatchId,
  PlayerId,
  TeamId,
} from "../../../shared/ids";

/**
 * Test fixtures for the scoring engine. A small fluent `over` builder makes the
 * worked-over and rotation tests readable without hand-numbering sequences.
 */

export const pid = (n: number): PlayerId => asId<"PlayerId">(`player-${n}`);
export const team = (n: number): TeamId => asId<"TeamId">(`team-${n}`);
export const inningsId = (): InningsId => asId<"InningsId">("innings-1");
export const matchId = (): MatchId => asId<"MatchId">("match-1");

/** Two openers / a standard pair used across tests. */
export const STRIKER = pid(1);
export const NON_STRIKER = pid(2);
export const BOWLER = pid(11);

export const baseConfig = (
  overrides: Partial<InningsConfig> = {},
): InningsConfig => ({
  id: inningsId(),
  matchId: matchId(),
  inningsNumber: 1,
  battingTeam: team(1),
  bowlingTeam: team(2),
  isSuperOver: false,
  target: null,
  ...overrides,
});

export const rules = (overrides: Partial<MatchRules> = {}): MatchRules => ({
  ...DEFAULT_T20_RULES,
  ...overrides,
});

export interface BallOpts {
  striker?: PlayerId;
  nonStriker?: PlayerId;
  bowler?: PlayerId;
  batRuns?: BatRuns;
  extraType?: ExtraType | null;
  extraRuns?: number;
  wicket?: WicketEvent | null;
  isFreeHit?: boolean;
  over?: number;
  ballInOver?: number;
}

/**
 * A delivery factory. `sequence` is assigned by the builder; positional `over`
 * and `ballInOver` default to 0/1 because the engine derives ordering from
 * `sequence` and legality, not from these display fields — tests that care set
 * them explicitly.
 */
export const makeBall = (seq: number, opts: BallOpts = {}): BallEvent => ({
  id: asId<"BallId">(`ball-${seq}`) as BallId,
  inningsId: inningsId(),
  sequence: seq,
  over: opts.over ?? 0,
  ballInOver: opts.ballInOver ?? 1,
  striker: opts.striker ?? STRIKER,
  nonStriker: opts.nonStriker ?? NON_STRIKER,
  bowler: opts.bowler ?? BOWLER,
  batRuns: opts.batRuns ?? 0,
  extraType: opts.extraType ?? null,
  extraRuns: opts.extraRuns ?? 0,
  wicket: opts.wicket ?? null,
  isFreeHit: opts.isFreeHit ?? false,
  commentary: null,
  recordedAt: "2026-06-12T00:00:00.000Z",
  recordedBy: null,
});

export const wicket = (
  type: DismissalType,
  playerOut: PlayerId,
  bowler: PlayerId | null,
  fielders: PlayerId[] = [],
): WicketEvent => ({ type, playerOut, bowler, fielders });

/**
 * Sequence-stamping helper: takes an array of partial ball opts and assigns
 * monotonically increasing sequence numbers starting at 1.
 */
export const sequence = (deliveries: BallOpts[]): BallEvent[] =>
  deliveries.map((d, i) => makeBall(i + 1, d));
