-- Phase 7 corrective migration: fixes an identifier-shadowing bug in the
-- INSERT/UPDATE policies on public.vectorizations that 20260926000000
-- already applied live.
--
-- WHY THIS IS A SEPARATE MIGRATION, NOT AN EDIT TO 20260926000000:
-- 20260926000000_create_vectorizations.sql has already been applied to
-- the live Supabase project. Re-running it would be a no-op for the
-- table/policies (create table/policy statements aren't idempotent for
-- CREATE POLICY — see that file's own note on this), so it cannot be
-- used to fix an already-applied policy. This migration's only job is
-- to replace the two flawed policies in place. It does not touch the
-- table definition, SELECT, DELETE, indexes, the trigger, or Storage.
--
-- THE BUG (found via live RLS testing, not theoretical): the original
-- INSERT/UPDATE policies' EXISTS(...) subqueries referenced the
-- row-being-written's own columns as bare `user_id` / `project_id`
-- instead of `vectorizations.user_id` / `vectorizations.project_id`.
-- public.designs ALSO has columns literally named user_id and
-- project_id. Inside a correlated subquery, Postgres resolves an
-- UNQUALIFIED identifier against the subquery's OWN FROM-list first —
-- so `and d.project_id = project_id` silently became
-- `and d.project_id = d.project_id`, a tautology that is always true no
-- matter what project_id was actually submitted. `d.id = design_id` had
-- no such collision (designs has no design_id column) and so happened
-- to resolve correctly outward, and `d.user_id = user_id` was ALSO
-- silently shadowed the same way as project_id (both are columns on
-- designs) — but the design_id check alone still filtered out most
-- cross-design attempts, which is why the live test's design_id-mismatch
-- scenarios were correctly rejected while the project_id-mismatch
-- scenario (submitting a real, self-owned design_id together with
-- another user's project_id) was wrongly ALLOWED. This was confirmed by
-- an actual inconsistent row being created live during testing, since
-- cleaned up.
--
-- THE FIX: qualify every reference to the row being written with the
-- table name — `vectorizations.user_id`, `vectorizations.design_id`,
-- `vectorizations.project_id` — inside both EXISTS(...) subqueries, so
-- there is no possible ambiguity with public.designs' own same-named
-- columns.
--
-- Idempotent and safe to run once against the live project: uses
-- DROP POLICY IF EXISTS before recreating each of the two policies, so
-- re-running this file (e.g. by accident) is a no-op the second time.
-- Does not alter public.vectorizations' columns, constraints, indexes,
-- or trigger, and does not touch storage.objects policies.

drop policy if exists "Users can create their own vectorizations" on public.vectorizations;
drop policy if exists "Users can update their own vectorizations" on public.vectorizations;

create policy "Users can create their own vectorizations"
  on public.vectorizations
  for insert
  with check (
    auth.uid() = vectorizations.user_id
    and exists (
      select 1
      from public.designs d
      where d.id = vectorizations.design_id
        and d.user_id = vectorizations.user_id
        and d.project_id = vectorizations.project_id
    )
  );

create policy "Users can update their own vectorizations"
  on public.vectorizations
  for update
  using (auth.uid() = vectorizations.user_id)
  with check (
    auth.uid() = vectorizations.user_id
    and exists (
      select 1
      from public.designs d
      where d.id = vectorizations.design_id
        and d.user_id = vectorizations.user_id
        and d.project_id = vectorizations.project_id
    )
  );

-- SELECT and DELETE are unchanged (still `using (auth.uid() = user_id)`,
-- untouched by this migration) — neither policy contains a subquery, so
-- neither was ever subject to this shadowing bug, and neither can be
-- used to CREATE a cross-user reference in the first place.
