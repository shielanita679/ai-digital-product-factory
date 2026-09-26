-- Phase 12: admin authorization, first-party analytics, DB-backed rate
-- limiting, and centralized error logging.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if you
-- have the project linked with the Supabase CLI. NOT applied by this
-- commit — for review first, same process as every migration since Phase 6.
-- Additive only: adds one column to the already-applied `profiles` table
-- (20260922093000) and four new tables/functions. Does not alter any other
-- existing table, policy, or function from Phases 1-11.
--
-- ===========================================================================
-- WHY THE `profiles` UPDATE GRANT IS BEING NARROWED HERE — READ FIRST
-- ===========================================================================
-- `profiles`'s existing RLS UPDATE policy (20260922093000_create_profiles.sql:31-35)
-- is `using (auth.uid() = id) with check (auth.uid() = id)` — a ROW-level
-- check only. Supabase's project-level default privileges grant table-wide
-- UPDATE on every column to `authenticated` (the same "grants happen at the
-- privilege level, independent of RLS" gotcha already documented for
-- function EXECUTE grants in 20261004000000_create_billing_credits.sql's
-- own security-fix comment) — so without this migration, adding a `role`
-- column to `profiles` would let any authenticated user self-promote via a
-- direct PostgREST `PATCH /profiles?id=eq.<self> {"role":"admin"}` call,
-- since RLS's row check would pass (it IS their own row) and nothing would
-- stop the column write. Postgres enforces column-level privileges
-- independently of RLS, so REVOKE-then-GRANT-a-column-allowlist below closes
-- this: `role` (and `id`/`email`/`created_at`) become physically unwritable
-- by `authenticated`/`anon` regardless of the row-level policy. This is the
-- same defense-in-depth shape as the Phase 11 credit RPC fix, applied at the
-- column-grant layer instead of the function-execute layer. Admin status is
-- therefore only ever changed by a service-role client, out-of-band (see
-- docs/PHASE_12.md for the exact SQL an operator runs) — never through any
-- app code path, and never self-assignable.

alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin'));

comment on column public.profiles.role is
  'Server-controlled authorization role. Default ''user'' for every new
   signup. Changed ONLY via a service-role client, out-of-band (see
   docs/PHASE_12.md) — never through application code, and never
   self-assignable: see this migration''s column-grant fix below, which
   revokes UPDATE on this column from authenticated/anon entirely.
   src/lib/auth/admin.ts''s requireAdmin() re-reads this column from the
   database on every request; it is never cached or trusted from client
   input.';

revoke update on public.profiles from authenticated, anon;

grant update (full_name, avatar_url, sells_what, sells_where, monthly_product_volume, onboarding_completed)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- analytics_events — first-party product analytics, append-only.
-- ---------------------------------------------------------------------------
-- Written exclusively by AnalyticsService.track() (src/lib/analytics/
-- analytics-service.ts) using the service-role client — never a direct
-- authenticated INSERT surface. RLS enabled with ZERO policies, same
-- zero-policy pattern as stripe_webhook_events
-- (20261004000000_create_billing_credits.sql:267-297): denies every
-- operation to every role but the table owner, regardless of the default
-- project-level table grant. event_name is restricted to the exact catalog
-- in src/config/analytics-events.ts — keep both lists in sync if the
-- catalog ever changes (a new additive migration, never an edit to this
-- CHECK). Never store passwords, tokens, API keys, Stripe secrets, raw
-- payment data, generated asset binary contents, or unnecessary personal
-- information in metadata — AnalyticsService enforces a size cap and a
-- forbidden-key-name check before every insert as defense in depth beyond
-- this table's own size CHECK.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,

  event_name text not null check (
    event_name in (
      'signup_completed',
      'onboarding_completed',
      'project_created',
      'generation_started',
      'generation_completed',
      'vectorization_completed',
      'bundle_created',
      'listing_generated',
      'package_created',
      'package_downloaded',
      'checkout_started',
      'subscription_activated'
    )
  ),

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint analytics_events_metadata_size check (char_length(metadata::text) < 2000)
);

comment on table public.analytics_events is
  'First-party, privacy-conscious product analytics. Written exclusively by
   AnalyticsService.track() via the service-role client. RLS enabled, zero
   policies — no authenticated/anon access of any kind today (no "view your
   own events" feature exists yet; add a narrow SELECT-own policy later if
   that changes). Read only via the admin analytics summary
   (requireAdmin() + service-role, bounded/counted queries only).';

create index if not exists idx_analytics_events_event_name_created_at
  on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_events_user_id_created_at
  on public.analytics_events (user_id, created_at desc);

alter table public.analytics_events enable row level security;

-- Separate trigger (NOT an edit to the already-applied handle_new_user()
-- function from 20260922093000) that records signup_completed the moment a
-- new auth.users row is created — fires regardless of email-confirmation
-- mode, matching signup itself rather than "first dashboard visit" (which
-- can be blocked entirely by the currently-deferred SMTP/confirmation
-- issue — see docs/PHASE_12.md's PRE-LAUNCH checklist). Swallows its own
-- errors so analytics can never block or fail a real signup.
create or replace function public.track_signup_analytics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.analytics_events (user_id, event_name, metadata)
  values (new.id, 'signup_completed', '{}'::jsonb);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_track_analytics on auth.users;

create trigger on_auth_user_created_track_analytics
  after insert on auth.users
  for each row
  execute function public.track_signup_analytics();

-- ---------------------------------------------------------------------------
-- rate_limits — fixed-window counters, written only via check_rate_limit().
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null check (
    operation in (
      'image_generation',
      'vectorization',
      'mockup_generation',
      'listing_generation',
      'package_generation',
      'stripe_checkout',
      'stripe_portal'
    )
  ),
  window_start timestamptz not null,
  count int not null default 0 check (count >= 0),

  constraint rate_limits_pkey primary key (user_id, operation, window_start)
);

comment on table public.rate_limits is
  'Fixed-window rate-limit counters. Written EXCLUSIVELY through the atomic
   check_rate_limit() SECURITY DEFINER function below — never read-then-write
   from application code, which would otherwise race under concurrent
   serverless invocations (no reliable in-process shared state on
   Vercel-style deployments). RLS enabled, zero policies, same pattern as
   stripe_webhook_events/analytics_events. Rows accumulate one per
   user/operation/window with no automatic cleanup yet — acceptable at
   current scale; see src/config/rate-limits.ts''s doc comment for the
   documented future cleanup/Redis-Upstash upgrade path.';

alter table public.rate_limits enable row level security;

-- SECURITY DEFINER, service-role only — same established pattern as
-- credit_ledger_apply (20261004000000_create_billing_credits.sql:352-490):
-- pinned search_path, every column reference table-qualified
-- (rate_limits.count, never a bare `count`) to avoid the Phase 7 shadowing
-- hazard, and a three-role REVOKE (public, anon, authenticated) — naming
-- anon/authenticated explicitly, not just `from public` — because Supabase's
-- default privileges grant EXECUTE on new functions directly to those roles
-- independent of whatever PUBLIC holds (the exact live-verified gap
-- documented in that same migration's own security-fix comment).
--
-- The single `insert ... on conflict ... do update ... returning` statement
-- is what makes this race-free: the window bucket is computed from now()
-- INSIDE the function (never from caller input, so a caller cannot request
-- a fresh window on demand), and the increment-and-read happens atomically
-- in one statement rather than a separate SELECT-then-UPDATE that could
-- interleave with a concurrent call for the same user/operation/window.
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_operation text,
  p_window_seconds int,
  p_max_requests int
)
returns table (allowed boolean, current_count int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22004';
  end if;
  if p_operation is null or btrim(p_operation) = '' then
    raise exception 'operation is required' using errcode = '22004';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'window_seconds must be positive' using errcode = '22023';
  end if;
  if p_max_requests is null or p_max_requests <= 0 then
    raise exception 'max_requests must be positive' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (user_id, operation, window_start, count)
  values (p_user_id, p_operation, v_window_start, 1)
  on conflict (user_id, operation, window_start)
    do update set count = rate_limits.count + 1
  returning rate_limits.count into v_count;

  return query
    select
      (v_count <= p_max_requests),
      v_count,
      (v_window_start + make_interval(secs => p_window_seconds));
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- application_errors — centralized server-side error log.
-- ---------------------------------------------------------------------------
-- Written exclusively by ErrorReporter (src/lib/errors/error-reporter.ts)
-- via the service-role client. context is pre-redacted and size-capped by
-- ErrorReporter BEFORE insert (denylisted keys like password/token/secret/
-- authorization/cookie/stripe-signature stripped recursively) — this
-- table's own size CHECKs are defense in depth, not the only guard. RLS
-- enabled, zero policies for anon/authenticated; readable only via the
-- admin System view (requireAdmin() + service-role).
create table if not exists public.application_errors (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('exception', 'message')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  route text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint application_errors_message_size check (char_length(message) < 4000),
  constraint application_errors_context_size check (char_length(context::text) < 4000)
);

comment on table public.application_errors is
  'Centralized server-side error log, written exclusively by ErrorReporter
   via the service-role client — never a direct authenticated INSERT
   surface. RLS enabled, zero policies. context is pre-redacted and
   size-capped by ErrorReporter before insert; never contains passwords,
   tokens, cookies, or Stripe secrets/signatures.';

create index if not exists idx_application_errors_created_at
  on public.application_errors (created_at desc);

alter table public.application_errors enable row level security;

-- Cascade behavior summary:
--   auth.users deleted -> analytics_events/rate_limits rows deleted (user_id FK, on delete cascade)
--   auth.users deleted -> application_errors.user_id set null (on delete set null; the error row itself is kept as an operational record)
--   projects deleted -> analytics_events.project_id set null (on delete set null; the event itself is kept)
