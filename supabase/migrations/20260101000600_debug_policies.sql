-- TEMP introspection helper (dropped in a later migration). Lets us read the
-- live policy definitions on public.matches via RPC to diagnose an RLS reject.
create or replace function public._debug_match_policies()
returns table(
  polname text,
  cmd text,
  permissive boolean,
  roles text,
  using_expr text,
  check_expr text
)
language sql
security definer
set search_path = public
as $$
  select
    pol.polname::text,
    case pol.polcmd
      when 'r' then 'select' when 'a' then 'insert'
      when 'w' then 'update' when 'd' then 'delete' else 'all' end,
    pol.polpermissive,
    (select string_agg(rolname, ',') from pg_roles where oid = any(pol.polroles)),
    pg_get_expr(pol.polqual, pol.polrelid),
    pg_get_expr(pol.polwithcheck, pol.polrelid)
  from pg_policy pol
  where pol.polrelid = 'public.matches'::regclass;
$$;

grant execute on function public._debug_match_policies() to anon, authenticated, service_role;
