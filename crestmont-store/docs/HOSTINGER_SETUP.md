# Hostinger setup — CRESTMONT HOLDINGS store

Step-by-step setup of the Crestmont store on **Hostinger**: a Node.js web app
plus a **Hostinger MySQL database** (Hostinger's "MySQL" databases run
MariaDB; the store is tested on MariaDB 10.11, MariaDB 11.4 and MySQL 8.4).

> **Keep Crestmont separate.** This repository also contains the AI Digital
> Product Factory at its root. Crestmont is a **different** Node.js app with
> its **own** database, database user, environment variables and Stripe
> account. Never point Crestmont at the other app's database or credentials.

Hostinger renames hPanel menus from time to time and features differ by plan
(Node.js apps need a Business or Cloud web-hosting plan, or a VPS). If a label
below differs, look for the closest equivalent or ask Hostinger support.

Never paste passwords, `DATABASE_URL` or API keys into chat, issues, commits or
the repository.

## Current deployment (October 2026)

| Item | Value |
| --- | --- |
| Hosting plan | Hostinger Business Web Hosting (hPanel account `u868357127`) |
| Website | `forestgreen-gazelle-708337.hostingersite.com` — **temporary** Hostinger subdomain, dedicated to Crestmont |
| Database | `u868357127_crestmont` (MariaDB 11.8), user `u868357127_crestapp`, assigned only to the Crestmont website; app connects to `127.0.0.1:3306` |
| Source | GitHub `shielanita679/ai-digital-product-factory`, branch `claude/dreamy-johnson-jnp3tw`, application root `crestmont-store` |
| Node.js app | Next.js, Node 22, npm, output `.next`, build script **`build:hostinger`** (`npm run db:migrate:deploy && npm run build`) |
| Environment | `DATABASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `STRIPE_AUTOMATIC_TAX=false` (set in hPanel / API; never in git) |
| SSL | Platform-managed certificate for the subdomain; HTTP→HTTPS redirect on |
| Cron | Every 15 minutes: authenticated POST to `/api/internal/release-reservations` |

Notes from the deployment:
- **Migrations run during the build** (`build:hostinger`), on Hostinger's
  server where the database is reachable at `127.0.0.1`. `prisma migrate
  deploy` only applies pending migrations and never resets data. The external
  MySQL host (`srvNNNN.hstgr.io`) is only needed for connections from outside
  Hostinger.
- Hostinger's build servers have an older glibc, so Next.js falls back to its
  WebAssembly compiler (warnings in the build log are expected). This is why
  the build uses webpack, not Turbopack. Prisma 7's client has no native
  engine and is unaffected.
- Hostinger cron output only captures the **last** command of a cron line, and
  commands are limited to 255 characters. Crontab treats `%` as a newline, so
  avoid `curl -w '%{http_code}'`; use `curl -sSf` to see the status instead.
- **Secret rotation** (database password and `CRON_SECRET` were rotated on
  2026-10-10): change the database user's password, replace the full
  environment-variable set (the API is a full replace and values are masked on
  read), start a new build (its `migrate deploy` step confirms the new
  credentials), then recreate the cron with the new secret and delete the old
  one. The old secret should then get 404.
- **Health check:** `POST /api/internal/db-health` with
  `Authorization: Bearer <CRON_SECRET>` returns server version, applied
  migrations, tables, CHECK-constraint/index counts and row counts (never
  data). Unauthenticated requests get 404.
- **Smoke test:** `node scripts/smoke-test.mjs https://<site>` crawls the site
  and verifies the pre-launch safeguards (no prices, no purchase buttons,
  closed checkout/payments, safe forms, protected internal endpoints,
  canonical/robots/sitemap). It can be run from Hostinger with the absolute
  Node path `/opt/alt/alt-nodejs22/root/usr/bin/node`.
- When the real domain is connected: attach it to this website, update
  `NEXT_PUBLIC_SITE_URL`, rebuild, and update the cron URL.

---

## 1. Create the MySQL database

1. hPanel → **Websites** → select the website/domain that will host the store
   → **Databases** → **Management** (sometimes "MySQL Databases").
2. Under **Create a new MySQL database and database user**:
   - **Database name:** e.g. `crestmont` → Hostinger prefixes it, e.g. `u123456789_crestmont`.
   - **Username:** e.g. `crestapp` → becomes `u123456789_crestapp`.
   - **Password:** generate a long random password (letters + digits; avoid
     `@ : / ? #` to keep the URL simple, or URL-encode them later). Store it in
     a password manager.
3. **Create**.

## 2. The database user

The user created in step 1 is granted full privileges on that one database —
that's all the app needs (create tables during migrations; read/write rows).
Use this user **only** for Crestmont.

## 3. Find the connection details

In **Databases → Management**, the list shows the **database name** and
**username**. The **host**:

- For the Node.js app running on the same Hostinger hosting account: usually
  `localhost` (Hostinger shows the MySQL host on the database page — use the
  value shown there).
- For running migrations **from your own computer**: hPanel → **Databases →
  Remote MySQL** → add your current public IP for this database. The page
  shows the **remote host name** (or IP) to use. Remove your IP again when
  you're done.

Port: `3306`.

## 4. Build `DATABASE_URL`

```
mysql://USER:PASSWORD@HOST:3306/DATABASE?connectionLimit=5
```

Example shape only: `mysql://u123456789_crestapp:<password>@localhost:3306/u123456789_crestmont?connectionLimit=5`

- If the password contains special characters, URL-encode them (`@` → `%40`,
  `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`).
- `connectionLimit=5` keeps the app well inside shared-hosting connection
  limits. Optional: `ssl=true` if you connect over the internet to a host
  that supports TLS.
- `DATABASE_URL` is **server-only**. Never create a `NEXT_PUBLIC_DATABASE_URL`;
  `npm run check:launch` flags any credential in a `NEXT_PUBLIC_` variable.

## 5. Production environment variables

In the Node.js app's settings (step 7) add — values come from you, not the repo:

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.your-domain.com` | Needed at **build** time. |
| `SUPPORT_EMAIL` | your real support inbox | Needed at **build** time. |
| `DATABASE_URL` | from step 4 | Server-only. |
| `CRON_SECRET` | 40+ random characters | For the reservation job (step 15). |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | when contact email is set up | Server-only. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **later phase** — Crestmont's own Stripe account | Leave empty for now. |
| `STRIPE_AUTOMATIC_TAX` | `false` | Until tax setup is finalized. |

`NEXT_PUBLIC_*` variables and `SUPPORT_EMAIL` are baked into pages when the
app is built, so **redeploy after changing them**.

## 6. Run the database migrations (safely)

The schema lives in `crestmont-store/prisma/migrations/`. Apply it with
`prisma migrate deploy`, which only applies migrations that haven't run yet,
records them in a `_prisma_migrations` table, and **never** drops or resets
data.

**Never run `prisma migrate dev`, `prisma migrate reset` or `prisma db push`
against the production database.**

Option A — from your own computer (via Remote MySQL, step 3):

```bash
cd crestmont-store
npm ci
DATABASE_URL="mysql://USER:PASSWORD@REMOTE_HOST:3306/DATABASE" npm run db:migrate:status   # what would run
DATABASE_URL="mysql://USER:PASSWORD@REMOTE_HOST:3306/DATABASE" npm run db:migrate:deploy
```

(On Windows PowerShell set the variable first: `$env:DATABASE_URL="..."`.)

Option B — over SSH on Hostinger (hPanel → **Advanced → SSH Access**), from
the deployed `crestmont-store` folder:

```bash
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DATABASE" npx prisma migrate deploy
```

Verify in **phpMyAdmin** (Databases → phpMyAdmin) that these tables exist:
`orders`, `order_items`, `stripe_events`, `inventory`,
`inventory_movements`, `shipments`, `_prisma_migrations`.

## 7. Deploy the Next.js application

hPanel → **Websites** → **Add website** → **Node.js app** (or, on an existing
site, **Node.js** / **Deployments**). Connect the GitHub repository (or
upload the code) and use:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| **Root / application directory** | `crestmont-store` |
| Node.js version | **22.x** (minimum 20.19) |
| Install command | `npm ci` (or `npm install`) — runs `prisma generate` automatically |
| **Build command** | `build:hostinger` script (= `npm run db:migrate:deploy && npm run build`); plain `npm run build` if you run migrations separately |
| **Start command** | `npm run start` (= `next start`; listens on the `PORT` Hostinger provides) |
| Output directory (if asked) | `.next` |
| Environment variables | step 5 |

## 8. Application root

The repository root is **not** the store. The application root must be
`crestmont-store/` — that folder contains its own `package.json`,
`package-lock.json`, `prisma/` and `next.config.mjs`. Pointing the app at the
repository root would deploy the AI Digital Product Factory instead.

## 9. Build command

`npm run build`. It generates the Prisma client and builds with webpack (the
same Hostinger-compatibility choice used elsewhere in this repository).

## 10. Start command

`npm run start`.

## 11. Node.js version

22.x LTS recommended; at least 20.19 (required by Prisma 7 and Next.js 16).

## 12. Production domain

1. Point the domain to Hostinger (Hostinger nameservers, or the A/CNAME
   records hPanel shows for the site).
2. Attach the domain to the Node.js app in hPanel.
3. Set `NEXT_PUBLIC_SITE_URL` to the exact origin you will use (pick `www` or
   the bare domain and redirect the other to it) and redeploy.

## 13. HTTPS

hPanel → **Security → SSL** → install the free SSL certificate for the domain
(and `www`), then enable **Force HTTPS**. The app already sends HSTS and
other security headers, so only enable it once HTTPS works on every hostname
you use.

## 14. Stripe webhook URL (later phase — do not activate now)

When payments are activated in a later phase, in **Crestmont's own** Stripe
dashboard add the endpoint:

```
https://<your-domain>/api/stripe/webhook
```

subscribed to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, and store its signing secret as `STRIPE_WEBHOOK_SECRET`.

## 15. Production considerations

- **Single process.** The rate limiter keeps counters in memory per Node.js
  process. If your plan runs more than one process/instance, limits apply per
  process — replace the store in `src/lib/rate-limit.ts` (e.g. with a MySQL
  table) before relying on it. Check with Hostinger how many processes your
  plan runs.
- **Database connections.** Shared plans cap simultaneous connections per
  user; keep `connectionLimit` low (5).
- **Reservation job.** hPanel → **Advanced → Cron Jobs** → custom command,
  every 15 minutes:
  ```
  curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/internal/release-reservations
  ```
  (Returns 503 until the order database is enabled — that's expected.)
- **Files.** Don't store uploads on the app's disk; deployments may replace it.
- **Logs.** Check the Node.js app's logs in hPanel after each deploy.
- **Enable the database in code** only after migrations ran and
  `DATABASE_URL` is set: in `src/config/operations.ts` set
  `orderDatabaseEnabled: true` and `hostingProvider` to your plan name, commit,
  redeploy, then run `npm run check:launch`.

## 16. Database backups

- hPanel → **Files → Backups** (or **Databases → Backups**): check the
  automatic backup schedule your plan includes and how to restore a database.
- Before **every** migration, take a manual export: phpMyAdmin → select the
  database → **Export** → Quick/SQL → save the file somewhere safe (it
  contains customer data — store it encrypted).
- Periodically test a restore into a separate, empty database.

## 17. Deploying future Prisma migrations

1. Change `prisma/schema.prisma` locally.
2. Create the migration against a **local** database (never production):
   ```bash
   docker run -d --name crest-mariadb -e MARIADB_ROOT_PASSWORD=devpass -p 127.0.0.1:3307:3306 mariadb:10.11
   DATABASE_URL="mysql://root:devpass@127.0.0.1:3307/crestmont_dev" npm run db:migrate:dev -- --name describe_change
   ```
   Review the generated SQL; add any CHECK constraints by hand, as in the
   initial migration.
3. Run the tests against a local database:
   `TEST_DATABASE_URL="mysql://root:devpass@127.0.0.1:3307/mysql" npm test`
4. Commit the migration folder together with the code that needs it.
5. Back up production (step 16), then `npm run db:migrate:deploy` against
   production (step 6), then deploy the code.
6. For changes that remove or rename columns, use two releases (add new →
   deploy code using it → remove old later) so the running app never sees a
   missing column.

## 18. Loading real inventory (when products are activated)

Only real, counted stock for SKUs that exist in the catalog. Stock changes go
through the service functions (`registerInventorySku`, then
`adjustInventory` with `INITIAL_STOCK`) so every change is recorded in the
inventory ledger. An admin tool or script for this is a later phase — don't
edit `inventory` rows by hand in phpMyAdmin.
