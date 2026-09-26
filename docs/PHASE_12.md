# Phase 12 — Settings, Admin, Analytics, Rate Limiting, Error Monitoring

## 1. Architecture overview

Phase 12 adds the production operations layer on top of Phases 1–11's
product/billing functionality, built to reuse existing patterns rather than
invent new ones:

- **Settings** (`/dashboard/settings/*`) — a new tab under the existing
  dashboard shell. Profile editing reuses the same Server-Action-with-
  zod-validation-and-RLS-ownership pattern as onboarding
  (`src/app/actions/settings.ts`). Billing reuses `getBillingState()` and
  `SubscriptionStatusCard` as-is (no duplicated billing logic). Security
  is read-only account info plus an explicit note about the deferred
  password-change limitation (see §8).
- **Admin** (`/admin/*`) — a separate top-level route/shell, gated by
  `requireAdmin()` (`src/lib/auth/admin.ts`), which re-reads
  `profiles.role` from the database on every request. All cross-user
  admin reads live in one file, `src/lib/admin/admin-service.ts`, using a
  service-role client — the same deliberate, narrow RLS-bypass category
  already used for webhooks and credit mutations (see
  `src/lib/supabase/service-role.ts`'s own doc comment for the full
  enumerated list of legitimate service-role call sites).
- **Analytics** — `src/lib/analytics/analytics-service.ts`'s `track()` is
  the *only* writer of the new `analytics_events` table (zero RLS
  policies for any client role, same as `stripe_webhook_events`).
- **Rate limiting** — `src/lib/rate-limit/rate-limiter.ts`'s
  `enforceRateLimit()` calls one atomic Postgres function
  (`check_rate_limit()`), avoiding any read-then-write race across
  stateless serverless invocations.
- **Error monitoring** — `src/lib/errors/error-reporter.ts`'s
  `ErrorReporter` logs to the server console and best-effort persists a
  redacted, size-capped row to `application_errors`. No external
  monitoring provider (e.g. Sentry) is configured; see §6 for the
  upgrade path.

All four new tables (`analytics_events`, `rate_limits`,
`application_errors`, plus the `profiles.role` column) live in one
migration: `supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql`.
**This migration has not been applied to the live database** — see
`supabase/README.md` for how to apply it, same process as every migration
since Phase 6.

## 2. Admin authorization model

`profiles.role` (`'user'` default, `'admin'` the only other allowed value)
is the sole authorization signal. Two properties make it safe:

1. **Column-level privilege, not just RLS.** The migration revokes
   table-wide `UPDATE` on `profiles` from `authenticated`/`anon` and
   re-grants it only on the six self-service columns (`full_name`,
   `avatar_url`, `sells_what`, `sells_where`, `monthly_product_volume`,
   `onboarding_completed`). `role` is excluded — so even a direct
   PostgREST `PATCH` from an authenticated user's own session (which
   would pass the existing row-level `auth.uid() = id` check) is refused
   at the column-privilege layer, independent of RLS.
2. **Server-side re-verification on every request.** `requireAdmin()` (for
   pages/layouts) and `assertAdmin()` (for Server Actions) both re-read
   `profiles.role` from the database every time they're called — never
   cached, never trusted from a client flag, a JWT claim, or a previous
   request. The "Admin" sidebar link is hidden for non-admins purely as a
   UX nicety; it is never the authorization boundary.

## 3. Granting/revoking admin — the ONLY safe way

There is deliberately no in-app UI or API to change a user's role — doing
so would reopen exactly the self-escalation risk the column-grant fix
closes. An operator grants/revokes admin access directly in the Supabase
SQL Editor (or via the CLI), using the service-role connection:

```sql
-- Grant:
update public.profiles set role = 'admin' where id = '<user-uuid>';

-- Revoke:
update public.profiles set role = 'user' where id = '<user-uuid>';
```

Find the target user's id via `select id, email from public.profiles where email = '<email>';`.

## 4. Analytics event catalog

All events are tracked through `AnalyticsService.track()` — never a direct
client-side write. `metadata` is small, structured, and never contains
secrets/tokens/PII beyond what's already listed below (enforced by both a
DB size CHECK and an application-layer forbidden-key check).

| Event | Fires when | Notable metadata |
|---|---|---|
| `signup_completed` | A new `auth.users` row is created (DB trigger, fires regardless of email-confirmation mode) | — |
| `onboarding_completed` | `saveOnboardingAction` succeeds | — |
| `project_created` | `createProjectFromWizardAction` succeeds | — |
| `generation_started` | A generation job is inserted | `jobId`, `requestedCount` |
| `generation_completed` | A generation job's final status is written | `jobId`, `status`, `completedCount`, `failedCount` |
| `vectorization_completed` | A vectorization completes and is saved to Storage | `designId`, `vectorizationId` |
| `bundle_created` | `createBundleAction` succeeds | `bundleId` |
| `listing_generated` | `generateListing` saves successfully (new or regenerated) | `bundleId`, `marketplace` |
| `package_created` | `buildPackageAction` succeeds | `packageId`, `marketplace` |
| `package_downloaded` | `getPackageDownloadUrlAction` succeeds | `packageId` |
| `checkout_started` | `createCheckoutSessionAction` succeeds | `planId` |
| `subscription_activated` | Webhook processes `customer.subscription.created` (first activation only — not every subsequent update) | `subscriptionId` |

Admin summaries (`/admin/system`, `/admin/billing`) read bounded
aggregates (`count: "exact", head: true` queries) from these events and
the underlying tables — never an unbounded full-table scan.

## 5. Rate-limit configuration

Enforced server-side only, at the top of each Server Action (right after
`requireUser()`), via `enforceRateLimit(userId, operation)`:

| Operation | Limit |
|---|---|
| `image_generation` | 20 / 60 min |
| `vectorization` | 30 / 60 min |
| `mockup_generation` | 20 / 60 min |
| `listing_generation` | 30 / 60 min |
| `package_generation` | 20 / 60 min |
| `stripe_checkout` | 10 / 60 min |
| `stripe_portal` | 10 / 60 min |

Tune these in `src/config/rate-limits.ts`. The Stripe webhook route is
**deliberately never rate-limited** — it has no per-user identity to key
on, and limiting it risks silently dropping a legitimate billing-critical
event.

**Current implementation**: a single Postgres table (`rate_limits`) plus
one atomic `check_rate_limit()` SECURITY DEFINER function (a single
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement) — no
read-then-write race, sufficient at current scale, no external service
required.

**Future upgrade path**: if traffic grows enough that a Postgres row-per-
window becomes a bottleneck, or true multi-region/edge enforcement is
needed, swap `rate-limiter.ts`'s internals for a Redis/Upstash sliding-
window limiter. The `enforceRateLimit(userId, operation)` call-site
contract stays identical — no Server Action needs to change.

## 6. Error-reporting architecture

`ErrorReporter.captureException(error, context?)` /
`captureMessage(message, context?)` — the only entry points. Internally:
redacts any denylisted key (password, token, secret, authorization,
cookie, stripe-signature, service_role, etc.) recursively from `context`,
truncates large strings/arrays, logs to the server console, and
best-effort persists a row to `application_errors` (never blocking or
throwing back into the caller if persistence itself fails).

No external provider (Sentry or otherwise) is configured — no account was
created for this phase, per instruction. **Upgrade path**: implement a
second provider behind the same two-function interface
(`captureException`/`captureMessage`) and swap it in; every existing call
site is unaffected.

Wired in today at: the Stripe webhook route's existing failure path,
`billing.ts`'s catch-alls, and both `error.tsx`/`global-error.tsx` client
error boundaries (via the `reportClientErrorAction` Server Action bridge,
since client components have no service-role access). Extending this to
more call sites later is a mechanical one-line addition following the
same pattern.

## 7. Production monitoring upgrade path

See §5 (rate limiting → Redis/Upstash) and §6 (errors → Sentry or
similar) above — both are designed so the swap is internal to one file
each, with zero changes needed at any call site.

## 8. Deferred: custom SMTP / auth email flow

Carried forward from the pre-Phase-12 auth audit, **not touched by Phase
12**: production signup-confirmation and password-reset link handoff
require the Supabase project's email templates to be customized to this
app's `/auth/confirm?token_hash=...&type=...` link format (see
`supabase/README.md` §5) — the current default GoTrue-hosted link format
does not deliver `token_hash`/`type` to this app's own confirm route. This
is a Supabase Dashboard/SMTP configuration task, not a code change, and is
tracked in the PRE-LAUNCH checklist below.

## PRE-LAUNCH checklist

**Custom SMTP / auth email flow:**
- [ ] Configure a production SMTP provider in Supabase Auth settings
- [ ] Customize the **Confirm signup** email template to:
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
- [ ] Customize the **Reset Password** email template to:
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- [ ] Confirm Supabase Auth **Site URL** and **Redirect URLs** cover the production domain's `/auth/confirm`
- [ ] Test a brand-new signup end-to-end (real inbox, real click)
- [ ] Test the confirmation session handoff (lands authenticated on `/onboarding`, not the error page)
- [ ] Test password reset end-to-end (real inbox, real click, new password accepted)
- [ ] Verify the OLD password is rejected after reset
- [ ] Verify the NEW password successfully logs in
- [ ] Optional: type-specialize `/auth/auth-code-error` copy if a failure is still reachable (currently generic for both signup and recovery failures)

**Phase 12 migration:**
- [ ] Apply `supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql` (SQL Editor or `supabase db push`)
- [ ] Verify with: `select role from public.profiles limit 1;` and `select * from public.analytics_events limit 1;` (both should succeed, not error)
- [ ] Grant the first admin: `update public.profiles set role = 'admin' where id = '<your-uuid>';`
