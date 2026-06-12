"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { recomputeStatsForMatch } from "@/server/actions/stats";

/**
 * TanStack Query keys + hooks for the stats feature.
 *
 * Keys live INSIDE the feature folder (not the shared queryKeys factory) so the
 * statistics vertical can evolve its cache shape without colliding with other
 * verticals. The `kind` discriminator partitions the four leaderboards.
 */
export const statsKeys = {
  all: ["stats"] as const,
  leaderboards: () => [...statsKeys.all, "leaderboard"] as const,
  leaderboard: (kind: "batting" | "bowling" | "fielding" | "mvp") =>
    [...statsKeys.leaderboards(), kind] as const,
  player: (playerId: string) => [...statsKeys.all, "player", playerId] as const,
  match: (matchId: string) => [...statsKeys.all, "match", matchId] as const,
} as const;

/**
 * Trigger a server-side recompute of every participant's statistics for a
 * match, then invalidate the leaderboard caches so they refetch. The server
 * action revalidates the RSC routes; this also nudges any client queries.
 */
export function useRecomputeMatchStats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => recomputeStatsForMatch(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statsKeys.leaderboards() });
    },
  });
}
