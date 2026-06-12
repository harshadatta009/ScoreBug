"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { asId, type TeamId } from "@/domain/shared/ids";
import { requireUser } from "@/lib/auth/session";
import {
  createTeam,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  setMemberRole,
  createJoinRequest,
  respondToJoinRequest,
  getTeam,
  isTeamManager,
} from "@/lib/repositories/teamRepository";
import type { TeamMemberRole } from "@/lib/supabase/database.types";

/**
 * Team server actions.
 *
 * AUTHORIZATION CONTRACT:
 * - Creation: any authenticated user (requireUser only).
 * - Mutation: re-fetch resource server-side and verify ownership.
 * - RLS is the final backstop; we check here first for clean error messages.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Invalid ID format");

const teamFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  shortName: z.string().max(6).nullish(),
  city: z.string().max(80).nullish(),
  country: z.string().max(80).nullish(),
  description: z.string().max(1000).nullish(),
  logoUrl: z.string().url("Must be a valid URL").nullish(),
  bannerUrl: z.string().url("Must be a valid URL").nullish(),
  foundedYear: z.number().int().min(1800).max(2100).nullish(),
});

const teamMemberRoles: [TeamMemberRole, ...TeamMemberRole[]] = [
  "owner",
  "captain",
  "vice_captain",
  "manager",
  "player",
];

// ─── Team CRUD ────────────────────────────────────────────────────────────────

/**
 * Create a team.
 * Any authenticated user can create a team — the creator becomes the owner.
 * After creating the team row, we insert an ownership team_members row.
 */
export async function createTeamAction(
  input: z.input<typeof teamFormSchema>,
): Promise<ActionResult<{ teamId: string }>> {
  const user = await requireUser();

  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const ownerId = asId<"UserId">(user.id);

  try {
    const teamId = await createTeam(
      {
        name: parsed.data.name,
        shortName: parsed.data.shortName,
        city: parsed.data.city,
        country: parsed.data.country,
        description: parsed.data.description,
        logoUrl: parsed.data.logoUrl,
        bannerUrl: parsed.data.bannerUrl,
        foundedYear: parsed.data.foundedYear,
      },
      ownerId,
    );

    // Ensure the creator has an accepted team_members row with role 'owner'
    // so membership queries include the owner without special-casing owner_id.
    await addMember(teamId, ownerId, "owner");

    revalidatePath("/teams");
    return { ok: true, data: { teamId: teamId as string } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Update team metadata.
 * Caller must be the team owner or have is_team_admin membership.
 */
export async function updateTeamAction(
  teamId: string,
  input: z.input<typeof teamFormSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const tid = asId<"TeamId">(teamId);
  const team = await getTeam(tid);
  if (!team) return { ok: false, error: "Team not found." };

  const isOwner = team.ownerId === user.id;
  const isManager = !isOwner && (await isTeamManager(tid, asId<"UserId">(user.id)));

  if (!isOwner && !isManager) {
    return { ok: false, error: "You do not have permission to edit this team." };
  }

  try {
    await updateTeam(tid, {
      name: parsed.data.name,
      shortName: parsed.data.shortName ?? null,
      city: parsed.data.city ?? null,
      country: parsed.data.country ?? null,
      description: parsed.data.description ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
      bannerUrl: parsed.data.bannerUrl ?? null,
      foundedYear: parsed.data.foundedYear ?? null,
    });

    revalidatePath(`/teams/${teamId}`);
    revalidatePath("/teams");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Delete a team.
 * Only the team owner may delete.
 */
export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  const user = await requireUser();

  const tid = asId<"TeamId">(teamId);
  const team = await getTeam(tid);
  if (!team) return { ok: false, error: "Team not found." };
  if (team.ownerId !== user.id) {
    return { ok: false, error: "Only the team owner may delete this team." };
  }

  try {
    await deleteTeam(tid);
    revalidatePath("/teams");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Member management ────────────────────────────────────────────────────────

const addMemberSchema = z.object({
  teamId: uuid,
  userId: uuid,
  teamRole: z.enum(teamMemberRoles),
  jerseyNumber: z.number().int().min(0).max(999).nullish(),
});

/** Add a member to a team. Caller must be owner or manager. */
export async function addMemberAction(
  input: z.input<typeof addMemberSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const tid = asId<"TeamId">(parsed.data.teamId);
  if (!(await _verifyManagerAccess(tid, user.id))) {
    return { ok: false, error: "You must be an owner or manager to add members." };
  }

  try {
    await addMember(
      tid,
      asId<"UserId">(parsed.data.userId),
      parsed.data.teamRole,
      parsed.data.jerseyNumber ?? null,
    );
    revalidatePath(`/teams/${parsed.data.teamId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Remove a member. Caller must be owner or manager. */
export async function removeMemberAction(
  teamId: string,
  memberId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const tid = asId<"TeamId">(teamId);
  if (!(await _verifyManagerAccess(tid, user.id))) {
    return { ok: false, error: "You must be an owner or manager to remove members." };
  }

  try {
    await removeMember(memberId);
    revalidatePath(`/teams/${teamId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Change a member's role. Caller must be owner or manager. */
export async function setMemberRoleAction(
  teamId: string,
  memberId: string,
  teamRole: TeamMemberRole,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!teamMemberRoles.includes(teamRole)) {
    return { ok: false, error: "Invalid team role." };
  }

  const tid = asId<"TeamId">(teamId);
  if (!(await _verifyManagerAccess(tid, user.id))) {
    return { ok: false, error: "You must be an owner or manager to change roles." };
  }

  try {
    await setMemberRole(memberId, teamRole);
    revalidatePath(`/teams/${teamId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Join requests ────────────────────────────────────────────────────────────

const joinRequestSchema = z.object({
  teamId: uuid,
  message: z.string().max(500).nullish(),
});

/** Any signed-in user can request to join a team. */
export async function requestToJoinAction(
  input: z.input<typeof joinRequestSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = joinRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  try {
    await createJoinRequest(
      asId<"TeamId">(parsed.data.teamId),
      asId<"UserId">(user.id),
      parsed.data.message ?? null,
    );
    revalidatePath(`/teams/${parsed.data.teamId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Accept or decline a join request. Caller must be owner or manager. */
export async function respondToJoinRequestAction(
  teamId: string,
  requestId: string,
  accept: boolean,
): Promise<ActionResult> {
  const user = await requireUser();

  const tid = asId<"TeamId">(teamId);
  if (!(await _verifyManagerAccess(tid, user.id))) {
    return { ok: false, error: "You must be an owner or manager to respond to join requests." };
  }

  try {
    await respondToJoinRequest(requestId, tid, accept);
    revalidatePath(`/teams/${teamId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when the user is the team owner OR an accepted manager/owner
 * via team_members. Centralises the auth check for mutation actions.
 */
async function _verifyManagerAccess(
  teamId: TeamId,
  userId: string,
): Promise<boolean> {
  const uid = asId<"UserId">(userId);
  const team = await getTeam(teamId);
  if (!team) return false;
  if (team.ownerId === userId) return true;
  return isTeamManager(teamId, uid);
}
