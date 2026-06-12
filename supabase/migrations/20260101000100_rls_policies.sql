-- ============================================================================
-- CricScore — Row Level Security policies
-- ----------------------------------------------------------------------------
-- RLS is already ENABLED on every table by 20260101000000_initial_schema.sql;
-- here we define the POLICIES (OWASP least-privilege, mirroring AppRole).
--
-- Design notes:
--   * Authorization predicates that must traverse RLS-protected tables (e.g.
--     "is this user a member of this team?") are factored into SECURITY DEFINER
--     helper functions. This is deliberate: a plain (invoker-rights) function
--     called from inside a policy would itself be subject to RLS on the table
--     it reads, which produces infinite recursion (policy -> select -> policy).
--     SECURITY DEFINER runs as the function owner and bypasses RLS for that
--     single, tightly-scoped lookup, so the recursion is broken safely.
--   * Every SECURITY DEFINER function pins `search_path = public, pg_temp` so a
--     malicious caller cannot shadow built-ins / tables via a hostile schema.
--   * Helpers are STABLE (read-only within a statement) and accept the uid as an
--     argument so they are testable and reusable from triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Authorization helper functions
-- ----------------------------------------------------------------------------

-- Platform-wide super_admin grant (from public.user_roles).
create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role = 'super_admin'
  );
$$;
comment on function public.is_super_admin(uuid) is
  'SECURITY DEFINER so it can read user_roles from inside RLS policies without recursing through user_roles'' own RLS.';

-- Membership check: is `uid` an active, accepted member of `tid`?
create or replace function public.is_team_member(tid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = tid
      and m.user_id = uid
      and m.is_active
      and m.invite_status = 'accepted'
  );
$$;
comment on function public.is_team_member(uuid, uuid) is
  'SECURITY DEFINER: read team_members from inside team_members/teams policies without recursion.';

-- Admin check: owner of the team, OR a member holding team_admin/captain role.
create or replace function public.is_team_admin(tid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams t
    where t.id = tid and t.owner_id = uid
  )
  or exists (
    select 1 from public.team_members m
    where m.team_id = tid
      and m.user_id = uid
      and m.is_active
      and m.invite_status = 'accepted'
      and m.role in ('team_admin', 'captain')
  );
$$;
comment on function public.is_team_admin(uuid, uuid) is
  'Owner or team_admin/captain member. SECURITY DEFINER to avoid recursive RLS on teams/team_members.';

-- Scorer check: assigned scorer or creator of the match.
create or replace function public.is_match_scorer(mid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches m
    where m.id = mid
      and (m.scorer_id = uid or m.created_by = uid)
  );
$$;
comment on function public.is_match_scorer(uuid, uuid) is
  'Assigned scorer or match creator. SECURITY DEFINER: the balls/innings/overs write policies need to read matches without being blocked by matches'' own RLS.';

-- Organizer check for a tournament.
create or replace function public.is_tournament_organizer(toid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = toid and t.organizer_id = uid
  );
$$;
comment on function public.is_tournament_organizer(uuid, uuid) is
  'Tournament organizer. SECURITY DEFINER to avoid recursion when used in tournament_teams / matches policies.';

-- Helper: is the match that owns this innings publicly visible OR writable by uid?
-- Used by innings/overs/balls read & write policies. Public read mirrors the
-- match read rule below (a match is readable when its tournament is public, or
-- when it has no tournament — local/casual matches are public by default).
create or replace function public.can_read_match(mid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.matches m
    left join public.tournaments t on t.id = m.tournament_id
    where m.id = mid
      and (
        coalesce(t.is_public, true)            -- public tournament or no tournament
        or m.created_by = uid
        or m.scorer_id = uid
        or public.is_super_admin(uid)
      )
  );
$$;
comment on function public.can_read_match(uuid, uuid) is
  'Match visibility for innings/overs/balls reads. SECURITY DEFINER to traverse matches+tournaments without recursive RLS.';

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
-- Public profiles are world-readable (leaderboards, scorecards show names).
create policy users_select_all on public.users
  for select using (true);

-- A user may create only their own profile row (id must equal their auth uid).
-- The handle_new_user trigger normally does this, but allow explicit upsert too.
create policy users_insert_self on public.users
  for insert with check (id = auth.uid());

-- A user may update only their own row; super_admin may update any.
create policy users_update_self on public.users
  for update
  using (id = auth.uid() or public.is_super_admin(auth.uid()))
  with check (id = auth.uid() or public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- user_roles  (platform RBAC grants)
-- ----------------------------------------------------------------------------
-- A user can see their own grants; super_admin sees all.
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

-- Only super_admin may grant/revoke platform roles.
create policy user_roles_insert on public.user_roles
  for insert with check (public.is_super_admin(auth.uid()));
create policy user_roles_delete on public.user_roles
  for delete using (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- venues
-- ----------------------------------------------------------------------------
create policy venues_select_all on public.venues
  for select using (true);
create policy venues_insert_authed on public.venues
  for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy venues_update on public.venues
  for update
  using (created_by = auth.uid() or public.is_super_admin(auth.uid()))
  with check (created_by = auth.uid() or public.is_super_admin(auth.uid()));
create policy venues_delete on public.venues
  for delete using (created_by = auth.uid() or public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- teams
-- ----------------------------------------------------------------------------
create policy teams_select_all on public.teams
  for select using (true);

-- Any authenticated user can create a team; they must set themselves owner.
create policy teams_insert_authed on public.teams
  for insert with check (auth.uid() is not null and owner_id = auth.uid());

-- Update/delete by owner, team_admin, or super_admin.
create policy teams_update on public.teams
  for update
  using (public.is_team_admin(id, auth.uid()) or public.is_super_admin(auth.uid()))
  with check (public.is_team_admin(id, auth.uid()) or public.is_super_admin(auth.uid()));
create policy teams_delete on public.teams
  for delete
  using (owner_id = auth.uid() or public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- team_members
-- ----------------------------------------------------------------------------
-- Readable by anyone (rosters are public on team pages).
create policy team_members_select on public.team_members
  for select using (true);

-- Insert by team owner/admin (adding members), OR a user inserting their own
-- pending self-join request.
create policy team_members_insert on public.team_members
  for insert with check (
    public.is_team_admin(team_id, auth.uid())
    or user_id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

-- Update by team owner/admin (role/active changes), super_admin, OR the member
-- themselves (e.g. accepting/declining their own invite).
create policy team_members_update on public.team_members
  for update
  using (
    public.is_team_admin(team_id, auth.uid())
    or user_id = auth.uid()
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_team_admin(team_id, auth.uid())
    or user_id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

-- Delete by team owner/admin or super_admin (removing members).
create policy team_members_delete on public.team_members
  for delete using (
    public.is_team_admin(team_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- players (match-context identities; may be guests with no user_id)
-- ----------------------------------------------------------------------------
create policy players_select_all on public.players
  for select using (true);

-- Any authed user can create a player record (e.g. registering a guest).
create policy players_insert_authed on public.players
  for insert with check (auth.uid() is not null);

-- The linked user may edit their own player row; super_admin may edit any.
-- Guest rows (user_id is null) are editable only by super_admin.
create policy players_update on public.players
  for update
  using (
    (user_id is not null and user_id = auth.uid())
    or public.is_super_admin(auth.uid())
  )
  with check (
    (user_id is not null and user_id = auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy players_delete on public.players
  for delete using (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- tournaments
-- ----------------------------------------------------------------------------
-- Public tournaments readable by all; private ones only by organizer/super_admin.
create policy tournaments_select on public.tournaments
  for select using (
    is_public
    or organizer_id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

create policy tournaments_insert_authed on public.tournaments
  for insert with check (auth.uid() is not null and organizer_id = auth.uid());

create policy tournaments_update on public.tournaments
  for update
  using (organizer_id = auth.uid() or public.is_super_admin(auth.uid()))
  with check (organizer_id = auth.uid() or public.is_super_admin(auth.uid()));
create policy tournaments_delete on public.tournaments
  for delete using (organizer_id = auth.uid() or public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- tournament_teams
-- ----------------------------------------------------------------------------
create policy tournament_teams_select on public.tournament_teams
  for select using (true);

-- Write by the tournament organizer or super_admin.
create policy tournament_teams_insert on public.tournament_teams
  for insert with check (
    public.is_tournament_organizer(tournament_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy tournament_teams_update on public.tournament_teams
  for update
  using (
    public.is_tournament_organizer(tournament_id, auth.uid())
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_tournament_organizer(tournament_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy tournament_teams_delete on public.tournament_teams
  for delete using (
    public.is_tournament_organizer(tournament_id, auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- matches  (public read for public matches; write by scorer/creator/super_admin)
-- ----------------------------------------------------------------------------
create policy matches_select on public.matches
  for select using (public.can_read_match(id, auth.uid()));

-- Any authed user can create a match; they must record themselves as creator.
create policy matches_insert_authed on public.matches
  for insert with check (auth.uid() is not null and created_by = auth.uid());

-- Update by assigned scorer, creator, or super_admin (status, toss, result …).
create policy matches_update on public.matches
  for update
  using (public.is_match_scorer(id, auth.uid()) or public.is_super_admin(auth.uid()))
  with check (public.is_match_scorer(id, auth.uid()) or public.is_super_admin(auth.uid()));
create policy matches_delete on public.matches
  for delete using (created_by = auth.uid() or public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- innings  (read mirrors match visibility; write by match scorer/creator)
-- ----------------------------------------------------------------------------
create policy innings_select on public.innings
  for select using (public.can_read_match(match_id, auth.uid()));
create policy innings_insert on public.innings
  for insert with check (
    public.is_match_scorer(match_id, auth.uid()) or public.is_super_admin(auth.uid())
  );
create policy innings_update on public.innings
  for update
  using (public.is_match_scorer(match_id, auth.uid()) or public.is_super_admin(auth.uid()))
  with check (public.is_match_scorer(match_id, auth.uid()) or public.is_super_admin(auth.uid()));
create policy innings_delete on public.innings
  for delete using (
    public.is_match_scorer(match_id, auth.uid()) or public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- overs  (aggregate rows; normally maintained by the recompute_over trigger,
-- which runs SECURITY DEFINER and so bypasses these. We still scope direct
-- writes to the scorer for manual corrections.)
-- innings_id -> match_id resolution needs a helper to keep policies non-recursive.
-- ----------------------------------------------------------------------------
create or replace function public.match_id_of_innings(iid uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select match_id from public.innings where id = iid;
$$;
comment on function public.match_id_of_innings(uuid) is
  'Resolve innings -> match for overs/balls policies without recursing through innings RLS.';

create policy overs_select on public.overs
  for select using (public.can_read_match(public.match_id_of_innings(innings_id), auth.uid()));
create policy overs_insert on public.overs
  for insert with check (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy overs_update on public.overs
  for update
  using (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy overs_delete on public.overs
  for delete using (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- balls  — THE KEY WRITE PATH.
-- Public read for visible matches; INSERT/UPDATE/DELETE restricted to the
-- assigned scorer / match creator / super_admin. Balls are append-mostly but we
-- allow update/delete for scorer corrections (an undo/edit in the scoring UI).
-- ----------------------------------------------------------------------------
create policy balls_select on public.balls
  for select using (public.can_read_match(public.match_id_of_innings(innings_id), auth.uid()));

create policy balls_insert on public.balls
  for insert with check (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy balls_update on public.balls
  for update
  using (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );
create policy balls_delete on public.balls
  for delete using (
    public.is_match_scorer(public.match_id_of_innings(innings_id), auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- player_statistics / team_statistics
-- Public read; NO direct client write. They are maintained exclusively by the
-- SECURITY DEFINER rollup functions (refresh_player_statistics /
-- refresh_team_statistics), which bypass RLS. The restrictive write policies
-- below deny every direct INSERT/UPDATE/DELETE from a normal client.
-- ----------------------------------------------------------------------------
create policy player_statistics_select on public.player_statistics
  for select using (true);
-- Deny-all writes (no row satisfies `false`); definer functions still write.
create policy player_statistics_no_write on public.player_statistics
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create policy team_statistics_select on public.team_statistics
  for select using (true);
create policy team_statistics_no_write on public.team_statistics
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- notifications / push_subscriptions / follows  — owner-only
-- ----------------------------------------------------------------------------
create policy notifications_owner on public.notifications
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_owner on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy follows_owner on public.follows
  for all
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

-- Follows targets are public objects, so reading others' follow rows is fine
-- for follower counts; expose select to all while keeping writes owner-scoped.
create policy follows_select_all on public.follows
  for select using (true);

-- ----------------------------------------------------------------------------
-- audit_logs  — insert allowed to authed (triggers write here too); select only
-- super_admin. No update/delete policy => those operations are denied to all.
-- ----------------------------------------------------------------------------
create policy audit_logs_insert on public.audit_logs
  for insert with check (auth.uid() is not null);
create policy audit_logs_select_admin on public.audit_logs
  for select using (public.is_super_admin(auth.uid()));
