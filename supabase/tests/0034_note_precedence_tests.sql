-- 0034_note_precedence_tests.sql — the note the user wrote survives a second import.
--
-- Task `r2-note-loss`. The proof for `supabase/migrations/0034_note_first_writer_wins.sql` and,
-- more importantly, the test whose ABSENCE is why the defect shipped: before this file, the whole
-- suite called `save_place` on an already-saved place exactly nowhere with a note on both calls.
-- `0008_policy_tests.sql:1528` calls it once, for a fixture. One call cannot observe a precedence
-- rule, so the ON CONFLICT clause has never been asserted about by anything.
--
-- Same posture as `0024` and `0031`'s test files, and the same deliberate deviation from `08` §3.8:
-- this file creates a fixture user in `auth.users`, so it is a TEST and never a migration.
-- Everything happens inside one transaction that is rolled back at the end.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0034_note_precedence_tests.sql
-- On a machine with no host `psql` (which is this project's standing condition — see `0031`'s
-- header), the same thing through the container:
--   docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/0034_note_precedence_tests.sql
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
-- `package.json` is outside this lane's write scope, so `db:test:0034` is not yet chained into
-- `npm run db:test`; the orchestrator adds it. Until then this file is a gate only when invoked.
--
-- LIKE 0024 AND 0031 AND UNLIKE 0008, THIS FILE COUNTS NOTHING GLOBAL. Every assertion names its
-- own rows by id, so it runs against a database that already has real data in it — no
-- `supabase db reset` first, and no discarding cached `extractions` rows that cost real model calls.
--
-- HARNESS PREREQUISITE, MEASURED RATHER THAN ASSUMED on 2026-08-31 against `supabase_db_P-002`:
-- this container's `auth.uid()` already coalesces the legacy singular `request.jwt.claim.sub` GUC
-- with the modern `request.jwt.claims` JSON, so the shim `0008`'s header describes is NOT needed
-- here. On a bare postgres image it would be; if the first `save_place()` below aborts with
-- `not authenticated`, that is the image and not a policy.
--
-- ═══ N7 TAKES A BRIEF LOCK ON `save_place`, AND THAT IS DELIBERATE ════════════════════════════
-- The last section installs `0024`'s ORIGINAL body inside this transaction to demonstrate that it
-- destroys the note — the failure-first control, without which every assertion above is only known
-- to be green and not known to be load-bearing. `create or replace function` is transactional, so
-- the ROLLBACK at the end restores the shipped definition and nothing survives; but between N7 and
-- that ROLLBACK a concurrent session calling `save_place` will BLOCK on the pg_proc row. It is a
-- sub-second window and N7 is placed last so the window is as short as the file can make it. Do not
-- move N7 earlier, and do not run this file against a database someone is actively importing into.
--
-- SHAPE OF THE FILE
--   N0   fixtures, and the positive control: a first save lands its note.
--   N1   THE DEFECT. A second save of the SAME place from a DIFFERENT source with a DIFFERENT
--        note leaves the first note standing.
--   N2   the original protection has not regressed: a second save with a NULL note also leaves it.
--   N3   not write-once-nothing: a first save with a null note still accepts a later real note.
--   N4   everything else the upsert does is unchanged — extracted_reason, tags/why_go/dishes,
--        source_url, saved_place_sources accumulation, the untouched overlay columns, the id and
--        the origin.
--   N5   `note` is still EDITABLE. The sheet's direct UPDATE replaces it. This is the assertion
--        that answers "first-writer-wins makes the field write-once", and the answer is no.
--   N6   a manual add (p_source_id null) over an existing save cannot destroy the note either.
--   N7   FAILURE-FIRST: with `0024`'s body reinstalled, N1's scenario DOES destroy the note.

\set u  'a0000000-0000-4000-8000-000000000034'

begin;

-- ── N0 fixtures, as the privileged role ───────────────────────────────────────────────────────
-- The profiles row is created by handle_new_user() (0002), not here.
insert into auth.users (id, email) values (:'u', 'note-precedence@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id = 'a0000000-0000-4000-8000-000000000034') <> 1 then
    raise exception 'FAIL N0: handle_new_user did not create a profile for the fixture user';
  end if;
  raise notice 'PASS N0a fixture user has a profile';
end $$;

-- Three sources. Two different TikToks about the SAME restaurant is the designed case this whole
-- file is about (`0007` header, acceptance I3/I4/A2); the third belongs to N7.
select public.start_import(:'u', 'tiktok', '79340000000000001',
                           'https://www.tiktok.com/@n34/video/79340000000000001');
select public.start_import(:'u', 'tiktok', '79340000000000002',
                           'https://www.tiktok.com/@n34/video/79340000000000002');
select public.start_import(:'u', 'tiktok', '79340000000000003',
                           'https://www.tiktok.com/@n34/video/79340000000000003');

select id as src1 from public.sources where platform_source_id = '79340000000000001' \gset
select id as src2 from public.sources where platform_source_id = '79340000000000002' \gset
select id as src3 from public.sources where platform_source_id = '79340000000000003' \gset

-- Three places, deliberately far apart so `0011`'s 75 m near-duplicate guard cannot merge them
-- into one and make a precedence assertion accidentally trivial.
select public.resolve_place('overture','ovt-n34-a','Note Fixture Ha Kosem',
                            32.0640, 34.7740, 'restaurant', 'restaurant', null,
                            'Tel Aviv-Yafo', null, 'IL', '{}'::jsonb) as p1 \gset
select public.resolve_place('overture','ovt-n34-b','Note Fixture Kohi',
                            35.6762, 139.6503, 'cafe', 'cafe', null,
                            'Tokyo', null, 'JP', '{}'::jsonb) as p2 \gset
select public.resolve_place('overture','ovt-n34-c','Note Fixture Control Venue',
                            -33.8688, 151.2093, 'bar', 'bar', null,
                            'Sydney', null, 'AU', '{}'::jsonb) as p3 \gset

-- DISCHARGE THE FIXTURE'S DEFERRED TRIGGERS HERE, AS THE PRIVILEGED ROLE — the reasoning is
-- `0031`'s test header, at length: `places_alias_required` is a deferred CONSTRAINT TRIGGER whose
-- function is not `security definer`, so it runs under whatever role is current at the first
-- discharge, and `authenticated` cannot read `places.merged_into_place_id` (0012). Clearing the
-- backlog before any `set local role` keeps every later discharge honest.
set constraints all immediate;
-- AND BACK TO DEFERRED, WHICH IS NOT OPTIONAL. `set constraints all immediate` is not a one-shot
-- flush: it changes the mode for the REMAINDER of the transaction. Left immediate,
-- `saved_places_provenance_required` fires on the INSERT *inside* `save_place`, before the
-- `saved_place_sources` row two statements later exists, and every import save in this file aborts
-- with "origin=import but no source". Measured, not predicted — that is exactly how the first run
-- of this file failed. The pair discharges the backlog and restores the mode PostgREST runs in.
set constraints all deferred;

select set_config('qa34.uid',  :'u',    true),
       set_config('qa34.src1', :'src1', true),
       set_config('qa34.src2', :'src2', true),
       set_config('qa34.src3', :'src3', true),
       set_config('qa34.p1',   :'p1',   true),
       set_config('qa34.p2',   :'p2',   true),
       set_config('qa34.p3',   :'p3',   true);

-- ── the user, from here on, exactly as PostgREST would present them ───────────────────────────
select set_config('request.jwt.claims',
                  '{"sub":"a0000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
set local role authenticated;

-- N0b THE POSITIVE CONTROL. Without this, every "the first note survived" assertion below is also
-- satisfied by a `save_place` that never writes a note at all.
select public.save_place(:'p1', :'src1', 'the pickle bar, ask for extra amba',
                         '📍Ha Kosem') as saved1 \gset

do $$
declare v_note text;
begin
  select note into v_note from public.saved_places
   where user_id = current_setting('qa34.uid')::uuid
     and place_id = current_setting('qa34.p1')::uuid;
  if v_note is distinct from 'the pickle bar, ask for extra amba' then
    raise exception 'FAIL N0b: the FIRST save did not land its note (got %)', coalesce(v_note,'<null>');
  end if;
  raise notice 'PASS N0b a first save lands its note';
end $$;

-- The provenance constraint is real and is discharged here rather than at ROLLBACK, so a broken
-- fixture fails at N0 naming the fixture instead of at the end naming nothing.
set constraints all immediate;
set constraints all deferred;

select set_config('qa34.saved1', :'saved1', true);

-- ── N1 THE DEFECT ─────────────────────────────────────────────────────────────────────────────
-- A second TikTok mentions the same restaurant. The candidate arrives ALREADY TICKED (owner ruling,
-- 2026-08-29), the user writes a note about the new video, and the save runs. Against `0024`'s body
-- this REPLACES the July sentence and the UI says `already saved`. Against `0034` it does not.
select public.save_place(:'p1', :'src2', 'the lunch queue is shorter at 2pm',
                         '📍Ha Kosem again') as saved1b \gset

do $$
declare v_note text; v_id uuid;
begin
  select id, note into v_id, v_note from public.saved_places
   where user_id = current_setting('qa34.uid')::uuid
     and place_id = current_setting('qa34.p1')::uuid;
  if v_note is distinct from 'the pickle bar, ask for extra amba' then
    raise exception
      'FAIL N1: a second import DESTROYED the first note. note is now % — this is the r2-note-loss defect',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  if v_id is distinct from current_setting('qa34.saved1')::uuid then
    raise exception 'FAIL N1b: the second save created a second row rather than upserting';
  end if;
  raise notice 'PASS N1  a second import with a different note leaves the first note standing';
  raise notice 'PASS N1b the second save upserted the same saved_places row';
end $$;

-- ── N2 the ORIGINAL protection has not regressed ──────────────────────────────────────────────
-- `coalesce(excluded.note, sp.note)` did protect the stored note against being NULLED, which is the
-- only direction that was ever exercised before `80c5bc1`. Flipping the arguments must not lose it.
select public.save_place(:'p1', :'src2', null, null);

do $$
declare v_note text;
begin
  select note into v_note from public.saved_places
   where user_id = current_setting('qa34.uid')::uuid
     and place_id = current_setting('qa34.p1')::uuid;
  if v_note is distinct from 'the pickle bar, ask for extra amba' then
    raise exception 'FAIL N2: a second save with a NULL note changed the stored note to %',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  raise notice 'PASS N2  a second save with a null note leaves the note standing';
end $$;

-- ── N3 NOT write-once-nothing ─────────────────────────────────────────────────────────────────
-- A save that carried no note leaves the column null, and null is not a writer. A later import
-- MUST still be able to land the first real note, or the fix would have traded one silent loss for
-- a column nobody can ever fill through the import path.
select public.save_place(:'p2', :'src1', null, null) as saved2 \gset
set constraints all immediate;
set constraints all deferred;

do $$
declare v_note text;
begin
  select note into v_note from public.saved_places
   where user_id = current_setting('qa34.uid')::uuid
     and place_id = current_setting('qa34.p2')::uuid;
  if v_note is not null then
    raise exception 'FAIL N3a: a save with a null note somehow stored %', quote_literal(v_note);
  end if;
  raise notice 'PASS N3a a save with no note leaves the column null';
end $$;

select public.save_place(:'p2', :'src2', 'the matcha, not the pour-over', null);

do $$
declare v_note text;
begin
  select note into v_note from public.saved_places
   where user_id = current_setting('qa34.uid')::uuid
     and place_id = current_setting('qa34.p2')::uuid;
  if v_note is distinct from 'the matcha, not the pour-over' then
    raise exception 'FAIL N3b: a later note did not land on a save whose note was null (got %)',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  raise notice 'PASS N3b a later import still lands the FIRST real note';
end $$;

-- ── N4 everything else the upsert does is unchanged ───────────────────────────────────────────
-- N4e sets the four overlay columns `save_place` must never touch, through the grant the sheet
-- uses, BEFORE the next save_place call — so "unchanged" is a claim about a value that was there.
update public.saved_places
   set display_name      = 'Ha Kosem (the good one)',
       category_override = 'street food',
       visit_state       = 'visited',
       visited_at        = timestamptz '2026-07-04 12:00:00+00'
 where id = current_setting('qa34.saved1')::uuid;

reset role;
-- The enrichment writer, called the way the server calls it: `service_role`, with the user id
-- passed explicitly because there is no auth.uid() on that path. First-writer-wins per column
-- (`0019`), which is the rule `note` now joins.
select public.apply_saved_place_extraction(
         current_setting('qa34.saved1')::uuid,
         current_setting('qa34.uid')::uuid,
         array['middle eastern','street food'],
         'The pickle bar is the whole point.',
         array['sabich','hummus']);

select set_config('request.jwt.claims',
                  '{"sub":"a0000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
set local role authenticated;

-- A THIRD import of the same place, carrying different everything. Nothing below may move.
select public.save_place(:'p1', :'src3', 'a third note that must not land',
                         '📍a third reason that must not land');

reset role;
do $$
declare r record; v_srcs int; v_url1 text;
begin
  select * into r from public.saved_places
   where id = current_setting('qa34.saved1')::uuid;
  select canonical_url into v_url1 from public.sources
   where id = current_setting('qa34.src1')::uuid;

  -- N4a extracted_reason is INSERT-only: it is not in the DO UPDATE list at all.
  if r.extracted_reason is distinct from '📍Ha Kosem' then
    raise exception 'FAIL N4a: extracted_reason changed to %',
      coalesce(quote_literal(r.extracted_reason), '<null>');
  end if;
  raise notice 'PASS N4a extracted_reason is unchanged by later saves';

  -- N4b the enrichment columns, first-writer-wins via 0019 and untouched by save_place.
  -- Compared against the NORMALISED forms, because `apply_saved_place_extraction` normalises on
  -- the way in (`0019`) and `saved_places_tags_normalised` enforces it. Asserting the raw literals
  -- would make this test a test of normalize_tag_list, which is 0019's job and not this file's.
  if r.tags is distinct from public.normalize_tag_list(array['middle eastern','street food'])
     or r.why_go is distinct from public.normalize_sentence('The pickle bar is the whole point.')
     or r.dishes is distinct from public.normalize_tag_list(array['sabich','hummus']) then
    raise exception 'FAIL N4b: tags/why_go/dishes changed — tags=% why_go=% dishes=%',
      r.tags, coalesce(quote_literal(r.why_go),'<null>'), r.dishes;
  end if;
  raise notice 'PASS N4b tags, why_go and dishes are unchanged by later saves';

  -- N4c source_url is the FIRST source's, three saves and three sources later.
  if r.source_url is distinct from v_url1 then
    raise exception 'FAIL N4c: source_url is % and should still be the first source''s %',
      coalesce(quote_literal(r.source_url),'<null>'), quote_literal(v_url1);
  end if;
  raise notice 'PASS N4c source_url is still the first source''s';

  -- N4d saved_place_sources ACCUMULATES — this is where multi-source information is designed to
  -- live, and the reason no column needs to union. Three distinct sources, three rows.
  select count(*) into v_srcs from public.saved_place_sources
   where saved_place_id = current_setting('qa34.saved1')::uuid;
  if v_srcs <> 3 then
    raise exception 'FAIL N4d: expected 3 saved_place_sources rows, found %', v_srcs;
  end if;
  raise notice 'PASS N4d saved_place_sources accumulated one row per source (3)';

  -- N4e the four overlay columns save_place never writes.
  if r.display_name is distinct from 'Ha Kosem (the good one)'
     or r.category_override is distinct from 'street food'
     or r.visit_state <> 'visited'
     or r.visited_at is distinct from timestamptz '2026-07-04 12:00:00+00' then
    raise exception 'FAIL N4e: an overlay column moved — display_name=% category_override=% visit_state=% visited_at=%',
      coalesce(quote_literal(r.display_name),'<null>'),
      coalesce(quote_literal(r.category_override),'<null>'), r.visit_state, r.visited_at;
  end if;
  raise notice 'PASS N4e display_name, category_override, visit_state and visited_at are untouched';

  -- N4f origin. The first save was an import and a later save cannot rewrite what it was.
  if r.origin <> 'import' then
    raise exception 'FAIL N4f: origin is %', r.origin;
  end if;
  raise notice 'PASS N4f origin is unchanged';

  -- N4g and the note, once more, after all of that.
  if r.note is distinct from 'the pickle bar, ask for extra amba' then
    raise exception 'FAIL N4g: the note did not survive the third import (got %)',
      coalesce(quote_literal(r.note), '<null>');
  end if;
  raise notice 'PASS N4g the note survived a third import too';
end $$;

-- ── N5 THE NOTE IS STILL EDITABLE ─────────────────────────────────────────────────────────────
-- This is the assertion that answers the objection to first-writer-wins. `save_place` no longer
-- overwrites the note, but the sheet's editor never went through `save_place`: it is a direct
-- UPDATE under the `authenticated` column grant (`src/app/actions/saved-places.ts:124`). So the
-- column is protected from a drive-by import and remains fully writable by its owner, which is the
-- difference between "first-writer-wins" and "write-once".
select set_config('request.jwt.claims',
                  '{"sub":"a0000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
set local role authenticated;

update public.saved_places
   set note = 'rewritten by the user, on purpose, from the sheet'
 where id = current_setting('qa34.saved1')::uuid;

do $$
declare v_note text; v_rows int;
begin
  select note into v_note from public.saved_places
   where id = current_setting('qa34.saved1')::uuid;
  if v_note is distinct from 'rewritten by the user, on purpose, from the sheet' then
    raise exception 'FAIL N5: the owner could not edit their own note through the UPDATE grant (got %)',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  raise notice 'PASS N5  the note is still fully editable by its owner — first-writer-wins is not write-once';
  -- Restore, so N6 asserts against a known value.
  update public.saved_places set note = 'the pickle bar, ask for extra amba'
   where id = current_setting('qa34.saved1')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL N5b: could not restore the fixture note';
  end if;
end $$;

-- ── N6 a MANUAL add over an existing save ─────────────────────────────────────────────────────
-- p_source_id null takes the other branch of the function entirely (no saved_place_sources insert,
-- no source-link fill). The ON CONFLICT is shared, so the note must be just as safe there.
select public.save_place(:'p1', null, 'typed into the manual-add form by mistake', null);

do $$
declare v_note text; v_origin text;
begin
  select note, origin into v_note, v_origin from public.saved_places
   where id = current_setting('qa34.saved1')::uuid;
  if v_note is distinct from 'the pickle bar, ask for extra amba' then
    raise exception 'FAIL N6: a manual add destroyed the note (got %)',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  if v_origin <> 'import' then
    raise exception 'FAIL N6b: a manual add rewrote origin to %', v_origin;
  end if;
  raise notice 'PASS N6  a manual add over an existing save leaves the note and the origin alone';
end $$;

reset role;

-- ══ N7 FAILURE-FIRST ══════════════════════════════════════════════════════════════════════════
-- Everything above is green. That is worth nothing until the same assertions are seen to go RED
-- against the definition this migration replaces — otherwise the file proves that the test passes,
-- not that the control is what makes it pass. `0024`'s body, verbatim, with `0024`'s coalesce:
--
--     do update set note = coalesce(excluded.note, saved_places.note)
--
-- ROLLED BACK with the rest of the file. See the header on the lock this takes.
create or replace function public.save_place(
  p_place_id         uuid,
  p_source_id        uuid default null,
  p_note             text default null,
  p_extracted_reason text default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into saved_places (user_id, place_id, origin, note, extracted_reason)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note, p_extracted_reason)
  on conflict (user_id, place_id)
    do update set note = coalesce(excluded.note, saved_places.note)   -- 0024: LAST writer wins
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;
    perform public.apply_saved_place_source_link(v_id, p_source_id);
  end if;

  return v_id;
end;
$fn$;

select set_config('request.jwt.claims',
                  '{"sub":"a0000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
set local role authenticated;

select public.save_place(:'p3', :'src1', 'the note that the old body will destroy', null) as saved3 \gset
select set_config('qa34.saved3', :'saved3', true);
set constraints all immediate;
set constraints all deferred;
select public.save_place(:'p3', :'src2', 'the second video''s note', null);

do $$
declare v_note text;
begin
  select note into v_note from public.saved_places
   where id = current_setting('qa34.saved3')::uuid;
  if v_note is distinct from 'the second video''s note' then
    raise exception
      'FAIL N7: 0024''s body did NOT destroy the first note (got %). Either the control was not '
      'installed or the defect this file exists for is not what it says it is — every PASS above '
      'is vacuous until this assertion is understood.',
      coalesce(quote_literal(v_note), '<null>');
  end if;
  raise notice 'PASS N7  CONTROL: with 0024''s body reinstalled the second import DOES destroy the first note — the assertions above are load-bearing';
end $$;

reset role;

rollback;
