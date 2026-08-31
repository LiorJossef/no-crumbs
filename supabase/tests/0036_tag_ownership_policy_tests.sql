-- 0036_tag_ownership_policy_tests.sql — the words a person files their map under are theirs, and
-- what the model proposed is still on the record.
--
-- Task `r3-tags-db`. The proof for `supabase/migrations/0036_tags_are_the_users_vocabulary.sql`.
-- Same posture as `0024`, `0031`, `0034` and `0035`'s test files: this file creates fixture users
-- in `auth.users`, so it is a TEST and never a migration, and everything happens inside one
-- transaction that is rolled back at the end.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0036_tag_ownership_policy_tests.sql
-- On a machine with no host `psql` (this project's standing condition — `which psql` returns
-- nothing here, re-checked 2026-09-01), the same thing through the container:
--   docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/0036_tag_ownership_policy_tests.sql
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
-- `package.json` is outside this lane's write scope, so `db:test:0036` is not chained into
-- `npm run db:test`; the orchestrator adds it. Until then this file is a gate only when invoked.
--
-- LIKE 0024, 0031, 0034 AND 0035 AND UNLIKE 0008, THIS FILE COUNTS NOTHING GLOBAL. Every assertion
-- names its own rows by id, so it runs against a database that already has real data in it — no
-- `supabase db reset` first, which matters because the local container is shared.
--
-- SHAPE OF THE FILE
--   T0  the fixture, and the state the migration starts from.
--   T1  WHAT A USER STILL CANNOT DO: no UPDATE privilege on `tags`, `tags_extracted` or
--       `tags_confirmed_at`, so a direct write is refused at the privilege layer with 42501 —
--       inexpressible, not merely unimplemented.
--   T2  WHAT A USER CAN NOW DO: set their own vocabulary through `set_saved_place_tags`, normalised
--       and deduped, with the confirmation stamped in the same statement.
--   T3  CLEARING IS AN ASSERTION. An empty array removes every tag AND still stamps.
--   T4  NOT ON SOMEONE ELSE'S SAVE. 42501, the victim's row untouched, and the same message for a
--       save that does not exist — so it is not an existence oracle.
--   T5  RULING 1 UNDER TEST: a collection PEER, who can read the shared place, reads ZERO rows of
--       the owner's `saved_places`. This is what makes a table-level SELECT grant safe here.
--   T6  PROVENANCE SURVIVES THE EDIT. `tags_extracted` still says what the model proposed.
--   T7  THE EXTRACTOR DOES NOT UNDO A HUMAN — including a human who deleted every tag.
--   T8  RE-POINT clears the model's words and keeps the user's.
--   T9  Over-count is refused with a readable message, not truncated.
--   T10 `anon` and PUBLIC hold no EXECUTE on the new function.
--   T11 FAILURE-FIRST: `0019`'s original body is restored inside this transaction and the T7 call
--       is repeated. It refills the tags the user deleted. So T7 is known to be load-bearing and
--       not merely green.
--
-- ═══ T11 REPLACES A LIVE FUNCTION INSIDE THE TRANSACTION, AND THAT IS DELIBERATE ══════════════
-- T11 runs `create or replace function public.apply_saved_place_extraction(...)` with `0019`'s
-- pre-0036 body to demonstrate the defect 0036 closes. `create or replace` is transactional, so
-- the ROLLBACK restores 0036's version and nothing survives; but between T11 and that ROLLBACK a
-- concurrent session calling that function will BLOCK. It is a sub-second window and T11 is placed
-- last so the window is as short as the file can make it. Do not move T11 earlier. (`0034`'s N7
-- and `0035`'s P7 carry the same warning for the same reason.)

\set ua 'a0000000-0000-4000-8000-000000000036'
\set ub 'b0000000-0000-4000-8000-000000000036'
\set uc 'c0000000-0000-4000-8000-000000000036'
\set pl '10000000-0000-4000-8000-000000000036'
\set p2 '20000000-0000-4000-8000-000000000036'
\set sa '1a000000-0000-4000-8000-000000000036'
\set sb '1b000000-0000-4000-8000-000000000036'
\set co 'c1000000-0000-4000-8000-000000000036'
\set ghost 'dead0000-0000-4000-8000-000000000036'

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T0. THE FIXTURE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ua  the owner of the save under test
-- ub  a stranger
-- uc  a COLLECTION PEER of ua — the only principal in this schema who reads any of ua's data
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ua', 'tags-a@example.test', '{}'::jsonb),
  (:'ub', 'tags-b@example.test', '{}'::jsonb),
  (:'uc', 'tags-c@example.test', '{}'::jsonb);

insert into public.places (id, name, lat, lng, locality) values
  (:'pl', 'Fixture Cafe 0036',  32.0700, 34.7700, 'Tel Aviv'),
  (:'p2', 'Fixture Bakery 0036', 32.0710, 34.7710, 'Tel Aviv');

-- `origin = 'manual'`, so `saved_places_provenance_required` has nothing to assert and the fixture
-- needs no `sources` / `saved_place_sources` rows. The tag machinery under test is identical on
-- both origins — it hangs off the columns, not off provenance.
insert into public.saved_places (id, user_id, place_id, origin) values
  (:'sa', :'ua', :'pl', 'manual'),
  (:'sb', :'ub', :'pl', 'manual');

-- ua and uc share one collection. This is the fixture for T5 and it is the strongest available
-- adversary: `security.md` §3.4 names four tables on which a collection peer reads another user's
-- row, and the question 0036 had to answer is whether `saved_places` is a fifth.
insert into public.collections (id, owner_id, name) values (:'co', :'ua', 'Fixture 0036');
insert into public.collection_members (collection_id, user_id, role) values
  (:'co', :'uc', 'editor')
on conflict do nothing;
insert into public.collection_items (collection_id, place_id, added_by) values
  (:'co', :'pl', :'ua');

-- The extractor's first pass, exactly as the import path performs it: `service_role`, through the
-- RPC, with model output. Nothing below inserts into `tags` by hand.
set local role service_role;
select public.apply_saved_place_extraction(
  :'sa', :'ua', array['Coffee','  coffee ','בית קפה','hidden gem'], 'A tiny place.', array['cortado']);
reset role;

do $$
declare v_t text[]; v_e text[]; v_c timestamptz;
begin
  select tags, tags_extracted, tags_confirmed_at into v_t, v_e, v_c
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  if v_t is distinct from array['coffee','בית קפה','hidden gem'] then
    raise exception 'FAIL T0: the extractor stored %, expected the normalised, deduped three', v_t;
  end if;
  if v_e is distinct from v_t then
    raise exception 'FAIL T0: tags_extracted is % but tags is % — 0036 change 1 did not record the proposal', v_e, v_t;
  end if;
  -- THE ASSERTION THE WHOLE MIGRATION TURNS ON. A model wrote three words onto this row and the
  -- user has not seen them. `tags_confirmed_at` must be NULL, because a timestamp here would be
  -- the schema manufacturing a consent nobody gave.
  if v_c is not null then
    raise exception 'FAIL T0: the extractor stamped tags_confirmed_at (%) — model output must never look confirmed', v_c;
  end if;
  raise notice 'PASS T0 the extractor writes tags AND records its own proposal, and confirms nothing';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T1. WHAT A USER STILL CANNOT DO — the privilege layer, not the policy layer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare c_r boolean; c_w boolean; e_r boolean; e_w boolean; f_w boolean;
begin
  c_r := has_column_privilege('authenticated','public.saved_places','tags','SELECT');
  c_w := has_column_privilege('authenticated','public.saved_places','tags','UPDATE');
  e_r := has_column_privilege('authenticated','public.saved_places','tags_extracted','SELECT');
  e_w := has_column_privilege('authenticated','public.saved_places','tags_extracted','UPDATE');
  f_w := has_column_privilege('authenticated','public.saved_places','tags_confirmed_at','UPDATE');
  -- READ is TRUE and that is 0036's ruling 1, stated out loud: `saved_places` carries a TABLE-level
  -- SELECT grant (`authenticated=rd`), so both new columns are readable the moment they exist. The
  -- owner must be able to see what the model proposed; nobody else can reach the row (T5).
  if not c_r or not e_r then
    raise exception 'FAIL T1: the owner cannot read their own tags (tags=%, tags_extracted=%)', c_r, e_r;
  end if;
  if c_w or e_w or f_w then
    raise exception 'FAIL T1: a column UPDATE grant exists — tags=%, tags_extracted=%, tags_confirmed_at=%. 0036 grants none; the function is the only write path',
      c_w, e_w, f_w;
  end if;
  raise notice 'PASS T1a all three columns readable by their owner, none of them writable by any browser role';
end $$;

select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;

-- The three writes the product would have made if 0036 had chosen a column grant. All three must
-- fail at the privilege layer — 42501, BEFORE any policy is consulted — on the user's OWN row.
do $$
declare v_sqlstate text;
begin
  begin
    update public.saved_places set tags = array['mine']
     where id = '1a000000-0000-4000-8000-000000000036';
    raise exception 'FAIL T1b: a direct UPDATE of tags on the user''s own row SUCCEEDED';
  exception
    when insufficient_privilege then v_sqlstate := '42501';
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T1b: expected 42501, got %', v_sqlstate;
  end;
  raise notice 'PASS T1b a direct UPDATE of `tags` is refused with 42501 — inexpressible, not unimplemented';
end $$;

do $$
declare v_sqlstate text;
begin
  begin
    update public.saved_places set tags_extracted = array['rewritten']
     where id = '1a000000-0000-4000-8000-000000000036';
    raise exception 'FAIL T1c: a user REWROTE what the model proposed';
  exception
    when insufficient_privilege then v_sqlstate := '42501';
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T1c: expected 42501, got %', v_sqlstate;
  end;
  raise notice 'PASS T1c a user cannot falsify tags_extracted — 0033''s principle, enforced by the grant';
end $$;

do $$
declare v_sqlstate text;
begin
  begin
    update public.saved_places set tags_confirmed_at = now()
     where id = '1a000000-0000-4000-8000-000000000036';
    raise exception 'FAIL T1d: a client CLAIMED a confirmation without changing a single word';
  exception
    when insufficient_privilege then v_sqlstate := '42501';
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T1d: expected 42501, got %', v_sqlstate;
  end;
  raise notice 'PASS T1d a consent timestamp cannot be written by the party it is evidence against';
end $$;

-- The five columns the product DOES let a user write are untouched by 0036, checked here so a
-- regression in the grant shows up as a tag test failing rather than as a broken sheet.
update public.saved_places set note = 'still writable'
 where id = '1a000000-0000-4000-8000-000000000036';
do $$
begin
  if (select note from public.saved_places where id = '1a000000-0000-4000-8000-000000000036')
     is distinct from 'still writable' then
    raise exception 'FAIL T1e: 0036 broke the existing five-column UPDATE grant';
  end if;
  raise notice 'PASS T1e the five columns 0006 granted are still writable';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T2. WHAT A USER CAN NOW DO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select public.set_saved_place_tags(
  '1a000000-0000-4000-8000-000000000036'::uuid,
  array['Date Night','  date night  ','WITH MAYA','...','worth the queue']);

do $$
declare v_t text[]; v_e text[]; v_c timestamptz;
begin
  select tags, tags_extracted, tags_confirmed_at into v_t, v_e, v_c
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  -- Normalised (lowercased, whitespace collapsed), deduped in first-seen order, and the
  -- information-free '...' dropped by `normalize_tag` — the same rules the extractor's output goes
  -- through, so a user's word and a model's word are stored in one canonical form and the GIN
  -- filter cannot see two of what a person typed once.
  if v_t is distinct from array['date night','with maya','worth the queue'] then
    raise exception 'FAIL T2a: stored %, expected the three normalised user tags', v_t;
  end if;
  if v_c is null then
    raise exception 'FAIL T2a: tags changed but tags_confirmed_at is NULL — the words and the record of who chose them came apart';
  end if;
  if v_c < now() - interval '1 minute' then
    raise exception 'FAIL T2a: tags_confirmed_at is %, which is not this statement', v_c;
  end if;
  -- AND THE MODEL'S PROPOSAL IS STILL THERE. This is the assertion that separates 0036 from the
  -- plain column grant it rejected: an edit does not destroy the extraction.
  if v_e is distinct from array['coffee','בית קפה','hidden gem'] then
    raise exception 'FAIL T2a: the edit changed tags_extracted to %', v_e;
  end if;
  raise notice 'PASS T2a a user owns the vocabulary, it is normalised, the confirmation is stamped, and the proposal survives';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T3. CLEARING IS AN ASSERTION, NOT AN ABSENCE OF ONE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select public.set_saved_place_tags('1a000000-0000-4000-8000-000000000036'::uuid, '{}'::text[]);

do $$
declare v_t text[]; v_c timestamptz;
begin
  select tags, tags_confirmed_at into v_t, v_c
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  if v_t is not null then
    raise exception 'FAIL T3: clearing left %, expected NULL — `tag_list_within` forbids an empty array, so NULL is the designated empty', v_t;
  end if;
  if v_c is null then
    raise exception 'FAIL T3: a user deleted every tag and nothing recorded that they chose to. The next import will put them back';
  end if;
  raise notice 'PASS T3 an empty array clears every tag and STILL stamps — which is what T7 then depends on';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T4. NOT ON SOMEONE ELSE'S SAVE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_sqlstate text; v_msg_other text; v_msg_ghost text;
begin
  begin
    perform public.set_saved_place_tags(
      '1a000000-0000-4000-8000-000000000036'::uuid, array['vandalised']);
    raise exception 'FAIL T4a: a stranger wrote tags onto another user''s save';
  exception
    when insufficient_privilege then
      get stacked diagnostics v_msg_other = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T4a: expected 42501, got %', v_sqlstate;
  end;

  -- A save id that does not exist at all. The message must be IDENTICAL, or the function is an
  -- oracle: a stranger could enumerate which uuids are real saves in other people's libraries.
  begin
    perform public.set_saved_place_tags(
      'dead0000-0000-4000-8000-000000000036'::uuid, array['vandalised']);
    raise exception 'FAIL T4b: writing tags onto a non-existent save SUCCEEDED';
  exception
    when insufficient_privilege then
      get stacked diagnostics v_msg_ghost = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T4b: expected 42501, got %', v_sqlstate;
  end;

  if v_msg_other is distinct from v_msg_ghost then
    raise exception 'FAIL T4b: EXISTENCE ORACLE. "not yours" says %, "no such row" says %',
      quote_literal(v_msg_other), quote_literal(v_msg_ghost);
  end if;
  raise notice 'PASS T4 a stranger is refused with 42501, and cannot tell a real save from a made-up one';
end $$;

-- The victim's row is untouched. `security definer` means BYPASSRLS inside that function, so this
-- is the assertion that the `auth.uid()` guard in the WHERE is real and not decorative.
reset role;
do $$
declare v_t text[]; v_e text[];
begin
  select tags, tags_extracted into v_t, v_e
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  if v_t is not null then
    raise exception 'FAIL T4c: the stranger''s call changed the victim''s tags to %', v_t;
  end if;
  if v_e is distinct from array['coffee','בית קפה','hidden gem'] then
    raise exception 'FAIL T4c: the stranger''s call changed the victim''s tags_extracted to %', v_e;
  end if;
  raise notice 'PASS T4c the victim''s row is byte-identical after both attempts';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T5. RULING 1 UNDER TEST — a collection peer, and the control that proves the fixture is real
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `saved_places` carries a TABLE-level SELECT grant, so if any policy on it returned another
-- user's row, both of 0036's new columns — and every column added after them — would be disclosed
-- to that person with no decision taken by anybody. That is `security.md` §3.4's rule and it is
-- why this test exists rather than a paragraph asserting the columns are private.
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n_saves integer; n_place integer; n_items integer; n_all integer;
begin
  -- THE CONTROL FIRST. If this is zero the collection fixture is broken and the assertion below
  -- proves nothing — `0035`'s P7 lesson, applied in the other direction.
  select count(*) into n_place from public.places
   where id = '10000000-0000-4000-8000-000000000036';
  select count(*) into n_items from public.collection_items
   where collection_id = 'c1000000-0000-4000-8000-000000000036';
  if n_place <> 1 or n_items <> 1 then
    raise exception 'FAIL T5: the control did not reproduce — the peer reads % place row(s) and % collection item(s), so the shared-collection fixture is not real and the zero below is meaningless',
      n_place, n_items;
  end if;

  select count(*) into n_saves from public.saved_places
   where id = '1a000000-0000-4000-8000-000000000036';
  if n_saves <> 0 then
    raise exception 'FAIL T5: a collection peer read % row(s) of the owner''s saved_places. `saved_places` IS a fifth §3.4 table and 0036''s ruling 1 is wrong', n_saves;
  end if;

  -- The whole-table form too, because a policy is row-blind and a peer who asks for everything is
  -- the shape that finds a stray arm. This must return only the peer's OWN saves — they have none.
  select count(*) into n_all from public.saved_places;
  if n_all <> 0 then
    raise exception 'FAIL T5: `select * from saved_places` returned % rows to a user with no saves', n_all;
  end if;
  raise notice 'PASS T5 the peer reads the SHARED PLACE and the collection item, and ZERO of the owner''s saves — the table-level SELECT grant reaches nothing cross-user';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T6 / T7. THE EXTRACTOR MEETS A USER WHO HAS ALREADY SPOKEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The state right now: ua deleted every tag (T3), `tags_confirmed_at` is set, `tags_extracted`
-- still holds the first import's three words. A SECOND TikTok now mentions the same venue — the
-- designed case `0007`'s header calls acceptance I3/I4 and `0034` calls "two posts about one
-- restaurant is not an edge case in this product".
reset role;
set local role service_role;
select public.apply_saved_place_extraction(
  '1a000000-0000-4000-8000-000000000036'::uuid,
  'a0000000-0000-4000-8000-000000000036'::uuid,
  array['brunch','coffee','oat milk'], 'The best oat milk in the old north.', array['oat flat white']);
reset role;

do $$
declare v_t text[]; v_e text[]; v_w text;
begin
  select tags, tags_extracted, why_go into v_t, v_e, v_w
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  -- T7. THE ASSERTION THIS MIGRATION WOULD HAVE ARMED A DEFECT WITHOUT.
  if v_t is not null then
    raise exception 'FAIL T7: a second import refilled the tags the user deleted with %. The model undid a human', v_t;
  end if;
  -- T6. First non-null writer wins on the proposal too: this is what the model said when the place
  -- entered the map, and a later unrelated post does not rewrite that history.
  if v_e is distinct from array['coffee','בית קפה','hidden gem'] then
    raise exception 'FAIL T6: the second import rewrote tags_extracted to %', v_e;
  end if;
  -- And the columns 0036 did NOT touch behave exactly as 0019 says. `why_go` was already written
  -- by the FIRST import, so first-non-null-writer-wins keeps that sentence and the second import's
  -- is discarded — untouched by 0036, which scopes its confirmation gate to `tags` and nothing
  -- else. If this ever reads the second sentence, 0036 has widened past its own ruling.
  if v_w is distinct from 'A tiny place.' then
    raise exception 'FAIL T6: why_go is %, expected the FIRST import''s sentence under 0019''s unchanged first-non-null-writer rule', quote_nullable(v_w);
  end if;
  raise notice 'PASS T6/T7 a confirmed vocabulary — including a deliberately empty one — survives a later import, and the proposal is unchanged';
end $$;

-- The other half of T7: an UNCONFIRMED save still gets filled, so the gate is a gate and not a
-- wall. `sb` is ub's save, never touched by a user.
set local role service_role;
select public.apply_saved_place_extraction(
  '1b000000-0000-4000-8000-000000000036'::uuid,
  'b0000000-0000-4000-8000-000000000036'::uuid,
  array['bakery','morning'], null, null);
reset role;
do $$
declare v_t text[]; v_c timestamptz;
begin
  select tags, tags_confirmed_at into v_t, v_c
    from public.saved_places where id = '1b000000-0000-4000-8000-000000000036';
  if v_t is distinct from array['bakery','morning'] then
    raise exception 'FAIL T7b: an unconfirmed save did not receive the extraction (got %)', v_t;
  end if;
  if v_c is not null then
    raise exception 'FAIL T7b: the extractor stamped a confirmation (%)', v_c;
  end if;
  raise notice 'PASS T7b the gate is a gate: an unconfirmed save still receives model tags, unstamped';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T8. RE-POINT — the model's words go, the user's stay
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ub's save is UNCONFIRMED and carries model tags. Re-pointing it to another place must take both
-- `tags` and `tags_extracted` with it: they describe a venue this row no longer names, which is the
-- III.3(n) exposure `0033` closed.
set local role service_role;
select public.repoint_saved_place(
  'b0000000-0000-4000-8000-000000000036'::uuid,
  '1b000000-0000-4000-8000-000000000036'::uuid,
  '20000000-0000-4000-8000-000000000036'::uuid);
reset role;
do $$
declare v_t text[]; v_e text[]; v_p uuid;
begin
  select tags, tags_extracted, place_id into v_t, v_e, v_p
    from public.saved_places where id = '1b000000-0000-4000-8000-000000000036';
  if v_p is distinct from '20000000-0000-4000-8000-000000000036'::uuid then
    raise exception 'FAIL T8a: the re-point did not move place_id (%)', v_p;
  end if;
  if v_t is not null or v_e is not null then
    raise exception 'FAIL T8a: an UNCONFIRMED re-point left tags=% tags_extracted=% describing the old venue', v_t, v_e;
  end if;
  raise notice 'PASS T8a an unconfirmed re-point clears both the tags and the proposal';
end $$;

-- ua's save is CONFIRMED. Give it words first, then re-point it. The user's vocabulary survives —
-- *date night* is a fact about their plans, not about which POI the row names — while the model's
-- proposal goes, because that WAS about the wrong venue.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;
select public.set_saved_place_tags(
  '1a000000-0000-4000-8000-000000000036'::uuid, array['date night','with maya']);
reset role;

set local role service_role;
select public.repoint_saved_place(
  'a0000000-0000-4000-8000-000000000036'::uuid,
  '1a000000-0000-4000-8000-000000000036'::uuid,
  '20000000-0000-4000-8000-000000000036'::uuid);
reset role;
do $$
declare v_t text[]; v_e text[]; v_c timestamptz; v_p uuid;
begin
  select tags, tags_extracted, tags_confirmed_at, place_id into v_t, v_e, v_c, v_p
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  if v_p is distinct from '20000000-0000-4000-8000-000000000036'::uuid then
    raise exception 'FAIL T8b: the re-point did not move place_id (%)', v_p;
  end if;
  if v_t is distinct from array['date night','with maya'] then
    raise exception 'FAIL T8b: a re-point destroyed the user''s own vocabulary (now %)', v_t;
  end if;
  if v_c is null then
    raise exception 'FAIL T8b: the tags survived but the record of who chose them did not';
  end if;
  if v_e is not null then
    raise exception 'FAIL T8b: the model''s proposal about the OLD venue survived the re-point (%)', v_e;
  end if;
  raise notice 'PASS T8b a confirmed re-point keeps the user''s words and drops the model''s';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T9. OVER-COUNT IS REFUSED, NOT TRUNCATED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_sqlstate text; v_t text[];
begin
  begin
    perform public.set_saved_place_tags(
      '1a000000-0000-4000-8000-000000000036'::uuid,
      array['a1','b2','c3','d4','e5','f6','g7','h8','i9']);
    raise exception 'FAIL T9: nine tags were accepted';
  exception
    when check_violation then null;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL T9: expected 23514, got %', v_sqlstate;
  end;
  -- And the row is unchanged: the refusal is not a partial write. A tag silently dropped is the
  -- product deciding which of the user's words matter.
  select tags into v_t from public.saved_places where id = '1a000000-0000-4000-8000-000000000036';
  if v_t is distinct from array['date night','with maya'] then
    raise exception 'FAIL T9: the refused call still changed the row to %', v_t;
  end if;
  raise notice 'PASS T9 nine tags are refused with 23514 and nothing is truncated';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T10. `anon` AND `PUBLIC` HOLD NOTHING
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;
do $$
declare a_exec boolean; p_exec boolean; a_read boolean;
begin
  a_exec := has_function_privilege('anon', 'public.set_saved_place_tags(uuid, text[])', 'EXECUTE');
  p_exec := has_function_privilege('public', 'public.set_saved_place_tags(uuid, text[])', 'EXECUTE');
  a_read := has_column_privilege('anon','public.saved_places','tags_extracted','SELECT');
  if a_exec or p_exec then
    raise exception 'FAIL T10: EXECUTE reachable — anon=%, PUBLIC=%. This is 0017''s defect, and 0018 is the shape that closes it', a_exec, p_exec;
  end if;
  if a_read then
    raise exception 'FAIL T10: anon can read tags_extracted';
  end if;
  raise notice 'PASS T10 anon and PUBLIC hold no EXECUTE on the new function and no read on the new columns';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- T11. FAILURE-FIRST — the defect T7 exists to catch, reproduced
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A green T7 proves nothing unless the assertion can go red. `0019`'s body is restored below —
-- byte-identical to the live `pg_proc.prosrc` at base commit `d28362f`, minus 0036's two changes —
-- and the same second-import call is repeated against a save whose owner deleted every tag. If the
-- gate were absent, the model would refill them. It does. So T7 is load-bearing.
--
-- READ THE WARNING AT THE TOP OF THIS FILE BEFORE MOVING THIS SECTION.
insert into public.saved_places (id, user_id, place_id, origin)
values ('1c000000-0000-4000-8000-000000000036', 'c0000000-0000-4000-8000-000000000036',
        '10000000-0000-4000-8000-000000000036', 'manual');
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
set local role authenticated;
select public.set_saved_place_tags('1c000000-0000-4000-8000-000000000036'::uuid, '{}'::text[]);
reset role;

create or replace function public.apply_saved_place_extraction(
  p_saved_place_id uuid, p_user_id uuid, p_tags text[] default null,
  p_why_go text default null, p_dishes text[] default null)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $probe$
begin
  if p_user_id is null then
    raise exception 'apply_saved_place_extraction requires a user id' using errcode = '22004';
  end if;
  update saved_places sp
     set tags   = coalesce(sp.tags,   public.normalize_tag_list(p_tags)),
         why_go = coalesce(sp.why_go, public.normalize_sentence(p_why_go)),
         dishes = coalesce(sp.dishes, public.normalize_tag_list(p_dishes))
   where sp.id = p_saved_place_id
     and sp.user_id = p_user_id;
end;
$probe$;

set local role service_role;
select public.apply_saved_place_extraction(
  '1c000000-0000-4000-8000-000000000036'::uuid,
  'c0000000-0000-4000-8000-000000000036'::uuid,
  array['brunch','coffee'], null, null);
reset role;

do $$
declare v_t text[]; v_c timestamptz;
begin
  select tags, tags_confirmed_at into v_t, v_c
    from public.saved_places where id = '1c000000-0000-4000-8000-000000000036';
  if v_c is null then
    raise exception 'FAIL T11: the probe fixture was never confirmed, so this control tests nothing';
  end if;
  if v_t is distinct from array['brunch','coffee'] then
    raise exception 'FAIL T11: the control did not reproduce — 0019''s body left tags as %. Either the pre-0036 behaviour is not what 0036 claims it was, or T7 is not testing the thing it says it tests',
      quote_nullable(v_t::text);
  end if;
  raise notice 'PASS T11 control reproduced: WITHOUT 0036''s gate, a second import refills the tags a user deleted (%). That is the defect T7 catches', v_t;
end $$;

reset role;

rollback;
