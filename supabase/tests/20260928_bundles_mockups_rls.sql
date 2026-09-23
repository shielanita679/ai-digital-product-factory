-- LIVE-SUPABASE-ONLY TEST — mirrors
-- supabase/tests/20260926_vectorizations_rls.sql's structure and
-- rationale. Do not run this against a database that hasn't had
-- 20260928000000_create_bundles_and_mockups.sql applied, and never run
-- it against a production project with real user data. Everything below
-- happens inside one transaction, rolled back at the end.
--
-- WHY THIS FILE EXISTS, SEPARATE FROM THE VITEST SUITE:
-- src/lib/bundles/bundles-migration-rls.test.ts (run automatically by
-- `npm run test`) only checks that the migration's SQL TEXT still
-- contains the right fully-qualified clauses — a regression guard
-- against someone editing the SQL back to an ambiguous form. It cannot
-- prove Postgres actually enforces it, because vitest has no database
-- connection. This file is what actually proves it.
--
-- HOW TO RUN:
--   1. Apply 20260928000000_create_bundles_and_mockups.sql to a
--      disposable/staging Supabase project.
--   2. Create two real disposable auth users via the Admin API (same as
--      every prior live-testing session in this project) and substitute
--      their real ids for the two placeholder UUIDs below.
--   3. Run this whole file as one script via
--      `psql "$SUPABASE_DB_URL" -f supabase/tests/20260928_bundles_mockups_rls.sql`
--      or the Supabase SQL Editor.
--   4. Every scenario below must print "PASS: ...". Any "FAIL: ..."
--      means a relational-ownership gap is present and the migration
--      must NOT be trusted as-is.
--   5. Delete the two disposable users afterward — this script only
--      rolls back its own table inserts, it does not touch auth.users.

begin;

-- User A: 00000000-0000-0000-0000-0000000000A1
-- User B: 00000000-0000-0000-0000-0000000000B2

insert into public.projects (id, user_id, name, product_type) values
  ('10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'RLS test — A''s project', 'single_svg'),
  ('10000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', 'RLS test — B''s project', 'single_svg');

insert into public.generation_jobs (id, user_id, project_id, requested_count) values
  ('20000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 1),
  ('20000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', 1);

insert into public.designs (id, user_id, project_id, generation_job_id, variation_index, title, prompt, status, storage_bucket, storage_path) values
  ('30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '20000000-0000-0000-0000-0000000000A1', 0, 'A design', 'a prompt', 'completed', 'generated-designs', '00000000-0000-0000-0000-0000000000A1/10000000-0000-0000-0000-0000000000A1/design-a/original.png'),
  ('30000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', '20000000-0000-0000-0000-0000000000B2', 0, 'B design', 'b prompt', 'completed', 'generated-designs', '00000000-0000-0000-0000-0000000000B2/10000000-0000-0000-0000-0000000000B2/design-b/original.png');

-- One bundle per user, owned by that user, in that user's own project.
insert into public.product_bundles (id, user_id, project_id, name) values
  ('40000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 'A bundle'),
  ('40000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', 'B bundle');

create or replace function pg_temp.act_as(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$ language plpgsql;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000A1'); -- acting as User A from here on

-- ===========================================================================
-- bundle_items
-- ===========================================================================

-- Scenario BI1: A's bundle + B's design -> MUST FAIL (cross-user design attachment)
do $$
begin
  begin
    insert into public.bundle_items (bundle_id, design_id, user_id, include_png)
    values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000A1', true);
    raise exception 'FAIL: BI1 (A bundle, B design) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: BI1 correctly rejected'; end;
end $$;

-- Scenario BI2: B's bundle + A's own design -> MUST FAIL (cross-user bundle attachment)
do $$
begin
  begin
    insert into public.bundle_items (bundle_id, design_id, user_id, include_png)
    values ('40000000-0000-0000-0000-0000000000B2', '30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', true);
    raise exception 'FAIL: BI2 (B bundle, A design) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: BI2 correctly rejected'; end;
end $$;

-- Scenario BI3: A's bundle + A's own design, fully consistent -> MUST SUCCEED
do $$
begin
  insert into public.bundle_items (bundle_id, design_id, user_id, include_png)
  values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', true);
  raise notice 'PASS: BI3 (fully consistent triple) correctly allowed';
end $$;

-- Scenario BI4 (UPDATE): retarget the valid row to B's design -> MUST FAIL
do $$
begin
  begin
    update public.bundle_items set design_id = '30000000-0000-0000-0000-0000000000B2'
    where bundle_id = '40000000-0000-0000-0000-0000000000A1' and user_id = '00000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: BI4 (retarget design_id to B) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: BI4 correctly rejected'; end;
end $$;

-- Scenario BI5: User B cannot SELECT/UPDATE/DELETE A's bundle_items row
select pg_temp.act_as('00000000-0000-0000-0000-0000000000B2');
do $$
declare v_count int;
begin
  select count(*) into v_count from public.bundle_items where bundle_id = '40000000-0000-0000-0000-0000000000A1';
  if v_count = 0 then raise notice 'PASS: BI5a B cannot SELECT A''s bundle_items'; else raise exception 'FAIL: BI5a B could see A''s bundle_items'; end if;
end $$;
do $$
begin
  begin
    update public.bundle_items set include_svg = true where bundle_id = '40000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: BI5b B could UPDATE A''s bundle_items (or it silently no-opped without error, check row count separately)';
  exception when insufficient_privilege then raise notice 'PASS: BI5b correctly rejected'; end;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000A1');

-- ===========================================================================
-- mockups
-- ===========================================================================

-- Scenario M1: A's bundle + B's design -> MUST FAIL
do $$
begin
  begin
    insert into public.mockups (bundle_id, design_id, user_id, project_id, template_type)
    values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 'tshirt');
    raise exception 'FAIL: M1 (A bundle, B design) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: M1 correctly rejected'; end;
end $$;

-- Scenario M2: A's bundle + A's design, but project_id claims B's project -> MUST FAIL (denormalized project_id mismatch — the exact Phase 7 bug shape)
do $$
begin
  begin
    insert into public.mockups (bundle_id, design_id, user_id, project_id, template_type)
    values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000B2', 'mug');
    raise exception 'FAIL: M2 (project_id mismatch) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: M2 correctly rejected'; end;
end $$;

-- Scenario M3: fully consistent -> MUST SUCCEED
do $$
begin
  insert into public.mockups (bundle_id, design_id, user_id, project_id, template_type)
  values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 'tote_bag');
  raise notice 'PASS: M3 (fully consistent) correctly allowed';
end $$;

-- Scenario M4: unique(bundle_id, design_id, template_type) — a duplicate MUST fail with a unique violation, not silently succeed twice
do $$
begin
  begin
    insert into public.mockups (bundle_id, design_id, user_id, project_id, template_type)
    values ('40000000-0000-0000-0000-0000000000A1', '30000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 'tote_bag');
    raise exception 'FAIL: M4 duplicate (bundle, design, template) was allowed';
  exception when unique_violation then raise notice 'PASS: M4 correctly rejected as a duplicate'; end;
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000B2');
do $$
declare v_count int;
begin
  select count(*) into v_count from public.mockups where bundle_id = '40000000-0000-0000-0000-0000000000A1';
  if v_count = 0 then raise notice 'PASS: M5 B cannot SELECT A''s mockups'; else raise exception 'FAIL: M5 B could see A''s mockups'; end if;
end $$;

rollback;
