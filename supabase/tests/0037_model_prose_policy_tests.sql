-- 0037_model_prose_policy_tests.sql — the model's sentence is labelled, removable, and cannot be
-- put back; the dish list becomes the user's without falsifying what the post said.
--
-- Task `r5-whygo`. The proof for
-- `supabase/migrations/0037_model_prose_is_labelled_and_removable.sql`. Same posture as `0024`,
-- `0031`, `0034`, `0035` and `0036`: this file creates fixture users in `auth.users`, so it is a
-- TEST and never a migration, and everything happens inside one transaction that is rolled back.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0037_model_prose_policy_tests.sql
-- On a machine with no host `psql` (this project's standing condition — `which psql` returns
-- nothing here, re-checked 2026-09-01), the same thing through the container:
--   docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/0037_model_prose_policy_tests.sql
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
-- `package.json` is outside this lane's write scope, so `db:test:0037` is not chained into
-- `npm run db:test`; the orchestrator adds it. Until then this file is a gate only when invoked.
--
-- LIKE 0024, 0031, 0034, 0035 AND 0036 AND UNLIKE 0008, THIS FILE COUNTS NOTHING GLOBAL. Every
-- assertion names its own rows by id, so it runs against a database that already has real data in
-- it — no `supabase db reset` first, which matters because the local container is shared.
--
-- SHAPE OF THE FILE
--   R0  the fixture, and the state the migration starts from: a model wrote a sentence and a dish
--       list onto a row and NEITHER STAMP IS SET, because nobody has looked.
--   R1  WHAT A USER STILL CANNOT DO. No UPDATE privilege on any of the five columns, so every
--       direct write is refused at the privilege layer with 42501 — on the user's OWN row.
--   R2  KEEP. The sentence stands and the row now records that a human decided that.
--   R3  REMOVE, AND REMOVE AGAIN. The sentence goes, the stamp stays, the second call is safe.
--   R4  THE DISH LIST BECOMES THE USER'S — normalised, deduped, stamped — and can be emptied.
--   R5  NOT ON SOMEONE ELSE'S SAVE. Both functions: 42501, the victim byte-identical, and the same
--       message for a save that does not exist, so neither is an existence oracle.
--   R6  A COLLECTION PEER READS ZERO ROWS of the owner's `saved_places`, with the control first.
--   R7  THE EXTRACTOR MEETS A USER WHO DECIDED. A second post refills nothing — and the gate is a
--       gate, because an untouched save still receives the extraction.
--   R8  RE-POINT. Ruling 5 under test, both branches, including the one place 0037 deliberately
--       differs from 0036: a CONFIRMED dish list goes with the venue it described.
--   R9  Over-count is refused with 23514, and nothing is truncated.
--   R10 `anon` and PUBLIC hold no EXECUTE on either function and no read on the new columns.
--   R11 THE THIRD TRAP: reviewing a save that has no sentence is refused, and the column stays open.
--   R12 FAILURE-FIRST #1 — the pre-0037 extraction body is restored inside this transaction and the
--       R7 call repeated. The removed sentence comes back AS A DIFFERENT SENTENCE.
--   R13 FAILURE-FIRST #2 — the pre-0037 re-point body is restored and a reviewed save is moved. The
--       stamp survives its own sentence and permanently blocks the new venue's extraction.
--
-- ═══ R12 AND R13 REPLACE LIVE FUNCTIONS INSIDE THE TRANSACTION, AND THAT IS DELIBERATE ════════
-- Both run `create or replace function` with a pre-0037 body to demonstrate the defect 0037 closes.
-- `create or replace` is transactional, so the ROLLBACK restores 0037's versions and nothing
-- survives; but between them and that ROLLBACK a concurrent session calling either function will
-- BLOCK. It is a sub-second window and both are placed last so the window is as short as the file
-- can make it. Do not move them earlier. (`0034`'s N7, `0035`'s P7 and `0036`'s T11 carry the same
-- warning for the same reason.) R13 runs BEFORE R12 because R13 needs 0037's extraction body in
-- place to show what the stale stamp blocks.

\set ua 'a0000000-0000-4000-8000-000000000037'
\set ub 'b0000000-0000-4000-8000-000000000037'
\set uc 'c0000000-0000-4000-8000-000000000037'
\set pl '10000000-0000-4000-8000-000000000037'
\set p2 '20000000-0000-4000-8000-000000000037'
\set p3 '30000000-0000-4000-8000-000000000037'
\set p4 '40000000-0000-4000-8000-000000000037'
\set p5 '50000000-0000-4000-8000-000000000037'
\set sa '1a000000-0000-4000-8000-000000000037'
\set sb '1b000000-0000-4000-8000-000000000037'
\set sc '1c000000-0000-4000-8000-000000000037'
\set sd '1d000000-0000-4000-8000-000000000037'
\set se '1e000000-0000-4000-8000-000000000037'
\set sf '1f000000-0000-4000-8000-000000000037'
\set co 'c1000000-0000-4000-8000-000000000037'
\set ghost 'dead0000-0000-4000-8000-000000000037'

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R0. THE FIXTURE, AND THE ASSERTION THE WHOLE MIGRATION TURNS ON
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ua  the owner of the save under test
-- ub  a stranger
-- uc  a COLLECTION PEER of ua — the only principal in this schema who reads any of ua's data
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ua', 'prose-a@example.test', '{}'::jsonb),
  (:'ub', 'prose-b@example.test', '{}'::jsonb),
  (:'uc', 'prose-c@example.test', '{}'::jsonb);

insert into public.places (id, name, lat, lng, locality) values
  (:'pl', 'Fixture Cafe 0037',    32.0700, 34.7700, 'Tel Aviv'),
  (:'p2', 'Fixture Bakery 0037',  32.0710, 34.7710, 'Tel Aviv'),
  (:'p3', 'Fixture Bar 0037',     32.0720, 34.7720, 'Tel Aviv'),
  (:'p4', 'Fixture Kiosk 0037',   32.0730, 34.7730, 'Tel Aviv'),
  (:'p5', 'Fixture Deli 0037',    32.0740, 34.7740, 'Tel Aviv');

-- `origin = 'manual'`, so `saved_places_provenance_required` has nothing to assert and the fixture
-- needs no `sources` / `saved_place_sources` rows. The machinery under test hangs off the columns,
-- not off provenance.
insert into public.saved_places (id, user_id, place_id, origin) values
  (:'sa', :'ua', :'pl', 'manual'),
  (:'sb', :'ub', :'pl', 'manual'),
  (:'sd', :'ua', :'p2', 'manual'),
  (:'se', :'ua', :'p3', 'manual'),
  (:'sf', :'ua', :'p4', 'manual');

-- ua and uc share one collection. Fixture for R6, the strongest available adversary: `security.md`
-- §3.4 names four tables on which a collection peer reads another user's row, and the question is
-- whether the five columns 0019 and 0037 put on `saved_places` are reachable that way.
insert into public.collections (id, owner_id, name) values (:'co', :'ua', 'Fixture 0037');
insert into public.collection_members (collection_id, user_id, role) values (:'co', :'uc', 'editor')
on conflict do nothing;
insert into public.collection_items (collection_id, place_id, added_by) values (:'co', :'pl', :'ua');

-- The extractor's first pass, exactly as the import path performs it: `service_role`, through the
-- RPC, with real model output — the superlative is verbatim from `saved_places` row
-- 61ee9bd3-2eba-4b11-bb62-7f54c8668184 on this database. Nothing below writes these columns by hand.
set local role service_role;
select public.apply_saved_place_extraction(
  :'sa', :'ua',
  array['Coffee','hidden gem'],
  'The best oat milk in the old north.',
  array['Oat Flat White','  oat flat white ','cortado']);
reset role;

do $$
declare v_w text; v_wr timestamptz; v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select why_go, why_go_reviewed_at, dishes, dishes_extracted, dishes_confirmed_at
    into v_w, v_wr, v_d, v_de, v_dc
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';

  if v_w is distinct from 'The best oat milk in the old north.' then
    raise exception 'FAIL R0: why_go is %, expected the model sentence verbatim (normalize_sentence does not lowercase)', quote_nullable(v_w);
  end if;
  if v_d is distinct from array['oat flat white','cortado'] then
    raise exception 'FAIL R0: dishes is %, expected the normalised, deduped, first-seen-order two', v_d;
  end if;
  if v_de is distinct from v_d then
    raise exception 'FAIL R0: dishes_extracted is % but dishes is % — 0037 change 2 did not record the proposal', v_de, v_d;
  end if;

  -- THE ASSERTION THE WHOLE MIGRATION TURNS ON. A model wrote a superlative and a dish list onto
  -- this row and the user has not seen either. Both stamps must be NULL, because a timestamp here
  -- would be the schema manufacturing a decision nobody made.
  if v_wr is not null or v_dc is not null then
    raise exception 'FAIL R0: the extractor stamped why_go_reviewed_at=% dishes_confirmed_at=% — model output must never look reviewed', v_wr, v_dc;
  end if;
  raise notice 'PASS R0 the extractor writes prose and a dish list, records its own dish proposal, and DECIDES NOTHING';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R1. WHAT A USER STILL CANNOT DO — the privilege layer, not the policy layer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare r record; bad text := '';
begin
  for r in
    select c.col,
           has_column_privilege('authenticated','public.saved_places',c.col,'SELECT') as sel,
           has_column_privilege('authenticated','public.saved_places',c.col,'UPDATE') as upd
      from (values ('why_go'),('why_go_reviewed_at'),('dishes'),('dishes_extracted'),
                   ('dishes_confirmed_at')) as c(col)
  loop
    -- READ is TRUE and that is stated rather than inherited: `saved_places` carries a TABLE-level
    -- SELECT grant (`authenticated=rd`), so every column on it is readable by whoever its policies
    -- admit. The owner MUST be able to see what the model proposed — a proposal the user cannot see
    -- is the thing this work exists to stop — and R6 proves the policies admit nobody else.
    if not r.sel then bad := bad || format(' %s:NOT-READABLE', r.col); end if;
    if r.upd then bad := bad || format(' %s:WRITABLE', r.col); end if;
  end loop;
  if bad <> '' then
    raise exception 'FAIL R1a: column privileges wrong —%. 0037 grants no UPDATE on any of the five; the two functions are the only write paths', bad;
  end if;
  raise notice 'PASS R1a all five columns readable by their owner, none of them writable by any browser role';
end $$;

select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;

-- The five writes the product would have made if 0037 had chosen column grants. All five must fail
-- at the privilege layer — 42501, BEFORE any policy is consulted — on the user's OWN row. The
-- second is the one ruling 1 is about: authorship into `why_go` is INEXPRESSIBLE, not unimplemented.
do $$
declare r record; v_sqlstate text; ok boolean;
begin
  for r in
    select * from (values
      ('why_go',              $q$update public.saved_places set why_go = 'my own sentence' where id = '1a000000-0000-4000-8000-000000000037'$q$),
      ('why_go_reviewed_at',  $q$update public.saved_places set why_go_reviewed_at = now() where id = '1a000000-0000-4000-8000-000000000037'$q$),
      ('dishes',              $q$update public.saved_places set dishes = array['mine'] where id = '1a000000-0000-4000-8000-000000000037'$q$),
      ('dishes_extracted',    $q$update public.saved_places set dishes_extracted = array['rewritten'] where id = '1a000000-0000-4000-8000-000000000037'$q$),
      ('dishes_confirmed_at', $q$update public.saved_places set dishes_confirmed_at = now() where id = '1a000000-0000-4000-8000-000000000037'$q$)
    ) as t(col, stmt)
  loop
    ok := false;
    begin
      execute r.stmt;
    exception
      when insufficient_privilege then ok := true;
      when others then
        get stacked diagnostics v_sqlstate = returned_sqlstate;
        raise exception 'FAIL R1b: UPDATE of % expected 42501, got %', r.col, v_sqlstate;
    end;
    if not ok then
      raise exception 'FAIL R1b: a direct UPDATE of % on the user''s OWN row SUCCEEDED', r.col;
    end if;
  end loop;
  raise notice 'PASS R1b all five direct UPDATEs are refused with 42501 — including authorship into why_go, which is inexpressible rather than unimplemented';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R2. KEEP — the sentence stands, and the row now says a human decided that
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select public.review_saved_place_why_go('1a000000-0000-4000-8000-000000000037'::uuid, true);
do $$
declare v_w text; v_wr timestamptz;
begin
  select why_go, why_go_reviewed_at into v_w, v_wr
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if v_w is distinct from 'The best oat milk in the old north.' then
    raise exception 'FAIL R2: keeping the sentence changed it to %', quote_nullable(v_w);
  end if;
  if v_wr is null then
    raise exception 'FAIL R2: the sentence was kept but nothing records that a human decided so — the two states 0037 exists to separate are still one';
  end if;
  raise notice 'PASS R2 keep leaves the sentence and stamps the decision, in one statement';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R3. REMOVE — and remove again, because a double-tap must be safe
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select public.review_saved_place_why_go('1a000000-0000-4000-8000-000000000037'::uuid, false);
do $$
declare v_w text; v_wr timestamptz; v_wr2 timestamptz;
begin
  select why_go, why_go_reviewed_at into v_w, v_wr
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if v_w is not null then
    raise exception 'FAIL R3a: the user removed the sentence and it is still %', quote_literal(v_w);
  end if;
  if v_wr is null then
    raise exception 'FAIL R3a: the sentence is gone and nothing records that a human removed it — which is exactly the state a later import would refill';
  end if;

  -- Idempotent. `repoint_saved_place` (0032) made the same resolution for a confirm of a pin that
  -- is already right: a control the user can tap twice must not raise.
  perform public.review_saved_place_why_go('1a000000-0000-4000-8000-000000000037'::uuid, false);
  select why_go_reviewed_at into v_wr2
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if v_wr2 is null then
    raise exception 'FAIL R3b: the second removal cleared the stamp';
  end if;
  raise notice 'PASS R3 removal is recorded as a decision, and removing again is safe';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R4. THE DISH LIST BECOMES THE USER'S — normalised, stamped, and emptiable
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select public.set_saved_place_dishes('1a000000-0000-4000-8000-000000000037'::uuid,
                                     array['Cortado','  cortado ','Sourdough Loaf','...']);
do $$
declare v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select dishes, dishes_extracted, dishes_confirmed_at into v_d, v_de, v_dc
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  -- Normalised the same way the model's list is — lowercased, whitespace collapsed, deduped in
  -- first-seen order, the information-free `...` dropped — so one item typed once cannot become two.
  if v_d is distinct from array['cortado','sourdough loaf'] then
    raise exception 'FAIL R4a: the user''s list stored as %, expected the normalised deduped two', v_d;
  end if;
  if v_dc is null then
    raise exception 'FAIL R4a: the list changed and nothing records the user choosing it';
  end if;
  -- PROVENANCE SURVIVES THE EDIT. This is 0033's principle: a change must not falsify what a
  -- creator said, and the post's author is a creator here.
  if v_de is distinct from array['oat flat white','cortado'] then
    raise exception 'FAIL R4a: editing the list rewrote what the POST named, to %', v_de;
  end if;
  raise notice 'PASS R4a the user''s list is theirs, normalised and stamped, and the post''s list is untouched';
end $$;

select public.set_saved_place_dishes('1a000000-0000-4000-8000-000000000037'::uuid, '{}'::text[]);
do $$
declare v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select dishes, dishes_extracted, dishes_confirmed_at into v_d, v_de, v_dc
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if v_d is not null then
    raise exception 'FAIL R4b: an empty array did not clear the list (got %)', v_d;
  end if;
  if v_dc is null then
    raise exception 'FAIL R4b: clearing the list left no stamp — the next import would refill it';
  end if;
  if v_de is distinct from array['oat flat white','cortado'] then
    raise exception 'FAIL R4b: clearing the list also destroyed the post''s list (%)', v_de;
  end if;
  raise notice 'PASS R4b an empty array removes every item AND still stamps — a deliberate emptying is an assertion';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R5. NOT ON SOMEONE ELSE'S SAVE — both functions, and neither is an existence oracle
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_msg_other text; v_msg_ghost text; v_sqlstate text;
begin
  -- `review_saved_place_why_go` against a save that belongs to ua.
  begin
    perform public.review_saved_place_why_go('1a000000-0000-4000-8000-000000000037'::uuid, false);
    raise exception 'FAIL R5a: a stranger REMOVED another user''s sentence';
  exception
    when insufficient_privilege then get stacked diagnostics v_msg_other = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL R5a: expected 42501, got %', v_sqlstate;
  end;

  -- A save id that does not exist at all. The message must be IDENTICAL, or the function answers
  -- "is this uuid a real save?" for any uuid — a membership oracle over other people's libraries.
  begin
    perform public.review_saved_place_why_go('dead0000-0000-4000-8000-000000000037'::uuid, false);
    raise exception 'FAIL R5b: reviewing a non-existent save SUCCEEDED';
  exception
    when insufficient_privilege then get stacked diagnostics v_msg_ghost = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL R5b: expected 42501, got %', v_sqlstate;
  end;

  if v_msg_other is distinct from v_msg_ghost then
    raise exception 'FAIL R5b: EXISTENCE ORACLE in review_saved_place_why_go. "not yours" says %, "no such row" says %',
      quote_literal(v_msg_other), quote_literal(v_msg_ghost);
  end if;

  -- The same pair for the dish setter.
  begin
    perform public.set_saved_place_dishes('1a000000-0000-4000-8000-000000000037'::uuid, array['vandalised']);
    raise exception 'FAIL R5c: a stranger REWROTE another user''s dish list';
  exception
    when insufficient_privilege then get stacked diagnostics v_msg_other = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL R5c: expected 42501, got %', v_sqlstate;
  end;
  begin
    perform public.set_saved_place_dishes('dead0000-0000-4000-8000-000000000037'::uuid, array['vandalised']);
    raise exception 'FAIL R5d: writing a dish list onto a non-existent save SUCCEEDED';
  exception
    when insufficient_privilege then get stacked diagnostics v_msg_ghost = message_text;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL R5d: expected 42501, got %', v_sqlstate;
  end;
  if v_msg_other is distinct from v_msg_ghost then
    raise exception 'FAIL R5d: EXISTENCE ORACLE in set_saved_place_dishes. "not yours" says %, "no such row" says %',
      quote_literal(v_msg_other), quote_literal(v_msg_ghost);
  end if;
  raise notice 'PASS R5 both functions refuse a stranger with 42501, and neither can tell a real save from a made-up one';
end $$;

-- The victim's row is untouched. `security definer` means BYPASSRLS inside both functions, so this
-- is the assertion that the `auth.uid()` guard in each WHERE is real and not decorative.
reset role;
do $$
declare v_w text; v_wr timestamptz; v_d text[]; v_de text[];
begin
  select why_go, why_go_reviewed_at, dishes, dishes_extracted into v_w, v_wr, v_d, v_de
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if v_w is not null or v_d is not null then
    raise exception 'FAIL R5e: the stranger''s calls changed the victim''s row (why_go=%, dishes=%)', quote_nullable(v_w), v_d;
  end if;
  if v_de is distinct from array['oat flat white','cortado'] then
    raise exception 'FAIL R5e: the stranger''s calls changed the victim''s dishes_extracted to %', v_de;
  end if;
  raise notice 'PASS R5e the victim''s row is byte-identical after all four attempts';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R6. A COLLECTION PEER READS ZERO — with the control first
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `saved_places` carries a TABLE-level SELECT grant, so if any policy on it returned another user's
-- row, all five of these columns — and every column added after them — would be disclosed with no
-- decision taken by anybody. `0036`'s T5 established this for `tags`; it is re-run here rather than
-- trusted, because the question is about the TABLE and a policy could have changed since.
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n_place integer; n_items integer; n_row integer; n_all integer;
begin
  -- THE CONTROL FIRST. If the peer cannot read the shared place and the collection item, the
  -- fixture is broken and the zero below proves nothing.
  select count(*) into n_place from public.places where id = '10000000-0000-4000-8000-000000000037';
  select count(*) into n_items from public.collection_items
   where collection_id = 'c1000000-0000-4000-8000-000000000037';
  if n_place <> 1 or n_items <> 1 then
    raise exception 'FAIL R6: the control did not reproduce — the peer reads % place row(s) and % collection item(s), so the shared-collection fixture is not real and the zero below is meaningless',
      n_place, n_items;
  end if;

  select count(*) into n_row from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  if n_row <> 0 then
    raise exception 'FAIL R6: a collection peer read % row(s) of the owner''s saved_places — `saved_places` IS a fifth security.md §3.4 table and 0037''s columns are cross-user readable', n_row;
  end if;

  -- The whole-table form too, because a policy is row-blind and a peer who asks for everything is
  -- the shape that finds a stray arm. uc owns no save yet, so this must be zero.
  select count(*) into n_all from public.saved_places;
  if n_all <> 0 then
    raise exception 'FAIL R6: `select * from saved_places` returned % rows to a user with no saves', n_all;
  end if;
  raise notice 'PASS R6 the peer reads the SHARED PLACE and the collection item, and ZERO of the owner''s saves';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R7. THE EXTRACTOR MEETS A USER WHO DECIDED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The state of `sa` right now: the user REMOVED the sentence (R3) and EMPTIED the dish list (R4b),
-- both stamped, and `dishes_extracted` still holds the first post's items. A SECOND TikTok now
-- mentions the same venue with DIFFERENT content — the designed case `0007` calls acceptance I3/I4.
reset role;
set local role service_role;
select public.apply_saved_place_extraction(
  '1a000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  array['brunch'],
  'The sourdough is worth the queue.',
  array['sourdough loaf','babka']);
reset role;

do $$
declare v_w text; v_d text[]; v_de text[];
begin
  select why_go, dishes, dishes_extracted into v_w, v_d, v_de
    from public.saved_places where id = '1a000000-0000-4000-8000-000000000037';
  -- THE TWO ASSERTIONS THIS MIGRATION WOULD HAVE ARMED A DEFECT WITHOUT. Note what the failure
  -- would look like: not the old sentence returning, but a NEW one the user has also never seen.
  if v_w is not null then
    raise exception 'FAIL R7a: a second import put a sentence back onto a save whose owner removed one — and a DIFFERENT sentence at that: %', quote_literal(v_w);
  end if;
  if v_d is not null then
    raise exception 'FAIL R7b: a second import refilled the dish list the user emptied, with %', v_d;
  end if;
  -- First non-null writer wins on the proposal too: this is what the FIRST post named, and a later
  -- unrelated post does not rewrite that history.
  if v_de is distinct from array['oat flat white','cortado'] then
    raise exception 'FAIL R7c: the second import rewrote dishes_extracted to %', v_de;
  end if;
  raise notice 'PASS R7a/b/c a removed sentence and an emptied list both survive a later import, and the first post''s proposal is unchanged';
end $$;

-- The other half: the gate is a GATE, not a wall. `sb` is ub's save and no user has touched it, so
-- the extraction must land in full — including the proposal column.
set local role service_role;
select public.apply_saved_place_extraction(
  '1b000000-0000-4000-8000-000000000037'::uuid,
  'b0000000-0000-4000-8000-000000000037'::uuid,
  array['bakery'], 'A tiny place, easy to walk straight past.', array['cortado']);
reset role;
do $$
declare v_w text; v_wr timestamptz; v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select why_go, why_go_reviewed_at, dishes, dishes_extracted, dishes_confirmed_at
    into v_w, v_wr, v_d, v_de, v_dc
    from public.saved_places where id = '1b000000-0000-4000-8000-000000000037';
  if v_w is distinct from 'A tiny place, easy to walk straight past.' or v_d is distinct from array['cortado'] then
    raise exception 'FAIL R7d: an untouched save did not receive the extraction (why_go=%, dishes=%)', quote_nullable(v_w), v_d;
  end if;
  if v_de is distinct from array['cortado'] then
    raise exception 'FAIL R7d: the proposal column was not written (%)', v_de;
  end if;
  if v_wr is not null or v_dc is not null then
    raise exception 'FAIL R7d: the extractor stamped a decision (why_go_reviewed_at=%, dishes_confirmed_at=%)', v_wr, v_dc;
  end if;
  raise notice 'PASS R7d the gate is a gate: an untouched save still receives the model''s sentence and list, undecided';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R8. RE-POINT — ruling 5, both branches
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R8a: `sb` is UNDECIDED and carries model prose about `pl`. Re-pointing it to `p2` must take all
-- five columns with it: they describe a venue this row no longer names — the III.3(n) exposure
-- `0033` closed.
set local role service_role;
select public.repoint_saved_place(
  'b0000000-0000-4000-8000-000000000037'::uuid,
  '1b000000-0000-4000-8000-000000000037'::uuid,
  '20000000-0000-4000-8000-000000000037'::uuid);
reset role;
do $$
declare v_p uuid; v_w text; v_wr timestamptz; v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select place_id, why_go, why_go_reviewed_at, dishes, dishes_extracted, dishes_confirmed_at
    into v_p, v_w, v_wr, v_d, v_de, v_dc
    from public.saved_places where id = '1b000000-0000-4000-8000-000000000037';
  if v_p is distinct from '20000000-0000-4000-8000-000000000037'::uuid then
    raise exception 'FAIL R8a: the re-point did not move place_id (%)', v_p;
  end if;
  if v_w is not null or v_d is not null or v_de is not null then
    raise exception 'FAIL R8a: an undecided re-point left why_go=% dishes=% dishes_extracted=% describing the OLD venue', quote_nullable(v_w), v_d, v_de;
  end if;
  if v_wr is not null or v_dc is not null then
    raise exception 'FAIL R8a: a stamp survived the re-point (why_go_reviewed_at=%, dishes_confirmed_at=%) and would now block the new venue''s extraction forever', v_wr, v_dc;
  end if;
  raise notice 'PASS R8a an undecided re-point clears all five columns, stamps included';
end $$;

-- R8b: the decided branch, and THE ONE PLACE 0037 DELIBERATELY DIFFERS FROM 0036. uc gets a save
-- with everything asserted by the user — confirmed tags, a confirmed dish list, a kept sentence —
-- and is then moved to a different venue. `tags` must SURVIVE (0036, untouched) because `date
-- night` is a fact about the user's plans; `dishes` must GO even though the user confirmed it,
-- because `cortado` is a fact about a MENU and attached to the new row it is not stale, it is false.
insert into public.saved_places (id, user_id, place_id, origin)
values ('1c000000-0000-4000-8000-000000000037', 'c0000000-0000-4000-8000-000000000037',
        '10000000-0000-4000-8000-000000000037', 'manual');
set local role service_role;
select public.apply_saved_place_extraction(
  '1c000000-0000-4000-8000-000000000037'::uuid,
  'c0000000-0000-4000-8000-000000000037'::uuid,
  array['coffee'], 'A rooftop bar looking out over the old port.', array['cortado']);
reset role;
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
select public.set_saved_place_tags('1c000000-0000-4000-8000-000000000037'::uuid, array['date night','with maya']);
select public.set_saved_place_dishes('1c000000-0000-4000-8000-000000000037'::uuid, array['negroni']);
select public.review_saved_place_why_go('1c000000-0000-4000-8000-000000000037'::uuid, true);
reset role;

set local role service_role;
select public.repoint_saved_place(
  'c0000000-0000-4000-8000-000000000037'::uuid,
  '1c000000-0000-4000-8000-000000000037'::uuid,
  '30000000-0000-4000-8000-000000000037'::uuid);
reset role;
do $$
declare v_p uuid; v_t text[]; v_tc timestamptz; v_w text; v_wr timestamptz;
        v_d text[]; v_de text[]; v_dc timestamptz;
begin
  select place_id, tags, tags_confirmed_at, why_go, why_go_reviewed_at,
         dishes, dishes_extracted, dishes_confirmed_at
    into v_p, v_t, v_tc, v_w, v_wr, v_d, v_de, v_dc
    from public.saved_places where id = '1c000000-0000-4000-8000-000000000037';
  if v_p is distinct from '30000000-0000-4000-8000-000000000037'::uuid then
    raise exception 'FAIL R8b: the re-point did not move place_id (%)', v_p;
  end if;
  -- 0036, UNTOUCHED. If this ever fails, 0037 widened past its own ruling.
  if v_t is distinct from array['date night','with maya'] or v_tc is null then
    raise exception 'FAIL R8b: 0037 changed 0036''s behaviour — a confirmed vocabulary did not survive the re-point (tags=%, stamp=%)', v_t, v_tc;
  end if;
  -- 0037, RULING 5. Confirmed or not, the dish list described a menu this row no longer names.
  if v_d is not null or v_de is not null or v_dc is not null then
    raise exception 'FAIL R8b: a CONFIRMED dish list survived the re-point (dishes=%, extracted=%, stamp=%) and now makes a false claim about the new venue', v_d, v_de, v_dc;
  end if;
  if v_w is not null or v_wr is not null then
    raise exception 'FAIL R8b: a KEPT sentence survived the re-point (why_go=%, stamp=%)', quote_nullable(v_w), v_wr;
  end if;
  raise notice 'PASS R8b a re-point keeps the user''s VOCABULARY and drops the user''s DISH LIST — ruling 5, the deliberate divergence from 0036';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R9. OVER-COUNT IS REFUSED, NOT TRUNCATED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
select public.set_saved_place_dishes('1c000000-0000-4000-8000-000000000037'::uuid,
                                     array['tapas','olives','bread']);
do $$
declare v_sqlstate text; v_d text[];
begin
  begin
    perform public.set_saved_place_dishes('1c000000-0000-4000-8000-000000000037'::uuid,
      array['a1','b2','c3','d4','e5','f6','g7','h8','i9']);
    raise exception 'FAIL R9: nine items were accepted';
  exception
    when check_violation then null;
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      raise exception 'FAIL R9: expected 23514, got %', v_sqlstate;
  end;
  -- The refusal is not a partial write. An item silently dropped is the product deciding which of
  -- the user's words matter.
  select dishes into v_d from public.saved_places where id = '1c000000-0000-4000-8000-000000000037';
  if v_d is distinct from array['tapas','olives','bread'] then
    raise exception 'FAIL R9: the refused call still changed the row to %', v_d;
  end if;
  raise notice 'PASS R9 nine items are refused with 23514 and nothing is truncated';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R10. `anon` AND `PUBLIC` HOLD NOTHING
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;
do $$
declare r record; bad text := '';
begin
  for r in
    select f.sig,
           has_function_privilege('anon',   f.sig, 'EXECUTE') as a,
           has_function_privilege('public', f.sig, 'EXECUTE') as p
      from (values ('public.review_saved_place_why_go(uuid, boolean)'),
                   ('public.set_saved_place_dishes(uuid, text[])')) as f(sig)
  loop
    if r.a then bad := bad || format(' anon:%s', r.sig); end if;
    if r.p then bad := bad || format(' PUBLIC:%s', r.sig); end if;
  end loop;
  if bad <> '' then
    raise exception 'FAIL R10a: EXECUTE reachable —%. This is 0017''s defect, and 0018 is the shape that closes it', bad;
  end if;
  if has_column_privilege('anon','public.saved_places','dishes_extracted','SELECT')
     or has_column_privilege('anon','public.saved_places','why_go_reviewed_at','SELECT') then
    raise exception 'FAIL R10b: anon can read the new columns';
  end if;
  raise notice 'PASS R10 anon and PUBLIC hold no EXECUTE on either function and no read on the new columns';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R11. THE THIRD TRAP — reviewing a save that has no sentence must not close the column
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `sd` has never been through an extraction, so `why_go` and `why_go_reviewed_at` are both NULL.
-- If a UI rendered the review control over that empty column and the call stamped, ruling 3's gate
-- would silently deny that save a sentence FOREVER. The call is refused instead.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_sqlstate text; v_wr timestamptz;
begin
  begin
    perform public.review_saved_place_why_go('1d000000-0000-4000-8000-000000000037'::uuid, true);
    raise exception 'FAIL R11a: reviewing a save with no sentence SUCCEEDED, and that stamp would block the column forever';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate <> '22004' then
        raise exception 'FAIL R11a: expected 22004, got %', v_sqlstate;
      end if;
  end;
  select why_go_reviewed_at into v_wr from public.saved_places where id = '1d000000-0000-4000-8000-000000000037';
  if v_wr is not null then
    raise exception 'FAIL R11a: the refused call stamped anyway (%)', v_wr;
  end if;
  raise notice 'PASS R11a a save with no sentence cannot be reviewed, and nothing is stamped';
end $$;

-- And the column is still OPEN: a later import writes the sentence normally.
reset role;
set local role service_role;
select public.apply_saved_place_extraction(
  '1d000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  null, 'Come early if you want the window seat on Rothschild.', null);
reset role;
do $$
declare v_w text;
begin
  select why_go into v_w from public.saved_places where id = '1d000000-0000-4000-8000-000000000037';
  if v_w is distinct from 'Come early if you want the window seat on Rothschild.' then
    raise exception 'FAIL R11b: the refused review still closed the column — a later import wrote %', quote_nullable(v_w);
  end if;
  raise notice 'PASS R11b the column is still open after the refusal — the third trap is closed rather than traded for another';
end $$;

-- A NULL boolean is neither decision and is refused rather than coerced.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_sqlstate text;
begin
  begin
    perform public.review_saved_place_why_go('1d000000-0000-4000-8000-000000000037'::uuid, null);
    raise exception 'FAIL R11c: a NULL decision was accepted';
  exception
    when others then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      if v_sqlstate <> '22004' then
        raise exception 'FAIL R11c: expected 22004, got %', v_sqlstate;
      end if;
  end;
  raise notice 'PASS R11c a NULL decision is refused, not coerced into one';
end $$;
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R13. FAILURE-FIRST #2 — the stamp that outlives its own sentence
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A green R8a proves nothing unless the assertion can go red. The PRE-0037 re-point body is
-- restored below — byte-identical to the live `pg_proc.prosrc` at base commit a468fb1, minus 0037's
-- three clears — and a save whose owner KEPT the model sentence is moved to another venue. The old
-- body nulls `why_go` but knows nothing about `why_go_reviewed_at`, so the row is left claiming a
-- human reviewed a sentence that no longer exists; and because ruling 3's gate keys on that stamp,
-- the NEW venue's extraction can then never write a sentence at all. That is the second trap, and
-- it is a defect this migration would have ARMED rather than one it inherited.
--
-- R13 RUNS BEFORE R12 because it needs 0037's extraction body in place to show what the stale stamp
-- blocks. READ THE WARNING AT THE TOP OF THIS FILE BEFORE MOVING EITHER SECTION.
set local role service_role;
select public.apply_saved_place_extraction(
  '1f000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  null, 'A coffee break between the Neve Tzedek boutiques.', null);
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
select public.review_saved_place_why_go('1f000000-0000-4000-8000-000000000037'::uuid, true);
reset role;

CREATE OR REPLACE FUNCTION public.repoint_saved_place(p_user_id uuid, p_saved_place_id uuid, p_place_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $probe$
declare
  v_old    uuid;
  v_target uuid;
begin
  if p_user_id is null or p_saved_place_id is null or p_place_id is null then
    raise exception 'repoint_saved_place requires a user id, a saved place id and a place id'
      using errcode = '22004';
  end if;

  -- Follow any merge chain to the row that is still alive, exactly as `resolve_place` does at both
  -- of its return points (`0014`, `0011` defect 1). A caller working from a stale picture can name
  -- a tombstone; a save pointing at a tombstone is the failure `place_survivor_id` exists to
  -- prevent, and it is silent — the row reads fine and shows the wrong venue forever.
  --
  -- THIS CALL IS ALSO THE FIRST OF THE TWO REFUSALS C4 IS ABOUT. `place_survivor_id` is
  -- `service_role`-only, so a caller that reached this function through a leaked EXECUTE grant is
  -- stopped HERE, before anything is read or written — twice over, in fact: first by the missing
  -- EXECUTE grant on this function, and then, if that were ever granted, by `0012`'s withholding of
  -- `places.merged_into_place_id`, which this function reads as an INVOKER. The third refusal — no
  -- UPDATE grant on `place_id` — sits behind both and is independently sufficient. See the header.
  v_target := public.place_survivor_id(p_place_id);
  if v_target is null then
    raise exception 'repoint_saved_place: place % does not exist', p_place_id using errcode = '23503';
  end if;

  -- Ownership in the WHERE clause, not in a policy. `service_role` carries BYPASSRLS, so FORCE ROW
  -- LEVEL SECURITY does not protect this row from this function and no policy is consulted; the
  -- function must refuse another user's save itself. Same discipline as `start_import` (`0007`),
  -- `apply_saved_place_source_link` (`0016`) and `apply_saved_place_extraction` (`0019`).
  --
  -- "Not found" and "not yours" are one message on purpose: distinguishing them would answer
  -- "does this saved-place id exist?" for any id, which is a membership oracle over other people's
  -- libraries. Same resolution `close_place_mention` (`0031`) makes. Confirmed indistinguishable by
  -- execution, review V2c.
  select sp.place_id into v_old
    from public.saved_places sp
   where sp.id = p_saved_place_id and sp.user_id = p_user_id;
  if not found then
    raise exception 'repoint_saved_place: saved place % does not belong to user %',
      p_saved_place_id, p_user_id using errcode = '42501';
  end if;

  -- Already there. Idempotent rather than an error: the "confirm this is the right venue" tap must
  -- be safe to double-fire, and re-pointing a save at the row it already names is not a mistake the
  -- user needs told about. Same resolution `save_place`'s ON CONFLICT makes for a repeated save.
  --
  -- AND THIS RETURN IS NOW LOAD-BEARING FOR C3, not only for `updated_at`. The place did not change,
  -- so nothing the caption said about it became false, so THE QUOTE MUST SURVIVE. A "clear the
  -- overlay on every call" version of this function would destroy a true attribution every time a
  -- user confirmed a pin that was already right — which is the failure III.3(n) names in its other
  -- half ("falsify **or delete**"). Asserted by R5b.
  if v_old = v_target then
    return v_old;
  end if;

  -- The user already holds a save on the target. `saved_places_user_place_unique` would raise 23505
  -- from the constraint two statements later; this is the readable refusal in front of it, so the
  -- caller gets a sentence it can put on screen rather than a constraint name.
  --
  -- MERGING THE TWO SAVES IS DELIBERATELY NOT DONE. `merge_places` (`0011`) does merge in this
  -- situation — it moves the loser's provenance links and then deletes the loser save — and that is
  -- right for an operator repairing a duplicate `places` row, where the two saves are known to be
  -- one physical place. It is wrong here: this is one user pressing a button, the two saves carry
  -- two different notes, two different been-marks and two different sets of tags, and silently
  -- destroying one of them is precisely the "delete-and-re-add loses the note" failure this
  -- migration exists to end. The user is told, and chooses.
  if exists (select 1 from public.saved_places sp
              where sp.user_id = p_user_id
                and sp.place_id = v_target
                and sp.id <> p_saved_place_id) then
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end if;

  begin
    -- ONE STATEMENT. The move and the clear are the same UPDATE, so there is no window — not one
    -- statement wide, not one transaction wide — in which the row names the new venue and still
    -- carries the old venue's quote. That window is the whole of the III.3(n) exposure, and a
    -- two-statement version would leave it open to any error between them. It is also why C3 says
    -- "inside the same transaction as the re-point" and why this is not a second function the
    -- server action has to remember to call.
    --
    -- 0036: SIX columns now, not four. `tags_extracted` joins the unconditional clear and `tags`
    -- becomes conditional; the two CHECKs 0036 adds are `tag_list_within(null, ...)` and a
    -- normaliser that returns NULL for NULL, so they are satisfied by construction like the rest.
    -- The four columns are set to NULL, which is `0019`'s designated empty for all three enrichment
    -- columns and `0015`'s for `extracted_reason`. `saved_places_normalize_enrichment` (`0019`) fires
    -- BEFORE this update and normalises all three; every normaliser returns NULL for NULL, and
    -- `tag_list_within(null, ...)` is true, so the six CHECK constraints are satisfied by
    -- construction. Verified by execution rather than by reading them.
    update public.saved_places sp
       set place_id          = v_target,
           extracted_reason  = null,
           why_go            = null,
           dishes            = null,
           -- 0036. `tags_extracted` is verbatim model output about a candidate that turned out to
           -- be the wrong venue — exactly `0033`'s case, so it goes unconditionally. `tags` goes
           -- ONLY WHILE UNCONFIRMED: an unconfirmed array is still the model's proposal about the
           -- wrong place, but a CONFIRMED one is the user's own words about their own plans and
           -- survives a correction of which POI this row names, for the same reason `note` has
           -- survived it since `0032`. `tags_confirmed_at` needs no arm — it is already null in
           -- the branch that clears, and must not move in the branch that does not.
           tags_extracted    = null,
           tags              = case when sp.tags_confirmed_at is null then null else sp.tags end
     where sp.id = p_saved_place_id
       and sp.user_id = p_user_id;
  exception when unique_violation then
    -- A concurrent save of the target place won the race between the check above and this UPDATE.
    -- Re-raised with the same readable message rather than the constraint's, so the caller has one
    -- error to handle and not two.
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end;

  -- The place the save pointed at BEFORE the call. Returned rather than a boolean because it is the
  -- only record anywhere that the move happened: there is no audit table in this schema, and the
  -- caller is the last thing that can log which row was vacated — and, per this file's header, the
  -- four caption-derived values it read immediately before calling.
  return v_old;
end;
$probe$;

set local role service_role;
select public.repoint_saved_place(
  'a0000000-0000-4000-8000-000000000037'::uuid,
  '1f000000-0000-4000-8000-000000000037'::uuid,
  '50000000-0000-4000-8000-000000000037'::uuid);
-- 0037's extraction body is still in place here. The new venue gets its own post.
select public.apply_saved_place_extraction(
  '1f000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  null, 'A rooftop bar looking out over the old port.', null);
reset role;
do $$
declare v_w text; v_wr timestamptz;
begin
  select why_go, why_go_reviewed_at into v_w, v_wr
    from public.saved_places where id = '1f000000-0000-4000-8000-000000000037';
  if v_wr is null then
    raise exception 'FAIL R13: the control did not reproduce — the PRE-0037 re-point body cleared why_go_reviewed_at, which it has no statement for. Either the pre-0037 behaviour is not what 0037 claims it was, or R8a is not testing the thing it says it tests';
  end if;
  if v_w is not null then
    raise exception 'FAIL R13: the control did not reproduce — the new venue''s extraction wrote % despite the stale stamp', quote_literal(v_w);
  end if;
  raise notice 'PASS R13 control reproduced: WITHOUT 0037''s clears, a re-pointed save keeps a review stamp for a sentence that no longer exists (%) and the new venue can NEVER be given one. That is the defect R8a catches', v_wr;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- R12. FAILURE-FIRST #1 — the removal that becomes a vacancy for the next model claim
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The PRE-0037 extraction body is restored below — byte-identical to the live `pg_proc.prosrc` at
-- base commit a468fb1, minus 0037's three changes, so it still carries 0036's `tags` gate and
-- isolates 0037's change exactly — and the R7 call is repeated against a save whose owner removed
-- the sentence and emptied the list. If the gates were absent the model would write over both.
-- It does. So R7a and R7b are load-bearing.
--
-- READ THE WARNING AT THE TOP OF THIS FILE BEFORE MOVING THIS SECTION.
set local role service_role;
select public.apply_saved_place_extraction(
  '1e000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  null, 'The best oat milk in the old north.', array['oat flat white']);
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
set local role authenticated;
select public.review_saved_place_why_go('1e000000-0000-4000-8000-000000000037'::uuid, false);
select public.set_saved_place_dishes('1e000000-0000-4000-8000-000000000037'::uuid, '{}'::text[]);
reset role;
do $$
declare v_w text; v_d text[]; v_wr timestamptz; v_dc timestamptz;
begin
  select why_go, dishes, why_go_reviewed_at, dishes_confirmed_at into v_w, v_d, v_wr, v_dc
    from public.saved_places where id = '1e000000-0000-4000-8000-000000000037';
  if v_w is not null or v_d is not null or v_wr is null or v_dc is null then
    raise exception 'FAIL R12: the probe fixture is not in the state the control needs (why_go=%, dishes=%, stamps=%/%)',
      quote_nullable(v_w), v_d, v_wr, v_dc;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.apply_saved_place_extraction(p_saved_place_id uuid, p_user_id uuid, p_tags text[] DEFAULT NULL::text[], p_why_go text DEFAULT NULL::text, p_dishes text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $probe$
begin
  if p_user_id is null then
    raise exception 'apply_saved_place_extraction requires a user id' using errcode = '22004';
  end if;

  -- The ownership predicate is in the WHERE clause on purpose. `service_role` has BYPASSRLS, so no
  -- policy protects this row: the function must refuse to write another user's save itself. Same
  -- discipline as `start_import` (0007) and `apply_saved_place_source_link` (0016). A mismatched
  -- user id updates zero rows and returns quietly — the caller already knows which save it created.
  update saved_places sp
     set
         -- 0036, CHANGE 1. First non-null writer wins, matching the three columns below and every
         -- other column `0019` and `0034` govern. So this records what the model proposed WHEN THE
         -- PLACE ENTERED THE MAP, and a second, unrelated import of the same venue does not rewrite
         -- that history. It is written even when `tags` is not — the proposal is worth keeping
         -- precisely when the user has already chosen something else.
         tags_extracted = coalesce(sp.tags_extracted, public.normalize_tag_list(p_tags)),

         -- 0036, CHANGE 2. A HUMAN'S ASSERTION OUTRANKS A LATER MODEL WRITE, INCLUDING AN
         -- ASSERTION OF ABSENCE. `0034` established this for `note`; the same failure exists here
         -- and is sharper, because `tag_list_within` requires cardinality >= 1, so "the user
         -- deleted every tag" is stored as NULL and the plain coalesce would read that NULL as
         -- "never written" and refill it from the next caption. Once `tags_confirmed_at` is set,
         -- this function may not touch `tags` again, in either direction.
         tags   = case when sp.tags_confirmed_at is not null then sp.tags
                       else coalesce(sp.tags, public.normalize_tag_list(p_tags)) end,

         why_go = coalesce(sp.why_go, public.normalize_sentence(p_why_go)),
         dishes = coalesce(sp.dishes, public.normalize_tag_list(p_dishes))
   where sp.id = p_saved_place_id
     and sp.user_id = p_user_id;
end;
$probe$;

set local role service_role;
select public.apply_saved_place_extraction(
  '1e000000-0000-4000-8000-000000000037'::uuid,
  'a0000000-0000-4000-8000-000000000037'::uuid,
  null, 'The sourdough is worth the queue.', array['sourdough loaf']);
reset role;
do $$
declare v_w text; v_d text[];
begin
  select why_go, dishes into v_w, v_d
    from public.saved_places where id = '1e000000-0000-4000-8000-000000000037';
  if v_w is distinct from 'The sourdough is worth the queue.' or v_d is distinct from array['sourdough loaf'] then
    raise exception 'FAIL R12: the control did not reproduce — the PRE-0037 body left why_go=% dishes=%. Either the pre-0037 behaviour is not what 0037 claims it was, or R7a/R7b are not testing the thing they say they test',
      quote_nullable(v_w), v_d;
  end if;
  raise notice 'PASS R12 control reproduced: WITHOUT 0037''s gates, the removal became a vacancy — the user removed one sentence they never saw and the next post gave them another one they never saw (%), plus a dish list they had emptied (%). That is the defect R7a/R7b catch',
    quote_literal(v_w), v_d;
end $$;

reset role;

rollback;
