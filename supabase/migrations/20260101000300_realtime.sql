-- ============================================================================
-- CricScore — Realtime publication
-- ----------------------------------------------------------------------------
-- The PWA subscribes to live ball-by-ball updates. We add only the tables that
-- drive the live experience to the supabase_realtime publication:
--   * balls         — every delivery (the core live feed)
--   * innings       — innings open/close, target/revised-overs changes
--   * matches       — status/toss/result transitions
--   * notifications — per-user push/in-app alerts
--
-- RLS still governs what each subscriber may receive: realtime evaluates the
-- SELECT policies above, so a client only streams rows it is allowed to read.
--
-- REPLICA IDENTITY FULL is set on balls/innings/matches so UPDATE/DELETE events
-- include the full OLD row — the client diffs need pre-image columns (e.g. to
-- locate a corrected ball by its previous over/sequence). Without this, only
-- the primary key is shipped for the old image.
--
-- Idempotent: guarded so re-running the migration won't error if a table is
-- already a member of the publication.
-- ============================================================================

do $$
begin
  -- balls
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'balls'
  ) then
    alter publication supabase_realtime add table public.balls;
  end if;

  -- innings
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'innings'
  ) then
    alter publication supabase_realtime add table public.innings;
  end if;

  -- matches
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  -- notifications
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- Ship full OLD-row images for update/delete diffs on the live tables.
alter table public.balls    replica identity full;
alter table public.innings  replica identity full;
alter table public.matches  replica identity full;
