-- LIVE-SUPABASE-ONLY TEST — do not run this against a database that
-- hasn't had 20260926000000_create_vectorizations.sql (the CORRECTED
-- version, with the EXISTS(...) ownership check on INSERT/UPDATE)
-- applied, and never run it against a production project with real user
-- data. It creates and deletes rows inside a single transaction that is
-- rolled back at the end (see the final `rollback;`), so nothing it does
-- is meant to persist even if the manual substitution below is skipped —
-- but treat it as write-capable and run it against a disposable/staging
-- project, not production.
--
-- WHY THIS FILE EXISTS, SEPARATE FROM THE VITEST SUITE: the
-- vulnerability this covers is an RLS POLICY behavior — something only a
-- real Postgres server evaluates. src/lib/vector/vectorizations-migration-rls.test.ts
-- (run automatically by `npm run test`) only checks that the migration's
-- SQL TEXT still contains the right clauses; it is a regression guard
-- against someone editing the SQL back to the vulnerable form, but it
-- CANNOT prove Postgres actually enforces it, because vitest has no
-- database connection. This file is the thing that actually proves it —
-- it must be run manually, once, against a live (disposable) Supabase
-- project after the migration is applied, before that migration is
-- trusted in production.
--
-- HOW TO RUN:
--   1. Apply the CORRECTED 20260926000000_create_vectorizations.sql to a
--      disposable/staging Supabase project (never production for this
--      test).
--   2. Create two real disposable auth users the same way every prior
--      live-testing session in this project has (Supabase Admin API:
--      `admin.auth.admin.createUser({ email, password, email_confirm: true })`)
--      — do NOT try to `insert into auth.users` directly; Supabase's
--      auth schema has additional required state/triggers a raw insert
--      won't satisfy reliably across projects.
--   3. Replace the two placeholder UUIDs below —
--      00000000-0000-0000-0000-0000000000A1 (User A) and
--      00000000-0000-0000-0000-0000000000B2 (User B) — with those two
--      real user ids.
--   4. Run this whole file as a single script, either via
--      `psql "$SUPABASE_DB_URL" -f supabase/tests/20260926_vectorizations_rls.sql`
--      or by pasting it into the Supabase SQL Editor (which already runs
--      as a role with permission to `set local role authenticated`).
--   5. Read the RAISE NOTICE / RAISE EXCEPTION output: every scenario
--      below must print "PASS: ...". Any "FAIL: ..." means the
--      ownership-consistency vulnerability is present and the migration
--      must NOT be trusted as-is.
--   6. Delete the two disposable users afterward (same as every other
--      live-testing session in this project) — this script only rolls
--      back its own inserts into public.projects/public.designs/
--      public.vectorizations, it does not touch auth.users.

begin;

-- ---------------------------------------------------------------------
-- Fixtures — replace these two UUIDs with real disposable user ids
-- created via the Admin API (see step 2/3 above) before running.
-- ---------------------------------------------------------------------
-- User A: 00000000-0000-0000-0000-0000000000A1
-- User B: 00000000-0000-0000-0000-0000000000B2

insert into public.projects (id, user_id, name, product_type) values
  ('10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'RLS test — A''s project', 'single_svg'),
  ('10000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', 'RLS test — B''s project', 'single_svg');

insert into public.generation_jobs (id, user_id, project_id, requested_count) values
  ('20000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 1),
  ('20000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', 1);

insert into public.designs (id, user_id, project_id, generation_job_id, variation_index, title, prompt, status) values
  ('30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '20000000-0000-0000-0000-0000000000A1', 0, 'A design', 'a prompt', 'completed'),
  ('30000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', '20000000-0000-0000-0000-0000000000B2', 0, 'B design', 'b prompt', 'completed');

-- Impersonate a given user for the rest of this transaction — the same
-- mechanism PostgREST uses when it receives that user's JWT, so this
-- exercises the exact policies a real authenticated request would.
create or replace function pg_temp.act_as(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$ language plpgsql;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000A1'); -- acting as User A from here on

-- ---------------------------------------------------------------------
-- Scenario 1 — A user_id, B design_id, B project_id -> MUST FAIL
-- (your exact reported scenario)
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into public.vectorizations (user_id, project_id, design_id)
    values ('00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000B2', '30000000-0000-0000-0000-0000000000B2');
    raise exception 'FAIL: scenario 1 (A user_id, B design_id, B project_id) was allowed — RLS vulnerability present';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 1 correctly rejected';
  end;
end $$;

-- ---------------------------------------------------------------------
-- Scenario 2 — A user_id, A design_id, B project_id -> MUST FAIL
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into public.vectorizations (user_id, project_id, design_id)
    values ('00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000B2', '30000000-0000-0000-0000-0000000000A1');
    raise exception 'FAIL: scenario 2 (A user_id, A design_id, B project_id) was allowed';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 2 correctly rejected';
  end;
end $$;

-- ---------------------------------------------------------------------
-- Scenario 3 — A user_id, B design_id, A project_id -> MUST FAIL
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into public.vectorizations (user_id, project_id, design_id)
    values ('00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000B2');
    raise exception 'FAIL: scenario 3 (A user_id, B design_id, A project_id) was allowed';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 3 correctly rejected';
  end;
end $$;

-- ---------------------------------------------------------------------
-- Scenario 4 — A user_id, A design_id, A project_id -> MUST SUCCEED
-- (the fully consistent case — this must keep working)
-- ---------------------------------------------------------------------
do $$
begin
  insert into public.vectorizations (user_id, project_id, design_id)
  values ('00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000A1');
  raise notice 'PASS: scenario 4 (fully consistent triple) correctly allowed';
end $$;

-- ---------------------------------------------------------------------
-- Scenario 5 (UPDATE) — the legitimate row from scenario 4 must not be
-- mutable into an inconsistent design_id, project_id, or user_id.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    update public.vectorizations
    set design_id = '30000000-0000-0000-0000-0000000000B2'
    where user_id = '00000000-0000-0000-0000-0000000000A1'
      and project_id = '10000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: scenario 5a (retarget design_id to B''s design) was allowed';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 5a correctly rejected';
  end;
end $$;

do $$
begin
  begin
    update public.vectorizations
    set project_id = '10000000-0000-0000-0000-0000000000B2'
    where user_id = '00000000-0000-0000-0000-0000000000A1'
      and design_id = '30000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: scenario 5b (retarget project_id to B''s project) was allowed';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 5b correctly rejected';
  end;
end $$;

do $$
begin
  begin
    update public.vectorizations
    set user_id = '00000000-0000-0000-0000-0000000000B2'
    where design_id = '30000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: scenario 5c (reassign user_id to B) was allowed';
  exception
    when insufficient_privilege then
      raise notice 'PASS: scenario 5c correctly rejected';
  end;
end $$;

-- ---------------------------------------------------------------------
-- Everything above happened inside one transaction — roll it back so no
-- fixture data (or a wrongly-allowed row, if a FAIL occurred) persists.
-- ---------------------------------------------------------------------
rollback;
