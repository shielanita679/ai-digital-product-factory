-- Phase 10: ZIP packaging + download center — product_packages.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI. NOT applied by
-- this commit — for review first, same process as every migration
-- since Phase 6.
-- Depends on 20260924000000_create_generation_pipeline.sql (public.projects,
-- public.set_updated_at()), 20260928000000_create_bundles_and_mockups.sql
-- (public.product_bundles), and 20260930000000_create_product_listings.sql
-- (public.product_listings, read by PackageService but not referenced by
-- any FK here — a package can be built with or without a saved listing).
--
-- Backward compatible: only ADDS one new table. Does not alter
-- public.projects, public.designs, public.generation_jobs,
-- public.vectorizations, public.product_bundles, public.bundle_items,
-- public.mockups, public.product_listings, or public.profiles in any way.
--
-- ===========================================================================
-- LESSON FROM THE PHASE 7/8/9 INCIDENTS — READ BEFORE EDITING ANY POLICY BELOW
-- ===========================================================================
-- Phase 7's first RLS fix for public.vectorizations was itself broken: its
-- EXISTS(...) ownership subquery referenced the row-being-written's own
-- columns as bare `user_id` / `project_id`. Because the joined table
-- ALSO has columns with those exact names, Postgres's correlated-subquery
-- resolution rules resolved the UNQUALIFIED identifier against the
-- subquery's OWN FROM-list first — `d.project_id = project_id` silently
-- became the tautology `d.project_id = d.project_id`, always true
-- regardless of what was actually submitted. This was found live: an
-- authenticated user could attach their own real design to ANOTHER user's
-- project_id. See 20260926000000_create_vectorizations.sql,
-- 20260927000000_fix_vectorizations_relational_rls.sql, and the Phase 8/9
-- migrations for the full writeups.
--
-- product_packages sits at the SAME depth as Phase 9's product_listings
-- (package -> bundle -> project, one hop deeper than Phase 8's
-- bundle_items/mockups), so the ownership chain below joins TWO tables
-- (product_bundles AND projects) inside one EXISTS — both of which have
-- their own user_id column, and product_bundles also has its own
-- project_id column. Every reference to the row being written is
-- qualified as `product_packages.<col>` — NEVER a bare column name inside
-- an EXISTS(...) that also selects from a table sharing that column name.
-- Do not "simplify" this policy by dropping the qualifiers.

-- ---------------------------------------------------------------------------
-- product_packages
-- ---------------------------------------------------------------------------
-- One canonical package row per (bundle, marketplace) — the SAME keying
-- decision as product_listings, and for the same reason: listing.txt and
-- license.txt inside the ZIP are sourced from that marketplace's saved
-- product_listings row (see src/lib/packages/package-service.ts), so a
-- bundle with both a 'generic' and an 'etsy' listing can legitimately have
-- two independently-buildable ZIPs, one per marketplace. Rebuilding
-- updates this SAME row in place (never an uncontrolled duplicate) — see
-- the "version" column below and PackageService.buildPackage's doc comment
-- for the full idempotency design, including how a FAILED rebuild
-- preserves the previous valid package instead of destroying it.
create table if not exists public.product_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  bundle_id uuid not null references public.product_bundles (id) on delete cascade,

  marketplace text not null default 'generic' check (
    marketplace in ('generic', 'etsy')
  ),

  -- `status` reflects the LAST BUILD ATTEMPT ONLY, not "is this package
  -- currently downloadable" — that second question is answered by
  -- `storage_path is not null`, completely independently. A failed
  -- rebuild sets status='failed' with error_message set, while
  -- deliberately leaving storage_bucket/storage_path/file_name/
  -- file_size_bytes/checksum_sha256/version UNTOUCHED, so the last
  -- successfully built ZIP stays fully downloadable. See
  -- src/config/packages.ts's hasDownloadablePackage() and
  -- PackageService.buildPackage's doc comment for the full reasoning —
  -- this is Phase 10's answer to the spec's "distinguish
  -- current-valid-package from a failed rebuild" requirement, without a
  -- second table or a second boolean column.
  status text not null default 'queued' check (
    status in ('queued', 'building', 'completed', 'failed')
  ),

  -- Number of SUCCESSFUL builds — incremented only when a build actually
  -- completes and uploads. 0 means "never successfully built", even if a
  -- failed attempt has since set status='failed'. Deliberately a simple
  -- counter, not a version-history table: Phase 10 only ever needs "the
  -- current downloadable ZIP", never a seller's old package versions kept
  -- around, so one canonical row with a counter is the smaller, honest
  -- design for this phase (see the migration's own top-of-file writeup
  -- and the Phase 10 final report for the explicit reasoning).
  version integer not null default 0 check (version >= 0),

  -- Canonical asset identity is bucket + path, exactly like every other
  -- Storage-backed table in this schema — never a signed URL, which is
  -- always generated fresh and short-lived (300s — see
  -- src/lib/storage/package-storage.ts). NULL until the first successful
  -- build.
  storage_bucket text,
  storage_path text,
  -- The seller-facing download filename (e.g. "cute-sticker-pack.zip") —
  -- distinct from storage_path, which is the fixed, deterministic Storage
  -- object key.
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  checksum_sha256 text check (checksum_sha256 is null or char_length(checksum_sha256) = 64),

  -- Total number of files written into the ZIP on the last successful
  -- build (PNG + SVG + mockups + cover + listing.txt + license.txt +
  -- README.txt) — a denormalized fact about that build, recomputed fresh
  -- on every successful build, never incremented/decremented piecemeal.
  item_count integer not null default 0 check (item_count >= 0),

  -- Structural build metadata for debugging/future phases (file list,
  -- types, sizes, source design ids) — see
  -- src/lib/packages/package-manifest-builder.ts. Deliberately excludes
  -- anything sensitive (no secrets, no signed URLs, no tokens).
  manifest jsonb not null default '{}'::jsonb,

  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set on every SUCCESSFUL build only — left at its previous value
  -- across a failed rebuild, consistent with storage_path/checksum above.
  completed_at timestamptz,

  constraint product_packages_bundle_marketplace_unique unique (bundle_id, marketplace)
);

comment on table public.product_packages is
  'One canonical downloadable ZIP package per (bundle, marketplace).
   Rebuilding updates this same row in place. status reflects only the
   last build attempt; storage_path/checksum_sha256/file_size_bytes/
   version/completed_at reflect the last SUCCESSFUL build and are
   preserved across a failed rebuild — see PackageService.buildPackage
   for the full idempotency design.';

create index if not exists idx_product_packages_project_id on public.product_packages (project_id);
create index if not exists idx_product_packages_user_id on public.product_packages (user_id);

alter table public.product_packages enable row level security;

-- SELECT/DELETE: plain ownership check is sufficient — neither can be used
-- to CREATE a cross-user reference, only to read/remove a row that INSERT/
-- UPDATE's stronger check (below) already guaranteed is self-consistent.
create policy "Users can view their own packages"
  on public.product_packages
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their own packages"
  on public.product_packages
  for delete
  using (auth.uid() = user_id);

-- INSERT/UPDATE: proves the bundle in bundle_id is owned by this same
-- user_id, that the bundle's OWN project_id matches the project_id claimed
-- on this row, and that the project itself is also owned by this same
-- user_id — the full "user -> their project -> their bundle" chain, not
-- just a one-hop check. Every reference to the row being written is
-- qualified as `product_packages.<col>` (see the lesson above);
-- product_bundles and projects each have their own user_id column, and
-- product_bundles also has its own project_id column, so unqualified
-- references here would shadow exactly the way the Phase 7 bug did.
create policy "Users can create their own packages"
  on public.product_packages
  for insert
  with check (
    auth.uid() = product_packages.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.projects p on p.id = b.project_id
      where b.id = product_packages.bundle_id
        and b.user_id = product_packages.user_id
        and b.project_id = product_packages.project_id
        and p.user_id = product_packages.user_id
    )
  );

create policy "Users can update their own packages"
  on public.product_packages
  for update
  using (auth.uid() = product_packages.user_id)
  with check (
    auth.uid() = product_packages.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.projects p on p.id = b.project_id
      where b.id = product_packages.bundle_id
        and b.user_id = product_packages.user_id
        and b.project_id = product_packages.project_id
        and p.user_id = product_packages.user_id
    )
  );

drop trigger if exists set_product_packages_updated_at on public.product_packages;

create trigger set_product_packages_updated_at
  before update on public.product_packages
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage — deliberately NO changes in this migration.
-- ---------------------------------------------------------------------------
-- Package ZIP objects live in the EXISTING generated-designs bucket
-- (private, public: false — unchanged), under:
--   {user_id}/{project_id}/bundles/{bundle_id}/package/{marketplace}.zip
-- The four storage.objects RLS policies from
-- 20260925000000_add_design_storage.sql check ONLY the FIRST path segment
-- against auth.uid() — `(storage.foldername(name))[1] = auth.uid()::text`
-- — with no opinion on anything after it. The path above still starts
-- with exactly `{user_id}/`, so it is already fully covered by those
-- existing policies, verified against their actual predicate (not
-- assumed): no new Storage policies are needed here, exactly like
-- vector.svg in Phase 7 and mockups/cover in Phase 8.

-- Cascade behavior summary:
--   auth.users deleted      -> product_packages rows deleted (user_id FK)
--   public.projects deleted -> product_packages rows deleted (project_id FK)
--   product_bundles deleted -> product_packages rows deleted (bundle_id FK)
-- In every case this only removes DATABASE rows. The package ZIP Storage
-- object is NOT part of any of these cascades and MUST be removed by the
-- application BEFORE the owning row disappears — see
-- src/lib/bundles/bundle-service.ts's deleteBundle() (extended in Phase 10
-- to also remove product_packages' Storage object(s) before the bundle
-- row cascade) and src/lib/generation/generation-service.ts's
-- cleanupProjectStorage() (extended the same way for project deletion).
