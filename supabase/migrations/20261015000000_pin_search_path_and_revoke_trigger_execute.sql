-- Phase 13: defense-in-depth database hardening — closes two Supabase
-- advisor findings surfaced during Phase 12's post-migration verification.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if you
-- have the project linked with the Supabase CLI. NOT applied by this
-- commit — for review first, same process as every migration since Phase 6.
-- Purely additive/behavior-preserving: no table, RLS policy, or application
-- data is touched.
--
-- ===========================================================================
-- FINDING 1 — trigger functions directly callable via PostgREST RPC
-- ===========================================================================
-- The Supabase advisor (`anon_security_definer_function_executable` /
-- `authenticated_security_definer_function_executable`) flags
-- `public.handle_new_user()` (Phase 2) and `public.track_signup_analytics()`
-- (Phase 12) as callable by `anon`/`authenticated` via
-- `/rest/v1/rpc/handle_new_user` and `/rest/v1/rpc/track_signup_analytics`.
-- Live-verified during Phase 12's post-migration verification that this is
-- NOT actually exploitable: both are `returns trigger` functions, and
-- Postgres refuses to execute a `RETURNS TRIGGER` function outside of an
-- actual trigger context ("trigger functions can only be called as
-- triggers") — a direct RPC call fails immediately, before the function
-- body ever runs. Revoking EXECUTE here is defense in depth, not a fix for
-- a reachable path, and does NOT affect the triggers themselves — Postgres
-- invokes a trigger function via its own trigger-execution mechanism,
-- which is independent of the invoking role's EXECUTE grant. signup and
-- signup_completed analytics continue to work exactly as before.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.track_signup_analytics() from public, anon, authenticated;

-- ===========================================================================
-- FINDING 2 — set_updated_at() has a mutable search_path
-- ===========================================================================
-- The Supabase advisor (`function_search_path_mutable`) flags
-- `public.set_updated_at()` (Phase 2, applied in
-- 20260922093000_create_profiles.sql) for not pinning `search_path`. Its
-- body references no table or other object at all (it only reads/writes
-- `new.updated_at`, a value already bound to the invoking trigger's row
-- type), so pinning search_path cannot change its behavior in any way —
-- this closes the advisory purely defensively, consistent with every other
-- function in this schema (credit_ledger_apply, check_rate_limit,
-- track_signup_analytics) already pinning search_path from the start.
-- Re-attached to every table that already uses it via `create trigger ...
-- execute function public.set_updated_at()` — CREATE OR REPLACE preserves
-- every existing trigger binding, no trigger needs to be recreated.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
