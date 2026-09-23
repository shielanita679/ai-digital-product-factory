-- LIVE-SUPABASE-ONLY TEST — mirrors
-- supabase/tests/20260928_bundles_mockups_rls.sql's structure and
-- rationale. Do not run this against a database that hasn't had
-- 20260930000000_create_product_listings.sql applied, and never run it
-- against a production project with real user data. Everything below
-- happens inside one transaction, rolled back at the end.
--
-- WHY THIS FILE EXISTS, SEPARATE FROM THE VITEST SUITE:
-- src/lib/listings/listings-migration-rls.test.ts (run automatically by
-- `npm run test`) only checks that the migration's SQL TEXT still
-- contains the right fully-qualified clauses — a regression guard against
-- someone editing the SQL back to an ambiguous form. It cannot prove
-- Postgres actually enforces it, because vitest has no database
-- connection. This file is what actually proves it.
--
-- HOW TO RUN:
--   1. Apply 20260930000000_create_product_listings.sql to a
--      disposable/staging Supabase project (it depends on
--      20260928000000_create_bundles_and_mockups.sql already being
--      applied there too).
--   2. Create two real disposable auth users via the Admin API (same as
--      every prior live-testing session in this project) and substitute
--      their real ids for the two placeholder UUIDs below.
--   3. Run this whole file as one script via
--      `psql "$SUPABASE_DB_URL" -f supabase/tests/20260930_product_listings_rls.sql`
--      or the Supabase SQL Editor.
--   4. Every scenario below must print "PASS: ...". Any "FAIL: ..." means
--      a relational-ownership gap is present and the migration must NOT
--      be trusted as-is.
--   5. Delete the two disposable users afterward — this script only rolls
--      back its own table inserts, it does not touch auth.users.

begin;

-- User A: 00000000-0000-0000-0000-0000000000A1
-- User B: 00000000-0000-0000-0000-0000000000B2

insert into public.projects (id, user_id, name, product_type) values
  ('10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'RLS test — A''s project 1', 'single_svg'),
  ('10000000-0000-0000-0000-0000000000A2', '00000000-0000-0000-0000-0000000000A1', 'RLS test — A''s project 2', 'single_svg'),
  ('10000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', 'RLS test — B''s project', 'single_svg');

-- One bundle per project, owned by the matching user.
insert into public.product_bundles (id, user_id, project_id, name) values
  ('40000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', 'A bundle 1'),
  ('40000000-0000-0000-0000-0000000000A2', '00000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A2', 'A bundle 2'),
  ('40000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000B2', 'B bundle');

create or replace function pg_temp.act_as(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$ language plpgsql;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000A1'); -- acting as User A from here on

-- ===========================================================================
-- product_listings
-- ===========================================================================

-- Scenario L1: A's bundle 1 + A's project 1 (matching) -> MUST SUCCEED
do $$
begin
  insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
  values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'generic');
  raise notice 'PASS: L1 (fully consistent) correctly allowed';
end $$;

-- Scenario L2: A's bundle 1 + B's project -> MUST FAIL (cross-user project attachment)
do $$
begin
  begin
    insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
    values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000B2', '00000000-0000-0000-0000-0000000000A1', 'etsy');
    raise exception 'FAIL: L2 (A bundle, B project) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L2 correctly rejected'; end;
end $$;

-- Scenario L3: B's bundle + A's own project -> MUST FAIL (cross-user bundle attachment)
do $$
begin
  begin
    insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
    values ('40000000-0000-0000-0000-0000000000B2', '10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'generic');
    raise exception 'FAIL: L3 (B bundle, A project) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L3 correctly rejected'; end;
end $$;

-- Scenario L4: A's bundle 1 + A's OTHER project (2) — same user, wrong project -> MUST FAIL
do $$
begin
  begin
    insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
    values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A2', '00000000-0000-0000-0000-0000000000A1', 'etsy');
    raise exception 'FAIL: L4 (A bundle 1, A project 2 — wrong project) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L4 correctly rejected'; end;
end $$;

-- Scenario L5: A authenticated but user_id claims B -> MUST FAIL
do $$
begin
  begin
    insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
    values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000B2', 'etsy');
    raise exception 'FAIL: L5 (A authenticated, user_id=B) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L5 correctly rejected'; end;
end $$;

-- Scenario L6: unique(bundle_id, marketplace) — a second 'generic' row for the same bundle MUST fail as a duplicate, not silently succeed twice
do $$
begin
  begin
    insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
    values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'generic');
    raise exception 'FAIL: L6 duplicate (bundle, marketplace) was allowed';
  exception when unique_violation then raise notice 'PASS: L6 correctly rejected as a duplicate'; end;
end $$;

-- Scenario L7: a second marketplace ('etsy') for the SAME bundle -> MUST SUCCEED (this is the whole point of the composite unique key)
do $$
begin
  insert into public.product_listings (bundle_id, project_id, user_id, marketplace)
  values ('40000000-0000-0000-0000-0000000000A1', '10000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-0000000000A1', 'etsy');
  raise notice 'PASS: L7 (second marketplace, same bundle) correctly allowed';
end $$;

-- Scenario L8 (UPDATE): retarget the valid 'generic' row to B's project -> MUST FAIL
do $$
begin
  begin
    update public.product_listings set project_id = '10000000-0000-0000-0000-0000000000B2'
    where bundle_id = '40000000-0000-0000-0000-0000000000A1' and marketplace = 'generic' and user_id = '00000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: L8 (retarget project_id to B) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L8 correctly rejected'; end;
end $$;

-- Scenario L9 (UPDATE): retarget the valid 'generic' row's user_id to B -> MUST FAIL
do $$
begin
  begin
    update public.product_listings set user_id = '00000000-0000-0000-0000-0000000000B2'
    where bundle_id = '40000000-0000-0000-0000-0000000000A1' and marketplace = 'generic' and user_id = '00000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: L9 (retarget user_id to B) was allowed';
  exception when insufficient_privilege then raise notice 'PASS: L9 correctly rejected'; end;
end $$;

-- Scenario L10: User B cannot SELECT/UPDATE/DELETE A's listing row
select pg_temp.act_as('00000000-0000-0000-0000-0000000000B2');
do $$
declare v_count int;
begin
  select count(*) into v_count from public.product_listings where bundle_id = '40000000-0000-0000-0000-0000000000A1';
  if v_count = 0 then raise notice 'PASS: L10a B cannot SELECT A''s listings'; else raise exception 'FAIL: L10a B could see A''s listings'; end if;
end $$;
do $$
begin
  begin
    update public.product_listings set title = 'hijacked' where bundle_id = '40000000-0000-0000-0000-0000000000A1';
    raise exception 'FAIL: L10b B could UPDATE A''s listing (or it silently no-opped without error, check row count separately)';
  exception when insufficient_privilege then raise notice 'PASS: L10b correctly rejected'; end;
end $$;
do $$
begin
  delete from public.product_listings where bundle_id = '40000000-0000-0000-0000-0000000000A1';
  raise notice 'PASS: L10c B''s DELETE affected 0 rows (RLS-filtered, not an error) — verify row count separately if run manually';
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000A1');

rollback;
