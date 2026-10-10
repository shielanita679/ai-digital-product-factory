# CRESTMONT HOLDINGS — online store

Storefront for **CRESTMONT HOLDINGS LLC** (Missouri), built with Next.js 16
(App Router), TypeScript, Tailwind CSS 4 and Stripe Checkout.

> Before taking real orders, work through [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md).
> The shipped catalog and images are **samples**, and unconfirmed business terms
> appear on the site as highlighted "to be confirmed" placeholders.

## Getting started

```bash
cd crestmont-store
npm install
cp .env.example .env.local   # fill in what you have; everything is optional in development
npm run dev                  # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run lint` / `typecheck` / `test` | ESLint, TypeScript, Vitest |
| `npm run check:launch` | Lists every term, credential or catalog item still needing attention |
| `node scripts/generate-placeholder-images.mjs` | Regenerates the placeholder artwork |

## Where things live

| What | Where |
| --- | --- |
| Legal name, address, support email, hours | `src/config/business.ts` (single source of truth) |
| Currency, shipping, returns, processing times | `src/config/commerce.ts` |
| Products (SKU, price, variants, inventory, weight, dimensions, status…) | `src/catalog/products.ts` |
| Collections | `src/catalog/collections.ts` |
| Navigation | `src/config/navigation.ts` |
| Pages | `src/app/**/page.tsx` |
| Checkout / webhook / forms APIs | `src/app/api/**/route.ts` |

### Products
Each product supports SKU (per variant, unique), name, slug, description,
features, specifications, what's included, care, price, compare-at price,
images, collection, inventory, variants/options, shipping weight, package
dimensions, a product-specific shipping note, returnability and status
(`active` / `draft` / `archived`). Tests enforce SKU/slug uniqueness and
valid references.

## Payments
Checkout uses **Stripe Checkout** (hosted). The browser sends only SKUs and
quantities; the server re-prices everything from the catalog, validates stock,
and creates a Checkout Session. Card data is entered on Stripe's page and
never reaches this server. Checkout refuses to start (and the site says so
plainly) until Stripe keys, shipping rates, processing/delivery times, the
return window and a support email are configured.

## Security
CSP, HSTS, frame, referrer and permissions headers (`next.config.mjs`); Zod
validation on every API; same-origin checks (CSRF) and per-IP rate limiting on
public POST endpoints; honeypot fields on forms; signed Stripe webhooks; all
secrets server-side only. Never commit `.env*` files.

## Deployment
Any Node.js host that runs `next start` (Vercel, a VPS, Hostinger Node, etc.).
This app lives in the `crestmont-store/` subdirectory — set the project root
there. Set `NEXT_PUBLIC_SITE_URL` before building.
