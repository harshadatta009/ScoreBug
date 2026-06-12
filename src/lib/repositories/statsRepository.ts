import "server-only";

import { asId, type PlayerId, type TeamId } from "@/domain/shared/ids";
import type {
  PlayerStatisticsRow,
  TeamStatisticsRow,
} from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Statistics repository.
 *
 * Reads the pre-aggregated `public.player_statistics` / `public.team_statistics`
 * tables for fast leaderboards — these are maintained by SECURITY DEFINER DB
 * functions, so the page never has to replay millions of ball rows. Recompute
 * helpers call those functions via RPC.
 *
 * View models keep the snake_case row fields but brand the id, and expose a few
 * derived rate fields the leaderboard UI needs (SR, economy, fielding total).
 */

// ─── View models (camelCase, branded id, derived rates) ──────────────────────

export interface PlayerBattingStat {
  playerId: PlayerId;
  matches: number;
  innings: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  highestScore: number;
  notOuts: number;
  fifties: number;
  hundreds: number;
  /** runs / ballsFaced * 100, guarded. */
  strikeRate: number;
  /** runs / (innings - notOuts), null when never dismissed. */
  average: number | null;
}

export interface PlayerBowlingStat {
  playerId: PlayerId;
  matches: number;
  innings: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  bestBowling: string | null;
  /** runsConceded / overs, guarded. */
  economy: number;
}

export interface PlayerFieldingStat {
  playerId: PlayerId;
  matches: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  /** catches + stumpings + run-outs. */
  dismissals: number;
}

/** Balls per over used for economy when none is encoded per-row. */
const BALLS_PER_OVER = 6;

function toBattingStat(row: PlayerStatisticsRow): PlayerBattingStat {
  const dismissals = row.innings_batted - row.not_outs;
  return {
    playerId: asId<"PlayerId">(row.player_id),
    matches: row.matches,
    innings: row.innings_batted,
    runs: row.runs,
    ballsFaced: row.balls_faced,
    fours: row.fours,
    sixes: row.sixes,
    highestScore: row.highest_score,
    notOuts: row.not_outs,
    fifties: row.fifties,
    hundreds: row.hundreds,
    strikeRate: row.balls_faced > 0 ? (row.runs / row.balls_faced) * 100 : 0,
    average: dismissals > 0 ? row.runs / dismissals : null,
  };
}

function toBowlingStat(row: PlayerStatisticsRow): PlayerBowlingStat {
  const overs = row.balls_bowled / BALLS_PER_OVER;
  return {
    playerId: asId<"PlayerId">(row.player_id),
    matches: row.matches,
    innings: row.innings_bowled,
    ballsBowled: row.balls_bowled,
    runsConceded: row.runs_conceded,
    wickets: row.wickets,
    bestBowling: row.best_bowling,
    economy: overs > 0 ? row.runs_conceded / overs : 0,
  };
}

function toFieldingStat(row: PlayerStatisticsRow): PlayerFieldingStat {
  return {
    playerId: asId<"PlayerId">(row.player_id),
    matches: row.matches,
    catches: row.catches,
    stumpings: row.stumpings,
    runOuts: row.run_outs,
    dismissals: row.catches + row.stumpings + row.run_outs,
  };
}

// ─── Leaderboard reads ───────────────────────────────────────────────────────

/** Top run-scorers, highest runs first. */
export async function topRunScorers(
  limit = 50,
): Promise<PlayerBattingStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_statistics")
    .select("*")
    .order("runs", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`topRunScorers failed: ${error.message}`);
  return (data ?? []).map(toBattingStat);
}

/** Top wicket-takers, most wickets first. */
export async function topWicketTakers(
  limit = 50,
): Promise<PlayerBowlingStat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_statistics")
    .select("*")
    .order("wickets", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`topWicketTakers failed: ${error.message}`);
  return (data ?? []).map(toBowlingStat);
}

/**
 * Top fielders by total dismissals (catches + stumpings + run-outs).
 *
 * `player_statistics` has no precomputed dismissals column, so we fetch a
 * generous candidate set ordered by catches (the dominant component) and sort
 * the combined total in memory. The `limit` applies to the returned set.
 */
export async function topFielders(
  limit = 50,
): Promise<PlayerFieldingStat[]> {
  const supabase = await createClient();
  // Pull a wider candidate window so a player with few catches but many
  // stumpings/run-outs still surfaces, then re-rank by the true total.
  const { data, error } = await supabase
    .from("player_statistics")
    .select("*")
    .order("catches", { ascending: false })
    .limit(Math.max(limit * 4, limit));

  if (error) throw new Error(`topFielders failed: ${error.message}`);

  return (data ?? [])
    .map(toFieldingStat)
    .filter((s) => s.dismissals > 0)
    .sort(
      (a, b) =>
        b.dismissals - a.dismissals ||
        b.catches - a.catches ||
        b.stumpings - a.stumpings,
    )
    .slice(0, limit);
}

/** One player's full statistics row (all three disciplines), or null. */
export async function getPlayerStatistics(
  playerId: PlayerId,
): Promise<PlayerStatisticsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_statistics")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error(`getPlayerStatistics failed: ${error.message}`);
  return data ?? null;
}

/** One team's aggregated statistics row, or null. */
export async function getTeamStatistics(
  teamId: TeamId,
): Promise<TeamStatisticsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_statistics")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) throw new Error(`getTeamStatistics failed: ${error.message}`);
  return data ?? null;
}

// ─── Recompute (SECURITY DEFINER RPCs) ───────────────────────────────────────

/** Loosely-typed rpc caller: `Database["public"]["Functions"]` is empty in the
 * hand-written types, so the generated `rpc` overloads resolve to `never`. */
type RpcCaller = (
  fn: string,
  args: Record<string, string>,
) => Promise<{ error: { message: string } | null }>;

/**
 * Refresh the cached statistics for one player by invoking the DB function
 * `public.refresh_player_statistics(p_player_id uuid)`. The function is SECURITY
 * DEFINER so it can re-read ball data across matches the caller can't directly
 * select. The argument name (`p_player_id`) matches the migration exactly.
 */
export async function recomputePlayerStats(playerId: PlayerId): Promise<void> {
  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as RpcCaller)(
    "refresh_player_statistics",
    { p_player_id: playerId },
  );

  if (error) {
    throw new Error(`recomputePlayerStats failed: ${error.message}`);
  }
}

/** Refresh cached statistics for one team via
 * `public.refresh_team_statistics(p_team_id uuid)`. */
export async function recomputeTeamStats(teamId: TeamId): Promise<void> {
  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as RpcCaller)(
    "refresh_team_statistics",
    { p_team_id: teamId },
  );

  if (error) {
    throw new Error(`recomputeTeamStats failed: ${error.message}`);
  }
}
