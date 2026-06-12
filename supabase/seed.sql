-- ============================================================================
-- CricScore — local development seed data
-- ----------------------------------------------------------------------------
-- Runs automatically on `supabase start` / `supabase db reset`.
--
-- AUTH CAVEAT:
--   We seed rows directly into auth.users (with a bcrypt-hashed password) so
--   local dev has signed-in-able accounts. This is acceptable ONLY for the
--   local emulator — never run this against a hosted project. The on_auth_user
--   _created trigger would normally create public.users, but to keep the seed
--   self-contained and idempotent we also upsert public.users explicitly with
--   matching ids (the trigger's insert uses `on conflict do nothing`, so there
--   is no clash).
--
-- All statements are idempotent (`on conflict do nothing` / fixed UUIDs) so the
-- seed can be re-applied safely.
-- ============================================================================

-- ---- Fixed demo UUIDs (stable across reseeds) ------------------------------
-- users
--   alice  : 00000000-0000-0000-0000-0000000000a1  (super_admin, owns Royals)
--   bob    : 00000000-0000-0000-0000-0000000000b2  (organizer, owns Strikers)
-- teams
--   royals  : 11111111-1111-1111-1111-111111111111
--   strikers: 22222222-2222-2222-2222-222222222222

-- ----------------------------------------------------------------------------
-- auth.users (LOCAL ONLY). Password for both demo users: "password123"
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1',
    'authenticated', 'authenticated', 'alice@cricscore.dev',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alice Captain","display_name":"Alice"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000b2',
    'authenticated', 'authenticated', 'bob@cricscore.dev',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Bob Organizer","display_name":"Bob"}',
    now(), now()
  )
on conflict (id) do nothing;

-- Identities are required for email-login users in recent GoTrue versions.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a1',
    '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"alice@cricscore.dev"}',
    'email', 'alice@cricscore.dev', now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000b2',
    '{"sub":"00000000-0000-0000-0000-0000000000b2","email":"bob@cricscore.dev"}',
    'email', 'bob@cricscore.dev', now(), now(), now()
  )
on conflict (provider, provider_id) do nothing;

-- ----------------------------------------------------------------------------
-- public.users (mirror; trigger also covers this with do-nothing on conflict)
-- ----------------------------------------------------------------------------
insert into public.users (id, email, full_name, display_name, player_role, city, country)
values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@cricscore.dev', 'Alice Captain', 'Alice', 'all_rounder', 'Mumbai', 'India'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@cricscore.dev',   'Bob Organizer', 'Bob',   'bowler',      'Pune',   'India')
on conflict (id) do nothing;

-- Alice is the platform super_admin for local testing.
insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', 'super_admin')
on conflict (user_id, role) do nothing;

-- ----------------------------------------------------------------------------
-- venue
-- ----------------------------------------------------------------------------
insert into public.venues (id, name, city, country, pitch_type, created_by)
values (
  '33333333-3333-3333-3333-333333333333',
  'Oval Maidan', 'Mumbai', 'India', 'flat',
  '00000000-0000-0000-0000-0000000000a1'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- teams (Royals owned by Alice; Strikers owned by Bob)
-- ----------------------------------------------------------------------------
insert into public.teams (id, name, short_name, city, founded_year, owner_id)
values
  ('11111111-1111-1111-1111-111111111111', 'Mumbai Royals',   'MR', 'Mumbai', 2018, '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'Pune Strikers',   'PS', 'Pune',   2019, '00000000-0000-0000-0000-0000000000b2')
on conflict (id) do nothing;

-- Owners as accepted team_admin members.
insert into public.team_members (team_id, user_id, role, jersey_number, invite_status)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'team_admin', 7, 'accepted'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000b2', 'team_admin', 10, 'accepted')
on conflict (team_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- players — 3 per team (guest identities; user_id null except captains)
-- Royals players: a-prefixed ids; Strikers players: b-prefixed ids.
-- ----------------------------------------------------------------------------
insert into public.players (id, user_id, display_name, batting_style, bowling_style, player_role)
values
  -- Royals
  ('aaaaaaa1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Alice Captain', 'right_hand', 'right_arm_medium', 'all_rounder'),
  ('aaaaaaa1-0000-0000-0000-000000000002', null, 'Ravi Royal',  'right_hand', 'right_arm_offbreak', 'batter'),
  ('aaaaaaa1-0000-0000-0000-000000000003', null, 'Karan Royal', 'left_hand',  'left_arm_fast',      'bowler'),
  -- Strikers
  ('bbbbbbb2-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Bob Organizer', 'right_hand', 'right_arm_fast', 'bowler'),
  ('bbbbbbb2-0000-0000-0000-000000000002', null, 'Sam Striker',  'right_hand', 'right_arm_legbreak', 'all_rounder'),
  ('bbbbbbb2-0000-0000-0000-000000000003', null, 'Dev Striker',  'left_hand',  'left_arm_orthodox',  'wk_batter')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- tournament (organized by Bob) + both teams enrolled
-- ----------------------------------------------------------------------------
insert into public.tournaments (id, name, format, match_format, organizer_id, start_date, end_date, is_public)
values (
  '44444444-4444-4444-4444-444444444444',
  'CricScore Cup 2026', 'league', 'T20',
  '00000000-0000-0000-0000-0000000000b2',
  date '2026-07-01', date '2026-07-15', true
)
on conflict (id) do nothing;

insert into public.tournament_teams (tournament_id, team_id, group_name, seed)
values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'A', 1),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'A', 2)
on conflict (tournament_id, team_id) do nothing;

-- ----------------------------------------------------------------------------
-- one scheduled T20 match (Royals vs Strikers), Alice as scorer.
-- rules snapshot mirrors DEFAULT_T20_RULES from src/domain/cricket/match.ts.
-- ----------------------------------------------------------------------------
insert into public.matches (
  id, tournament_id, venue_id, format, status,
  team_a_id, team_b_id, rules, playing_xi,
  scheduled_at, scorer_id, created_by
)
values (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'T20', 'scheduled',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '{
    "oversPerInnings": 20,
    "ballsPerOver": 6,
    "maxOversPerBowler": 4,
    "playersPerSide": 11,
    "freeHitOnNoBall": true,
    "noBallPenalty": 1,
    "widePenalty": 1,
    "powerplayOvers": [{ "from": 0, "to": 6 }],
    "superOverOnTie": true
  }'::jsonb,
  '{
    "team_a": [
      "aaaaaaa1-0000-0000-0000-000000000001",
      "aaaaaaa1-0000-0000-0000-000000000002",
      "aaaaaaa1-0000-0000-0000-000000000003"
    ],
    "team_b": [
      "bbbbbbb2-0000-0000-0000-000000000001",
      "bbbbbbb2-0000-0000-0000-000000000002",
      "bbbbbbb2-0000-0000-0000-000000000003"
    ]
  }'::jsonb,
  timestamptz '2026-07-01 14:00:00+05:30',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1'
)
on conflict (id) do nothing;
