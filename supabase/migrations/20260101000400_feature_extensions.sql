-- ============================================================================
-- CricScore — Feature extensions
-- ----------------------------------------------------------------------------
-- Adds the columns/tables the full feature set needs on top of the initial
-- schema: richer team profiles + membership roles, join requests, player
-- profile fields + achievements, and tournament/match staging for fixtures.
-- RLS is enabled + policied for every new table here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Teams: richer public profile
-- ----------------------------------------------------------------------------
alter table public.teams add column if not exists banner_url  text;
alter table public.teams add column if not exists description text;
alter table public.teams add column if not exists country     text;

-- ----------------------------------------------------------------------------
-- Team membership roles (distinct from the global app_role)
-- ----------------------------------------------------------------------------
do $$ begin
  create type team_member_role as enum
    ('owner','captain','vice_captain','manager','player');
exception when duplicate_object then null; end $$;

alter table public.team_members
  add column if not exists team_role team_member_role not null default 'player';

-- Backfill: the team owner becomes 'owner' in their membership row if present.
update public.team_members tm
  set team_role = 'owner'
  from public.teams t
  where tm.team_id = t.id and tm.user_id = t.owner_id and tm.team_role = 'player';

-- ----------------------------------------------------------------------------
-- Join requests (a user asks to join a team)
-- ----------------------------------------------------------------------------
create table if not exists public.join_requests (
  id          uuid primary key default uuid_generate_v4(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  status      text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  message     text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (team_id, user_id)
);
create index if not exists idx_join_requests_team on public.join_requests(team_id, status);
create index if not exists idx_join_requests_user on public.join_requests(user_id);

-- ----------------------------------------------------------------------------
-- Players: profile fields used by public player pages
-- ----------------------------------------------------------------------------
alter table public.players add column if not exists photo_url     text;
alter table public.players add column if not exists bio           text;
alter table public.players add column if not exists dominant_hand text
  check (dominant_hand is null or dominant_hand in ('right','left'));

-- ----------------------------------------------------------------------------
-- Player achievements / milestones / awards
-- ----------------------------------------------------------------------------
create table if not exists public.player_achievements (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references public.players(id) on delete cascade,
  match_id    uuid references public.matches(id) on delete set null,
  type        text not null,         -- e.g. 'fifty','hundred','five_wicket_haul','man_of_match'
  title       text not null,
  description text,
  meta        jsonb not null default '{}'::jsonb,
  awarded_at  timestamptz not null default now()
);
create index if not exists idx_achievements_player on public.player_achievements(player_id);

-- ----------------------------------------------------------------------------
-- Matches / tournaments: staging for fixtures + points tables
-- ----------------------------------------------------------------------------
alter table public.matches add column if not exists stage        text; -- 'league','group','quarter_final','semi_final','final'
alter table public.matches add column if not exists round        int;
alter table public.matches add column if not exists match_number int;
alter table public.matches add column if not exists group_name   text;

-- ----------------------------------------------------------------------------
-- RLS for new tables
-- ----------------------------------------------------------------------------
alter table public.join_requests       enable row level security;
alter table public.player_achievements enable row level security;

-- join_requests: a user manages their own requests; team owners/admins see + decide for their team.
drop policy if exists join_requests_select on public.join_requests;
create policy join_requests_select on public.join_requests for select
  using (
    user_id = auth.uid()
    or public.is_team_admin(team_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );

drop policy if exists join_requests_insert on public.join_requests;
create policy join_requests_insert on public.join_requests for insert
  with check (user_id = auth.uid());

drop policy if exists join_requests_update on public.join_requests;
create policy join_requests_update on public.join_requests for update
  using (
    user_id = auth.uid()
    or public.is_team_admin(team_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );

drop policy if exists join_requests_delete on public.join_requests;
create policy join_requests_delete on public.join_requests for delete
  using (user_id = auth.uid() or public.is_team_admin(team_id, auth.uid()));

-- player_achievements: world-readable (public profiles); writes by team admins / system.
drop policy if exists achievements_select on public.player_achievements;
create policy achievements_select on public.player_achievements for select
  using (true);

drop policy if exists achievements_write on public.player_achievements;
create policy achievements_write on public.player_achievements for all
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- Realtime: surface match staging changes too (points tables update live)
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.join_requests;
exception when duplicate_object then null; end $$;
