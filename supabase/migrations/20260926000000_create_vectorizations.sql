-- Phase 7: vector (SVG) derivative foundation — the vectorizations table.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI.
-- Depends on 20260924000000_create_generation_pipeline.sql (designs
-- table, public.set_updated_at() trigger function) and
-- 20260925000000_add_design_storage.sql (generated-designs bucket).
--
-- Backward compatible: this migration only ADDS one new table. It does
-- not alter public.projects, public.designs, public.generation_jobs, or
-- public.profiles in any way, so every existing Phase 1-6 row and
-- behavior is completely unaffected. It also does not touch the
-- generated-designs Storage bucket or its existing RLS policies — see
-- the "Storage" note near the bottom of this file for why none are
-- needed here.
--
-- Schema decision — ONE canonical row per design, not a history table:
-- `design_id` is UNIQUE. A design has at most one *current* vector
-- result at a time; retrying a failed vectorization (or, later,
-- re-vectorizing a completed one) UPDATES this same row in place rather
-- than inserting a new one. This sidesteps two problems a per-run history
-- table (like generation_jobs, which intentionally keeps one row per
-- generation attempt) would introduce here: "which row is canonical" for
-- a design that's been vectorized more than once, and orphaned Storage
-- objects from earlier attempts once a canonical vector.svg always lives
-- at the same design-derived path. Unlike generation_jobs, no partial
-- unique index for "at most one active job" is needed either — the plain
-- unique(design_id) constraint already guarantees at most one row per
-- design, active or not, so there is nothing extra to race against.

create table if not exists public.vectorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  design_id uuid not null references public.designs (id) on delete cascade,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed')
  ),
  provider text not null default 'mock',
  provider_vectorization_id text,
  -- Canonical asset identity is storage_bucket + storage_path, exactly
  -- like public.designs — never a signed URL, which is always generated
  -- fresh and short-lived (see src/lib/storage/design-storage.ts).
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  width integer,
  height integer,
  view_box text,
  path_count integer check (path_count is null or path_count >= 0),
  shape_count integer check (shape_count is null or shape_count >= 0),
  color_count integer check (color_count is null or color_count >= 0),
  has_embedded_raster boolean not null default false,
  -- Vectorization settings actually applied (provider-reported), e.g.
  -- {"maxColors": 6, "simplify": "medium"} — see VectorizationSettings in
  -- src/lib/vector/vector-provider.ts. Never assumed to equal what the
  -- caller requested.
  settings jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint vectorizations_design_id_unique unique (design_id)
);

comment on table public.vectorizations is
  'The vector (SVG) derivative of a design''s real, stored raster original.
   One canonical row per design (unique(design_id)) — a retry or
   re-vectorization updates this row in place, it never creates a second
   row for the same design. has_embedded_raster is always false for a
   ''completed'' row: an SVG that embeds raster content fails validation
   and the row is marked ''failed'' instead, it is never marked completed
   with that flag true. See src/lib/vector/vectorize-service.ts for the
   full pipeline and src/lib/vector/svg-validate.ts /
   src/lib/vector/svg-security.ts for what a submitted SVG must pass
   before this row can ever reach status=''completed''.';

comment on column public.vectorizations.storage_path is
  'Object path within storage_bucket: {user_id}/{project_id}/{design_id}/vector.svg
   — the SAME per-design prefix public.designs.storage_path uses for
   original.<ext>, so the existing generated-designs bucket RLS policies
   (see 20260925000000_add_design_storage.sql) already cover this object
   with no new policy required.';

-- design_id is already indexed by its own UNIQUE constraint above; these
-- two match the equivalent indexes on public.designs for the same access
-- patterns (by-project listing, by-user ownership queries/cleanup).
create index if not exists idx_vectorizations_project_id on public.vectorizations (project_id);
create index if not exists idx_vectorizations_user_id on public.vectorizations (user_id);

alter table public.vectorizations enable row level security;

-- Strict owner-only RLS, identical in shape to public.designs' policies.
-- user_id is always the server-derived auth.uid() of the caller (see
-- VectorizationContext in vectorize-service.ts) — a design/project's
-- OWN user_id is re-verified server-side before any row here is
-- touched, so this policy is a second, independent enforcement layer,
-- not the only one. Cross-user access is impossible: every one of the
-- four operations below requires auth.uid() = user_id.
create policy "Users can view their own vectorizations"
  on public.vectorizations
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own vectorizations"
  on public.vectorizations
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own vectorizations"
  on public.vectorizations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own vectorizations"
  on public.vectorizations
  for delete
  using (auth.uid() = user_id);

drop trigger if exists set_vectorizations_updated_at on public.vectorizations;

create trigger set_vectorizations_updated_at
  before update on public.vectorizations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage — deliberately NO changes in this migration.
-- ---------------------------------------------------------------------------
-- vector.svg objects live in the EXISTING generated-designs bucket, under
-- the same {user_id}/{project_id}/{design_id}/ prefix as original.<ext>.
-- The four storage.objects RLS policies created in
-- 20260925000000_add_design_storage.sql only check the FIRST path
-- segment against auth.uid() — they do not care about the filename that
-- follows it — so vector.svg is already fully covered by those existing
-- policies with zero new Storage policies needed here. The bucket also
-- stays private (public: false); nothing in this migration changes that.

-- Cascade behavior summary:
--   auth.users deleted      -> vectorizations row deleted (user_id FK)
--   public.projects deleted -> vectorizations row deleted (project_id FK)
--   public.designs deleted  -> vectorizations row deleted (design_id FK)
-- In every case this only removes the DATABASE row. The Storage object
-- at vector.svg is NOT part of any of these cascades (Postgres cascades
-- never reach Supabase Storage) and must be deleted by the application
-- before the design/project row disappears — see cleanupProjectStorage()
-- and deleteDesign() in src/lib/generation/generation-service.ts, both
-- updated in Phase 7 to also clean up this table's Storage objects.
