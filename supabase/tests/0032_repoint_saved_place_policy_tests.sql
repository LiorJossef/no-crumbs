-- 0032_repoint_saved_place_policy_tests.sql — the authorisation and integrity proof for
-- `repoint_saved_place`: `0032` (the function) and `0033` (the attribution fix).
-- Task `r1-pin`, round 1 finding 2, extended for conditions C3 and C4 of
-- `docs/archive/security-ruling-repoint-place-2026-08-31.md`.
--
-- THE FILE NAME SAYS `0032` AND IT COVERS TWO MIGRATIONS. Kept rather than renamed: `0033` replaces
-- `0032`'s function body under the identical signature, so there is one function under test and one
-- suite for it, and `package.json`'s `db:test:0032` — which is condition C6 and is the
-- orchestrator's line to write — should not have to move because a forward-fix landed. Anything
-- numbered above `0033` that touches this function belongs in here too.
--
-- Same posture as 0008 / 0024 / 0031 and the same deliberate deviation from `08` §3.8: this file
-- creates fixture users in `auth.users`, so it is a TEST and never a migration. Everything happens
-- inside one transaction that ends in ROLLBACK; nothing survives and production never sees it.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0032_repoint_saved_place_policy_tests.sql
-- or, once `package.json` carries the script:  npm run db:test:0032
-- `package.json` is outside this lane's write scope. Until the orchestrator adds `db:test:0032` and
-- chains it into `npm run db:test`, THIS FILE IS NOT A CI GATE — it is a script somebody has to
-- remember. Saying so here rather than assuming it, because a test that nothing runs is a test that
-- silently stops being true.
--
-- LIKE 0024 AND 0031 AND UNLIKE 0008, THIS FILE COUNTS NOTHING GLOBAL. Every assertion names its own
-- rows by id, so it runs against a database that already has real data in it — no `supabase db
-- reset` first, and no throwing away cached `extractions` rows that cost real model calls against a
-- daily ceiling. That is not a convenience: `agent-guardrails.md` §9 V3 forbids resetting the shared
-- local database at all, so a test requiring an empty one could not have been run here.
--
-- HARNESS PREREQUISITE, and it is satisfied on this machine. On a bare postgres image `auth.uid()`
-- reads only the LEGACY singular `request.jwt.claim.sub` GUC while this file sets the modern
-- `request.jwt.claims` JSON. MEASURED on `supabase_db_P-002` (image
-- `public.ecr.aws/supabase/postgres:17.6.1.159`) at base commit `2cf6b83`: `auth.uid()` here is the
-- `coalesce(...)` form that reads BOTH, so no patch is needed. On a container that ships the
-- singular form, the replacement is written out in `0008_policy_tests.sql`'s header; without it the
-- first `save_place()` below aborts with `not authenticated`, which looks like a policy failure and
-- is not one.
--
-- ═══ WHAT THIS FILE IS FOR ════════════════════════════════════════════════════════════════════
--
-- `0032` widens write access to `saved_places.place_id`, which is the user's most sensitive table.
-- Reading the DDL is not evidence that it is safe; this repo's standard is that the transition is
-- executed. So every claim `0032`'s header makes is executed here as a real role against real rows:
--
--   * the refusal is at the DATABASE, not in the UI (R1, R1b, R1c, R8b);
--   * the design's central claim — SECURITY INVOKER means a leaked EXECUTE grant still cannot
--     write `place_id` — is proven by granting EXECUTE to `authenticated` and watching the call be
--     refused anyway (R9). This is the one assertion that would be pure prose otherwise;
--   * the attribution survives a re-point (R2c), because the creator credit is a terms obligation;
--   * what is forbidden is actually forbidden rather than merely documented (R3, R4, R7).
--
-- TWO USERS, because one is not enough. **B holds a save on the same `places` row as A**, which is
-- what makes R2e non-vacuous: "A can no longer read the old place" would also be satisfied by a
-- schema in which the row had been deleted. It has not been; B still reads it.
--
-- SHAPE OF THE FILE
--   R0            fixtures, and the POSITIVE half: A's save exists and carries the whole overlay.
--   R0c           the INVOKER dependency, named so a future revoke fails here rather than in prod.
--   R1            THE FINDING, EXECUTED: `authenticated` cannot write `place_id` by any route.
--   R2            the re-point itself, and everything it carries.
--   R2f, R2g      CONDITION C3, EXECUTED: the caption-derived overlay is cleared by the move, and
--                 the credit that is owed unconditionally is still there and still readable.
--   R3            the cross-user refusals, both directions.
--   R4            the duplicate refusal — and that nothing was merged or deleted.
--   R5, R5b       idempotence — a no-op writes nothing, and in particular clears nothing.
--   R6            merge chains: a re-point lands on the survivor, never on a tombstone.
--   R7            the argument guards.
--   R8            the grant posture, read from the catalogue as well as behaved.
--   R9            THE INVOKER PROPERTY, EXECUTED.
--   R9c, R9d      CONDITION C4, EXECUTED: the TWO independent refusals, separately.
--
-- FAILURE-FIRST is this file type's standard (0024's header) and the state of it here is recorded
-- honestly at the foot of the file, in "WHAT THIS FILE DOES NOT PROVE". Read that before treating
-- this suite as complete.

\set a  'a0000000-0000-4000-8000-000000000032'
\set b  'b0000000-0000-4000-8000-000000000032'

begin;

-- A migration under review must not be applied by its own test. This file assumes `0032` is already
-- applied; if it is not, the first call in R2 fails with `function ... does not exist`, which is a
-- clearer message than anything this file could raise for itself.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'repoint_saved_place') then
    raise exception 'FAIL setup: public.repoint_saved_place does not exist — apply 0032 first';
  end if;
  raise notice 'PASS setup repoint_saved_place exists (0032). R2f additionally requires 0033: if it fails while everything else passes, 0033 is the migration that is missing, not a policy';
end $$;

-- ── fixtures, as the privileged role ──────────────────────────────────────────────────────────
-- The profiles rows are created by handle_new_user() (0002), not here.
insert into auth.users (id, email) values
  (:'a', 'repoint-a@example.test'),
  (:'b', 'repoint-b@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('a0000000-0000-4000-8000-000000000032',
                    'b0000000-0000-4000-8000-000000000032')) <> 2 then
    raise exception 'FAIL R0: handle_new_user did not create a profile per fixture user';
  end if;
  raise notice 'PASS R0   two fixture users with profiles';
end $$;

-- One import each. `sps_insert_own` (0006:135) requires the user to own the import behind the
-- source, so B cannot borrow A's.
select public.start_import(:'a', 'tiktok', '79320000000000041',
                           'https://www.tiktok.com/@r32/video/79320000000000041');
select public.start_import(:'b', 'tiktok', '79320000000000042',
                           'https://www.tiktok.com/@r32/video/79320000000000042');

select id as src_a from public.sources where platform_source_id = '79320000000000041' \gset
select id as src_b from public.sources where platform_source_id = '79320000000000042' \gset

-- A thumbnail and an author handle, so R2c and R2g have something to prove survived.
-- `start_import` sets neither — the oEmbed fetch does, later — and the denormalised copy on the
-- save is taken from here. `author_handle` is what `place-sheet.tsx:1520` turns into `authorLabel`,
-- the figcaption under the caption quote, so without it R2g cannot see a credit at all.
update public.sources
   set thumbnail_url = 'https://p16.tiktokcdn.test/r32-a.jpg',
       author_handle = '@r32creator'
 where id in (:'src_a', :'src_b');

-- Five places, deliberately in five different countries and thousands of kilometres apart, so that
-- `resolve_place` step 2's 75 m near-duplicate guard (0011 defect 5) cannot silently merge any two
-- of them and make an assertion below vacuous.
select public.resolve_place('overture','ovt-r32-wrong','Repoint Fixture Wrong Pin',
                            35.6762, 139.6503, 'restaurant','restaurant', null,
                            'Tokyo', null, 'JP', '{}'::jsonb) as p_wrong \gset
select public.resolve_place('overture','ovt-r32-right','Repoint Fixture Right Pin',
                            -33.8688, 151.2093, 'restaurant','restaurant', null,
                            'Sydney', null, 'AU', '{}'::jsonb) as p_right \gset
select public.resolve_place('overture','ovt-r32-third','Repoint Fixture Third Place',
                            48.8566, 2.3522, 'restaurant','restaurant', null,
                            'Paris', null, 'FR', '{}'::jsonb) as p_third \gset
select public.resolve_place('overture','ovt-r32-loser','Repoint Fixture Merge Loser',
                            -22.9068, -43.1729, 'restaurant','restaurant', null,
                            'Rio de Janeiro', null, 'BR', '{}'::jsonb) as p_loser \gset
select public.resolve_place('overture','ovt-r32-winner','Repoint Fixture Merge Winner',
                            55.6761, 12.5683, 'restaurant','restaurant', null,
                            'Copenhagen', null, 'DK', '{}'::jsonb) as p_winner \gset

-- DISCHARGE THE FIXTURE'S DEFERRED TRIGGERS HERE, AS THE PRIVILEGED ROLE, AND DO NOT MOVE IT.
-- `places_alias_required` (0005, tightened by 0013) is a DEFERRABLE INITIALLY DEFERRED constraint
-- trigger and `assert_place_has_alias()` is not `security definer`, so the queued events run under
-- whatever role is in effect at the first discharge. 0031's test header records what that cost when
-- the first discharge happened under `authenticated`: the file aborted with `permission denied for
-- table places` on a column 0012 deliberately withholds, 26 assertions in, for a reason that had
-- nothing to do with any policy.
--
-- AND THEN PUT THE MODE BACK. `SET CONSTRAINTS ALL IMMEDIATE` is not a one-shot flush: it changes
-- the mode for the REST of the transaction, so every later `save_place()` would have
-- `saved_places_provenance_required` fire on the `saved_places` INSERT — before `save_place` has
-- reached the `saved_place_sources` INSERT two statements later — and abort with `origin=import but
-- no source`. Measured here on the first run of this file, at exactly that point. Every discharge
-- below is therefore paired with a restore, and the pairing is the reason the deferred triggers are
-- being exercised the way PostgREST exercises them rather than in a mode nothing in production uses.
set constraints all immediate;
set constraints all deferred;

-- Carry the ids into transaction-local GUCs. psql does not interpolate `:'var'` inside a
-- dollar-quoted body, so every DO block below reads them through current_setting() — the same
-- mechanism 0031's test uses and for the same reason.
select set_config('r32.a',       :'a',       true),
       set_config('r32.b',       :'b',       true),
       set_config('r32.src_a',   :'src_a',   true),
       set_config('r32.src_b',   :'src_b',   true),
       set_config('r32.p_wrong', :'p_wrong', true),
       set_config('r32.p_right', :'p_right', true),
       set_config('r32.p_third', :'p_third', true),
       set_config('r32.p_loser', :'p_loser', true),
       set_config('r32.p_winner',:'p_winner',true);

-- ── A's save, created the way the product creates one: as `authenticated`, through save_place ──
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;

select public.save_place(:'p_wrong', :'src_a',
                         'Get the pistachio croissant, go before 10.',
                         'the pistachio croissant is unreal') as sp_a \gset

-- The denormalised source link (0016). SECURITY DEFINER, granted to `authenticated`, and it
-- requires the caller to already own the saved_place_sources link — which save_place just created.
select public.apply_saved_place_source_link(:'sp_a', :'src_a');

-- The rest of the overlay, through the column grant a user actually holds (0006:117).
update public.saved_places
   set display_name = 'The croissant place',
       category_override = 'bakery',
       visit_state = 'visited',
       visited_at = timestamptz '2026-08-15 09:30:00+00'
 where id = :'sp_a';

set constraints all immediate;
set constraints all deferred;
reset role;

-- The enrichment columns (0019), which only `service_role` may write.
select public.apply_saved_place_extraction(:'sp_a', :'a',
         array['bakery','pastry'], 'The pistachio croissant sells out by ten.',
         array['pistachio croissant']);

-- ── B's save, on the SAME place. This is what makes R2e non-vacuous. ──────────────────────────
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;
-- B's save carries a caption quote too, and that is R5b's whole point: by the time R5 runs, A's
-- quote has already been cleared by the R2 move, so A cannot show that a NO-OP clears nothing.
-- B's save is still un-moved at that point and still carries one.
select public.save_place(:'p_wrong', :'src_b', 'B saved the same wrong pin.',
                         'the sabich is the one to get') as sp_b \gset
set constraints all immediate;
set constraints all deferred;
reset role;
select public.apply_saved_place_extraction(:'sp_b', :'b',
         array['middle eastern'], 'Worth the queue at lunch.', array['sabich']);

select set_config('r32.sp_a', :'sp_a', true),
       set_config('r32.sp_b', :'sp_b', true);

-- ── R0b: the POSITIVE half. Without it every refusal below is satisfied by a broken fixture. ──
do $$
declare r public.saved_places%rowtype;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if not found then
    raise exception 'FAIL R0b: A''s fixture save was not created';
  end if;
  if r.place_id <> current_setting('r32.p_wrong')::uuid then
    raise exception 'FAIL R0b: A''s save does not point at the wrong-pin fixture';
  end if;
  if r.note is null or r.display_name is null or r.category_override is null
     or r.visit_state <> 'visited' or r.visited_at is null
     or r.extracted_reason is null or r.tags is null or r.why_go is null or r.dishes is null
     or r.source_url is null or r.source_thumbnail_url is null or r.origin <> 'import' then
    raise exception 'FAIL R0b: the fixture overlay is incomplete — R2b would pass vacuously';
  end if;
  if (select count(*) from public.saved_place_sources
       where saved_place_id = r.id) <> 1 then
    raise exception 'FAIL R0b: the fixture has no provenance link — R2c would pass vacuously';
  end if;
  raise notice 'PASS R0b  A''s save points at the wrong pin and carries the FULL overlay: note, display_name, category_override, visit_state, visited_at, extracted_reason, tags, why_go, dishes, source_url, source_thumbnail_url, one source link';
end $$;

-- B's save is a fixture for R5b, and it needs the same caption-derived columns populated or R5b
-- passes on a row that had nothing to clear.
do $$
declare r public.saved_places%rowtype;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  if r.extracted_reason is null or r.tags is null or r.why_go is null or r.dishes is null then
    raise exception 'FAIL R0b2: B''s fixture save carries no caption-derived overlay — R5b would prove nothing';
  end if;
  raise notice 'PASS R0b2 B''s save carries a quote and enrichment of its own: R5b has something a no-op could wrongly destroy';
end $$;

-- ── R0c: the dependency SECURITY INVOKER creates, asserted by name ────────────────────────────
-- `0032` is INVOKER, so it can only write `place_id` because `service_role` holds UPDATE on that
-- column — a privilege that arrives from a `postgres`-owned ALTER DEFAULT PRIVILEGES entry and was
-- never granted by any migration in this repo (0024's header, `Dxtm`). 0031 revoked exactly that
-- entry for its own table. If a future migration does the same to `saved_places`,
-- `repoint_saved_place` stops working — and it stops working SILENTLY on the hosted projects, where
-- nothing runs this suite. This assertion is what turns that into a red CI job instead.
do $$
begin
  if not has_column_privilege('service_role', 'public.saved_places', 'place_id', 'UPDATE') then
    raise exception 'FAIL R0c: service_role no longer holds UPDATE on saved_places.place_id. 0032''s repoint_saved_place is SECURITY INVOKER and depends on it; either restore the privilege or convert the function to SECURITY DEFINER (and re-review it under agent-guardrails.md §5 rule 18)';
  end if;
  if not has_function_privilege('service_role', 'public.repoint_saved_place(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'FAIL R0c: service_role cannot execute repoint_saved_place — the server path is dead';
  end if;
  raise notice 'PASS R0c  service_role holds UPDATE on saved_places.place_id and EXECUTE on repoint_saved_place — the two privileges the INVOKER design rests on';
end $$;

-- ═══ R1: THE FINDING, EXECUTED ════════════════════════════════════════════════════════════════
-- `product-review-2026-08-31-r1.md` finding 2 says re-pointing is structurally impossible from a
-- browser. That is asserted here as behaviour under two real roles rather than read off 0006:117,
-- because a grant list is what the reviewer read and executing it is what this repo calls evidence.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.saved_places
       set place_id = current_setting('r32.p_right')::uuid
     where id = current_setting('r32.sp_a')::uuid;
    raise exception 'FAIL R1: place_id is in the UPDATE grant — a browser can move a save onto any places row directly through PostgREST';
  exception when insufficient_privilege then
    raise notice 'PASS R1   a direct UPDATE of place_id by its own owner is refused at the DATABASE with 42501, not in the UI';
  end;

  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              current_setting('r32.sp_a')::uuid,
              current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R1b: authenticated can execute repoint_saved_place — it is meant to be service_role only';
  exception when insufficient_privilege then
    raise notice 'PASS R1b  authenticated holds no EXECUTE on repoint_saved_place (42501)';
  end;
end $$;

reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              current_setting('r32.sp_a')::uuid,
              current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R1c: anon can execute repoint_saved_place';
  exception when insufficient_privilege then
    raise notice 'PASS R1c  anon holds no EXECUTE on repoint_saved_place (42501)';
  end;
  begin
    perform 1 from public.saved_places;
    raise exception 'FAIL R1c2: anon can read saved_places at all';
  exception when insufficient_privilege then
    raise notice 'PASS R1c2 anon holds nothing on saved_places (42501) — the control for R1c';
  end;
end $$;
reset role;

-- ═══ R2: THE RE-POINT, AND EVERYTHING IT CARRIES ══════════════════════════════════════════════
-- Called as the privileged role, which is how the server action reaches it. Everything R1, R3 and
-- R4 assert is refused would also be satisfied by a schema in which THIS call failed, so this is
-- the control for the whole file.
do $$
declare v_old uuid; v_now uuid;
begin
  v_old := public.repoint_saved_place(
             current_setting('r32.a')::uuid,
             current_setting('r32.sp_a')::uuid,
             current_setting('r32.p_right')::uuid);
  if v_old is distinct from current_setting('r32.p_wrong')::uuid then
    raise exception 'FAIL R2: repoint returned % — expected the place the save pointed at before the call', v_old;
  end if;
  select place_id into v_now from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_now is distinct from current_setting('r32.p_right')::uuid then
    raise exception 'FAIL R2: the save still points at %', v_now;
  end if;
  raise notice 'PASS R2   the save moved from the wrong pin to the right one, and the call returned the place it vacated';
end $$;

-- ── R2b: the USER-AUTHORED overlay survives ───────────────────────────────────────────────────
-- THIS ASSERTION CHANGED, AND THE CHANGE IS NOT A RELAXATION — READ BEFORE TOUCHING IT.
-- Until `0033` this block also asserted that `extracted_reason`, `tags`, `why_go` and `dishes`
-- SURVIVED a re-point, and it passed. `security-privacy` then measured what that means on real rows:
-- a save re-pointed from `Ha Kosem` onto `Kohi בית קפה יפני` kept the quote `📍Ha Kosem` and the tag
-- `middle eastern`, while `place-sheet.tsx:1700-1710` renders that quote with the creator's `@handle`
-- as its figcaption — a falsified label of origin under TikTok Developer Terms III.3(n). That is
-- condition C3, the one blocking condition on `0032`'s verdict, and the owner ruled: clear.
--
-- So the four caption-derived columns moved OUT of this assertion and INTO R2f, where the opposite
-- is now asserted. `agent-guardrails.md` §4 rule 16 forbids weakening an assertion to make a change
-- pass; this is the other thing — a ruled behaviour change, with the old expectation inverted rather
-- than deleted, and R2f is strictly the stronger claim (it asserts a specific end state, where the
-- old line asserted only that nothing happened).
do $$
declare r public.saved_places%rowtype;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if r.note <> 'Get the pistachio croissant, go before 10.' then
    raise exception 'FAIL R2b: the note did not survive the re-point — this is the whole reason delete-and-re-add is not the answer';
  end if;
  if r.display_name <> 'The croissant place' or r.category_override <> 'bakery' then
    raise exception 'FAIL R2b: the name/category overlay did not survive';
  end if;
  if r.visit_state <> 'visited' or r.visited_at is null then
    raise exception 'FAIL R2b: the been-mark did not survive';
  end if;
  raise notice 'PASS R2b  everything the USER authored or did survived: note, display_name, category_override, visit_state, visited_at';
end $$;

-- ── R2f: CONDITION C3 — the caption-derived overlay does NOT survive the move ─────────────────
-- Four columns, asserted one at a time rather than as a single conjunction. The combined form would
-- report PASS with three of the four still populated the moment any one of them started failing to
-- clear, and `0008_policy_tests.sql`'s P25a-vi/vii records exactly that bug class being found in
-- this repo by a sabotage pass. Each `raise` also says WHY the field is a falsification and not
-- merely stale, because the next person to read it will be deciding whether to keep it.
do $$
declare r public.saved_places%rowtype;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if r.extracted_reason is not null then
    raise exception 'FAIL R2f-a: extracted_reason survived the move and still reads %. It is a VERBATIM caption substring rendered as a blockquote with the creator''s @handle as its figcaption (place-sheet.tsx:1700-1710), so on a re-pointed save it credits a creator for naming a venue they did not name — TikTok Developer Terms III.3(n), do not falsify a label of origin. Apply 0033', r.extracted_reason;
  end if;
  if r.tags is not null then
    raise exception 'FAIL R2f-b: tags survived the move and still read %. 0019''s column comment: "derived by the extractor from the source post" — they describe the OLD venue', r.tags;
  end if;
  if r.why_go is not null then
    raise exception 'FAIL R2f-c: why_go survived the move and still reads %. 0019: "one model-written sentence saying why this post recommended this place" — this post recommended a different place', r.why_go;
  end if;
  if r.dishes is not null then
    raise exception 'FAIL R2f-d: dishes survived the move and still read %. 0019: "named dishes or items the post called out" — called out about somewhere else', r.dishes;
  end if;
  raise notice 'PASS R2f  the move cleared all four caption-derived columns — extracted_reason, tags, why_go, dishes — in the same statement that moved the row: no window in which the save names one venue and quotes another';
end $$;

-- ── R2g: and the credit that is owed UNCONDITIONALLY is still there ───────────────────────────
-- C3 requires the link, the handle and the thumbnail to survive in EITHER branch. This is the pair
-- that makes the ruling coherent rather than a deletion: "@handle's video named this place" is gone,
-- "you saved this from @handle's video" is not. Asserted as the exact database state that makes
-- `place-sheet.tsx:1804-1805` render its standalone `Saved from {authorLabel}` line — quote null,
-- handle and link present — which is why C3 needs no UI change to be satisfied.
do $$
declare r public.saved_places%rowtype; v_handle text;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  select s.author_handle into v_handle
    from public.sources s where s.id = current_setting('r32.src_a')::uuid;
  if r.source_url is null or r.source_thumbnail_url is null then
    raise exception 'FAIL R2g: the clear took the source link with it — that half of the credit is owed unconditionally (C3), whatever happened to the quote';
  end if;
  if v_handle is null then
    raise exception 'FAIL R2g: the fixture source carries no author_handle, so this assertion cannot see a credit at all and would pass vacuously';
  end if;
  if not (r.extracted_reason is null and r.source_url is not null and v_handle is not null) then
    raise exception 'FAIL R2g: the row is not in the state that renders "Saved from @handle" — quote must be null while the handle and link remain';
  end if;
  raise notice 'PASS R2g  quote gone, credit kept: source_url, source_thumbnail_url and the creator handle all intact — exactly the row state that makes the sheet fall back to "Saved from @handle" instead of crediting a quote about another venue';
end $$;

do $$
declare r public.saved_places%rowtype; v_src uuid;
begin
  select * into r from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  select source_id into v_src from public.saved_place_sources
   where saved_place_id = r.id;
  if v_src is distinct from current_setting('r32.src_a')::uuid then
    raise exception 'FAIL R2c: the provenance link did not survive the re-point — "which TikTok made me save this" is now unanswerable, and the creator credit is a terms obligation';
  end if;
  if r.source_url is null or r.source_thumbnail_url <> 'https://p16.tiktokcdn.test/r32-a.jpg' then
    raise exception 'FAIL R2c: the denormalised source link (0016) did not survive';
  end if;
  if (select count(*) from public.saved_place_sources where saved_place_id = r.id) <> 1 then
    raise exception 'FAIL R2c: the provenance link was duplicated or lost';
  end if;
  raise notice 'PASS R2c  the attribution survived: the saved_place_sources link, source_url and source_thumbnail_url are all unchanged — they are keyed on the SAVE, never on the place';
end $$;

-- And the source is still readable by A through `sources_select_via_membership` (0006), which is the
-- policy the place sheet's "which TikTok" row actually runs on.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.sources s where s.id = current_setting('r32.src_a')::uuid) then
    raise exception 'FAIL R2c2: A can no longer read the source behind their own save';
  end if;
  raise notice 'PASS R2c2 A still reads the source row through sources_select_via_membership — the link is live, not merely present';
end $$;

-- ── R2e: the RLS consequence, in both directions ──────────────────────────────────────────────
-- A gains read on the new place and loses it on the old one, because `places_select_if_saved`
-- (0006:150) is a membership predicate over saved_places. B still holds the old place, which is what
-- stops the second half passing on a schema that simply deleted the row.
do $$
begin
  if not exists (select 1 from public.places p where p.id = current_setting('r32.p_right')::uuid) then
    raise exception 'FAIL R2e: A cannot read the place they just re-pointed onto';
  end if;
  if exists (select 1 from public.places p where p.id = current_setting('r32.p_wrong')::uuid) then
    raise exception 'FAIL R2e: A still reads the place they moved away from — places_select_if_saved is not tracking the move';
  end if;
  raise notice 'PASS R2e  A reads the new place and no longer reads the old one — the membership predicate follows the move';
end $$;
reset role;

select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.places p where p.id = current_setting('r32.p_wrong')::uuid) then
    raise exception 'FAIL R2e2: B lost the place row — A''s re-point mutated a SHARED row instead of only their own save';
  end if;
  raise notice 'PASS R2e2 B still reads the old place: nothing shared was mutated, and R2e''s second half is not vacuous';
end $$;
reset role;

-- ── R2d: provenance, and that the deferred invariant is not disturbed ─────────────────────────
-- `saved_places_provenance_required` (0006) fires `after insert or update OF origin`. A re-point
-- touches neither, so it does not fire — but "does not fire" is worth executing rather than
-- reasoning about, because the failure mode is a COMMIT-time abort on the real path.
do $$
declare v_origin text;
begin
  select origin into v_origin from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_origin <> 'import' then
    raise exception 'FAIL R2d: origin changed to % — a re-point must never re-classify a save as manual', v_origin;
  end if;
end $$;
set constraints all immediate;
set constraints all deferred;
do $$
begin
  raise notice 'PASS R2d  origin is still import, and SET CONSTRAINTS ALL IMMEDIATE after the re-point raises nothing: the at-least-one-source invariant is intact';
end $$;

-- ═══ R3: THE CROSS-USER REFUSALS, BOTH DIRECTIONS ═════════════════════════════════════════════
-- Run as the privileged role on purpose. `service_role` carries BYPASSRLS, so no policy protects
-- these rows from this function: if the WHERE-clause ownership predicate were missing, THIS is where
-- it would show. A cross-user test run as `authenticated` would pass on a function with no predicate
-- at all, because R1b already stops `authenticated` reaching it.
do $$
declare v_before uuid; v_after uuid;
begin
  select place_id into v_before from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  begin
    perform public.repoint_saved_place(
              current_setting('r32.b')::uuid,       -- B
              current_setting('r32.sp_a')::uuid,    -- A's save
              current_setting('r32.p_third')::uuid);
    raise exception 'FAIL R3: B re-pointed A''s saved place';
  exception when insufficient_privilege then
    null;
  end;
  select place_id into v_after from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_after is distinct from v_before then
    raise exception 'FAIL R3: the refusal raised but the row moved anyway';
  end if;
  raise notice 'PASS R3   B cannot re-point A''s save (42501), and A''s row did not move — checked, not assumed from the exception';
end $$;

do $$
declare v_before uuid; v_after uuid;
begin
  select place_id into v_before from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,       -- A
              current_setting('r32.sp_b')::uuid,    -- B's save
              current_setting('r32.p_third')::uuid);
    raise exception 'FAIL R3b: A re-pointed B''s saved place';
  exception when insufficient_privilege then
    null;
  end;
  select place_id into v_after from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  if v_after is distinct from v_before then
    raise exception 'FAIL R3b: the refusal raised but B''s row moved anyway';
  end if;
  raise notice 'PASS R3b  A cannot re-point B''s save either — the refusal is symmetric, not an artefact of who owns which fixture';
end $$;

-- An id that belongs to nobody must be refused with the SAME condition as an id that belongs to
-- someone else. Distinguishing them would answer "does this saved-place id exist?" for any id.
do $$
begin
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              '00000000-0000-4000-8000-00000000dead'::uuid,
              current_setting('r32.p_third')::uuid);
    raise exception 'FAIL R3c: an unknown saved place id was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS R3c  an unknown saved place id is refused with 42501 — the SAME condition as someone else''s row, so the function is not an existence oracle';
  end;
end $$;

-- ═══ R4: THE DUPLICATE REFUSAL — AND THAT NOTHING WAS MERGED OR DELETED ═══════════════════════
-- `merge_places` (0011) resolves this situation by deleting the loser save. This function must not:
-- two saves carry two notes, and one user pressing a button is not an operator repairing a
-- duplicate places row. The assertion is therefore not just "it raised" but "both rows are intact".
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;
select public.save_place(:'p_third', null, 'A also saved the Paris one, separately.') as sp_a2 \gset
set constraints all immediate;
set constraints all deferred;
reset role;
select set_config('r32.sp_a2', :'sp_a2', true);

do $$
declare n_before int; n_after int; v_a uuid; v_a2 uuid;
begin
  select count(*) into n_before from public.saved_places
   where user_id = current_setting('r32.a')::uuid;
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              current_setting('r32.sp_a')::uuid,
              current_setting('r32.p_third')::uuid);
    raise exception 'FAIL R4: re-pointing onto a place the user already holds was accepted';
  exception when unique_violation then
    null;
  end;
  select count(*) into n_after from public.saved_places
   where user_id = current_setting('r32.a')::uuid;
  select place_id into v_a  from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  select place_id into v_a2 from public.saved_places where id = current_setting('r32.sp_a2')::uuid;
  if n_after <> n_before then
    raise exception 'FAIL R4: the refusal deleted or created a save (% -> %)', n_before, n_after;
  end if;
  if v_a is distinct from current_setting('r32.p_right')::uuid
     or v_a2 is distinct from current_setting('r32.p_third')::uuid then
    raise exception 'FAIL R4: the refusal moved a row';
  end if;
  if (select note from public.saved_places where id = current_setting('r32.sp_a2')::uuid)
       <> 'A also saved the Paris one, separately.' then
    raise exception 'FAIL R4: the other save''s note was touched';
  end if;
  raise notice 'PASS R4   re-pointing onto a place the user already holds is refused with 23505, and BOTH saves are intact — nothing merged, nothing deleted, both notes kept';
end $$;

-- R5b IS DELIBERATELY FIRST, and the ordering is an assertion in itself. A "clear on every call"
-- regression trips BOTH of these — R5 sees the write through `ctid`, R5b sees what the write
-- destroyed — and psql stops at the first. Measured (sabotage T2): with R5 first, the run reported
-- a `ctid` change and never reached R5b at all, so the terms consequence never appeared. The
-- mechanical failure is the cheaper message; the attribution failure is the one someone needs to
-- read. So the expensive one goes first.

-- ── R5b: AND A NO-OP CLEARS NOTHING ───────────────────────────────────────────────────────────
-- The other half of III.3(n), which forbids falsifying **or deleting** an attribution. `0033` clears
-- the caption-derived overlay because the place changed; when the place does NOT change, nothing the
-- caption said became false and destroying the quote would be the same offence from the other side.
-- The user tapping "yes, this pin is right" must not cost them the creator's words.
--
-- Run against B's save, which has not been moved yet and still carries a quote. A's cannot serve:
-- R2 already cleared it, so "still there afterwards" would be unfalsifiable on A.
do $$
declare v_ret uuid; r_before public.saved_places%rowtype; r_after public.saved_places%rowtype;
begin
  select * into r_before from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  v_ret := public.repoint_saved_place(
             current_setting('r32.b')::uuid,
             current_setting('r32.sp_b')::uuid,
             r_before.place_id);                     -- the row it already names
  select * into r_after from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  if v_ret is distinct from r_before.place_id then
    raise exception 'FAIL R5b: a no-op re-point of B''s save returned %', v_ret;
  end if;
  if r_after.extracted_reason is distinct from r_before.extracted_reason
     or r_after.tags   is distinct from r_before.tags
     or r_after.why_go is distinct from r_before.why_go
     or r_after.dishes is distinct from r_before.dishes then
    raise exception 'FAIL R5b: a no-op re-point destroyed the caption-derived overlay. The place did not change, so nothing the caption said became false — this is III.3(n)''s "or DELETE any author attributions" half, and it is the failure a clear-on-every-call version of 0033 would produce every time a user confirmed a pin that was already right';
  end if;
  raise notice 'PASS R5b  a no-op re-point clears NOTHING: the quote, tags, why_go and dishes are all still there, because the venue never changed';
end $$;

-- ═══ R5: IDEMPOTENCE — AND THAT THE NO-OP DOES NOT WRITE THE ROW ══════════════════════════════
-- THE OBVIOUS ASSERTION HERE IS VACUOUS AND WAS MEASURED TO BE. The first version of this block
-- compared `updated_at` across the call. It passed with the early return REMOVED, because
-- `touch_updated_at()` (0001) sets `now()`, `now()` is the TRANSACTION timestamp, and this whole
-- file is one transaction — so a row written twice inside it carries the same `updated_at` both
-- times and the assertion cannot see the write it exists to detect. Sabotage run S5, 2026-08-31.
--
-- `ctid` can see it: an UPDATE writes a new heap tuple and the row's physical location moves, in the
-- same transaction or not. It is a system column and an implementation detail, which is exactly why
-- it is the right instrument for "was this row physically written" and the wrong one for anything
-- else. `updated_at` is kept alongside it as the assertion a reader expects, with its weakness
-- stated rather than left to be rediscovered.
do $$
declare v_ret uuid; t_before timestamptz; t_after timestamptz; c_before tid; c_after tid;
begin
  select updated_at, ctid into t_before, c_before
    from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  v_ret := public.repoint_saved_place(
             current_setting('r32.a')::uuid,
             current_setting('r32.sp_a')::uuid,
             current_setting('r32.p_right')::uuid);
  select updated_at, ctid into t_after, c_after
    from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_ret is distinct from current_setting('r32.p_right')::uuid then
    raise exception 'FAIL R5: a no-op re-point returned %', v_ret;
  end if;
  if c_after is distinct from c_before then
    raise exception 'FAIL R5: a no-op re-point wrote the row anyway (ctid % -> %) — the early return is gone, and every such write fires the touch trigger and bumps updated_at on the real path, where now() is not frozen', c_before, c_after;
  end if;
  if t_after is distinct from t_before then
    raise exception 'FAIL R5b: a no-op re-point moved updated_at';
  end if;
  raise notice 'PASS R5   re-pointing onto the row the save already names is a true no-op: it returns that id and the row is not written at all (ctid unchanged)';
end $$;

-- ═══ R6: MERGE CHAINS — THE SURVIVOR, NEVER THE TOMBSTONE ═════════════════════════════════════
-- A caller working from a stale picture can name a place that has since been merged away. `0011`
-- defect 1 is exactly this failure in `resolve_place`, and it is silent: the save reads fine and
-- shows the wrong venue forever. `repoint_saved_place` resolves through `place_survivor_id` for the
-- same reason `resolve_place` does at both of its return points.
select public.merge_places(:'p_loser', :'p_winner');
set constraints all immediate;
set constraints all deferred;

do $$
declare v_ret uuid; v_now uuid;
begin
  if (select merged_into_place_id from public.places where id = current_setting('r32.p_loser')::uuid)
       is null then
    raise exception 'FAIL R6 setup: the loser place is not a tombstone, so this proves nothing';
  end if;
  v_ret := public.repoint_saved_place(
             current_setting('r32.b')::uuid,
             current_setting('r32.sp_b')::uuid,
             current_setting('r32.p_loser')::uuid);   -- names the TOMBSTONE
  select place_id into v_now from public.saved_places where id = current_setting('r32.sp_b')::uuid;
  if v_now is distinct from current_setting('r32.p_winner')::uuid then
    raise exception 'FAIL R6: the save landed on % — a merge chain was not followed to the survivor', v_now;
  end if;
  if v_ret is distinct from current_setting('r32.p_wrong')::uuid then
    raise exception 'FAIL R6: the return value is not the place B vacated';
  end if;
  raise notice 'PASS R6   naming a merged-away place lands the save on the SURVIVOR, never on the tombstone';
end $$;

-- ═══ R7: THE ARGUMENT GUARDS ══════════════════════════════════════════════════════════════════
do $$
begin
  begin
    perform public.repoint_saved_place(null, current_setting('r32.sp_a')::uuid,
                                       current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R7: a null user id was accepted';
  exception when null_value_not_allowed then null;
  end;
  begin
    perform public.repoint_saved_place(current_setting('r32.a')::uuid, null,
                                       current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R7: a null saved place id was accepted';
  exception when null_value_not_allowed then null;
  end;
  begin
    perform public.repoint_saved_place(current_setting('r32.a')::uuid,
                                       current_setting('r32.sp_a')::uuid, null);
    raise exception 'FAIL R7: a null place id was accepted';
  exception when null_value_not_allowed then null;
  end;
  raise notice 'PASS R7   all three arguments are required (22004) — a null never silently becomes a no-op update';
end $$;

do $$
begin
  begin
    perform public.repoint_saved_place(current_setting('r32.a')::uuid,
                                       current_setting('r32.sp_a')::uuid,
                                       '00000000-0000-4000-8000-0000000000ff'::uuid);
    raise exception 'FAIL R7b: an unknown place id was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS R7b  an unknown place id is refused with 23503 before any row is touched';
  end;
end $$;

-- ═══ R8: THE GRANT POSTURE, READ FROM THE CATALOGUE ═══════════════════════════════════════════
-- R1 proves the behaviour; this proves the shape, and the two fail independently. EXECUTE defaults
-- to PUBLIC on every newly created function and a privilege held through PUBLIC survives
-- `revoke ... from anon` — 0009's bug, and then 0018's. `has_function_privilege` accounts for
-- privileges held via PUBLIC, which is what makes this assertion able to see that bug at all.
do $$
declare v text;
begin
  if has_function_privilege('anon', 'public.repoint_saved_place(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.repoint_saved_place(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'FAIL R8: repoint_saved_place is executable by a browser role — check the revoke names PUBLIC, not only anon';
  end if;
  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'repoint_saved_place') then
    raise exception 'FAIL R8: repoint_saved_place is SECURITY DEFINER. 0032 is INVOKER by design (see its header and R9); a definer version writes a column the caller holds no grant on and derives its row from a caller-supplied id — agent-guardrails.md §5 rule 18, two counts of three';
  end if;
  select string_agg(g.column_name, ', ' order by g.column_name) into v
    from information_schema.column_privileges g
   where g.table_schema = 'public' and g.table_name = 'saved_places'
     and g.grantee = 'authenticated' and g.privilege_type = 'UPDATE';
  if v is distinct from 'category_override, display_name, note, visit_state, visited_at' then
    raise exception 'FAIL R8b: authenticated''s UPDATE grant on saved_places is now (%). 0032 adds no column grant by design — if place_id has appeared here, the column-grant route was taken after all and needs its own review', v;
  end if;
  raise notice 'PASS R8   repoint_saved_place is INVOKER, unreachable by anon and authenticated, and authenticated''s UPDATE grant on saved_places is still exactly the five overlay columns 0006 granted';
end $$;

-- ═══ R9: THE INVOKER PROPERTY, EXECUTED ═══════════════════════════════════════════════════════
-- This is the assertion that makes `0032`'s central design claim evidence rather than prose.
--
-- The claim: because the function is SECURITY INVOKER, a future migration that mistakenly granted
-- EXECUTE to `authenticated` would NOT create an escalation — the call would still be refused,
-- because `authenticated` holds no UPDATE on `place_id` and no EXECUTE on `place_survivor_id`. As
-- SECURITY DEFINER the same mistake would succeed. So the grant is deliberately made here, inside a
-- transaction that is rolled back, and the call is watched to fail anyway.
grant execute on function public.repoint_saved_place(uuid, uuid, uuid) to authenticated;

select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_before uuid; v_after uuid;
begin
  select place_id into v_before from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              current_setting('r32.sp_a')::uuid,
              current_setting('r32.p_winner')::uuid);
    raise exception 'FAIL R9: WITH EXECUTE GRANTED, authenticated re-pointed its own save. The function is behaving as SECURITY DEFINER — a leaked grant is now an escalation, which is the exact failure 0032 chose INVOKER to prevent';
  exception when insufficient_privilege then
    null;
  end;
  select place_id into v_after from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_after is distinct from v_before then
    raise exception 'FAIL R9: the row moved despite the refusal';
  end if;
  raise notice 'PASS R9   EVEN WITH EXECUTE GRANTED TO authenticated the call is refused (42501) and the row does not move — SECURITY INVOKER means a leaked grant is a broken feature, not an escalation';
end $$;

-- ── R9c–R9f: CONDITION C4 — the refusals, measured apart, and THERE ARE THREE ────────────────
-- `0032`'s header named ONE refusal site and named the wrong one: it said the leaked-grant call
-- "would fail with 42501 at the inner UPDATE". It fails EARLIER, at `place_survivor_id`, because
-- that call comes first in the body. C4 asked for that to be restated as TWO independent refusals.
--
-- **Measured here: there are three.** The third was found while making R9c falsifiable, which is
-- the only reason it is known — granting `authenticated` EXECUTE on `place_survivor_id` did NOT
-- make R9c fail, and an assertion that survives the removal of the control it names is not an
-- assertion. The reason is that `place_survivor_id` is `SECURITY INVOKER` and reads
-- `places.merged_into_place_id`, a column `0012` deliberately withholds from `authenticated`. So:
--
--   1. no EXECUTE on `place_survivor_id`            -> permission denied for FUNCTION (R9c)
--   2. no SELECT on `places.merged_into_place_id`   -> permission denied for TABLE    (R9c2)
--   3. no UPDATE on `saved_places.place_id`         -> permission denied for TABLE    (R9d)
--
-- Each is independently sufficient and they fire in that order. R9e then leaks TWO of the three at
-- once and watches the call still be refused, which is the strongest form of the claim `0032` was
-- trying to make and got half right. `0033`'s header carries the corrected text, because `0032` is
-- frozen (`agent-guardrails.md` §5 rule 17) and its file is not edited.
--
-- THE MESSAGE TEXT IS PART OF EACH ASSERTION, not decoration. `insufficient_privilege` alone cannot
-- tell these three apart — that is exactly how the first version of R9c passed with its own control
-- removed — so each block checks WHICH object was denied. This is the `0008_policy_tests.sql` P17
-- lesson ("two of them passed at first with the trigger they were supposed to be testing dropped")
-- in its most literal form.
do $$
begin
  begin
    perform public.place_survivor_id(current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R9c: authenticated executed place_survivor_id. This is the FIRST of three refusals that make repoint_saved_place safe under a leaked EXECUTE grant (review V3a)';
  exception when insufficient_privilege then
    if sqlerrm not like '%function%place_survivor_id%' then
      raise exception 'FAIL R9c: refused, but for the wrong reason (%). Refusal 1 is the missing EXECUTE grant; if the denial names a table instead, the EXECUTE grant has been added and only refusals 2 and 3 are left standing', sqlerrm;
    end if;
    raise notice 'PASS R9c  refusal 1 of 3: no EXECUTE on place_survivor_id — "%" — this is the one that actually fires, and 0032''s header named a different one', sqlerrm;
  end;
end $$;

-- Leak refusal 1 and watch refusal 2 hold. This is also R9c's falsification test, run inline rather
-- than kept in a sabotage log: with the grant added, R9c's message check above would no longer match.
-- `authenticated` cannot grant on a function it does not own, so step out of the role for the two
-- ACL statements and step back in. `request.jwt.claims` was set with `is_local = true` and survives
-- the round trip, so `auth.uid()` is unchanged on re-entry.
reset role;
grant execute on function public.place_survivor_id(uuid) to authenticated;
set local role authenticated;
do $$
begin
  begin
    perform public.place_survivor_id(current_setting('r32.p_right')::uuid);
    raise exception 'FAIL R9c2: WITH EXECUTE GRANTED, authenticated ran place_survivor_id. Refusal 2 — the missing SELECT on places.merged_into_place_id (0012) — is gone, and the leaked-grant property now rests on the place_id UPDATE grant alone';
  exception when insufficient_privilege then
    if sqlerrm not like '%places%' then
      raise exception 'FAIL R9c2: refused, but not by the places column grant (%)', sqlerrm;
    end if;
    raise notice 'PASS R9c2 refusal 2 of 3: even WITH EXECUTE granted, place_survivor_id is refused — "%" — because it is SECURITY INVOKER and reads places.merged_into_place_id, which 0012 withholds', sqlerrm;
  end;
end $$;

do $$
begin
  begin
    update public.saved_places
       set place_id = current_setting('r32.p_winner')::uuid
     where id = current_setting('r32.sp_a')::uuid;
    raise exception 'FAIL R9d: authenticated UPDATEd place_id directly. This is refusal 3 (review V3a2), independently sufficient, and the one 0032''s header named';
  exception when insufficient_privilege then
    raise notice 'PASS R9d  refusal 3 of 3: no UPDATE on saved_places.place_id — "%"', sqlerrm;
  end;
end $$;

-- ── R9e: TWO of the three leaked at once, and the feature is STILL refused ────────────────────
-- EXECUTE on `repoint_saved_place` (granted above R9) and EXECUTE on `place_survivor_id` (granted
-- above R9c2). Both mistakes made, by two different migrations, and the answer is still 42501.
do $$
declare v_before uuid; v_after uuid;
begin
  select place_id into v_before from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  begin
    perform public.repoint_saved_place(
              current_setting('r32.a')::uuid,
              current_setting('r32.sp_a')::uuid,
              current_setting('r32.p_winner')::uuid);
    raise exception 'FAIL R9e: with EXECUTE leaked on BOTH repoint_saved_place and place_survivor_id, authenticated moved its own save. The remaining refusals are not sufficient and the INVOKER property is gone';
  exception when insufficient_privilege then
    null;
  end;
  select place_id into v_after from public.saved_places where id = current_setting('r32.sp_a')::uuid;
  if v_after is distinct from v_before then
    raise exception 'FAIL R9e: the row moved despite the refusal';
  end if;
  raise notice 'PASS R9e  TWO of the three refusals leaked at once and the call is still refused, row unmoved — the property degrades gracefully rather than resting on any single grant';
end $$;

reset role;
revoke execute on function public.place_survivor_id(uuid) from authenticated;

revoke execute on function public.repoint_saved_place(uuid, uuid, uuid) from authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.repoint_saved_place(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'FAIL R9b: the R9 grant was not withdrawn';
  end if;
  raise notice 'PASS R9b  R9''s grant is withdrawn (and the whole transaction rolls back regardless)';
end $$;

rollback;

-- ═══ WHAT THIS FILE DOES NOT PROVE ════════════════════════════════════════════════════════════
--
--  * **`collection_items` is untouched by a re-point, and this file does not assert either way.**
--    A collection item is keyed on `place_id` (0024:147), so after a re-point the user's collection
--    still lists the OLD place and loses the overlay that was joined through `saved_places`. That is
--    a known, named consequence of 0032's scope — see 0032's header and
--    `docs/archive/db-ruling-repoint-place-2026-08-31.md` §5 — not something this suite silently missed.
--    An assertion here would freeze a behaviour that is expected to change once that gap is ruled on.
--  * **THE RENDERED SHEET.** C3's acceptance is written in terms of what the sheet shows, and a
--    psql script cannot see a sheet. R2f and R2g prove the DATABASE state that makes the correct
--    render inevitable — quote null, handle and link present — and `place-sheet.tsx:1700-1710` and
--    `:1804-1805` are the two places where that state becomes the `Saved from @handle` fallback
--    instead of a quote with a credit. **Someone still has to look at it.** That assertion belongs
--    to the UI suite, against the server action that does not exist yet (condition C1).
--  * **That the four cleared values are recoverable.** They are not. There is no audit table and
--    this function does not return them; `0033`'s header says so and puts the mitigation on the
--    server action (read them immediately before calling, and log them). A re-point followed by a
--    re-point back does not restore the quote, and nothing here pretends otherwise.
--  * **Concurrency.** R4's `unique_violation` handler covers the race between the duplicate check
--    and the UPDATE; a psql script is one session and cannot exercise it. The two-connection harness
--    named at P23 in `0008_policy_tests.sql` is what would.
--  * **The hosted projects.** This file was executed against the local container only. `0032` is not
--    applied to staging or production and pushing it is the orchestrator's, not this lane's.
--  * **That the server action supplies a resolver-derived place id.** That is `0032`'s contract with
--    its caller and it is not checkable from inside the database — there is no column recording who
--    asked for a row. It is held by EXECUTE being `service_role` only (R1b, R1c, R8) plus review of
--    the calling code, which does not exist yet.
