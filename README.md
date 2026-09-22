# AI Digital Product Factory

Turn one idea into a complete sellable digital product in minutes — AI-generated
designs, transparent PNGs, vector SVGs, mockups, listing copy, and a
downloadable ZIP package, built for Etsy, Cricut, print-on-demand, and craft
sellers.

## Status

**Phase 1 + 2 complete:** design system, responsive landing page, a real
Supabase-backed authentication system (register, login, logout, forgot/reset
password, email confirmation), protected dashboard routes, and a `profiles`
table with Row Level Security. The product wizard, AI generation, and billing
are not wired up yet — see the implementation phases in the project brief for
what's next.

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
    dashboard/     # protected authenticated app shell
    onboarding/    # protected post-signup landing page (placeholder)
    actions/       # Server Actions (sign out, complete onboarding)
  components/
    ui/            # reusable primitives (button, card, input, ...)
    layout/        # header, footer, logo
    marketing/      # landing page sections
    auth/          # auth forms
    dashboard/     # dashboard shell, sidebar nav, setup notice
    theme/         # dark mode provider/toggle
  config/          # centrally stored site nav, pricing plans, dashboard nav
  lib/
    supabase/      # browser/server Supabase clients, proxy session refresh
    validations/   # zod schemas
  types/           # hand-written Supabase Database types
  proxy.ts         # Next.js 16 proxy (formerly middleware) — session refresh + route protection
supabase/
  migrations/      # SQL migrations (profiles table, RLS, triggers)
```
