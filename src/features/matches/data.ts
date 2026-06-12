import "server-only";

import { asId, type TeamId, type UserId } from "@/domain/shared/ids";
import { createClient } from "@/lib/supabase/server";

import type { TeamOption } from "./components/TeamPicker";

/** Teams selectable when creating a match (id + name + short name). */
export async function listTeamOptions(): Promise<TeamOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, short_name")
    .order("name", { ascending: true });

  if (error) throw new Error(`listTeamOptions failed: ${error.message}`);
  return (data ?? []).map((t) => ({
    id: asId<"TeamId">(t.id),
    name: t.name,
    shortName: t.short_name,
  }));
}

/**
 * Server-only data helpers for the matches vertical that don't belong to a
 * shared repository — chiefly resolving a team's squad (its active accepted
 * `team_members` joined to `users`) for the playing-XI selector.
 */

export interface SquadMember {
  userId: UserId;
  displayName: string;
  teamRole: string;
  jerseyNumber: number | null;
}

/** Active, accepted members of a team with their display names. */
export async function getTeamSquad(teamId: TeamId): Promise<SquadMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("user_id, team_role, jersey_number, is_active, invite_status")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .eq("invite_status", "accepted");

  if (error) throw new Error(`getTeamSquad failed: ${error.message}`);

  const rows = data ?? [];
  const userIds = rows.map((r) => r.user_id);
  if (userIds.length === 0) return [];

  const { data: users, error: userErr } = await supabase
    .from("users")
    .select("id, display_name, full_name")
    .in("id", userIds);

  if (userErr) throw new Error(`getTeamSquad users failed: ${userErr.message}`);

  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.display_name ?? u.full_name ?? "Player"]),
  );

  return rows.map((r) => ({
    userId: asId<"UserId">(r.user_id),
    displayName: nameById.get(r.user_id) ?? "Player",
    teamRole: r.team_role,
    jerseyNumber: r.jersey_number,
  }));
}
