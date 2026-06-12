/**
 * Database types.
 *
 * Hand-written to mirror supabase/migrations exactly, so the codebase compiles
 * before/without a live `supabase gen types` run. Regenerate the exhaustive
 * version any time with `npx supabase gen types typescript --linked` — but keep
 * the named `*Row` aliases at the bottom (repositories import them).
 *
 * IMPORTANT: every Row is a `type` alias, not an `interface`. Supabase's
 * `GenericTable` constraint requires Row to be assignable to
 * `Record<string, unknown>`; interfaces lack an implicit index signature and
 * make the whole schema resolve to `never`. Do not convert these to interfaces.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Enums (mirror src/domain/cricket/enums.ts + migrations) ────────────────
export type AppRoleEnum =
  | "player"
  | "captain"
  | "scorer"
  | "umpire"
  | "team_admin"
  | "tournament_admin"
  | "super_admin";

export type TeamMemberRole =
  | "owner"
  | "captain"
  | "vice_captain"
  | "manager"
  | "player";

export type MatchFormatEnum =
  | "T20"
  | "ODI"
  | "TEST"
  | "T10"
  | "THE_HUNDRED"
  | "CUSTOM";

export type TournamentFormatEnum =
  | "league"
  | "knockout"
  | "round_robin"
  | "league_playoffs";

export type MatchStatusEnum =
  | "scheduled"
  | "toss"
  | "in_progress"
  | "innings_break"
  | "rain_delay"
  | "super_over"
  | "completed"
  | "abandoned"
  | "no_result";

export type ExtraTypeEnum = "wide" | "no_ball" | "bye" | "leg_bye";
export type BattingStyleEnum = "right_hand" | "left_hand";
export type BowlingStyleEnum =
  | "right_arm_fast"
  | "right_arm_medium"
  | "right_arm_offbreak"
  | "right_arm_legbreak"
  | "left_arm_fast"
  | "left_arm_medium"
  | "left_arm_orthodox"
  | "left_arm_chinaman";
export type PlayerRoleEnum =
  | "batter"
  | "bowler"
  | "all_rounder"
  | "wicket_keeper"
  | "wk_batter";

// ─── Row types ──────────────────────────────────────────────────────────────
export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  batting_style: BattingStyleEnum | null;
  bowling_style: BowlingStyleEnum | null;
  player_role: PlayerRoleEnum | null;
  date_of_birth: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRoleRow = {
  user_id: string;
  role: AppRoleEnum;
  granted_at: string;
};

export type VenueRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  pitch_type: string | null;
  photos: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  founded_year: number | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: AppRoleEnum;
  team_role: TeamMemberRole;
  jersey_number: number | null;
  is_active: boolean;
  invited_by: string | null;
  invite_status: "pending" | "accepted" | "declined" | "removed";
  joined_at: string;
};

export type JoinRequestRow = {
  id: string;
  team_id: string;
  user_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  message: string | null;
  created_at: string;
  decided_at: string | null;
};

export type PlayerRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  batting_style: BattingStyleEnum | null;
  bowling_style: BowlingStyleEnum | null;
  player_role: PlayerRoleEnum | null;
  photo_url: string | null;
  bio: string | null;
  dominant_hand: "right" | "left" | null;
  created_at: string;
};

export type PlayerAchievementRow = {
  id: string;
  player_id: string;
  match_id: string | null;
  type: string;
  title: string;
  description: string | null;
  meta: Json;
  awarded_at: string;
};

export type TournamentRow = {
  id: string;
  name: string;
  format: TournamentFormatEnum;
  match_format: MatchFormatEnum;
  logo_url: string | null;
  start_date: string | null;
  end_date: string | null;
  organizer_id: string;
  config: Json;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentTeamRow = {
  id: string;
  tournament_id: string;
  team_id: string;
  group_name: string | null;
  seed: number | null;
  joined_at: string;
};

export type MatchRow = {
  id: string;
  tournament_id: string | null;
  venue_id: string | null;
  format: MatchFormatEnum;
  status: MatchStatusEnum;
  team_a_id: string;
  team_b_id: string;
  rules: Json;
  playing_xi: Json;
  toss_won_by: string | null;
  toss_decision: "bat" | "bowl" | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  winner_team_id: string | null;
  win_margin_runs: number | null;
  win_margin_wickets: number | null;
  stage: string | null;
  round: number | null;
  match_number: number | null;
  group_name: string | null;
  scorer_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type InningsRow = {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  is_super_over: boolean;
  target_runs: number | null;
  revised_overs: number | null;
  is_complete: boolean;
  created_at: string;
};

export type OverRow = {
  id: string;
  innings_id: string;
  over_number: number;
  bowler_id: string | null;
  runs: number;
  wickets: number;
  is_maiden: boolean;
  is_complete: boolean;
};

export type BallRow = {
  id: string;
  innings_id: string;
  sequence: number;
  over_number: number;
  ball_in_over: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  bat_runs: number;
  extra_type: ExtraTypeEnum | null;
  extra_runs: number;
  wicket_type: string | null;
  player_out_id: string | null;
  wicket_bowler_id: string | null;
  fielder_ids: string[];
  is_free_hit: boolean;
  commentary: string | null;
  recorded_at: string;
  recorded_by: string | null;
};

export type PlayerStatisticsRow = {
  player_id: string;
  matches: number;
  innings_batted: number;
  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  highest_score: number;
  not_outs: number;
  fifties: number;
  hundreds: number;
  innings_bowled: number;
  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
  best_bowling: string | null;
  catches: number;
  stumpings: number;
  run_outs: number;
  updated_at: string;
};

export type TeamStatisticsRow = {
  team_id: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  no_results: number;
  runs_for: number;
  balls_faced: number;
  runs_against: number;
  balls_bowled: number;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Json;
  is_read: boolean;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type FollowRow = {
  id: string;
  follower_id: string;
  target_type: "team" | "player" | "tournament";
  target_id: string;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
  created_at: string;
};

// ─── Schema descriptor ───────────────────────────────────────────────────────
type TableShape<R> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: TableShape<UserRow>;
      user_roles: TableShape<UserRoleRow>;
      venues: TableShape<VenueRow>;
      teams: TableShape<TeamRow>;
      team_members: TableShape<TeamMemberRow>;
      join_requests: TableShape<JoinRequestRow>;
      players: TableShape<PlayerRow>;
      player_achievements: TableShape<PlayerAchievementRow>;
      tournaments: TableShape<TournamentRow>;
      tournament_teams: TableShape<TournamentTeamRow>;
      matches: TableShape<MatchRow>;
      innings: TableShape<InningsRow>;
      overs: TableShape<OverRow>;
      balls: TableShape<BallRow>;
      player_statistics: TableShape<PlayerStatisticsRow>;
      team_statistics: TableShape<TeamStatisticsRow>;
      notifications: TableShape<NotificationRow>;
      push_subscriptions: TableShape<PushSubscriptionRow>;
      follows: TableShape<FollowRow>;
      audit_logs: TableShape<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRoleEnum;
      team_member_role: TeamMemberRole;
      match_format: MatchFormatEnum;
      tournament_format: TournamentFormatEnum;
      match_status: MatchStatusEnum;
      extra_type: ExtraTypeEnum;
    };
    CompositeTypes: Record<string, never>;
  };
};
