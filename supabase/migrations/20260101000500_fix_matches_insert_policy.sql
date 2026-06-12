-- ============================================================================
-- Fix: matches INSERT policy
-- ----------------------------------------------------------------------------
-- The deployed matches INSERT policy was stricter than the ownership model
-- intends (it blocked an authenticated user from creating their own match
-- unless they were already a team admin / tournament organizer), producing
-- "new row violates row-level security policy for table matches".
--
-- Align it with how teams/tournaments/players already behave: ANY authenticated
-- user may create a match, provided they record themselves as the creator.
-- Per-resource authority for later mutations is still enforced by
-- matches_update / matches_delete (scorer/creator/super_admin).
-- ============================================================================

drop policy if exists matches_insert_authed on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_write on public.matches;

create policy matches_insert_authed on public.matches
  for insert
  with check (auth.uid() is not null and created_by = auth.uid());
