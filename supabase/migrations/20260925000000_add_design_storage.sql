-- Phase 6: durable Supabase Storage identity for real (non-mock) designs,
-- plus the private storage bucket + RLS policies that hold the actual
-- image bytes.
-- Apply via the Supabase Dashboard SQL Editor, or `supabase db push` if
-- you have the project linked with the Supabase CLI.
-- Depends on 20260924000000_create_generation_pipeline.sql (designs table).
--
-- Backward compatible: only ADDS nullable columns to public.designs and a
-- new storage bucket. Every existing Phase 5 mock design row is
-- unaffected — its preview keeps working exactly as before, entirely out
-- of image_url (a self-contained data: URI), with these new columns left
-- null.

-- ---------------------------------------------------------------------------
-- public.designs — durable storage identity
-- ---------------------------------------------------------------------------
alter table public.designs
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0);

comment on column public.designs.storage_bucket is
  'Supabase Storage bucket holding the durable original image for a REAL (non-mock) design. Null for Phase 5 mock designs.';
comment on column public.designs.storage_path is
  'Object path within storage_bucket, e.g. {user_id}/{project_id}/{design_id}/original.png. This — not any URL — is the canonical, durable asset identity; display/download URLs are always generated on demand as short-lived signed URLs (see src/lib/storage/design-storage.ts), never stored permanently.';
comment on column public.designs.file_size_bytes is
  'Size of the stored object in bytes, when known. Foundation for future storage-quota/cost tooling (Phase 11) — not enforced or billed yet.';

-- ---------------------------------------------------------------------------
-- storage bucket — private (not public read); every access goes through a
-- short-lived signed URL generated server-side after an ownership check,
-- or through the RLS-scoped upload/delete calls below.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('generated-designs', 'generated-designs', false)
on conflict (id) do nothing;

-- Objects are stored at {user_id}/{project_id}/{design_id}/original.<ext> —
-- every path segment is a server-derived UUID from an already
-- ownership-checked row, never user-supplied text, so there's no
-- path-traversal surface. These policies enforce that the *first* path
-- segment must equal the requesting user's own auth.uid(), which is
-- exactly the prefix the application always writes to — matching Supabase's
-- documented folder-based Storage RLS pattern.
create policy "Users can read their own generated design objects"
  on storage.objects
  for select
  using (
    bucket_id = 'generated-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own generated design objects"
  on storage.objects
  for insert
  with check (
    bucket_id = 'generated-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own generated design objects"
  on storage.objects
  for update
  using (
    bucket_id = 'generated-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generated-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own generated design objects"
  on storage.objects
  for delete
  using (
    bucket_id = 'generated-designs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
