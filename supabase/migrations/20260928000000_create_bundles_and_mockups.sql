-- Phase 8: bundle builder + mockups + bundle cover — product_bundles,
-- bundle_items, mockups.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI. NOT applied by
-- this commit — for review first, same process as every migration
-- since Phase 6.
-- Depends on 20260924000000_create_generation_pipeline.sql (designs,
-- public.set_updated_at()) and 20260925000000_add_design_storage.sql
-- (generated-designs bucket + its Storage RLS policies).
--
-- Backward compatible: only ADDS three new tables. Does not alter
-- public.projects, public.designs, public.generation_jobs,
-- public.vectorizations, or public.profiles in any way.
--
-- ===========================================================================
-- LESSON FROM THE PHASE 7 INCIDENT — READ BEFORE EDITING ANY POLICY BELOW
-- ===========================================================================
-- Phase 7's first RLS fix for public.vectorizations was itself broken: its
-- EXISTS(...) ownership subquery referenced the row-being-written's own
-- columns as bare `user_id` / `project_id`. public.designs ALSO has columns
-- with those exact names, and inside a correlated subquery Postgres
-- resolves an UNQUALIFIED identifier against the subquery's OWN FROM-list
-- FIRST — so `d.project_id = project_id` silently became the tautology
-- `d.project_id = d.project_id`, always true regardless of what was
-- actually submitted. This was found live, not in review: an authenticated
-- user could attach their own real design to ANOTHER user's project_id.
-- See 20260926000000_create_vectorizations.sql and
-- 20260927000000_fix_vectorizations_relational_rls.sql for the full
-- writeup and fix.
--
-- Every policy below that references the row-being-written's own columns
-- from inside a correlated subquery uses the FULLY QUALIFIED form —
-- `product_bundles.user_id`, `bundle_items.bundle_id`,
-- `mockups.project_id`, etc. — NEVER a bare column name inside an
-- EXISTS(...) that also selects from a table sharing that column name.
-- product_bundles, bundle_items, designs, and mockups all have user_id;
-- product_bundles, designs, and mockups all have project_id. Any of these
-- names, left unqualified inside a subquery touching more than one of
-- these tables, is a live shadowing hazard. Do not "simplify" these
-- policies by dropping the qualifiers.

-- ---------------------------------------------------------------------------
-- product_bundles
-- ---------------------------------------------------------------------------
-- A sellable bundle of selected assets from ONE project. Phase 8 builds the
-- bundle + its mockups + its cover; ZIP/download packaging is Phase 10 (see
-- item_count/mockup_count below — counters only, no packaged file yet).
create table if not exists public.product_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  status text not null default 'draft' check (
    status in ('draft', 'building', 'completed', 'failed')
  ),
  -- Canonical cover asset identity is bucket + path, exactly like
  -- designs.storage_path / vectorizations.storage_path — never a signed
  -- URL, which is always generated fresh and short-lived (see
  -- src/lib/storage/mockup-storage.ts).
  cover_storage_bucket text,
  cover_storage_path text,
  -- Denormalized counters, recomputed by the application (BundleService),
  -- the same pattern as projects.design_count — never trusted as
  -- authoritative on their own, always derived from a real count of
  -- bundle_items / mockups rows.
  item_count integer not null default 0 check (item_count >= 0),
  mockup_count integer not null default 0 check (mockup_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_bundles is
  'A sellable digital-product bundle assembled from selected designs of ONE
   project, plus generated mockups and a generated cover. Phase 8 stops at
   this assembled asset set — ZIP/download packaging is Phase 10.';

create index if not exists idx_product_bundles_project_id on public.product_bundles (project_id);
create index if not exists idx_product_bundles_user_id on public.product_bundles (user_id);

alter table public.product_bundles enable row level security;

-- SELECT/DELETE: plain ownership check is sufficient — neither can be used
-- to CREATE a cross-user reference, only to read/remove a row that INSERT/
-- UPDATE's stronger check (below) already guaranteed is self-consistent.
create policy "Users can view their own bundles"
  on public.product_bundles
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their own bundles"
  on public.product_bundles
  for delete
  using (auth.uid() = user_id);

-- INSERT/UPDATE: auth.uid() = user_id alone doesn't prove project_id
-- belongs to that same user — the project_id FK only proves SOME project
-- with that id exists, not who owns it. Every reference to the row being
-- written is qualified as `product_bundles.<col>` (see the Phase 7 lesson
-- above) to avoid shadowing against public.projects' own user_id column.
create policy "Users can create their own bundles"
  on public.product_bundles
  for insert
  with check (
    auth.uid() = product_bundles.user_id
    and exists (
      select 1
      from public.projects p
      where p.id = product_bundles.project_id
        and p.user_id = product_bundles.user_id
    )
  );

create policy "Users can update their own bundles"
  on public.product_bundles
  for update
  using (auth.uid() = product_bundles.user_id)
  with check (
    auth.uid() = product_bundles.user_id
    and exists (
      select 1
      from public.projects p
      where p.id = product_bundles.project_id
        and p.user_id = product_bundles.user_id
    )
  );

drop trigger if exists set_product_bundles_updated_at on public.product_bundles;

create trigger set_product_bundles_updated_at
  before update on public.product_bundles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bundle_items — which designs are selected into a bundle, and which
-- formats (PNG/SVG) should eventually be included when it's packaged.
-- ---------------------------------------------------------------------------
create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.product_bundles (id) on delete cascade,
  design_id uuid not null references public.designs (id) on delete cascade,
  -- Present for direct, self-contained RLS checks on THIS table (see the
  -- INSERT/UPDATE policy below) — not duplicated data for its own sake;
  -- every write path validates it against both product_bundles.user_id
  -- and designs.user_id via EXISTS, it is never trusted on its own.
  user_id uuid not null references auth.users (id) on delete cascade,
  include_png boolean not null default true,
  include_svg boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per (bundle, design): selecting an already-selected design
  -- again just updates its format flags, it never creates a duplicate
  -- selection.
  constraint bundle_items_bundle_design_unique unique (bundle_id, design_id),
  constraint bundle_items_at_least_one_format check (include_png or include_svg)
);

comment on table public.bundle_items is
  'One design selected into a bundle, with which formats (PNG/SVG) should
   be included. include_svg may only honestly be requested when the design
   has a completed vectorization — enforced in application code
   (BundleService), not here: this table has no FK to vectorizations, so a
   design can be selected before it is vectorized and include_svg flipped
   on once vectorization completes.';

create index if not exists idx_bundle_items_bundle_id on public.bundle_items (bundle_id);
create index if not exists idx_bundle_items_design_id on public.bundle_items (design_id);
create index if not exists idx_bundle_items_user_id on public.bundle_items (user_id);

alter table public.bundle_items enable row level security;

create policy "Users can view their own bundle items"
  on public.bundle_items
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their own bundle items"
  on public.bundle_items
  for delete
  using (auth.uid() = user_id);

-- INSERT/UPDATE: a single EXISTS join proves THREE things about the row
-- being written at once — (1) the bundle in bundle_id is owned by this
-- same user_id, (2) the design in design_id is owned by this same
-- user_id, and (3) that design actually belongs to the bundle's OWN
-- project (blocking a same-user-but-wrong-project attachment, not just
-- cross-user). Every reference to the row being written is qualified as
-- `bundle_items.<col>` — see the Phase 7 lesson at the top of this file.
-- Both product_bundles and designs have their own user_id column, and
-- designs also has project_id, so unqualified references here would
-- shadow exactly the way the original Phase 7 bug did.
create policy "Users can create their own bundle items"
  on public.bundle_items
  for insert
  with check (
    auth.uid() = bundle_items.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.designs d on d.id = bundle_items.design_id
      where b.id = bundle_items.bundle_id
        and b.user_id = bundle_items.user_id
        and d.user_id = bundle_items.user_id
        and d.project_id = b.project_id
    )
  );

create policy "Users can update their own bundle items"
  on public.bundle_items
  for update
  using (auth.uid() = bundle_items.user_id)
  with check (
    auth.uid() = bundle_items.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.designs d on d.id = bundle_items.design_id
      where b.id = bundle_items.bundle_id
        and b.user_id = bundle_items.user_id
        and d.user_id = bundle_items.user_id
        and d.project_id = b.project_id
    )
  );

drop trigger if exists set_bundle_items_updated_at on public.bundle_items;

create trigger set_bundle_items_updated_at
  before update on public.bundle_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mockups
-- ---------------------------------------------------------------------------
-- Scoping decision: every mockup (including the "digital_bundle_preview"
-- template) is generated FROM ONE design, never from the bundle as an
-- unscoped whole — this keeps design_id/project_id/user_id uniformly
-- NOT NULL (no conditional-null template-dependent columns) and keeps
-- every row's ownership independently, uniformly checkable. A bundle-wide
-- preview is still meaningfully generatable per-design (it composes that
-- one design into a "this is part of a bundle" preview card).
create table if not exists public.mockups (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.product_bundles (id) on delete cascade,
  design_id uuid not null references public.designs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Denormalized like vectorizations.project_id — always derivable via
  -- bundle_id/design_id, kept here for direct query/cleanup convenience,
  -- and — critically — validated for consistency by the INSERT/UPDATE
  -- policy below, never trusted as freely settable. See the Phase 7
  -- lesson at the top of this file: this is exactly the column shape
  -- that caused that incident.
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed')
  ),
  provider text not null default 'mock',
  provider_mockup_id text,
  template_type text not null check (
    template_type in ('tshirt', 'mug', 'tote_bag', 'wall_art', 'sticker_sheet', 'digital_bundle_preview')
  ),
  -- Canonical asset identity is bucket + path — never a signed URL.
  storage_bucket text,
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  -- One canonical row per (bundle, design, template) — the same "retry
  -- updates in place, never duplicates" design as
  -- vectorizations_design_id_unique, generalized to three columns since a
  -- design can have several DIFFERENT template mockups within the same
  -- bundle (a t-shirt AND a mug), just never two competing rows for the
  -- SAME template.
  constraint mockups_bundle_design_template_unique unique (bundle_id, design_id, template_type)
);

comment on table public.mockups is
  'One generated mockup image for one design, within one bundle, for one
   template (t-shirt, mug, etc). One canonical row per
   (bundle_id, design_id, template_type) — a retry updates this same row
   in place rather than inserting a new one, so there is never an
   uncontrolled duplicate row or an orphaned prior Storage object once the
   canonical path is always {bundle_id}/mockups/{id}.png (see
   src/lib/storage/mockup-storage.ts).';

create index if not exists idx_mockups_bundle_id on public.mockups (bundle_id);
create index if not exists idx_mockups_design_id on public.mockups (design_id);
create index if not exists idx_mockups_user_id on public.mockups (user_id);
create index if not exists idx_mockups_project_id on public.mockups (project_id);

alter table public.mockups enable row level security;

create policy "Users can view their own mockups"
  on public.mockups
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their own mockups"
  on public.mockups
  for delete
  using (auth.uid() = user_id);

-- INSERT/UPDATE: proves the bundle, the design, AND the (denormalized)
-- project_id on THIS row are all mutually consistent and owned by the
-- same user — the exact shape of check the original Phase 7 bug was
-- missing. Every outer-row reference is qualified as `mockups.<col>`.
create policy "Users can create their own mockups"
  on public.mockups
  for insert
  with check (
    auth.uid() = mockups.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.designs d on d.id = mockups.design_id
      where b.id = mockups.bundle_id
        and b.user_id = mockups.user_id
        and d.user_id = mockups.user_id
        and b.project_id = mockups.project_id
        and d.project_id = mockups.project_id
    )
  );

create policy "Users can update their own mockups"
  on public.mockups
  for update
  using (auth.uid() = mockups.user_id)
  with check (
    auth.uid() = mockups.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.designs d on d.id = mockups.design_id
      where b.id = mockups.bundle_id
        and b.user_id = mockups.user_id
        and d.user_id = mockups.user_id
        and b.project_id = mockups.project_id
        and d.project_id = mockups.project_id
    )
  );

drop trigger if exists set_mockups_updated_at on public.mockups;

create trigger set_mockups_updated_at
  before update on public.mockups
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage — deliberately NO changes in this migration.
-- ---------------------------------------------------------------------------
-- Mockup and cover objects live in the EXISTING generated-designs bucket
-- (private, public: false — unchanged), under:
--   {user_id}/{project_id}/bundles/{bundle_id}/mockups/{mockup_id}.png
--   {user_id}/{project_id}/bundles/{bundle_id}/cover.png
-- The four storage.objects RLS policies from
-- 20260925000000_add_design_storage.sql check ONLY the FIRST path
-- segment against auth.uid() — `(storage.foldername(name))[1] =
-- auth.uid()::text` — with no opinion on anything after it. Both paths
-- above still start with exactly `{user_id}/`, so they are already fully
-- covered by those existing policies, verified against their actual
-- predicate (not assumed): no new Storage policies are needed here,
-- exactly like vector.svg in Phase 7.

-- Cascade behavior summary:
--   auth.users deleted      -> product_bundles/bundle_items/mockups rows deleted (user_id FK)
--   public.projects deleted -> product_bundles/mockups rows deleted (project_id FK); bundle_items deleted transitively via product_bundles cascade
--   public.designs deleted  -> bundle_items/mockups rows deleted (design_id FK)
--   product_bundles deleted -> bundle_items/mockups rows deleted (bundle_id FK)
-- In every case this only removes DATABASE rows. Storage objects (cover.png,
-- mockups/*.png) are NOT part of any of these cascades and must be removed
-- by the application BEFORE the owning row disappears — see
-- src/lib/bundles/bundle-service.ts, src/lib/bundles/mockup-service.ts, and
-- the Phase 8 extensions to src/lib/generation/generation-service.ts's
-- deleteDesign()/cleanupProjectStorage().
