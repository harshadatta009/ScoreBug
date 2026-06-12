import "server-only";

import {
  asId,
  type TeamId,
  type TournamentId,
} from "@/domain/shared/ids";
import type {
  MatchRow,
  TournamentRow,
  TournamentTeamRow,
} from "@/lib/supabase/database.types";
import type { TournamentFormatEnum, MatchFormatEnum } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Re-export the shared view-model types so server code can import from here.
export type { Tournament, TournamentTeam, Fixture } from "@/features/tournaments/types";
import type { Tournament, TournamentTeam, Fixture } from "@/features/tournaments/types";

/**
 * Tournament repository.
 *
 * Maps `public.tournaments` / `public.tournament_teams` rows to camelCase view
 * models. View model types live in `@/features/tournaments/types` (not
 * server-only) so client components can import them without violating the
 * server-only boundary.
 */

// ─── Mappers ─────────────────────────────────────────────────────────────────

function rowToTournament(row: TournamentRow): Tournament {
  return {
    id: asId<"TournamentId">(row.id),
    name: row.name,
    format: row.format,
    matchFormat: row.match_format,
    logoUrl: row.logo_url,
    startDate: row.start_date,
    endDate: row.end_date,
    organizerId: asId<"UserId">(row.organizer_id),
    isPublic: row.is_public,
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface ListTournamentsOptions {
  /** Filter by organizer. If omitted, all public tournaments are returned. */
  organizerId?: string;
  isPublic?: boolean;
  limit?: number;
  offset?: number;
}

export async function listTournaments(
  opts: ListTournamentsOptions = {},
): Promise<Tournament[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts.organizerId !== undefined) {
    query = query.eq("organizer_id", opts.organizerId);
  }
  if (opts.isPublic !== undefined) {
    query = query.eq("is_public", opts.isPublic);
  }
  if (opts.limit !== undefined) {
    query = query.limit(opts.limit);
  }
  if (opts.offset !== undefined) {
    query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listTournaments failed: ${error.message}`);
  return (data ?? []).map(rowToTournament);
}

export async function getTournament(
  id: TournamentId,
): Promise<Tournament | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getTournament failed: ${error.message}`);
  return data ? rowToTournament(data) : null;
}

export interface CreateTournamentInput {
  name: string;
  format: TournamentFormatEnum;
  matchFormat: MatchFormatEnum;
  logoUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  organizerId: string;
  isPublic: boolean;
  config?: Record<string, unknown>;
}

export async function createTournament(
  input: CreateTournamentInput,
): Promise<Tournament> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      name: input.name,
      format: input.format,
      match_format: input.matchFormat,
      logo_url: input.logoUrl ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      organizer_id: input.organizerId,
      is_public: input.isPublic,
      config: (input.config ?? {}) as TournamentRow["config"],
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `createTournament failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToTournament(data);
}

export type UpdateTournamentPatch = Partial<{
  name: string;
  format: TournamentFormatEnum;
  matchFormat: MatchFormatEnum;
  logoUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  isPublic: boolean;
  config: Record<string, unknown>;
}>;

export async function updateTournament(
  id: TournamentId,
  patch: UpdateTournamentPatch,
): Promise<Tournament> {
  const supabase = await createClient();
  const update: Partial<TournamentRow> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.format !== undefined) update.format = patch.format;
  if (patch.matchFormat !== undefined) update.match_format = patch.matchFormat;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.isPublic !== undefined) update.is_public = patch.isPublic;
  if (patch.config !== undefined)
    update.config = patch.config as TournamentRow["config"];

  const { data, error } = await supabase
    .from("tournaments")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `updateTournament failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToTournament(data);
}

export async function registerTeam(
  tournamentId: TournamentId,
  teamId: TeamId,
  groupName?: string | null,
): Promise<TournamentTeamRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_teams")
    .insert({
      tournament_id: tournamentId,
      team_id: teamId,
      group_name: groupName ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `registerTeam failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data;
}

// Raw joined row shape returned by the PostgREST nested select.
interface RawTournamentTeamJoin {
  id: string;
  tournament_id: string;
  team_id: string;
  group_name: string | null;
  seed: number | null;
  joined_at: string;
  teams: { name: string; short_name: string | null; logo_url: string | null } | null;
}

export async function getRegisteredTeams(
  tournamentId: TournamentId,
): Promise<TournamentTeam[]> {
  const supabase = await createClient();
  // Join tournament_teams → teams inline via PostgREST nested select.
  // Cast to unknown first because the static schema doesn't model the
  // relationship and Supabase types resolve the joined shape to `never`.
  const { data, error } = await supabase
    .from("tournament_teams")
    .select("*, teams(name, short_name, logo_url)")
    .eq("tournament_id", tournamentId)
    .order("joined_at", { ascending: true }) as unknown as {
      data: RawTournamentTeamJoin[] | null;
      error: { message: string } | null;
    };

  if (error) throw new Error(`getRegisteredTeams failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    tournamentId: asId<"TournamentId">(row.tournament_id),
    teamId: asId<"TeamId">(row.team_id),
    groupName: row.group_name,
    seed: row.seed,
    joinedAt: row.joined_at,
    team: {
      name: row.teams?.name ?? "Unknown",
      shortName: row.teams?.short_name ?? null,
      logoUrl: row.teams?.logo_url ?? null,
    },
  }));
}

// Raw row returned by the fixture query with PostgREST FK aliases.
interface RawFixtureJoin {
  id: string;
  round: number | null;
  match_number: number | null;
  stage: string | null;
  group_name: string | null;
  team_a_id: string;
  team_b_id: string;
  status: MatchRow["status"];
  scheduled_at: string | null;
  winner_team_id: string | null;
  result_summary: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
}

export async function getFixtures(tournamentId: TournamentId): Promise<Fixture[]> {
  const supabase = await createClient();

  // Alias FK joins for team names. Cast because the static schema doesn't model
  // these relationship aliases and they resolve to `never` in codegen types.
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, round, match_number, stage, group_name, team_a_id, team_b_id, status, scheduled_at, winner_team_id, result_summary, team_a:teams!matches_team_a_id_fkey(name), team_b:teams!matches_team_b_id_fkey(name)",
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true, nullsFirst: false })
    .order("match_number", { ascending: true, nullsFirst: false })
    .order("scheduled_at", { ascending: true, nullsFirst: false }) as unknown as {
      data: RawFixtureJoin[] | null;
      error: { message: string } | null;
    };

  if (error) throw new Error(`getFixtures failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    round: row.round,
    matchNumber: row.match_number,
    stage: row.stage,
    groupName: row.group_name,
    teamAId: asId<"TeamId">(row.team_a_id),
    teamBId: asId<"TeamId">(row.team_b_id),
    teamAName: row.team_a?.name ?? "TBA",
    teamBName: row.team_b?.name ?? "TBA",
    status: row.status,
    scheduledAt: row.scheduled_at,
    winnerTeamId: row.winner_team_id
      ? asId<"TeamId">(row.winner_team_id)
      : null,
    resultSummary: row.result_summary,
  }));
}
