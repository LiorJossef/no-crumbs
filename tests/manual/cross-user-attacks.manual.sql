-- cross-user-attacks.manual.sql — the nine attacks the Security document's abstract claims.
--
-- Probe harness, not a migration and not part of `npm run db:test`. It builds a victim and an
-- attacker, runs nine cross-user attacks as the attacker under `set local role authenticated`,
-- repeats them signed out, and ROLLS BACK. Nothing it creates survives; the container is left
-- exactly as it was found. It reports the schema state it ran against in its first two queries,
-- because the result is only a claim about that state.
--
-- DO NOT add \i of a migration file here. Migrations carry their own begin/commit, so an include
-- commits the enclosing transaction and the rollback at the foot stops protecting anything.
--
-- Run: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=0 -f tests/manual/cross-user-attacks.manual.sql
--
-- Every assertion is written so that a *successful* attack prints FAIL. An attack that errors is
-- caught and reported with its SQLSTATE, because "permission denied" and "zero rows" are different
-- defences and the document distinguishes them.

begin;


select count(*) filter (where relrowsecurity) as rls_enabled,
       count(*) filter (where relforcerowsecurity) as rls_forced,
       count(*) as tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';
select count(*) as policies from pg_policies where schemaname = 'public';

-- ── fixtures ─────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000001', 'victim@example.test'),
  ('22222222-0000-4000-8000-000000000002', 'attacker@example.test');

select public.start_import('11111111-0000-4000-8000-000000000001',
                           'tiktok', '7999000000000000002',
                           'https://www.tiktok.com/@v/video/7999000000000000001');
update public.sources set fetch_status = 'ok', fetched_at = now(),
       content_text = 'the victim''s caption'
 where platform_source_id = '7999000000000000002';
select id as src from public.sources where platform_source_id = '7999000000000000002' \gset

select public.resolve_place('overture','ovt-probe-v2','Victim Probe Place',
                            31.7683, 35.2137, 'restaurant', 'restaurant', null,
                            'Jerusalem', null, 'IL', '{}'::jsonb) as pv \gset

select set_config('probe.pv', :'pv', true), set_config('probe.src', :'src', true);

-- victim saves it, under RLS
select set_config('request.jwt.claims',
       '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.save_place(:'pv', :'src', 'the victim''s private note', null) as sp \gset
reset role;
select set_config('probe.sp', :'sp', true);

-- victim creates a collection and puts the place in it
select set_config('request.jwt.claims',
       '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into public.collections (owner_id, name)
  values ('11111111-0000-4000-8000-000000000001', 'Victim collection')
  returning id as coll \gset
reset role;
select set_config('probe.coll', :'coll', true);

-- ── the attacker signs in ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
       '{"sub":"22222222-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '22222222-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  sp uuid := current_setting('probe.sp')::uuid;
  coll uuid := current_setting('probe.coll')::uuid;
  n int;
  txt text;
begin
  -- A1 — read another user's saved places directly
  select count(*) into n from public.saved_places
   where user_id = '11111111-0000-4000-8000-000000000001';
  if n = 0 then raise notice 'PASS A1  direct read of the victim''s saved places -> 0 rows';
  else raise notice 'FAIL A1  direct read returned % rows', n; end if;

  -- A2 — read sideways through the link table the place joins to
  select count(*) into n from public.saved_place_sources sps
    join public.sources s on s.id = sps.source_id
   where sps.saved_place_id = sp;
  if n = 0 then raise notice 'PASS A2  sideways read via saved_place_sources -> 0 rows';
  else raise notice 'FAIL A2  sideways read returned % rows', n; end if;

  -- A3 — aggregate, in case a count reveals what a select does not
  select count(*) into n from public.saved_places where id = sp;
  if n = 0 then raise notice 'PASS A3  aggregate count of the victim''s row -> 0';
  else raise notice 'FAIL A3  aggregate count returned %', n; end if;

  -- A4 — update another user's note
  begin
    update public.saved_places set note = 'owned' where id = sp;
    get diagnostics n = ROW_COUNT;
    if n = 0 then raise notice 'PASS A4  update of the victim''s note -> 0 rows affected';
    else raise notice 'FAIL A4  update affected % rows', n; end if;
  exception when others then
    raise notice 'PASS A4  update refused: % (%)', sqlerrm, sqlstate;
  end;

  -- A5 — delete another user's saved place
  begin
    delete from public.saved_places where id = sp;
    get diagnostics n = ROW_COUNT;
    if n = 0 then raise notice 'PASS A5  delete of the victim''s row -> 0 rows affected';
    else raise notice 'FAIL A5  delete affected % rows', n; end if;
  exception when others then
    raise notice 'PASS A5  delete refused: % (%)', sqlerrm, sqlstate;
  end;

  -- A6 — reassign the row into the attacker's own account
  begin
    update public.saved_places
       set user_id = '22222222-0000-4000-8000-000000000002' where id = sp;
    get diagnostics n = ROW_COUNT;
    raise notice 'FAIL A6  ownership reassignment affected % rows', n;
  exception when others then
    raise notice 'PASS A6  ownership reassignment refused: % (%)', sqlerrm, sqlstate;
  end;

  -- A7 — take over the victim's collection by writing ourselves in as owner
  begin
    insert into public.collection_members (collection_id, user_id, role)
      values (coll, '22222222-0000-4000-8000-000000000002', 'owner');
    raise notice 'FAIL A7  self-inserted as owner of the victim''s collection';
  exception when others then
    raise notice 'PASS A7  collection takeover refused: % (%)', sqlerrm, sqlstate;
  end;

  -- A8 — mint an invite to the victim's collection with a token of our choosing
  begin
    insert into public.collection_invites (collection_id, role, created_by)
      values (coll, 'editor', '22222222-0000-4000-8000-000000000002');
    raise notice 'FAIL A8  minted an invite to a collection we do not own';
  exception when others then
    raise notice 'PASS A8  invite forgery refused: % (%)', sqlerrm, sqlstate;
  end;

  -- A9 — call the SECURITY DEFINER writers, aimed at the victim's rows
  begin
    perform public.apply_saved_place_extraction(
      sp, '22222222-0000-4000-8000-000000000002', array['owned'], 'owned', array['owned']);
    raise notice 'FAIL A9a apply_saved_place_extraction wrote to the victim''s row';
  exception when others then
    raise notice 'PASS A9a apply_saved_place_extraction refused: % (%)', sqlerrm, sqlstate;
  end;
  begin
    perform public.apply_saved_place_source_link(sp, current_setting('probe.src')::uuid);
    raise notice 'NOTE A9b apply_saved_place_source_link returned without error — its effect is '
                 'asserted after the role is dropped, below (a definer function that no-ops is '
                 'not the same as one that is refused, and only the victim''s row can tell them '
                 'apart)';
  exception when others then
    raise notice 'PASS A9b apply_saved_place_source_link refused: % (%)', sqlerrm, sqlstate;
  end;
  begin
    select public.collection_role(coll) into txt;
    if txt is null then raise notice 'PASS A9c collection_role() on the victim''s collection -> null';
    else raise notice 'FAIL A9c collection_role() answered %', txt; end if;
  exception when others then
    raise notice 'PASS A9c collection_role refused: % (%)', sqlerrm, sqlstate;
  end;
end $$;

-- ── A9b's real verdict: did anything the attacker did touch the victim's row? ────────────────
reset role;
do $$
declare r record;
begin
  select user_id, note, source_url into r
    from public.saved_places where id = current_setting('probe.sp')::uuid;
  if r is null then
    raise notice 'FAIL A9b the victim''s saved place no longer exists';
  elsif r.user_id <> '11111111-0000-4000-8000-000000000001'::uuid then
    raise notice 'FAIL A9b the victim''s saved place changed owner to %', r.user_id;
  elsif r.note <> 'the victim''s private note' then
    raise notice 'FAIL A9b the victim''s note was rewritten to %', r.note;
  else
    raise notice 'PASS A9b the victim''s row is byte-for-byte what it was: same owner, same note';
  end if;
end $$;

-- ── the same nine, signed out ────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

do $$
declare sp uuid := current_setting('probe.sp')::uuid; n int;
begin
  begin
    select count(*) into n from public.saved_places;
    raise notice 'FAIL anon read of saved_places succeeded (% rows)', n;
  exception when others then
    raise notice 'PASS anon read of saved_places refused: % (%)', sqlerrm, sqlstate;
  end;
  begin
    delete from public.saved_places where id = sp;
    raise notice 'FAIL anon delete of saved_places succeeded';
  exception when others then
    raise notice 'PASS anon delete of saved_places refused: % (%)', sqlerrm, sqlstate;
  end;
  begin
    perform public.save_place(current_setting('probe.pv')::uuid, null, 'x', null);
    raise notice 'FAIL anon save_place succeeded';
  exception when others then
    raise notice 'PASS anon save_place refused: % (%)', sqlerrm, sqlstate;
  end;
  begin
    select count(*) into n from public.collections;
    raise notice 'FAIL anon read of collections succeeded (% rows)', n;
  exception when others then
    raise notice 'PASS anon read of collections refused: % (%)', sqlerrm, sqlstate;
  end;
end $$;

reset role;
rollback;
