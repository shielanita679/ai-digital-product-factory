-- Phase 9: listing generator + editor + license — product_listings.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI. NOT applied by
-- this commit — for review first, same process as every migration
-- since Phase 6.
-- Depends on 20260924000000_create_generation_pipeline.sql (public.projects,
-- public.set_updated_at()) and 20260928000000_create_bundles_and_mockups.sql
-- (public.product_bundles).
--
-- Backward compatible: only ADDS one new table. Does not alter
-- public.projects, public.designs, public.generation_jobs,
-- public.vectorizations, public.product_bundles, public.bundle_items,
-- public.mockups, or public.profiles in any way.
--
-- ===========================================================================
-- LESSON FROM THE PHASE 7/8 INCIDENTS — READ BEFORE EDITING ANY POLICY BELOW
-- ===========================================================================
-- Phase 7's first RLS fix for public.vectorizations was itself broken: its
-- EXISTS(...) ownership subquery referenced the row-being-written's own
-- columns as bare `user_id` / `project_id`. Because the joined table
-- (public.designs) ALSO has columns with those exact names, Postgres's
-- correlated-subquery resolution rules resolved the UNQUALIFIED identifier
-- against the subquery's OWN FROM-list first — `d.project_id = project_id`
-- silently became the tautology `d.project_id = d.project_id`, always true
-- regardless of what was actually submitted. This was found live: an
-- authenticated user could attach their own real design to ANOTHER user's
-- project_id. See 20260926000000_create_vectorizations.sql,
-- 20260927000000_fix_vectorizations_relational_rls.sql, and the Phase 8
-- migration for the full writeups.
--
-- product_listings sits one hop DEEPER than Phase 8's bundle_items/mockups
-- (listing -> bundle -> project, not just item -> bundle), so the ownership
-- chain below joins TWO tables (product_bundles AND projects) inside one
-- EXISTS — both of which have their own user_id column, and product_bundles
-- also has its own project_id column. Every reference to the row being
-- written is qualified as `product_listings.<col>` — NEVER a bare column
-- name inside an EXISTS(...) that also selects from a table sharing that
-- column name. Do not "simplify" this policy by dropping the qualifiers.

-- ---------------------------------------------------------------------------
-- product_listings
-- ---------------------------------------------------------------------------
-- One canonical listing row per (bundle, marketplace) — deliberately keyed
-- by marketplace rather than assuming exactly one row per bundle, so a
-- future second marketplace (e.g. "creative_market") can coexist as its own
-- row for the same bundle without a schema redesign. Phase 9 ships
-- 'generic' and 'etsy' only; MARKETPLACE_VALUES in src/config/marketplaces.ts
-- is the single source of truth the UI/service layer reads — this CHECK
-- constraint is the database's own independent backstop, not the only
-- place the allowed set is enumerated.
create table if not exists public.product_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  bundle_id uuid not null references public.product_bundles (id) on delete cascade,

  marketplace text not null default 'generic' check (
    marketplace in ('generic', 'etsy')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'generated', 'edited', 'completed', 'failed')
  ),

  title text check (title is null or char_length(btrim(title)) > 0),
  description text check (description is null or char_length(btrim(description)) > 0),

  -- String arrays as jsonb (mirrors metadata jsonb elsewhere in this
  -- schema) rather than Postgres text[] — keeps the shape symmetric with
  -- how the app already reads/writes jsonb columns (designs.style,
  -- projects.custom_colors use text[]; this table intentionally uses
  -- jsonb instead so array-of-object growth, e.g. per-tag metadata later,
  -- never forces a column-type migration).
  tags jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  included_files jsonb not null default '[]'::jsonb,
  seo_keywords jsonb not null default '[]'::jsonb,

  license_type text check (
    license_type is null or license_type in ('personal', 'commercial', 'extended_commercial')
  ),
  license_text text,
  -- Mirrors `status = 'edited'` for the listing body, but tracked
  -- separately: a seller can hand-edit the license text independently of
  -- title/description/tags, and changing license_type must never silently
  -- discard that hand-edited text (see LicenseService). This is the
  -- signal that stops a template-regenerate from doing so.
  license_edited boolean not null default false,

  generation_provider text,
  generation_model text,
  generation_version integer not null default 1 check (generation_version >= 1),

  error_message text,

  -- Section-level edited/generated tracking lives here, e.g.
  -- {"titleEdited": true, "descriptionEdited": false, ...} — see
  -- ListingService's edit-protection contract. Never trusted as
  -- authoritative on its own for security, only for UX (regeneration
  -- confirmation), same spirit as the denormalized counters in Phase 8.
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One canonical row per (bundle, marketplace): generating a listing
  -- again for the same bundle+marketplace updates this same row in place
  -- (never an uncontrolled duplicate), while a second marketplace for the
  -- same bundle gets its own row.
  constraint product_listings_bundle_marketplace_unique unique (bundle_id, marketplace)
);

comment on table public.product_listings is
  'Marketplace-ready listing metadata (title/description/tags/keywords/
   license) generated for one bundle, for one marketplace. One canonical
   row per (bundle_id, marketplace) — regenerating updates this same row,
   never duplicates it. No Storage assets are associated with this table;
   listing text lives entirely in these columns.';

create index if not exists idx_product_listings_project_id on public.product_listings (project_id);
create index if not exists idx_product_listings_user_id on public.product_listings (user_id);

alter table public.product_listings enable row level security;

-- SELECT/DELETE: plain ownership check is sufficient — neither can be used
-- to CREATE a cross-user reference, only to read/remove a row that INSERT/
-- UPDATE's stronger check (below) already guaranteed is self-consistent.
create policy "Users can view their own listings"
  on public.product_listings
  for select
  using (auth.uid() = user_id);

create policy "Users can delete their own listings"
  on public.product_listings
  for delete
  using (auth.uid() = user_id);

-- INSERT/UPDATE: proves the bundle in bundle_id is owned by this same
-- user_id, that the bundle's OWN project_id matches the project_id claimed
-- on this row, and that the project itself is also owned by this same
-- user_id — the full "user -> their project -> their bundle" chain the
-- Phase 9 spec calls for, not just a one-hop check. Every reference to the
-- row being written is qualified as `product_listings.<col>` (see the
-- lesson above); product_bundles and projects each have their own user_id
-- column, and product_bundles also has its own project_id column, so
-- unqualified references here would shadow exactly the way the Phase 7 bug
-- did.
create policy "Users can create their own listings"
  on public.product_listings
  for insert
  with check (
    auth.uid() = product_listings.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.projects p on p.id = b.project_id
      where b.id = product_listings.bundle_id
        and b.user_id = product_listings.user_id
        and b.project_id = product_listings.project_id
        and p.user_id = product_listings.user_id
    )
  );

create policy "Users can update their own listings"
  on public.product_listings
  for update
  using (auth.uid() = product_listings.user_id)
  with check (
    auth.uid() = product_listings.user_id
    and exists (
      select 1
      from public.product_bundles b
      join public.projects p on p.id = b.project_id
      where b.id = product_listings.bundle_id
        and b.user_id = product_listings.user_id
        and b.project_id = product_listings.project_id
        and p.user_id = product_listings.user_id
    )
  );

drop trigger if exists set_product_listings_updated_at on public.product_listings;

create trigger set_product_listings_updated_at
  before update on public.product_listings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage — none. Listing text and license text are stored entirely as
-- columns on this table; no Storage bucket/object is introduced or needed.
-- ---------------------------------------------------------------------------

-- Cascade behavior summary:
--   auth.users deleted      -> product_listings rows deleted (user_id FK)
--   public.projects deleted -> product_listings rows deleted (project_id FK)
--   product_bundles deleted -> product_listings rows deleted (bundle_id FK)
-- In every case this only removes DATABASE rows — there are no associated
-- Storage objects for this table, so no application-level Storage cleanup
-- is required for product_listings (unlike designs/vectorizations/
-- mockups/bundle covers in earlier phases).
