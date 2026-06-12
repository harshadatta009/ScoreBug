import type { BallEvent } from "@/domain/cricket/ball";
import type { MatchRules } from "@/domain/cricket/match";
import type { DismissalType } from "@/domain/cricket/enums";
import {
  BOWLER_CREDITED_DISMISSALS,
  NOT_OUT_DISMISSALS,
} from "@/domain/cricket/enums";
import {
  batterFaced,
  bowlerRunsConceded,
  isLegalDelivery,
} from "@/domain/cricket/engine";
import type { PlayerId } from "@/domain/shared/ids";

/**
 * Career / cross-match statistics aggregation.
 *
 * This module folds a flat `BallEvent[]` spanning ANY number of matches and
 * innings into per-player career aggregates. It deliberately reuses the scoring
 * engine's per-ball primitives (`isLegalDelivery`, `batterFaced`,
 * `bowlerRunsConceded`) so that a player's career figures are computed by
 * exactly the same rules as a single live scorecard — there is one source of
 * truth for "did the batter face this ball" or "how many runs is the bowler
 * charged". Everything here is pure and deterministic: same balls in, same
 * numbers out.
 *
 * IMPORTANT: the caller is responsible for passing balls already scoped to the
 * matches that should count, and for the `inningsId -> matchId` mapping used to
 * count distinct matches/innings. The aggregation itself is IO-free.
 */

/** Per-player career batting aggregate. */
export interface BattingAggregate {
  player: PlayerId;
  /** Distinct innings in which the player faced at least one ball. */
  inningsBatted: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  /** Highest individual score across innings. */
  highestScore: number;
  /** Innings ending not out (player batted but was never dismissed). */
  notOuts: number;
  fifties: number;
  hundreds: number;
  /** runs / ballsFaced * 100, guarded against divide-by-zero. */
  strikeRate: number;
  /** runs / dismissals; null when the player has never been dismissed. */
  average: number | null;
}

/** Per-player career bowling aggregate. */
export interface BowlingAggregate {
  player: PlayerId;
  /** Distinct innings in which the player bowled at least one ball. */
  inningsBowled: number;
  /** Legal balls bowled (wides/no-balls excluded, matching the engine). */
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  /** Best figures across innings, e.g. "4/27" (most wickets, then fewest runs). */
  bestBowling: string | null;
  /** runsConceded / (ballsBowled / ballsPerOver), guarded. */
  economy: number;
  /** runsConceded / wickets, null when wicketless. */
  average: number | null;
  /** ballsBowled / wickets, null when wicketless. */
  strikeRate: number | null;
}

/** Per-player career fielding aggregate. */
export interface FieldingAggregate {
  player: PlayerId;
  catches: number;
  stumpings: number;
  runOuts: number;
  /** Convenience total used to rank fielders. */
  dismissals: number;
}

const fifty = (runs: number): boolean => runs >= 50 && runs < 100;
const hundred = (runs: number): boolean => runs >= 100;

/** Is this dismissal one that actually removes a batter (counts as a wicket)? */
function isRealDismissal(type: DismissalType): boolean {
  return !NOT_OUT_DISMISSALS.includes(type);
}

/** Inner mutable batting accumulator carried across innings. */
interface BatAcc {
  inningsRuns: Map<string, number>; // inningsId -> runs in that innings
  inningsBalls: Map<string, number>; // inningsId -> balls faced in that innings
  inningsDismissed: Set<string>; // inningsId where the player was dismissed
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
}

/**
 * Aggregate batting across all supplied balls, keyed by striker.
 *
 * Per-innings runs are tracked so highest score, fifties, hundreds and not-outs
 * are computed correctly (a not-out is an innings in which the player batted but
 * was never recorded as dismissed). `balls` need not be sorted; aggregates are
 * order-independent.
 */
export function aggregateBatting(
  balls: readonly BallEvent[],
): Map<PlayerId, BattingAggregate> {
  const accs = new Map<string, BatAcc>();

  const accFor = (player: PlayerId): BatAcc => {
    let a = accs.get(player);
    if (!a) {
      a = {
        inningsRuns: new Map(),
        inningsBalls: new Map(),
        inningsDismissed: new Set(),
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
      };
      accs.set(player, a);
    }
    return a;
  };

  for (const ball of balls) {
    const a = accFor(ball.striker);
    const inn = ball.inningsId;
    a.runs += ball.batRuns;
    a.inningsRuns.set(inn, (a.inningsRuns.get(inn) ?? 0) + ball.batRuns);

    if (batterFaced(ball)) {
      a.ballsFaced += 1;
      a.inningsBalls.set(inn, (a.inningsBalls.get(inn) ?? 0) + 1);
    }
    if (ball.batRuns === 4) a.fours += 1;
    if (ball.batRuns === 6) a.sixes += 1;

    // Attribute a dismissal to whoever is actually out (not always the striker,
    // e.g. a run-out at the non-striker's end), so not-outs are correct.
    const w = ball.wicket;
    if (w && isRealDismissal(w.type)) {
      const out = accFor(w.playerOut);
      out.inningsDismissed.add(inn);
      // Ensure the dismissed player has an innings entry even if they faced no
      // ball this innings (e.g. run out off the very first ball as non-striker).
      if (!out.inningsRuns.has(inn)) out.inningsRuns.set(inn, 0);
    }
  }

  const result = new Map<PlayerId, BattingAggregate>();
  for (const [player, a] of accs) {
    const inningsList = [...a.inningsRuns.entries()];
    const inningsBatted = inningsList.length;
    const highestScore = inningsList.reduce((m, [, r]) => Math.max(m, r), 0);
    const fifties = inningsList.filter(([, r]) => fifty(r)).length;
    const hundreds = inningsList.filter(([, r]) => hundred(r)).length;
    const dismissals = a.inningsDismissed.size;
    const notOuts = inningsBatted - dismissals;

    result.set(player as PlayerId, {
      player: player as PlayerId,
      inningsBatted,
      runs: a.runs,
      ballsFaced: a.ballsFaced,
      fours: a.fours,
      sixes: a.sixes,
      highestScore,
      notOuts: notOuts > 0 ? notOuts : 0,
      fifties,
      hundreds,
      strikeRate: a.ballsFaced > 0 ? (a.runs / a.ballsFaced) * 100 : 0,
      average: dismissals > 0 ? a.runs / dismissals : null,
    });
  }
  return result;
}

interface BowlInningsFigures {
  wickets: number;
  runs: number;
}

/** Inner mutable bowling accumulator carried across innings. */
interface BowlAcc {
  innings: Set<string>;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  /** Per-innings figures for best-bowling computation. */
  perInnings: Map<string, BowlInningsFigures>;
  /**
   * Per-innings, per-over running tallies so we can detect maidens. Keyed by
   * `inningsId:over`. A maiden over is a completed over (ballsPerOver legal
   * deliveries) with no illegal balls and zero runs charged to the bowler.
   */
  overRuns: Map<string, number>;
  overLegal: Map<string, number>;
  overIllegal: Set<string>;
}

/**
 * Aggregate bowling across all supplied balls, keyed by bowler.
 *
 * Runs charged and ball legality come from the engine helpers so career economy
 * matches the live scorecard. Maidens are detected per (innings, over): a maiden
 * requires a full over of legal balls, no wide/no-ball, and zero runs conceded.
 * Best bowling is the innings with the most wickets, breaking ties by fewest
 * runs conceded.
 */
export function aggregateBowling(
  balls: readonly BallEvent[],
  rules: MatchRules,
): Map<PlayerId, BowlingAggregate> {
  const accs = new Map<string, BowlAcc>();
  const ballsPerOver = rules.ballsPerOver > 0 ? rules.ballsPerOver : 6;

  const accFor = (player: PlayerId): BowlAcc => {
    let a = accs.get(player);
    if (!a) {
      a = {
        innings: new Set(),
        ballsBowled: 0,
        runsConceded: 0,
        wickets: 0,
        maidens: 0,
        perInnings: new Map(),
        overRuns: new Map(),
        overLegal: new Map(),
        overIllegal: new Set(),
      };
      accs.set(player, a);
    }
    return a;
  };

  for (const ball of balls) {
    const a = accFor(ball.bowler);
    const inn = ball.inningsId;
    a.innings.add(inn);

    const conceded = bowlerRunsConceded(ball, rules);
    a.runsConceded += conceded;

    const overKey = `${inn}:${ball.over}`;
    a.overRuns.set(overKey, (a.overRuns.get(overKey) ?? 0) + conceded);

    if (isLegalDelivery(ball)) {
      a.ballsBowled += 1;
      a.overLegal.set(overKey, (a.overLegal.get(overKey) ?? 0) + 1);
    } else {
      a.overIllegal.add(overKey);
    }

    const fig = a.perInnings.get(inn) ?? { wickets: 0, runs: 0 };
    fig.runs += conceded;

    if (ball.wicket && ball.wicket.bowler !== null) {
      if (BOWLER_CREDITED_DISMISSALS.includes(ball.wicket.type)) {
        a.wickets += 1;
        fig.wickets += 1;
      }
    }
    a.perInnings.set(inn, fig);
  }

  const result = new Map<PlayerId, BowlingAggregate>();
  for (const [player, a] of accs) {
    // Maidens: scan every over the bowler appeared in.
    for (const [overKey, legal] of a.overLegal) {
      const completed = legal === ballsPerOver;
      const noIllegal = !a.overIllegal.has(overKey);
      const runs = a.overRuns.get(overKey) ?? 0;
      if (completed && noIllegal && runs === 0) a.maidens += 1;
    }

    // Best bowling: most wickets, then fewest runs.
    let best: BowlInningsFigures | null = null;
    for (const fig of a.perInnings.values()) {
      if (
        best === null ||
        fig.wickets > best.wickets ||
        (fig.wickets === best.wickets && fig.runs < best.runs)
      ) {
        best = fig;
      }
    }

    const overs = a.ballsBowled / ballsPerOver;
    result.set(player as PlayerId, {
      player: player as PlayerId,
      inningsBowled: a.innings.size,
      ballsBowled: a.ballsBowled,
      runsConceded: a.runsConceded,
      wickets: a.wickets,
      maidens: a.maidens,
      bestBowling: best ? `${best.wickets}/${best.runs}` : null,
      economy: overs > 0 ? a.runsConceded / overs : 0,
      average: a.wickets > 0 ? a.runsConceded / a.wickets : null,
      strikeRate: a.wickets > 0 ? a.ballsBowled / a.wickets : null,
    });
  }
  return result;
}

/**
 * Aggregate fielding across all supplied balls.
 *
 * Attribution rules (standard scoring):
 * - caught / stumped: the FIRST fielder in `fielders` is credited the catch /
 *   stumping (the keeper for a stumping). caught-and-bowled still credits the
 *   listed fielder (the bowler is in the list).
 * - run_out: every fielder listed is credited a run-out contribution. Crediting
 *   all involved fielders matches how assists are commonly counted; teams that
 *   want "completing fielder only" can pass a single fielder.
 *
 * A `caught` / `stumped` with an empty fielder list (data gap) is skipped rather
 * than crashing.
 */
export function aggregateFielding(
  balls: readonly BallEvent[],
): Map<PlayerId, FieldingAggregate> {
  const accs = new Map<string, FieldingAggregate>();

  const accFor = (player: PlayerId): FieldingAggregate => {
    let a = accs.get(player);
    if (!a) {
      a = {
        player,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        dismissals: 0,
      };
      accs.set(player, a);
    }
    return a;
  };

  for (const ball of balls) {
    const w = ball.wicket;
    if (!w) continue;

    if (w.type === "caught") {
      const catcher = w.fielders[0];
      if (catcher) {
        accFor(catcher).catches += 1;
      }
    } else if (w.type === "stumped") {
      const keeper = w.fielders[0];
      if (keeper) {
        accFor(keeper).stumpings += 1;
      }
    } else if (w.type === "run_out") {
      for (const fielder of w.fielders) {
        accFor(fielder).runOuts += 1;
      }
    }
  }

  const result = new Map<PlayerId, FieldingAggregate>();
  for (const a of accs.values()) {
    a.dismissals = a.catches + a.stumpings + a.runOuts;
    result.set(a.player, a);
  }
  return result;
}
