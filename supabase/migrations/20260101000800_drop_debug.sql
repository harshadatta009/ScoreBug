-- Remove the temporary RLS introspection helpers used to diagnose the
-- matches INSERT policy issue (fixed in 20260101000500).
drop function if exists public._debug_match_policies();
drop function if exists public._debug_whoami();
drop function if exists public._debug_policies(text);
