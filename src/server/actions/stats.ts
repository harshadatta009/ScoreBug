"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { asId, type MatchId } from "@/domain/shared/ids";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  recomputePlayerStats,
  recomputeTeamStats,
} from "@/lib/repositories/statsRepository";

/**
 * Statistics server actions.
 *
 * Recompute is a write-ish operation (it refreshes cached aggregates), so it
 * requires an authenticated user. It does NOT gate behind a global role: any
 * signed-in user may trigger a recompute for a match, and the SECURITY DEFINER
 * DB functions enforce what data is actually read. We gather the distinct
 * players and the two teams from the match's innings/balls server-side and fan
 * the refresh calls out.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const uuid = z.string().uuid();

/**
 * Recompute player and team statistics for every participant in a match.
 *
 * Steps (all server-side, authoritative):
 *  1. Read the match's two team ids.
 *  2. Read the match's innings, then the distinct player ids that appear on any
 *     ball (striker / non-striker / bowler / player-out / fielders).
 *  3. Call the refresh RPCs for each distinct player and each team.
 */
export async function recomputeStatsForMatch(
  matchIdRaw: string,
): Promise<ActionResult<{ players: number; teams: number }>> {
  await requireUser();

  const parsed = uuid.safeParse(matchIdRaw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid match id." };
  }
  const matchId = asId<"MatchId">(parsed.data);

  try {
    const { playerIds, teamIds } = await collectMatchParticipants(matchId);

    // Refresh each participant. Run sequentially to keep DB load predictable;
    // the set is bounded by a match's squad size.
    for (const pid of playerIds) {
      await recomputePlayerStats(asId<"PlayerId">(pid));
    }
    for (const tid of teamIds) {
      await recomputeTeamStats(asId<"TeamId">(tid));
    }

    revalidatePath("/stats");
    revalidatePath(`/matches/${parsed.data}`);
    return {
      ok: true,
      data: { players: playerIds.size, teams: teamIds.size },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Gather the distinct player ids and team ids that took part in a match by
 * reading its match row (teams) and the balls of its innings (players). Kept in
 * this action module because it stitches together several tables for a single
 * use case rather than being a reusable repository read.
 */
async function collectMatchParticipants(
  matchId: MatchId,
): Promise<{ playerIds: Set<string>; teamIds: Set<string> }> {
  const supabase = await createClient();

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id")
    .eq("id", matchId)
    .maybeSingle();
  if (matchErr) throw new Error(`load match failed: ${matchErr.message}`);
  if (!match) throw new Error("Match not found.");

  const teamIds = new Set<string>([match.team_a_id, match.team_b_id]);

  const { data: innings, error: inningsErr } = await supabase
    .from("innings")
    .select("id")
    .eq("match_id", matchId);
  if (inningsErr) throw new Error(`load innings failed: ${inningsErr.message}`);

  const playerIds = new Set<string>();
  const inningsIds = (innings ?? []).map((i) => i.id);
  if (inningsIds.length > 0) {
    const { data: balls, error: ballsErr } = await supabase
      .from("balls")
      .select(
        "striker_id, non_striker_id, bowler_id, player_out_id, fielder_ids",
      )
      .in("innings_id", inningsIds);
    if (ballsErr) throw new Error(`load balls failed: ${ballsErr.message}`);

    for (const b of balls ?? []) {
      playerIds.add(b.striker_id);
      playerIds.add(b.non_striker_id);
      playerIds.add(b.bowler_id);
      if (b.player_out_id) playerIds.add(b.player_out_id);
      for (const f of b.fielder_ids ?? []) playerIds.add(f);
    }
  }

  return { playerIds, teamIds };
}
