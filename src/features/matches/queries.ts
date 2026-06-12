"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { MatchId } from "@/domain/shared/ids";
import {
  completeMatch,
  setMatchPlayingXI,
  setMatchToss,
  startMatch,
} from "@/server/actions/match";

/**
 * TanStack Query keys + mutation hooks for the matches vertical.
 *
 * Keys are defined here (NOT in the shared queryKeys factory) so this feature
 * owns its cache namespace and can't collide with other verticals. Mutations
 * wrap the server actions and invalidate the relevant detail/list queries so
 * the UI re-reads the server-authoritative state after a lifecycle change.
 */
export const matchKeys = {
  all: ["matches"] as const,
  lists: () => [...matchKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...matchKeys.lists(), filters ?? {}] as const,
  detail: (matchId: MatchId) => [...matchKeys.all, "detail", matchId] as const,
  setup: (matchId: MatchId) => [...matchKeys.all, "setup", matchId] as const,
};

/** Record the toss outcome. */
export function useSetTossMutation(matchId: MatchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setMatchToss,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
    },
  });
}

/** Persist the finalized playing XIs. */
export function useSetPlayingXIMutation(matchId: MatchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setMatchPlayingXI,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
    },
  });
}

/** Start play (creates the first innings, flips status). */
export function useStartMatchMutation(matchId: MatchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startMatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
      void qc.invalidateQueries({ queryKey: matchKeys.lists() });
    },
  });
}

/** Compute + persist the final result. */
export function useCompleteMatchMutation(matchId: MatchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: completeMatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.detail(matchId) });
      void qc.invalidateQueries({ queryKey: matchKeys.lists() });
    },
  });
}
