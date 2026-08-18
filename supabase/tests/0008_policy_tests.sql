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
-- It tests the POLICIES, not the client code: every read and write below happens under
-- `set role authenticated` with request.jwt.claims set, exactly as PostgREST would run it.
-- FORCE ROW LEVEL SECURITY is why this works — the owner is subject to its own policies too, and
-- only the BYPASSRLS roles (postgres, service_role) are exempt.

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

-- ── the two exit assertions of MS4, as user B ───────────────────────────────────────────────
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

  -- P8: provenance is permanent — the last source of an origin='import' save cannot be removed.
  begin
    delete from public.saved_place_sources;
    -- The trigger is DEFERRABLE INITIALLY DEFERRED, so its event is queued to the transaction, not
    -- to this subtransaction. SET CONSTRAINTS ALL IMMEDIATE runs every pending check now, which is
    -- the only way to observe a deferred violation without committing.
    set constraints all immediate;
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

rollback;
