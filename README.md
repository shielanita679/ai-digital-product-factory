# AI Digital Product Factory

Turn one idea into a complete sellable digital product in minutes — AI-generated
designs, transparent PNGs, vector SVGs, mockups, listing copy, and a
downloadable ZIP package, built for Etsy, Cricut, print-on-demand, and craft
sellers.

## Status

**Phase 1 + 2 + 3 complete:** design system, responsive landing page, a real
Supabase-backed authentication system (register, login, logout, forgot/reset
password, email confirmation), a real onboarding wizard, a full authenticated
dashboard, and Supabase-backed product/project management (create, rename,
duplicate, archive, delete — all RLS-protected). The AI generation wizard,
design/mockup/listing generation, and billing are not wired up yet — see the
implementation phases in the project brief for what's next.

**Pending manual step:** `supabase/migrations/20260922140000_create_projects.sql`
has not been applied to the live project yet. Until it is, product-management
pages show a clear "isn't set up yet" notice instead of erroring — nothing
crashes, but you won't see products until you apply it (see
[`supabase/README.md`](./supabase/README.md)).

Until a real Supabase project is connected (see below), `/login`,
`/register`, `/dashboard`, etc. render a clear "Supabase isn't configured
yet" notice instead of a crash — the marketing site works either way.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui-style
components · Supabase (Auth + Postgres) · Stripe (planned) · Zod · React Hook Form

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project's keys — see supabase/README.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run the production build
npm run lint    # lint the project
```

## Environment Variables

See `.env.example` for the full list of variables the app will eventually
need (Supabase, Stripe, and AI/vector/mockup provider keys). Copy it to
`.env.local` and never commit real credentials. Supabase setup steps
(project creation, running the migration, email template config) live in
[`supabase/README.md`](./supabase/README.md).

## Project Structure

```
src/
  app/
    (marketing)/   # public landing page
    (auth)/        # login, register, forgot/reset password
    auth/          # /auth/confirm route handler (email links), error page
    dashboard/     # protected authenticated app shell + Create Product + My Products
    onboarding/    # protected real onboarding wizard (redirects until completed)
    actions/       # Server Actions (auth, onboarding, project CRUD)
  components/
    ui/            # reusable primitives (button, card, input, dialog, select, ...)
    layout/        # header, footer, logo
    marketing/      # landing page sections
    auth/          # auth forms
    dashboard/     # dashboard shell, sidebar nav, setup notice, empty states
    onboarding/    # onboarding wizard + selectable-card primitive
    products/      # project card + create/rename/duplicate/archive/delete
    theme/         # dark mode provider/toggle
  config/          # centrally stored nav, pricing plans, onboarding options, product types
  lib/
    supabase/      # browser/server Supabase clients, proxy session refresh, db-error helpers
    validations/   # zod schemas
  types/           # hand-written Supabase Database types
  proxy.ts         # Next.js 16 proxy (formerly middleware) — session refresh + route protection
supabase/
  migrations/      # SQL migrations (profiles + projects tables, RLS, triggers)
```
