import "server-only";

import { asId, type PlayerId, type UserId } from "@/domain/shared/ids";
import type {
  BattingStyleEnum,
  BowlingStyleEnum,
  PlayerAchievementRow,
  PlayerRow,
  PlayerRoleEnum,
  PlayerStatisticsRow,
} from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Player repository.
 *
 * Maps `public.players` rows (snake_case) to a camelCase `Player` view model.
 * All id branding via `asId` stays here — callers work with `PlayerId`, never
 * raw strings.
 */

export interface Player {
  id: PlayerId;
  userId: UserId | null;
  displayName: string;
  photoUrl: string | null;
  bio: string | null;
  dominantHand: "right" | "left" | null;
  battingStyle: BattingStyleEnum | null;
  bowlingStyle: BowlingStyleEnum | null;
  playerRole: PlayerRoleEnum | null;
  createdAt: string;
}

export interface PlayerStatistics {
  playerId: PlayerId;
  matches: number;
  inningsBatted: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  highestScore: number;
  notOuts: number;
  fifties: number;
  hundreds: number;
  inningsBowled: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  bestBowling: string | null;
  catches: number;
  stumpings: number;
  runOuts: number;
  updatedAt: string;
}

export interface PlayerAchievement {
  id: string;
  playerId: PlayerId;
  matchId: string | null;
  type: string;
  title: string;
  description: string | null;
  meta: unknown;
  awardedAt: string;
}

export interface CreatePlayerInput {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  dominantHand?: "right" | "left" | null;
  battingStyle?: BattingStyleEnum | null;
  bowlingStyle?: BowlingStyleEnum | null;
  playerRole?: PlayerRoleEnum | null;
}

export interface UpdatePlayerInput {
  displayName?: string;
  photoUrl?: string | null;
  bio?: string | null;
  dominantHand?: "right" | "left" | null;
  battingStyle?: BattingStyleEnum | null;
  bowlingStyle?: BowlingStyleEnum | null;
  playerRole?: PlayerRoleEnum | null;
}

export interface ListPlayersOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: asId<"PlayerId">(row.id),
    userId: row.user_id ? asId<"UserId">(row.user_id) : null,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    bio: row.bio,
    dominantHand: row.dominant_hand,
    battingStyle: row.batting_style,
    bowlingStyle: row.bowling_style,
    playerRole: row.player_role,
    createdAt: row.created_at,
  };
}

function rowToPlayerStatistics(row: PlayerStatisticsRow): PlayerStatistics {
  return {
    playerId: asId<"PlayerId">(row.player_id),
    matches: row.matches,
    inningsBatted: row.innings_batted,
    runs: row.runs,
    ballsFaced: row.balls_faced,
    fours: row.fours,
    sixes: row.sixes,
    highestScore: row.highest_score,
    notOuts: row.not_outs,
    fifties: row.fifties,
    hundreds: row.hundreds,
    inningsBowled: row.innings_bowled,
    ballsBowled: row.balls_bowled,
    runsConceded: row.runs_conceded,
    wickets: row.wickets,
    bestBowling: row.best_bowling,
    catches: row.catches,
    stumpings: row.stumpings,
    runOuts: row.run_outs,
    updatedAt: row.updated_at,
  };
}

function rowToPlayerAchievement(row: PlayerAchievementRow): PlayerAchievement {
  return {
    id: row.id,
    playerId: asId<"PlayerId">(row.player_id),
    matchId: row.match_id,
    type: row.type,
    title: row.title,
    description: row.description,
    meta: row.meta,
    awardedAt: row.awarded_at,
  };
}

/** List players with optional name search and pagination. */
export async function listPlayers(
  opts: ListPlayersOptions = {},
): Promise<Player[]> {
  const supabase = await createClient();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from("players")
    .select("*")
    .order("display_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (opts.search) {
    // ilike gives a case-insensitive prefix/substring search without a full-text index.
    query = query.ilike("display_name", `%${opts.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listPlayers failed: ${error.message}`);
  return (data ?? []).map(rowToPlayer);
}

/** Fetch a single player by their branded PlayerId, or null if not found. */
export async function getPlayer(id: PlayerId): Promise<Player | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getPlayer failed: ${error.message}`);
  return data ? rowToPlayer(data) : null;
}

/** Fetch the player row whose user_id matches the given auth user id. */
export async function getPlayerByUserId(
  userId: string,
): Promise<Player | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`getPlayerByUserId failed: ${error.message}`);
  return data ? rowToPlayer(data) : null;
}

/** Insert a new player row and return the created Player view model. */
export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .insert({
      user_id: input.userId,
      display_name: input.displayName,
      photo_url: input.photoUrl ?? null,
      bio: input.bio ?? null,
      dominant_hand: input.dominantHand ?? null,
      batting_style: input.battingStyle ?? null,
      bowling_style: input.bowlingStyle ?? null,
      player_role: input.playerRole ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `createPlayer failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToPlayer(data);
}

/** Patch an existing player row. Only provided fields are updated. */
export async function updatePlayer(
  id: PlayerId,
  patch: UpdatePlayerInput,
): Promise<Player> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .update({
      ...(patch.displayName !== undefined && {
        display_name: patch.displayName,
      }),
      ...(patch.photoUrl !== undefined && { photo_url: patch.photoUrl }),
      ...(patch.bio !== undefined && { bio: patch.bio }),
      ...(patch.dominantHand !== undefined && {
        dominant_hand: patch.dominantHand,
      }),
      ...(patch.battingStyle !== undefined && {
        batting_style: patch.battingStyle,
      }),
      ...(patch.bowlingStyle !== undefined && {
        bowling_style: patch.bowlingStyle,
      }),
      ...(patch.playerRole !== undefined && { player_role: patch.playerRole }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `updatePlayer failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToPlayer(data);
}

/**
 * Find the player row for the given auth user, or create one from their
 * profile if none exists yet. This is the canonical entrypoint for "my player
 * profile" flows.
 */
export async function getOrCreateMyPlayer(user: User): Promise<Player> {
  const existing = await getPlayerByUserId(user.id);
  if (existing) return existing;

  // Derive a display name from the user's auth metadata or email.
  const meta = user.user_metadata as
    | { full_name?: string; display_name?: string }
    | undefined;
  const displayName =
    meta?.display_name ??
    meta?.full_name ??
    (user.email ? user.email.split("@")[0] : "Cricketer");

  return createPlayer({ userId: user.id, displayName: displayName ?? "Cricketer" });
}

/**
 * Fetch career statistics for a player from `public.player_statistics`.
 * Returns null if the player has no statistics row (no balls recorded yet).
 */
export async function getPlayerStatistics(
  playerId: PlayerId,
): Promise<PlayerStatistics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_statistics")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error(`getPlayerStatistics failed: ${error.message}`);
  return data ? rowToPlayerStatistics(data) : null;
}

/**
 * Fetch all achievements for a player, ordered newest first.
 */
export async function getPlayerAchievements(
  playerId: PlayerId,
): Promise<PlayerAchievement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_achievements")
    .select("*")
    .eq("player_id", playerId)
    .order("awarded_at", { ascending: false });

  if (error) throw new Error(`getPlayerAchievements failed: ${error.message}`);
  return (data ?? []).map(rowToPlayerAchievement);
}
