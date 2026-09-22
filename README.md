# AI Digital Product Factory

Turn one idea into a complete sellable digital product in minutes — AI-generated
designs, transparent PNGs, vector SVGs, mockups, listing copy, and a
downloadable ZIP package, built for Etsy, Cricut, print-on-demand, and craft
sellers.

## Status

**Phase 1 complete:** design system, responsive landing page, login/register
UI, and a placeholder dashboard shell. Authentication, the product wizard, AI
generation, and billing are not wired up yet — see the implementation phases
in the project brief for what's next.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui-style
components · Supabase (planned) · Stripe (planned) · Zod · React Hook Form

## Getting Started

```bash
npm install
cp .env.example .env.local
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
`.env.local` and never commit real credentials.

## Project Structure

```
src/
  app/
    (marketing)/   # public landing page
    (auth)/        # login, register
    dashboard/     # authenticated app shell (placeholder)
  components/
    ui/            # reusable primitives (button, card, input, ...)
    layout/        # header, footer, logo
    marketing/      # landing page sections
    auth/          # auth forms
    theme/         # dark mode provider/toggle
  config/          # centrally stored site nav, pricing plans, dashboard nav
  lib/             # utilities, validation schemas
```
