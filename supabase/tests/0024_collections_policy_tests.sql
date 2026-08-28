-- 0024_collections_policy_tests.sql — the authorisation proof for shared collections (0024).
--
-- Same posture as 0008_policy_tests.sql, and the same deliberate deviation from `08` §3.8: this
-- file creates fixture users in auth.users, so it is a TEST and never a migration. Everything it
-- does happens inside one transaction that is rolled back at the end; nothing survives, and
-- production never sees it.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0024_collections_policy_tests.sql
-- or:   npm run db:test:0024
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
--
-- `npm run db:test` runs supabase/tests/0008_policy_tests.sql and then this file, as two
-- separate psql invocations chained with &&, and CI (.github/workflows/ci.yml) runs that one
-- command. Two scripts rather than one file, because the two have different preconditions:
-- 0008 requires an EMPTY database (its older assertions count all rows in a table), this one
-- does not. Both are a single transaction ending in ROLLBACK, so neither leaves state for the
-- other and the order is not load-bearing; that was measured, not assumed.
--
-- SAME HARNESS PREREQUISITE as 0008: on a bare postgres image auth.uid() reads the LEGACY singular
-- `request.jwt.claim.sub` GUC while this file sets the modern `request.jwt.claims` JSON. If the
-- first save_place() below aborts with `not authenticated`, that is the image, not a policy — the
-- replacement auth.uid() is written out in 0008_policy_tests.sql's header.
--
-- UNLIKE THE OLDER HALF OF 0008, THIS FILE COUNTS NOTHING GLOBAL. Every assertion names its own
-- rows by id, exactly as 0008's P25/P26 sections do, so it runs correctly against a database that
-- already has real data in it. That is not a stylistic preference: the point of these tests is to
-- be runnable against the local container the app is actually being developed on, without a
-- `supabase db reset` first — a reset throws away cached `extractions` rows that cost real model
-- calls against a daily ceiling.
--
-- FOUR USERS, because three is not enough to test sharing:
--   A  owner of the collection
--   B  editor  — the collaborator; also has a library of their own
--   C  viewer  — invited, present, and allowed to change nothing
--   D  non-member — the adversary; every "sees zero" assertion is D's
--
-- SHAPE OF THE FILE
--   C0            fixtures, and the POSITIVE half. Without it every "D sees zero" assertion below
--                 is also satisfied by a schema in which nobody can read anything.
--   C1            the 0024 P0 fix: save_place writes saved_places.source_url again.
--   C2            the non-member sees zero rows of all four tables (spec assertion 1).
--   C3            insert an item: editor yes, viewer no, non-member no (spec assertion 2).
--   C4            an editor may not add a place that is not in their own library (assertion 3).
--   C5            the shared-identity boundary: the collaborator reads `places`, and does NOT read
--                 the adder's `saved_places` overlay (assertion 4). This is the one that matters.
--   C6            join_collection_via_token: live / revoked / expired / owner-not-downgraded (5).
--   C6e / C6f     preview_collection_invite: one row live, zero rows for revoked, expired and a
--                 random uuid, asked as a non-member; already_member for someone already in; and
--                 not callable by anon at all (C8).
--   C7            the owner's membership row is immovable, and there can be only one (6).
--   C8            anon is denied on all four new tables and every new function (7).
--   C9            the column grants — what is not expressible in SQL at all, independently of RLS,
--                 including C9f: INSERT is column-level, so an invite token cannot be chosen by
--                 the client.
--
-- FAILURE-FIRST. Every assertion here was checked in both directions on a throwaway database
-- replayed from migration 0001: the control removed, the test seen to FAIL with the message it
-- prints, the control restored. The two that are easiest to write as always-green, and were
-- therefore checked hardest, are C5 (a `saved_places` read that must return zero without the whole
-- suite being a deny-all) and C6's uniform-failure assertion (which compares the two SQLSTATE and
-- MESSAGE pairs to each other rather than to a constant, so it cannot pass by both being wrong in
-- different ways).

begin;

-- ── fixtures, as the privileged role ──────────────────────────────────────────────────────────
-- The profiles rows are created by handle_new_user() (0002), not here.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000024', 'coll-a@example.test'),
  ('b0000000-0000-4000-8000-000000000024', 'coll-b@example.test'),
  ('c0000000-0000-4000-8000-000000000024', 'coll-c@example.test'),
  ('d0000000-0000-4000-8000-000000000024', 'coll-d@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('a0000000-0000-4000-8000-000000000024','b0000000-0000-4000-8000-000000000024',
                    'c0000000-0000-4000-8000-000000000024','d0000000-0000-4000-8000-000000000024')) <> 4 then
    raise exception 'FAIL C0: handle_new_user did not create a profile per fixture user';
  end if;
  raise notice 'PASS C0  four fixture users with profiles';
end $$;

update public.profiles set display_name = 'Ada the Owner'
 where id = 'a0000000-0000-4000-8000-000000000024';

-- One source, so the save that exercises the restored source_url path has provenance to copy.
select public.start_import('a0000000-0000-4000-8000-000000000024',
                           'tiktok', '7924000000000000024',
                           'https://www.tiktok.com/@coll/video/7924000000000000024');
update public.sources
   set fetch_status = 'ok', fetched_at = now(), content_text = 'collections fixture',
       thumbnail_url = 'https://cdn.example.test/thumb-0024.jpg'
 where platform_source_id = '7924000000000000024';
select id as source_id from public.sources where platform_source_id = '7924000000000000024' \gset

-- Three places, deliberately far apart so 0011's 75 m near-duplicate guard cannot merge them into
-- each other and quietly collapse the fixture.
select public.resolve_place('overture','ovt-c24-shared','Collections Fixture Shared',
                            31.7683, 35.2137, 'restaurant', 'restaurant', null,
                            'Jerusalem', null, 'IL', '{}'::jsonb) as p_shared \gset
select public.resolve_place('overture','ovt-c24-bonly','Collections Fixture B Only',
                            51.5074, -0.1278, 'restaurant', 'restaurant', null,
                            'London', null, 'GB', '{}'::jsonb) as p_bonly \gset
select public.resolve_place('overture','ovt-c24-secret','Collections Fixture Nobody Shares',
                            35.6762, 139.6503, 'restaurant', 'restaurant', null,
                            'Tokyo', null, 'JP', '{}'::jsonb) as p_secret \gset
-- A place the VIEWER saves and that is never added to the collection. C3b needs it so that the
-- viewer's refused insert is refused by can_edit_collection ALONE: if the row were also missing
-- from the viewer's own library, the saved_places conjunct would refuse it too and the assertion
-- would keep passing after 'viewer' was accidentally given edit rights.
select public.resolve_place('overture','ovt-c24-cown','Collections Fixture Viewer Own',
                            -33.8688, 151.2093, 'restaurant', 'restaurant', null,
                            'Sydney', null, 'AU', '{}'::jsonb) as p_cown \gset

-- Fixture ids as transaction-local GUCs: psql does not interpolate :vars inside a dollar-quoted
-- body, and most assertions below must name a row from inside a do block while running as a role
-- that cannot select it. Same harness channel 0008 uses; nothing in the application does this.
select set_config('c24.p_shared', :'p_shared', true),
       set_config('c24.p_bonly',  :'p_bonly',  true),
       set_config('c24.p_secret', :'p_secret', true),
       set_config('c24.p_cown',   :'p_cown',   true),
       set_config('c24.source',   :'source_id', true),
       set_config('c24.a', 'a0000000-0000-4000-8000-000000000024', true),
       set_config('c24.b', 'b0000000-0000-4000-8000-000000000024', true),
       set_config('c24.c', 'c0000000-0000-4000-8000-000000000024', true),
       set_config('c24.d', 'd0000000-0000-4000-8000-000000000024', true);

-- ── A saves the shared place (with provenance) and the secret one, under RLS ──────────────────
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

select public.save_place(:'p_shared', :'source_id', 'A''s private note about the shared place');
select public.save_place(:'p_secret', null, 'A''s private note about a place nobody shares');

-- ── C1: the 0024 P0 fix — save_place writes saved_places.source_url again ─────────────────────
-- 0016 added apply_saved_place_source_link and had save_place call it; 0017 recreated save_place
-- for the new p_extracted_reason argument and dropped the call, so the column has been null on
-- every import since. On the pre-0024 schema this assertion FAILS, which is the point of it.
do $$
declare v_url text; v_thumb text;
begin
  select source_url, source_thumbnail_url into v_url, v_thumb
    from public.saved_places
   where user_id = current_setting('c24.a')::uuid
     and place_id = current_setting('c24.p_shared')::uuid;
  if v_url is null then
    raise exception 'FAIL C1: save_place did not denormalise source_url — 0017''s regression is back';
  end if;
  if v_thumb is null then
    raise exception 'FAIL C1: save_place did not denormalise source_thumbnail_url';
  end if;
  raise notice 'PASS C1  save_place denormalises source_url and source_thumbnail_url (0017 regression fixed)';
end $$;

-- ── A creates the collection ──────────────────────────────────────────────────────────────────
-- RETURNING is used deliberately: PostgREST always inserts with RETURNING, and the SELECT policy
-- is applied to the returned tuple DURING the insert — before the AFTER trigger that seats the
-- owner's membership row has fired. A collections_select policy of `collection_role(id) is not
-- null` alone therefore makes this statement fail 42501 and makes the feature unusable from the
-- client. This is the regression test for that; it is why the policy carries an owner_id arm.
do $$
declare v_id uuid;
begin
  insert into public.collections (owner_id, name, description)
  values (current_setting('c24.a')::uuid, 'Jerusalem weekend', 'Places to try')
  returning id into v_id;
  perform set_config('c24.coll', v_id::text, true);
  raise notice 'PASS C0b insert .. returning works: the SELECT policy admits the creator''s own new row';
exception when insufficient_privilege then
  raise exception 'FAIL C0b: insert into collections .. returning was refused (42501) — PostgREST could never create a collection';
end $$;

do $$
declare v_role text;
begin
  select role into v_role from public.collection_members
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.a')::uuid;
  if v_role is distinct from 'owner' then
    raise exception 'FAIL C0c: the AFTER INSERT trigger did not seat A as owner (role=%)', v_role;
  end if;
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'owner' then
    raise exception 'FAIL C0c: collection_role() does not agree that A is the owner';
  end if;
  if not public.can_edit_collection(current_setting('c24.coll')::uuid) then
    raise exception 'FAIL C0c: can_edit_collection() says the owner may not edit';
  end if;
  raise notice 'PASS C0c the owner membership row is created by trigger, and both helpers agree';
end $$;

-- A adds the shared place, and creates the three invites the join tests need.
do $$
begin
  insert into public.collection_items (collection_id, place_id, added_by, note)
  values (current_setting('c24.coll')::uuid, current_setting('c24.p_shared')::uuid,
          current_setting('c24.a')::uuid, 'shared item note');
  raise notice 'PASS C0d the owner can add an item they have saved';
end $$;

do $$
declare v_live uuid; v_revoked uuid; v_expired uuid; v_viewer uuid;
begin
  insert into public.collection_invites (collection_id, role, created_by)
  values (current_setting('c24.coll')::uuid, 'editor', current_setting('c24.a')::uuid)
  returning token into v_live;

  insert into public.collection_invites (collection_id, role, created_by)
  values (current_setting('c24.coll')::uuid, 'viewer', current_setting('c24.a')::uuid)
  returning token into v_viewer;

  -- Created LIVE and then revoked through the one UPDATE grant that exists, because `revoked_at`
  -- is deliberately not INSERT-grantable: an invite that arrives already revoked is not a state
  -- the product has. This is also the positive half of the revoked_at grant.
  insert into public.collection_invites (collection_id, role, created_by)
  values (current_setting('c24.coll')::uuid, 'editor', current_setting('c24.a')::uuid)
  returning token into v_revoked;
  update public.collection_invites set revoked_at = now() where token = v_revoked;
  if not found then raise exception 'FAIL C0e: the owner could not revoke their own invite'; end if;

  insert into public.collection_invites (collection_id, role, created_by, expires_at)
  values (current_setting('c24.coll')::uuid, 'editor', current_setting('c24.a')::uuid,
          now() - interval '1 day')
  returning token into v_expired;

  perform set_config('c24.tok_live',    v_live::text,    true),
          set_config('c24.tok_viewer',  v_viewer::text,  true),
          set_config('c24.tok_revoked', v_revoked::text, true),
          set_config('c24.tok_expired', v_expired::text, true);
  raise notice 'PASS C0e the owner can mint invites (live, viewer, revoked, expired)';
end $$;

-- ── C6a: B redeems the live editor token; C redeems the viewer token ─────────────────────────
-- Placed here rather than in file order because everything after it needs B and C to be members.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_coll uuid;
begin
  v_coll := public.join_collection_via_token(current_setting('c24.tok_live')::uuid);
  if v_coll is distinct from current_setting('c24.coll')::uuid then
    raise exception 'FAIL C6a: join returned % instead of the collection id', v_coll;
  end if;
  if public.collection_role(v_coll) <> 'editor' then
    raise exception 'FAIL C6a: B joined with role % instead of editor', public.collection_role(v_coll);
  end if;
  raise notice 'PASS C6a a live token makes B an editor, and returns the collection id';
end $$;

-- B has a library of their own: one place only they saved, used by C4.
select public.save_place(current_setting('c24.p_bonly')::uuid, null, 'B''s own place');

-- Re-redeeming does not change anything, and a *viewer* token does not demote an existing editor.
do $$
begin
  perform public.join_collection_via_token(current_setting('c24.tok_viewer')::uuid);
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'editor' then
    raise exception 'FAIL C6b: redeeming a viewer token DEMOTED an existing editor';
  end if;
  raise notice 'PASS C6b redeeming a second, lower-privilege token does not downgrade an existing member';
end $$;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.join_collection_via_token(current_setting('c24.tok_viewer')::uuid);
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'viewer' then
    raise exception 'FAIL C6a-ii: C joined with role % instead of viewer',
      public.collection_role(current_setting('c24.coll')::uuid);
  end if;
  raise notice 'PASS C6a-ii a viewer token makes C a viewer';
end $$;

-- ── C6c: the OWNER redeems a viewer link to their own collection ──────────────────────────────
-- The scenario that an ON CONFLICT DO UPDATE would turn into a self-lockout: A clicks the link
-- they just sent. The role must still be 'owner' afterwards, and the one-owner index must be
-- intact.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.join_collection_via_token(current_setting('c24.tok_viewer')::uuid);
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'owner' then
    raise exception 'FAIL C6c: the owner DEMOTED THEMSELVES by clicking their own invite link';
  end if;
  raise notice 'PASS C6c redeeming an invite never downgrades the owner';
end $$;

-- ── C6d: revoked and expired fail IDENTICALLY, and identically to an unknown token ────────────
-- The two SQLSTATE/MESSAGE pairs are compared to EACH OTHER, not to a constant. A test that
-- asserted `sqlstate = '22023'` three times would pass just as happily if the three messages
-- differed, which is the whole property being tested.
do $$
declare
  s_unknown text; m_unknown text;
  s_revoked text; m_revoked text;
  s_expired text; m_expired text;
begin
  begin
    perform public.join_collection_via_token('00000000-0000-4000-8000-0000000000ff');
    raise exception 'FAIL C6d: an unknown token was accepted';
  exception when others then
    get stacked diagnostics s_unknown = returned_sqlstate, m_unknown = message_text;
  end;
  begin
    perform public.join_collection_via_token(current_setting('c24.tok_revoked')::uuid);
    raise exception 'FAIL C6d: a REVOKED token was accepted';
  exception when others then
    get stacked diagnostics s_revoked = returned_sqlstate, m_revoked = message_text;
  end;
  begin
    perform public.join_collection_via_token(current_setting('c24.tok_expired')::uuid);
    raise exception 'FAIL C6d: an EXPIRED token was accepted';
  exception when others then
    get stacked diagnostics s_expired = returned_sqlstate, m_expired = message_text;
  end;

  if s_unknown <> '22023' then
    raise exception 'FAIL C6d: unknown token raised % (%), expected 22023', s_unknown, m_unknown;
  end if;
  if (s_revoked, m_revoked) is distinct from (s_unknown, m_unknown) then
    raise exception 'FAIL C6d: a revoked token is distinguishable from an unknown one: [% %] vs [% %]',
      s_revoked, m_revoked, s_unknown, m_unknown;
  end if;
  if (s_expired, m_expired) is distinct from (s_unknown, m_unknown) then
    raise exception 'FAIL C6d: an expired token is distinguishable from an unknown one: [% %] vs [% %]',
      s_expired, m_expired, s_unknown, m_unknown;
  end if;
  raise notice 'PASS C6d unknown, revoked and expired tokens fail identically (% / %)', s_unknown, m_unknown;
end $$;

-- ── C0f: the positive half — every member reads what they are entitled to ─────────────────────
do $$
declare n integer;
begin
  select count(*) into n from public.collections where id = current_setting('c24.coll')::uuid;
  if n <> 1 then raise exception 'FAIL C0f: the owner cannot read their own collection'; end if;
  select count(*) into n from public.collection_members
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 3 then raise exception 'FAIL C0f: the owner sees % of 3 members', n; end if;
  select count(*) into n from public.collection_items
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 1 then raise exception 'FAIL C0f: the owner sees % of 1 item', n; end if;
  select count(*) into n from public.collection_invites
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 4 then raise exception 'FAIL C0f: the owner sees % of 4 invites', n; end if;
  raise notice 'PASS C0f the owner reads their collection, all 3 members, 1 item and all 4 invites';
end $$;

-- ── C3a / C5: as the EDITOR B ─────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n integer;
begin
  -- C5-i: the collaborator CAN read the shared place's identity row. Asserted before the denial
  -- below so that "B sees zero saved_places" is a zero produced by a policy and not by B being
  -- unable to see anything at all.
  select count(*) into n from public.places where id = current_setting('c24.p_shared')::uuid;
  if n <> 1 then
    raise exception 'FAIL C5-i: the collaborator cannot read the shared place (places_select_if_in_shared_collection is not working)';
  end if;

  -- C5-ii: and CANNOT read A's saved_places overlay for that same place. This is the boundary the
  -- whole migration is about — note, visit_state, tags, why_go, extracted_reason and source_url
  -- must not travel with a share.
  select count(*) into n from public.saved_places
   where user_id = current_setting('c24.a')::uuid;
  if n <> 0 then
    raise exception 'FAIL C5-ii: the collaborator can read % of A''s saved_places rows', n;
  end if;

  -- C5-iii: nor the place A saved but never shared.
  select count(*) into n from public.places where id = current_setting('c24.p_secret')::uuid;
  if n <> 0 then
    raise exception 'FAIL C5-iii: a place A never shared is visible to the collaborator';
  end if;

  -- C5-iv: nor A's provenance — which TikTok A saved it from is A's import history, not the
  -- collection's content.
  select count(*) into n from public.saved_place_sources
   where user_id = current_setting('c24.a')::uuid;
  if n <> 0 then raise exception 'FAIL C5-iv: the collaborator can read A''s provenance rows'; end if;
  select count(*) into n from (select id from public.sources
                                where id = current_setting('c24.source')::uuid) s;
  if n <> 0 then raise exception 'FAIL C5-iv: the collaborator can read the source A imported'; end if;

  -- C5-v: nor A's provider aliases for the shared place. Only `places` opened, nothing else.
  select count(*) into n from public.place_provider_refs
   where place_id = current_setting('c24.p_shared')::uuid;
  if n <> 0 then
    raise exception 'FAIL C5-v: place_provider_refs opened for a collaborator; only `places` should have';
  end if;

  raise notice 'PASS C5  the collaborator reads the shared place identity and NOTHING of A''s private overlay, provenance or aliases';
end $$;

-- C5-vi: the peer profile read, which is what makes "added by <name>" renderable — and nothing
-- wider than that. D is not a peer, so D's profile must stay invisible to B.
do $$
declare v_name text; n integer;
begin
  select display_name into v_name from public.profiles where id = current_setting('c24.a')::uuid;
  if v_name is distinct from 'Ada the Owner' then
    raise exception 'FAIL C5-vi: a collection peer''s display_name is not readable (got %)', v_name;
  end if;
  select count(*) into n from public.profiles where id = current_setting('c24.d')::uuid;
  if n <> 0 then
    raise exception 'FAIL C5-vi: a NON-peer''s profile is readable — shares_a_collection_with is too wide';
  end if;
  raise notice 'PASS C5-vi a collection peer''s display_name is readable; a non-peer''s profile is not';
end $$;

-- C3a: the editor can add an item from their own library.
do $$
begin
  insert into public.collection_items (collection_id, place_id, added_by)
  values (current_setting('c24.coll')::uuid, current_setting('c24.p_bonly')::uuid,
          current_setting('c24.b')::uuid);
  raise notice 'PASS C3a an editor can add an item';
end $$;

-- C4: ...but not a place that is not in their own saved_places. Without this conjunct
-- collection_items would be a write-anything pointer into the global places table, and
-- places_select_if_in_shared_collection would turn that into a read primitive over every place row
-- in the database.
do $$
begin
  insert into public.collection_items (collection_id, place_id, added_by)
  values (current_setting('c24.coll')::uuid, current_setting('c24.p_secret')::uuid,
          current_setting('c24.b')::uuid);
  raise exception 'FAIL C4: an editor added a place that is NOT in their own library';
exception when insufficient_privilege then
  raise notice 'PASS C4  an editor cannot add a place that is not in their own library (42501)';
end $$;

-- C4b: nor forge the attribution of an item they do add. p_bonly is used deliberately: B can edit
-- the collection AND has p_bonly in their own library, so the only conjunct left to refuse this is
-- `added_by = auth.uid()`. RLS WITH CHECK is evaluated before the unique index, so the duplicate
-- (collection_id, place_id) does not shadow the policy — and the unique_violation handler below
-- reports it as INCONCLUSIVE rather than as a pass if that ever stops being true.
do $$
begin
  insert into public.collection_items (collection_id, place_id, added_by)
  values (current_setting('c24.coll')::uuid, current_setting('c24.p_bonly')::uuid,
          current_setting('c24.a')::uuid);
  raise exception 'FAIL C4b: an editor inserted an item attributed to someone else';
exception
  when insufficient_privilege then
    raise notice 'PASS C4b added_by cannot be forged (42501)';
  when unique_violation then
    raise exception 'FAIL C4b: inconclusive — the unique constraint fired before the policy did';
end $$;

-- C7a: an editor cannot promote themselves, remove the owner, or read the invite tokens.
do $$
declare n integer;
begin
  update public.collection_members set role = 'editor'
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.a')::uuid;
  if found then raise exception 'FAIL C7a: an editor demoted the owner'; end if;

  update public.collection_members set role = 'owner'
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.b')::uuid;
  if found then raise exception 'FAIL C7a: an editor promoted themselves to owner'; end if;

  -- `0026` revoked the DELETE grant entirely and moved ending a membership into
  -- `end_collection_membership`, so this refusal is now a privilege denial rather than a zero-row
  -- RLS match — strictly stronger, and checked as such: a bare DELETE must not even be expressible.
  begin
    delete from public.collection_members
     where collection_id = current_setting('c24.coll')::uuid
       and user_id = current_setting('c24.a')::uuid;
    raise exception 'FAIL C7a: DELETE on collection_members is still granted to authenticated';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                             current_setting('c24.a')::uuid);
    raise exception 'FAIL C7a: an editor removed the owner';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.collection_invites
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C7a: an editor can read % invite tokens', n; end if;

  raise notice 'PASS C7a an editor cannot demote the owner, promote themselves, remove the owner, or read a token';
end $$;

-- ── C3b: as the VIEWER C ──────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n integer;
begin
  -- The positive half: a viewer really is inside the collection.
  select count(*) into n from public.collection_items
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 2 then raise exception 'FAIL C3b: the viewer sees % of 2 items', n; end if;

  -- C saved nothing, so the saved_places conjunct would refuse the insert below on its own. Save
  -- the place first, as C, so the ONLY thing left to refuse it is can_edit_collection — otherwise
  -- this assertion passes for the wrong reason and would keep passing if 'viewer' were given edit
  -- rights by mistake.
  perform public.save_place(current_setting('c24.p_cown')::uuid, null, null);

  begin
    insert into public.collection_items (collection_id, place_id, added_by)
    values (current_setting('c24.coll')::uuid, current_setting('c24.p_cown')::uuid,
            current_setting('c24.c')::uuid);
    raise exception 'FAIL C3b: a VIEWER inserted an item';
  exception when insufficient_privilege then
    null;
  end;

  -- ...and cannot edit or remove one either.
  update public.collection_items set note = 'viewer edit'
   where collection_id = current_setting('c24.coll')::uuid;
  if found then raise exception 'FAIL C3b: a viewer edited an item'; end if;

  delete from public.collection_items where collection_id = current_setting('c24.coll')::uuid;
  if found then raise exception 'FAIL C3b: a viewer deleted an item'; end if;

  raise notice 'PASS C3b a viewer reads the items but can neither add, edit nor delete one';
end $$;

-- C3b-ii: a viewer CAN leave. The one membership write a non-owner is allowed.
do $$
declare n integer;
begin
  -- Leaving is `end_collection_membership` on yourself since `0026`; the DELETE grant is gone.
  perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                           current_setting('c24.c')::uuid);
  if public.collection_role(current_setting('c24.coll')::uuid) is not null then
    raise exception 'FAIL C3b-ii: a viewer could not leave the collection';
  end if;
  select count(*) into n from public.collections where id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C3b-ii: after leaving, C can still read the collection'; end if;
  raise notice 'PASS C3b-ii a member can leave, and loses their read the moment they do';
end $$;

-- Put C back, as the privileged role, so the C2/C8 assertions below have a stable member count.
-- An UPDATE rather than an INSERT since `0026`: leaving leaves the row in place as a tombstone, so
-- there is nothing to insert — which is the whole point of the migration.
reset role;
update public.collection_members
   set removed_at = null, removed_by = null
 where collection_id = current_setting('c24.coll')::uuid
   and user_id = current_setting('c24.c')::uuid;

-- ── C2 / C3c / C6b: as the NON-MEMBER D ───────────────────────────────────────────────────────
select set_config('request.jwt.claims',
       '{"sub":"d0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n integer;
begin
  select count(*) into n from public.collections where id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees % collections', n; end if;
  select count(*) into n from public.collection_members
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees % member rows', n; end if;
  select count(*) into n from public.collection_items
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees % items', n; end if;
  select count(*) into n from public.collection_invites
   where collection_id = current_setting('c24.coll')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees % invites', n; end if;
  -- and the shared place is not visible to them either
  select count(*) into n from public.places where id = current_setting('c24.p_shared')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees the shared place'; end if;
  -- nor the members' profiles
  select count(*) into n from public.profiles where id = current_setting('c24.a')::uuid;
  if n <> 0 then raise exception 'FAIL C2: a non-member sees a member''s profile'; end if;
  -- and the helpers agree
  if public.collection_role(current_setting('c24.coll')::uuid) is not null then
    raise exception 'FAIL C2: collection_role() answers for a non-member';
  end if;
  if public.can_edit_collection(current_setting('c24.coll')::uuid) then
    raise exception 'FAIL C2: can_edit_collection() is true for a non-member';
  end if;
  if public.place_is_in_my_collection(current_setting('c24.p_shared')::uuid) then
    raise exception 'FAIL C2: place_is_in_my_collection() is true for a non-member';
  end if;
  if public.shares_a_collection_with(current_setting('c24.a')::uuid) then
    raise exception 'FAIL C2: shares_a_collection_with() is true for a non-member';
  end if;
  raise notice 'PASS C2  a non-member reads zero rows from all four tables, the shared place and the peers'' profiles';
end $$;

-- C3c: and cannot write into the collection either, by any command.
do $$
begin
  begin
    insert into public.collection_items (collection_id, place_id, added_by)
    values (current_setting('c24.coll')::uuid, current_setting('c24.p_shared')::uuid,
            current_setting('c24.d')::uuid);
    raise exception 'FAIL C3c: a non-member inserted an item';
  exception when insufficient_privilege then null;
  end;

  update public.collections set name = 'stolen' where id = current_setting('c24.coll')::uuid;
  if found then raise exception 'FAIL C3c: a non-member renamed the collection'; end if;

  delete from public.collections where id = current_setting('c24.coll')::uuid;
  if found then raise exception 'FAIL C3c: a non-member DELETED the collection'; end if;

  begin
    insert into public.collection_invites (collection_id, created_by)
    values (current_setting('c24.coll')::uuid, current_setting('c24.d')::uuid);
    raise exception 'FAIL C3c: a non-member minted an invite to someone else''s collection';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS C3c a non-member can neither add an item, rename, delete, nor mint an invite';
end $$;

-- C6e: preview_collection_invite — one row for a live token, zero rows for revoked, expired and a
-- random uuid, asked as a NON-MEMBER, which is exactly who the join screen serves. The five
-- returned fields are asserted by value; the assertion that it does NOT return a count is
-- structural (the function has no such output column) and is restated in C9d.
do $$
declare r record; n integer;
begin
  select * into r from public.preview_collection_invite(current_setting('c24.tok_live')::uuid);
  if r.collection_id is distinct from current_setting('c24.coll')::uuid then
    raise exception 'FAIL C6e: preview returned collection_id %', r.collection_id;
  end if;
  if r.collection_name <> 'Jerusalem weekend' then
    raise exception 'FAIL C6e: preview returned name %', r.collection_name;
  end if;
  if r.inviter_name is distinct from 'Ada the Owner' then
    raise exception 'FAIL C6e: preview returned inviter_name %', r.inviter_name;
  end if;
  if r.role <> 'editor' then raise exception 'FAIL C6e: preview returned role %', r.role; end if;
  if r.already_member then
    raise exception 'FAIL C6e: preview says a non-member is already a member';
  end if;

  select count(*) into n from public.preview_collection_invite(current_setting('c24.tok_revoked')::uuid);
  if n <> 0 then raise exception 'FAIL C6e: preview returned % rows for a REVOKED token', n; end if;
  select count(*) into n from public.preview_collection_invite(current_setting('c24.tok_expired')::uuid);
  if n <> 0 then raise exception 'FAIL C6e: preview returned % rows for an EXPIRED token', n; end if;
  select count(*) into n from public.preview_collection_invite('00000000-0000-4000-8000-0000000000ff');
  if n <> 0 then raise exception 'FAIL C6e: preview returned % rows for an UNKNOWN token', n; end if;

  raise notice 'PASS C6e preview_collection_invite: one row live, zero for revoked/expired/unknown, already_member=false';
end $$;

-- C6f: already_member is true for someone who is in, so the app can skip the join screen.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.preview_collection_invite(current_setting('c24.tok_live')::uuid);
  if not r.already_member then
    raise exception 'FAIL C6f: already_member is false for an existing member';
  end if;
  raise notice 'PASS C6f already_member is true for an existing member';
end $$;

-- ── C7: the owner's row, as the OWNER ─────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- C7b: the owner cannot end their own membership (the collection would be orphaned and the
  -- partial unique index would point at nothing). They delete the collection instead. Since `0026`
  -- there are two refusals stacked here, and both are asserted: the DELETE grant is gone, and the
  -- function that replaced it refuses the owner's row.
  begin
    delete from public.collection_members
     where collection_id = current_setting('c24.coll')::uuid
       and user_id = current_setting('c24.a')::uuid;
    raise exception 'FAIL C7b: DELETE on collection_members is still granted to authenticated';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                             current_setting('c24.a')::uuid);
    raise exception 'FAIL C7b: the owner ended their own membership row';
  exception when insufficient_privilege then null;
  end;

  -- C7c: nor demote themselves.
  update public.collection_members set role = 'viewer'
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.a')::uuid;
  if found then raise exception 'FAIL C7c: the owner demoted themselves'; end if;

  -- C7d: nor create a second owner. Two independent controls: the WITH CHECK refuses the value,
  -- and collection_members_one_owner_idx refuses the row. The policy is what fires here, and a
  -- failing WITH CHECK RAISES 42501 rather than matching zero rows — so this one is caught, not
  -- tested with `found`.
  begin
    update public.collection_members set role = 'owner'
     where collection_id = current_setting('c24.coll')::uuid
       and user_id = current_setting('c24.b')::uuid;
    raise exception 'FAIL C7d: the owner created a SECOND owner';
  exception when insufficient_privilege then null;
  end;

  -- C7e: the legitimate motion still works — demote the editor to viewer, and remove them.
  update public.collection_members set role = 'viewer'
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.b')::uuid;
  if not found then raise exception 'FAIL C7e: the owner could not demote an editor to viewer'; end if;

  raise notice 'PASS C7  the owner''s row cannot be deleted, demoted or duplicated; demoting a collaborator still works';
end $$;

-- C7f: the database, not just the policy, refuses a second owner. Asserted as the privileged role
-- so RLS is out of the way and the partial unique index is the only thing left standing.
reset role;
do $$
begin
  update public.collection_members set role = 'owner'
   where collection_id = current_setting('c24.coll')::uuid
     and user_id = current_setting('c24.c')::uuid;
  raise exception 'FAIL C7f: a second owner was written with RLS bypassed — the one-owner index is missing';
exception when unique_violation then
  raise notice 'PASS C7f collection_members_one_owner_idx refuses a second owner even with RLS bypassed';
end $$;

-- ── C9: the column grants — what cannot be expressed in SQL at all ────────────────────────────
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.collections set owner_id = current_setting('c24.d')::uuid;
    raise exception 'FAIL C9a: collections.owner_id is in the UPDATE grant — a collection can be given away';
  exception when insufficient_privilege then
    raise notice 'PASS C9a collections.owner_id is not grantable';
  end;

  begin
    update public.collections set name = 'renamed by the owner'
     where id = current_setting('c24.coll')::uuid;
    raise notice 'PASS C9b collections.name IS writable by the owner (the grant is not vacuously closed)';
  exception when insufficient_privilege then
    raise exception 'FAIL C9b: the owner cannot rename their own collection';
  end;

  begin
    update public.collection_items set added_by = current_setting('c24.d')::uuid;
    raise exception 'FAIL C9c: collection_items.added_by is in the UPDATE grant — attribution can be rewritten';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.collection_items set collection_id = gen_random_uuid();
    raise exception 'FAIL C9c: collection_items.collection_id is in the UPDATE grant — an item can be moved';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.collection_items set place_id = current_setting('c24.p_secret')::uuid;
    raise exception 'FAIL C9c: collection_items.place_id is in the UPDATE grant — an item can be repointed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS C9c collection_items: added_by, collection_id and place_id are all ungrantable';

  begin
    insert into public.collection_members (collection_id, user_id, role)
    values (current_setting('c24.coll')::uuid, current_setting('c24.d')::uuid, 'editor');
    raise exception 'FAIL C9d: authenticated holds INSERT on collection_members — membership can be forged';
  exception when insufficient_privilege then
    raise notice 'PASS C9d authenticated holds NO insert on collection_members; only the trigger and join_collection_via_token write it';
  end;

  begin
    update public.collection_invites set role = 'editor';
    raise exception 'FAIL C9e: collection_invites.role is in the UPDATE grant — a viewer link can be silently upgraded';
  exception when insufficient_privilege then
    raise notice 'PASS C9e collection_invites.role is not grantable; only revoked_at is';
  end;

  -- C9f: the INSERT grants are column-level, not table-level. The one that matters is `token`: a
  -- table-level INSERT on collection_invites would let the creator choose the bearer credential
  -- instead of taking gen_random_uuid()'s, which is how a share link ends up guessable. `id` and
  -- `created_at` are asserted alongside it because a client-chosen primary key and a backdated row
  -- are the other two things a table-wide INSERT quietly permits.
  begin
    insert into public.collection_invites (collection_id, created_by, token)
    values (current_setting('c24.coll')::uuid, current_setting('c24.a')::uuid,
            '00000000-0000-4000-8000-000000000001');
    raise exception 'FAIL C9f: collection_invites.token is INSERT-grantable — an invite token can be chosen by the client';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.collections (owner_id, name, id)
    values (current_setting('c24.a')::uuid, 'chosen id', gen_random_uuid());
    raise exception 'FAIL C9f: collections.id is INSERT-grantable — a client can choose its own primary key';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.collections (owner_id, name, created_at)
    values (current_setting('c24.a')::uuid, 'backdated', '2001-01-01T00:00:00Z');
    raise exception 'FAIL C9f: collections.created_at is INSERT-grantable — a client can backdate its own rows';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS C9f INSERT is column-level: token, id and created_at cannot be supplied by the client';
end $$;

-- ── C8: anon holds nothing on any of it ───────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare t text; f text;
begin
  foreach t in array array['collections','collection_members','collection_items','collection_invites']
  loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL C8: anon holds a grant on %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- Every function 0024 adds, including the two definer entry points. A revoke that names only
  -- `anon` leaves EXECUTE held through PUBLIC — 0009's bug, reintroduced by 0017 and closed by
  -- 0018 — so this is asserted behaviourally, per function, rather than trusted.
  foreach f in array array['collection_role','can_edit_collection','place_is_in_my_collection',
                           'shares_a_collection_with','join_collection_via_token',
                           'preview_collection_invite']
  loop
    begin
      execute format('select public.%I(%L::uuid)', f, '00000000-0000-4000-8000-0000000000ff');
      raise exception 'FAIL C8: anon can EXECUTE public.%', f;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- The trigger function cannot be probed by calling it (a trigger function raises 0A000 before
  -- anything interesting happens), so this one is asserted on the privilege itself.
  -- has_function_privilege accounts for a privilege held through PUBLIC, which is the exact shape
  -- of the 0009/0018 bug.
  if has_function_privilege('anon', 'public.add_collection_owner_membership()', 'execute') then
    raise exception 'FAIL C8: anon holds EXECUTE on add_collection_owner_membership';
  end if;

  raise notice 'PASS C8  anon holds no grant on the four new tables and cannot execute any of the seven new functions';
end $$;

-- C8b: the trigger function is not on `authenticated`'s RPC surface either. It is invoked by the
-- executor, which needs no EXECUTE grant (0009's claim, asserted by P4b in 0008_policy_tests.sql),
-- so leaving it ungranted costs nothing and keeps a definer function that writes membership rows
-- off PostgREST entirely.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.add_collection_owner_membership()', 'execute') then
    raise exception 'FAIL C8b: authenticated can execute add_collection_owner_membership — a definer membership writer is on the RPC surface';
  end if;
  raise notice 'PASS C8b add_collection_owner_membership is not executable by authenticated (trigger-only)';
end $$;

-- ── C10: a link never undoes a removal (0026) ─────────────────────────────────────────────────
-- The two authorisation failures `docs/evidence/security/collections-rls-review-2026-08-29.md`
-- found in 0024, and the reason `0026` exists. Both were reproduced here BEFORE the migration was
-- written, and both of these blocks fail against a 0024-only database — which is the only thing
-- that makes them evidence rather than decoration.
--
-- They run last because they permanently change B's and C's membership, and everything above needs
-- both of them to be members.

-- C10a (F2) — ESCALATION. A demotes B to viewer; B leaves, which is permitted; B re-clicks the
-- EDITOR link they were originally sent. Under 0024, leaving deleted the row, so the redemption
-- was rule 4 ("never a member") and handed B the invite's role back. B must come back a viewer.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

update public.collection_members set role = 'viewer'
 where collection_id = current_setting('c24.coll')::uuid
   and user_id = current_setting('c24.b')::uuid;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"b0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_role text;
begin
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'viewer' then
    raise exception 'FAIL C10a setup: B was not demoted, so the escalation is untestable';
  end if;

  perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                           current_setting('c24.b')::uuid);
  if public.collection_role(current_setting('c24.coll')::uuid) is not null then
    raise exception 'FAIL C10a: B left and is still a member';
  end if;

  perform public.join_collection_via_token(current_setting('c24.tok_live')::uuid);
  v_role := public.collection_role(current_setting('c24.coll')::uuid);
  if v_role <> 'viewer' then
    raise exception 'FAIL C10a: a demoted member left and re-clicked the editor link and came back as % — the invite role must not be consulted for a returning member', v_role;
  end if;
  raise notice 'PASS C10a leaving and rejoining restores the role held at leaving, not the link''s';
end $$;

-- C10b (F1) — REMOVAL. A removes C; C re-clicks the viewer link. Under 0024 this put C straight
-- back in with the shared `places` read restored. It must now be refused, and the refusal must be
-- a DIFFERENT sqlstate from the uniform bad-token one (`22023`), because only somebody holding a
-- live token who genuinely was a member can ever see it.
reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                           current_setting('c24.c')::uuid);
  -- The tombstone is invisible through the table, so the owner's own member list sheds C at once
  -- and no query in src/ needs a `removed_at is null` filter added to stay correct.
  if exists (select 1 from public.collection_members
              where collection_id = current_setting('c24.coll')::uuid
                and user_id = current_setting('c24.c')::uuid) then
    raise exception 'FAIL C10b: a removed member is still visible in the owner''s member list';
  end if;
  raise notice 'PASS C10b-i removing a member hides them from the member list immediately';
end $$;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_state text; v_places int;
begin
  if public.collection_role(current_setting('c24.coll')::uuid) is not null then
    raise exception 'FAIL C10b: C still has a role after being removed';
  end if;

  -- The read the whole feature opens, gone in the same instant.
  select count(*) into v_places from public.places where id = current_setting('c24.p_shared')::uuid;
  if v_places <> 0 then
    raise exception 'FAIL C10b: a removed member can still read the shared place row';
  end if;

  begin
    perform public.join_collection_via_token(current_setting('c24.tok_viewer')::uuid);
    raise exception 'FAIL C10b: a REMOVED member re-clicked the invite link and was let back in';
  exception
    when sqlstate 'PT403' then
      raise notice 'PASS C10b a removed member is refused by the link, with a sqlstate of its own';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception 'FAIL C10b: expected PT403, got %', v_state;
  end;
end $$;

-- C10c — the tombstone cannot be removed from the browser. Both halves matter and they are one
-- control: without the revoked DELETE, a removed member deletes their own tombstone and rejoins as
-- rule 4; without the ungrantable columns, they write `removed_at = null` directly.
do $$
begin
  if has_table_privilege('authenticated', 'public.collection_members', 'delete') then
    raise exception 'FAIL C10c: authenticated still holds DELETE on collection_members — a removed member can delete their own tombstone and rejoin as a stranger';
  end if;
  if has_column_privilege('authenticated', 'public.collection_members', 'removed_at', 'update')
     or has_column_privilege('authenticated', 'public.collection_members', 'removed_by', 'update')
     or has_column_privilege('authenticated', 'public.collection_members', 'removed_at', 'insert')
     or has_column_privilege('authenticated', 'public.collection_members', 'removed_by', 'insert') then
    raise exception 'FAIL C10c: the removal columns are writable by the client';
  end if;
  raise notice 'PASS C10c a removal cannot be undone from the client: no DELETE grant, and neither removal column is writable';
end $$;

-- C10d — the owner's row is still immovable, now through the function rather than a policy, and
-- an ended member cannot end anybody's membership including their own tombstone.
do $$
declare v_state text;
begin
  begin
    perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                             current_setting('c24.c')::uuid);
    raise exception 'FAIL C10d: a removed member could still call end_collection_membership';
  exception
    when sqlstate '42501' then null;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception 'FAIL C10d: expected 42501 from a removed caller, got %', v_state;
  end;
  raise notice 'PASS C10d-i an ended member cannot end a membership';
end $$;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"a0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_state text;
begin
  begin
    perform public.end_collection_membership(current_setting('c24.coll')::uuid,
                                             current_setting('c24.a')::uuid);
    raise exception 'FAIL C10d: the owner ended their own membership and orphaned the collection';
  exception
    when sqlstate '42501' then null;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception 'FAIL C10d: expected 42501 ending the owner''s row, got %', v_state;
  end;
  raise notice 'PASS C10d the owner''s membership still cannot be ended, by anyone';
end $$;

-- C10e — the owner's way back. Rule 3 is absolute, so without this a removal is a state the owner
-- cannot get out of. Owner-only, and the role is the owner's choice rather than the old link's.
do $$
declare v_removed int; v_left boolean;
begin
  select count(*) into v_removed
    from public.collection_removed_members(current_setting('c24.coll')::uuid);
  if v_removed < 1 then
    raise exception 'FAIL C10e: the owner cannot see who they removed, so a removal is a dead end';
  end if;

  select left_voluntarily into v_left
    from public.collection_removed_members(current_setting('c24.coll')::uuid)
   where user_id = current_setting('c24.c')::uuid;
  if v_left is not false then
    raise exception 'FAIL C10e: a removal is reported as a voluntary leave';
  end if;

  perform public.restore_collection_membership(current_setting('c24.coll')::uuid,
                                               current_setting('c24.c')::uuid, 'editor');
  raise notice 'PASS C10e the owner can see who they removed and put them back, at a role they choose';
end $$;

reset role;
select set_config('request.jwt.claims',
       '{"sub":"c0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_state text;
begin
  if public.collection_role(current_setting('c24.coll')::uuid) <> 'editor' then
    raise exception 'FAIL C10e: C was not restored';
  end if;

  -- And a non-owner cannot use either of them, on any collection.
  if (select count(*) from public.collection_removed_members(current_setting('c24.coll')::uuid)) <> 0 then
    raise exception 'FAIL C10f: a non-owner can list a collection''s removed members';
  end if;
  begin
    perform public.restore_collection_membership(current_setting('c24.coll')::uuid,
                                                 current_setting('c24.b')::uuid, 'editor');
    raise exception 'FAIL C10f: a non-owner restored a membership';
  exception
    when sqlstate '42501' then null;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception 'FAIL C10f: expected 42501, got %', v_state;
  end;
  raise notice 'PASS C10f neither restore path is reachable by a non-owner';
end $$;

-- C10g — after all of that, there is still exactly one owner, and the partial unique index counts
-- only live rows (or a later ownership transfer would be refused by a tombstone).
reset role;
do $$
declare v_owners int;
begin
  select count(*) into v_owners from public.collection_members
   where collection_id = current_setting('c24.coll')::uuid
     and role = 'owner' and removed_at is null;
  if v_owners <> 1 then
    raise exception 'FAIL C10g: % live owners after the removal cycle', v_owners;
  end if;
  if pg_get_indexdef('public.collection_members_one_owner_idx'::regclass) not like '%removed_at IS NULL%' then
    raise exception 'FAIL C10g: the one-owner index still counts tombstones';
  end if;
  raise notice 'PASS C10g exactly one live owner, and the one-owner index ignores tombstones';
end $$;

reset role;
rollback;
