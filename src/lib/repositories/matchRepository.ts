import "server-only";

import type {
  InningsConfig,
  MatchConfig,
  MatchRules,
  MatchTeam,
  Toss,
} from "@/domain/cricket/match";
import { DEFAULT_T20_RULES } from "@/domain/cricket/match";
import type { MatchFormat, MatchStatus } from "@/domain/cricket/enums";
import {
  asId,
  type MatchId,
  type TeamId,
  type TournamentId,
  type VenueId,
} from "@/domain/shared/ids";
import type { TossDecision } from "@/domain/cricket/enums";
import type {
  InningsRow,
  MatchRow,
  MatchStatusEnum,
} from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Match repository — maps `public.matches` / `public.innings` rows to the
 * engine's setup types (`MatchConfig`, `InningsConfig`). The `rules` and
 * `playing_xi` jsonb columns are snapshots, so we parse them defensively and
 * fall back to T20 defaults rather than crash on a partially-seeded match.
 */

interface PlayingXIJson {
  team_a?: MatchTeam["playingXI"];
  team_b?: MatchTeam["playingXI"];
}

function parseRules(raw: MatchRow["rules"]): MatchRules {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    // Trust the snapshot shape but backfill any missing field from defaults so
    // historical matches written before a rule was added still resolve.
    return { ...DEFAULT_T20_RULES, ...(raw as Partial<MatchRules>) };
  }
  return DEFAULT_T20_RULES;
}

function parsePlayingXI(raw: MatchRow["playing_xi"]): {
  teamA: MatchTeam["playingXI"];
  teamB: MatchTeam["playingXI"];
} {
  const json =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as PlayingXIJson)
      : {};
  return { teamA: json.team_a ?? [], teamB: json.team_b ?? [] };
}

export function rowToMatchConfig(row: MatchRow): MatchConfig {
  const { teamA, teamB } = parsePlayingXI(row.playing_xi);

  const toss: Toss | null =
    row.toss_won_by && row.toss_decision
      ? {
          wonBy: asId<"TeamId">(row.toss_won_by),
          decision: row.toss_decision,
        }
      : null;

  return {
    id: asId<"MatchId">(row.id),
    tournamentId: row.tournament_id
      ? asId<"TournamentId">(row.tournament_id)
      : null,
    venueId: row.venue_id ? asId<"VenueId">(row.venue_id) : null,
    format: row.format,
    rules: parseRules(row.rules),
    teamA: { teamId: asId<"TeamId">(row.team_a_id), playingXI: teamA },
    teamB: { teamId: asId<"TeamId">(row.team_b_id), playingXI: teamB },
    toss,
    status: row.status as MatchStatus,
    scheduledAt: row.scheduled_at,
  };
}

export function rowToInningsConfig(row: InningsRow): InningsConfig {
  return {
    id: asId<"InningsId">(row.id),
    matchId: asId<"MatchId">(row.match_id),
    inningsNumber: row.innings_number,
    battingTeam: asId<"TeamId">(row.batting_team_id),
    bowlingTeam: asId<"TeamId">(row.bowling_team_id),
    isSuperOver: row.is_super_over,
    target:
      row.target_runs !== null
        ? { runs: row.target_runs, revisedOvers: row.revised_overs }
        : null,
  };
}

/** Fetch one match's static configuration, or null if it does not exist. */
export async function getMatchConfig(
  matchId: MatchId,
): Promise<MatchConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(`getMatchConfig failed: ${error.message}`);
  return data ? rowToMatchConfig(data) : null;
}

/** The user id designated as scorer for a match (authorization source). */
export async function getMatchScorerId(
  matchId: MatchId,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("scorer_id")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(`getMatchScorerId failed: ${error.message}`);
  return data?.scorer_id ?? null;
}

export async function getInningsConfig(
  inningsId: string,
): Promise<InningsConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("innings")
    .select("*")
    .eq("id", inningsId)
    .maybeSingle();

  if (error) throw new Error(`getInningsConfig failed: ${error.message}`);
  return data ? rowToInningsConfig(data) : null;
}

export interface CreateMatchInput {
  format: MatchFormat;
  teamAId: TeamId;
  teamBId: TeamId;
  rules: MatchRules;
  tournamentId?: TournamentId | null;
  venueId?: VenueId | null;
  scheduledAt?: string | null;
  scorerId?: string | null;
  createdBy: string;
}

/** Insert a new match row and return its branded id. */
export async function createMatchRow(
  input: CreateMatchInput,
): Promise<MatchId> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .insert({
      format: input.format,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      rules: input.rules as unknown as MatchRow["rules"],
      tournament_id: input.tournamentId ?? null,
      venue_id: input.venueId ?? null,
      scheduled_at: input.scheduledAt ?? null,
      scorer_id: input.scorerId ?? null,
      created_by: input.createdBy,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `createMatchRow failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return asId<"MatchId">(data.id);
}

// ─── List / detail view models ───────────────────────────────────────────────

/**
 * Lean list-item view of a match, with both team ids so the UI can resolve
 * names in one batched lookup. Score summaries are derived from the persisted
 * balls by the caller (the engine is the single source of truth), so we keep
 * this row deliberately thin.
 */
export interface MatchListItem {
  id: MatchId;
  format: MatchFormat;
  status: MatchStatus;
  teamAId: TeamId;
  teamBId: TeamId;
  tournamentId: TournamentId | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  winnerTeamId: TeamId | null;
  resultSummary: string | null;
  scorerId: string | null;
  createdBy: string;
}

function rowToListItem(row: MatchRow): MatchListItem {
  return {
    id: asId<"MatchId">(row.id),
    format: row.format,
    status: row.status as MatchStatus,
    teamAId: asId<"TeamId">(row.team_a_id),
    teamBId: asId<"TeamId">(row.team_b_id),
    tournamentId: row.tournament_id
      ? asId<"TournamentId">(row.tournament_id)
      : null,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    winnerTeamId: row.winner_team_id
      ? asId<"TeamId">(row.winner_team_id)
      : null,
    resultSummary: row.result_summary,
    scorerId: row.scorer_id,
    createdBy: row.created_by,
  };
}

export interface ListMatchesOptions {
  status?: MatchStatus;
  tournamentId?: TournamentId;
  teamId?: TeamId;
}

/**
 * List matches, newest first. Optional filters narrow by status, tournament, or
 * a team appearing on either side. Public read (RLS permits).
 */
export async function listMatches(
  opts: ListMatchesOptions = {},
): Promise<MatchListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("matches").select("*");

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.tournamentId) query = query.eq("tournament_id", opts.tournamentId);
  if (opts.teamId) {
    // Either side of the fixture.
    query = query.or(`team_a_id.eq.${opts.teamId},team_b_id.eq.${opts.teamId}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listMatches failed: ${error.message}`);
  return (data ?? []).map(rowToListItem);
}

/** Full configuration + every innings of a match for the detail/scorecard view. */
export interface MatchDetail {
  config: MatchConfig;
  innings: InningsConfig[];
  resultSummary: string | null;
  winnerTeamId: TeamId | null;
  winMarginRuns: number | null;
  winMarginWickets: number | null;
  scorerId: string | null;
  createdBy: string;
}

export async function getMatchDetail(
  matchId: MatchId,
): Promise<MatchDetail | null> {
  const supabase = await createClient();
  const { data: match, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(`getMatchDetail failed: ${error.message}`);
  if (!match) return null;

  const { data: inningsRows, error: inningsErr } = await supabase
    .from("innings")
    .select("*")
    .eq("match_id", matchId)
    .order("innings_number", { ascending: true });

  if (inningsErr) {
    throw new Error(`getMatchDetail innings failed: ${inningsErr.message}`);
  }

  return {
    config: rowToMatchConfig(match),
    innings: (inningsRows ?? []).map((r) => rowToInningsConfig(r as InningsRow)),
    resultSummary: match.result_summary,
    winnerTeamId: match.winner_team_id
      ? asId<"TeamId">(match.winner_team_id)
      : null,
    winMarginRuns: match.win_margin_runs,
    winMarginWickets: match.win_margin_wickets,
    scorerId: match.scorer_id,
    createdBy: match.created_by,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Record the toss outcome; moves the match into the `toss` phase. */
export async function setToss(
  matchId: MatchId,
  wonBy: TeamId,
  decision: TossDecision,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({
      toss_won_by: wonBy,
      toss_decision: decision,
      status: "toss",
    })
    .eq("id", matchId);

  if (error) throw new Error(`setToss failed: ${error.message}`);
}

export interface PlayingXIInput {
  teamA: MatchTeam["playingXI"];
  teamB: MatchTeam["playingXI"];
}

/**
 * Persist the finalized playing XIs into the `playing_xi` jsonb snapshot. The
 * member arrays already carry resolved player ids (see inningsRepository's
 * get-or-create), so the engine can key its cards directly off them.
 */
export async function setPlayingXI(
  matchId: MatchId,
  xi: PlayingXIInput,
): Promise<void> {
  const supabase = await createClient();
  const payload = {
    team_a: xi.teamA,
    team_b: xi.teamB,
  };
  const { error } = await supabase
    .from("matches")
    .update({ playing_xi: payload as unknown as MatchRow["playing_xi"] })
    .eq("id", matchId);

  if (error) throw new Error(`setPlayingXI failed: ${error.message}`);
}

/** Transition a match to a new lifecycle status, stamping timestamps. */
export async function updateStatus(
  matchId: MatchId,
  status: MatchStatus,
): Promise<void> {
  const supabase = await createClient();
  const patch: Partial<MatchRow> = { status: status as MatchStatusEnum };
  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("matches")
    .update(patch)
    .eq("id", matchId);

  if (error) throw new Error(`updateStatus failed: ${error.message}`);
}

export interface MatchResultInput {
  winnerTeamId: TeamId | null;
  marginRuns?: number | null;
  marginWickets?: number | null;
  summary: string;
}

/**
 * Record the final result. Sets `completed` status + `completed_at`, the winner
 * and margin, and a human-readable summary (e.g. "Team A won by 24 runs").
 */
export async function setResult(
  matchId: MatchId,
  result: MatchResultInput,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      winner_team_id: result.winnerTeamId,
      win_margin_runs: result.marginRuns ?? null,
      win_margin_wickets: result.marginWickets ?? null,
      result_summary: result.summary,
    })
    .eq("id", matchId);

  if (error) throw new Error(`setResult failed: ${error.message}`);
}

/** Full match row fetch for server-side authorization checks. */
export async function getMatchRow(matchId: MatchId): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(`getMatchRow failed: ${error.message}`);
  return data ?? null;
}
