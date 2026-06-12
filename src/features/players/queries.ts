"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { Player, PlayerAchievement, PlayerStatistics } from "@/lib/repositories/playerRepository";
import type { PlayerRow, PlayerStatisticsRow, PlayerAchievementRow } from "@/lib/supabase/database.types";
import { asId } from "@/domain/shared/ids";

/**
 * TanStack Query keys for the players feature.
 * Defined here (not in the shared queryKeys.ts) to avoid cross-feature coupling.
 */
export const playerKeys = {
  all: ["players"] as const,
  lists: () => [...playerKeys.all, "list"] as const,
  list: (search: string) => [...playerKeys.lists(), { search }] as const,
  details: () => [...playerKeys.all, "detail"] as const,
  detail: (id: string) => [...playerKeys.details(), id] as const,
  statistics: (id: string) => [...playerKeys.all, "statistics", id] as const,
  achievements: (id: string) => [...playerKeys.all, "achievements", id] as const,
  byUserId: (userId: string) => [...playerKeys.all, "byUser", userId] as const,
} as const;

// ─── Row → view model helpers (client-side mirror of repository mappers) ─────

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

function rowToStatistics(row: PlayerStatisticsRow): PlayerStatistics {
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

function rowToAchievement(row: PlayerAchievementRow): PlayerAchievement {
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

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Searchable list of players for the directory page. */
export function usePlayers(search = ""): UseQueryResult<Player[]> {
  const supabase = createClient();
  return useQuery({
    queryKey: playerKeys.list(search),
    queryFn: async () => {
      let query = supabase
        .from("players")
        .select("*")
        .order("display_name", { ascending: true })
        .limit(100);

      if (search.trim()) {
        query = query.ilike("display_name", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(rowToPlayer);
    },
    staleTime: 30_000,
  });
}

/** Single player profile. */
export function usePlayer(playerId: string): UseQueryResult<Player | null> {
  const supabase = createClient();
  return useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? rowToPlayer(data) : null;
    },
    enabled: !!playerId,
    staleTime: 60_000,
  });
}

/** Career statistics for a player. */
export function usePlayerStatistics(
  playerId: string,
): UseQueryResult<PlayerStatistics | null> {
  const supabase = createClient();
  return useQuery({
    queryKey: playerKeys.statistics(playerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_statistics")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? rowToStatistics(data) : null;
    },
    enabled: !!playerId,
    staleTime: 60_000,
  });
}

/** Achievements for a player, newest first. */
export function usePlayerAchievements(
  playerId: string,
): UseQueryResult<PlayerAchievement[]> {
  const supabase = createClient();
  return useQuery({
    queryKey: playerKeys.achievements(playerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_achievements")
        .select("*")
        .eq("player_id", playerId)
        .order("awarded_at", { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []).map(rowToAchievement);
    },
    enabled: !!playerId,
    staleTime: 120_000,
  });
}

/** Look up the player row for a given auth user id. */
export function usePlayerByUserId(
  userId: string | null | undefined,
): UseQueryResult<Player | null> {
  const supabase = createClient();
  return useQuery({
    queryKey: playerKeys.byUserId(userId ?? ""),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? rowToPlayer(data) : null;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
