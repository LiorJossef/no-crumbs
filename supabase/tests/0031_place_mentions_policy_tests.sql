-- 0031_place_mentions_policy_tests.sql — the authorisation proof for E1 (0031, place_mentions).
--
-- Same posture as 0008_policy_tests.sql and 0024_collections_policy_tests.sql, and the same
-- deliberate deviation from `08` §3.8: this file creates fixture users in auth.users, so it is a
-- TEST and never a migration. Everything happens inside one transaction that is rolled back at the
-- end; nothing survives, and production never sees it.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0031_place_mentions_policy_tests.sql
-- or:   npm run db:test:0031
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
-- `package.json` is outside this lane's write scope; the orchestrator added `db:test:0031` and
-- chained it into `npm run db:test` after `0008` and `0024`, which is what CI runs, so this file is
-- a gate rather than something invoked by hand. Note the chain is `&&`: `0008` requires an EMPTY
-- database and will stop the chain before this file runs on any database that has data in it. This
-- file itself has no such precondition (see the paragraph below).
--
-- LIKE 0024 AND UNLIKE 0008, THIS FILE COUNTS NOTHING GLOBAL. Every assertion names its own rows by
-- id, so it runs against a database that already has real data in it — no `supabase db reset` first,
-- and no throwing away cached `extractions` rows that cost real model calls against a daily ceiling.
--
-- SAME HARNESS PREREQUISITE as 0008 and 0024: on a bare postgres image `auth.uid()` reads the LEGACY
-- singular `request.jwt.claim.sub` GUC while this file sets the modern `request.jwt.claims` JSON. If
-- the first `save_place()` below aborts with `not authenticated`, that is the image, not a policy —
-- the replacement `auth.uid()` is written out in 0008_policy_tests.sql's header.
--
-- WHAT THIS FILE IS FOR. `docs/security-ruling-e1-caption-retention.md` §4 makes acceptance
-- criterion 7 into **condition Q**, and states the standard in terms: *"I do not accept 'the policy
-- says so' as evidence for criterion 7, including from myself."* So every authorisation claim below
-- is executed as two real roles rather than read from `pg_policies`, and condition **D1** — the
-- whole of the retention bound — is proven by executing a `profiles` delete and an `auth.users`
-- delete, not by reading the foreign key.
--
-- THREE USERS, because two is not enough:
--   A  the owner. Keeps mentions, places one, dismisses one.
--   B  the adversary. Every "sees zero" assertion is B's, and B has a mention of their own so that
--      "B sees zero of A's" cannot be satisfied by a schema in which nobody sees anything.
--   C  the deletion probe. Exists only to be erased through auth.users, which is the path
--      `deleteAccount()` (L1-F8-T1) actually takes.
--
-- SHAPE OF THE FILE
--   M0            fixtures, and the POSITIVE half: a mention is created and its owner can read it.
--   M1            the structural absences — no coordinates, no TTL column, no import_id, no FK to
--                 places or imports. Criteria 1a, 2 and 4; the ABSENCE is the assertion.
--   M2            the second arm: an Instagram link becomes a mention with NO `sources` row, and
--                 `sources.platform`'s check is still refused for a non-TikTok platform (criterion
--                 6 / ruling U3, inside the veto).
--   M3            a mention is never counted as a place: saved_places and places are unchanged.
--   M4            the constraints — U2's `^https://`, the length caps that keep a caption out, and
--                 exactly-one-origin.
--   M5            the column grants: what is not expressible in SQL at all, independently of RLS.
--                 M5a-e are criterion 5 (42501, at the database); M5f is the missing INSERT grant.
--   M6            idempotency, and the no-borrowed-provenance refusal.
--   M7            CONDITION Q: B cannot read, update or delete A's mention. Two real roles.
--   M8            anon holds nothing, and neither browser role may call either writer function.
--   M9            resolving one closes it, first-write-wins, and a cross-user close is refused.
--   M10           deleting the saved place nulls ONLY the pointer and leaves the mention.
--   M11           dismissal is not deletion of the import or the source.
--   M12           no policy anywhere names place_mentions, and sources_select_via_membership still
--                 has exactly its two arms (ruling condition 6, inside the veto).
--   M13           criterion 1b: the mention outlives its `imports` row.
--   M14           CONDITION D1, EXECUTED. Delete the profiles row -> the mention is gone. Delete
--                 the auth.users row -> the mention is gone. B's mention survives both, which is
--                 what stops M14 passing on a schema that simply deleted everything.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THIS FILE HAS NEVER BEEN EXECUTED. NOT ONCE, NOT PARTIALLY, NOT AGAINST ANY DATABASE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Written at base commit `020d1d6`. Measured on the authoring machine and re-measured independently
-- by the orchestrator: the Docker daemon was not running, `127.0.0.1:54322` refused the connection,
-- there is no Postgres client in `node_modules`, and **`psql` is not installed on the machine at
-- all** — so `npm run db:test`, which shells out to a host `psql`, could not have run this file even
-- with the container up. `security-ruling-e1-caption-retention.md` §4 ("What is NOT proven") records
-- the identical unavailability when the ruling that governs `0031` was written, and nothing on the
-- machine changed in between: this is a standing property of the environment, not one day's outage.
--
-- SO IT HAS NOT BEEN SYNTAX-CHECKED BY A SERVER, AND IT HAS NOT BEEN FAILURE-FIRST CHECKED. The
-- house standard for this file type — every assertion seen to FAIL with the control removed and the
-- message it prints, then seen to pass with the control restored (0024's header) — is NOT met.
-- Expect the first real run to find typos here before it finds anything about the schema.
--
-- THE TWO THAT MUST NOT BE READ AS PASSING, because the whole design rests on them and because this
-- project has already caught three instruments that were confidently wrong about exactly this
-- distinction — reading a policy is not testing a policy:
--
--   * **M7a–M7e — CONDITION Q.** A second user cannot read, update or delete another's mention.
--     UNEXECUTED. The ruling does not accept "the policy says so" as evidence for this, including
--     from its own author.
--   * **M14a–M14c — CRITERION 1c / CONDITION D1.** Deleting the `profiles` row, and deleting the
--     `auth.users` row, removes every one of that user's mentions. UNEXECUTED. This FK cascade is
--     the ENTIRE retention bound — there is no TTL, no job and no policy behind it — so reading
--     `confdeltype` (which M1f does) is the weaker check and is not a substitute.
--
-- Until this file has been run against a real container and its output pasted into evidence, the
-- honest statement about `0031` is **"the SQL is written and unverified"**, and the ruling's own
-- terms say it does not land in that state.
--
-- FAILURE-FIRST is the standard this file is written to, and it is the one thing about it that is
-- NOT yet satisfied. The assertions most at risk of being vacuously green are M7 (which is why B has
-- their own mention and reads it in the same block) and M14 (which is why C's row is asserted
-- PRESENT after A's is asserted GONE).

\set a  'a0000000-0000-4000-8000-000000000031'
\set b  'b0000000-0000-4000-8000-000000000031'
\set c  'c0000000-0000-4000-8000-000000000031'

begin;

-- ── fixtures, as the privileged role ──────────────────────────────────────────────────────────
-- The profiles rows are created by handle_new_user() (0002), not here.
insert into auth.users (id, email) values
  (:'a', 'mention-a@example.test'),
  (:'b', 'mention-b@example.test'),
  (:'c', 'mention-c@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('a0000000-0000-4000-8000-000000000031',
                    'b0000000-0000-4000-8000-000000000031',
                    'c0000000-0000-4000-8000-000000000031')) <> 3 then
    raise exception 'FAIL M0: handle_new_user did not create a profile per fixture user';
  end if;
  raise notice 'PASS M0  three fixture users with profiles';
end $$;

-- One import each. start_import() creates the `sources` row and the `imports` row together; the
-- import row is what record_place_mention() checks before it will attach a source to a mention.
select public.start_import(:'a', 'tiktok', '79310000000000031',
                           'https://www.tiktok.com/@m31/video/79310000000000031');
select public.start_import(:'b', 'tiktok', '79310000000000032',
                           'https://www.tiktok.com/@m31/video/79310000000000032');
select public.start_import(:'c', 'tiktok', '79310000000000033',
                           'https://www.tiktok.com/@m31/video/79310000000000033');

select id as src_a from public.sources where platform_source_id = '79310000000000031' \gset
select id as src_b from public.sources where platform_source_id = '79310000000000032' \gset
select id as src_c from public.sources where platform_source_id = '79310000000000033' \gset
select id as imp_a from public.imports where user_id = :'a' and source_id = :'src_a' \gset

-- Two places, deliberately far apart so 0011's 75 m near-duplicate guard cannot merge them.
select public.resolve_place('overture','ovt-m31-a','Mention Fixture Place A',
                            35.6762, 139.6503, 'restaurant', 'restaurant', null,
                            'Tokyo', null, 'JP', '{}'::jsonb) as p_a \gset
select public.resolve_place('overture','ovt-m31-b','Mention Fixture Place B',
                            -33.8688, 151.2093, 'restaurant', 'restaurant', null,
                            'Sydney', null, 'AU', '{}'::jsonb) as p_b \gset

-- DISCHARGE THE FIXTURE'S DEFERRED TRIGGERS HERE, AS THE PRIVILEGED ROLE, AND DO NOT MOVE IT.
--
-- `places_alias_required` (0005, tightened by 0013) is a CONSTRAINT TRIGGER, `deferrable initially
-- deferred`, and `assert_place_has_alias()` is NOT `security definer`. So it does not run when the
-- row is inserted — it runs at COMMIT, or at the first `set constraints all immediate` anywhere
-- later in this transaction, **with the privileges of whatever role is in effect at that moment**.
-- The two inserts above queue one event each and nothing here discharges them.
--
-- What that cost, before this line existed: the first discharge in the file was M9's
-- `set constraints all immediate`, issued while impersonating `authenticated`. It therefore ran
-- these two fixture events as `authenticated`, and `assert_place_has_alias()` reads
-- `places.merged_into_place_id` — a column 0012 deliberately withholds from `authenticated` under
-- a column-level grant. The file aborted at M9 with `permission denied for table places`, having
-- passed 26 of its 38 assertions, and the failure was an artefact of WHEN the discharge happened,
-- not of any policy.
--
-- This is NOT a product defect, and that was established by execution rather than by reading:
--   * `resolve_place` is the only function in `public` whose body inserts into `places`, it is
--     `security definer`, and `authenticated` holds no EXECUTE on it — the call is refused with
--     `permission denied for function resolve_place`. `authenticated` also holds no INSERT on the
--     table itself. So no transaction that `authenticated` can start ever inserts a `places` row.
--   * The real path — `service_role` inserts and `service_role` is still the role at COMMIT —
--     discharges this trigger without complaint.
--   * `security definer` does NOT protect a deferred trigger: the queued event runs under the role
--     in effect at discharge, not the one that queued it. The only thing standing between this
--     harness artefact and a live production defect is that `authenticated` cannot execute
--     `resolve_place`. **If a future migration grants it, this becomes real** — and it will surface
--     as a failure at COMMIT of every save that creates a place, which is the worst place to find
--     it. Treat that grant as forbidden.
--
-- Discharging here, before any `set local role`, is what keeps the three `set constraints all
-- immediate` calls in M9 and M10 honest: with the fixture backlog already cleared, each of those
-- discharges only the events `authenticated` itself just caused, under `authenticated`, which is
-- exactly what a PostgREST commit does — and `saved_places_provenance_required` reads only columns
-- `authenticated` is granted, so it passes for the right reason.
set constraints all immediate;

-- ── M0b: the POSITIVE half — a mention is created by the server writer ────────────────────────
-- Called as the privileged role, which is how the server action reaches it: record_place_mention is
-- granted to `service_role` alone. Everything M5–M8 asserts is refused would be satisfied by a
-- schema in which this call also failed, so this is the control for the whole file.
select public.record_place_mention(
         p_user_id       => :'a',
         p_reason        => 'no_match',
         -- Untrimmed on purpose: the writer normalises, and M6 relies on the normalisation.
         p_raw_name      => '  That Ramen Place In Shibuya ',
         p_source_id     => :'src_a',
         p_city_hint     => 'Tokyo',
         p_area_hint     => 'Shibuya',
         p_category_hint => 'ramen') as m_a1 \gset

-- A second mention for A, from the same post, that A will dismiss (M11).
select public.record_place_mention(
         p_user_id   => :'a',
         p_reason    => 'match_too_weak',
         p_raw_name  => 'The Coffee Place Nobody Could Name',
         p_source_id => :'src_a',
         -- Empty strings are not hints: the writer nulls them, because "extracted, or absent" has
         -- no third state and a blank line on screen reads as knowledge we do not have.
         p_city_hint => '   ') as m_a2 \gset

-- B's own mention. Without it every "B sees zero" assertion below is also satisfied by a deny-all.
select public.record_place_mention(
         p_user_id   => :'b',
         p_reason    => 'skipped_at_review',
         p_raw_name  => 'B''s Own Mention',
         p_source_id => :'src_b') as m_b \gset

-- C's mention exists only to be erased with C's account (M14b).
select public.record_place_mention(
         p_user_id   => :'c',
         p_reason    => 'no_match',
         p_raw_name  => 'C''s Doomed Mention',
         p_source_id => :'src_c') as m_c \gset

select set_config('m31.a',     :'a',     true),
       set_config('m31.b',     :'b',     true),
       set_config('m31.c',     :'c',     true),
       set_config('m31.src_a', :'src_a', true),
       set_config('m31.src_b', :'src_b', true),
       set_config('m31.imp_a', :'imp_a', true),
       set_config('m31.p_a',   :'p_a',   true),
       set_config('m31.p_b',   :'p_b',   true),
       set_config('m31.m_a1',  :'m_a1',  true),
       set_config('m31.m_a2',  :'m_a2',  true),
       set_config('m31.m_b',   :'m_b',   true),
       set_config('m31.m_c',   :'m_c',   true);

do $$
declare r public.place_mentions%rowtype;
begin
  select * into r from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  if not found then raise exception 'FAIL M0b: record_place_mention created no row'; end if;
  if r.user_id <> current_setting('m31.a')::uuid then
    raise exception 'FAIL M0b: the mention belongs to % rather than to A', r.user_id;
  end if;
  if r.raw_name <> 'That Ramen Place In Shibuya' then
    raise exception 'FAIL M0b: raw_name was not trimmed to the caption''s own words: [%]', r.raw_name;
  end if;
  if r.city_hint <> 'Tokyo' or r.area_hint <> 'Shibuya' or r.category_hint <> 'ramen' then
    raise exception 'FAIL M0b: the extracted hints did not land (city=% area=% category=%)',
      r.city_hint, r.area_hint, r.category_hint;
  end if;
  if r.source_id <> current_setting('m31.src_a')::uuid then
    raise exception 'FAIL M0b: source_id did not land';
  end if;
  if r.external_url is not null then
    raise exception 'FAIL M0b: the TikTok arm also wrote external_url — the two arms are not exclusive';
  end if;
  if r.dismissed or r.saved_place_id is not null then
    raise exception 'FAIL M0b: a new mention is not in the open state';
  end if;

  -- "Extracted, or absent." A whitespace-only hint must be null, not a blank string.
  select * into r from public.place_mentions where id = current_setting('m31.m_a2')::uuid;
  if r.city_hint is not null then
    raise exception 'FAIL M0b: a whitespace-only hint was stored as [%] instead of null', r.city_hint;
  end if;
  raise notice 'PASS M0b a mention is created by the server writer, trimmed, with its hints, and empty hints are null';
end $$;

-- ── M1: the structural absences. Criteria 1a, 2 and 4 — the absence IS the assertion ─────────
-- Read from the catalogue rather than from the migration text, so a later ALTER TABLE that adds one
-- of these fails here too. A TTL column would rebuild `imports.expires_at`'s defect under a new
-- name on the one entity that exists to remove it; a coordinate column would mean the task was
-- misunderstood; and with no lat, no lng, no geometry and no path to `places`, "never drawn on the
-- map" is a property of the schema rather than a promise about the renderer.
do $$
declare v text;
begin
  select string_agg(attname, ', ' order by attname) into v
    from pg_attribute
   where attrelid = 'public.place_mentions'::regclass and attnum > 0 and not attisdropped
     and (attname ~* '(^|_)(lat|lng|long|longitude|latitude|geom|geography|point|coord)'
          or attname ~* 'coordinate');
  if v is not null then
    raise exception 'FAIL M1a: place_mentions holds coordinate column(s): %. A mention has no coordinates, is never a pin and is never counted as a place; the moment it acquires one it IS a saved place', v;
  end if;

  select string_agg(attname, ', ' order by attname) into v
    from pg_attribute
   where attrelid = 'public.place_mentions'::regclass and attnum > 0 and not attisdropped
     and (attname ~* '(expires|expiry|deleted|purge|retain|retention|ttl|prune|reap)');
  if v is not null then
    raise exception 'FAIL M1b: place_mentions holds a TTL-shaped column: %. There is no sweeper in this repo (no pg_cron, no supabase/functions/, no delete statement), so a retention timestamp here is a comment pretending to be a control — exactly what imports.expires_at is', v;
  end if;

  if exists (select 1 from pg_attribute
              where attrelid = 'public.place_mentions'::regclass and attnum > 0
                and not attisdropped and attname = 'import_id') then
    raise exception 'FAIL M1c: place_mentions has an import_id. A mention''s lifetime must not be its import''s';
  end if;

  select string_agg(format('%s -> %s', conname, confrelid::regclass), ', ') into v
    from pg_constraint
   where conrelid = 'public.place_mentions'::regclass and contype = 'f'
     and confrelid in ('public.places'::regclass, 'public.imports'::regclass,
                       'public.place_provider_refs'::regclass, 'public.extractions'::regclass);
  if v is not null then
    raise exception 'FAIL M1d: place_mentions references a table it must not: %', v;
  end if;

  -- The other half of criterion 3/4: the only FK to `places` a mention can ever have is through the
  -- saved place it BECAME, and that pointer is nullable and server-written.
  select string_agg(format('%s -> %s', conname, confrelid::regclass), ', ' order by conname) into v
    from pg_constraint
   where conrelid = 'public.place_mentions'::regclass and contype = 'f';
  if v is distinct from 'place_mentions_saved_place_fk -> saved_places, '
                        'place_mentions_source_id_fkey -> sources, '
                        'place_mentions_user_id_fkey -> profiles' then
    raise exception 'FAIL M1e: the foreign-key set is [%], expected exactly profiles (D1), sources and saved_places', v;
  end if;

  raise notice 'PASS M1  no coordinate column, no TTL-shaped column, no import_id, and exactly three foreign keys (profiles, sources, saved_places)';
end $$;

-- D1 read from the catalogue, as the WEAKER SECOND CHECK and labelled as one. This proves the
-- DECLARATION, not the execution: it says the cascade is written, not that it fires. It does not
-- satisfy criterion 1c and it is not a substitute for M14, which is the one that executes a delete.
-- Both are here because the two failures are different — M14 catches a cascade that does not fire,
-- this catches `set null` or `restrict` being written into a later migration by someone who never
-- re-ran M14.
do $$
declare v char;
begin
  select confdeltype into v from pg_constraint
   where conrelid = 'public.place_mentions'::regclass and contype = 'f'
     and confrelid = 'public.profiles'::regclass;
  if v is distinct from 'c' then
    raise exception 'FAIL M1f: place_mentions.user_id -> profiles has ON DELETE % (c=cascade). This edge is the WHOLE retention bound: set null leaves the text orphaned-but-present, restrict makes a mention block account deletion', v;
  end if;
  if exists (select 1 from pg_attribute
              where attrelid = 'public.place_mentions'::regclass
                and attname = 'user_id' and not attnotnull) then
    raise exception 'FAIL M1f: place_mentions.user_id is nullable — a mention with no owner cascades from nothing';
  end if;
  raise notice 'PASS M1f user_id is NOT NULL and cascades from profiles (D1, read from the catalogue)';
end $$;

-- ── M2: the second arm — Instagram works with NO `sources` row (criterion 6 / U3) ─────────────
select count(*) as sources_before from public.sources \gset
select set_config('m31.sources_before', :'sources_before', true);

select public.record_place_mention(
         p_user_id      => :'a',
         p_reason       => 'platform_not_read',
         p_raw_name     => 'Somewhere An Instagram Reel Named',
         p_external_url => 'https://www.instagram.com/reel/ABC123/',
         p_city_hint    => 'Lisbon') as m_a3 \gset

select set_config('m31.m_a3', :'m_a3', true);

do $$
declare r public.place_mentions%rowtype; n bigint;
begin
  select * into r from public.place_mentions where id = current_setting('m31.m_a3')::uuid;
  if not found then raise exception 'FAIL M2a: the non-TikTok arm did not create a mention'; end if;
  if r.source_id is not null then
    raise exception 'FAIL M2a: the Instagram arm attached a source_id';
  end if;
  if r.external_url <> 'https://www.instagram.com/reel/ABC123/' then
    raise exception 'FAIL M2a: external_url is [%]', r.external_url;
  end if;

  select count(*) into n from public.sources;
  if n <> current_setting('m31.sources_before')::bigint then
    raise exception 'FAIL M2a: the Instagram arm inserted % row(s) into the GLOBAL sources table',
      n - current_setting('m31.sources_before')::bigint;
  end if;
  raise notice 'PASS M2a an Instagram link becomes a mention with no sources row at all';
end $$;

-- The other half, and it is the one inside the veto: the check itself is still closed to TikTok.
do $$
begin
  begin
    insert into public.sources (platform, platform_source_id, canonical_url)
    values ('instagram', '79310000000000099', 'https://www.instagram.com/reel/ABC123/');
    raise exception 'FAIL M2b: sources.platform accepted ''instagram'' — the check was widened. sources is GLOBAL and its platform_source_id regex encodes TikTok''s identity model and nobody else''s (ruling U3, inside the veto)';
  exception when check_violation then
    raise notice 'PASS M2b sources.platform still refuses a non-TikTok platform (23514); E1 did not widen it';
  end;
end $$;

-- ── M3: a mention is never counted as a place ────────────────────────────────────────────────
-- Asserted against the tables the three counts are computed from (the library header, the map pins
-- and the profile total all read saved_places / places). Nothing E1 did changed either.
do $$
declare n_saved bigint; n_places bigint;
begin
  select count(*) into n_saved from public.saved_places
   where user_id = current_setting('m31.a')::uuid;
  if n_saved <> 0 then
    raise exception 'FAIL M3: creating four mentions produced % saved_places row(s) for A', n_saved;
  end if;
  select count(*) into n_places from public.places p
   where exists (select 1 from public.saved_places sp
                  where sp.place_id = p.id and sp.user_id = current_setting('m31.a')::uuid);
  if n_places <> 0 then
    raise exception 'FAIL M3: A''s place count is % after keeping four mentions', n_places;
  end if;
  raise notice 'PASS M3  four mentions, zero saved places and zero places — a mention is never counted as one';
end $$;

-- ── M4: the constraints that keep a URL safe and a caption out ───────────────────────────────
do $$
begin
  -- U2. A stored `javascript:` URL rendered into an href is stored XSS, and client-side validation
  -- is not a control. Asserted as the privileged role: this is a CHECK, not a grant or a policy, so
  -- it holds against every writer including the server.
  begin
    insert into public.place_mentions (user_id, reason, raw_name, external_url)
    values (current_setting('m31.a')::uuid, 'platform_not_read', 'xss',
            'javascript:alert(document.cookie)');
    raise exception 'FAIL M4a: a javascript: URL was stored in external_url (U2)';
  exception when check_violation then null;
  end;
  begin
    insert into public.place_mentions (user_id, reason, raw_name, external_url)
    values (current_setting('m31.a')::uuid, 'platform_not_read', 'plain http',
            'http://insecure.example.test/x');
    raise exception 'FAIL M4a: a plain http:// URL was stored in external_url (U2)';
  exception when check_violation then null;
  end;
  raise notice 'PASS M4a external_url refuses javascript: and http:// (U2, at the database)';

  -- The cap is what makes "the extraction, not the caption" enforceable rather than trusted. With
  -- raw_name capped at 200, a caller cannot smuggle a caption in through a permitted column.
  begin
    insert into public.place_mentions (user_id, reason, raw_name, source_id)
    values (current_setting('m31.a')::uuid, 'no_match', repeat('x', 201),
            current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M4b: a 201-character raw_name was accepted — the cap that keeps a caption out is gone';
  exception when check_violation then null;
  end;
  begin
    insert into public.place_mentions (user_id, reason, raw_name, source_id, address_hint)
    values (current_setting('m31.a')::uuid, 'no_match', 'capped hints',
            current_setting('m31.src_a')::uuid, repeat('y', 301));
    raise exception 'FAIL M4b: a 301-character address_hint was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS M4b raw_name and the hints are length-capped: a caption cannot arrive through a permitted column';

  -- Exactly one origin. Neither would be a mention from nowhere; both would be a second, drifting
  -- copy of the post's URL beside sources.canonical_url.
  begin
    insert into public.place_mentions (user_id, reason, raw_name)
    values (current_setting('m31.a')::uuid, 'no_match', 'from nowhere');
    raise exception 'FAIL M4c: a mention with neither a source_id nor an external_url was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.place_mentions (user_id, reason, raw_name, source_id, external_url)
    values (current_setting('m31.a')::uuid, 'no_match', 'from both',
            current_setting('m31.src_a')::uuid, 'https://example.test/x');
    raise exception 'FAIL M4c: a mention with BOTH a source_id and an external_url was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS M4c exactly one of (source_id, external_url) per row';

  -- The closed reason set — the same discipline as imports.error_code. Free text here becomes a
  -- second vocabulary the copy has to render.
  begin
    insert into public.place_mentions (user_id, reason, raw_name, source_id)
    values (current_setting('m31.a')::uuid, 'because i said so', 'open reason',
            current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M4d: reason accepts free text';
  exception when check_violation then null;
  end;
  raise notice 'PASS M4d reason is a closed set';
end $$;

-- ── M5: the column grants — what cannot be expressed in SQL at all ───────────────────────────
-- Criterion 5, and the ruling's refinement of it: the failure code is 42501 and it happens at the
-- DATABASE, not in the UI. A grant holds independently of whether the policy is right, which is why
-- these are separate assertions from M7's.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.place_mentions set raw_name = 'rewritten by the user'
     where id = current_setting('m31.m_a1')::uuid;
    raise exception 'FAIL M5a: raw_name is in the UPDATE grant — a user can rewrite what the post said';
  exception when insufficient_privilege then
    raise notice 'PASS M5a raw_name is not UPDATE-grantable (42501): the post''s words are immutable';
  end;

  begin
    update public.place_mentions set city_hint = 'Paris'
     where id = current_setting('m31.m_a1')::uuid;
    raise exception 'FAIL M5b: a hint is UPDATE-grantable — an extracted value can be turned into an invented one';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.place_mentions set reason = 'skipped_at_review'
     where id = current_setting('m31.m_a1')::uuid;
    raise exception 'FAIL M5b: reason is UPDATE-grantable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS M5b the hints and the reason are not UPDATE-grantable';

  begin
    update public.place_mentions set user_id = current_setting('m31.b')::uuid;
    raise exception 'FAIL M5c: user_id is UPDATE-grantable — a mention can be given away, and the cascade that bounds retention can be re-pointed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.place_mentions set source_id = current_setting('m31.src_b')::uuid;
    raise exception 'FAIL M5c: source_id is UPDATE-grantable — a mention can be re-attributed to a post the user never pasted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS M5c user_id and source_id are not UPDATE-grantable';

  begin
    update public.place_mentions set saved_place_id = gen_random_uuid()
     where id = current_setting('m31.m_a1')::uuid;
    raise exception 'FAIL M5d: saved_place_id is UPDATE-grantable — "this became a place" is forgeable from a browser';
  exception when insufficient_privilege then
    raise notice 'PASS M5d saved_place_id is not UPDATE-grantable; only close_place_mention() writes it';
  end;

  -- The positive half. Without it every assertion above is satisfied by a table nobody can write.
  update public.place_mentions set dismissed = true
   where id = current_setting('m31.m_a2')::uuid;
  if not found then
    raise exception 'FAIL M5e: the owner cannot dismiss their own mention — the one write they have is closed too';
  end if;
  raise notice 'PASS M5e dismissed IS writable by the owner (the grant is not vacuously closed)';

  -- No INSERT grant, at either level. A mention is the product of a deliberate server action.
  begin
    insert into public.place_mentions (user_id, reason, raw_name, source_id)
    values (current_setting('m31.a')::uuid, 'no_match', 'forged from the browser',
            current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M5f: authenticated holds INSERT on place_mentions — a browser can mint mentions naming any source_id it likes';
  exception when insufficient_privilege then
    raise notice 'PASS M5f authenticated holds NO insert on place_mentions; record_place_mention() is the only writer';
  end;
end $$;

-- A can read exactly their own four mentions, and nothing of B's. The positive control for M7.
do $$
declare n bigint;
begin
  select count(*) into n from public.place_mentions
   where id in (current_setting('m31.m_a1')::uuid, current_setting('m31.m_a2')::uuid,
                current_setting('m31.m_a3')::uuid);
  if n <> 3 then
    raise exception 'FAIL M5g: A can read % of their own 3 mentions', n;
  end if;
  select count(*) into n from public.place_mentions
   where id in (current_setting('m31.m_b')::uuid, current_setting('m31.m_c')::uuid);
  if n <> 0 then
    raise exception 'FAIL M5g: A can read % of somebody else''s mentions', n;
  end if;
  raise notice 'PASS M5g A reads their own three mentions and none of B''s or C''s';
end $$;

reset role;

-- ── M6: idempotency, and the no-borrowed-provenance refusal ──────────────────────────────────
do $$
declare v_id uuid; n bigint;
begin
  -- Same user, same source, same name modulo case and whitespace: the second "keep for later" tap
  -- returns the first row rather than minting a duplicate.
  v_id := public.record_place_mention(
            p_user_id   => current_setting('m31.a')::uuid,
            p_reason    => 'no_match',
            p_raw_name  => 'that ramen place in shibuya',
            p_source_id => current_setting('m31.src_a')::uuid);
  if v_id <> current_setting('m31.m_a1')::uuid then
    raise exception 'FAIL M6a: a second identical tap created a new mention (%) instead of returning the first', v_id;
  end if;
  select count(*) into n from public.place_mentions
   where user_id = current_setting('m31.a')::uuid
     and source_id = current_setting('m31.src_a')::uuid;
  if n <> 2 then
    raise exception 'FAIL M6a: A has % mentions from one source, expected 2', n;
  end if;
  raise notice 'PASS M6a keeping the same candidate twice is idempotent';

  -- The no-borrowed-provenance rule, server-side. `sps_insert_own` enforces the same thing in a
  -- policy; a policy cannot help here because service_role bypasses RLS, so the function refuses it.
  begin
    perform public.record_place_mention(
              p_user_id   => current_setting('m31.b')::uuid,
              p_reason    => 'no_match',
              p_raw_name  => 'a post B never pasted',
              p_source_id => current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M6b: B was allowed to attach A''s source to a mention — that is a claim about somebody else''s import history, and it is the shape that becomes a read primitive over cached captions if a membership policy ever names this table';
  exception when insufficient_privilege then
    raise notice 'PASS M6b a mention cannot name a source its owner never imported (42501)';
  end;
end $$;

-- ── M7: CONDITION Q — two real roles, and B gets nothing of A's ──────────────────────────────
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n bigint;
begin
  -- Positive control first, in the same block and the same session, so "B sees zero of A's" cannot
  -- be satisfied by a schema in which B sees nothing at all.
  select count(*) into n from public.place_mentions
   where id = current_setting('m31.m_b')::uuid;
  if n <> 1 then
    raise exception 'FAIL M7a: B cannot read their OWN mention (% rows) — every assertion below would then be vacuous', n;
  end if;

  select count(*) into n from public.place_mentions
   where id in (current_setting('m31.m_a1')::uuid, current_setting('m31.m_a2')::uuid,
                current_setting('m31.m_a3')::uuid);
  if n <> 0 then
    raise exception 'FAIL M7a: B READ % of A''s mentions', n;
  end if;

  -- Unfiltered, because "select * from place_mentions" is what a stolen anon key actually runs.
  select count(*) into n from public.place_mentions
   where user_id <> current_setting('m31.b')::uuid;
  if n <> 0 then
    raise exception 'FAIL M7a: an unfiltered read returned % row(s) belonging to somebody else', n;
  end if;
  raise notice 'PASS M7a B reads their own mention and zero of A''s, filtered or not';
end $$;

do $$
declare n integer;
begin
  update public.place_mentions set dismissed = true
   where id = current_setting('m31.m_a1')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL M7b: B dismissed % of A''s mentions', n;
  end if;

  delete from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL M7c: B DELETED % of A''s mentions', n;
  end if;

  -- And B can delete their own, which is the grant the ruling permits (a mention is not an audit
  -- record). Asserted last in this block because it removes B's positive control.
  delete from public.place_mentions where id = current_setting('m31.m_b')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL M7d: B cannot delete their own mention (% rows) — the DELETE grant is vacuously closed', n;
  end if;
  raise notice 'PASS M7b/c/d B cannot update or delete A''s mentions, and can delete their own';
end $$;

reset role;

do $$
declare r public.place_mentions%rowtype;
begin
  select * into r from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  if not found then raise exception 'FAIL M7e: A''s mention is gone after B''s attempts'; end if;
  if r.dismissed then
    raise exception 'FAIL M7e: B''s update reached A''s row after all (dismissed is now true)';
  end if;
  raise notice 'PASS M7e A''s mention survives B''s attempts unchanged (read as the privileged role)';
end $$;

-- ── M8: anon holds nothing, and no browser role may call either writer ───────────────────────
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  begin
    perform 1 from public.place_mentions;
    raise exception 'FAIL M8a: anon can select from place_mentions';
  exception when insufficient_privilege then
    raise notice 'PASS M8a anon holds no privilege on place_mentions at all (42501)';
  end;
  begin
    perform public.record_place_mention(
              p_user_id => current_setting('m31.a')::uuid, p_reason => 'no_match',
              p_raw_name => 'anon', p_source_id => current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M8b: anon can execute record_place_mention — EXECUTE defaults to PUBLIC on every new function and the revoke did not name public';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.close_place_mention(current_setting('m31.a')::uuid,
                                       current_setting('m31.m_a1')::uuid, gen_random_uuid());
    raise exception 'FAIL M8b: anon can execute close_place_mention';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS M8b anon cannot execute either writer (the revoke named public, not just anon)';
end $$;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    perform public.record_place_mention(
              p_user_id => current_setting('m31.a')::uuid, p_reason => 'no_match',
              p_raw_name => 'from the browser', p_source_id => current_setting('m31.src_a')::uuid);
    raise exception 'FAIL M8c: authenticated can execute record_place_mention. It is SECURITY DEFINER and writes columns the caller holds no grant on, so an EXECUTE grant to a browser role is an escalation (security.md §1 invariant 1, guardrail 18)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.close_place_mention(current_setting('m31.a')::uuid,
                                       current_setting('m31.m_a1')::uuid, gen_random_uuid());
    raise exception 'FAIL M8c: authenticated can execute close_place_mention — "this became a place" is forgeable through the RPC surface';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS M8c neither writer is callable by authenticated (ruling condition 15)';
end $$;

-- ── M9: resolving one closes it ──────────────────────────────────────────────────────────────
-- A adds the place manually, as themselves, through the ordinary client path.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;
select public.save_place(current_setting('m31.p_a')::uuid, null, 'A''s note on the placed mention')
  as sp_a \gset
set constraints all immediate;    -- discharge the deferred provenance triggers on the fixture
reset role;

select set_config('m31.sp_a', :'sp_a', true);

-- B saves a place of their own, so M9c's cross-user close has a real target rather than a made-up
-- uuid that the foreign key would refuse for the wrong reason.
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;
select public.save_place(current_setting('m31.p_b')::uuid, null, 'B''s own place') as sp_b \gset
set constraints all immediate;
reset role;
select set_config('m31.sp_b', :'sp_b', true);

do $$
declare r public.place_mentions%rowtype;
begin
  if not public.close_place_mention(current_setting('m31.a')::uuid,
                                    current_setting('m31.m_a1')::uuid,
                                    current_setting('m31.sp_a')::uuid) then
    raise exception 'FAIL M9a: close_place_mention returned false for the owner''s own mention';
  end if;
  select * into r from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  if r.saved_place_id <> current_setting('m31.sp_a')::uuid then
    raise exception 'FAIL M9a: the pointer to the saved place did not land (%)', r.saved_place_id;
  end if;
  raise notice 'PASS M9a placing a mention writes its pointer to the saved place it became';

  -- First write wins: a mention records the place it became once, and a later call does not repoint
  -- it. Without this a second close could silently rewrite provenance.
  if public.close_place_mention(current_setting('m31.a')::uuid,
                                current_setting('m31.m_a1')::uuid,
                                current_setting('m31.sp_a')::uuid) then
    raise exception 'FAIL M9b: a second close overwrote an already-closed mention';
  end if;
  raise notice 'PASS M9b closing an already-closed mention is a no-op (first write wins)';

  -- A's mention cannot be pointed at B's saved place. The composite FK makes it impossible; the
  -- explicit refusal is what turns a foreign-key violation into a readable 42501.
  begin
    perform public.close_place_mention(current_setting('m31.a')::uuid,
                                       current_setting('m31.m_a2')::uuid,
                                       current_setting('m31.sp_b')::uuid);
    raise exception 'FAIL M9c: A''s mention was pointed at B''s saved place';
  exception when insufficient_privilege then
    raise notice 'PASS M9c a mention cannot point at another user''s saved place (42501, and the composite FK behind it)';
  end;

  -- And the mention is STILL not a place: no coordinates arrived with the pointer.
  select * into r from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  if r.raw_name is null then
    raise exception 'FAIL M9d: closing the mention destroyed what the post said';
  end if;
  raise notice 'PASS M9d a closed mention keeps its own words and still holds no coordinate';
end $$;

-- ── M10: deleting the saved place nulls ONLY the pointer ─────────────────────────────────────
-- `on delete set null (saved_place_id)` names one column on purpose. A plain SET NULL on this
-- composite FK would try to null `user_id` too and fail its NOT NULL; CASCADE would silently
-- destroy the mention; RESTRICT would make a mention block the deletion of a place.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;
delete from public.saved_places where id = current_setting('m31.sp_a')::uuid;
set constraints all immediate;
reset role;

do $$
declare r public.place_mentions%rowtype;
begin
  select * into r from public.place_mentions where id = current_setting('m31.m_a1')::uuid;
  if not found then
    raise exception 'FAIL M10: deleting the saved place DESTROYED the mention — the FK action is cascade, not set null';
  end if;
  if r.saved_place_id is not null then
    raise exception 'FAIL M10: the pointer still names a deleted saved place (%)', r.saved_place_id;
  end if;
  if r.user_id is distinct from current_setting('m31.a')::uuid then
    raise exception 'FAIL M10: the SET NULL action reached user_id (now %) — the column list on the FK action is missing', r.user_id;
  end if;
  if r.raw_name <> 'That Ramen Place In Shibuya' then
    raise exception 'FAIL M10: the mention''s own words changed';
  end if;
  raise notice 'PASS M10 deleting the saved place reopens the mention: only the pointer is nulled, user_id and the text are untouched';
end $$;

-- ── M11: dismissal is not deletion of what it came from ──────────────────────────────────────
do $$
declare n bigint;
begin
  if not (select dismissed from public.place_mentions
           where id = current_setting('m31.m_a2')::uuid) then
    raise exception 'FAIL M11: the mention A dismissed in M5e is not dismissed';
  end if;
  select count(*) into n from public.imports where id = current_setting('m31.imp_a')::uuid;
  if n <> 1 then raise exception 'FAIL M11: dismissing a mention removed the imports row'; end if;
  select count(*) into n from public.sources where id = current_setting('m31.src_a')::uuid;
  if n <> 1 then raise exception 'FAIL M11: dismissing a mention removed the sources row'; end if;
  raise notice 'PASS M11 a dismissed mention is still a row, and the import and the source it came from are untouched';
end $$;

-- ── M12: no policy anywhere names place_mentions (ruling condition 6, inside the veto) ───────
-- The single highest-value target in this schema is `sources_select_via_membership`: security.md §1
-- invariant 2 records that its import-ownership predicate is "the only thing preventing self-granted
-- access to cached caption text". A mentions table wired into it — as a third arm, or named by any
-- policy on sources or extractions — would hand a user read access to any cached caption by naming
-- its source_id. Read structurally, because this is a property of the whole schema rather than of
-- one file, and two migrations that are each correct alone can compose into it.
do $$
declare v text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ') into v
    from pg_policies
   where schemaname = 'public' and tablename <> 'place_mentions'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%place_mentions%';
  if v is not null then
    raise exception 'FAIL M12a: policy/policies on other tables name place_mentions: %', v;
  end if;

  select string_agg(policyname, ', ') into v
    from pg_policies
   where schemaname = 'public' and tablename = 'place_mentions'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         ~* '(collection_|collection_role|can_edit_collection|place_is_in_my_collection|shares_a_collection_with|sources|extractions|imports)';
  if v is not null then
    raise exception 'FAIL M12b: a place_mentions policy names a collections/sources/extractions/imports relation: %. A mention is import history in its purest form and must not be reachable through a shared collection or an invite token', v;
  end if;

  select qual into v from pg_policies
   where schemaname = 'public' and tablename = 'sources'
     and policyname = 'sources_select_via_membership';
  if v is null then
    raise exception 'FAIL M12c: sources_select_via_membership is gone';
  end if;
  if v !~ 'imports' or v !~ 'saved_place_sources' then
    raise exception 'FAIL M12c: sources_select_via_membership lost one of its two arms: %', v;
  end if;
  if v ~* 'place_mentions' then
    raise exception 'FAIL M12c: sources_select_via_membership gained a place_mentions arm — this is the self-granted-caption-access hole';
  end if;

  -- CONDITION 12, the behavioural half of inventory.sql check 2's count assertion. Three is not a
  -- convention: a MISSING policy is a deny and fails loudly in development (RLS is enabled and
  -- FORCED, so a grant with no policy returns 42501 on the first attempt), whereas a policy with no
  -- grant sits inert and then activates SILENTLY, as PERMISSION, the moment an unrelated change
  -- adds the grant. Three is the arrangement whose failure mode is the safe one.
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'place_mentions') <> 3 then
    raise exception 'FAIL M12d: place_mentions has % policies, expected exactly three (select/update/delete own). There is deliberately no INSERT policy, because there is no INSERT grant',
      (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'place_mentions');
  end if;
  raise notice 'PASS M12 no policy names place_mentions, no place_mentions policy names a shared relation, and sources_select_via_membership still has exactly its two arms';
end $$;

-- ── M13: criterion 1b — the mention outlives its import ──────────────────────────────────────
-- `authenticated` holds no DELETE on `imports` by design, so this is the privileged role standing in
-- for the sweeper that does not exist. The point is structural: a mention has no import_id (M1c), so
-- there is no edge for the import's death to travel along.
delete from public.imports where id = current_setting('m31.imp_a')::uuid;

do $$
declare n bigint;
begin
  select count(*) into n from public.place_mentions
   where id in (current_setting('m31.m_a1')::uuid, current_setting('m31.m_a2')::uuid);
  if n <> 2 then
    raise exception 'FAIL M13: % of A''s 2 TikTok mentions survived the deletion of their import', n;
  end if;
  raise notice 'PASS M13 a mention outlives the imports row it came from (criterion 1b)';
end $$;

-- And its owner can still read it. "Present in the table" is not the property; "still theirs" is.
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n bigint;
begin
  select count(*) into n from public.place_mentions
   where id = current_setting('m31.m_a1')::uuid;
  if n <> 1 then
    raise exception 'FAIL M13b: after the import was deleted A can no longer read their own mention';
  end if;
  raise notice 'PASS M13b the owner still reads it: the mention''s lifetime is not its import''s';
end $$;
reset role;

-- ── M14: CONDITION D1, EXECUTED. This is the whole retention bound ───────────────────────────
-- Not read from the foreign key — M1f already does that, and reading it is not proving it. The bound
-- is "the life of the account", there is no TTL and no sweeper, and this cascade is the only edge
-- that removes a mention. It gets executed or it is not verified.
--
-- M14a deletes the `profiles` row (the edge itself). M14b deletes the `auth.users` row, which is the
-- path `deleteAccount()` (L1-F8-T1) actually takes — profiles cascades from auth.users, and mentions
-- cascade from profiles, so this proves the whole chain rather than one link of it.
delete from public.profiles where id = current_setting('m31.a')::uuid;
set constraints all immediate;

do $$
declare n bigint;
begin
  select count(*) into n from public.place_mentions
   where id in (current_setting('m31.m_a1')::uuid, current_setting('m31.m_a2')::uuid,
                current_setting('m31.m_a3')::uuid);
  if n <> 0 then
    raise exception 'FAIL M14a: % of A''s mentions SURVIVED the deletion of their profile. D1 is the entire retention bound — there is no TTL, no job and no policy behind it — and caption-derived text now outlives the account it belonged to', n;
  end if;
  -- The control: C's mention is untouched. Without it M14a passes on a schema that deleted
  -- everything, which would be a different and worse bug.
  select count(*) into n from public.place_mentions where id = current_setting('m31.m_c')::uuid;
  if n <> 1 then
    raise exception 'FAIL M14a: deleting A''s profile also removed C''s mention';
  end if;
  raise notice 'PASS M14a deleting the profiles row removes every one of that user''s mentions, and nobody else''s (D1, executed)';
end $$;

delete from auth.users where id = current_setting('m31.c')::uuid;
set constraints all immediate;

do $$
declare n bigint;
begin
  select count(*) into n from public.place_mentions where id = current_setting('m31.m_c')::uuid;
  if n <> 0 then
    raise exception 'FAIL M14b: C''s mention survived the deletion of their auth.users row — the account-deletion path deleteAccount() takes does not reach this table';
  end if;
  if (select count(*) from public.profiles where id = current_setting('m31.c')::uuid) <> 0 then
    raise exception 'FAIL M14b: the profiles row itself survived, so M14b proved nothing about mentions';
  end if;
  raise notice 'PASS M14b deleting auth.users removes the profile and, through it, every mention — the whole chain deleteAccount() relies on';
end $$;

-- And the `sources` rows are still there, which is correct by design and not an oversight:
-- overnight-deletion-review.md §4.3 and the ruling §11. After the cascade nothing joins a `sources`
-- row to a departed user — place_mentions was the fourth table that could have broken that premise,
-- and D1 is why it does not.
do $$
declare n bigint;
begin
  select count(*) into n from public.sources where id = current_setting('m31.src_a')::uuid;
  if n <> 1 then
    raise exception 'FAIL M14c: deleting A''s account deleted a GLOBAL sources row — that is somebody else''s cache entry, not A''s data (0024:148-153''s argument)';
  end if;
  select count(*) into n from public.place_mentions
   where source_id = current_setting('m31.src_a')::uuid;
  if n <> 0 then
    raise exception 'FAIL M14c: % mention(s) still link that sources row to a departed user — this is the erasure defect condition 11 exists to prevent', n;
  end if;
  raise notice 'PASS M14c the shared sources row survives, and NOTHING links it to the departed user any more (ruling §11, condition 11)';
end $$;

rollback;

\echo '--- 0031 place_mentions policy tests: if you see this line and no FAIL above, every assertion passed and the transaction was rolled back ---'
