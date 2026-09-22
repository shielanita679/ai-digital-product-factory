-- Phase 3: projects (product/project management) + Row Level Security
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI.
-- Depends on 20260922093000_create_profiles.sql (reuses public.set_updated_at()).

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  product_type text not null default 'svg_bundle' check (
    product_type in (
      'svg_bundle',
      'single_svg',
      'printable',
      'sticker_pack',
      'tshirt_graphics',
      'sublimation',
      'wall_art',
      'laser_cut',
      'digital_paper',
      'coloring_pages'
    )
  ),
  status text not null default 'draft' check (
    status in ('draft', 'in_progress', 'ready', 'published')
  ),
  cover_url text,
  design_count integer not null default 0 check (design_count >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is
  'A user''s digital product / project shell. Designs, mockups, listings, and
   packaging attach to this in later phases.';

create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_projects_user_archived_created
  on public.projects (user_id, archived, created_at desc);

alter table public.projects enable row level security;

create policy "Users can view their own projects"
  on public.projects
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own projects"
  on public.projects
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects
  for delete
  using (auth.uid() = user_id);

-- Reuses the trigger function created in 20260922093000_create_profiles.sql.
drop trigger if exists set_projects_updated_at on public.projects;

create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();
