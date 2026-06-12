"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  createPlayer,
  getOrCreateMyPlayer,
  getPlayerByUserId,
  updatePlayer,
} from "@/lib/repositories/playerRepository";
import { asId } from "@/domain/shared/ids";

/**
 * Player server actions.
 *
 * Authorization model (per spec):
 * - CREATION requires only `requireUser()`; new users have no global roles.
 * - MUTATION re-fetches the row server-side and verifies `players.user_id === user.id`.
 * - Enum values are validated with zod, keeping the payload honest.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ─── Zod schemas ────────────────────────────────────────────────────────────

const battingStyleEnum = z.enum(["right_hand", "left_hand"]);
const bowlingStyleEnum = z.enum([
  "right_arm_fast",
  "right_arm_medium",
  "right_arm_offbreak",
  "right_arm_legbreak",
  "left_arm_fast",
  "left_arm_medium",
  "left_arm_orthodox",
  "left_arm_chinaman",
]);
const playerRoleEnum = z.enum([
  "batter",
  "bowler",
  "all_rounder",
  "wicket_keeper",
  "wk_batter",
]);
const dominantHandEnum = z.enum(["right", "left"]);

const createPlayerSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(60),
  bio: z.string().max(500).nullish(),
  dominantHand: dominantHandEnum.nullish(),
  battingStyle: battingStyleEnum.nullish(),
  bowlingStyle: bowlingStyleEnum.nullish(),
  playerRole: playerRoleEnum.nullish(),
});

const updatePlayerSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(60),
  bio: z.string().max(500).nullish(),
  dominantHand: dominantHandEnum.nullish(),
  battingStyle: battingStyleEnum.nullish(),
  bowlingStyle: bowlingStyleEnum.nullish(),
  playerRole: playerRoleEnum.nullish(),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Create (or retrieve) the player profile for the signed-in user.
 *
 * Idempotent: if the user already has a player row, returns it unchanged.
 * This is intentional — the UI can call this on first visit without risk of
 * duplicates.
 */
export async function createMyPlayerProfile(
  input: z.input<typeof createPlayerSchema>,
): Promise<ActionResult<{ playerId: string }>> {
  const user = await requireUser();

  // Idempotency: if they already have a player row, return it.
  const existing = await getPlayerByUserId(user.id);
  if (existing) {
    return { ok: true, data: { playerId: existing.id } };
  }

  const parsed = createPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  try {
    const player = await createPlayer({
      userId: user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      dominantHand: parsed.data.dominantHand ?? null,
      battingStyle: parsed.data.battingStyle ?? null,
      bowlingStyle: parsed.data.bowlingStyle ?? null,
      playerRole: parsed.data.playerRole ?? null,
    });

    revalidatePath("/players");
    return { ok: true, data: { playerId: player.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Update the signed-in user's own player profile.
 *
 * Ownership is verified server-side: `players.user_id` must match the
 * authenticated user's id. The DB's RLS is the final backstop.
 */
export async function updateMyPlayerProfile(
  playerId: string,
  input: z.input<typeof updatePlayerSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  // Ownership check: re-fetch the row and verify before mutating.
  const existing = await getPlayerByUserId(user.id);
  if (!existing || existing.id !== playerId) {
    return { ok: false, error: "You can only edit your own player profile." };
  }

  const parsed = updatePlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  try {
    await updatePlayer(asId<"PlayerId">(playerId), {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      dominantHand: parsed.data.dominantHand ?? null,
      battingStyle: parsed.data.battingStyle ?? null,
      bowlingStyle: parsed.data.bowlingStyle ?? null,
      playerRole: parsed.data.playerRole ?? null,
    });

    revalidatePath(`/players/${playerId}`);
    revalidatePath(`/players/${playerId}/edit`);
    revalidatePath("/players");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Ensure the signed-in user has a player row (create one from their auth
 * profile if not). Used by the profile page to lazily provision a player.
 */
export async function ensureMyPlayerProfile(): Promise<
  ActionResult<{ playerId: string }>
> {
  const user = await requireUser();

  try {
    const player = await getOrCreateMyPlayer(user);
    revalidatePath("/players");
    return { ok: true, data: { playerId: player.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
