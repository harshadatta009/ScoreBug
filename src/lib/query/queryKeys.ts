import type {
  InningsId,
  MatchId,
  TeamId,
  TournamentId,
  UserId,
} from "@/domain/shared/ids";

/**
 * Centralized TanStack Query keys.
 *
 * A single factory keeps cache keys consistent and makes invalidation precise:
 * e.g. invalidating `queryKeys.matches.all` clears every match query, while
 * `queryKeys.balls.list(inningsId)` targets exactly one innings' deliveries.
 * Keys are `as const` tuples so TypeScript can narrow them at call sites.
 */
export const queryKeys = {
  auth: {
    user: ["auth", "user"] as const,
    roles: (userId: UserId) => ["auth", "roles", userId] as const,
  },

  matches: {
    all: ["matches"] as const,
    lists: () => [...queryKeys.matches.all, "list"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.matches.lists(), filters ?? {}] as const,
    detail: (matchId: MatchId) =>
      [...queryKeys.matches.all, "detail", matchId] as const,
  },

  innings: {
    all: ["innings"] as const,
    byMatch: (matchId: MatchId) =>
      [...queryKeys.innings.all, "match", matchId] as const,
    detail: (inningsId: InningsId) =>
      [...queryKeys.innings.all, "detail", inningsId] as const,
    score: (inningsId: InningsId) =>
      [...queryKeys.innings.all, "score", inningsId] as const,
  },

  balls: {
    all: ["balls"] as const,
    list: (inningsId: InningsId) =>
      [...queryKeys.balls.all, "list", inningsId] as const,
  },

  teams: {
    all: ["teams"] as const,
    detail: (teamId: TeamId) =>
      [...queryKeys.teams.all, "detail", teamId] as const,
    members: (teamId: TeamId) =>
      [...queryKeys.teams.all, "members", teamId] as const,
  },

  tournaments: {
    all: ["tournaments"] as const,
    detail: (tournamentId: TournamentId) =>
      [...queryKeys.tournaments.all, "detail", tournamentId] as const,
  },
} as const;
