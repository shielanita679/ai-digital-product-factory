-- Phase 5: AI generation pipeline foundation — generation_jobs + designs.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI.
-- Depends on 20260922140000_create_projects.sql (projects table,
-- public.set_updated_at() trigger function).
--
-- Backward compatible: this migration only ADDS two new tables. It does
-- not alter public.projects or public.profiles in any way, so every
-- existing Phase 1-4 row and behavior is completely unaffected.

-- ---------------------------------------------------------------------------
-- generation_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'partially_completed', 'failed', 'cancelled')
  ),
  provider text not null default 'mock',
  prompt_engine_version text not null default 'v1',
  requested_count integer not null check (requested_count > 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_jobs_counts_within_requested
    check (completed_count + failed_count <= requested_count)
);

comment on table public.generation_jobs is
  'One generation run for a project: a snapshot of how many designs were
   requested and how many actually succeeded/failed. Phase 5 processes a job
   synchronously against the mock provider; the row shape is written so a
   later real provider can update it asynchronously (queue/worker/webhook)
   without any schema change.';

-- At most one active (queued/processing) job per project — the real
-- concurrency guard lives here, not just in application code, so it holds
-- under double-click, refresh, and multiple tabs alike.
create unique index if not exists idx_one_active_generation_job_per_project
  on public.generation_jobs (project_id)
  where status in ('queued', 'processing');

create index if not exists idx_generation_jobs_project_id on public.generation_jobs (project_id);
create index if not exists idx_generation_jobs_user_id on public.generation_jobs (user_id);
create index if not exists idx_generation_jobs_project_created
  on public.generation_jobs (project_id, created_at desc);

alter table public.generation_jobs enable row level security;

create policy "Users can view their own generation jobs"
  on public.generation_jobs
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own generation jobs"
  on public.generation_jobs
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own generation jobs"
  on public.generation_jobs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own generation jobs"
  on public.generation_jobs
  for delete
  using (auth.uid() = user_id);

drop trigger if exists set_generation_jobs_updated_at on public.generation_jobs;

create trigger set_generation_jobs_updated_at
  before update on public.generation_jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- designs
-- ---------------------------------------------------------------------------
create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  generation_job_id uuid not null references public.generation_jobs (id) on delete cascade,
  variation_index integer not null check (variation_index >= 0),
  title text not null,
  prompt text not null,
  negative_prompt text,
  status text not null default 'pending' check (
    status in ('pending', 'generating', 'completed', 'failed')
  ),
  image_url text,
  thumbnail_url text,
  width integer,
  height integer,
  provider text not null default 'mock',
  provider_generation_id text,
  error_message text,
  prompt_engine_version text not null default 'v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint designs_unique_variation_per_job unique (generation_job_id, variation_index)
);

comment on table public.designs is
  'One individual design (one prompt variation) belonging to a generation
   job. image_url/thumbnail_url point at mock/local preview content in
   Phase 5 (a data: URI rendered by MockImageProvider) — Phase 6+ will point
   these at real Supabase Storage objects instead; the column shape already
   supports that without a migration.';

create index if not exists idx_designs_project_id on public.designs (project_id);
create index if not exists idx_designs_user_id on public.designs (user_id);
create index if not exists idx_designs_generation_job_id on public.designs (generation_job_id);
create index if not exists idx_designs_project_status_created
  on public.designs (project_id, status, created_at desc);

alter table public.designs enable row level security;

create policy "Users can view their own designs"
  on public.designs
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own designs"
  on public.designs
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own designs"
  on public.designs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own designs"
  on public.designs
  for delete
  using (auth.uid() = user_id);

drop trigger if exists set_designs_updated_at on public.designs;

create trigger set_designs_updated_at
  before update on public.designs
  for each row
  execute function public.set_updated_at();
