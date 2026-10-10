# Launch checklist — CRESTMONT HOLDINGS store

Nothing on this list is optional. `npm run check:launch` verifies the items it
can check automatically; the rest need a person.

## 1. Business terms (`src/config/business.ts`, `src/config/commerce.ts`)

Every `null` value renders on the site as a highlighted **"[… — to be confirmed]"**
placeholder, and checkout stays closed until the required ones are filled in.
Enter only terms you can actually meet.

| Setting | File | Example format (not a recommendation) |
| --- | --- | --- |
| `supportHours` | business.ts | `"Monday–Friday, 9 a.m.–5 p.m. Central Time"` |
| `supportResponseTime` | business.ts | `"within 1–2 business days"` |
| `phone` (optional) | business.ts | leave `null` if you don't offer phone support |
| `processingTime` | commerce.ts | `"1–3 business days"` |
| `domesticDeliveryEstimate` | commerce.ts | `"3–7 business days"` |
| `carriers` | commerce.ts | `"USPS and UPS"` |
| `shippingRates` | commerce.ts | at least one rate, amounts in cents |
| `freeShippingThresholdCents` | commerce.ts | `null` unless you offer it |
| `shipsToPOBoxes` | commerce.ts | `true` / `false` |
| `orderChangeWindow` | commerce.ts | `"within 12 hours of ordering, before it ships"` |
| `deliveryIssueReportWindow` | commerce.ts | `"within 7 days of the delivery date"` |
| `returns.windowDays` | commerce.ts | `30` |
| `returns.returnShippingPaidBy` | commerce.ts | `"customer"` or `"store"` |
| `returns.restockingFeePercent` | commerce.ts | `0` for none |
| `returns.refundProcessingDays` | commerce.ts | `"within 5 business days"` |
| `international` / `shipToCountries` | commerce.ts | domestic-only by default — confirm |
| `policiesLastUpdated` | business.ts | date you publish the final policies |

## 2. Catalog (`src/catalog/products.ts`)

- [ ] The 12 planned products are `coming_soon`. For each, supply every item in
      its `pendingData` list from the actual product/supplier documentation,
      add variants with full SKUs (starting with its `skuPrefix`) and verified
      inventory, then set `status: "active"`. Make no health, safety,
      electrical, environmental or performance claims you can't document.
- [ ] Add real product photography under `public/images/products/<slug>/`
      (JPG/PNG/WebP, 4:5 ratio recommended). Until then pages show a plain
      "Photography coming soon" panel, never stand-in images.
- [ ] Set real inventory counts. Inventory is not decremented automatically —
      connect the Stripe webhook (`src/app/api/stripe/webhook/route.ts`) to
      your inventory/fulfillment system, or update counts manually.
- [ ] Only set `compareAtPriceCents` if the product genuinely sold at that
      price for a meaningful period (FTC guidance on former-price comparisons).
- [ ] Don't label anything "Best seller", "Popular" or similar without real
      sales data. "Shop new arrivals" appears on the home page automatically
      only once at least one product is purchasable.
- [ ] Do not add ratings or reviews unless they come from real customers.

## 3. Environment variables (see `.env.example`)

- [ ] `NEXT_PUBLIC_SITE_URL` — your production `https://` origin. Set it **at
      build time**; it feeds canonical URLs, the sitemap, structured data and
      the support email (`support@<domain>`). Make sure that inbox exists.
- [ ] `STRIPE_SECRET_KEY` — test key first, live key at launch.
- [ ] `STRIPE_WEBHOOK_SECRET` — add an endpoint in Stripe at
      `https://<domain>/api/stripe/webhook` for `checkout.session.completed`,
      `checkout.session.async_payment_succeeded` and
      `checkout.session.async_payment_failed`.
- [ ] `STRIPE_AUTOMATIC_TAX=true` only after Stripe Tax is set up and your tax
      registrations are configured. Get tax advice on where you must collect.
- [ ] Contact-form delivery: `RESEND_API_KEY` + `CONTACT_FROM_EMAIL`, or
      `CONTACT_WEBHOOK_URL`.
- [ ] Newsletter: `NEWSLETTER_WEBHOOK_URL` (otherwise signups show "not open yet").

## 4. Payments

- [ ] In the Stripe dashboard, enable only the payment methods you want. The
      site never lists payment methods itself — checkout shows whatever is active.
- [ ] Place a test order end to end with a Stripe test card, confirm the
      success page, the webhook log line and the Stripe receipt email.
- [ ] Do not state or imply that the business is verified, approved or
      partnered with Stripe, card networks or any bank.

## 5. Final review

- [ ] Have the policies reviewed by a qualified attorney for your situation.
- [ ] Run `npm run lint && npm test && npm run build && npm run check:launch`.
- [ ] Deploy behind HTTPS (security headers, including HSTS, are already sent).
- [ ] If you run more than one server instance, move the in-memory rate limiter
      (`src/lib/rate-limit.ts`) to a shared store such as Redis.
