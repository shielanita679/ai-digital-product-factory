# Launch checklist — CRESTMONT HOLDINGS store

`npm run check:launch` verifies everything it can; this file explains each
item. Nothing here is optional.

## 1. Operating terms — `src/config/commerce.ts`

Proposed terms already configured (change them here only):

| Term | Current value |
| --- | --- |
| Processing time | 1–2 business days |
| US delivery estimate | 3–7 business days after dispatch (estimate, not guaranteed) |
| International | not available |
| Free-shipping threshold | none advertised |
| Tracking | provided when the shipping service supports tracking |
| P.O. box / APO/FPO | delivery not promised |
| Cancellations / address changes | may be requested before the order enters fulfillment; not guaranteed |
| Damaged / incorrect | report within 7 days of delivery; replacement, refund or other resolution |
| Return window | 30 days after delivery; product `returnable` flag is authoritative |
| Return shipping | customer pays for change-of-mind returns; store covers verified damaged/incorrect returns |
| Restocking fee | none |
| Refund processing | 5–10 business days after an approved return is received and inspected |
| Exchanges | not offered (return + new order) |

Still unresolved:
- [ ] `fulfillmentMethod`
- [ ] `carriers` (site says "the shipping service" until set)
- [ ] `shippingRates` — real rates; checkout stays closed while empty
- [ ] `paymentsEnabled` — leave `false` until everything below is done

## 2. Policies — `src/config/policies.ts`
- [ ] Set `effectiveDate` to the launch date (pages show a pre-launch notice until then).
- Minimum buyer age 18; governing law Missouri, United States.
- The policies have **not** been reviewed by an attorney. Don't claim they have.

## 3. Catalog — `src/catalog/products.ts`
- [ ] For each coming-soon product, supply every item in its `pendingData`
      from the actual product/supplier documentation, add variants with full
      SKUs (starting with its `skuPrefix`) and verified inventory, set
      `returnable`, then set `status: "active"`.
- [ ] Add real photography under `public/images/products/<slug>/`.
- Planned prices are never shown publicly until a product is active.
- Don't use "Best seller", "Popular" or similar without real sales data.

## 4. Environment variables (see `.env.example`) — Crestmont's own values only
- [ ] `NEXT_PUBLIC_SITE_URL` (build time)
- [ ] `SUPPORT_EMAIL` — real, monitored inbox (build time). Support hours and
      response time are displayed only once this and the domain are set.
- [ ] `RESEND_API_KEY` + `CONTACT_FROM_EMAIL` — contact and order-status forms
      show as unavailable until set.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — from Crestmont's own
      Stripe account. Webhook endpoint: `https://<domain>/api/stripe/webhook`.
- [ ] Sales tax: finalize setup, then decide on `STRIPE_AUTOMATIC_TAX`.

## 5. Infrastructure — `src/config/operations.ts`, `docs/ARCHITECTURE.md`
- [ ] Choose hosting provider.
- [ ] Build the order & inventory database in a **new, separate** Crestmont
      Supabase project.
- [ ] Replace the in-memory rate limiter with a shared store.

## 6. Payments
- [ ] Enable only the payment methods you want in Stripe; the site never lists methods itself.
- [ ] Test order end to end in Stripe test mode.
- [ ] Never state or imply endorsement by Stripe, card networks, Wise, Slash or any bank.

## 7. Final QA
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run check:launch`
