"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { asId, type TournamentId, type TeamId } from "@/domain/shared/ids";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createTournament as repoCreate,
  getTournament,
  updateTournament as repoUpdate,
  registerTeam as repoRegisterTeam,
  getRegisteredTeams,
} from "@/lib/repositories/tournamentRepository";
import type { ActionResult } from "@/server/actions/match";

/**
 * Tournament server actions.
 *
 * Authorization rules:
 *  - CREATE: any authenticated user (requireUser only — no global-role gate).
 *    The creator becomes the organizer.
 *  - MUTATE (update / register team / generate fixtures): the requesting user
 *    must be the tournament's organizer_id, OR hold the super_admin role.
 *    We re-fetch the tournament row server-side to enforce this.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

const uuid = z.string().uuid();

const TOURNAMENT_FORMATS = [
  "league",
  "knockout",
  "round_robin",
  "league_playoffs",
] as const;
const MATCH_FORMATS = [
  "T20",
  "ODI",
  "TEST",
  "T10",
  "THE_HUNDRED",
  "CUSTOM",
] as const;

/**
 * Re-fetch the tournament and verify the current user is its organizer.
 * Returns the tournament on success, or an error ActionResult on failure.
 */
async function assertOrganizer(
  tournamentId: TournamentId,
  userId: string,
): Promise<
  | { ok: true; tournament: NonNullable<Awaited<ReturnType<typeof getTournament>>> }
  | { ok: false; error: string }
> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  if (tournament.organizerId === userId) return { ok: true, tournament };

  // Allow super_admin as a bypass.
  const supabase = await createClient();
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (roleRows) return { ok: true, tournament };
  return {
    ok: false,
    error: "Only the tournament organizer can perform this action.",
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

const createTournamentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(120),
  format: z.enum(TOURNAMENT_FORMATS),
  matchFormat: z.enum(MATCH_FORMATS),
  logoUrl: z.string().url().nullish(),
  startDate: z.string().date().nullish(),
  endDate: z.string().date().nullish(),
  isPublic: z.boolean().default(true),
});

export type CreateTournamentInput = z.input<typeof createTournamentSchema>;

export async function createTournamentAction(
  input: CreateTournamentInput,
): Promise<ActionResult<{ tournamentId: TournamentId }>> {
  // No global-role gate — any authenticated user may create a tournament.
  const user = await requireUser();

  const parsed = createTournamentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const { data } = parsed;

  try {
    const tournament = await repoCreate({
      name: data.name,
      format: data.format,
      matchFormat: data.matchFormat,
      logoUrl: data.logoUrl ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      organizerId: user.id,
      isPublic: data.isPublic,
    });
    revalidatePath("/tournaments");
    return { ok: true, data: { tournamentId: tournament.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

const updateTournamentSchema = z.object({
  tournamentId: uuid,
  name: z.string().min(2).max(120).optional(),
  format: z.enum(TOURNAMENT_FORMATS).optional(),
  matchFormat: z.enum(MATCH_FORMATS).optional(),
  logoUrl: z.string().url().nullish(),
  startDate: z.string().date().nullish(),
  endDate: z.string().date().nullish(),
  isPublic: z.boolean().optional(),
});

export type UpdateTournamentInput = z.input<typeof updateTournamentSchema>;

export async function updateTournamentAction(
  input: UpdateTournamentInput,
): Promise<ActionResult<{ tournamentId: TournamentId }>> {
  const user = await requireUser();

  const parsed = updateTournamentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const tournamentId = asId<"TournamentId">(parsed.data.tournamentId);
  const auth = await assertOrganizer(tournamentId, user.id);
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const updated = await repoUpdate(tournamentId, {
      name: parsed.data.name,
      format: parsed.data.format,
      matchFormat: parsed.data.matchFormat,
      logoUrl: parsed.data.logoUrl,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      isPublic: parsed.data.isPublic,
    });
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath("/tournaments");
    return { ok: true, data: { tournamentId: updated.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Register team ─────────────────────────────────────────────────────────────

const registerTeamSchema = z.object({
  tournamentId: uuid,
  teamId: uuid,
  groupName: z.string().max(60).nullish(),
});

export type RegisterTeamInput = z.input<typeof registerTeamSchema>;

export async function registerTeamAction(
  input: RegisterTeamInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = registerTeamSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const tournamentId = asId<"TournamentId">(parsed.data.tournamentId);
  const auth = await assertOrganizer(tournamentId, user.id);
  if (!auth.ok) return { ok: false, error: auth.error };

  const teamId = asId<"TeamId">(parsed.data.teamId);

  // Duplicate guard — check if team is already registered.
  const existing = await getRegisteredTeams(tournamentId);
  if (existing.some((t) => t.teamId === teamId)) {
    return { ok: false, error: "This team is already registered." };
  }

  try {
    await repoRegisterTeam(tournamentId, teamId, parsed.data.groupName ?? null);
    revalidatePath(`/tournaments/${tournamentId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Generate fixtures ────────────────────────────────────────────────────────

const generateFixturesSchema = z.object({
  tournamentId: uuid,
});

export type GenerateFixturesInput = z.input<typeof generateFixturesSchema>;

/**
 * Generate fixtures for a tournament.
 *
 * Round-robin / league: every team vs every other team exactly once (N*(N-1)/2
 * matches). Pairs are produced by the standard round-robin algorithm: fix team 0
 * and rotate the rest across N-1 rounds.
 *
 * Knockout: seed the bracket with N teams padded to the next power of two; BYEs
 * are represented by a null team slot (matches with a TBD team are useful
 * placeholders the scorer fills in as results arrive).
 *
 * Only inserts matches; does not overwrite existing ones so the action is
 * idempotent-ish (callers should guard the button).
 */
export async function generateFixturesAction(
  input: GenerateFixturesInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = generateFixturesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const tournamentId = asId<"TournamentId">(parsed.data.tournamentId);
  const auth = await assertOrganizer(tournamentId, user.id);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { tournament } = auth;

  const registered = await getRegisteredTeams(tournamentId);
  if (registered.length < 2) {
    return {
      ok: false,
      error: "Need at least 2 registered teams to generate fixtures.",
    };
  }

  const supabase = await createClient();

  if (
    tournament.format === "league" ||
    tournament.format === "round_robin" ||
    tournament.format === "league_playoffs"
  ) {
    const teams = registered.map((t) => t.teamId);
    const n = teams.length;

    // Standard round-robin rotation: fix teams[0], rotate rest.
    // Produces ceil(n/2) matches per round, (n-1) rounds total.
    const fixtures: Array<{
      tournament_id: string;
      team_a_id: string;
      team_b_id: string;
      format: string;
      status: string;
      round: number;
      match_number: number;
      stage: string;
      rules: object;
      playing_xi: object;
      created_by: string;
    }> = [];

    const pool = [...teams];
    if (n % 2 === 1) {
      // Odd number of teams: add a BYE placeholder (we skip BYE matches).
      // In practice we just skip matches involving the padded slot.
    }

    const effectiveTeams: (TeamId | null)[] = n % 2 === 0
      ? ([...pool] as TeamId[])
      : ([...pool, null] as (TeamId | null)[]);

    const rounds = effectiveTeams.length - 1;
    const matchesPerRound = effectiveTeams.length / 2;
    let matchNumber = 1;

    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < matchesPerRound; i++) {
        const home = effectiveTeams[i];
        const away = effectiveTeams[effectiveTeams.length - 1 - i];
        if (!home || !away) continue; // skip BYE slots

        fixtures.push({
          tournament_id: tournamentId,
          team_a_id: home,
          team_b_id: away,
          format: tournament.matchFormat,
          status: "scheduled",
          round: round + 1,
          match_number: matchNumber++,
          stage: "league",
          rules: {},
          playing_xi: {},
          created_by: user.id,
        });
      }
      // Rotate: keep index 0 fixed, rotate positions 1..end.
      const last = effectiveTeams.pop()!;
      effectiveTeams.splice(1, 0, last);
    }

    if (fixtures.length === 0) {
      return { ok: false, error: "Could not compute any fixtures." };
    }

    const { error } = await supabase.from("matches").insert(fixtures);
    if (error) {
      return { ok: false, error: `Failed to insert fixtures: ${error.message}` };
    }
  } else {
    // Knockout bracket.
    const teams = registered.map((t) => t.teamId);
    const n = teams.length;
    // Pad to next power of two.
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
    const seeded: (TeamId | null)[] = [
      ...teams,
      ...Array<null>(bracketSize - n).fill(null),
    ];

    const totalRounds = Math.log2(bracketSize);
    const fixtures: Array<{
      tournament_id: string;
      team_a_id: string;
      team_b_id: string;
      format: string;
      status: string;
      round: number;
      match_number: number;
      stage: string;
      rules: object;
      playing_xi: object;
      created_by: string;
    }> = [];

    let matchNumber = 1;
    let currentRoundTeams = seeded;

    for (let round = 1; round <= totalRounds; round++) {
      const nextRound: (TeamId | null)[] = [];
      for (let i = 0; i < currentRoundTeams.length; i += 2) {
        const home = currentRoundTeams[i] ?? null;
        const away = currentRoundTeams[i + 1] ?? null;

        const stageName =
          round === totalRounds
            ? "final"
            : round === totalRounds - 1
              ? "semi_final"
              : round === totalRounds - 2
                ? "quarter_final"
                : `round_${round}`;

        // For BYE matches (one slot is null): skip — the non-null team advances.
        if (!home || !away) {
          nextRound.push(home ?? away);
          continue;
        }

        fixtures.push({
          tournament_id: tournamentId,
          team_a_id: home,
          team_b_id: away,
          format: tournament.matchFormat,
          status: "scheduled",
          round,
          match_number: matchNumber++,
          stage: stageName,
          rules: {},
          playing_xi: {},
          created_by: user.id,
        });
        nextRound.push(null); // winner TBD
      }
      currentRoundTeams = nextRound;
    }

    if (fixtures.length === 0) {
      return { ok: false, error: "Could not compute any fixtures." };
    }

    const { error } = await supabase.from("matches").insert(fixtures);
    if (error) {
      return { ok: false, error: `Failed to insert fixtures: ${error.message}` };
    }
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

// ─── Compute points table (server action for client-side use) ─────────────────

export interface PointsTableRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  nrr: string; // formatted "+1.234" / "-0.456"
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
}

/**
 * Compute the points table from completed matches in a tournament.
 *
 * Runs per-innings are accumulated from the `innings` table using a lightweight
 * aggregate over `balls` (SUM runs, COUNT legal deliveries). This avoids loading
 * the full ball-by-ball event log just for league standings.
 */
export async function getPointsTableAction(
  tournamentId: string,
): Promise<ActionResult<{ rows: PointsTableRow[] }>> {
  const id = asId<"TournamentId">(tournamentId);

  const supabase = await createClient();

  // Fetch completed matches — plain columns only (no FK join) to keep types clean.
  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, winner_team_id, status")
    .eq("tournament_id", id)
    .in("status", ["completed", "no_result", "abandoned"]);

  if (mErr) return { ok: false, error: mErr.message };

  const completedMatches = matches ?? [];
  if (completedMatches.length === 0) {
    return { ok: true, data: { rows: [] } };
  }

  const matchIds = completedMatches.map((m) => m.id);

  // Collect all unique team ids and fetch their names separately.
  const teamIdSet = new Set<string>();
  for (const m of completedMatches) {
    teamIdSet.add(m.team_a_id);
    teamIdSet.add(m.team_b_id);
  }
  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", [...teamIdSet]);
  const teamNames = new Map<string, string>(
    (teamRows ?? []).map((t) => [t.id, t.name]),
  );

  // Fetch innings for these matches (gives batting/bowling team context).
  const { data: inningsList, error: iErr } = await supabase
    .from("innings")
    .select("id, match_id, batting_team_id, bowling_team_id, is_super_over")
    .in("match_id", matchIds)
    .eq("is_super_over", false);

  if (iErr) return { ok: false, error: iErr.message };

  const inningsIds = (inningsList ?? []).map((i) => i.id);

  // Aggregate runs + legal balls per innings from the balls table.
  // legal ball = delivery that is NOT a wide or no-ball.
  const { data: balls, error: bErr } = await supabase
    .from("balls")
    .select("innings_id, bat_runs, extra_runs, extra_type")
    .in("innings_id", inningsIds);

  if (bErr) return { ok: false, error: bErr.message };

  // Aggregate per innings.
  const inningsStats = new Map<string, { runs: number; legalBalls: number }>();
  for (const ball of balls ?? []) {
    const stats = inningsStats.get(ball.innings_id) ?? { runs: 0, legalBalls: 0 };
    stats.runs += ball.bat_runs + ball.extra_runs;
    if (ball.extra_type !== "wide" && ball.extra_type !== "no_ball") {
      stats.legalBalls += 1;
    }
    inningsStats.set(ball.innings_id, stats);
  }

  // Build per-match, per-team result entries.
  const { computePointsTable } = await import("@/features/tournaments/pointsTable");
  type TR = import("@/features/tournaments/pointsTable").TeamResult;
  const teamResults: TR[] = [];

  for (const match of completedMatches) {
    const matchInnings = (inningsList ?? []).filter(
      (i) => i.match_id === match.id,
    );
    const isNoResult =
      match.status === "no_result" || match.status === "abandoned";

    for (const teamId of [match.team_a_id, match.team_b_id]) {
      const battingInnings = matchInnings.filter(
        (i) => i.batting_team_id === teamId,
      );
      const bowlingInnings = matchInnings.filter(
        (i) => i.bowling_team_id === teamId,
      );

      let runsFor = 0;
      let ballsFaced = 0;
      for (const inn of battingInnings) {
        const s = inningsStats.get(inn.id);
        if (s) { runsFor += s.runs; ballsFaced += s.legalBalls; }
      }

      let runsAgainst = 0;
      let ballsBowled = 0;
      for (const inn of bowlingInnings) {
        const s = inningsStats.get(inn.id);
        if (s) { runsAgainst += s.runs; ballsBowled += s.legalBalls; }
      }

      let result: TR["result"];
      if (isNoResult) {
        result = "no_result";
      } else if (!match.winner_team_id) {
        result = "tie";
      } else if (match.winner_team_id === teamId) {
        result = "win";
      } else {
        result = "loss";
      }

      teamResults.push({ teamId, runsFor, ballsFaced, runsAgainst, ballsBowled, result });
    }
  }

  const table = computePointsTable(teamResults);

  const rows: PointsTableRow[] = table.map((row) => ({
    teamId: row.teamId,
    teamName: teamNames.get(row.teamId) ?? "Unknown",
    played: row.played,
    won: row.won,
    lost: row.lost,
    tied: row.tied,
    noResult: row.noResult,
    points: row.points,
    nrr: formatNrr(row.nrr),
    runsFor: row.runsFor,
    ballsFaced: row.ballsFaced,
    runsAgainst: row.runsAgainst,
    ballsBowled: row.ballsBowled,
  }));

  return { ok: true, data: { rows } };
}

function formatNrr(nrr: number): string {
  if (!isFinite(nrr)) return "0.000";
  const sign = nrr >= 0 ? "+" : "";
  return `${sign}${nrr.toFixed(3)}`;
}
