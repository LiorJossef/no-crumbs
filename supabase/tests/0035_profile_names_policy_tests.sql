-- 0035_profile_names_policy_tests.sql — the name a user gives the product is not a name the
-- product gives away.
--
-- Task `r2-names-db`. The proof for `supabase/migrations/0035_names_at_sign_up.sql`. Same posture
-- as `0024`, `0031` and `0034`'s test files, and the same deliberate deviation from `08` §3.8:
-- this file creates fixture users in `auth.users`, so it is a TEST and never a migration.
-- Everything happens inside one transaction that is rolled back at the end.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0035_profile_names_policy_tests.sql
-- On a machine with no host `psql` (this project's standing condition — see `0031`'s header), the
-- same thing through the container:
--   docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/0035_profile_names_policy_tests.sql
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
-- `package.json` is outside this lane's write scope, so `db:test:0035` is not yet chained into
-- `npm run db:test`; the orchestrator adds it. Until then this file is a gate only when invoked.
--
-- LIKE 0024, 0031 AND 0034 AND UNLIKE 0008, THIS FILE COUNTS ALMOST NOTHING GLOBAL. Every
-- assertion names its own rows by id, so it runs against a database that already has real data in
-- it — no `supabase db reset` first. The one exception is P1a, which is a read over the profiles
-- that predate this migration and is written as a lower bound rather than an equality.
--
-- P1c IS THE ONE PLACE THIS FILE TOUCHES A REAL USER'S ROW. It updates the display_name of the
-- oldest pre-0035 profile to prove that the eight nameless accounts still work, and the ROLLBACK
-- puts it back. The row is locked for the remainder of the transaction, which is why P1c sits late.
--
-- SHAPE OF THE FILE
--   P0   the sign-up path, demonstrated rather than described: three users created the way GoTrue
--        creates them, with three different metadata shapes, and what actually lands — INCLUDING
--        that a first name supplied at sign-up leaves the peer-visible label null.
--   P1   the eight pre-existing nameless profiles still work.
--   P2   a user can set, read and normalise their own names.
--   P3   NOBODY ELSE CAN — including a collection peer, which is the whole reason this data is not
--        on `profiles`, and including a peer who asks for the whole table rather than one row.
--        P3e is the other half of the question: what the peer sees INSTEAD.
--   P4   the two names are independent objects. first_name never reaches display_name, and
--        display_name never reaches first_name. No trigger, no copy, no derivation.
--   P5   the column grants are real: profile_id, created_at and DELETE are all refused.
--   P6   the retention bound — deleting the auth.users row takes the names with it.
--   P7   FAILURE-FIRST: the rejected design — two columns on `profiles` — really does leak, so P3
--        is known to be load-bearing and not merely green.
--
-- ═══ P7 TAKES A BRIEF LOCK ON `profiles`, AND THAT IS DELIBERATE ══════════════════════════════
-- P7 adds a probe column to `profiles` inside this transaction to demonstrate the disclosure the
-- migration exists to avoid. `alter table` is transactional, so the ROLLBACK removes it and nothing
-- survives; but between P7 and that ROLLBACK a concurrent session touching `profiles` will BLOCK on
-- an ACCESS EXCLUSIVE lock. It is a sub-second window and P7 is placed last so the window is as
-- short as the file can make it. Do not move P7 earlier. (`0034`'s N7 carries the same warning for
-- the same reason.)

\set ua 'a0000000-0000-4000-8000-000000000035'
\set ub 'b0000000-0000-4000-8000-000000000035'
\set uc 'c0000000-0000-4000-8000-000000000035'
\set ud 'd0000000-0000-4000-8000-000000000035'
\set ue 'e0000000-0000-4000-8000-000000000035'
\set uf 'f0000000-0000-4000-8000-000000000035'
\set ug '90000000-0000-4000-8000-000000000035'

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P0. THE SIGN-UP PATH
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Nothing below inserts into `profiles` or `profile_names`. Every row those two tables end up with
-- is created by `on_auth_user_created` -> `handle_new_user()`, which is the claim under test: that
-- a name supplied at sign-up actually arrives.
--
--   ua  our own form's shape          {"first_name":"Maya","last_name":"Cohen"}
--   ub  TODAY'S form's shape          {}                       <- signUp with no options.data
--   uc  a social provider's shape     {"full_name":"Yael Ben Ari"}
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ua', 'names-a@example.test', '{"first_name":"Maya","last_name":"Cohen"}'::jsonb),
  (:'ub', 'names-b@example.test', '{}'::jsonb),
  (:'uc', 'names-c@example.test', '{"full_name":"Yael Ben Ari"}'::jsonb);

do $$
declare v_f text; v_l text; v_d text;
begin
  select pn.first_name, pn.last_name, p.display_name into v_f, v_l, v_d
    from public.profiles p
    left join public.profile_names pn on pn.profile_id = p.id
   where p.id = 'a0000000-0000-4000-8000-000000000035';
  if v_f is distinct from 'Maya' or v_l is distinct from 'Cohen' then
    raise exception 'FAIL P0a: sign-up metadata did not reach profile_names: first=% last=%', v_f, v_l;
  end if;
  -- THE ASSERTION THIS WHOLE MIGRATION TURNS ON. A user typed their name into a sign-up form to
  -- personalise the product. That is not consent to show it to collaborators, so the peer-visible
  -- column must still be null and the sharing surface must still render `A collaborator`. If a
  -- future change derives display_name from first_name, THIS is the assertion that fails.
  if v_d is not null then
    raise exception 'FAIL P0a: a first name given at sign-up leaked into the peer-visible display_name (%)', v_d;
  end if;
  raise notice 'PASS P0a first_name/last_name from signUp metadata land privately, and display_name stays null';
end $$;

do $$
declare n integer; v_d text;
begin
  select count(*) into n from public.profile_names
   where profile_id = 'b0000000-0000-4000-8000-000000000035';
  select display_name into v_d from public.profiles
   where id = 'b0000000-0000-4000-8000-000000000035';
  if n <> 0 then
    raise exception 'FAIL P0b: a user who supplied no name got % profile_names row(s)', n;
  end if;
  if v_d is not null then
    raise exception 'FAIL P0b: display_name is %, expected null', v_d;
  end if;
  if (select count(*) from public.profiles
       where id = 'b0000000-0000-4000-8000-000000000035') <> 1 then
    raise exception 'FAIL P0b: no profile row — 0035 broke the R9 precondition for nameless sign-ups';
  end if;
  raise notice 'PASS P0b today''s sign-up (no options.data) still creates a profile, and no empty name row';
end $$;

do $$
declare v_f text; v_l text; v_d text;
begin
  select pn.first_name, pn.last_name, p.display_name into v_f, v_l, v_d
    from public.profiles p
    left join public.profile_names pn on pn.profile_id = p.id
   where p.id = 'c0000000-0000-4000-8000-000000000035';
  if v_f is distinct from 'Yael' or v_l is distinct from 'Ben Ari' then
    raise exception 'FAIL P0c: full_name split gave first=% last=%', v_f, v_l;
  end if;
  -- `full_name` reaching display_name is 0002's OWN behaviour, byte-identical, and is asserted
  -- here so that a change to it is visible rather than silent. 0035 adds no new key that can reach
  -- this column; the only reason it is populated at all is that this fixture's metadata used one
  -- of 0002's two keys. Whether a social provider's full name belongs on a peer-visible label
  -- without a confirmation is a PRE-EXISTING question, flagged in the ruling, not opened by 0035.
  if v_d is distinct from 'Yael Ben Ari' then
    raise exception 'FAIL P0c: display_name is %, expected 0002''s unchanged full_name behaviour', v_d;
  end if;
  raise notice 'PASS P0c a single full_name splits into the private name, and 0002''s display_name behaviour is unchanged';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P1. THE PROFILES THAT PREDATE THIS MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A lower bound, not an equality: this file is designed to run against a database with real data.
--
-- **The bound is non-vacuity, not a census.** Its job is to stop the assertion below it passing on
-- an empty set — zero pre-0035 profiles would mean zero of them acquired a name, which is true and
-- proves nothing. Eight were measured locally on 2026-08-31; on 2026-09-01 the orchestrator deleted
-- twelve probe accounts left behind by earlier lanes, `profiles` cascades from `auth.users`, and the
-- count became two. **The measurement was destroyed, not the property.**
--
-- So the bound is now 1 and says why. Writing a measured count into an assertion makes the number
-- load-bearing when only its being non-zero ever was — the same shape as `0008`'s whole-table
-- counts, which fail on any database anyone has used.
do $$
declare n_old integer; n_named integer;
begin
  select count(*) into n_old from public.profiles p
   where p.created_at < '2026-08-31 21:00:00+00'
     and p.id not in ('a0000000-0000-4000-8000-000000000035',
                      'b0000000-0000-4000-8000-000000000035',
                      'c0000000-0000-4000-8000-000000000035');
  select count(*) into n_named from public.profiles p
    join public.profile_names pn on pn.profile_id = p.id
   where p.created_at < '2026-08-31 21:00:00+00';
  if n_old < 1 then
    raise exception 'FAIL P1a: no pre-0035 profiles at all, so the name-backfill assertion below would be vacuous';
  end if;
  if n_named <> 0 then
    raise exception 'FAIL P1a: % pre-existing profile(s) acquired a name row out of nowhere', n_named;
  end if;
  raise notice 'PASS P1a % pre-0035 profiles, none of them back-filled with an invented name', n_old;
end $$;

-- A LEFT JOIN over every profile: the shape every rendering site will use, and the assertion is
-- simply that it returns a row per profile and raises nothing.
do $$
declare n_profiles integer; n_joined integer;
begin
  select count(*) into n_profiles from public.profiles;
  select count(*) into n_joined
    from public.profiles p left join public.profile_names pn on pn.profile_id = p.id;
  if n_profiles <> n_joined then
    raise exception 'FAIL P1b: the left join returned % rows for % profiles', n_joined, n_profiles;
  end if;
  raise notice 'PASS P1b every profile joins to at most one name row (% profiles)', n_profiles;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P2. A USER SETS THEIR OWN NAMES, UNDER RLS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
set local role authenticated;

-- ub had no row at all: this is the "add my name after the fact" path, done by the browser role
-- with nothing but the anon key and RLS.
insert into public.profile_names (profile_id, first_name, last_name)
values ('b0000000-0000-4000-8000-000000000035', '  Noa  ', 'Bar');

do $$
declare v_f text; v_l text; v_d text; n integer;
begin
  select first_name, last_name into v_f, v_l from public.profile_names
   where profile_id = 'b0000000-0000-4000-8000-000000000035';
  if v_f is distinct from 'Noa' then
    raise exception 'FAIL P2a: first_name stored as %, expected the trimmed Noa', quote_nullable(v_f);
  end if;
  if v_l is distinct from 'Bar' then
    raise exception 'FAIL P2a: last_name stored as %', quote_nullable(v_l);
  end if;
  -- Read back through the SELECT policy, as the same user: their own name is theirs to read. This
  -- is the half of "who can read a name" that must be YES.
  select count(*) into n from public.profile_names
   where profile_id = 'b0000000-0000-4000-8000-000000000035';
  if n <> 1 then
    raise exception 'FAIL P2a: a user reading their own names got % rows', n;
  end if;
  select display_name into v_d from public.profiles
   where id = 'b0000000-0000-4000-8000-000000000035';
  if v_d is not null then
    raise exception 'FAIL P2a: writing a private name changed the peer-visible label to %', quote_nullable(v_d);
  end if;
  raise notice 'PASS P2a a user inserts, reads and normalises their own names, and the public label is untouched';
end $$;

update public.profile_names set first_name = 'Noya', last_name = '   '
 where profile_id = 'b0000000-0000-4000-8000-000000000035';

do $$
declare v_f text; v_l text; v_c timestamptz; v_u timestamptz;
begin
  select first_name, last_name, created_at, updated_at into v_f, v_l, v_c, v_u
    from public.profile_names where profile_id = 'b0000000-0000-4000-8000-000000000035';
  if v_f is distinct from 'Noya' then
    raise exception 'FAIL P2b: first_name is %', quote_nullable(v_f);
  end if;
  if v_l is not null then
    raise exception 'FAIL P2b: a whitespace-only last_name stored as % instead of null', quote_nullable(v_l);
  end if;
  -- NOT `v_u > v_c`: `touch_updated_at()` calls `now()`, which is the TRANSACTION timestamp, and
  -- this whole file is one transaction — so the two are equal here by construction and an
  -- inequality assertion would fail for the wrong reason. What is assertable is that the trigger
  -- exists and is enabled; `inventory.sql` check 7 asserts it from the other side.
  if v_u is distinct from v_c then
    raise exception 'FAIL P2b: updated_at (%) and created_at (%) differ inside one transaction', v_u, v_c;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'profile_names_touch' and not tgisinternal
                    and tgrelid = 'public.profile_names'::regclass and tgenabled = 'O') then
    raise exception 'FAIL P2b: profile_names_touch is missing or disabled';
  end if;
  raise notice 'PASS P2b editing own names works, whitespace collapses to null, the touch trigger is live';
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P3. NOBODY ELSE — INCLUDING A COLLECTION PEER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ud is ua's collection peer, which is the case this whole design exists for. ud signed up the way
-- our form will: a first and last name, and NO display_name. Built as `postgres` because the point
-- under test is the READ, not the join flow (`0024`'s file tests that).
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ud', 'names-d@example.test', '{"first_name":"Dana","last_name":"Levi"}'::jsonb),
  -- ug supplies no name, so it has NO profile_names row. P3c inserts at it deliberately: aimed at
  -- a user who already has a row, a refusal could come from the primary key rather than from RLS,
  -- and the test would pass while proving nothing.
  (:'ug', 'names-g@example.test', '{}'::jsonb);

insert into public.collections (id, owner_id, name)
values ('c0115000-0000-4000-8000-000000000035', :'ua', 'Names fixture collection');
insert into public.collection_members (collection_id, user_id, role)
values ('c0115000-0000-4000-8000-000000000035', :'ud', 'editor');

select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n_peer integer; n_names integer;
begin
  -- The precondition: ua and ud really do share a collection, so the peer read on `profiles` is
  -- live. Without this the rest of P3 would pass for the wrong reason.
  if not public.shares_a_collection_with('d0000000-0000-4000-8000-000000000035') then
    raise exception 'FAIL P3a: fixture is wrong — ua and ud do not share a collection';
  end if;
  select count(*) into n_peer from public.profiles
   where id = 'd0000000-0000-4000-8000-000000000035';
  if n_peer <> 1 then
    raise exception 'FAIL P3a: fixture is wrong — the peer profiles read returned % row(s)', n_peer;
  end if;

  -- AND THIS IS THE POINT OF THE MIGRATION. The same peer, the same collection, the same anon
  -- key, asking for the row by id: zero rows. On the rejected design — two columns on `profiles` —
  -- this would be 1 and the family name Levi would be in it (P7 proves that end).
  select count(*) into n_names from public.profile_names
   where profile_id = 'd0000000-0000-4000-8000-000000000035';
  if n_names <> 0 then
    raise exception 'FAIL P3a: a collection peer read % profile_names row(s) — the family name is exposed', n_names;
  end if;
  raise notice 'PASS P3a a collection peer can see the peer''s profiles row and ZERO of their name rows';
end $$;

do $$
declare n_all integer; n_mine integer; v_others text;
begin
  -- The adversarial form, not the polite one: do not ask for a row, ask for the TABLE. RLS filters
  -- silently, so "select returned nothing" and "select was never really tried" look identical from
  -- a report — this asks for everything and asserts that everything is exactly one's own row.
  select count(*) into n_all from public.profile_names;
  select count(*) into n_mine from public.profile_names
   where profile_id = 'a0000000-0000-4000-8000-000000000035';
  select string_agg(distinct profile_id::text, ', ') into v_others
    from public.profile_names where profile_id <> 'a0000000-0000-4000-8000-000000000035';
  if v_others is not null then
    raise exception 'FAIL P3b: an unfiltered sweep returned another user''s name rows: %', v_others;
  end if;
  if n_all <> n_mine or n_mine <> 1 then
    raise exception 'FAIL P3b: unfiltered sweep returned % rows, own rows %', n_all, n_mine;
  end if;
  raise notice 'PASS P3b `select * from profile_names` as a peer returns exactly one row: their own';
end $$;

do $$
declare n integer;
begin
  -- Not an error: RLS filters the UPDATE to zero rows. Assert the row is untouched too, because
  -- "0 rows updated" and "updated someone else's row" are distinguishable only by looking.
  update public.profile_names set first_name = 'pwned'
   where profile_id = 'd0000000-0000-4000-8000-000000000035';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL P3c: cross-user UPDATE touched % row(s)', n;
  end if;
  raise notice 'PASS P3c a cross-user UPDATE matches zero rows';
end $$;

do $$
begin
  begin
    insert into public.profile_names (profile_id, first_name)
    values ('90000000-0000-4000-8000-000000000035', 'pwned');
    raise exception 'FAIL P3d: inserting a name row for another user succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS P3d inserting another user''s name row is refused (42501)';
    when unique_violation then
      raise exception 'FAIL P3d: refused for the wrong reason (row already existed) — fixture bug';
    when foreign_key_violation then
      raise exception 'FAIL P3d: refused for the wrong reason (no such profile) — fixture bug';
  end;
end $$;

-- ── P3e. WHAT THE PEER SEES INSTEAD ───────────────────────────────────────────────────────────
-- "The name is withheld" is only half an answer: the sharing surface still has to identify a
-- person. This asserts the input that surface actually gets, so the answer is measured rather than
-- asserted in prose. ud signed up with a first and last name and no display_name, so:
--
--   memberLabel({ displayName: null, isYou: false })  ->  'A collaborator'
--                                       (src/domain/collections/collection.ts:129-136)
--
-- and NOT the email local part, which `emailLocalPart`'s own doc comment refuses by name:
-- "Prefill, never fallback ... that is why `memberLabel` above falls back to `A collaborator`".
-- That fallback is already shipped and is already what every peer sees today, because display_name
-- is null for all 8 real accounts.
do $$
declare v_label text; v_email_visible integer;
begin
  select display_name into v_label from public.profiles
   where id = 'd0000000-0000-4000-8000-000000000035';
  if v_label is not null then
    raise exception 'FAIL P3e: the peer-visible label for a user who only gave a first name is %, expected null so memberLabel renders A collaborator',
      quote_nullable(v_label);
  end if;

  -- And the email is not reachable either: it lives in auth.users, which no browser role can read
  -- at all. If this ever stops raising, the "A collaborator" fallback has a rival nobody chose.
  begin
    select count(*) into v_email_visible from auth.users
     where id = 'd0000000-0000-4000-8000-000000000035';
    raise exception 'FAIL P3e: a browser role can read auth.users (% rows) — the email is exposed', v_email_visible;
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS P3e the peer gets a null label (-> "A collaborator") and cannot reach the email either';
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
begin
  begin
    perform 1 from public.profile_names;
    raise exception 'FAIL P3f: anon can read profile_names';
  exception when insufficient_privilege then
    raise notice 'PASS P3f anon holds nothing on profile_names (42501)';
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P4. THE TWO NAMES ARE INDEPENDENT OBJECTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- An earlier draft of 0035 derived display_name from first_name with a trigger. It was removed:
-- a name typed to personalise the product is not consent to show that name to collaborators, and a
-- trigger that copies one into the other launders the first into the second silently. These
-- assertions are what keep it removed — they fail if anybody re-adds a derivation in either
-- direction.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ue', 'names-e@example.test', '{"first_name":"Ella"}'::jsonb),
  (:'uf', 'names-f@example.test', '{}'::jsonb);

select set_config('request.jwt.claims',
       '{"sub":"e0000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_d text; v_f text;
begin
  -- Direction 1: the private name moves, repeatedly, and the public label never follows.
  update public.profile_names set first_name = 'Eliana', last_name = 'Shalev'
   where profile_id = 'e0000000-0000-4000-8000-000000000035';
  select display_name into v_d from public.profiles
   where id = 'e0000000-0000-4000-8000-000000000035';
  if v_d is not null then
    raise exception 'FAIL P4a: changing first_name set the peer-visible display_name to %', quote_nullable(v_d);
  end if;

  update public.profile_names set first_name = null
   where profile_id = 'e0000000-0000-4000-8000-000000000035';
  select display_name into v_d from public.profiles
   where id = 'e0000000-0000-4000-8000-000000000035';
  if v_d is not null then
    raise exception 'FAIL P4a: clearing first_name wrote % to display_name', quote_nullable(v_d);
  end if;

  -- Direction 2: the user confirms a public label through the prompt, and the private name does
  -- not move either. `update profiles set display_name` is exactly what NamePrompt does today
  -- (src/app/actions/collections.ts:536), under the column grant 0002 gave it.
  update public.profile_names set first_name = 'Eliana'
   where profile_id = 'e0000000-0000-4000-8000-000000000035';
  update public.profiles set display_name = 'El'
   where id = 'e0000000-0000-4000-8000-000000000035';
  select first_name into v_f from public.profile_names
   where profile_id = 'e0000000-0000-4000-8000-000000000035';
  select display_name into v_d from public.profiles
   where id = 'e0000000-0000-4000-8000-000000000035';
  if v_f is distinct from 'Eliana' or v_d is distinct from 'El' then
    raise exception 'FAIL P4a: the two names are coupled — first=% label=%',
      quote_nullable(v_f), quote_nullable(v_d);
  end if;
  raise notice 'PASS P4a first_name and display_name are independent in BOTH directions — no derivation either way';
end $$;

-- And there is no trigger on `profiles` that could reintroduce one. Asserted structurally rather
-- than behaviourally, because a future trigger might only fire on a case P4a does not exercise.
do $$
declare v text;
begin
  select string_agg(tgname, ', ' order by tgname) into v
    from pg_trigger
   where tgrelid = 'public.profiles'::regclass and not tgisinternal
     and tgname <> 'profiles_touch';
  if v is not null then
    raise exception 'FAIL P4b: unexpected trigger(s) on public.profiles: %. 0035 must add none — a trigger here is how a private name reaches the peer-visible column', v;
  end if;
  raise notice 'PASS P4b public.profiles carries exactly one trigger (profiles_touch); 0035 added none';
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P5. THE COLUMN GRANTS ARE REAL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
       '{"sub":"f0000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
set local role authenticated;

insert into public.profile_names (profile_id, first_name, last_name)
values ('f0000000-0000-4000-8000-000000000035', 'Ephraim', 'Mor');

do $$
begin
  begin
    update public.profile_names set profile_id = 'a0000000-0000-4000-8000-000000000035'
     where profile_id = 'f0000000-0000-4000-8000-000000000035';
    raise exception 'FAIL P5a: a name row can be re-parented to another user';
  exception when insufficient_privilege then
    raise notice 'PASS P5a profile_id is not in the UPDATE column grant (42501)';
  end;

  begin
    update public.profile_names set created_at = '2000-01-01'
     where profile_id = 'f0000000-0000-4000-8000-000000000035';
    raise exception 'FAIL P5b: created_at is client-writable';
  exception when insufficient_privilege then
    raise notice 'PASS P5b created_at cannot be backdated by a client (42501)';
  end;

  begin
    delete from public.profile_names
     where profile_id = 'f0000000-0000-4000-8000-000000000035';
    raise exception 'FAIL P5c: DELETE on profile_names is granted';
  exception when insufficient_privilege then
    raise notice 'PASS P5c there is no DELETE grant — a name row dies with its profile';
  end;
end $$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P1c. A REAL PRE-0035 PROFILE STILL WORKS  (late, because it locks a real user's row)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Rolled back with everything else. The point is that the eight nameless accounts are not merely
-- readable but still WRITABLE by their owners after 0035 — on a row with no name row at all.
do $$
declare v_id uuid; v_before text; v_after text;
begin
  select p.id, p.display_name into v_id, v_before
    from public.profiles p
    left join public.profile_names pn on pn.profile_id = p.id
   where pn.profile_id is null
     and p.created_at < '2026-08-31 21:00:00+00'
   order by p.created_at
   limit 1;
  if v_id is null then
    raise notice 'SKIP P1c no pre-0035 nameless profile on this database';
    return;
  end if;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set display_name = 'Legacy Row Check'
   where id = v_id;
  select display_name into v_after from public.profiles where id = v_id;
  reset role;

  if v_after is distinct from 'Legacy Row Check' then
    raise exception 'FAIL P1c: a pre-0035 profile (%) could not be renamed by its owner: %',
      v_id, quote_nullable(v_after);
  end if;
  raise notice 'PASS P1c pre-0035 profile % still writable by its owner (was %) — rolled back',
    v_id, quote_nullable(v_before);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P6. THE RETENTION BOUND
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole "forget me" story for this data, and it is structural: no job, no soft delete, no
-- column to get wrong. Deleting the fixture's auth.users row must take the profile and the names.
delete from auth.users where id = :'uf';

do $$
declare n_p integer; n_n integer;
begin
  select count(*) into n_p from public.profiles
   where id = 'f0000000-0000-4000-8000-000000000035';
  select count(*) into n_n from public.profile_names
   where profile_id = 'f0000000-0000-4000-8000-000000000035';
  if n_p <> 0 or n_n <> 0 then
    raise exception 'FAIL P6: deleting the account left % profile and % name row(s)', n_p, n_n;
  end if;
  raise notice 'PASS P6 the name dies with the account, by cascade, with nothing scheduled';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P7. FAILURE-FIRST — THE REJECTED DESIGN, RUN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- P3 is only worth something if the alternative it rejects would actually have failed. So: add a
-- name column to `profiles` the way the obvious build would have, and have the SAME collection peer
-- read it. It works, because `grant select on public.profiles to authenticated` (0002:24, 0008:57)
-- is table-level and `profiles_select_collection_peers` (0024:589) is row-level, and no third thing
-- stands between them. Rolled back with everything else.
alter table public.profiles add column probe_family_name text;
update public.profiles set probe_family_name = 'Levi'
 where id = 'd0000000-0000-4000-8000-000000000035';

select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v text;
begin
  select probe_family_name into v from public.profiles
   where id = 'd0000000-0000-4000-8000-000000000035';
  if v is distinct from 'Levi' then
    raise exception 'FAIL P7: the control did not reproduce — a peer could NOT read the probe column (got %). Either the peer policy or the table-level SELECT grant has changed, and P3 no longer proves what it claims',
      quote_nullable(v);
  end if;
  raise notice 'PASS P7 control reproduced: a name column ON `profiles` IS readable by a collection peer (read back %) — which is why 0035 puts names on their own table', v;
end $$;

reset role;

rollback;
