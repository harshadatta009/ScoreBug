"use client";

/**
 * TanStack Query hooks for the Tournaments feature.
 *
 * Keys are defined here (feature-scoped) rather than in the shared
 * src/lib/query/queryKeys.ts to avoid collisions with other verticals.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { Tournament, TournamentTeam, Fixture } from "@/features/tournaments/types";
import type { PointsTableRow } from "@/server/actions/tournament";

// ─── Query key factory ────────────────────────────────────────────────────────

export const tournamentKeys = {
  all: ["tournaments"] as const,
  lists: () => [...tournamentKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...tournamentKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...tournamentKeys.all, "detail", id] as const,
  teams: (id: string) => [...tournamentKeys.all, "teams", id] as const,
  fixtures: (id: string) => [...tournamentKeys.all, "fixtures", id] as const,
  pointsTable: (id: string) =>
    [...tournamentKeys.all, "points", id] as const,
} as const;

// ─── Client-side fetch helpers (browser Supabase client) ──────────────────────

async function fetchTournaments(): Promise<Tournament[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  // Map snake_case → camelCase inline (mirrors the server repository mapper).
  return (data ?? []).map((row) => ({
    id: row.id as Tournament["id"],
    name: row.name,
    format: row.format,
    matchFormat: row.match_format,
    logoUrl: row.logo_url,
    startDate: row.start_date,
    endDate: row.end_date,
    organizerId: row.organizer_id as Tournament["organizerId"],
    isPublic: row.is_public,
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function fetchTournament(id: string): Promise<Tournament | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as Tournament["id"],
    name: data.name,
    format: data.format,
    matchFormat: data.match_format,
    logoUrl: data.logo_url,
    startDate: data.start_date,
    endDate: data.end_date,
    organizerId: data.organizer_id as Tournament["organizerId"],
    isPublic: data.is_public,
    config:
      data.config && typeof data.config === "object" && !Array.isArray(data.config)
        ? (data.config as Record<string, unknown>)
        : {},
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

interface RawTournamentTeamJoin {
  id: string;
  tournament_id: string;
  team_id: string;
  group_name: string | null;
  seed: number | null;
  joined_at: string;
  teams: { name: string; short_name: string | null; logo_url: string | null } | null;
}

async function fetchRegisteredTeams(tournamentId: string): Promise<TournamentTeam[]> {
  const supabase = createClient();
  // Cast needed: Supabase types resolve joined shapes to `never` when the
  // relationship isn't in the static schema.
  const { data, error } = await supabase
    .from("tournament_teams")
    .select("*, teams(name, short_name, logo_url)")
    .eq("tournament_id", tournamentId)
    .order("joined_at", { ascending: true }) as unknown as {
      data: RawTournamentTeamJoin[] | null;
      error: { message: string } | null;
    };
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    tournamentId: row.tournament_id as TournamentTeam["tournamentId"],
    teamId: row.team_id as TournamentTeam["teamId"],
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

interface RawFixtureJoin {
  id: string;
  round: number | null;
  match_number: number | null;
  stage: string | null;
  group_name: string | null;
  team_a_id: string;
  team_b_id: string;
  status: Fixture["status"];
  scheduled_at: string | null;
  winner_team_id: string | null;
  result_summary: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
}

async function fetchFixtures(tournamentId: string): Promise<Fixture[]> {
  const supabase = createClient();
  // Cast needed: FK alias joins (`team_a:teams!...`) aren't in the static
  // schema and resolve to `never` without this.
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
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    round: row.round,
    matchNumber: row.match_number,
    stage: row.stage,
    groupName: row.group_name,
    teamAId: row.team_a_id as Fixture["teamAId"],
    teamBId: row.team_b_id as Fixture["teamBId"],
    teamAName: row.team_a?.name ?? "TBA",
    teamBName: row.team_b?.name ?? "TBA",
    status: row.status,
    scheduledAt: row.scheduled_at,
    winnerTeamId: row.winner_team_id
      ? (row.winner_team_id as Fixture["winnerTeamId"])
      : null,
    resultSummary: row.result_summary,
  }));
}

async function fetchPointsTable(tournamentId: string): Promise<PointsTableRow[]> {
  // Points table is computed server-side (aggregate logic over innings/balls).
  // We call the server action directly from this client-side queryFn — Next 15
  // serialises the call over the server action boundary automatically.
  const { getPointsTableAction } = await import("@/server/actions/tournament");
  const result = await getPointsTableAction(tournamentId);
  if (!result.ok) throw new Error(result.error ?? "Failed to load points table");
  return result.data?.rows ?? [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useTournaments() {
  return useQuery({
    queryKey: tournamentKeys.lists(),
    queryFn: fetchTournaments,
  });
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(id),
    queryFn: () => fetchTournament(id),
    enabled: !!id,
  });
}

export function useRegisteredTeams(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.teams(tournamentId),
    queryFn: () => fetchRegisteredTeams(tournamentId),
    enabled: !!tournamentId,
  });
}

export function useFixtures(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.fixtures(tournamentId),
    queryFn: () => fetchFixtures(tournamentId),
    enabled: !!tournamentId,
  });
}

export function usePointsTable(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.pointsTable(tournamentId),
    queryFn: () => fetchPointsTable(tournamentId),
    enabled: !!tournamentId,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useGenerateFixtures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tournamentId: string) => {
      const { generateFixturesAction } = await import(
        "@/server/actions/tournament"
      );
      const result = await generateFixturesAction({ tournamentId });
      if (!result.ok) throw new Error(result.error ?? "Failed");
    },
    onSuccess: (_data, tournamentId) => {
      void qc.invalidateQueries({ queryKey: tournamentKeys.fixtures(tournamentId) });
    },
  });
}

export function useRegisterTeam(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { teamId: string; groupName?: string }) => {
      const { registerTeamAction } = await import("@/server/actions/tournament");
      const result = await registerTeamAction({
        tournamentId,
        teamId: payload.teamId,
        groupName: payload.groupName,
      });
      if (!result.ok) throw new Error(result.error ?? "Failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tournamentKeys.teams(tournamentId) });
    },
  });
}
