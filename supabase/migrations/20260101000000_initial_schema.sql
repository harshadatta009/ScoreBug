-- ============================================================================
-- CricScore — Initial schema
-- ----------------------------------------------------------------------------
-- Design principles:
--   * Every delivery is one row in public.balls; scorecards & statistics are
--     derived from the ordered ball sequence (event-sourced scoring).
--   * Enums mirror src/domain/cricket/enums.ts exactly.
--   * RLS is enabled on every table here; policies live in a later migration.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type app_role as enum (
  'player','captain','scorer','umpire','team_admin','tournament_admin','super_admin'
);

create type match_format as enum ('T20','ODI','TEST','T10','THE_HUNDRED','CUSTOM');

create type tournament_format as enum (
  'league','knockout','round_robin','league_playoffs'
);

create type match_status as enum (
  'scheduled','toss','in_progress','innings_break','rain_delay',
  'super_over','completed','abandoned','no_result'
);

create type toss_decision as enum ('bat','bowl');

create type extra_type as enum ('wide','no_ball','bye','leg_bye');

create type dismissal_type as enum (
  'bowled','caught','lbw','run_out','stumped','hit_wicket','retired_out',
  'retired_hurt','obstructing_field','hit_ball_twice','timed_out','handled_ball'
);

create type batting_style as enum ('right_hand','left_hand');

create type bowling_style as enum (
  'right_arm_fast','right_arm_medium','right_arm_offbreak','right_arm_legbreak',
  'left_arm_fast','left_arm_medium','left_arm_orthodox','left_arm_chinaman'
);

create type player_role as enum (
  'batter','bowler','all_rounder','wicket_keeper','wk_batter'
);

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- users (profile rows; 1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique,
  full_name     text,
  display_name  text,
  avatar_url    text,
  bio           text,
  batting_style batting_style,
  bowling_style bowling_style,
  player_role   player_role,
  date_of_birth date,
  city          text,
  country       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_users_updated before update on public.users
  for each row execute function public.set_updated_at();

-- Global application roles (RBAC). Most roles are scoped (see team_members /
-- tournament memberships); this table holds platform-wide grants like
-- super_admin. Kept separate from JWT claims for auditability.
create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role    app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ----------------------------------------------------------------------------
-- venues
-- ----------------------------------------------------------------------------
create table public.venues (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  city        text,
  country     text,
  latitude    double precision,
  longitude   double precision,
  pitch_type  text,
  photos      text[] not null default '{}',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_venues_updated before update on public.venues
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- teams + members
-- ----------------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  short_name  text,
  logo_url    text,
  city        text,
  founded_year int,
  owner_id    uuid not null references public.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  id          uuid primary key default uuid_generate_v4(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        app_role not null default 'player',
  jersey_number int,
  is_active   boolean not null default true,
  invited_by  uuid references public.users(id) on delete set null,
  invite_status text not null default 'accepted'
    check (invite_status in ('pending','accepted','declined','removed')),
  joined_at   timestamptz not null default now(),
  unique (team_id, user_id)
);
create index idx_team_members_team on public.team_members(team_id);
create index idx_team_members_user on public.team_members(user_id);

-- ----------------------------------------------------------------------------
-- players (a participant identity within a match context)
-- A player maps to a user when registered, but supports "guest" players too
-- (common in local cricket where not everyone has an account).
-- ----------------------------------------------------------------------------
create table public.players (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references public.users(id) on delete set null,
  display_name  text not null,
  batting_style batting_style,
  bowling_style bowling_style,
  player_role   player_role,
  created_at    timestamptz not null default now()
);
create index idx_players_user on public.players(user_id);

-- ----------------------------------------------------------------------------
-- tournaments
-- ----------------------------------------------------------------------------
create table public.tournaments (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  format      tournament_format not null,
  match_format match_format not null default 'T20',
  logo_url    text,
  start_date  date,
  end_date    date,
  organizer_id uuid not null references public.users(id) on delete restrict,
  -- group/playoff configuration kept flexible
  config      jsonb not null default '{}'::jsonb,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tournaments_updated before update on public.tournaments
  for each row execute function public.set_updated_at();

create table public.tournament_teams (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  group_name    text,
  seed          int,
  joined_at     timestamptz not null default now(),
  unique (tournament_id, team_id)
);
create index idx_tt_tournament on public.tournament_teams(tournament_id);

-- ----------------------------------------------------------------------------
-- matches
-- ----------------------------------------------------------------------------
create table public.matches (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid references public.tournaments(id) on delete set null,
  venue_id      uuid references public.venues(id) on delete set null,
  format        match_format not null default 'T20',
  status        match_status not null default 'scheduled',

  team_a_id     uuid not null references public.teams(id) on delete restrict,
  team_b_id     uuid not null references public.teams(id) on delete restrict,

  -- rules snapshot (mirrors MatchRules); snapshotted so historical matches are
  -- not mutated by later rule changes.
  rules         jsonb not null default '{}'::jsonb,
  playing_xi    jsonb not null default '{}'::jsonb, -- { team_a: [...], team_b: [...] }

  toss_won_by   uuid references public.teams(id) on delete set null,
  toss_decision toss_decision,

  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,

  -- denormalized result for fast listing; source of truth is balls.
  result_summary text,
  winner_team_id uuid references public.teams(id) on delete set null,
  win_margin_runs int,
  win_margin_wickets int,

  scorer_id     uuid references public.users(id) on delete set null,
  created_by    uuid not null references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);
create index idx_matches_tournament on public.matches(tournament_id);
create index idx_matches_status on public.matches(status);
create index idx_matches_scheduled on public.matches(scheduled_at);

create trigger trg_matches_updated before update on public.matches
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- innings
-- ----------------------------------------------------------------------------
create table public.innings (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references public.matches(id) on delete cascade,
  innings_number int not null,
  batting_team_id uuid not null references public.teams(id) on delete restrict,
  bowling_team_id uuid not null references public.teams(id) on delete restrict,
  is_super_over boolean not null default false,
  target_runs   int,
  revised_overs numeric(5,2),
  is_complete   boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (match_id, innings_number, is_super_over)
);
create index idx_innings_match on public.innings(match_id);

-- ----------------------------------------------------------------------------
-- overs (an aggregate row per over for fast over-by-over reads; derived)
-- ----------------------------------------------------------------------------
create table public.overs (
  id          uuid primary key default uuid_generate_v4(),
  innings_id  uuid not null references public.innings(id) on delete cascade,
  over_number int not null,
  bowler_id   uuid references public.players(id) on delete set null,
  runs        int not null default 0,
  wickets     int not null default 0,
  is_maiden   boolean not null default false,
  is_complete boolean not null default false,
  unique (innings_id, over_number)
);
create index idx_overs_innings on public.overs(innings_id);

-- ----------------------------------------------------------------------------
-- balls — the atomic event log. Mirrors src/domain/cricket/ball.ts
-- ----------------------------------------------------------------------------
create table public.balls (
  id           uuid primary key default uuid_generate_v4(),
  innings_id   uuid not null references public.innings(id) on delete cascade,

  sequence     int not null,            -- 1-based canonical ordering
  over_number  int not null,            -- 0-based
  ball_in_over int not null,            -- 1-based legal ordinal (display)

  striker_id     uuid not null references public.players(id) on delete restrict,
  non_striker_id uuid not null references public.players(id) on delete restrict,
  bowler_id      uuid not null references public.players(id) on delete restrict,

  bat_runs     smallint not null default 0 check (bat_runs between 0 and 7),
  extra_type   extra_type,
  extra_runs   smallint not null default 0 check (extra_runs >= 0),

  -- wicket (denormalized; null when no wicket)
  wicket_type      dismissal_type,
  player_out_id    uuid references public.players(id) on delete restrict,
  wicket_bowler_id uuid references public.players(id) on delete set null,
  fielder_ids      uuid[] not null default '{}',

  is_free_hit  boolean not null default false,
  commentary   text,

  recorded_at  timestamptz not null default now(),
  recorded_by  uuid references public.users(id) on delete set null,

  unique (innings_id, sequence)
);
create index idx_balls_innings_seq on public.balls(innings_id, sequence);
create index idx_balls_innings_over on public.balls(innings_id, over_number);

-- ----------------------------------------------------------------------------
-- player_statistics — rolled-up career aggregates (refreshed from balls)
-- ----------------------------------------------------------------------------
create table public.player_statistics (
  player_id   uuid primary key references public.players(id) on delete cascade,
  -- batting
  matches     int not null default 0,
  innings_batted int not null default 0,
  runs        int not null default 0,
  balls_faced int not null default 0,
  fours       int not null default 0,
  sixes       int not null default 0,
  highest_score int not null default 0,
  not_outs    int not null default 0,
  fifties     int not null default 0,
  hundreds    int not null default 0,
  -- bowling
  innings_bowled int not null default 0,
  balls_bowled int not null default 0,
  runs_conceded int not null default 0,
  wickets     int not null default 0,
  best_bowling text,
  -- fielding
  catches     int not null default 0,
  stumpings   int not null default 0,
  run_outs    int not null default 0,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- team_statistics
-- ----------------------------------------------------------------------------
create table public.team_statistics (
  team_id     uuid primary key references public.teams(id) on delete cascade,
  matches     int not null default 0,
  wins        int not null default 0,
  losses      int not null default 0,
  ties        int not null default 0,
  no_results  int not null default 0,
  runs_for    int not null default 0,
  balls_faced int not null default 0,
  runs_against int not null default 0,
  balls_bowled int not null default 0,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, is_read);

-- Web Push subscriptions (one device = one row)
create table public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- Social follows (polymorphic: team or player)
create table public.follows (
  id          uuid primary key default uuid_generate_v4(),
  follower_id uuid not null references public.users(id) on delete cascade,
  target_type text not null check (target_type in ('team','player','tournament')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (follower_id, target_type, target_id)
);
create index idx_follows_follower on public.follows(follower_id);
create index idx_follows_target on public.follows(target_type, target_id);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_actor on public.audit_logs(actor_id);

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere (policies defined in a subsequent migration)
-- ----------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.user_roles          enable row level security;
alter table public.venues              enable row level security;
alter table public.teams               enable row level security;
alter table public.team_members        enable row level security;
alter table public.players             enable row level security;
alter table public.tournaments         enable row level security;
alter table public.tournament_teams    enable row level security;
alter table public.matches             enable row level security;
alter table public.innings             enable row level security;
alter table public.overs               enable row level security;
alter table public.balls               enable row level security;
alter table public.player_statistics   enable row level security;
alter table public.team_statistics     enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.follows             enable row level security;
alter table public.audit_logs          enable row level security;
