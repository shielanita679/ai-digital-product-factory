# Pre-Launch Checklist

The single authoritative pre-launch checklist for AI Digital Product Factory.
Everything below is **external configuration or a deliberate, separate launch
decision** — none of it is a code change, and none of it is done by an
automated agent. Phases 1–13 delivered a hardened, fully-tested codebase
(see each phase's own report); this checklist is what a human operator does
before real users/real money reach it.

**Do not treat "tests pass, build is clean" as "ready to launch."** Every
item below gates launch independently of the code being correct.

---

## AUTH EMAIL (blocks real user signup/password-reset in production)

- [ ] Configure a production SMTP provider in Supabase Auth settings (Supabase's
      default email sending is rate-limited and not meant for production volume)
- [ ] Customize the **Confirm signup** email template to:
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
- [ ] Customize the **Reset Password** email template to:
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- [ ] Verify production Supabase Auth **Site URL** and **Redirect URLs** cover
      the production domain's `/auth/confirm`
- [ ] Test a brand-new signup end-to-end (real inbox, real click)
- [ ] Test the confirmation session handoff (lands authenticated on
      `/onboarding`, not `/auth/auth-code-error`)
- [ ] Test password reset end-to-end (real inbox, real click, new password accepted)
- [ ] Verify the OLD password is rejected after reset
- [ ] Verify the NEW password successfully logs in
- [ ] Verify a reused/already-consumed reset link is rejected (Supabase's
      one-time-use token semantics)

Until every item above is checked, this remains the single known blocker for
real (non-test) signups and password resets — see
`src/app/auth/confirm/route.ts`'s and `supabase/README.md`'s own comments.

## SECURITY

- [ ] Review production Supabase security advisories (Dashboard → Advisors)
      and confirm zero unexpected new findings beyond the two already
      accepted/tracked (trigger-function direct-RPC-callability — mitigated
      by Postgres's own `RETURNS TRIGGER` restriction, being closed further
      in the Phase 13 migration below; `set_updated_at`'s search_path, also
      closed by that migration)
- [ ] Apply `supabase/migrations/20261015000000_pin_search_path_and_revoke_trigger_execute.sql`
      (written in Phase 13, not yet applied) — see "Migrations to apply" below
- [ ] Re-verify service-role-only RPC grants directly against production:
      `credit_ledger_apply` and `check_rate_limit` must show `anon: false,
      authenticated: false, service_role: true` (same queries used in the
      Phase 12 post-migration verification report)
- [ ] Re-verify `profiles.role` cannot be updated by `authenticated`/`anon`
      (`has_column_privilege` check, same as Phase 12's verification)
- [ ] **Confirm the Supabase secret key that was read directly from this
      sandbox's environment during Phase 11/12 verification work has been
      rotated** — any key an agent session could read should be treated as
      exposed to that session's operator, even though it was never printed
      or committed. Rotate `SUPABASE_SECRET_KEY` in the Supabase dashboard
      and update it in Vercel's project environment variables.
- [ ] Rotate/verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` similarly
      before going live (see STRIPE section — these become LIVE-mode
      secrets at that point regardless of rotation)
- [ ] Final RLS audit: confirm every table under `supabase/migrations/`
      still shows `rls_enabled: true` and that no table's policy list grew
      an unexpected authenticated/anon grant since the last review

## AI

- [ ] Choose production AI providers intentionally (image generation, vector,
      mockup, text) — do not leave any of the four on `mock` unless that is
      the deliberate initial launch state
- [ ] Configure production API keys securely (Vercel environment variables,
      never committed, never logged — `ErrorReporter`'s redaction already
      strips common secret key names from any captured context, but a key
      should still never be passed as loggable metadata in the first place)
- [ ] Establish cost limits / budget alerts with each provider before enabling
- [ ] Establish provider retry/timeout behavior appropriate for production
      traffic (the mock providers used throughout development have no
      real-world latency/failure characteristics)
- [ ] Run a controlled, real (paid) provider smoke test **only when explicitly
      authorized** by the account owner — never as part of routine
      development/testing

## STRIPE

- [ ] Migrate from TEST to LIVE mode as a separate, deliberate launch task —
      never mixed into a feature/hardening phase
- [ ] Create/verify live Products and Prices matching `src/config/plans.ts`
      (Starter/Creator/Pro) — the live Price IDs go into new env vars, the
      code never hard-codes a Price ID (see `plans.ts`'s own doc comment)
- [ ] Configure the live webhook endpoint in the Stripe Dashboard
- [ ] Configure the live webhook signing secret (`STRIPE_WEBHOOK_SECRET`,
      LIVE-mode value) in production env vars
- [ ] Configure the live Customer Portal (branding, allowed actions) in the
      Stripe Dashboard
- [ ] Run a live Checkout smoke test with a real (small) charge, verified by
      the account owner, before announcing launch
- [ ] Confirm tax/legal/business settings in the Stripe Dashboard (tax
      collection, business address, statement descriptor, etc.)
- [ ] Update `assertTestModeSecretKey`'s expectations mentally: once LIVE,
      that guard will correctly START REJECTING the new live key unless the
      code's test-mode assumption is deliberately revisited — confirm this
      is an intentional, reviewed change, not an accidental bypass

## OBSERVABILITY

- [ ] Decide whether to add an external error-monitoring provider (e.g.
      Sentry) behind `ErrorReporter`'s existing two-function interface
      (`captureException`/`captureMessage`) — see `docs/PHASE_12.md` §6 for
      the exact integration shape; not required to launch, but the current
      default (console + `application_errors` table) has no external
      alerting
- [ ] Set a retention/cleanup policy for `application_errors` (currently
      grows unbounded — no scheduled deletion exists)
- [ ] Set a cleanup strategy for `rate_limits` (currently grows one row per
      user/operation/window with no automatic cleanup — see that table's
      own migration comment; fine at current scale, worth revisiting before
      a large user base)
- [ ] Decide an analytics retention/privacy policy for `analytics_events`
      (what's collected is documented in `docs/PHASE_12.md`'s event catalog;
      decide how long to keep it and whether it needs to be disclosed in a
      privacy policy — see LEGAL/PRODUCT below)

## LEGAL/PRODUCT

- [ ] Terms of Service (linked from `register-form.tsx`'s "I agree to the
      Terms of Service and Privacy Policy" checkbox — confirm the link
      target exists and is current)
- [ ] Privacy Policy (should disclose the `analytics_events` collection
      described above, and Stripe/Supabase as sub-processors)
- [ ] Refund policy (Stripe subscriptions — decide and document before
      going LIVE, not after the first refund request)
- [ ] Default license text shown to sellers (`src/lib/listings/license-service.ts`
      generates license text for buyers of the seller's products — confirm
      the default templates are legally reviewed, not just functionally
      correct)
- [ ] Support/contact details (a real, monitored channel — not just a
      marketing-page email placeholder)

## OPERATIONS

- [ ] Custom domain configured in Vercel
- [ ] DNS records verified (and `NEXT_PUBLIC_APP_URL` updated to match —
      currently used for Stripe return URLs and `metadataBase`, not auth
      email links, which use the request's own origin dynamically)
- [ ] Production email sending verified end-to-end (see AUTH EMAIL above —
      this is the same SMTP configuration)
- [ ] Database backup strategy confirmed (Supabase's own backup/PITR
      settings for the production project)
- [ ] Rollback plan documented: which Vercel deployment to promote back to,
      and confirmation that a schema migration rollback path exists if a
      migration ever needs reverting
- [ ] Database migration procedure reconfirmed: every migration in
      `supabase/migrations/` is applied in order via the Supabase SQL
      Editor or `supabase db push`; the one from Phase 13 (see below) is
      still pending
- [ ] Monitoring/alerting for production errors and Stripe webhook failures
      (today: `/admin/system` and `/admin/billing` surface this on-demand;
      decide if proactive alerting is needed before launch)
- [ ] Rate-limit cleanup job scheduled if `rate_limits` growth becomes a
      concern (see OBSERVABILITY above)
- [ ] Account deletion / data deletion procedure documented and tested — a
      `auth.users` deletion cascades to `profiles`/`credit_accounts`/
      `credit_ledger`/`subscriptions`/`stripe_customers`/`analytics_events`/
      `rate_limits` (all `on delete cascade`), but does **not** delete
      anything on Stripe's side or in `application_errors` (`user_id` is
      `on delete set null` there, by design, so the error record itself is
      kept as an operational record) — confirm this matches your data-
      deletion policy commitments before launch

---

## Migrations to apply (not yet applied to production)

Two migrations are written and reviewed but not yet run against the live
database, following this project's established "write it, hand it over,
never auto-apply" process:

1. `supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql`
   (Phase 12 — admin role, analytics/rate-limit/error tables) — **apply
   this first if it has not already been applied.**
2. `supabase/migrations/20261015000000_pin_search_path_and_revoke_trigger_execute.sql`
   (Phase 13 — defense-in-depth: revokes direct EXECUTE on the two trigger
   functions, pins `set_updated_at`'s search_path). Behavior-preserving;
   safe to apply any time.

Verify success after each with a simple `select` against the affected
table/column, exactly as described in that migration's own file (and in
`docs/PHASE_12.md` for the first one).
