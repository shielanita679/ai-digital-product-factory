# Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the Project URL, Publishable key
   (`sb_publishable_...`), and Secret key (`sb_secret_...`) into
   `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` (see
   `.env.example` at the repo root — never commit `.env.local`). Older
   projects that instead show a legacy `anon` / `service_role` JWT pair can
   use those under `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` — the app accepts either naming.
3. Apply the migrations in `migrations/` in order, either:
   - **Dashboard**: open **SQL Editor**, paste each file's contents, run.
   - **CLI**: `supabase link --project-ref <your-project-ref>` then
     `supabase db push`.
4. In **Authentication → URL Configuration**, set:
   - **Site URL**: `http://localhost:3000` (and your production URL later).
   - **Redirect URLs**: add `http://localhost:3000/auth/confirm` (and the
     production equivalent).
5. In **Authentication → Email Templates**, update the **Confirm signup**
   and **Reset Password** templates so their action link points at our
   `/auth/confirm` route instead of the default GoTrue-hosted link:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - Reset Password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

That's it — no server or Docker required for the app itself, Supabase is
fully hosted.
