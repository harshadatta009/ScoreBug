-- ============================================================================
-- CricScore — Database functions & triggers
-- ----------------------------------------------------------------------------
-- IMPORTANT SOURCE-OF-TRUTH NOTE:
--   The TypeScript scoring engine (src/domain/cricket) is the authoritative
--   source of truth for LIVE match state — it replays the ordered ball events
--   to produce the live scorecard the UI renders. The aggregates maintained
--   here (overs rows, player_statistics, team_statistics) are *derived
--   conveniences* for fast reads, leaderboards and career rollups. They are
--   recomputed FROM balls so they always reconcile to the event log, but the
--   client never depends on them for in-progress scoring correctness.
--
--   All rollup/maintenance functions are SECURITY DEFINER with a pinned
--   search_path so they can write the stats tables (which have deny-all write
--   RLS) and traverse related tables without being blocked by RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) handle_new_user — mirror an auth.users row into public.users on signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
comment on function public.handle_new_user() is
  'Creates the public.users profile when an auth.users row is inserted. SECURITY DEFINER: runs as owner to write past users RLS on signup.';

-- Trigger lives on the auth schema (Supabase-managed); idempotent re-create.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2) recompute_over — rebuild a single overs aggregate row from its balls.
--
-- Cricket semantics applied here:
--   * `runs`     = all runs that count to the over (bat runs + every extra:
--                  wides, no-balls, byes, leg-byes). This is the team total for
--                  the over, which is what an over-by-over strip displays.
--   * `wickets`  = deliveries on which a real dismissal occurred (retired_hurt
--                  is excluded — it is a not-out).
--   * `is_complete` = six LEGAL deliveries bowled (wides/no-balls don't count).
--                  ballsPerOver is read from the match rules snapshot, defaulting
--                  to 6 when unset.
--   * `is_maiden` = over is complete, conceded zero runs, and contained no
--                   wide/no-ball (byes/leg-byes off the bat still break a maiden
--                   only if runs were conceded — a bye does concede runs, so any
--                   run => not a maiden).
--   * `bowler_id` = bowler of the last legal delivery (overs have one bowler).
-- ----------------------------------------------------------------------------
create or replace function public.recompute_over(p_innings_id uuid, p_over_number int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balls_per_over int;
  v_total_runs     int;
  v_legal_balls    int;
  v_wickets        int;
  v_bowler         uuid;
  v_has_balls      boolean;
begin
  -- Resolve balls-per-over from the match rules snapshot (default 6).
  select coalesce((m.rules ->> 'ballsPerOver')::int, 6)
    into v_balls_per_over
  from public.innings i
  join public.matches m on m.id = i.match_id
  where i.id = p_innings_id;
  v_balls_per_over := coalesce(v_balls_per_over, 6);

  select
    coalesce(sum(b.bat_runs + b.extra_runs), 0),
    coalesce(sum(case when b.extra_type in ('wide', 'no_ball') then 0 else 1 end), 0),
    coalesce(sum(
      case
        when b.wicket_type is not null and b.wicket_type <> 'retired_hurt' then 1
        else 0
      end
    ), 0),
    (count(*) > 0)
  into v_total_runs, v_legal_balls, v_wickets, v_has_balls
  from public.balls b
  where b.innings_id = p_innings_id and b.over_number = p_over_number;

  -- No balls left for this over (e.g. all deleted) -> remove the aggregate row.
  if not v_has_balls then
    delete from public.overs
      where innings_id = p_innings_id and over_number = p_over_number;
    return;
  end if;

  -- Bowler of the latest delivery in the over.
  select b.bowler_id into v_bowler
  from public.balls b
  where b.innings_id = p_innings_id and b.over_number = p_over_number
  order by b.sequence desc
  limit 1;

  insert into public.overs (innings_id, over_number, bowler_id, runs, wickets, is_maiden, is_complete)
  values (
    p_innings_id,
    p_over_number,
    v_bowler,
    v_total_runs,
    v_wickets,
    (v_legal_balls >= v_balls_per_over and v_total_runs = 0),
    (v_legal_balls >= v_balls_per_over)
  )
  on conflict (innings_id, over_number) do update
    set bowler_id   = excluded.bowler_id,
        runs        = excluded.runs,
        wickets     = excluded.wickets,
        is_maiden   = excluded.is_maiden,
        is_complete = excluded.is_complete;
end;
$$;
comment on function public.recompute_over(uuid, int) is
  'Rebuilds the overs aggregate row for (innings, over) from balls. SECURITY DEFINER to write overs regardless of caller RLS; the balls trigger calls it.';

-- Trigger function: after any ball mutation, recompute the affected over(s).
-- On UPDATE the over_number may change, so recompute both old and new.
create or replace function public.trg_balls_recompute_over()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_over(old.innings_id, old.over_number);
    return old;
  end if;

  perform public.recompute_over(new.innings_id, new.over_number);

  if (tg_op = 'UPDATE'
      and (old.innings_id <> new.innings_id or old.over_number <> new.over_number)) then
    perform public.recompute_over(old.innings_id, old.over_number);
  end if;

  return new;
end;
$$;
comment on function public.trg_balls_recompute_over() is
  'AFTER INSERT/UPDATE/DELETE on balls: keep the overs aggregate in sync. Recomputes old & new over on cross-over edits.';

drop trigger if exists trg_balls_overs_aggregate on public.balls;
create trigger trg_balls_overs_aggregate
  after insert or update or delete on public.balls
  for each row execute function public.trg_balls_recompute_over();

-- ----------------------------------------------------------------------------
-- 3) refresh_player_statistics — recompute one player's career aggregates.
--
-- Computed entirely from balls across all innings the player appears in:
--   batting  : as striker (runs off bat, balls faced excludes wides),
--   bowling  : as bowler (legal balls, runs conceded = bat + wide + no_ball
--              penalties, NOT byes/leg-byes which aren't charged to the bowler),
--   fielding : catches/stumpings/run-outs derived from wicket attribution.
-- `matches` and `innings_*` counts are derived from distinct innings appeared in.
-- ----------------------------------------------------------------------------
create or replace function public.refresh_player_statistics(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- batting
  v_runs        int;
  v_balls_faced int;
  v_fours       int;
  v_sixes       int;
  v_innings_bat int;
  v_high        int;
  -- bowling
  v_balls_bowled  int;
  v_runs_conceded int;
  v_wkts          int;
  v_innings_bowl  int;
  v_best          text;
  -- fielding
  v_catches  int;
  v_stumpings int;
  v_run_outs  int;
  -- appearances
  v_matches  int;
begin
  -- Batting: striker rows. Balls faced excludes wides (batter doesn't face a wide).
  select
    coalesce(sum(b.bat_runs), 0),
    coalesce(sum(case when b.extra_type = 'wide' then 0 else 1 end), 0),
    coalesce(sum(case when b.bat_runs = 4 then 1 else 0 end), 0),
    coalesce(sum(case when b.bat_runs = 6 then 1 else 0 end), 0)
  into v_runs, v_balls_faced, v_fours, v_sixes
  from public.balls b
  where b.striker_id = p_player_id;

  select count(distinct b.innings_id)
    into v_innings_bat
  from public.balls b
  where b.striker_id = p_player_id;

  -- Highest score in a single innings (runs off the bat per innings as striker).
  select coalesce(max(per.r), 0) into v_high
  from (
    select b.innings_id, sum(b.bat_runs) as r
    from public.balls b
    where b.striker_id = p_player_id
    group by b.innings_id
  ) per;

  -- Bowling: bowler rows. Legal balls exclude wides/no-balls.
  select
    coalesce(sum(case when b.extra_type in ('wide', 'no_ball') then 0 else 1 end), 0),
    coalesce(sum(
      b.bat_runs
      + case when b.extra_type in ('wide', 'no_ball') then b.extra_runs else 0 end
    ), 0),
    coalesce(sum(
      case when b.wicket_type is not null
            and b.wicket_type in ('bowled','caught','lbw','stumped','hit_wicket')
           then 1 else 0 end
    ), 0)
  into v_balls_bowled, v_runs_conceded, v_wkts
  from public.balls b
  where b.bowler_id = p_player_id;

  select count(distinct b.innings_id)
    into v_innings_bowl
  from public.balls b
  where b.bowler_id = p_player_id;

  -- Best bowling figures (most wickets; ties broken by fewest runs), as "W/R".
  select bb.w || '/' || bb.r into v_best
  from (
    select
      b.innings_id,
      sum(case when b.wicket_type in ('bowled','caught','lbw','stumped','hit_wicket')
               then 1 else 0 end) as w,
      sum(b.bat_runs
          + case when b.extra_type in ('wide','no_ball') then b.extra_runs else 0 end) as r
    from public.balls b
    where b.bowler_id = p_player_id
    group by b.innings_id
  ) bb
  order by bb.w desc, bb.r asc
  limit 1;

  -- Fielding. Catches: caught & this player is a credited fielder (not the bowler
  -- in caught-and-bowled we still count the catch). Stumpings: stumped + fielder.
  -- Run-outs: run_out + fielder involved.
  select
    coalesce(sum(case when b.wicket_type = 'caught'
                       and p_player_id = any(b.fielder_ids) then 1 else 0 end), 0),
    coalesce(sum(case when b.wicket_type = 'stumped'
                       and p_player_id = any(b.fielder_ids) then 1 else 0 end), 0),
    coalesce(sum(case when b.wicket_type = 'run_out'
                       and p_player_id = any(b.fielder_ids) then 1 else 0 end), 0)
  into v_catches, v_stumpings, v_run_outs
  from public.balls b;

  -- Matches appeared in (distinct matches across any role).
  select count(distinct i.match_id) into v_matches
  from public.balls b
  join public.innings i on i.id = b.innings_id
  where b.striker_id = p_player_id
     or b.non_striker_id = p_player_id
     or b.bowler_id = p_player_id;

  insert into public.player_statistics (
    player_id, matches, innings_batted, runs, balls_faced, fours, sixes,
    highest_score, not_outs, fifties, hundreds,
    innings_bowled, balls_bowled, runs_conceded, wickets, best_bowling,
    catches, stumpings, run_outs, updated_at
  )
  values (
    p_player_id, v_matches, v_innings_bat, v_runs, v_balls_faced, v_fours, v_sixes,
    v_high,
    0, -- not_outs: requires innings-end dismissal state; left to a later pass
    0, -- fifties
    0, -- hundreds
    v_innings_bowl, v_balls_bowled, v_runs_conceded, v_wkts, v_best,
    v_catches, v_stumpings, v_run_outs, now()
  )
  on conflict (player_id) do update set
    matches        = excluded.matches,
    innings_batted = excluded.innings_batted,
    runs           = excluded.runs,
    balls_faced    = excluded.balls_faced,
    fours          = excluded.fours,
    sixes          = excluded.sixes,
    highest_score  = excluded.highest_score,
    innings_bowled = excluded.innings_bowled,
    balls_bowled   = excluded.balls_bowled,
    runs_conceded  = excluded.runs_conceded,
    wickets        = excluded.wickets,
    best_bowling   = excluded.best_bowling,
    catches        = excluded.catches,
    stumpings      = excluded.stumpings,
    run_outs       = excluded.run_outs,
    updated_at     = now();
end;
$$;
comment on function public.refresh_player_statistics(uuid) is
  'Career batting/bowling/fielding rollup for a player, computed from balls. SECURITY DEFINER (stats tables are deny-all write under RLS). The live scorecard comes from the TS engine; this is for career aggregates/leaderboards.';

-- ----------------------------------------------------------------------------
-- 4) refresh_team_statistics — wins/losses + runs for/against from completed
--    matches. runs_for/balls_faced come from innings the team batted; the
--    against side from innings it bowled. Win/loss read off matches result.
-- ----------------------------------------------------------------------------
create or replace function public.refresh_team_statistics(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matches int;
  v_wins    int;
  v_losses  int;
  v_ties    int;
  v_nr      int;
  v_runs_for     int;
  v_balls_faced  int;
  v_runs_against int;
  v_balls_bowled int;
begin
  -- Result tallies from completed matches the team played in.
  select
    count(*) filter (where m.status in ('completed','no_result','abandoned')),
    count(*) filter (where m.winner_team_id = p_team_id),
    count(*) filter (where m.status = 'completed'
                       and m.winner_team_id is not null
                       and m.winner_team_id <> p_team_id),
    count(*) filter (where m.status = 'completed' and m.winner_team_id is null),
    count(*) filter (where m.status in ('no_result','abandoned'))
  into v_matches, v_wins, v_losses, v_ties, v_nr
  from public.matches m
  where m.team_a_id = p_team_id or m.team_b_id = p_team_id;

  -- Batting side aggregates (innings where this team batted).
  select
    coalesce(sum(b.bat_runs + b.extra_runs), 0),
    coalesce(sum(case when b.extra_type in ('wide','no_ball') then 0 else 1 end), 0)
  into v_runs_for, v_balls_faced
  from public.innings i
  join public.balls b on b.innings_id = i.id
  where i.batting_team_id = p_team_id;

  -- Bowling side aggregates (innings where this team bowled).
  select
    coalesce(sum(b.bat_runs + b.extra_runs), 0),
    coalesce(sum(case when b.extra_type in ('wide','no_ball') then 0 else 1 end), 0)
  into v_runs_against, v_balls_bowled
  from public.innings i
  join public.balls b on b.innings_id = i.id
  where i.bowling_team_id = p_team_id;

  insert into public.team_statistics (
    team_id, matches, wins, losses, ties, no_results,
    runs_for, balls_faced, runs_against, balls_bowled, updated_at
  )
  values (
    p_team_id, v_matches, v_wins, v_losses, v_ties, v_nr,
    v_runs_for, v_balls_faced, v_runs_against, v_balls_bowled, now()
  )
  on conflict (team_id) do update set
    matches      = excluded.matches,
    wins         = excluded.wins,
    losses       = excluded.losses,
    ties         = excluded.ties,
    no_results   = excluded.no_results,
    runs_for     = excluded.runs_for,
    balls_faced  = excluded.balls_faced,
    runs_against = excluded.runs_against,
    balls_bowled = excluded.balls_bowled,
    updated_at   = now();
end;
$$;
comment on function public.refresh_team_statistics(uuid) is
  'Team W/L + runs-for/against rollup from matches & balls. SECURITY DEFINER (stats tables are deny-all write under RLS).';

-- ----------------------------------------------------------------------------
-- 5) Net run rate — points-table helper.
--    NRR = (runs_for / overs_faced) - (runs_against / overs_bowled), where overs
--    are legal-balls/ballsPerOver. We expose it as a view over team_statistics
--    (assumes 6 balls/over for the leaderboard; per-match revised overs are a
--    DLS concern handled in the engine). Guards against divide-by-zero.
-- ----------------------------------------------------------------------------
create or replace view public.team_net_run_rate as
select
  ts.team_id,
  ts.matches,
  ts.wins,
  ts.losses,
  ts.ties,
  ts.no_results,
  -- 2 points per win, 1 per tie/no-result (standard league scoring).
  (ts.wins * 2 + ts.ties + ts.no_results) as points,
  ts.runs_for,
  ts.runs_against,
  round((ts.balls_faced / 6.0)::numeric, 2)  as overs_faced,
  round((ts.balls_bowled / 6.0)::numeric, 2) as overs_bowled,
  case
    when ts.balls_faced = 0 or ts.balls_bowled = 0 then 0::numeric
    else round(
      (ts.runs_for   / (ts.balls_faced  / 6.0))
      - (ts.runs_against / (ts.balls_bowled / 6.0))
    , 3)
  end as net_run_rate
from public.team_statistics ts;
comment on view public.team_net_run_rate is
  'Points-table helper: league points and NRR from team_statistics. Assumes 6 balls/over; DLS-revised targets are handled by the TS engine, not here.';

-- ----------------------------------------------------------------------------
-- 6) Audit trigger — record updates to matches & teams into audit_logs.
--    SECURITY DEFINER so it can insert audit rows regardless of caller; actor is
--    auth.uid() (null for service-role/system writes).
-- ----------------------------------------------------------------------------
create or replace function public.trg_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (
    v_actor,
    lower(tg_op),              -- 'update' / 'insert' / 'delete'
    tg_table_name,             -- 'matches' | 'teams'
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;
comment on function public.trg_write_audit_log() is
  'Generic audit writer for matches/teams. SECURITY DEFINER to write audit_logs past RLS; records auth.uid() as actor.';

drop trigger if exists trg_matches_audit on public.matches;
create trigger trg_matches_audit
  after update on public.matches
  for each row execute function public.trg_write_audit_log();

drop trigger if exists trg_teams_audit on public.teams;
create trigger trg_teams_audit
  after update on public.teams
  for each row execute function public.trg_write_audit_log();
