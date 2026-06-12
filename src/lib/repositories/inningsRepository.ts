import "server-only";

import type { InningsConfig } from "@/domain/cricket/match";
import {
  asId,
  type InningsId,
  type MatchId,
  type PlayerId,
  type TeamId,
} from "@/domain/shared/ids";
import type { InningsRow } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { rowToInningsConfig } from "./matchRepository";

/**
 * Innings repository — owns the lifecycle of `public.innings` rows and the
 * mapping to the engine's `InningsConfig`. Reuses `rowToInningsConfig` from the
 * match repository so the row→config translation lives in exactly one place.
 *
 * Also hosts a minimal get-or-create-player-by-user helper: the scoring engine
 * keys batters/bowlers by `public.players.id`, but a team's squad is modelled
 * as `users` (via `team_members.user_id`). When a playing XI is finalized we
 * must resolve each selected user to a stable player id, creating a player row
 * on first use. (No dedicated players repository was importable for this
 * vertical — noted in followups.)
 */

export interface CreateInningsInput {
  matchId: MatchId;
  inningsNumber: number;
  battingTeam: TeamId;
  bowlingTeam: TeamId;
  isSuperOver?: boolean;
  /** Runs to chase (one more than the runs to tie), if a second innings. */
  targetRuns?: number | null;
  revisedOvers?: number | null;
}

/** Insert a new innings row and return its engine-shaped config. */
export async function createInnings(
  input: CreateInningsInput,
): Promise<InningsConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("innings")
    .insert({
      match_id: input.matchId,
      innings_number: input.inningsNumber,
      batting_team_id: input.battingTeam,
      bowling_team_id: input.bowlingTeam,
      is_super_over: input.isSuperOver ?? false,
      target_runs: input.targetRuns ?? null,
      revised_overs: input.revisedOvers ?? null,
      is_complete: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `createInnings failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToInningsConfig(data as InningsRow);
}

/** Every innings of a match, ordered 1..n, as engine configs. */
export async function getInningsByMatch(
  matchId: MatchId,
): Promise<InningsConfig[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("innings")
    .select("*")
    .eq("match_id", matchId)
    .order("innings_number", { ascending: true });

  if (error) throw new Error(`getInningsByMatch failed: ${error.message}`);
  return (data ?? []).map((r) => rowToInningsConfig(r as InningsRow));
}

/** Fetch one innings config, or null if it does not exist. */
export async function getInnings(
  inningsId: InningsId,
): Promise<InningsConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("innings")
    .select("*")
    .eq("id", inningsId)
    .maybeSingle();

  if (error) throw new Error(`getInnings failed: ${error.message}`);
  return data ? rowToInningsConfig(data as InningsRow) : null;
}

/**
 * The current (latest, still-open) innings of a match, or null. Used by the
 * scorer to resume the live innings without the caller tracking ids.
 */
export async function getCurrentInnings(
  matchId: MatchId,
): Promise<InningsConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("innings")
    .select("*")
    .eq("match_id", matchId)
    .eq("is_complete", false)
    .order("innings_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getCurrentInnings failed: ${error.message}`);
  return data ? rowToInningsConfig(data as InningsRow) : null;
}

/** Mark an innings complete (innings break / all out / overs done). */
export async function completeInnings(inningsId: InningsId): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("innings")
    .update({ is_complete: true })
    .eq("id", inningsId);

  if (error) throw new Error(`completeInnings failed: ${error.message}`);
}

/**
 * Resolve a `users.id` to a stable `public.players.id`, creating the player row
 * on first use (idempotent get-or-create keyed by `user_id`).
 *
 * WHY: the ball log references players, not users — but a squad is a set of
 * users. Materializing a player per selected user keeps the engine's id space
 * consistent while letting teams be built from real accounts.
 */
export async function getOrCreatePlayerForUser(
  userId: string,
): Promise<PlayerId> {
  const supabase = await createClient();

  const { data: existing, error: findErr } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findErr) {
    throw new Error(`getOrCreatePlayerForUser lookup failed: ${findErr.message}`);
  }
  if (existing) return asId<"PlayerId">(existing.id);

  // Snapshot the user's profile fields onto the player row so the scorecard
  // has a display name even if the user later edits their profile.
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, full_name, batting_style, bowling_style, player_role, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    profile?.display_name ?? profile?.full_name ?? "Player";

  const { data: created, error: insertErr } = await supabase
    .from("players")
    .insert({
      user_id: userId,
      display_name: displayName,
      batting_style: profile?.batting_style ?? null,
      bowling_style: profile?.bowling_style ?? null,
      player_role: profile?.player_role ?? null,
      photo_url: profile?.avatar_url ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    throw new Error(
      `getOrCreatePlayerForUser insert failed: ${insertErr?.message ?? "no row"}`,
    );
  }
  return asId<"PlayerId">(created.id);
}

/**
 * Display names for a set of player ids, for rendering scorecards. Returns a
 * Map keyed by player id; missing ids simply won't appear.
 */
export async function getPlayerNames(
  playerIds: readonly PlayerId[],
): Promise<Map<string, string>> {
  if (playerIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name")
    .in("id", [...playerIds]);

  if (error) throw new Error(`getPlayerNames failed: ${error.message}`);
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}
