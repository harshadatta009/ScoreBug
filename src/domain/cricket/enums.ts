/**
 * Cricket domain enumerations.
 *
 * These are the canonical string unions used across the scoring engine, the
 * database (as Postgres enums / check constraints), and the UI. Keep them in
 * sync with `supabase/migrations`.
 */

/** Runs scored off the bat from a single delivery. */
export type BatRuns = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Extra (sundry) delivery types.
 * - `wide` / `no_ball`: do NOT count as a legal ball; concede a penalty run.
 * - `bye` / `leg_bye`: count as a legal ball; runs are team extras, not batter runs.
 */
export type ExtraType = "wide" | "no_ball" | "bye" | "leg_bye";

export const EXTRA_TYPES: readonly ExtraType[] = [
  "wide",
  "no_ball",
  "bye",
  "leg_bye",
] as const;

/** Modes of dismissal supported by the scoring engine. */
export type DismissalType =
  | "bowled"
  | "caught"
  | "lbw"
  | "run_out"
  | "stumped"
  | "hit_wicket"
  | "retired_out"
  | "retired_hurt" // not out; batter may return
  | "obstructing_field"
  | "hit_ball_twice"
  | "timed_out"
  | "handled_ball";

export const DISMISSAL_TYPES: readonly DismissalType[] = [
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "retired_out",
  "retired_hurt",
  "obstructing_field",
  "hit_ball_twice",
  "timed_out",
  "handled_ball",
] as const;

/** Dismissals that are credited to the bowler in their figures. */
export const BOWLER_CREDITED_DISMISSALS: readonly DismissalType[] = [
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "hit_wicket",
] as const;

/** Dismissals where the batter is NOT actually out (excluded from "wickets"). */
export const NOT_OUT_DISMISSALS: readonly DismissalType[] = [
  "retired_hurt",
] as const;

export type MatchFormat = "T20" | "ODI" | "TEST" | "T10" | "THE_HUNDRED" | "CUSTOM";

export type TournamentFormat =
  | "league"
  | "knockout"
  | "round_robin"
  | "league_playoffs";

export type MatchStatus =
  | "scheduled"
  | "toss"
  | "in_progress"
  | "innings_break"
  | "rain_delay"
  | "super_over"
  | "completed"
  | "abandoned"
  | "no_result";

export type TossDecision = "bat" | "bowl";

export type PlayerRole =
  | "batter"
  | "bowler"
  | "all_rounder"
  | "wicket_keeper"
  | "wk_batter";

export type BattingStyle = "right_hand" | "left_hand";

export type BowlingStyle =
  | "right_arm_fast"
  | "right_arm_medium"
  | "right_arm_offbreak"
  | "right_arm_legbreak"
  | "left_arm_fast"
  | "left_arm_medium"
  | "left_arm_orthodox"
  | "left_arm_chinaman";

/** Application RBAC roles. Mirrors the `app_role` enum and RLS policies. */
export type AppRole =
  | "player"
  | "captain"
  | "scorer"
  | "umpire"
  | "team_admin"
  | "tournament_admin"
  | "super_admin";

export const APP_ROLES: readonly AppRole[] = [
  "player",
  "captain",
  "scorer",
  "umpire",
  "team_admin",
  "tournament_admin",
  "super_admin",
] as const;
