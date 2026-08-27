-- 0008_policy_tests.sql — the authorisation proof for MS4. Acceptance criterion P3.
--
-- DELIBERATE DEVIATION from 08 §3.8, which placed this in supabase/migrations/. A migration is
-- applied to every environment, and this file creates two fixture users in auth.users; those must
-- never reach production. It therefore lives in supabase/tests/ and is run by CI against a fresh
-- `supabase db reset`, inside a transaction that is rolled back at the end. Nothing it creates
-- survives, and production never sees it.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0008_policy_tests.sql
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
--
-- ONE HARNESS PREREQUISITE ON A THROWAWAY CONTAINER, measured 2026-08-19 (MS5 task 5) and recorded
-- here because it cost a session's debugging twice. In the bare
-- public.ecr.aws/supabase/postgres:17.6.1.064 image, auth.uid() is
--   select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
-- i.e. the LEGACY singular GUC, while this file sets the modern `request.jwt.claims` JSON (as
-- PostgREST does, and as the hosted projects' auth.uid() reads). The suite therefore aborts at the
-- first save_place() call with `ERROR: not authenticated`, and every later assertion reports
-- `current transaction is aborted` — which looks like a policy failure and is not one. Before
-- running against such a container, as supabase_admin (postgres cannot write to auth):
--   create or replace function auth.uid() returns uuid language sql stable as $fn$
--     select coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
--                     (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid)
--   $fn$;
-- With that in place the suite is 54 PASS + 1 UNPROVEN (P23). VERIFIED: the bare image ships the
-- singular form and our migrations do not define auth.uid() at all, so this is a property of the
-- image.
--
-- The hosted half is no longer ASSUMED. VERIFIED 2026-08-26 against p-002-staging: this file was
-- run through the session pooler and reached PASS P0b / P4b, both of which read and write under a
-- `request.jwt.claims` setting. Had the hosted project shipped the legacy singular GUC, the run
-- would have aborted at the first save_place() with `ERROR: not authenticated`, as the paragraph
-- above describes. So the hosted projects DO ship the claims-reading auth.uid(). `supabase db
-- reset` remains ASSUMED — that one was not exercised.
--
-- LIMIT WORTH KNOWING BEFORE YOU RUN THIS: **it requires an empty database**, and says so badly.
-- Several assertions count ALL rows in a table rather than the rows this file created, so on any
-- database with data in it they fail for a reason that has nothing to do with policies:
--   * the `extractions` setup guard fails as `FAIL setup: the extraction fixture was not created`
--     when the database already holds an extraction — measured on a working local container, where
--     the message is actively misleading (the fixture WAS created; it was simply not the only row);
--   * `FAIL P7: near-duplicate guard created 14 places` — measured against p-002-staging, which
--     had 13 places before the run.
-- In CI this never bites, because CI runs it against a fresh `supabase db reset`. It does mean
-- `npm run db:test` cannot be run against a local database you are actually developing against
-- without resetting it first — and a reset throws away the cached `extractions` rows, which cost
-- real model calls against a 500/day ceiling. Scoping these counts to the fixture rows would fix
-- it; that is a change to this file's assertions and is deliberately not being made in passing.
--
-- Nothing survived the staging run: auth.users back to 2, places 13, zero fixture rows left.
--
-- It tests the POLICIES, not the client code: every read and write below happens under
-- `set role authenticated` with request.jwt.claims set, exactly as PostgREST would run it.
-- FORCE ROW LEVEL SECURITY is why this works — the owner is subject to its own policies too, and
-- only the BYPASSRLS roles (postgres, service_role) are exempt.
--
-- SHAPE OF THE FILE
--   P0 / P0b / P0c / setup  the fixture, and the POSITIVE half: the owner can read their own rows.
--                           Without it, every "B sees zero" assertion is also satisfied by a schema
--                           that denies everyone everything.
--   P1–P4, P4c, P9          the cross-user denials, one per policy. P4c performs the provenance
--                           forgery; P9 covers the seven policies that previously had no test.
--   P5, P6                  grants: what must not be reachable at all, as `authenticated` and `anon`.
--   P7, P7b, P8             the invariants of MS4 (dedup guard, deferred triggers, provenance).
--   P10–P23                 migration 0011: merge chains, the alias invariant's real scope, the
--                           staleness gate, and serialisation. Every one of these paths was
--                           uncovered before; merge_places had no test of any kind, which is why
--                           MS4 shipped a resolver that could hand save_place a tombstone.
--   P25                     migration 0019: the enrichment columns (tags / why_go / dishes).
--                           P25a is the one that matters — it is the assertion that 0015/0017's
--                           `extracted_reason` grant hole (current-state.md §3.4) was not
--                           reopened for three more system-derived columns. Unlike the older
--                           sections, P25 names its rows by id and counts nothing, so it runs
--                           against a database that already has data in it.
--                           P25a-vi/vii were split apart on 2026-08-27 after an independent
--                           sabotage pass (RICH-EXT-SEC) found the single combined assertion
--                           reporting PASS with the EXECUTE grant it names actually applied. The
--                           reasoning is at the assertion; the short version is that a policy test
--                           which cannot fail is worse than no policy test.
--   P19c, P19d              migration 0013: the tombstone exemption reaching the OTHER alias
--                           trigger (0005's INSERT-side places_alias_required), which 0011 missed.
--                           Numbered topically, next to P19's exemption test, not chronologically.
--
-- WHAT THIS FILE DOES NOT PROVE. P23 records one invariant as DELIBERATELY UNPROVEN: two-session
-- mutual exclusion in resolve_place step 2, which `08` §4 claims as prevented. A psql script is one
-- session; the comment at P23 names the two-connection harness that would prove it. Read it before
-- treating this suite as a complete proof of `08` §4.
--
-- Failure-first: every assertion below was checked in both directions against a throwaway database —
-- the fix reverted, the test seen to fail, the fix restored. Two of them passed at first with the
-- trigger they were supposed to be testing dropped (see the note at P17); that is the bug class this
-- file exists to catch, so it is written down where it happened rather than in a report.

begin;

-- ── fixtures, created as the privileged role ────────────────────────────────────────────────
-- Two real users. The profiles rows are NOT created here on purpose: handle_new_user() (0002)
-- must create them, so this doubles as the proof that the signup trigger works (B2 / R9).
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
       ('22222222-2222-2222-2222-222222222222', 'b@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222')) <> 2 then
    raise exception 'FAIL P0: handle_new_user did not create a profile per auth user';
  end if;
  raise notice 'PASS P0  signup trigger creates the profile row';
end $$;

-- One shared post, one shared place, resolved through the trusted path only.
select public.start_import('11111111-1111-1111-1111-111111111111',
                           'tiktok', '7300000000000000001',
                           'https://www.tiktok.com/@who/video/7300000000000000001');

update public.sources
   set fetch_status = 'ok', fetched_at = now(), content_text = 'best hummus at Abu Hassan, Jaffa',
       author_handle = 'who'
 where platform_source_id = '7300000000000000001';

select id as source_id from public.sources
 where platform_source_id = '7300000000000000001' \gset

-- An extraction over that source. Not decoration: without a row here, every "B sees zero
-- extractions" assertion below is vacuously true — it passes identically if the policy is
-- `using (true)` — and that is exactly the shape the audit found. The count is asserted from the
-- privileged role first, so the zero B reads is a zero produced by the policy.
insert into public.extractions (source_id, model, prompt_version, status, candidates, candidate_count)
values (:'source_id', 'test-model', 'v1', 'ok', '[{"name":"Abu Hassan"}]'::jsonb, 1);

do $$
begin
  if (select count(*) from public.extractions) <> 1 then
    raise exception 'FAIL setup: the extraction fixture was not created; every extractions assertion below would be vacuous';
  end if;
  raise notice 'PASS setup  one extraction row exists, so the extractions assertions are not vacuous';
end $$;

select public.resolve_place('overture', 'ovt-abu-hassan', 'Abu Hassan',
                            32.0530, 34.7515, 'restaurant', 'restaurant',
                            '1 HaDolfin St', 'Tel Aviv-Yafo', 'Tel Aviv', 'IL', '{}'::jsonb)
  as place_id \gset

-- A saves it, with provenance. Run as A so save_place() is exercised under RLS, as in production.
select set_config('request.jwt.claims',
                  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select public.save_place(:'place_id',
                         (select id from public.sources
                           where platform_source_id = '7300000000000000001'),
                         'A''s note');

do $$
begin
  if (select count(*) from public.saved_places) <> 1 then
    raise exception 'FAIL setup: A could not save the place under RLS';
  end if;
  if (select count(*) from public.saved_place_sources) <> 1 then
    raise exception 'FAIL setup: provenance link was not created';
  end if;
  raise notice 'PASS setup  A saved the shared place with provenance, under RLS';
end $$;

-- ── P0b: the positive half of every read policy, as the owner A ──────────────────────────────
-- Every assertion below this point is "B sees zero". On its own that is satisfiable by a schema in
-- which nobody can read anything — a policy set that denies everything passes P1–P3 perfectly. So
-- the owner's read is asserted first: each of the six membership-gated tables returns exactly the
-- rows A is entitled to. A deny-all regression now fails here rather than shipping green.
do $$
declare n integer;
begin
  select count(*) into n from public.saved_places;
  if n <> 1 then raise exception 'FAIL P0b: A sees % of their own saved_places (expected 1)', n; end if;
  select count(*) into n from public.saved_place_sources;
  if n <> 1 then raise exception 'FAIL P0b: A sees % of their own provenance rows (expected 1)', n; end if;
  select count(*) into n from public.places;
  if n <> 1 then raise exception 'FAIL P0b: A sees % places they saved (expected 1)', n; end if;
  select count(*) into n from public.place_provider_refs;
  if n <> 1 then raise exception 'FAIL P0b: A sees % provider refs for the place they saved (expected 1)', n; end if;
  select count(*) into n from public.imports;
  if n <> 1 then raise exception 'FAIL P0b: A sees % of their own imports (expected 1)', n; end if;
  -- sources: table-level SELECT is not granted (R8), so name the columns, as the data layer must
  select count(*) into n from (select id from public.sources) s;
  if n <> 1 then raise exception 'FAIL P0b: A sees % sources they imported (expected 1)', n; end if;
  select count(*) into n from public.extractions;
  if n <> 1 then raise exception 'FAIL P0b: A sees % extractions for their own import (expected 1)', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL P0b: A sees % profiles (expected only their own)', n; end if;
  raise notice 'PASS P0b the owner can read exactly their own rows through all six membership gates';
end $$;

-- Fixture ids as transaction-local GUCs. psql does NOT interpolate :vars inside a dollar-quoted
-- body, and half the assertions below have to name A's rows from inside a do block while running as
-- B — who cannot select them. A GUC is readable by any role, dies with the transaction, and needs
-- no grant, so it is the harness channel. Nothing in the application does this.
select set_config('qa.saved_place_id', (select id::text from public.saved_places), true),
       set_config('qa.a_uid', '11111111-1111-1111-1111-111111111111', true),
       set_config('qa.b_uid', '22222222-2222-2222-2222-222222222222', true),
       set_config('qa.source_id', (select source_id::text from public.imports), true),
       set_config('qa.place_id', (select place_id::text from public.saved_places), true);

-- ── P0c: imports_update_own, the positive half (R7: the user's own cancel) ───────────────────
-- The only import write a user is allowed to make. Asserted as the owner here and as a non-owner in
-- P9c. status='cancelled' is deliberately outside imports_open_one_per_source, so nothing later in
-- this script depends on the value.
do $$
begin
  update public.imports set status = 'cancelled', completed_at = now();
  if not found then raise exception 'FAIL P0c: A could not cancel their own import'; end if;
  if (select count(*) from public.imports where status = 'cancelled') <> 1 then
    raise exception 'FAIL P0c: the cancel did not persist';
  end if;
  raise notice 'PASS P0c imports_update_own lets the owner cancel their own import';
end $$;

-- P4b: a granted-column UPDATE by the owner must succeed AND fire touch_updated_at. This is the
-- assertion that 0009's "trigger functions need no EXECUTE grant" claim rests on: if firing a
-- trigger did require EXECUTE on its function, this is where it would break.
--
-- The trap this test fell into first: `now()` is the TRANSACTION timestamp, so comparing updated_at
-- before and after inside one transaction always shows no change even though the trigger ran. That
-- is correct behaviour for updated_at — a statement clock would make two rows written by one
-- confirmImport disagree about when they were saved. So the row is backdated as the privileged role
-- first, and the assertion is that the trigger dragged it forward to the transaction time.
reset role;
update public.saved_places set updated_at = '2000-01-01T00:00:00Z';

select set_config('request.jwt.claims',
                  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_after timestamptz;
begin
  update public.saved_places set note = 'edited by the owner';
  if not found then raise exception 'FAIL P4b: the owner could not edit their own note'; end if;
  select updated_at into v_after from public.saved_places limit 1;
  if v_after < '2020-01-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL P4b: touch_updated_at did not fire (updated_at still %)', v_after;
  end if;
  raise notice 'PASS P4b owner edits their overlay and touch_updated_at fires (no EXECUTE grant needed)';
end $$;

-- ── the cross-user denial assertions, as user B ─────────────────────────────────────────────
-- Four blocks, not two: P1 and P2 are the two milestone exit criteria from the plan; P3 and P4
-- were added with them and are asserted just as hard. The old heading said "the two exit
-- assertions" over a block containing four, which is the kind of drift that makes a reader trust
-- the label instead of the code.
reset role;
select set_config('request.jwt.claims',
                  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n integer;
begin
  -- P1 (plan exit 1): B's select of A's saved_places returns zero rows.
  select count(*) into n from public.saved_places;
  if n <> 0 then raise exception 'FAIL P1: B sees % saved_places rows of A', n; end if;
  raise notice 'PASS P1  B reads zero rows from A''s saved_places';

  -- P2 (plan exit 2): a place is invisible to a user who has not saved it.
  select count(*) into n from public.places;
  if n <> 0 then raise exception 'FAIL P2: B sees % places without saving any', n; end if;
  select count(*) into n from public.place_provider_refs;
  if n <> 0 then raise exception 'FAIL P2: B sees % provider refs without saving any', n; end if;
  raise notice 'PASS P2  places and place_provider_refs are invisible to a non-saver';

  -- P3: the shared source cache is membership-gated, both branches.
  select count(*) into n from public.sources;
  if n <> 0 then raise exception 'FAIL P3: B sees % sources without an import or a save', n; end if;
  select count(*) into n from public.imports;
  if n <> 0 then raise exception 'FAIL P3: B sees % of A''s imports', n; end if;
  select count(*) into n from public.extractions;
  if n <> 0 then raise exception 'FAIL P3: B sees % extractions', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL P3: B sees % profiles (expected only their own)', n; end if;
  raise notice 'PASS P3  sources, imports, extractions and profiles are owner/membership scoped';

  -- P4: B cannot write into A's library, and cannot forge provenance.
  update public.saved_places set note = 'hijacked';
  if found then raise exception 'FAIL P4: B updated a row in A''s library'; end if;
  delete from public.saved_places;
  if found then raise exception 'FAIL P4: B deleted a row from A''s library'; end if;
  raise notice 'PASS P4  B''s writes against A''s library affect zero rows';
end $$;

-- ── P4c: the provenance forgery, actually attempted ─────────────────────────────────────────
-- P4's notice used to claim B "cannot forge provenance" while attempting nothing of the kind. Three
-- attempts, all of which must fail. Provenance is the answer to "which TikTok made me save this",
-- and a user who can write another user's provenance row can both read that user's source (the
-- sources membership gate has a saved_place_sources branch) and corrupt their history.
--   i   attach A's source to A's saved place, as A            → sps_select/insert with_check
--   ii  attach A's source to A's saved place, but claim it as B → composite FK + with_check
--   iii launder A's source into B's OWN library               → the no-borrowed-provenance conjunct
-- (iii) is the one that matters most: it is the only one a real attacker would try, because it needs
-- nothing of A's except a source id, and success would grant B read access to A's post.
do $$
declare
  v_a_saved uuid := current_setting('qa.saved_place_id')::uuid;
  v_a_uid   uuid := current_setting('qa.a_uid')::uuid;
  v_b_uid   uuid := current_setting('qa.b_uid')::uuid;
  v_source  uuid := current_setting('qa.source_id')::uuid;
  v_place   uuid := current_setting('qa.place_id')::uuid;
begin
  begin
    insert into public.saved_place_sources (saved_place_id, user_id, source_id)
    values (v_a_saved, v_a_uid, v_source);
    raise exception 'FAIL P4c-i: B wrote a provenance row owned by A';
  exception when insufficient_privilege then
    raise notice 'PASS P4c-i B cannot write a provenance row carrying A''s user_id';
  end;

  begin
    insert into public.saved_place_sources (saved_place_id, user_id, source_id)
    values (v_a_saved, v_b_uid, v_source);
    raise exception 'FAIL P4c-ii: B attached provenance to A''s saved place';
  exception when insufficient_privilege or foreign_key_violation then
    raise notice 'PASS P4c-ii B cannot attach provenance to a saved place they do not own';
  end;

  begin
    -- save_place is atomic: the sps insert failing takes the saved_places insert with it.
    perform public.save_place(v_place, v_source, 'laundered');
    raise exception 'FAIL P4c-iii: B borrowed A''s source as provenance for their own save';
  exception when insufficient_privilege then
    raise notice 'PASS P4c-iii B cannot claim a source they never imported (no borrowed provenance)';
  end;
  if (select count(*) from public.saved_places) <> 0 then
    raise exception 'FAIL P4c-iii: the failed save left a row behind in B''s library';
  end if;
end $$;

-- ── P9: the policies that had no behavioural assertion at all ───────────────────────────────
-- profiles_insert_own, profiles_update_own, imports_update_own, saved_places_insert_own,
-- saved_places_delete_own, sps_select_own and sps_delete_own were in inventory.sql's name list and
-- in no test. A policy nobody exercises is a comment.
-- Each is asserted in the direction that would be a defect: B acting on A's rows. Where a positive
-- path is needed to show the policy is not simply deny-all, it is taken on B's OWN row and undone.
do $$
declare
  v_a_uid uuid := current_setting('qa.a_uid')::uuid;
  v_b_uid uuid := current_setting('qa.b_uid')::uuid;
  v_place uuid := current_setting('qa.place_id')::uuid;
  v_new   uuid;
  n integer;
begin
  -- P9a profiles_insert_own: the with_check is the whole policy; a missing one lets B create a
  -- profile row for any uuid, which is the FK target every per-user table points at.
  begin
    insert into public.profiles (id, display_name) values (v_a_uid, 'forged');
    raise exception 'FAIL P9a: B inserted a profile row for A';
  exception when insufficient_privilege then
    raise notice 'PASS P9a profiles_insert_own rejects a profile row for another user';
  end;
  begin
    -- own id: the policy must PERMIT this and the primary key must be what stops it. That
    -- distinguishes "the policy allows my own row" from "the policy allows nothing".
    insert into public.profiles (id, display_name) values (v_b_uid, 'mine');
    raise exception 'FAIL P9a: inserting a duplicate profile succeeded (no primary key?)';
  exception
    when unique_violation then
      raise notice 'PASS P9a profiles_insert_own permits B''s own id (blocked by the PK, not the policy)';
    when insufficient_privilege then
      raise exception 'FAIL P9a: profiles_insert_own rejected B''s OWN profile row';
  end;

  -- P9b profiles_update_own
  update public.profiles set display_name = 'renamed by B' where id = v_a_uid;
  if found then raise exception 'FAIL P9b: B renamed A''s profile'; end if;
  update public.profiles set display_name = 'renamed by B' where id = v_b_uid;
  if not found then raise exception 'FAIL P9b: B could not rename their own profile'; end if;
  raise notice 'PASS P9b profiles_update_own: B renames only their own profile';

  -- P9c imports_update_own, negative half (the positive half is P0c). Two parts: the column grant
  -- (R7 — error_code and every observability column are server-written, so even the owner cannot
  -- write them) and then the policy, with a column the grant does allow.
  begin
    update public.imports set error_code = 'forged';
    raise exception 'FAIL P9c: authenticated could write imports.error_code (R7)';
  exception when insufficient_privilege then
    raise notice 'PASS P9c-i imports.error_code is not in the UPDATE grant (R7)';
  end;
  update public.imports set status = 'failed';
  if found then raise exception 'FAIL P9c: B updated A''s import'; end if;
  raise notice 'PASS P9c-ii imports_update_own: B''s update of A''s import affects zero rows';

  -- P9d saved_places_insert_own: user_id is not in the UPDATE grant (P5c) but IS in the INSERT
  -- column list, so the with_check is the only thing standing between B and a row in A''s library.
  begin
    insert into public.saved_places (user_id, place_id, origin)
    values (v_a_uid, v_place, 'manual');
    raise exception 'FAIL P9d: B inserted a saved_places row owned by A';
  exception when insufficient_privilege then
    raise notice 'PASS P9d saved_places_insert_own rejects a row carrying A''s user_id';
  end;
  -- positive, on B's own row, then undone — which also asserts saved_places_delete_own
  insert into public.saved_places (user_id, place_id, origin)
  values (v_b_uid, v_place, 'manual') returning id into v_new;
  if v_new is null then raise exception 'FAIL P9d: B could not insert their own saved place'; end if;
  delete from public.saved_places where id = v_new;
  if not found then raise exception 'FAIL P9d: saved_places_delete_own did not let B delete their own row'; end if;
  if (select count(*) from public.saved_places) <> 0 then
    raise exception 'FAIL P9d: B''s library is not back to empty';
  end if;
  raise notice 'PASS P9d saved_places_insert_own/delete_own: own row yes, A''s row no';

  -- P9e sps_select_own and sps_delete_own. A has exactly one provenance row; B must neither see
  -- nor delete it. The DELETE is the dangerous one: it would break A''s provenance invariant.
  select count(*) into n from public.saved_place_sources;
  if n <> 0 then raise exception 'FAIL P9e: B sees % of A''s provenance rows', n; end if;
  delete from public.saved_place_sources;
  if found then raise exception 'FAIL P9e: B deleted a provenance row of A''s'; end if;
  raise notice 'PASS P9e sps_select_own/sps_delete_own: A''s provenance is neither visible nor deletable';
end $$;

-- P5: the columns and tables that must not be reachable at all, as B.
do $$
begin
  begin
    perform content_text from public.sources;
    raise exception 'FAIL P5: content_text is selectable by authenticated (R8)';
  exception when insufficient_privilege then
    raise notice 'PASS P5a content_text is not granted to authenticated';
  end;

  begin
    insert into public.imports (user_id, source_id)
    values ('22222222-2222-2222-2222-222222222222',
            (select gen_random_uuid()));
    raise exception 'FAIL P5: authenticated could INSERT an imports row (B7)';
  exception when insufficient_privilege then
    raise notice 'PASS P5b authenticated holds no INSERT on imports';
  end;

  begin
    update public.saved_places set user_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FAIL P5: authenticated could UPDATE saved_places.user_id';
  exception when insufficient_privilege then
    raise notice 'PASS P5c saved_places.user_id is not in the UPDATE grant';
  end;

  -- P5c-ii / P5c-iii: the other two columns L1-F7-T3 names. `user_id` alone was asserted, which
  -- covers "whose row is this" and nothing else. `place_id` decides WHICH place a save points at
  -- and `origin` decides whether the row claims to have come from an import — a user who can
  -- rewrite either can silently repoint a save at a different venue, or launder a manual add into
  -- something that looks like it came from a TikTok. Both are absent from the UPDATE grant by
  -- design (0006/0015); this is the behavioural proof that they still are, next to the structural
  -- one in inventory.sql check 5.
  begin
    update public.saved_places set place_id = current_setting('qa.place_id')::uuid;
    raise exception 'FAIL P5: authenticated could UPDATE saved_places.place_id';
  exception when insufficient_privilege then
    raise notice 'PASS P5c-ii saved_places.place_id is not in the UPDATE grant';
  end;

  begin
    update public.saved_places set origin = 'import';
    raise exception 'FAIL P5: authenticated could UPDATE saved_places.origin';
  exception when insufficient_privilege then
    raise notice 'PASS P5c-iii saved_places.origin is not in the UPDATE grant';
  end;

  -- P5c-iv: the note IS writable, and that must be asserted too. A test suite that only proves
  -- what is forbidden passes just as happily against a table nobody can write at all — which is
  -- exactly what would ship if `note` were dropped from the UPDATE grant by accident. `L1-F7-T2`'s
  -- whole feature is this one column. Zero rows affected (B's library is empty here); what is
  -- being proven is that the statement is permitted, not that it matched.
  begin
    update public.saved_places set note = 'a note B is allowed to write on their own row';
    raise notice 'PASS P5c-iv saved_places.note IS in the UPDATE grant — the one user-writable column';
  exception when insufficient_privilege then
    raise exception 'FAIL P5c-iv: note is not writable, so nobody can edit their own note';
  end;

  begin
    insert into public.places (name, lat, lng) values ('Forged', 0, 0);
    raise exception 'FAIL P5: authenticated could INSERT a place';
  exception when insufficient_privilege then
    raise notice 'PASS P5d authenticated cannot write global tables';
  end;

  begin
    perform public.resolve_place('overture', 'forged', 'Forged', 0, 0);
    raise exception 'FAIL P5: authenticated could EXECUTE resolve_place';
  exception when insufficient_privilege then
    raise notice 'PASS P5e resolve_place is service_role only';
  end;

  begin
    perform public.start_import('22222222-2222-2222-2222-222222222222',
                                'tiktok', '7300000000000000002', 'https://x.test/1');
    raise exception 'FAIL P5: authenticated could EXECUTE start_import';
  exception when insufficient_privilege then
    raise notice 'PASS P5f start_import is service_role only';
  end;

  begin
    perform public.merge_places(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL P5: authenticated could EXECUTE merge_places';
  exception when insufficient_privilege then
    raise notice 'PASS P5g merge_places is service_role only';
  end;
end $$;

-- ── anon sees nothing at all ────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare t text;
begin
  foreach t in array array['profiles','sources','imports','extractions','places',
                           'place_provider_refs','saved_places','saved_place_sources',
                           'place_lookups']
  loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL P6: anon holds a grant on %', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'PASS P6  anon holds no grant on any table';
end $$;

-- ── invariants that are not authorisation but must not regress ──────────────────────────────
reset role;

do $$
declare v_second uuid; v_places integer; v_aliases integer;
begin
  -- P7: the near-duplicate guard — a second provider's id for the same physical place must attach
  -- to the existing place, not create a new one (08 §1.2, 75 m / same name key).
  v_second := public.resolve_place('osm', 'node/123', 'Abu  Hassan!', 32.0531, 34.7516,
                                   null, null, null, null, null, 'IL');
  select count(*) into v_places  from public.places where merged_into_place_id is null;
  select count(*) into v_aliases from public.place_provider_refs;
  if v_places <> 1 then raise exception 'FAIL P7: near-duplicate guard created % places', v_places; end if;
  if v_aliases <> 2 then raise exception 'FAIL P7: expected 2 aliases, found %', v_aliases; end if;
  raise notice 'PASS P7  two provider ids for one physical place resolve to one place, two aliases';
end $$;

-- P7b: fire every deferred constraint trigger queued so far — the alias invariant from each
-- resolve_place() and the provenance invariant from A's save. This checkpoint is not optional
-- decoration: without it the rollback at the end of this script means the DEFERRABLE INITIALLY
-- DEFERRED triggers never execute at all, and a trigger that raises on the happy path would ship
-- looking tested. It found exactly that bug once (see docs/ms4-database.md §2).
-- After this point constraints are IMMEDIATE for the rest of the transaction, which is what makes
-- P8's violation observable at the statement rather than at a COMMIT that never comes.
do $$
begin
  set constraints all immediate;
  raise notice 'PASS P7b deferred invariants execute cleanly on the happy path';
end $$;

do $$
begin
  -- P8: provenance is permanent — the last source of an origin='import' save cannot be removed.
  begin
    delete from public.saved_place_sources;
    raise exception 'sentinel-ok';
  exception
    when check_violation then
      raise notice 'PASS P8  the last source of an imported save cannot be detached';
    when others then
      if sqlerrm = 'sentinel-ok' then
        raise exception 'FAIL P8: the last provenance link was removable';
      else raise; end if;
  end;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 0011: merge chains, the alias invariant's real scope, the staleness gate, and serialisation.
--
-- Everything from here down covers migration 0011. Not one of these paths had a test before it:
-- `merge_places` was uncovered entirely, which is why MS4 shipped a resolver that could hand
-- `save_place` a tombstone. These run as the privileged role (RLS bypassed) because every function
-- involved is service_role-only; they are invariant tests, not authorisation tests.
--
-- State on entry: one live place, two aliases, A's saved place, one provenance row. The places
-- created below are deliberately far apart (whole degrees) and differently named, so the 75 m
-- near-duplicate guard never merges two of them behind the test's back.
--
-- CONSTRAINT TIMING. P7b left constraints IMMEDIATE for the rest of the transaction. Each block
-- below states which mode it needs. `set constraints all deferred` then `... all immediate` is the
-- only way to prove a DEFERRABLE INITIALLY DEFERRED trigger inside a transaction that must never
-- commit: the operation succeeding under `deferred` proves the check is genuinely deferred, and the
-- exception arriving at `immediate` proves it fires and would have aborted the COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── P10: place_survivor_id, the base cases ──────────────────────────────────────────────────
do $$
declare v_live uuid; v_r uuid;
begin
  select id into v_live from public.places where merged_into_place_id is null limit 1;

  v_r := public.place_survivor_id(v_live);
  if v_r is distinct from v_live then
    raise exception 'FAIL P10: survivor of a LIVE place should be itself, got %', v_r;
  end if;

  -- Unknown id must be null, not an error and not the input: resolve_place's callers test the
  -- result with `is not null` and would treat any non-null value as a hit.
  v_r := public.place_survivor_id(gen_random_uuid());
  if v_r is not null then
    raise exception 'FAIL P10: survivor of an unknown id should be null, got %', v_r;
  end if;

  v_r := public.place_survivor_id(null);
  if v_r is not null then
    raise exception 'FAIL P10: survivor of null should be null, got %', v_r;
  end if;
  raise notice 'PASS P10 place_survivor_id: live row returns itself, unknown and null return null';
end $$;

-- ── P11: a 3-deep merge chain resolves to the terminal row ───────────────────────────────────
-- THE defect. merge(A,B) then merge(B,C) then merge(C,D) — the shape an operator produces repairing
-- provider churn, and the shape that already exists on staging/production if it ever happened
-- there, because 0011 fixes resolution over old chains but does not retro-fit them. The old one-hop
-- expression `coalesce(merged_into_place_id, id)` returned B: a row that has itself been merged
-- away. save_place would then attach a live library row to a tombstone.
-- The chain is built by hand, exactly as the pre-0011 merge_places built it (one hop per call, no
-- re-pointing), because the new merge_places refuses to create it — see P13/P14.
do $$
declare pa uuid; pb uuid; pc uuid; pd uuid; v_one_hop uuid; v_r uuid;
begin
  -- resolve_place inserts a place and THEN its alias, so places_alias_required must be deferred for
  -- the call to be legal at all. P7b left constraints immediate; every block below that creates a
  -- place says so explicitly rather than inheriting a mode from the block above it.
  set constraints all deferred;
  pa := public.resolve_place('overture','chain-a','Chain Alpha', 10.0, 10.0,
                             null,null,null,null,null,'IL');
  pb := public.resolve_place('overture','chain-b','Chain Bravo', 11.0, 11.0,
                             null,null,null,null,null,'IL');
  pc := public.resolve_place('overture','chain-c','Chain Charlie', 12.0, 12.0,
                             null,null,null,null,null,'IL');
  pd := public.resolve_place('overture','chain-d','Chain Delta', 13.0, 13.0,
                             null,null,null,null,null,'IL');

  update public.places set merged_into_place_id = pb where id = pa;
  update public.places set merged_into_place_id = pc where id = pb;
  update public.places set merged_into_place_id = pd where id = pc;

  -- the regression witness: what the code used to compute, kept so the test says why it exists
  select coalesce(pl.merged_into_place_id, pl.id) into v_one_hop
    from public.places pl where pl.id = pa;
  if v_one_hop <> pb then
    raise exception 'FAIL P11: test fixture is wrong, one hop from A should be B';
  end if;
  if (select merged_into_place_id from public.places where id = v_one_hop) is null then
    raise exception 'FAIL P11: test fixture is wrong, B should itself be a tombstone';
  end if;

  if public.place_survivor_id(pa) <> pd then
    raise exception 'FAIL P11: survivor of a 3-deep chain is %, expected the terminal row %',
      public.place_survivor_id(pa), pd;
  end if;
  if public.place_survivor_id(pb) <> pd or public.place_survivor_id(pc) <> pd then
    raise exception 'FAIL P11: survivor from the middle of the chain is not the terminal row';
  end if;

  -- and the whole point of the fix: resolving A's alias returns the row that is still ALIVE
  v_r := public.resolve_place('overture','chain-a','Chain Alpha', 10.0, 10.0,
                              null,null,null,null,null,'IL');
  if v_r <> pd then
    raise exception 'FAIL P11: resolve_place returned % for an alias on a 3-deep chain, expected %',
      v_r, pd;
  end if;
  if (select merged_into_place_id from public.places where id = v_r) is not null then
    raise exception 'FAIL P11: resolve_place returned a tombstone — save_place would attach to a dead row';
  end if;
  set constraints all immediate;   -- the chain fixture itself must satisfy every invariant
  raise notice 'PASS P11 a 3-deep chain resolves to its terminal live row, through place_survivor_id and through resolve_place';
end $$;

-- ── P12: a hand-crafted cycle terminates ────────────────────────────────────────────────────
-- places_no_self_merge blocks a 1-cycle and merge_places blocks creating a longer one, but
-- place_survivor_id is a READ path over data that may predate both, and a recursive CTE over a
-- cyclic graph does not terminate on its own. Two belts are claimed: the `seen` array and depth<32.
-- The statement_timeout is the actual assertion — an unbounded walk must fail the suite rather than
-- hang CI. The documented behaviour on a cycle is "returns the deepest row reached, wrong but
-- bounded and loud": that row is a tombstone, so no caller can mistake it for a live place.
--
-- statement_timeout is set HERE, outside the do block, and not with set_config inside it. Postgres
-- arms the timer when the top-level statement begins, so a timeout raised from inside the running
-- DO never arms and the bound is silently inert. (Measured: a 6-second pg_sleep inside a DO that
-- sets statement_timeout='2s' itself runs the full 6 seconds.)
set local statement_timeout = '10s';

do $$
declare px uuid; py uuid; v_r uuid;
begin
  set constraints all deferred;
  px := public.resolve_place('overture','cycle-x','Cycle Xray', 20.0, 20.0,
                             null,null,null,null,null,'IL');
  py := public.resolve_place('overture','cycle-y','Cycle Yankee', 21.0, 21.0,
                             null,null,null,null,null,'IL');
  set constraints all immediate;
  update public.places set merged_into_place_id = py where id = px;
  update public.places set merged_into_place_id = px where id = py;

  v_r := public.place_survivor_id(px);
  if v_r is null or v_r not in (px, py) then
    raise exception 'FAIL P12: cycle walk returned %, expected one of the two rows on the cycle', v_r;
  end if;
  if (select merged_into_place_id from public.places where id = v_r) is null then
    raise exception 'FAIL P12: cycle walk returned a row that looks LIVE (%) — a caller would save against it', v_r;
  end if;
  -- and from the other end, so the result does not depend on where the walk starts
  if public.place_survivor_id(py) is null then
    raise exception 'FAIL P12: cycle walk from the other end returned null';
  end if;
  raise notice 'PASS P12 place_survivor_id terminates on a 2-cycle and returns a bounded, visibly-dead row';
end $$;

reset statement_timeout;

-- ── P13/P14/P15: merge_places rejects every input it cannot merge safely ─────────────────────
-- All four rejections are ruled behaviour, not defensiveness: an operator naming a tombstone is
-- working from a stale picture, and following it silently would move data into a row nobody named.
do $$
declare v_live uuid; v_tomb uuid; v_terminal uuid; v_err text;
begin
  set constraints all deferred;
  v_live := public.resolve_place('overture','guard-live','Guard Live', 30.0, 30.0,
                                 null,null,null,null,null,'IL');
  -- an existing tombstone from P11's chain, and its terminal survivor
  select id into v_tomb from public.places
   where merged_into_place_id is not null and name = 'Chain Alpha';
  v_terminal := public.place_survivor_id(v_tomb);

  -- P13: winner already merged
  begin
    perform public.merge_places(v_live, v_tomb);
    raise exception 'FAIL P13: merge_places accepted a tombstone as the winner';
  exception when check_violation then
    v_err := sqlerrm;
    if position('merge into survivor' in v_err) = 0 then
      raise exception 'FAIL P13: rejected, but the error does not name the survivor to retry with: %', v_err;
    end if;
    if position(v_terminal::text in v_err) = 0 then
      raise exception 'FAIL P13: the error names the wrong survivor (expected %): %', v_terminal, v_err;
    end if;
    raise notice 'PASS P13 merge_places rejects an already-merged winner and names the survivor to retry with';
  end;

  -- P14: loser already merged
  begin
    perform public.merge_places(v_tomb, v_live);
    raise exception 'FAIL P14: merge_places accepted an already-merged loser';
  exception when check_violation then
    if position('already merged into' in sqlerrm) = 0 then
      raise exception 'FAIL P14: rejected for the wrong reason: %', sqlerrm;
    end if;
    raise notice 'PASS P14 merge_places rejects an already-merged loser rather than re-parenting a decided tombstone';
  end;

  -- P15: the existence and argument guards. Without them an unknown loser makes every statement in
  -- merge_places a no-op and the repair reports success having done nothing.
  begin
    perform public.merge_places(gen_random_uuid(), v_live);
    raise exception 'FAIL P15: merge_places accepted a loser that does not exist';
  exception when foreign_key_violation then
    raise notice 'PASS P15a merge_places rejects a non-existent loser';
  end;
  begin
    perform public.merge_places(v_live, gen_random_uuid());
    raise exception 'FAIL P15: merge_places accepted a winner that does not exist';
  exception when foreign_key_violation then
    raise notice 'PASS P15b merge_places rejects a non-existent winner';
  end;
  begin
    perform public.merge_places(null, v_live);
    raise exception 'FAIL P15: merge_places accepted a null loser';
  exception when null_value_not_allowed then
    raise notice 'PASS P15c merge_places rejects a null argument';
  end;
  begin
    perform public.merge_places(v_live, v_live);
    raise exception 'FAIL P15: merge_places merged a place into itself';
  exception when raise_exception then
    raise notice 'PASS P15d merge_places rejects a self-merge';
  end;
end $$;

-- ── P16: a real merge — tombstone re-pointing, alias movement, library de-duplication ────────
-- The happy path, which had no test at all. Five claims:
--   * every alias of the loser moves to the winner, and none of them arrives primary;
--   * a tombstone that pointed AT the loser is re-pointed at the winner, so no chain grows;
--   * a user who had saved both places keeps exactly one library entry;
--   * both tombstones resolve to the winner afterwards;
--   * ppr_alias_retained_on_move accepts the merge, because the loser is a tombstone by the time
--     the deferred check runs — the ruling that tombstones are exempt (08 §1.4/§1.6).
--
-- Two blocks, and the split is not cosmetic. `places_alias_required` (0005) is queued by the INSERT
-- of each place and, unlike 0011's alias triggers, it has NO tombstone exemption. If the fixture
-- places were created and merged inside one deferred window, that queued INSERT check would fire at
-- the checkpoint against a loser that legitimately has no aliases left, and fail. So block 1 builds
-- the fixture and discharges its checks; block 2 merges. In production the two are always separate
-- transactions (merge_places is an operator repair path), so this ordering is also the realistic one.
--
-- Block 2 runs with constraints DEFERRED, which is how production runs: merge_places empties the
-- loser's aliases before marking it a tombstone, so an IMMEDIATE ppr_alias_retained_on_move would
-- reject the merge at that statement. That is exactly why inventory.sql check 7b asserts these
-- triggers are DEFERRABLE INITIALLY DEFERRED and not plain triggers.
do $$
declare
  v_loser uuid; v_winner uuid; v_old_tomb uuid; v_a uuid := current_setting('qa.a_uid')::uuid;
begin
  set constraints all deferred;
  v_loser  := public.resolve_place('overture','merge-loser','Merge Loser', 40.0, 40.0,
                                   null,null,null,null,null,'IL');
  -- a second alias on the loser, so alias movement is observable as more than one row
  perform public.resolve_place('osm','merge-loser-2','Merge Loser', 40.0001, 40.0001,
                               null,null,null,null,null,'IL');
  v_winner := public.resolve_place('overture','merge-winner','Merge Winner', 41.0, 41.0,
                                   null,null,null,null,null,'IL');
  v_old_tomb := public.resolve_place('overture','merge-oldtomb','Merge Old Tombstone', 42.0, 42.0,
                                     null,null,null,null,null,'IL');
  -- a pre-existing tombstone pointing at the loser: the chain the old merge_places left behind
  update public.places set merged_into_place_id = v_loser where id = v_old_tomb;

  -- A had saved both places (origin manual, so neither needs a provenance row)
  insert into public.saved_places (user_id, place_id, origin) values (v_a, v_loser, 'manual');
  insert into public.saved_places (user_id, place_id, origin) values (v_a, v_winner, 'manual');

  if (select count(*) from public.place_provider_refs where place_id = v_loser) <> 2 then
    raise exception 'FAIL P16: fixture is wrong — the loser should carry two aliases';
  end if;
  set constraints all immediate;         -- discharge the fixture's own invariants
  perform set_config('qa.merge_loser', v_loser::text, true);
  perform set_config('qa.merge_winner', v_winner::text, true);
  perform set_config('qa.merge_old_tomb', v_old_tomb::text, true);
  raise notice 'PASS P16a the merge fixture satisfies every invariant before the merge';
end $$;

do $$
declare
  v_loser    uuid := current_setting('qa.merge_loser')::uuid;
  v_winner   uuid := current_setting('qa.merge_winner')::uuid;
  v_old_tomb uuid := current_setting('qa.merge_old_tomb')::uuid;
  v_a        uuid := current_setting('qa.a_uid')::uuid;
  n integer;
begin
  set constraints all deferred;
  perform public.merge_places(v_loser, v_winner);

  if (select merged_into_place_id from public.places where id = v_loser) <> v_winner then
    raise exception 'FAIL P16: the loser is not a tombstone pointing at the winner';
  end if;
  if (select merged_into_place_id from public.places where id = v_old_tomb) <> v_winner then
    raise exception 'FAIL P16: the pre-existing tombstone was not re-pointed at the winner (chain > 1 hop)';
  end if;
  select count(*) into n from public.place_provider_refs where place_id = v_loser;
  if n <> 0 then raise exception 'FAIL P16: % aliases left on the loser', n; end if;
  select count(*) into n from public.place_provider_refs where place_id = v_winner;
  if n <> 3 then raise exception 'FAIL P16: winner has % aliases, expected 3', n; end if;
  select count(*) into n from public.place_provider_refs
   where place_id = v_winner and is_primary;
  if n <> 1 then raise exception 'FAIL P16: winner has % primary aliases, expected exactly 1', n; end if;
  select count(*) into n from public.saved_places where user_id = v_a and place_id = v_winner;
  if n <> 1 then raise exception 'FAIL P16: A has % library entries for the winner, expected 1', n; end if;
  select count(*) into n from public.saved_places where place_id = v_loser;
  if n <> 0 then raise exception 'FAIL P16: % library entries still point at the loser', n; end if;
  if public.place_survivor_id(v_old_tomb) <> v_winner
     or public.place_survivor_id(v_loser) <> v_winner then
    raise exception 'FAIL P16: resolution does not reach the winner from both tombstones';
  end if;

  -- the checkpoint: every deferred invariant queued by the merge — ppr_alias_retained_on_move once
  -- per moved alias, and the provenance trigger — executes here and must accept the merge
  set constraints all immediate;
  raise notice 'PASS P16 merge_places moves aliases and saves, re-points tombstones, and passes ppr_alias_retained_on_move at the checkpoint';

  -- leave the library as it was, so later counts stay readable
  delete from public.saved_places where user_id = v_a and place_id = v_winner;
end $$;

-- ── P17: ppr_alias_retained_on_delete fires, at the deferred checkpoint ──────────────────────
-- The hole 0005 left: places_alias_required is AFTER INSERT ON places, so deleting the last alias
-- of a LIVE place left it with no provider identity — unresolvable, unrefreshable, and in breach of
-- an invariant `08` §1.6 calls total.
--
-- TWO BLOCKS, and this one is a trap worth naming: if the place is created inside the SAME deferred
-- window as the alias delete, the queued places_alias_required check from the INSERT fails at the
-- checkpoint with the identical errcode and an almost identical message, so the test passes with the
-- new trigger DROPPED. (Verified by dropping it.) Block 1 therefore discharges the fixture's own
-- checks, and block 2 opens a fresh deferred window in which the only trigger that can fire is
-- ppr_alias_retained_on_delete.
do $$
declare v_p uuid;
begin
  set constraints all deferred;
  v_p := public.resolve_place('overture','orphan-1','Orphan Candidate', 50.0, 50.0,
                              null,null,null,null,null,'IL');
  set constraints all immediate;                 -- discharge the INSERT-side check
  perform set_config('qa.orphan_place', v_p::text, true);
end $$;

do $$
declare v_p uuid := current_setting('qa.orphan_place')::uuid;
begin
  set constraints all deferred;
  begin
    delete from public.place_provider_refs where place_id = v_p;
    -- must NOT have raised yet: the check is deferred, so a legitimate delete-then-insert
    -- replacement of an alias is judged on the state at COMMIT, not mid-transaction
    set constraints all immediate;               -- stands in for COMMIT
    raise exception 'FAIL P17: a live place was left with no provider ref';
  exception when check_violation then
    if position('no provider ref' in sqlerrm) = 0 then
      raise exception 'FAIL P17: something else raised: %', sqlerrm;
    end if;
    raise notice 'PASS P17 ppr_alias_retained_on_delete is deferred and fires at the COMMIT checkpoint';
  end;
end $$;

-- ── P17b: the legitimate delete-then-insert replacement still passes ─────────────────────────
-- The reason the trigger is deferred rather than immediate. If this fails, every alias replacement
-- in the system fails, and it would look like a bug in the caller.
do $$
declare v_p uuid; n integer;
begin
  set constraints all deferred;
  v_p := public.resolve_place('overture','swap-1','Alias Swap', 51.0, 51.0,
                              null,null,null,null,null,'IL');
  set constraints all immediate;
  set constraints all deferred;
  delete from public.place_provider_refs where place_id = v_p;
  insert into public.place_provider_refs (place_id, provider, provider_place_id, is_primary)
  values (v_p, 'osm', 'swap-1-replacement', true);
  set constraints all immediate;
  select count(*) into n from public.place_provider_refs where place_id = v_p;
  if n <> 1 then raise exception 'FAIL P17b: expected exactly one alias after the swap, found %', n; end if;
  raise notice 'PASS P17b an alias may be replaced within one transaction (deferral is load-bearing)';
end $$;

-- ── P18: ppr_alias_retained_on_move fires ───────────────────────────────────────────────────
-- The same hole reached by moving instead of deleting. `update place_provider_refs set place_id` is
-- how merge_places empties a loser; nothing stopped an operator emptying a LIVE place the same way.
-- is_primary is cleared in the same statement because ppr_one_primary_idx would otherwise raise
-- first and the test would prove nothing about the trigger.
-- Split into two blocks for the reason given in P17: otherwise the queued INSERT-side check masks
-- the trigger under test and the assertion passes with the trigger dropped.
do $$
declare v_from uuid; v_to uuid;
begin
  set constraints all deferred;
  v_from := public.resolve_place('overture','move-from','Move Source', 52.0, 52.0,
                                 null,null,null,null,null,'IL');
  v_to   := public.resolve_place('overture','move-to','Move Target', 53.0, 53.0,
                                 null,null,null,null,null,'IL');
  set constraints all immediate;                 -- discharge the INSERT-side checks
  perform set_config('qa.move_from', v_from::text, true);
  perform set_config('qa.move_to', v_to::text, true);
end $$;

do $$
declare
  v_from uuid := current_setting('qa.move_from')::uuid;
  v_to   uuid := current_setting('qa.move_to')::uuid;
begin
  set constraints all deferred;
  begin
    update public.place_provider_refs set place_id = v_to, is_primary = false
     where place_id = v_from;
    set constraints all immediate;               -- stands in for COMMIT
    raise exception 'FAIL P18: a live place had its last alias moved away';
  exception when check_violation then
    if position('no provider ref' in sqlerrm) = 0 then
      raise exception 'FAIL P18: something else raised: %', sqlerrm;
    end if;
    raise notice 'PASS P18 ppr_alias_retained_on_move is deferred and fires at the COMMIT checkpoint';
  end;
end $$;

-- ── P19: the tombstone exemption, the state merge_places actually leaves behind ──────────────
-- Ruled by the project owner: the invariant is about LIVE rows. `08` §1.4 moves ALL of a loser's
-- aliases to the winner, so a tombstone with zero aliases is the intended end state. If this failed,
-- merge_places itself would abort at COMMIT — which is why it is asserted and not assumed.
--
-- Split into two blocks for the same reason as P16: `places_alias_required` (0005) is queued by the
-- place's INSERT and has no tombstone exemption, so the fixture's own checks are discharged before
-- the row becomes a tombstone. That asymmetry between the two triggers is reported as a defect
-- against 0011; this test asserts the exemption that WAS specified, not the one that was missed.
do $$
declare v_tomb uuid; v_winner uuid;
begin
  set constraints all deferred;
  v_winner := public.resolve_place('overture','exempt-win','Exempt Winner', 54.0, 54.0,
                                   null,null,null,null,null,'IL');
  v_tomb   := public.resolve_place('overture','exempt-tomb','Exempt Tombstone', 55.0, 55.0,
                                   null,null,null,null,null,'IL');
  set constraints all immediate;                   -- discharge the fixture's INSERT-side checks
  perform set_config('qa.exempt_tomb', v_tomb::text, true);
  perform set_config('qa.exempt_winner', v_winner::text, true);
end $$;

do $$
declare
  v_tomb   uuid := current_setting('qa.exempt_tomb')::uuid;
  v_winner uuid := current_setting('qa.exempt_winner')::uuid;
  n integer;
begin
  set constraints all deferred;
  update public.places set merged_into_place_id = v_winner where id = v_tomb;
  delete from public.place_provider_refs where place_id = v_tomb;
  set constraints all immediate;                   -- must NOT raise: the row is a tombstone
  select count(*) into n from public.place_provider_refs where place_id = v_tomb;
  if n <> 0 then raise exception 'FAIL P19: the tombstone still has aliases'; end if;
  raise notice 'PASS P19 a tombstone may hold zero aliases (the exemption 08 §1.4 requires)';
end $$;

-- ── P19b: a place that no longer exists is not asserted about ───────────────────────────────
-- resolve_place step 3 deletes its own aliasless orphan, and ON DELETE CASCADE from places fires
-- this trigger once per alias of a place that is going away. Both would raise if the trigger did
-- not check that the place still exists first.
do $$
declare v_p uuid; n integer;
begin
  set constraints all deferred;
  v_p := public.resolve_place('overture','cascade-1','Cascade Victim', 56.0, 56.0,
                              null,null,null,null,null,'IL');
  set constraints all deferred;
  delete from public.places where id = v_p;         -- cascades to its alias, firing the trigger
  set constraints all immediate;
  select count(*) into n from public.places where id = v_p;
  if n <> 0 then raise exception 'FAIL P19b: the place was not deleted'; end if;
  raise notice 'PASS P19b deleting a place cascades to its aliases without tripping the invariant';
end $$;

-- ── P19c: the INSERT-side invariant is still LOUD for a live aliasless place (0005 + 0013) ───
-- The half of the invariant that must NOT be relaxed by 0013's tombstone branch. A place inserted
-- directly, with no alias and no merge, is a live row with no provider identity: unresolvable,
-- unrefreshable, and exactly what `places_alias_required` exists to reject. Asserted deliberately
-- before P19d, because the way to make P19d pass by accident is to weaken this.
-- The message match distinguishes the two triggers: 0005/0013 raise 'place % has no provider ref',
-- 0011 raises 'live place % would be left with no provider ref'.
do $$
declare v_p uuid;
begin
  set constraints all deferred;
  begin
    insert into public.places (name, lat, lng, country_code)
    values ('Aliasless Live Place', 57.0, 57.0, 'IL') returning id into v_p;
    set constraints all immediate;              -- stands in for COMMIT
    raise exception 'FAIL P19c: a live place with no provider ref was accepted at the checkpoint';
  exception when check_violation then
    if position('has no provider ref' in sqlerrm) = 0 then
      raise exception 'FAIL P19c: something else raised: %', sqlerrm;
    end if;
    raise notice 'PASS P19c places_alias_required still rejects a LIVE place with no provider ref';
  end;
  set constraints all immediate;               -- the caught failure rolled the mode back with it
end $$;

-- ── P19d: create a place and merge it away in ONE transaction (0013) ────────────────────────
-- The defect 0013 fixes. `places_alias_required` is DEFERRABLE INITIALLY DEFERRED, so the check
-- queued by the loser's INSERT is evaluated at COMMIT — by which time merge_places has moved every
-- one of its aliases to the winner and tombstoned it. Before 0013 the trigger had no tombstone
-- branch and this whole transaction aborted at COMMIT with 'place % has no provider ref', losing the
-- repair; `08` §1.4/§1.6 and 0011's own header say a tombstone with zero aliases is the intended end
-- state. Note what is NOT split here: unlike P16 and P19, everything happens inside ONE deferred
-- window on purpose — the single window IS the test.
--
-- Reverting 0013 (restoring 0005's body) makes this block fail at `set constraints all immediate`
-- with errcode 23514; verified in both directions.
do $$
declare v_loser uuid; v_winner uuid; n_alias integer; n_live integer; v_survivor uuid;
begin
  set constraints all deferred;
  v_winner := public.resolve_place('overture','one-txn-win','One Txn Winner', 58.0, 58.0,
                                   null,null,null,null,null,'IL');
  v_loser  := public.resolve_place('overture','one-txn-lose','One Txn Loser', 59.0, 59.0,
                                   null,null,null,null,null,'IL');
  perform public.merge_places(v_loser, v_winner);
  set constraints all immediate;               -- stands in for COMMIT; must NOT raise

  select count(*) into n_alias from public.place_provider_refs where place_id = v_loser;
  if n_alias <> 0 then
    raise exception 'FAIL P19d: the loser kept % alias(es); the merge did not move them', n_alias;
  end if;
  select count(*) into n_alias from public.place_provider_refs where place_id = v_winner;
  if n_alias <> 2 then
    raise exception 'FAIL P19d: the winner holds % alias(es), expected 2', n_alias;
  end if;
  select count(*) into n_live from public.places
   where id = v_loser and merged_into_place_id = v_winner;
  if n_live <> 1 then raise exception 'FAIL P19d: the loser is not a tombstone pointing at the winner'; end if;
  v_survivor := public.place_survivor_id(v_loser);
  if v_survivor <> v_winner then
    raise exception 'FAIL P19d: the loser resolves to % rather than the winner %', v_survivor, v_winner;
  end if;
  raise notice 'PASS P19d a place created and merged away in the SAME transaction survives the deferred checkpoint (0013)';
end $$;

-- ── P20: step 1's staleness gate and the enrichment branch ──────────────────────────────────
-- Before 0011 every repeat import rewrote name/lat/lng on the shared row unconditionally, which let
-- a 90-day-old cached Nominatim response overwrite a newer copy and bumped updated_at for no new
-- information. `08` §1.2 says refresh "if our copy is older".
--
-- ctid, not updated_at, is what proves "no write happened": now() is the TRANSACTION timestamp, so
-- neither updated_at nor provider_fetched_at can distinguish "not written" from "written again in
-- this transaction" (the trap P4b documents). Any UPDATE writes a new row version and moves ctid.
-- For the same reason provider_fetched_at is asserted by EQUALITY to the value captured before the
-- call, never by comparison with now().
do $$
declare
  v_p uuid;
  v_name text; v_lat double precision; v_cat text; v_locality text;
  v_fetched_before timestamptz; v_fetched_after timestamptz;
  v_ctid_before tid; v_ctid_after tid;
begin
  set constraints all deferred;
  v_p := public.resolve_place('overture','stale-1','Stale Cafe', 60.0, 60.0,
                              'restaurant', null, null, null, null, 'IL');
  set constraints all immediate;

  -- (a) FRESH copy, nothing missing: the shared row is not written at all
  select ctid, provider_fetched_at into v_ctid_before, v_fetched_before
    from public.places where id = v_p;
  perform public.resolve_place('overture','stale-1','RENAMED BY A STALE CACHE', 60.9, 60.9,
                               'restaurant', null, null, null, null, 'IL');
  select ctid, name, lat into v_ctid_after, v_name, v_lat from public.places where id = v_p;
  if v_name <> 'Stale Cafe' or v_lat <> 60.0 then
    raise exception 'FAIL P20a: a fresh copy was overwritten (name=%, lat=%)', v_name, v_lat;
  end if;
  if v_ctid_after <> v_ctid_before then
    raise exception 'FAIL P20a: the shared row was written even though nothing was stale or missing';
  end if;

  -- (b) FRESH copy with a column we do not have: enrichment fills it, overwrites nothing, and does
  --     NOT bump the staleness clock (bumping it without taking the new name/coordinates would push
  --     the real refresh out forever). country_code and locality feed the near-duplicate guard, so
  --     leaving them null for 30 days would degrade dedup — which is why this branch exists.
  perform public.resolve_place('overture','stale-1','RENAMED BY A STALE CACHE', 60.9, 60.9,
                               'cafe', null, null, 'Tel Aviv-Yafo', null, 'IL');
  select ctid, name, lat, category, locality, provider_fetched_at
    into v_ctid_after, v_name, v_lat, v_cat, v_locality, v_fetched_after
    from public.places where id = v_p;
  if v_locality is distinct from 'Tel Aviv-Yafo' then
    raise exception 'FAIL P20b: the missing locality was not enriched (got %)', v_locality;
  end if;
  if v_cat <> 'restaurant' then
    raise exception 'FAIL P20b: enrichment OVERWROTE an existing category with %', v_cat;
  end if;
  if v_name <> 'Stale Cafe' or v_lat <> 60.0 then
    raise exception 'FAIL P20b: enrichment moved name/coordinates (name=%, lat=%)', v_name, v_lat;
  end if;
  if v_fetched_after <> v_fetched_before then
    raise exception 'FAIL P20b: an enrichment-only write bumped provider_fetched_at (% -> %)',
      v_fetched_before, v_fetched_after;
  end if;
  if v_ctid_after = v_ctid_before then
    raise exception 'FAIL P20b: the enrichment did not write the row at all';
  end if;

  -- (c) STALE copy: the refresh happens, takes the new name and coordinates, and bumps the clock
  update public.places set provider_fetched_at = now() - interval '40 days' where id = v_p;
  select provider_fetched_at into v_fetched_before from public.places where id = v_p;
  perform public.resolve_place('overture','stale-1','Stale Cafe Renamed', 60.5, 60.5,
                               null, null, null, null, null, 'IL');
  select name, lat, provider_fetched_at into v_name, v_lat, v_fetched_after
    from public.places where id = v_p;
  if v_name <> 'Stale Cafe Renamed' or v_lat <> 60.5 then
    raise exception 'FAIL P20c: a stale copy was NOT refreshed (name=%, lat=%)', v_name, v_lat;
  end if;
  if v_fetched_after <= v_fetched_before then
    raise exception 'FAIL P20c: provider_fetched_at was not bumped by a real refresh';
  end if;

  -- (d) a never-fetched copy (provider_fetched_at null) counts as stale
  update public.places set provider_fetched_at = null, name = 'Never Fetched' where id = v_p;
  perform public.resolve_place('overture','stale-1','Fetched Now', 60.7, 60.7,
                               null, null, null, null, null, 'IL');
  select name, provider_fetched_at into v_name, v_fetched_after from public.places where id = v_p;
  if v_name <> 'Fetched Now' then
    raise exception 'FAIL P20d: a null provider_fetched_at was not treated as stale (name=%)', v_name;
  end if;
  if v_fetched_after is null then
    raise exception 'FAIL P20d: the refresh did not set provider_fetched_at';
  end if;
  set constraints all immediate;
  raise notice 'PASS P20 the staleness gate refreshes only an old copy, enriches without overwriting or bumping the clock, and treats null as stale';
end $$;

-- ── P21: extractions is readable via saved_place_sources, not only via imports ───────────────
-- 0004 gated extractions on `imports` alone while `08` §2.2 rule 1 and technical-design §4.3 both
-- say imports OR saved_place_sources — which is what `sources` actually got in 0006. A user who
-- saved a place from an import and then cancelled or aged out the import row could read the source
-- and not the extraction derived from it. B here has NO import at all: the only membership B holds
-- is a provenance row, so a pass proves the second branch and nothing else.
savepoint before_p21;
do $$
declare v_saved uuid; v_b uuid := current_setting('qa.b_uid')::uuid;
begin
  -- deferred: the provenance invariant is only satisfied once the sps row below exists
  set constraints all deferred;
  insert into public.saved_places (user_id, place_id, origin)
  values (v_b, current_setting('qa.place_id')::uuid, 'import') returning id into v_saved;
  insert into public.saved_place_sources (saved_place_id, user_id, source_id)
  values (v_saved, v_b, current_setting('qa.source_id')::uuid);
  if (select count(*) from public.imports where user_id = v_b) <> 0 then
    raise exception 'FAIL P21: fixture is wrong — B must hold no import for this to prove the second branch';
  end if;
  set constraints all immediate;      -- the fixture is a legal state, not a deferred violation
end $$;

select set_config('request.jwt.claims',
                  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n integer;
begin
  select count(*) into n from public.extractions;
  if n <> 1 then
    raise exception 'FAIL P21: B holds a provenance row for the source and sees % extractions (expected 1)', n;
  end if;
  select count(*) into n from (select id from public.sources) s;
  if n <> 1 then
    raise exception 'FAIL P21: B holds a provenance row for the source and sees % sources (expected 1)', n;
  end if;
  raise notice 'PASS P21 the saved_place_sources branch makes the extraction readable without an import row';
end $$;

reset role;
rollback to savepoint before_p21;

-- ── P22: step 2 really does take the advisory lock, on the key the guard decides on ──────────
-- The observable half of the concurrency fix in one session. pg_locks is consulted rather than the
-- source of the function: the lock must actually be held by THIS transaction after a call that
-- reached step 2, and its key must be hashtext(name_key || country_code) — the same pair the
-- near-duplicate guard compares on. If the lock key and the guard key ever drift apart, the lock
-- serialises the wrong callers and the guard is advisory again.
-- This also settles, at runtime, that `pg_advisory_xact_lock(hashtext(...))` resolves to the bigint
-- overload with no ambiguity against the (int, int) form: an ambiguous call would fail to parse and
-- resolve_place would not exist to be called.
do $$
declare
  v_key    bigint;
  v_before integer;
  v_after  integer;
begin
  set constraints all deferred;
  select count(*) into v_before from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid();

  perform public.resolve_place('overture','lock-1','Lock Probe Cafe', 70.0, 70.0,
                               null,null,null,null,null,'IL');

  v_key := hashtext(coalesce(public.place_name_key('Lock Probe Cafe'), '') || coalesce('IL', ''));
  select count(*) into v_after from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid()
     and objsubid = 1
     and ((classid::bigint << 32) | objid::bigint) = v_key;
  if v_after <> 1 then
    raise exception 'FAIL P22: step 2 did not hold an advisory lock on key % (found % matching, % advisory locks total before)',
      v_key, v_after, v_before;
  end if;

  -- and it is transaction-scoped, so nothing has to remember to release it
  if exists (select 1 from pg_locks
              where locktype = 'advisory' and pid = pg_backend_pid()
                and ((classid::bigint << 32) | objid::bigint) = v_key
                and not granted) then
    raise exception 'FAIL P22: the lock is recorded as not granted';
  end if;
  set constraints all immediate;
  raise notice 'PASS P22 resolve_place step 2 holds a transaction-scoped advisory lock keyed on (name_key, country_code)';
end $$;

-- ── P24: the three provenance parameters 0014 adds (06 §0, 0010's `places` columns) ──────────
-- Without this the only new behaviour in 0014 is untested: the migration would be proven to APPLY
-- and proven not to have lost 0011's fixes, and its actual purpose would rest on reading the body.
-- Four claims, one per branch that can touch a provenance column:
--   (a) step 3 (new place) persists all three;
--   (b) step 2 (existing place, new provider alias) writes NO column of `places` — so an ODbL-marked
--       row is not silently re-attributed to the provider that merely recognised it (06 §11 Q2);
--   (c) step 1's refresh branch coalesces: a null from a caller never clobbers a known dataset, and
--       resolution_score does move, because it describes the most recent resolution;
--   (d) step 1's enrichment branch fills a missing dataset without writing the row when there is
--       nothing to fill — the same ctid discipline P20 uses, for the same reason.
do $$
declare
  v_a uuid; v_b uuid;
  v_ds text; v_dsid text; v_score real; v_name text;
  v_ctid_before tid; v_ctid_after tid;
begin
  set constraints all deferred;
  -- (a) a genuinely new place, resolved with provenance
  v_a := public.resolve_place('overture','prov-1','Provenance Cafe', 61.0, 61.0,
                              'restaurant', null, null, null, null, 'IL', null,
                              'overture-places', 'prov-gers-1', 0.91);
  set constraints all immediate;
  select source_dataset, source_dataset_id, resolution_score
    into v_ds, v_dsid, v_score from public.places where id = v_a;
  if v_ds is distinct from 'overture-places' or v_dsid is distinct from 'prov-gers-1'
     or v_score is distinct from 0.91::real then
    raise exception 'FAIL P24a: step 3 did not persist provenance (%, %, %)', v_ds, v_dsid, v_score;
  end if;

  -- (b) second provider, same venue inside the 75 m guard: alias only, no column of `places` written
  select ctid into v_ctid_before from public.places where id = v_a;
  set constraints all deferred;
  v_b := public.resolve_place('osm','prov-2','Provenance Cafe', 61.0002, 61.0002,
                              null, null, null, null, null, 'IL', null,
                              'osm-nominatim', 'osm-node-2', 0.55);
  set constraints all immediate;
  if v_b <> v_a then
    raise exception 'FAIL P24b: the 75 m guard did not recognise the same venue (% vs %)', v_b, v_a;
  end if;
  select ctid, source_dataset, source_dataset_id, resolution_score
    into v_ctid_after, v_ds, v_dsid, v_score from public.places where id = v_a;
  if v_ctid_after <> v_ctid_before then
    raise exception 'FAIL P24b: the alias branch wrote the shared row (ctid moved)';
  end if;
  if v_ds <> 'overture-places' or v_dsid <> 'prov-gers-1' then
    raise exception 'FAIL P24b: an alias-only match re-attributed the row to % / %', v_ds, v_dsid;
  end if;

  -- (c) refresh branch: force staleness, then resolve with a null dataset and a new score
  update public.places set provider_fetched_at = now() - interval '400 days' where id = v_a;
  perform public.resolve_place('overture','prov-1','Provenance Cafe Refreshed', 61.0, 61.0,
                               null, null, null, null, null, 'IL', null,
                               null, null, 0.42);
  select name, source_dataset, source_dataset_id, resolution_score
    into v_name, v_ds, v_dsid, v_score from public.places where id = v_a;
  if v_name <> 'Provenance Cafe Refreshed' then
    raise exception 'FAIL P24c: the stale copy was not refreshed (name=%)', v_name;
  end if;
  if v_ds <> 'overture-places' or v_dsid <> 'prov-gers-1' then
    raise exception 'FAIL P24c: a null dataset argument clobbered a known one (% / %)', v_ds, v_dsid;
  end if;
  if v_score is distinct from 0.42::real then
    raise exception 'FAIL P24c: resolution_score did not follow the most recent resolution (%)', v_score;
  end if;

  -- (d) enrichment branch: fresh copy, dataset missing → filled; nothing missing → no write at all
  update public.places
     set provider_fetched_at = now(), source_dataset = null, source_dataset_id = null
   where id = v_a;
  perform public.resolve_place('overture','prov-1','IGNORED BY A FRESH COPY', 61.0, 61.0,
                               null, null, null, null, null, 'IL', null,
                               'overture-places', 'prov-gers-1', 0.10);
  select name, source_dataset, source_dataset_id, resolution_score
    into v_name, v_ds, v_dsid, v_score from public.places where id = v_a;
  if v_ds is distinct from 'overture-places' or v_dsid is distinct from 'prov-gers-1' then
    raise exception 'FAIL P24d: a missing dataset was not enriched (% / %)', v_ds, v_dsid;
  end if;
  if v_name <> 'Provenance Cafe Refreshed' then
    raise exception 'FAIL P24d: enrichment overwrote the name from a fresh copy (%)', v_name;
  end if;
  if v_score is distinct from 0.42::real then
    raise exception 'FAIL P24d: enrichment moved resolution_score to %; that column is deliberately '
      'absent from the enrichment branch so a repeat import does not write the shared row', v_score;
  end if;
  select ctid into v_ctid_before from public.places where id = v_a;
  perform public.resolve_place('overture','prov-1','IGNORED AGAIN', 61.0, 61.0,
                               null, null, null, null, null, 'IL', null,
                               'overture-places', 'prov-gers-1', 0.99);
  select ctid into v_ctid_after from public.places where id = v_a;
  if v_ctid_after <> v_ctid_before then
    raise exception 'FAIL P24d: a repeat resolve with nothing missing wrote the shared row anyway';
  end if;

  raise notice 'PASS P24 provenance: written on insert, never written by an alias-only match, coalesced on refresh, filled but not re-written on enrichment';
end $$;

-- ── P25: 0019's enrichment columns — tags / why_go / dishes ──────────────────────────────────
-- WHY THIS SECTION EXISTS, and why it is written the way it is. `current-state.md` §3.4 records a
-- measured hole: `saved_places.extracted_reason` was designed to be system-derived, 0015 kept it out
-- of the INSERT grant to make that true, and 0017 had to grant it back because `save_place` is
-- SECURITY INVOKER — so an authenticated client can POST a forged reason straight to
-- `/saved_places`. 0019 adds three more system-derived columns. The assertions below are the proof
-- that the same hole was NOT reopened for them: `authenticated` holds no INSERT and no UPDATE on any
-- of the three, and the only writer is a service_role function.
--
-- (`extracted_reason`'s own INSERT grant is deliberately NOT asserted here in either direction. It
-- is a known defect awaiting its own review, and a test that pinned it as correct would make fixing
-- it look like a regression. `inventory.sql` check 5 carries the measurement instead.)
--
-- SCOPED TO ITS OWN FIXTURE ROWS, deliberately. This file's older sections count whole tables and
-- therefore cannot run against a database with data in it (see the LIMIT note in the header). These
-- assertions name rows by id and never count a table, so they do not make that worse.
reset role;

-- CONSTRAINT TIMING, and it is load-bearing rather than ceremonial. Per the P10 header, the mode is
-- transaction-wide and each block declares what it needs; P24 ends with `all immediate`, so without
-- this line the fixture's very first resolve_place aborts the whole suite. Not a policy failure and
-- not a defect in resolve_place: step 3 inserts the `places` row and its `place_provider_refs` alias
-- as two consecutive statements, which is legal precisely because `places_alias_required` is
-- DEFERRABLE INITIALLY DEFERRED and the pair is atomic at COMMIT. Under IMMEDIATE the check fires
-- between them and reports `has no provider ref` against a row that is one statement away from
-- having one. Measured in CI on 2026-08-27 (run 33077424041): `ERROR: place ... has no provider ref
-- (identity invariant, 08 §1.6)`, raised from assert_place_has_alias() through resolve_place line
-- 155. The fixture's own invariants are then discharged at `all immediate` below, so deferring here
-- buys the fixture nothing it has not proved.
set constraints all deferred;

insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'c@example.test');

select public.resolve_place('overture', 'ovt-p25-tagged', 'Tagged Fixture Cafe',
                            32.0600, 34.7700, 'cafe', 'cafe',
                            '1 Test St', 'Tel Aviv-Yafo', 'Tel Aviv', 'IL', '{}'::jsonb,
                            'overture-places', 'ovt-p25-tagged', 0.9) as p25_place \gset

-- TWO MORE PLACES, SAVED BY NOBODY, for P25a-iv/v alone. Aimed at `p25_place`, those two INSERTs
-- are refused by `saved_places_user_place_unique` before the column grant is ever consulted — so
-- with the INSERT grant widened they abort on a duplicate key instead of raising their own FAIL.
-- The suite still goes red, but for a reason that names the wrong thing, and "fails by luck" is
-- only fine until the luck changes (found by security-privacy under RICH-EXT-SEC, 2026-08-27,
-- by granting insert (tags, why_go, dishes) inside a rolled-back transaction and watching the
-- diagnostic). Deliberately far from the tagged fixture and differently named, so `resolve_place`'s
-- near-duplicate guard treats them as three distinct venues rather than merging them. `origin` is
-- 'manual' in both inserts, which `assert_saved_place_provenance` returns early on, so under a
-- widened grant these genuinely succeed and the designed FAIL is what fires.
select public.resolve_place('overture', 'ovt-p25-unsaved-a', 'Unsaved Fixture Alpha',
                            31.7683, 35.2137, 'cafe', 'cafe',
                            '2 Test St', 'Jerusalem', 'Jerusalem', 'IL', '{}'::jsonb,
                            'overture-places', 'ovt-p25-unsaved-a', 0.9) as p25_place2 \gset
select public.resolve_place('overture', 'ovt-p25-unsaved-b', 'Unsaved Fixture Beta',
                            32.7940, 34.9896, 'cafe', 'cafe',
                            '3 Test St', 'Haifa', 'Haifa', 'IL', '{}'::jsonb,
                            'overture-places', 'ovt-p25-unsaved-b', 0.9) as p25_place3 \gset

select set_config('request.jwt.claims',
                  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select public.save_place(:'p25_place', null, 'C''s note') as p25_saved \gset
reset role;
-- Stands in for COMMIT: the three places, their aliases and C's saved row must be a legal state
-- before a single grant assertion runs, so that a later FAIL names a grant and never a fixture that
-- was quietly invalid. Every assertion below refuses a statement outright, so the mode this leaves
-- behind is immaterial to them — and P25 is the last section that touches the database.
set constraints all immediate;
select set_config('qa.p25_saved', :'p25_saved', true),
       set_config('qa.p25_place2', :'p25_place2', true),
       set_config('qa.p25_place3', :'p25_place3', true),
       set_config('qa.c_uid', '33333333-3333-3333-3333-333333333333', true);

-- P25a: the write grants that must not exist. As C, on C's OWN row — so nothing but the column
-- grant can be what refuses the statement. RLS would let this row through; the grant does not.
select set_config('request.jwt.claims',
                  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_saved  uuid := current_setting('qa.p25_saved')::uuid;
        v_place2 uuid := current_setting('qa.p25_place2')::uuid;
        v_place3 uuid := current_setting('qa.p25_place3')::uuid;
        v_uid    uuid := current_setting('qa.c_uid')::uuid;
        v_fn     text := 'public.apply_saved_place_extraction(uuid,uuid,text[],text,text[])';
begin
  begin
    update public.saved_places set tags = array['forged'] where id = v_saved;
    raise exception 'FAIL P25a: authenticated could UPDATE saved_places.tags on their own row';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-i  saved_places.tags is not in the UPDATE grant';
  end;
  begin
    update public.saved_places set why_go = 'forged' where id = v_saved;
    raise exception 'FAIL P25a: authenticated could UPDATE saved_places.why_go';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-ii saved_places.why_go is not in the UPDATE grant';
  end;
  begin
    update public.saved_places set dishes = array['forged'] where id = v_saved;
    raise exception 'FAIL P25a: authenticated could UPDATE saved_places.dishes';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-iii saved_places.dishes is not in the UPDATE grant';
  end;
  -- The INSERT half. This is the shape of the §3.4 exploit: a direct row create, bypassing
  -- save_place, carrying a place fact the browser invented.
  begin
    insert into public.saved_places (user_id, place_id, origin, tags)
    values (v_uid, v_place2, 'manual', array['forged']);
    raise exception 'FAIL P25a: authenticated could INSERT a saved_places row carrying its own tags';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-iv saved_places.tags is not in the INSERT grant — the §3.4 shape is refused';
  end;
  begin
    insert into public.saved_places (user_id, place_id, origin, why_go, dishes)
    values (v_uid, v_place3, 'manual', 'forged', array['forged']);
    raise exception 'FAIL P25a: authenticated could INSERT why_go/dishes directly';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-v  saved_places.why_go and .dishes are not in the INSERT grant';
  end;
  -- P25a-vi: the writer function carries no EXECUTE grant for either browser role.
  --
  -- ASK THE CATALOGUE, NOT THE ERROR CODE. This assertion was rewritten after being caught passing
  -- when it should not (security-privacy, RICH-EXT-SEC, 2026-08-27). Written as a call wrapped in
  -- `exception when insufficient_privilege`, it PASSED with
  --   grant execute on function public.apply_saved_place_extraction(...) to authenticated;
  -- applied inside a rolled-back transaction — all fifteen P25 assertions stayed green. The reason
  -- is that the function is SECURITY INVOKER: the grant lets the CALL through, the UPDATE inside it
  -- is then refused by the column grants, and that raises insufficient_privilege too. One handler,
  -- two very different causes, and it printed 'not executable by authenticated' while exactly that
  -- grant was in place.
  --
  -- That is the precise regression this assertion exists for, and it is not hypothetical: an
  -- `EXECUTE` grant to a browser role has already shipped twice in this repo (0009's
  -- `anon EXECUTE on save_place`, then 0018). A tripwire that reports PASS on the bare grant is
  -- worse than no tripwire, because it makes the next regression look covered. So this asks the
  -- catalogue the exact question instead, for `anon` as well as `authenticated` —
  -- `has_function_privilege` answers about a named role regardless of the role running the query,
  -- which is why it works from inside this `authenticated` block.
  if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'FAIL P25a-vi: apply_saved_place_extraction is EXECUTE-able by authenticated';
  end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'FAIL P25a-vi: apply_saved_place_extraction is EXECUTE-able by anon';
  end if;
  raise notice 'PASS P25a-vi apply_saved_place_extraction carries no EXECUTE grant for authenticated or anon';

  -- P25a-vii: and the call is refused in fact, not only on paper. KEPT, but demoted to its own
  -- assertion with an honest name, because it proves something P25a-vi cannot: that SECURITY
  -- INVOKER means the column grants refuse the write even if the EXECUTE grant were restored, so
  -- the two controls fail independently. What it must never again be asked to prove is the grant
  -- itself — it cannot tell you WHICH privilege refused it, and P25a-vi is now the thing that can.
  begin
    perform public.apply_saved_place_extraction(v_saved, v_uid, array['forged']);
    raise exception 'FAIL P25a-vii: authenticated reached apply_saved_place_extraction and it wrote';
  exception when insufficient_privilege then
    raise notice 'PASS P25a-vii the call is refused as well (grant and column privilege fail independently)';
  end;
end $$;
reset role;

-- P25b: the ownership predicate inside the writer, tested FIRST and on a row whose columns are
-- still NULL. Order is load-bearing here, and this is not theoretical: written the other way round
-- this assertion passed with the ownership predicate deleted, because `coalesce` makes the write a
-- no-op once the row already carries tags — the test proved first-writer-wins twice and ownership
-- never. That is the exact failure mode this file's header records at P17.
--
-- service_role has BYPASSRLS, so no policy protects this row: the function's own WHERE clause is
-- the entire control, and this is the only arrangement in which it can be seen to fail open.
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid;
        v_after text[];
begin
  if (select tags from public.saved_places where id = v_saved) is not null then
    raise exception 'FAIL P25b setup: the fixture row already carries tags, so this assertion would be vacuous';
  end if;
  perform public.apply_saved_place_extraction(v_saved, '11111111-1111-1111-1111-111111111111',
                                              array['not','mine']);
  select tags into v_after from public.saved_places where id = v_saved;
  if v_after is not null then
    raise exception 'FAIL P25b: the writer updated a row belonging to another user (tags now %)', v_after;
  end if;
  begin
    perform public.apply_saved_place_extraction(v_saved, null, array['x']);
    raise exception 'FAIL P25b: the writer accepted a NULL user id';
  exception when null_value_not_allowed then
    raise notice 'PASS P25b ownership is enforced by the function itself: another user cannot write this row, and a NULL user id is refused';
  end;
end $$;

-- P25c: the service_role writer works, normalises, and is the ONLY thing that made it work.
-- Run as the privileged role, which is what service_role is standing in for here.
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid;
        v_uid   uuid := current_setting('qa.c_uid')::uuid;
        v_tags text[]; v_dishes text[]; v_why text;
begin
  perform public.apply_saved_place_extraction(
    v_saved, v_uid,
    array['  Matcha ', 'matcha', '...', 'ＲＡＭＥＮ', null],
    E'  Go  for the\tmatcha. ',
    array['Burnt Basque Cheesecake']);
  select tags, dishes, why_go into v_tags, v_dishes, v_why
    from public.saved_places where id = v_saved;

  if v_tags is distinct from array['matcha','ramen'] then
    raise exception 'FAIL P25c: tags landed as %, expected {matcha,ramen} (lowercased, deduped, NFKC-folded, empty and no-alphanumeric elements dropped, first-seen order kept)', v_tags;
  end if;
  if v_dishes is distinct from array['burnt basque cheesecake'] then
    raise exception 'FAIL P25c: dishes landed as %', v_dishes;
  end if;
  if v_why is distinct from 'Go for the matcha.' then
    raise exception 'FAIL P25c: why_go landed as %, expected whitespace collapsed and case PRESERVED', v_why;
  end if;
  raise notice 'PASS P25c apply_saved_place_extraction writes all three columns through the normaliser';
end $$;

-- P25d: first writer wins, per column — the same posture as extracted_reason (0017) and source_url
-- (0016). A second import of the same venue must not silently rewrite the first one's record.
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid;
        v_uid   uuid := current_setting('qa.c_uid')::uuid;
        v_tags text[];
begin
  perform public.apply_saved_place_extraction(v_saved, v_uid, array['overwritten'], 'overwritten', array['overwritten']);
  select tags into v_tags from public.saved_places where id = v_saved;
  if v_tags is distinct from array['matcha','ramen'] then
    raise exception 'FAIL P25d: a second call overwrote the first extraction''s tags (now %)', v_tags;
  end if;
  raise notice 'PASS P25d a second apply_saved_place_extraction does not overwrite what the first recorded';
end $$;

-- P25e: the bounds REFUSE rather than truncate. Nine tags is model output we cannot silently
-- discard three of; the write fails and the caller finds out.
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid;
        v_uid   uuid := current_setting('qa.c_uid')::uuid;
begin
  begin
    update public.saved_places
       set tags = array['a1','b2','c3','d4','e5','f6','g7','h8','i9'] where id = v_saved;
    raise exception 'FAIL P25e: nine tags were accepted';
  exception when check_violation then
    raise notice 'PASS P25e-i  more than eight tags is refused, not truncated';
  end;
  begin
    update public.saved_places set tags = array[repeat('x', 33)] where id = v_saved;
    raise exception 'FAIL P25e: a 33-character tag was accepted';
  exception when check_violation then
    raise notice 'PASS P25e-ii a tag longer than 32 characters is refused';
  end;
  begin
    update public.saved_places set why_go = repeat('w', 281) where id = v_saved;
    raise exception 'FAIL P25e: a 281-character why_go was accepted';
  exception when check_violation then
    raise notice 'PASS P25e-iii a why_go longer than 280 characters is refused';
  end;
  -- ONE empty state, not two: '{}' is not storable, it becomes NULL.
  update public.saved_places set tags = '{}'::text[] where id = v_saved;
  if (select tags from public.saved_places where id = v_saved) is not null then
    raise exception 'FAIL P25e: an empty array was stored as {} rather than normalised to NULL';
  end if;
  raise notice 'PASS P25e-iv an empty tag array is stored as NULL — one empty representation, not two';
  perform public.apply_saved_place_extraction(v_saved, v_uid, array['matcha','ramen']);
end $$;

-- P25f: the read side. The positive half first — without it a schema that denies everyone
-- everything satisfies P25g just as well.
select set_config('request.jwt.claims',
                  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid; v_tags text[];
begin
  select tags into v_tags from public.saved_places where id = v_saved;
  if v_tags is distinct from array['matcha','ramen'] then
    raise exception 'FAIL P25f: the owner cannot read their own tags (got %)', v_tags;
  end if;
  raise notice 'PASS P25f the owner reads their own tags/why_go/dishes through saved_places_select_own';
end $$;

-- P25g: and another user does not, naming the row by id so this is a policy result and not an
-- empty table. tags is the new payload; the row-level policy is what keeps it private, and that is
-- the whole basis of 0019's ruling that tags belong on saved_places rather than on the shared
-- `places` row.
reset role;
select set_config('request.jwt.claims',
                  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_saved uuid := current_setting('qa.p25_saved')::uuid; n integer;
begin
  select count(*) into n from public.saved_places where id = v_saved;
  if n <> 0 then
    raise exception 'FAIL P25g: B can see C''s tagged saved_places row (% rows)', n;
  end if;
  raise notice 'PASS P25g another user cannot read C''s tags: the row itself is invisible to them';
end $$;
reset role;

-- ── P23: DELIBERATELY UNPROVEN — mutual exclusion under real concurrency ─────────────────────
-- The invariant: two transactions resolving the SAME venue under two DIFFERENT provider ids must
-- end with ONE places row. `08` §4 claims it as prevented ("unique (provider, provider_place_id) +
-- the 75 m/name guard, both inside resolve_place"), and that claim was only ever true
-- single-threaded: the two provider pairs differ by construction, so the unique constraint cannot
-- fire, and under READ COMMITTED neither guard probe can see the other's uncommitted row.
--
-- P22 proves the lock is taken and keyed correctly. It does NOT prove mutual exclusion, and this
-- file cannot: a psql script is ONE session, and proving exclusion needs two sessions plus a
-- barrier — session 1 inside resolve_place and not yet committed while session 2 enters it. There is
-- no in-transaction way to open a second connection here (dblink/pg_background would be a new
-- extension, which D6 forbids).
--
-- WHAT WOULD PROVE IT (kept concrete so it can be built rather than re-argued):
--   a two-connection harness — a shell script or a pgbench file driving two psql processes over
--   FIFOs — doing:
--     S1: begin; select resolve_place('overture','conc-1','Barrier Cafe',32.1,34.8,...,'IL');
--     S2: begin; set statement_timeout='20s';
--         select resolve_place('osm','conc-2','Barrier Cafe',32.1001,34.8001,...,'IL');
--     assert, while S1 is still open, that S2 is blocked:
--         select count(*) from pg_locks where locktype='advisory' and not granted  -- must be 1
--     S1: commit;  S2: commit;
--     assert: exactly ONE row in places, TWO rows in place_provider_refs, and both calls returned
--             the same uuid.
--   Run the same script against 0007's resolve_place to see it produce TWO places — otherwise the
--   harness proves the lock is harmless rather than that it is necessary.
--
-- Until that harness exists in the repo and runs in CI, this invariant is UNPROVEN BY THIS SUITE.
-- It is recorded here rather than dropped, because `08` §4 asserts it and a reader of this file is
-- entitled to know which of its claims are tested.
do $$
begin
  raise notice 'UNPROVEN P23 two-session mutual exclusion is NOT asserted by this suite (single-session harness); see the comment above for the two-connection test that would assert it';
end $$;


rollback;
