# Architecture — CRESTMONT HOLDINGS store

## Status

| Area | State |
| --- | --- |
| Storefront, catalog, policies | Built. All products `coming_soon`. |
| Payments | Built but **off** (`commerce.paymentsEnabled = false`). |
| Order & inventory database | Prisma schema, migration, service layer and tests **built**; not yet deployed; **off** (`operations.orderDatabaseEnabled = false`). |
| Hosting | **Hostinger**: Next.js Node.js app + Hostinger MySQL (MariaDB). Plan not yet confirmed. |

```
Customer ─► Crestmont Next.js app (Hostinger, Node.js) ─► server-side code ─► Hostinger MySQL
Stripe Checkout ─► Stripe webhook ─► Crestmont server ─► Hostinger MySQL
```

## Configuration map

| Concern | Where |
| --- | --- |
| Business identity, support | `src/config/business.ts` |
| Operating terms, payments switch | `src/config/commerce.ts` |
| Policy settings | `src/config/policies.ts` |
| Infrastructure switches | `src/config/operations.ts` |
| Catalog | `src/catalog/*.ts` |
| Database schema | `prisma/schema.prisma` + `prisma/migrations/` |
| Prisma CLI config | `prisma.config.ts` |
| `DATABASE_URL` parsing (only reader) | `src/lib/db/config.ts` |
| Production DB client (server-only) | `src/lib/db/prisma.ts` |
| All commerce writes (transactions) | `src/lib/orders/service.ts` |
| Server-only binding used by routes | `src/lib/orders/repository.ts` |
| Stripe event → action mapping (pure) | `src/lib/orders/stripe-events.ts` |
| Webhook | `src/lib/orders/webhook.ts`, `src/app/api/stripe/webhook/route.ts` |
| Checkout | `src/app/api/checkout/route.ts` |
| Reservation sweeper endpoint | `src/app/api/internal/release-reservations/route.ts` |

Setup and deployment: [`docs/HOSTINGER_SETUP.md`](HOSTINGER_SETUP.md).

---

## Database (Hostinger MySQL/MariaDB via Prisma ORM 7)

- Prisma 7 with the Rust-free client and the official MariaDB/MySQL driver
  adapter (`@prisma/adapter-mariadb`). Tested on **MariaDB 10.11, MariaDB 11.4
  and MySQL 8.4**.
- UUID primary keys (`CHAR(36)`), `DATETIME(3)` timestamps (UTC), money in
  **integer cents** (`$29.99 → 2999`), never floating point.
- Prisma can't express CHECK constraints, so the migration adds them by hand
  (MySQL 8.0.16+ / MariaDB 10.2+ enforce them). Case checks compare as BINARY
  because the default collation is case-insensitive. No triggers or stored
  procedures are used, because shared-hosting MySQL users often can't create
  them.

### Tables and relationships

```
inventory 1───* inventory_movements *───1 orders 1───* order_items
                                            ├──* shipments
                                            └──* stripe_events
```

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `orders` | One per checkout attempt; the customer's order once paid. | `order_number` unique, uppercase, `CH-XXXX-XXXX`; `stripe_checkout_session_id` unique; `stripe_payment_intent_id` unique; amounts ≥ 0; `refunded ≤ total`; paid ⇒ `paid_at` + `customer_email`; fulfilled ⇒ paid; review ⇒ reason. |
| `order_items` | Immutable snapshot: product id, SKU (= variant id), product/variant name, quantity, unit/line amount, currency. | quantity 1–100; `line = unit × quantity`; one line per SKU per order. |
| `stripe_events` | Webhook idempotency ledger. | `stripe_event_id` **unique**; processed/ignored ⇒ `processed_at`. |
| `inventory` | One row per sellable SKU: `quantity_on_hand`, `quantity_reserved`. | SKU unique, uppercase format; `on_hand ≥ 0`; `reserved ≥ 0`; `reserved ≤ on_hand`. |
| `inventory_movements` | Stock ledger; every change to `quantity_on_hand` writes one row with the resulting balance. | Types `INITIAL_STOCK`, `SALE`, `REFUND_RESTOCK`, `CANCELLATION_RESTOCK`, `RETURN_RESTOCK`, `MANUAL_ADJUSTMENT`; sales negative + tied to an order; restocks positive; order restocks need an order; manual needs a reason; `sale_key` (= order:inventory) **unique**, so an order can deduct a SKU at most once. |
| `shipments` | Carrier, service, tracking number/URL (https only), status, shipped/delivered times. | delivered ≥ shipped; carrier+tracking unique. |

Indexes cover status columns, created date, customer email, held reservations
by expiry, orders needing review, items by SKU, movements by inventory/order,
Stripe events by status, shipments by order.

Order numbers are random (Node's cryptographic RNG, 31-character
unambiguous alphabet), never sequential and never derived from database ids.

### Security (no database-level RLS)

With one MySQL user per database on shared hosting, authorization is
enforced by the **server application**:

- The browser never receives database credentials. `DATABASE_URL` is read
  only in `src/lib/db/config.ts`; the client is created only in
  `src/lib/db/prisma.ts`, which imports `server-only` (bundling it into
  browser code fails the build). Verified: no database code or variable
  names appear in `.next/static`.
- No route exposes a generic data API. The only database operations
  reachable from the internet are:
  - `POST /api/checkout` — creates a pending order from **server-priced**
    catalog data (browser sends SKUs + quantities only);
  - `POST /api/stripe/webhook` — **signature-verified** Stripe events only;
  - `POST /api/order-tracking` — read-only lookup needing order number **and**
    email, rate-limited, generic failures;
  - `POST /api/internal/release-reservations` — requires `CRON_SECRET`.
- Customers therefore can't modify inventory, mark orders paid, create Stripe
  events, change fulfillment, or read other customers' orders.
- Inventory, fulfillment and shipment administration have no public route;
  they're service functions for a future authenticated admin tool.
- All routes keep the existing origin checks, input validation (Zod) and rate
  limits.

---

## Lifecycles

### Payment status (`orders.payment_status`)

```
PENDING ──(Stripe paid)────────────────► PAID ──(charge.refunded)──► PARTIALLY_REFUNDED / REFUNDED
   │  └─(completed, delayed method)──► PROCESSING ─(async succeeded)─► PAID
   │                                       └─(async failed)──────────► FAILED
   ├─(session expired / sweeper)─────────► EXPIRED
   └─(Stripe session couldn't be created)► CANCELLED
```

Only the **verified Stripe webhook** sets `PAID`. Reaching the success page
proves and changes nothing.

### Fulfillment status (independent)

`UNFULFILLED → (ON_HOLD) → PARTIALLY_FULFILLED → FULFILLED`, or `CANCELLED`.
Payment never fulfils an order; the only automatic change is `ON_HOLD` when a
paid order needs review. Fulfilled states require payment (service check +
CHECK constraint). Recording a shipment changes neither status.

### Reservation status

`HELD → CONVERTED` (paid) or `HELD → RELEASED` (expired, failed, cancelled).

---

## Inventory strategy: reserve at checkout, deduct on payment

`available = quantity_on_hand − quantity_reserved`

1. **Checkout start** (`createPendingOrder`): stock is **reserved**, not
   deducted. Any shortfall fails the whole transaction before a payment page
   exists.
2. **Lifetime:** Stripe session expires after 30 minutes; the reservation 15
   minutes later.
3. **Payment confirmed** (`handleCheckoutPaid`): reservation converts to a
   sale — `on_hand −= qty`, `reserved −= qty`, one `SALE` ledger row per SKU.
4. **Released** on `checkout.session.expired`, delayed-payment failure, a
   failed session creation, or by the scheduled sweeper.
5. **Delayed payment methods** keep the reservation (extended to 10 days)
   until Stripe reports the outcome.
6. Permanent stock is **never** reduced for an unpaid order.

### Concurrency and oversell protection

Stock changes are single conditional UPDATEs inside a transaction:

```sql
UPDATE inventory
   SET quantity_reserved = quantity_reserved + ?
 WHERE sku = ? AND quantity_on_hand - quantity_reserved >= ?;   -- 0 rows ⇒ InsufficientStockError ⇒ rollback
```

- InnoDB takes an exclusive row lock for the UPDATE. A second transaction on
  the same row waits; when the first commits, InnoDB evaluates the WHERE
  clause against the latest committed row. Not enough stock ⇒ 0 rows ⇒ that
  transaction rolls back. **Tested with 8 concurrent checkouts for the last
  unit: exactly one succeeds**, on MariaDB 10.11/11.4 and MySQL 8.4.
- No read-subtract-write in JavaScript.
- Rows are locked in SKU order; the order row is locked with
  `SELECT … FOR UPDATE` before stock rows in webhook processing.
- Transactions use READ COMMITTED and are retried automatically on deadlock or
  lock-wait timeout.
- CHECK constraints are the backstop: stock can't go negative by any path.

### Transaction boundaries (all-or-nothing)

| Operation | One transaction contains |
| --- | --- |
| `createPendingOrder` | order + item snapshot + every reservation |
| `handleCheckoutPaid` | claim event + lock order + convert reservations + SALE ledger rows + store amounts/customer + mark PAID + mark event PROCESSED |
| `handleCheckoutClosed`, `cancelPendingOrder`, sweeper (per order) | release reservations + order status (+ event) |
| `recordRefund` | claim event + refunded amount/status |
| `adjustInventory` | stock change + ledger row |

So "paid but stock not deducted" or "stock deducted but order not
finalized" can't be left behind: the transaction commits entirely or not at
all.

If stock genuinely can't be deducted for a paid order (only possible if a
reservation was lost, e.g. expired moments before a late payment while the
unit sold elsewhere), stock is **not** pushed negative and the payment record
is **not** discarded: the order is saved `PAID`, flagged `requires_review`,
and fulfillment goes `ON_HOLD` for support (typically a refund). The same
applies if Stripe's subtotal or currency doesn't match the stored snapshot.

---

## Stripe webhook idempotency

1. Verify the signature (`stripe.webhooks.constructEvent`); reject otherwise.
2. Map the event (`classifyStripeEvent`, pure, unit-tested).
3. In one transaction:
   - `INSERT INTO stripe_events … ON DUPLICATE KEY UPDATE` (no-op), then
     `SELECT status … FOR UPDATE` — concurrent deliveries of the same event
     serialize on that row;
   - already `PROCESSED`/`IGNORED` → return `duplicate`;
   - lock the order; already paid → `already_paid` (covers a different
     success event for the same session);
   - the unique `sale_key` is a final guarantee against double deduction.
4. On any error the transaction rolls back completely; the route records the
   failure in a separate write and answers **500**, so Stripe retries. The
   retry is processed normally (attempts counted). A failure record never
   downgrades an already processed event.
5. While payments or the database are disabled, the route answers 503 so
   Stripe keeps retrying rather than losing events.

**Tested:** the same event delivered 6× concurrently → exactly one `paid`, five
`duplicate`, one SALE movement, stock deducted once.

Handled events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`. Others are recorded as `IGNORED`.

---

## Refunds vs. restocking

- `charge.refunded` → `recordRefund` updates the refunded amount and payment
  status. It **never** changes inventory.
- Merchandise returns to stock only via an explicit `adjustInventory` with
  `RETURN_RESTOCK` / `REFUND_RESTOCK` / `CANCELLATION_RESTOCK`, after it's
  received and judged sellable (or never shipped). Order-linked restocks can't
  exceed the quantity sold to that order.

---

## Order tracking

When the database is enabled, `/api/order-tracking` looks up an order by
**order number + checkout email**. Any mismatch gets the same generic "couldn't
find an order matching those details" answer, so an order number's existence
isn't revealed. Rate-limited per IP and per order number; only
paid/processing orders are returned; the response has status, items and
shipments — no address, email or payment identifiers. Until then the form
sends requests to the support inbox (if email delivery is configured).

---

## Rate limiting

`src/lib/rate-limit.ts` defines a `RateLimitStore` interface with a default
in-memory store. **Limits are per Node.js process** — not shared across
processes or instances. If Hostinger runs more than one process, implement a
shared store (e.g. a MySQL table in the Crestmont database) and register it
with `setRateLimitStore()`; call sites don't change. No external service
(Redis etc.) has been added.

---

## Testing

| Suite | Command | Uses |
| --- | --- | --- |
| Unit | `npm run test:unit` | Pure TypeScript; static checks (server-only boundaries, enum parity with the Prisma schema, committed-secret scan). |
| Database | `npm run test:db` | A **local, disposable** MySQL/MariaDB from `TEST_DATABASE_URL` (e.g. Docker). The harness refuses non-local hosts, creates a random database, applies the real migration, and drops it afterwards. Skipped when `TEST_DATABASE_URL` is unset. |

```bash
docker run -d --name crest-mariadb -e MARIADB_ROOT_PASSWORD=devpass -p 127.0.0.1:3307:3306 mariadb:10.11
TEST_DATABASE_URL="mysql://root:devpass@127.0.0.1:3307/mysql" npm test
```

## Not yet built (later phases)

- Product pages/cart still read stock from the catalog seed; once the
  database is live, availability should come from `getAvailableStock`.
- Authenticated admin tool for inventory, fulfillment and shipments.
- Customer emails (order and shipping confirmations).
- Shared rate-limit store, if Hostinger runs multiple processes.
