-- Phase 11 follow-up: adds subscriptions.cancel_at — Stripe's EXPLICIT
-- scheduled-cancellation timestamp, a separate mechanism from
-- cancel_at_period_end that this app previously never persisted.
-- NOT applied by this commit — for review first, same process as every
-- migration since Phase 6. The 20261004000000 migration is already
-- applied live; this is a NEW, additive migration, never an edit to that
-- already-applied file.
--
-- ===========================================================================
-- ROOT CAUSE — READ BEFORE ASSUMING cancel_at_period_end IS THE WHOLE STORY
-- ===========================================================================
-- Live-verified against a real Stripe TEST MODE subscription: Stripe
-- Customer Portal showed "Cancels Oct 25" / "Your service will end on
-- October 25, 2026" while the Stripe API's own current state was
-- `cancel_at_period_end: false` and `cancel_at: 1792919792` (a future
-- Unix timestamp matching current_period_end). This app's webhook sync
-- and Billing UI only ever looked at cancel_at_period_end, so it correctly
-- persisted `false` — the earlier-suspected "webhook stale-state race" was
-- a red herring; the persisted value was accurate the whole time, for a
-- field that was never the right one to look at alone. Stripe subscriptions
-- support TWO independent ways to represent "this will cancel in the
-- future": the classic `cancel_at_period_end` boolean, and an explicit
-- `cancel_at` timestamp that can be set (via Portal actions or the API)
-- without ever setting cancel_at_period_end — Stripe's own Portal UI reads
-- `cancel_at` for its cancellation messaging, and this app now needs to as
-- well.
--
-- Also observed on the same live object: `canceled_at` was populated
-- (a past timestamp) while `status` remained `active` — this is Stripe
-- recording WHEN the cancellation was scheduled, not that the subscription
-- has actually ended. `canceled_at` is deliberately NOT persisted by this
-- migration — entitlement is decided exclusively by `status`
-- (see isEntitledStatus in src/config/subscription.ts, unchanged by this
-- migration), and "will this cancel in the future" is decided by
-- `cancel_at_period_end` OR `cancel_at`, never by `canceled_at`.

alter table public.subscriptions
  add column if not exists cancel_at timestamptz;

comment on column public.subscriptions.cancel_at is
  'Stripe''s explicit scheduled-cancellation timestamp (subscription.cancel_at
   from the Stripe API) — a SEPARATE mechanism from cancel_at_period_end.
   Stripe can schedule a future cancellation via cancel_at without ever
   setting cancel_at_period_end=true. NULL means no explicit scheduled
   cancellation exists. Written exclusively by WebhookService
   (syncSubscriptionRecord), same as every other column on this table — see
   that table''s own RLS policy (SELECT-only, no INSERT/UPDATE/DELETE for
   any role but service_role) which already covers this column with no
   changes needed. Never used alone to determine entitlement — status
   remains the sole entitlement signal; this column only drives "Cancels on
   ..." vs "Renews on ..." display (see hasScheduledCancellation /
   getEffectiveCancellationDate in src/config/subscription.ts).';
