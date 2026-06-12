import "server-only";

import { asId, type TeamId, type UserId } from "@/domain/shared/ids";
import type {
  TeamRow,
  TeamMemberRow,
  TeamMemberRole,
  JoinRequestRow,
  TeamStatisticsRow,
  UserRow,
} from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Team repository.
 *
 * Exposes lean camelCase view models rather than raw DB rows so callers
 * in server actions and RSC pages are insulated from schema column names.
 * All mutation helpers validate inputs at the action layer; here we only
 * map and fetch.
 */

// ─── View models ─────────────────────────────────────────────────────────────

export interface Team {
  id: TeamId;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  /** Extended fields exposed for team profile pages. */
  bannerUrl: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  foundedYear: number | null;
  ownerId: UserId;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  teamId: TeamId;
  userId: UserId;
  teamRole: TeamMemberRole;
  jerseyNumber: number | null;
  isActive: boolean;
  inviteStatus: TeamMemberRow["invite_status"];
  joinedAt: string;
  /** Denormalized from users join — may be null when user row is missing. */
  displayName: string | null;
  avatarUrl: string | null;
  fullName: string | null;
}

export interface JoinRequest {
  id: string;
  teamId: TeamId;
  userId: UserId;
  status: JoinRequestRow["status"];
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Denormalized from users. */
  displayName: string | null;
  avatarUrl: string | null;
}

export interface TeamStatistics {
  teamId: TeamId;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  noResults: number;
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
  updatedAt: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function rowToTeam(row: TeamRow): Team {
  return {
    id: asId<"TeamId">(row.id),
    name: row.name,
    shortName: row.short_name,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    description: row.description,
    country: row.country,
    city: row.city,
    foundedYear: row.founded_year,
    ownerId: asId<"UserId">(row.owner_id),
    createdAt: row.created_at,
  };
}

function rowToMember(
  row: TeamMemberRow,
  user: Pick<UserRow, "display_name" | "avatar_url" | "full_name"> | null,
): TeamMember {
  return {
    id: row.id,
    teamId: asId<"TeamId">(row.team_id),
    userId: asId<"UserId">(row.user_id),
    teamRole: row.team_role,
    jerseyNumber: row.jersey_number,
    isActive: row.is_active,
    inviteStatus: row.invite_status,
    joinedAt: row.joined_at,
    displayName: user?.display_name ?? null,
    avatarUrl: user?.avatar_url ?? null,
    fullName: user?.full_name ?? null,
  };
}

function rowToStats(row: TeamStatisticsRow): TeamStatistics {
  return {
    teamId: asId<"TeamId">(row.team_id),
    matches: row.matches,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    noResults: row.no_results,
    runsFor: row.runs_for,
    ballsFaced: row.balls_faced,
    runsAgainst: row.runs_against,
    ballsBowled: row.balls_bowled,
    updatedAt: row.updated_at,
  };
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** Fetch one team by id, or null. */
export async function getTeam(teamId: TeamId): Promise<Team | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw new Error(`getTeam failed: ${error.message}`);
  return data ? rowToTeam(data) : null;
}

/** Fetch several teams by id, returned in the same order as requested. */
export async function getTeamsByIds(ids: readonly TeamId[]): Promise<Team[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .in("id", [...ids]);

  if (error) throw new Error(`getTeamsByIds failed: ${error.message}`);

  const byId = new Map((data ?? []).map((r) => [r.id, rowToTeam(r)]));
  return ids
    .map((id) => byId.get(id))
    .filter((t): t is Team => t !== undefined);
}

/** Browse all teams — for the public "all teams" list. Ordered by name. */
export async function listTeams(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Team[]> {
  const supabase = await createClient();
  let query = supabase.from("teams").select("*").order("name");

  if (opts?.search) {
    query = query.ilike("name", `%${opts.search}%`);
  }
  if (opts?.limit !== undefined) {
    query = query.limit(opts.limit);
  }
  if (opts?.offset !== undefined) {
    query = query.range(opts.offset, (opts.offset ?? 0) + (opts.limit ?? 20) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listTeams failed: ${error.message}`);
  return (data ?? []).map(rowToTeam);
}

/**
 * Teams that the user owns OR is an accepted member of.
 * Used for the "My Teams" dashboard section.
 */
export async function listMyTeams(userId: UserId): Promise<Team[]> {
  const supabase = await createClient();

  // Two queries to avoid a complex OR across joined tables:
  // 1. teams the user owns directly
  // 2. teams via accepted team_members rows
  const [ownedRes, memberRes] = await Promise.all([
    supabase.from("teams").select("*").eq("owner_id", userId),
    supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .eq("invite_status", "accepted"),
  ]);

  if (ownedRes.error) throw new Error(`listMyTeams(owned) failed: ${ownedRes.error.message}`);
  if (memberRes.error) throw new Error(`listMyTeams(member) failed: ${memberRes.error.message}`);

  const ownedTeams = (ownedRes.data ?? []).map(rowToTeam);
  const memberTeamIds = (memberRes.data ?? []).map((r) => r.team_id);

  // Fetch member teams if any, then merge deduplicating by id.
  const seen = new Set(ownedTeams.map((t) => t.id as string));
  let memberTeams: Team[] = [];

  if (memberTeamIds.length > 0) {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .in("id", memberTeamIds);
    if (error) throw new Error(`listMyTeams(memberTeams) failed: ${error.message}`);
    memberTeams = (data ?? [])
      .filter((r) => !seen.has(r.id))
      .map(rowToTeam);
  }

  return [...ownedTeams, ...memberTeams].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Create a team row and return its id. Ownership insertion is handled in the action. */
export async function createTeam(
  input: {
    name: string;
    shortName?: string | null;
    city?: string | null;
    country?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    foundedYear?: number | null;
  },
  ownerId: UserId,
): Promise<TeamId> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: input.name,
      short_name: input.shortName ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      description: input.description ?? null,
      logo_url: input.logoUrl ?? null,
      banner_url: input.bannerUrl ?? null,
      founded_year: input.foundedYear ?? null,
      owner_id: ownerId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createTeam failed: ${error?.message ?? "no row returned"}`);
  }
  return asId<"TeamId">(data.id);
}

/** Update allowed fields on a team. */
export async function updateTeam(
  teamId: TeamId,
  patch: Partial<{
    name: string;
    shortName: string | null;
    city: string | null;
    country: string | null;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    foundedYear: number | null;
  }>,
): Promise<void> {
  const supabase = await createClient();

  // Build a typed partial row to satisfy Supabase's strict generic update type.
  const update: Partial<TeamRow> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.shortName !== undefined) update.short_name = patch.shortName;
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.country !== undefined) update.country = patch.country;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  if (patch.bannerUrl !== undefined) update.banner_url = patch.bannerUrl;
  if (patch.foundedYear !== undefined) update.founded_year = patch.foundedYear;

  const { error } = await supabase
    .from("teams")
    .update(update)
    .eq("id", teamId);

  if (error) throw new Error(`updateTeam failed: ${error.message}`);
}

/** Delete a team by id. Cascades via RLS/FK. */
export async function deleteTeam(teamId: TeamId): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw new Error(`deleteTeam failed: ${error.message}`);
}

// ─── Members ─────────────────────────────────────────────────────────────────

/**
 * Get all accepted members of a team, joined with user display data.
 * Two-query approach avoids needing an explicit FK foreign-key hint on
 * team_members.user_id → users.id (which may not be reflected in PostgREST
 * schema cache if using the anon client).
 */
export async function getTeamMembers(teamId: TeamId): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("team_id", teamId)
    .eq("invite_status", "accepted")
    .order("joined_at");

  if (error) throw new Error(`getTeamMembers failed: ${error.message}`);
  if (!members || members.length === 0) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, avatar_url, full_name")
    .in("id", userIds);

  if (usersError) throw new Error(`getTeamMembers(users) failed: ${usersError.message}`);

  const userMap = new Map(
    (users ?? []).map((u) => [
      u.id,
      { display_name: u.display_name, avatar_url: u.avatar_url, full_name: u.full_name },
    ]),
  );

  return members.map((m) => rowToMember(m, userMap.get(m.user_id) ?? null));
}

/** Add a user as a member of a team. */
export async function addMember(
  teamId: TeamId,
  userId: UserId,
  teamRole: TeamMemberRole,
  jerseyNumber?: number | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: userId,
    team_role: teamRole,
    role: "player",
    jersey_number: jerseyNumber ?? null,
    invite_status: "accepted",
    is_active: true,
  });
  if (error) throw new Error(`addMember failed: ${error.message}`);
}

/** Remove a member row by its own id. */
export async function removeMember(memberId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", memberId);
  if (error) throw new Error(`removeMember failed: ${error.message}`);
}

/** Change the team_role of an existing member. */
export async function setMemberRole(
  memberId: string,
  teamRole: TeamMemberRole,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .update({ team_role: teamRole })
    .eq("id", memberId);
  if (error) throw new Error(`setMemberRole failed: ${error.message}`);
}

/** Check whether a user is an accepted member with a managing role. */
export async function isTeamManager(
  teamId: TeamId,
  userId: UserId,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("team_role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("invite_status", "accepted")
    .in("team_role", ["owner", "manager"])
    .maybeSingle();

  if (error) throw new Error(`isTeamManager failed: ${error.message}`);
  return data !== null;
}

// ─── Join requests ────────────────────────────────────────────────────────────

/** Submit a join request from a user. Idempotent against duplicate pending requests. */
export async function createJoinRequest(
  teamId: TeamId,
  userId: UserId,
  message?: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("join_requests").insert({
    team_id: teamId,
    user_id: userId,
    message: message ?? null,
    status: "pending",
  });
  if (error) throw new Error(`createJoinRequest failed: ${error.message}`);
}

/** List pending join requests for a team, with requester display info. */
export async function listJoinRequests(teamId: TeamId): Promise<JoinRequest[]> {
  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("join_requests")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at");

  if (error) throw new Error(`listJoinRequests failed: ${error.message}`);
  if (!requests || requests.length === 0) return [];

  const userIds = [...new Set(requests.map((r) => r.user_id))];
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  if (usersError) throw new Error(`listJoinRequests(users) failed: ${usersError.message}`);

  const userMap = new Map(
    (users ?? []).map((u) => [u.id, { display_name: u.display_name, avatar_url: u.avatar_url }]),
  );

  return requests.map((r) => {
    const u = userMap.get(r.user_id) ?? null;
    return {
      id: r.id,
      teamId: asId<"TeamId">(r.team_id),
      userId: asId<"UserId">(r.user_id),
      status: r.status,
      message: r.message,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      displayName: u?.display_name ?? null,
      avatarUrl: u?.avatar_url ?? null,
    };
  });
}

/**
 * Accept or decline a join request.
 * On accept, also creates the team_members row.
 */
export async function respondToJoinRequest(
  requestId: string,
  teamId: TeamId,
  accept: boolean,
): Promise<void> {
  const supabase = await createClient();

  // Fetch the request to get the user_id for membership creation.
  const { data: req, error: fetchErr } = await supabase
    .from("join_requests")
    .select("user_id")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) {
    throw new Error(`respondToJoinRequest: request not found — ${fetchErr?.message}`);
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("join_requests")
    .update({ status: accept ? "accepted" : "declined", decided_at: now })
    .eq("id", requestId);

  if (updateErr) throw new Error(`respondToJoinRequest(update) failed: ${updateErr.message}`);

  if (accept) {
    await addMember(teamId, asId<"UserId">(req.user_id), "player");
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

/** Fetch aggregated team statistics from the materialized view / table. */
export async function getTeamStatistics(
  teamId: TeamId,
): Promise<TeamStatistics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_statistics")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) throw new Error(`getTeamStatistics failed: ${error.message}`);
  return data ? rowToStats(data) : null;
}
