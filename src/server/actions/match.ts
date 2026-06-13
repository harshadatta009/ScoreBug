"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import type {
  BallEvent,
  RecordBallInput,
  WicketEvent,
} from "@/domain/cricket/ball";
import {
  DISMISSAL_TYPES,
  EXTRA_TYPES,
  type DismissalType,
} from "@/domain/cricket/enums";
import { reduceInnings } from "@/domain/cricket/engine";
import {
  DEFAULT_T20_RULES,
  type InningsConfig,
  type MatchRules,
  type PlayingXIMember,
} from "@/domain/cricket/match";
import { asId, type MatchId, type TeamId } from "@/domain/shared/ids";
import { getUserRoles, requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import {
  createMatchRow,
  getMatchDetail,
  getMatchRow,
  getMatchScorerId,
  setPlayingXI,
  setResult,
  setToss,
  updateStatus,
  type CreateMatchInput,
} from "@/lib/repositories/matchRepository";
import {
  completeInnings as completeInningsRow,
  createInnings as createInningsRow,
  getCurrentInnings,
  getInningsByMatch,
  getOrCreatePlayerForUser,
} from "@/lib/repositories/inningsRepository";
import { getMatchConfig } from "@/lib/repositories/matchRepository";
import {
  getBallsForInnings,
  getLastSequence,
  insertBall,
  materializeBall,
} from "@/lib/repositories/ballRepository";

/**
 * Match server actions.
 *
 * Authorization is enforced server-side regardless of what the client claims:
 * we re-fetch the authenticated user, re-read their roles / the match's scorer
 * from the DB, and validate every payload with zod. The client cannot grant
 * itself permission to score a match it doesn't own.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const uuid = z.string().uuid();

const rulesSchema: z.ZodType<MatchRules> = z.object({
  oversPerInnings: z.number().int().positive().nullable(),
  ballsPerOver: z.number().int().positive(),
  maxOversPerBowler: z.number().int().positive().nullable(),
  playersPerSide: z.number().int().positive(),
  freeHitOnNoBall: z.boolean(),
  noBallPenalty: z.number().int().nonnegative(),
  widePenalty: z.number().int().nonnegative(),
  powerplayOvers: z.array(
    z.object({ from: z.number().int().nonnegative(), to: z.number().int() }),
  ),
  superOverOnTie: z.boolean(),
});

const createMatchSchema = z.object({
  format: z.enum(["T20", "ODI", "TEST", "T10", "THE_HUNDRED", "CUSTOM"]),
  teamAId: uuid,
  teamBId: uuid,
  rules: rulesSchema.optional(),
  tournamentId: uuid.nullish(),
  venueId: uuid.nullish(),
  scheduledAt: z.string().datetime().nullish(),
  scorerId: uuid.nullish(),
});

export async function createMatch(
  input: z.input<typeof createMatchSchema>,
): Promise<ActionResult<{ matchId: MatchId }>> {
  // Creating a match requires only authentication: the creator becomes the
  // scorer/owner. Gating behind a global `match:create` role would lock out
  // brand-new users who have no roles yet.
  const user = await requireUser();

  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  if (parsed.data.teamAId === parsed.data.teamBId) {
    return { ok: false, error: "A match needs two distinct teams." };
  }

  const payload: CreateMatchInput = {
    format: parsed.data.format,
    teamAId: asId<"TeamId">(parsed.data.teamAId),
    teamBId: asId<"TeamId">(parsed.data.teamBId),
    rules: parsed.data.rules ?? DEFAULT_T20_RULES,
    tournamentId: parsed.data.tournamentId
      ? asId<"TournamentId">(parsed.data.tournamentId)
      : null,
    venueId: parsed.data.venueId ? asId<"VenueId">(parsed.data.venueId) : null,
    scheduledAt: parsed.data.scheduledAt ?? null,
    // Default the scorer to the creator so they can score immediately.
    scorerId: parsed.data.scorerId ?? user.id,
    createdBy: user.id,
  };

  // ── TEMP DIAGNOSTIC (remove after debugging match-create RLS) ──────────────
  // Compares the user id from getUser() against the auth.uid() that the
  // DATA-PLANE connection actually presents to Postgres (via debug_whoami).
  // If dbAuthUid is null while getUserId is set, the session token isn't
  // reaching PostgREST — that is the cause of the matches INSERT RLS failure.
  try {
    const diagClient = await createClient();
    const { data: gu } = await diagClient.auth.getUser();
    const rpc = diagClient.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: dbAuthUid, error: rpcErr } = await rpc("debug_whoami");
    console.log("[DIAG createMatch]", {
      requireUserId: user.id,
      getUserId: gu.user?.id ?? null,
      dbAuthUid: dbAuthUid ?? null,
      rpcError: rpcErr?.message ?? null,
      createdByToInsert: payload.createdBy,
    });
  } catch (diagErr) {
    console.log("[DIAG createMatch] probe failed", diagErr);
  }
  // ── END TEMP DIAGNOSTIC ────────────────────────────────────────────────────

  try {
    const matchId = await createMatchRow(payload);
    revalidatePath("/matches");
    return { ok: true, data: { matchId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

const wicketSchema = z.object({
  type: z.enum(DISMISSAL_TYPES as unknown as [string, ...string[]]),
  playerOut: uuid,
  bowler: uuid.nullable(),
  fielders: z.array(uuid),
});

const recordBallSchema = z.object({
  matchId: uuid,
  inningsId: uuid,
  striker: uuid,
  nonStriker: uuid,
  bowler: uuid,
  batRuns: z.number().int().min(0).max(6),
  extraType: z.enum(EXTRA_TYPES as unknown as [string, ...string[]]).nullable(),
  extraRuns: z.number().int().min(0),
  wicket: wicketSchema.nullable(),
  isFreeHit: z.boolean(),
  commentary: z.string().max(500).nullish(),
});

/**
 * Record a single delivery.
 *
 * The caller MUST be the match's designated scorer (or hold a role granting
 * `ball:record`). We compute the next sequence/over/ballInOver from the
 * persisted log — never trusting client-supplied positional fields — then
 * insert via the repository and return the canonical event for reconciliation.
 */
export async function recordBall(
  input: z.input<typeof recordBallSchema>,
): Promise<ActionResult<{ ball: BallEvent }>> {
  const user = await requireUser();

  const parsed = recordBallSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const p = parsed.data;

  // Authorization: the designated scorer always may; otherwise a role-based
  // grant (umpire/scorer/tournament_admin) is required.
  const matchId = asId<"MatchId">(p.matchId);
  const scorerId = await getMatchScorerId(matchId);
  if (scorerId !== user.id) {
    const roles = await getUserRoles();
    if (!can(roles, "ball:record")) {
      return {
        ok: false,
        error: "Only the match scorer may record deliveries.",
      };
    }
  }

  const inningsId = asId<"InningsId">(p.inningsId);

  const recordInput: RecordBallInput = {
    inningsId,
    striker: asId<"PlayerId">(p.striker),
    nonStriker: asId<"PlayerId">(p.nonStriker),
    bowler: asId<"PlayerId">(p.bowler),
    batRuns: p.batRuns as BallEvent["batRuns"],
    extraType: p.extraType as BallEvent["extraType"],
    extraRuns: p.extraRuns,
    wicket: p.wicket
      ? ({
          type: p.wicket.type as DismissalType,
          playerOut: asId<"PlayerId">(p.wicket.playerOut),
          bowler: p.wicket.bowler ? asId<"PlayerId">(p.wicket.bowler) : null,
          fielders: p.wicket.fielders.map((f) => asId<"PlayerId">(f)),
        } satisfies WicketEvent)
      : null,
    isFreeHit: p.isFreeHit,
    commentary: p.commentary ?? null,
    recordedBy: asId<"PlayerId">(user.id),
  };

  try {
    // Derive positional fields from the authoritative log. The full scorecard
    // (which over a delivery falls in, free-hit propagation) is the engine's
    // job; here we only need a consistent, gapless sequence and a best-effort
    // over/ballInOver for display, which the client will reconcile against the
    // engine's output.
    const lastSeq = await getLastSequence(inningsId);
    const sequence = lastSeq + 1;
    const ballsPerOver = DEFAULT_T20_RULES.ballsPerOver;
    // Best-effort positional hints from the sequence; the engine recomputes the
    // exact over/ballInOver (accounting for illegal deliveries) on the client,
    // so these only need to be a sensible, monotonic default.
    const over = Math.floor(lastSeq / ballsPerOver);
    const ballInOver = (lastSeq % ballsPerOver) + 1;

    const event = materializeBall(recordInput, {
      id: asId<"BallId">(crypto.randomUUID()),
      sequence,
      over,
      ballInOver,
    });

    const persisted = await insertBall(event);
    revalidatePath(`/matches/${p.matchId}`);
    return { ok: true, data: { ball: persisted } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Lifecycle authorization ──────────────────────────────────────────────────

/**
 * Verify the current user may mutate this match's lifecycle (toss, XI, start,
 * complete, innings). The match's designated scorer or creator always may; a
 * super_admin role is the only role-based override. Returns a clean error
 * string on failure, or null when authorized.
 */
async function authorizeMatchOwner(matchId: MatchId): Promise<string | null> {
  const user = await requireUser();
  const row = await getMatchRow(matchId);
  if (!row) return "Match not found.";

  if (row.scorer_id === user.id || row.created_by === user.id) return null;

  const roles = await getUserRoles();
  if (roles.includes("super_admin")) return null;

  return "Only the match scorer or creator may manage this match.";
}

// ─── Toss ─────────────────────────────────────────────────────────────────────

const tossSchema = z.object({
  matchId: uuid,
  wonBy: uuid,
  decision: z.enum(["bat", "bowl"]),
});

export async function setMatchToss(
  input: z.input<typeof tossSchema>,
): Promise<ActionResult> {
  const parsed = tossSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const p = parsed.data;

  const matchId = asId<"MatchId">(p.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  // The toss winner must be one of the two competing teams.
  const row = await getMatchRow(matchId);
  if (row && p.wonBy !== row.team_a_id && p.wonBy !== row.team_b_id) {
    return { ok: false, error: "Toss winner must be one of the two teams." };
  }

  try {
    await setToss(matchId, asId<"TeamId">(p.wonBy), p.decision);
    revalidatePath(`/matches/${p.matchId}`);
    revalidatePath(`/matches/${p.matchId}/setup`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Playing XI ────────────────────────────────────────────────────────────────

const xiMemberSchema = z.object({
  /** User id from the squad; resolved to a player id server-side. */
  userId: uuid,
  battingOrder: z.number().int().positive(),
  isCaptain: z.boolean().optional(),
  isWicketKeeper: z.boolean().optional(),
  isSubstitute: z.boolean().optional(),
});

const playingXISchema = z.object({
  matchId: uuid,
  teamA: z.array(xiMemberSchema).min(1).max(15),
  teamB: z.array(xiMemberSchema).min(1).max(15),
});

/**
 * Resolve a side's selected users to PlayingXIMember rows, materializing a
 * `public.players` row for each user so the ball log can reference player ids.
 */
async function resolveXI(
  members: z.infer<typeof xiMemberSchema>[],
): Promise<PlayingXIMember[]> {
  const resolved: PlayingXIMember[] = [];
  for (const m of members) {
    const playerId = await getOrCreatePlayerForUser(m.userId);
    resolved.push({
      player: playerId,
      battingOrder: m.battingOrder,
      isCaptain: m.isCaptain ?? false,
      isWicketKeeper: m.isWicketKeeper ?? false,
      isSubstitute: m.isSubstitute ?? false,
    });
  }
  return resolved;
}

export async function setMatchPlayingXI(
  input: z.input<typeof playingXISchema>,
): Promise<ActionResult> {
  const parsed = playingXISchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const p = parsed.data;

  const matchId = asId<"MatchId">(p.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  try {
    const [teamA, teamB] = await Promise.all([
      resolveXI(p.teamA),
      resolveXI(p.teamB),
    ]);
    await setPlayingXI(matchId, { teamA, teamB });
    revalidatePath(`/matches/${p.matchId}`);
    revalidatePath(`/matches/${p.matchId}/setup`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Innings ────────────────────────────────────────────────────────────────────

const createInningsSchema = z.object({
  matchId: uuid,
  inningsNumber: z.number().int().positive(),
  battingTeam: uuid,
  bowlingTeam: uuid,
  isSuperOver: z.boolean().optional(),
  targetRuns: z.number().int().positive().nullish(),
  revisedOvers: z.number().int().positive().nullish(),
});

export async function createInnings(
  input: z.input<typeof createInningsSchema>,
): Promise<ActionResult<{ innings: InningsConfig }>> {
  const parsed = createInningsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const p = parsed.data;

  const matchId = asId<"MatchId">(p.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  try {
    const innings = await createInningsRow({
      matchId,
      inningsNumber: p.inningsNumber,
      battingTeam: asId<"TeamId">(p.battingTeam),
      bowlingTeam: asId<"TeamId">(p.bowlingTeam),
      isSuperOver: p.isSuperOver ?? false,
      targetRuns: p.targetRuns ?? null,
      revisedOvers: p.revisedOvers ?? null,
    });
    revalidatePath(`/matches/${p.matchId}`);
    return { ok: true, data: { innings } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

const completeInningsSchema = z.object({
  matchId: uuid,
  inningsId: uuid,
});

export async function completeCurrentInnings(
  input: z.input<typeof completeInningsSchema>,
): Promise<ActionResult> {
  const parsed = completeInningsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const p = parsed.data;

  const matchId = asId<"MatchId">(p.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  try {
    await completeInningsRow(asId<"InningsId">(p.inningsId));
    await updateStatus(matchId, "innings_break");
    revalidatePath(`/matches/${p.matchId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Start match ─────────────────────────────────────────────────────────────────

const startMatchSchema = z.object({ matchId: uuid });

/**
 * Begin play: flip status to `in_progress` and create the first innings derived
 * from the toss. The side batting first is the toss winner who chose `bat`, or
 * the opponent of a toss winner who chose `bowl`.
 */
export async function startMatch(
  input: z.input<typeof startMatchSchema>,
): Promise<ActionResult<{ innings: InningsConfig }>> {
  const parsed = startMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const matchId = asId<"MatchId">(parsed.data.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  const row = await getMatchRow(matchId);
  if (!row) return { ok: false, error: "Match not found." };
  if (!row.toss_won_by || !row.toss_decision) {
    return { ok: false, error: "Record the toss before starting the match." };
  }

  // Derive who bats first from the toss.
  const tossWinner = row.toss_won_by;
  const other =
    tossWinner === row.team_a_id ? row.team_b_id : row.team_a_id;
  const battingFirst = row.toss_decision === "bat" ? tossWinner : other;
  const bowlingFirst = battingFirst === row.team_a_id ? row.team_b_id : row.team_a_id;

  try {
    // Avoid creating a duplicate first innings on re-entry.
    const existing = await getInningsByMatch(matchId);
    const first =
      existing.find((i) => i.inningsNumber === 1) ??
      (await createInningsRow({
        matchId,
        inningsNumber: 1,
        battingTeam: asId<"TeamId">(battingFirst),
        bowlingTeam: asId<"TeamId">(bowlingFirst),
      }));

    await updateStatus(matchId, "in_progress");
    revalidatePath(`/matches/${parsed.data.matchId}`);
    revalidatePath("/matches");
    return { ok: true, data: { innings: first } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Complete match (compute result from the engine) ───────────────────────────

const completeMatchSchema = z.object({ matchId: uuid });

/**
 * Compute and persist the final result from the persisted ball log. We replay
 * every innings through the engine and compare totals: in a two-innings limited
 * match, the side batting second wins by wickets if it passed the target,
 * otherwise the side batting first wins by the run margin (or it's a tie).
 */
export async function completeMatch(
  input: z.input<typeof completeMatchSchema>,
): Promise<ActionResult<{ summary: string }>> {
  const parsed = completeMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const matchId = asId<"MatchId">(parsed.data.matchId);
  const denied = await authorizeMatchOwner(matchId);
  if (denied) return { ok: false, error: denied };

  try {
    const detail = await getMatchDetail(matchId);
    if (!detail) return { ok: false, error: "Match not found." };
    if (detail.innings.length === 0) {
      return { ok: false, error: "No innings to compute a result from." };
    }

    const rules = detail.config.rules;
    // Score each innings off its persisted balls.
    const scored = await Promise.all(
      detail.innings.map(async (cfg) => {
        const balls = await getBallsForInnings(cfg.id);
        return { cfg, score: reduceInnings(cfg, rules, balls) };
      }),
    );

    // Limited-overs result from the first two innings.
    const first = scored[0];
    const second = scored[1];
    if (!first) return { ok: false, error: "No innings to compute a result from." };

    let winnerTeamId: TeamId | null = null;
    let marginRuns: number | null = null;
    let marginWickets: number | null = null;
    let summary: string;

    if (!second) {
      // Only one innings exists; report the standing total without a winner.
      summary = `Innings 1: ${first.score.runs}/${first.score.wickets}`;
    } else {
      const firstRuns = first.score.runs;
      const secondRuns = second.score.runs;
      if (secondRuns > firstRuns) {
        // Chasing side won — margin in wickets remaining.
        winnerTeamId = second.cfg.battingTeam;
        marginWickets = rules.playersPerSide - 1 - second.score.wickets;
        summary = `Won by ${marginWickets} wicket${marginWickets === 1 ? "" : "s"}`;
      } else if (firstRuns > secondRuns) {
        winnerTeamId = first.cfg.battingTeam;
        marginRuns = firstRuns - secondRuns;
        summary = `Won by ${marginRuns} run${marginRuns === 1 ? "" : "s"}`;
      } else {
        summary = "Match tied";
      }
    }

    await setResult(matchId, {
      winnerTeamId,
      marginRuns,
      marginWickets,
      summary,
    });
    revalidatePath(`/matches/${parsed.data.matchId}`);
    revalidatePath("/matches");
    return { ok: true, data: { summary } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Live scoring context (for the scorer screen) ───────────────────────────────

const scoringContextSchema = z.object({ matchId: uuid });

/** Opening crease pair + first bowler derived from the playing XIs + toss. */
export interface ScoringSeed {
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
}

export interface LiveScoringContext {
  innings: InningsConfig;
  rules: MatchRules;
  balls: BallEvent[];
  /** Suggested opening pair / bowler from the XIs (for a fresh innings). */
  seed: ScoringSeed;
  battingTeamName?: string;
}

/**
 * Everything the live scoring screen needs to initialize against real data:
 * the current (open) innings, the match rules, the persisted ball log, and a
 * seed crease pair derived from the playing XIs. Returns ok:false (not throw)
 * when there is no live innings so the screen can fall back to demo mode.
 */
export async function getLiveScoringContext(
  input: z.input<typeof scoringContextSchema>,
): Promise<ActionResult<LiveScoringContext>> {
  const parsed = scoringContextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const matchId = asId<"MatchId">(parsed.data.matchId);

  try {
    const config = await getMatchConfig(matchId);
    if (!config) return { ok: false, error: "Match not found." };

    const innings = await getCurrentInnings(matchId);
    if (!innings) return { ok: false, error: "No live innings." };

    const balls = await getBallsForInnings(innings.id);

    // Seed the opening pair from the batting side's XI (battingOrder 1 & 2) and
    // the first bowler from the bowling side's XI, so a fresh innings starts
    // with real player ids rather than placeholders.
    const battingSide =
      innings.battingTeam === config.teamA.teamId
        ? config.teamA
        : config.teamB;
    const bowlingSide =
      innings.bowlingTeam === config.teamA.teamId
        ? config.teamA
        : config.teamB;

    const orderedBatters = [...battingSide.playingXI]
      .filter((m) => !m.isSubstitute)
      .sort((a, b) => a.battingOrder - b.battingOrder);
    const orderedBowlers = [...bowlingSide.playingXI].filter(
      (m) => !m.isSubstitute,
    );

    const seed: ScoringSeed = {
      strikerId: orderedBatters[0]?.player ?? null,
      nonStrikerId: orderedBatters[1]?.player ?? null,
      bowlerId: orderedBowlers[orderedBowlers.length - 1]?.player ?? null,
    };

    return {
      ok: true,
      data: { innings, rules: config.rules, balls, seed },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
