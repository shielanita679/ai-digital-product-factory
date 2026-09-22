-- Phase 4: persist the full Create Product wizard configuration on projects.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI.
-- Depends on 20260922140000_create_projects.sql.
--
-- Backward compatible: every new column is added with a DEFAULT (or is
-- nullable), so existing Phase 3 rows are valid immediately — no backfill,
-- no rewrite, no data loss. Existing rows simply read back with the
-- defaults below for fields they never set.

alter table public.projects
  -- The raw idea prompt from Step 1. Nullable: Phase 3 rows never had one.
  add column if not exists user_prompt text,

  -- Step 3 — Style. Zero or more presets, plus an optional freeform addition.
  add column if not exists style text[] not null default '{}',
  add column if not exists custom_style text,

  -- Step 4 — Audience. Optional; zero or more presets, plus freeform.
  add column if not exists target_audience text[] not null default '{}',
  add column if not exists custom_audience text,

  -- Step 5 — Design options. `requested_design_count` is the wizard's
  -- target quantity to generate later; kept distinct from the existing
  -- `design_count` column, which tracks how many designs actually exist
  -- (still always 0 until Phase 5+ generates real ones).
  add column if not exists requested_design_count integer not null default 1
    check (requested_design_count > 0),
  add column if not exists content_mode text not null default 'text_and_graphics'
    check (content_mode in ('text_only', 'graphics_only', 'text_and_graphics')),
  add column if not exists color_mode text not null default 'no_preference'
    check (color_mode in ('no_preference', 'monochrome', 'limited_palette', 'full_color', 'custom')),
  add column if not exists custom_colors text[] not null default '{}',
  add column if not exists transparent_background boolean not null default true,
  add column if not exists orientation text not null default 'square'
    check (orientation in ('square', 'portrait', 'landscape')),
  add column if not exists detail_level text not null default 'medium'
    check (detail_level in ('simple', 'medium', 'detailed')),

  -- Reserved for whatever the Phase 5+ AI pipeline needs beyond the
  -- structured columns above (model choice, seed, prompt-engine version,
  -- etc.) — genuinely flexible/forward-looking data, so JSONB here is
  -- appropriate rather than speculative extra columns.
  add column if not exists generation_config jsonb not null default '{}'::jsonb;

comment on column public.projects.user_prompt is
  'Step 1 idea prompt, as typed by the user. Null for projects created before Phase 4.';
comment on column public.projects.requested_design_count is
  'Wizard target quantity to generate (Phase 5+). Distinct from design_count, which counts designs that actually exist.';
comment on column public.projects.generation_config is
  'Reserved JSONB bucket for future AI-generation parameters not yet modeled as columns.';
