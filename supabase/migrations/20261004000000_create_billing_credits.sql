-- Phase 11: credits + Stripe billing — credit_accounts, credit_ledger,
-- subscriptions, stripe_webhook_events, plus the atomic credit-mutation
-- functions.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI. NOT applied by
-- this commit — for review first, same process as every migration
-- since Phase 6.
-- Depends on nothing beyond auth.users and public.set_updated_at()
-- (20260924000000_create_generation_pipeline.sql). Backward compatible:
-- only ADDS four new tables and their functions. Does not alter any
-- existing table.
--
-- ===========================================================================
-- LESSON FROM THE PHASE 7-10 INCIDENTS — READ BEFORE EDITING ANY POLICY BELOW
-- ===========================================================================
-- Every RLS policy since Phase 7 that correlates the row being written
-- against an owning table inside EXISTS(...) has qualified every reference
-- to the row-being-written as `<this_table>.<col>` — never a bare column
-- name — because Postgres resolves an unqualified identifier against the
-- CORRELATED subquery's own FROM-list first, not the outer row. Phase 11's
-- tables are simpler (credit_accounts/credit_ledger/subscriptions are all
-- directly owned by user_id, one hop from auth.users, no bundle/project
-- chain to join), so none of their RLS policies below need a correlated
-- EXISTS at all — but the SAME shadowing hazard applies just as sharply
-- inside the PL/pgSQL functions below, which correlate `credit_accounts`
-- against parameters and local variables with the SAME NAMES as columns
-- (p_user_id vs user_id, v_current_balance vs balance). Every UPDATE/SELECT
-- inside those functions qualifies the column as `credit_accounts.<col>`
-- for exactly this reason — see each function's own comment.

-- ---------------------------------------------------------------------------
-- credit_accounts — one row per user, the current authoritative balance.
-- ---------------------------------------------------------------------------
-- Never written directly by application code or by an authenticated
-- user's own RLS-scoped client — see the RLS section below. The ONLY
-- writers are the SECURITY DEFINER functions at the bottom of this file,
-- which serialize concurrent mutations for the same user via `select ...
-- for update` and keep this row and its corresponding credit_ledger
-- row(s) consistent within one transaction.
create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_granted bigint not null default 0 check (lifetime_granted >= 0),
  lifetime_consumed bigint not null default 0 check (lifetime_consumed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.credit_accounts is
  'One row per user — the current authoritative credit balance. Never
   written directly by any client; only public.credit_ledger_apply()
   (service-role ONLY — see that function''s own security-fix comment for
   why there is deliberately no authenticated-callable variant) may
   mutate it, always together with a matching credit_ledger row in the
   same transaction.';

alter table public.credit_accounts enable row level security;

-- SELECT only. No INSERT/UPDATE/DELETE policy exists for this table at
-- all — with RLS enabled and no policy permitting those operations, every
-- role except the table owner (which the SECURITY DEFINER functions run
-- as) is unconditionally denied. This is deliberate: the Phase 11 spec's
-- "users must NOT be able to directly increase balance" is enforced here
-- structurally, not just by omission from the app's Server Actions.
create policy "Users can view their own credit account"
  on public.credit_accounts
  for select
  using (auth.uid() = user_id);

drop trigger if exists set_credit_accounts_updated_at on public.credit_accounts;

create trigger set_credit_accounts_updated_at
  before update on public.credit_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- credit_ledger — append-only, auditable history of every balance change.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Positive = grant/refund, negative = consumption. Never zero — a
  -- zero-amount entry carries no information and would only exist as a
  -- bug (see credit_ledger_apply()'s explicit rejection of amount = 0).
  amount bigint not null check (amount <> 0),

  entry_type text not null check (
    entry_type in ('signup_grant', 'subscription_grant', 'generation_charge', 'refund', 'adjustment')
  ),

  -- SECURITY (Phase 11 post-review fix): sign is tied to entry_type at the
  -- schema level, never left to application code alone as the only
  -- guard. A 'generation_charge' can never be a credit, a 'refund' can
  -- never be a debit, and a grant can never be negative. 'adjustment' is
  -- the sole exception, DELIBERATELY allowed either sign — it is the
  -- service_role-only manual-correction entry type (never reachable by
  -- any authenticated user's own request), used for both crediting a
  -- seller (e.g. a support-driven goodwill grant) and clawing back a
  -- mistaken grant, so restricting its sign would defeat its purpose.
  constraint credit_ledger_amount_sign_matches_entry_type check (
    case entry_type
      when 'generation_charge' then amount < 0
      when 'signup_grant' then amount > 0
      when 'subscription_grant' then amount > 0
      when 'refund' then amount > 0
      when 'adjustment' then true
      else false
    end
  ),

  reason text not null check (char_length(btrim(reason)) > 0),

  -- Free-form audit context (e.g. reference_type='generation_job',
  -- reference_id=<uuid>) — never used for authorization, only for
  -- display/debugging (see BillingPage's credit history).
  reference_type text,
  reference_id text,

  -- The idempotency contract for the whole credit system: every mutation
  -- is identified by a caller-chosen deterministic key
  -- (e.g. "stripe_invoice:{id}", "generation_job:{id}",
  -- "generation_refund:{id}", "signup_grant:{user_id}"). A duplicate call
  -- with the same key is a no-op, enforced by this UNIQUE constraint plus
  -- credit_ledger_apply()'s own pre-check — see that function's comment
  -- for why both layers exist (a TOCTOU race between the pre-check and
  -- the insert is caught by this constraint, not just assumed away).
  idempotency_key text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint credit_ledger_idempotency_key_unique unique (idempotency_key)
);

comment on table public.credit_ledger is
  'Append-only audit log of every credit balance change. Never updated or
   deleted by application code — a correction is always a NEW entry
   (entry_type=refund or adjustment), never an edit to an existing row.
   Every row is keyed by a deterministic idempotency_key so retried/duplicate
   webhook or generation-completion events can never double-apply.';

create index if not exists idx_credit_ledger_user_id on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

-- SELECT only — same reasoning as credit_accounts. No INSERT/UPDATE/DELETE
-- policy exists: an authenticated user's own client cannot insert a
-- positive ledger entry, edit reason/amount on an existing entry, or
-- delete audit history. Only the SECURITY DEFINER functions below write
-- here.
create policy "Users can view their own credit ledger"
  on public.credit_ledger
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- stripe_customers — the canonical, persistent user -> Stripe Customer
-- mapping (Phase 11 spec section 7), deliberately a SEPARATE table from
-- subscriptions below rather than folded into it: a user gets a canonical
-- Stripe Customer the FIRST time they start Checkout, well before (and
-- independent of) whether they ever complete a paid subscription — an
-- abandoned or still-pending Checkout must not leave the user without a
-- stable customer id to reuse on their next attempt, and must never cause
-- a second Stripe Customer to be created for the same user. subscriptions
-- rows, by contrast, only ever exist once a real subscription is confirmed
-- by a verified webhook event.
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),

  constraint stripe_customers_stripe_customer_id_unique unique (stripe_customer_id)
);

comment on table public.stripe_customers is
  'One canonical Stripe Customer id per user, created the first time the
   user starts Checkout (see StripeService.getOrCreateCustomerId) — never
   trusted from the browser, never duplicated across repeated checkout
   attempts.';

alter table public.stripe_customers enable row level security;

-- SELECT only — no INSERT/UPDATE/DELETE policy. Written exclusively by
-- StripeService via the service-role client; a user cannot forge or
-- change which Stripe Customer they're mapped to.
create policy "Users can view their own Stripe customer mapping"
  on public.stripe_customers
  for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subscriptions — one canonical row per user's Stripe subscription state.
-- ---------------------------------------------------------------------------
-- Written exclusively by WebhookService using the service-role client
-- (bypasses RLS) after independently verifying a Stripe webhook signature
-- — never by any authenticated user's own client, and never by trusting
-- browser-submitted Stripe IDs. See the RLS section below.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  stripe_customer_id text not null,
  stripe_subscription_id text,
  stripe_price_id text,

  plan_key text not null check (plan_key in ('free', 'starter', 'creator', 'pro')),

  -- Mirrors Stripe's own subscription status values exactly (see
  -- src/config/subscription.ts's SUBSCRIPTION_STATUS_VALUES, the single
  -- source of truth the UI/service layer reads) — this CHECK constraint is
  -- the database's own independent backstop, not the only place the
  -- allowed set is enumerated. `active`/`trialing` are the only values
  -- treated as entitled access — see isEntitledStatus(); every other
  -- status is intentionally NOT full access, including `past_due`.
  status text not null check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One canonical subscription row per user — Phase 11 deliberately does
  -- not support multiple simultaneous active subscriptions per user (see
  -- StripeService.getOrCreateCustomerForUser and the Phase 11 final
  -- report's "plan-change behavior" section for why: upgrades/downgrades
  -- go through the Stripe Billing Portal, which changes the EXISTING
  -- subscription in place rather than creating a second one).
  constraint subscriptions_user_id_unique unique (user_id),
  constraint subscriptions_stripe_subscription_id_unique unique (stripe_subscription_id)
);

comment on table public.subscriptions is
  'One canonical row per user, synchronized exclusively from verified
   Stripe webhook events (see WebhookService) — never written by an
   authenticated user''s own client. status mirrors Stripe''s own
   subscription status values; see src/config/subscription.ts for which
   statuses count as active entitlement.';

create index if not exists idx_subscriptions_stripe_customer_id on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

-- SELECT only — no INSERT/UPDATE/DELETE policy exists. A user cannot
-- forge their own subscription status or change which Stripe
-- customer/subscription id they're mapped to; that mapping is established
-- once (by StripeService, service-role) and afterward only ever updated by
-- verified webhook events.
create policy "Users can view their own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stripe_webhook_events — minimal internal audit trail, service-role only.
-- ---------------------------------------------------------------------------
-- Deliberately NOT user data and NOT readable by any authenticated user —
-- RLS is enabled with ZERO policies of any kind, which denies every
-- operation to every role except the table owner. Only WebhookService
-- (service-role client) ever reads or writes this table. Intentionally
-- stores the minimum needed to detect/skip duplicates and to debug a
-- failure — never the full Stripe event payload (see WebhookService's own
-- comment for what "minimal" means here).
create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),

  constraint stripe_webhook_events_stripe_event_id_unique unique (stripe_event_id)
);

comment on table public.stripe_webhook_events is
  'Internal-only audit trail of processed Stripe webhook events, keyed by
   Stripe''s own event id so a retried/duplicated delivery is detected and
   skipped rather than re-applied. No RLS policy grants any access to any
   role other than the table owner — this table is never exposed to any
   authenticated user, by design (see the Phase 11 spec''s "do not persist
   full sensitive Stripe payloads" and "this table is never user data").';

alter table public.stripe_webhook_events enable row level security;

-- ===========================================================================
-- SECURITY FIX (post-implementation review, before this migration was ever
-- applied) — READ BEFORE RE-ADDING ANY AUTHENTICATED-CALLABLE CREDIT RPC
-- ===========================================================================
-- The first draft of this migration also defined
-- `credit_ledger_apply_own(p_amount, p_entry_type, ...)`, granted to the
-- `authenticated` role, which derived the caller's identity safely from
-- auth.uid() but still let the CALLER CHOOSE p_amount and p_entry_type
-- (restricted only to 'generation_charge'/'refund'). That was exploitable:
-- an authenticated user could call it directly (PostgREST exposes any
-- GRANTed RPC to any role holding EXECUTE, regardless of which
-- application code the developer intended to be the only caller) with
-- e.g. p_entry_type = 'refund', p_amount = 1000000, a fresh
-- idempotency_key, and mint arbitrary credits into their own account —
-- deriving identity from auth.uid() prevents touching ANOTHER user's
-- balance, but does nothing to stop a user from inflating their OWN
-- balance via a mutation type/amount they were never supposed to choose.
-- The function has been removed entirely, never applied to a live
-- database. The corrected architecture: `credit_ledger_apply` below is
-- the ONLY credit-mutation function, granted ONLY to `service_role`, and
-- EVERY credit mutation in this codebase — signup grants, subscription
-- grants, generation charges, generation refunds, manual adjustments —
-- is issued by trusted server code (Server Actions / the webhook route)
-- using the service-role client, with user_id, amount, entry_type, and
-- idempotency_key computed entirely server-side and never accepted from
-- a client. See src/lib/credits/credit-service.ts's applyCreditMutation()
-- and src/lib/generation/generation-billing.ts for the corrected call
-- sites. As defense in depth beyond removing the RPC, this migration also
-- adds a schema-level CHECK (credit_ledger_amount_sign_matches_entry_type,
-- above) tying entry_type to amount's sign, and idempotency-key-reuse
-- mismatch detection (below) — so even a future bug in trusted server
-- code that mislabels a mutation, or reuses a key across two different
-- mutations, fails loudly instead of corrupting the ledger.

-- ---------------------------------------------------------------------------
-- credit_ledger_apply — the ONE atomic core, and the ONLY function in this
-- schema that may mutate credit_accounts/credit_ledger: validates,
-- enforces idempotency (including rejecting a key reused for a DIFFERENT
-- mutation — see below), locks the account row, verifies sufficient
-- balance for a debit, inserts the ledger row, and updates the account
-- balance — all within a single function invocation (a single
-- transaction from the caller's point of view). service_role ONLY — see
-- the security-fix note above for why no authenticated-callable variant
-- exists.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned search_path (never trusts the caller's
-- search_path to resolve `public.credit_accounts`/`public.credit_ledger`),
-- and every reference to those tables' own columns is schema- AND
-- table-qualified (`credit_accounts.balance`, not bare `balance`) — the
-- exact same shadowing hazard the Phase 7 lesson describes applies here
-- too: this function's own local variables and parameters
-- (v_current_balance, p_user_id) could otherwise be confused with table
-- columns of the same conceptual meaning inside an ambiguous UPDATE/SELECT.
create or replace function public.credit_ledger_apply(
  p_user_id uuid,
  p_amount bigint,
  p_entry_type text,
  p_reason text,
  p_idempotency_key text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ledger_id uuid, balance bigint, was_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_existing_user_id uuid;
  v_existing_amount bigint;
  v_existing_entry_type text;
  v_existing_reference_type text;
  v_existing_reference_id text;
  v_current_balance bigint;
  v_new_balance bigint;
  v_ledger_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22004';
  end if;
  if p_amount = 0 then
    raise exception 'amount must not be zero' using errcode = '22023';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required' using errcode = '22004';
  end if;
  if p_entry_type not in ('signup_grant', 'subscription_grant', 'generation_charge', 'refund', 'adjustment') then
    raise exception 'invalid entry_type: %', p_entry_type using errcode = '22023';
  end if;

  -- Idempotency fast path: a duplicate caller presenting the SAME key for
  -- the SAME mutation gets back the SAME result the original call
  -- produced, without touching the balance again. SECURITY (post-review
  -- fix): the key is trusted to identify a REPLAY of the exact same
  -- mutation, never merely "some earlier row happened to use this key" —
  -- a caller presenting a key that already exists but with a DIFFERENT
  -- user_id/amount/entry_type/reference is a conflict, rejected outright,
  -- never silently handed back someone else's ledger entry id and
  -- balance (idempotency_key is globally unique across ALL users, so
  -- without this check a colliding key from a different mutation would
  -- otherwise leak another mutation's ledger_id/balance shape to the
  -- caller and skip applying the caller's own intended mutation).
  select credit_ledger.id, credit_ledger.user_id, credit_ledger.amount, credit_ledger.entry_type, credit_ledger.reference_type, credit_ledger.reference_id
    into v_existing_id, v_existing_user_id, v_existing_amount, v_existing_entry_type, v_existing_reference_type, v_existing_reference_id
    from public.credit_ledger where credit_ledger.idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    if v_existing_user_id <> p_user_id
       or v_existing_amount <> p_amount
       or v_existing_entry_type <> p_entry_type
       or v_existing_reference_type is distinct from p_reference_type
       or v_existing_reference_id is distinct from p_reference_id
    then
      raise exception 'idempotency_key_conflict' using errcode = '23505', detail = p_idempotency_key;
    end if;
    select credit_accounts.balance into v_current_balance from public.credit_accounts where credit_accounts.user_id = p_user_id;
    return query select v_existing_id, coalesce(v_current_balance, 0::bigint), true;
    return;
  end if;

  -- Ensure the account row exists, then LOCK it — this is what makes
  -- concurrent debits for the SAME user safe: a second concurrent call
  -- blocks here until the first transaction commits, so it always reads
  -- the POST-first-call balance, never a stale one. Different users' rows
  -- are never contended against each other.
  insert into public.credit_accounts (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select credit_accounts.balance into v_current_balance from public.credit_accounts where credit_accounts.user_id = p_user_id for update;

  v_new_balance := v_current_balance + p_amount;
  if v_new_balance < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001', detail = v_current_balance::text;
  end if;

  begin
    insert into public.credit_ledger (user_id, amount, entry_type, reason, reference_type, reference_id, idempotency_key, metadata)
    values (p_user_id, p_amount, p_entry_type, p_reason, p_reference_type, p_reference_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb))
    returning credit_ledger.id into v_ledger_id;
  exception when unique_violation then
    -- Lost a race on idempotency_key to a concurrent caller between the
    -- fast-path check above and this insert — apply the SAME mismatch
    -- check as the fast path before treating the other row as a valid
    -- duplicate of THIS call, and do NOT fall through to the balance
    -- update below in either case (that would double-apply a mutation
    -- the concurrent winner already applied).
    select credit_ledger.id, credit_ledger.user_id, credit_ledger.amount, credit_ledger.entry_type, credit_ledger.reference_type, credit_ledger.reference_id
      into v_existing_id, v_existing_user_id, v_existing_amount, v_existing_entry_type, v_existing_reference_type, v_existing_reference_id
      from public.credit_ledger where credit_ledger.idempotency_key = p_idempotency_key;
    if v_existing_id is null
       or v_existing_user_id <> p_user_id
       or v_existing_amount <> p_amount
       or v_existing_entry_type <> p_entry_type
       or v_existing_reference_type is distinct from p_reference_type
       or v_existing_reference_id is distinct from p_reference_id
    then
      raise exception 'idempotency_key_conflict' using errcode = '23505', detail = p_idempotency_key;
    end if;
    return query select v_existing_id, v_current_balance, true;
    return;
  end;

  update public.credit_accounts
  set balance = v_new_balance,
      lifetime_granted = credit_accounts.lifetime_granted + greatest(p_amount, 0),
      lifetime_consumed = credit_accounts.lifetime_consumed + greatest(-p_amount, 0),
      updated_at = now()
  where credit_accounts.user_id = p_user_id;

  return query select v_ledger_id, v_new_balance, false;
end;
$$;

revoke all on function public.credit_ledger_apply(uuid, bigint, text, text, text, text, text, jsonb) from public;
grant execute on function public.credit_ledger_apply(uuid, bigint, text, text, text, text, text, jsonb) to service_role;

-- Cascade behavior summary:
--   auth.users deleted -> credit_accounts/credit_ledger/subscriptions/stripe_customers rows deleted (user_id FK)
-- stripe_webhook_events has no user_id — it is a global, user-independent
-- audit log and is never cascaded by a user deletion. Deleting a user here
-- does NOT delete anything on Stripe's side (the Customer/Subscription
-- objects) — Phase 11 has no user-deletion-triggered Stripe cleanup; a
-- disposable live-verification user's Stripe test-mode Customer is
-- cleaned up directly via the Stripe API/dashboard, same as any other
-- Storage-side cleanup this codebase already does outside the DB cascade.
