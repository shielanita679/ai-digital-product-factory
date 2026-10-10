# Architecture notes — CRESTMONT HOLDINGS store

Status: **planning document.** Nothing in the "planned" sections is built yet.

## Current (built)

| Concern | Where | Notes |
| --- | --- | --- |
| Business identity | `src/config/business.ts` | Single source for legal name, address, support email (`SUPPORT_EMAIL`), support schedule. |
| Operating terms | `src/config/commerce.ts` | Shipping, order changes, damaged items, returns, refunds, payments switch. |
| Policy settings | `src/config/policies.ts` | Effective date, minimum buyer age, governing law. |
| Open infrastructure decisions | `src/config/operations.ts` | Hosting, order database, rate limiter. |
| Catalog | `src/catalog/*.ts` | Products have a status lifecycle; only complete `active` products are purchasable. |
| Checkout | `src/app/api/checkout/route.ts` | Stripe Checkout (hosted). Server re-prices from the catalog. Disabled while `commerce.paymentsEnabled` is false. |
| Webhook | `src/app/api/stripe/webhook/route.ts` | Verifies signatures. Currently only logs — no persistence. |
| Forms | `src/app/api/contact`, `src/app/api/order-tracking` | Resend email delivery; refuse submissions (HTTP 503) until configured. |

### Payments safety
`getStripe()` (`src/lib/stripe.ts`) returns `null` while `commerce.paymentsEnabled`
is `false`, so no Stripe client is created even when `STRIPE_*` variables are
present in the environment (e.g. a shared machine that also runs another
app). Crestmont must use its **own** Stripe account and its own environment
variables per deployment.

## Planned: order & inventory database

**Decision:** a **new, separate Supabase project** dedicated to CRESTMONT
HOLDINGS. It must never share a project, database, keys or service role with
the AI Digital Product Factory.

Access pattern: server-side only, using the Supabase service-role key from an
environment variable (never `NEXT_PUBLIC_*`), from route handlers / the
webhook. Row Level Security enabled on every table with no public policies.

### Planned tables

| Table | Purpose / key columns |
| --- | --- |
| `orders` | `id` (uuid, internal), `order_number` (public, `CH-XXXX-XXXX`, unique), `stripe_checkout_session_id` (unique), `stripe_payment_intent_id`, `customer_email`, `customer_name`, `shipping_address` (jsonb), `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `currency`, `payment_status`, `fulfillment_status`, `created_at`, `updated_at` |
| `order_items` | `order_id`, `sku`, `product_name`, `variant_label`, `quantity`, `unit_price_cents` (price captured at purchase) |
| `stripe_events` | `event_id` (primary key = Stripe event id), `type`, `received_at`, `processed_at` — makes webhook processing idempotent |
| `inventory` | `sku` (primary key), `on_hand` (integer, `CHECK (on_hand >= 0)`), `updated_at` |
| `inventory_movements` | `sku`, `delta`, `reason` (`sale`, `restock`, `adjustment`, `return`), `order_id`, `created_at` — audit trail |
| `shipments` | `order_id`, `carrier`, `tracking_number`, `shipped_at`, `delivered_at` |

### Planned webhook flow (idempotent)
1. Verify the Stripe signature.
2. `INSERT INTO stripe_events (event_id …) ON CONFLICT DO NOTHING`; if no row
   was inserted, the event was already processed → return 200.
3. For `checkout.session.completed` with `payment_status = paid`, in one
   transaction (a Postgres function called via RPC):
   - insert the order (unique `stripe_checkout_session_id` prevents duplicates),
   - insert its items from the session's line items (SKU in product metadata),
   - decrement inventory with `UPDATE … SET on_hand = on_hand - qty WHERE sku = … AND on_hand >= qty`;
     if any row fails to update, record the shortfall for support instead of going negative,
   - insert `inventory_movements` rows.
4. Mark the event processed.

### Inventory synchronization (planned)
- The database becomes the source of truth for stock; `variants[].inventory`
  in the catalog is then only the initial seed.
- Checkout validates requested quantities against the database before
  creating a session; the webhook decrements after confirmed payment.
- Stock never goes negative (`CHECK` constraint + conditional update).
- Restocks and manual corrections go through `inventory_movements`.
- No fulfillment-provider integration is assumed until the fulfillment method
  is confirmed (`commerce.fulfillmentMethod`).

## Hosting

Unresolved (`operations.hostingProvider`). The app is a standard Next.js
Node.js app (`next build` / `next start`) with no provider-specific
dependencies, so it can run on Vercel, standard Node.js hosting, or a
VPS/container. `NEXT_PUBLIC_SITE_URL` and `SUPPORT_EMAIL` are read at build
time.

### Rate limiting — must be replaced before production
`src/lib/rate-limit.ts` keeps counters **in process memory**. On serverless or
multi-instance hosting each instance has its own counters, so it provides
**no distributed protection**. Before production, replace the store behind
`rateLimit()` with a shared one (e.g. Redis/Upstash, or a Postgres table in the
Crestmont Supabase project) and set `operations.rateLimiter` to `"shared"`.
The call sites do not need to change.
