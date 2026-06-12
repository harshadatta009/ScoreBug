"use client";

import { useEffect } from "react";

import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";

import type { BallEvent } from "@/domain/cricket/ball";
import type { InningsId } from "@/domain/shared/ids";
import { rowToBallEvent } from "@/lib/repositories/ballRepository";
import { createClient } from "@/lib/supabase/client";
import type { BallRow, InningsRow } from "@/lib/supabase/database.types";

/**
 * Subscribe to live changes for one innings.
 *
 * Postgres Changes stream INSERT/UPDATE/DELETE on `public.balls` (and innings
 * completion) for the given innings. On every ball change we hand the *full*
 * refreshed ball log to `onBalls` rather than diffing — the scoring engine is a
 * pure fold over the ordered sequence, so reconciling the whole log is both
 * simpler and immune to out-of-order realtime events.
 *
 * The hook owns the channel lifecycle: it (re)subscribes when `inningsId`
 * changes and tears down on unmount to avoid leaking realtime connections.
 */
export interface UseSupabaseRealtimeOptions {
  inningsId: InningsId | null;
  /** Called with the authoritative, sequence-ordered ball list after a change. */
  onBalls?: (balls: BallEvent[]) => void;
  /** Called when the innings row updates (e.g. is_complete flips true). */
  onInningsChange?: (innings: InningsRow) => void;
  /** Disable subscription without unmounting the component. */
  enabled?: boolean;
}

export function useSupabaseRealtime({
  inningsId,
  onBalls,
  onInningsChange,
  enabled = true,
}: UseSupabaseRealtimeOptions): void {
  useEffect(() => {
    if (!enabled || !inningsId) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    /** Refetch the entire ordered ball log and push it upstream. */
    async function refreshBalls() {
      if (!onBalls) return;
      const { data, error } = await supabase
        .from("balls")
        .select("*")
        .eq("innings_id", inningsId as string)
        .order("sequence", { ascending: true });
      if (error || cancelled || !data) return;
      onBalls(data.map(rowToBallEvent));
    }

    channel = supabase
      .channel(`innings:${inningsId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "balls",
          filter: `innings_id=eq.${inningsId}`,
        },
        () => {
          // Any ball mutation -> re-derive from the full authoritative log.
          void refreshBalls();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "innings",
          filter: `id=eq.${inningsId}`,
        },
        (payload: RealtimePostgresChangesPayload<InningsRow>) => {
          if (onInningsChange && payload.new && "id" in payload.new) {
            onInningsChange(payload.new);
          }
        },
      )
      .subscribe();

    // Prime with the current state so late subscribers aren't blank until the
    // next delivery arrives.
    void refreshBalls();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // We intentionally exclude the callbacks from deps: re-subscribing on every
    // render-new closure would thrash the realtime channel. Consumers should
    // pass stable callbacks (useCallback) if they capture changing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inningsId, enabled]);
}

/** Re-exported so consumers can type the raw payload if they handle it directly. */
export type { BallRow };
