-- TEMP introspection (dropped later). Reports what the DB sees for the caller.
create or replace function public._debug_whoami()
returns jsonb language sql stable
as $$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'auth_role', auth.role(),
    'current_user', current_user,
    'jwt_sub', (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
    'jwt_role', (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
$$;
grant execute on function public._debug_whoami() to anon, authenticated, service_role;

-- generic: list policies for any public table
create or replace function public._debug_policies(tbl text)
returns table(polname text, cmd text, permissive boolean, check_expr text, using_expr text)
language sql security definer set search_path = public
as $$
  select pol.polname::text,
    case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
    pol.polpermissive,
    pg_get_expr(pol.polwithcheck, pol.polrelid),
    pg_get_expr(pol.polqual, pol.polrelid)
  from pg_policy pol
  where pol.polrelid = ('public.'||tbl)::regclass;
$$;
grant execute on function public._debug_policies(text) to anon, authenticated, service_role;
