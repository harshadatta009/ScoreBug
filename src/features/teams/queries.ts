"use client";

/**
 * TanStack Query keys for the Teams feature.
 *
 * Defined here (not in src/lib/query/queryKeys.ts) so the Teams vertical owns
 * its own cache namespace and changes here cannot break unrelated features.
 */
export const teamKeys = {
  all: ["teams"] as const,
  lists: () => [...teamKeys.all, "list"] as const,
  myTeams: (userId: string) => [...teamKeys.all, "mine", userId] as const,
  browse: (search?: string) => [...teamKeys.lists(), { search }] as const,
  detail: (teamId: string) => [...teamKeys.all, "detail", teamId] as const,
  members: (teamId: string) => [...teamKeys.all, "members", teamId] as const,
  joinRequests: (teamId: string) =>
    [...teamKeys.all, "joinRequests", teamId] as const,
  stats: (teamId: string) => [...teamKeys.all, "stats", teamId] as const,
};
