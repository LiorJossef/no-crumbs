-- inventory.sql — asserts that a deployed database matches the designed authorisation surface.
--
-- READ ONLY. It writes nothing, and is wrapped in a transaction that rolls back regardless, so it
-- is safe to run against production — which is the point: it is the only check in the repo that can
-- be pointed at the graded environment. `0008_policy_tests.sql` proves the policies *behave*
-- correctly but creates fixture users, so it is staging-and-local only. This proves the policies,
-- grants, RLS flags and triggers *exist as designed*, which is the half that can rot silently when
-- someone reaches for the dashboard.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/inventory.sql
-- Design: docs/08-place-identity.md §3, §5.1; technical-design.md §4.3 and §14 R7/R8/R10/R11.

-- ── identity: which database did this actually examine? ─────────────────────────────────────
-- Not decoration. The output of this script is the evidence that a given environment is correctly
-- locked down, and two environments of the same project produce byte-identical PASS lines. Without
-- this header, a run against staging is indistinguishable from a run against production — which is
-- exactly how a production database ends up recorded as verified when nobody checked it.
-- Via the session pooler the username carries the project ref (postgres.<ref>), so the conninfo
-- the project even though the server-side current_user does not.
-- pager off: interactive psql paginates the conninfo table and parks the script at a prompt.
-- NOTE: never write a backslash inside a comment in a psql script — psql executes backslash
-- sequences even in `--` comments, so the word above (unescaped) would run the command again and
-- leave the rest of the line to be parsed as SQL. That is exactly what broke this file once.
-- Harmless in CI (non-tty), confusing for a human running it against production.
\pset pager off
\echo '--- inventory.sql target ---'
\conninfo
select current_database() as db, current_user as role,
       inet_server_addr() as server_addr, substring(version() from 'PostgreSQL [0-9.]+') as pg;

begin;
set transaction read only;

-- ── 0. record what the default privileges do on THIS database ───────────────────────────────
-- Not a failure, because it cannot be fixed from a migration. The hosted projects carry
-- ALTER DEFAULT PRIVILEGES granting ALL on new tables/sequences/functions in `public` to `anon` and
-- `authenticated`, and those defaults are owned by **supabase_admin**, which the migration role
-- cannot alter (measured on p-002-staging 2026-08-18; 0008 tries and reports that it cannot).
--
-- The consequence is permanent and must be designed around: **every table a future migration creates
-- in `public` arrives with ALL granted to both browser roles**, and only an explicit REVOKE closes
-- it. The local container carries the same defaults — they are present everywhere (an earlier draft
-- of docs/ms4-database.md claimed local was clean; that was wrong, see §2.3). A local
-- `supabase db reset` therefore proves nothing about the revoke, because RLS passes with or without
-- it and nothing in the policy tests inspects a grant. That is why the guarantee lives in
-- `scripts/check-migration-grants.sh` (a static check over the migrations, run in CI) rather than
-- in a test that would pass locally regardless. Checks 4 and 5
-- below are what prove the revokes actually took effect on this database.
do $$
declare v text;
begin
  select string_agg(distinct format('%s→%s', a.grantee::regrole, d.defaclobjtype), ', ') into v
    from pg_default_acl d, aclexplode(d.defaclacl) a
   where d.defaclnamespace = 'public'::regnamespace
     and a.grantee::regrole::text in ('anon', 'authenticated');
  if v is null then
    raise notice 'PASS 0  no default privilege grants anything in public to anon or authenticated';
  else
    raise notice 'NOTE 0  default privileges still expose NEW entities to browser roles (%). Not fixable from a migration: every future table MUST revoke explicitly — enforced by scripts/check-migration-grants.sh', v;
  end if;
end $$;

-- ── 1. RLS is enabled AND forced on all nine tables ─────────────────────────────────────────
do $$
declare v text;
begin
  select string_agg(format('%s (enabled=%s forced=%s)', c.relname, c.relrowsecurity,
                           c.relforcerowsecurity), ', ' order by c.relname) into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not (c.relrowsecurity and c.relforcerowsecurity);
  if v is not null then
    raise exception 'FAIL 1: RLS not enabled+forced on: %', v;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r') <> 9 then
    raise exception 'FAIL 1: expected 9 tables in public, found %',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r');
  end if;
  raise notice 'PASS 1  nine tables, RLS enabled and forced on every one';
end $$;

-- ── 2. the policy set is exactly the designed one, in both directions ───────────────────────
-- Names AND predicates. The name set alone under-asserts badly: `drop policy
-- saved_places_select_own; create policy saved_places_select_own on saved_places for select to
-- authenticated using (true);` passes a name-only check and hands every user every other user's
-- library. So `cmd`, `roles`, `qual` and `with_check` are all compared, in both directions.
--
-- The expressions are compared as pg_policies renders them (the deparsed form), normalised for
-- cosmetic drift only: lowercased, whitespace collapsed, the space Postgres prints after `(`
-- removed, the `AS uid` alias it invents for `(select auth.uid())` removed, and double quotes
-- stripped. Nothing semantic is normalised away — `= (select auth.uid())` and `= true` do not
-- normalise to the same string, which is the entire point.
--
-- If a future Postgres version deparses these predicates differently the check fails loudly with
-- both strings printed side by side. That is the intended failure mode: a reviewer reads the two
-- and updates the expected text, having actually looked at it. Silence would be worse.
-- A missing predicate is stored as '' (not null) on both sides, so INSERT policies (no qual) and
-- SELECT policies (no with_check) are asserted to have nothing rather than to have anything.
do $$
declare v text;
begin
  with actual as (
    select p.tablename::text t, p.policyname::text pol, p.cmd::text cmd,
           array_to_string(p.roles, ',') roles,
           btrim(regexp_replace(regexp_replace(replace(replace(lower(coalesce(p.qual, '')),
                 ' as uid', ''), '"', ''), '\s+', ' ', 'g'), '\(\s+', '(', 'g')) q,
           btrim(regexp_replace(regexp_replace(replace(replace(lower(coalesce(p.with_check, '')),
                 ' as uid', ''), '"', ''), '\s+', ' ', 'g'), '\(\s+', '(', 'g')) w
      from pg_policies p where p.schemaname = 'public'
  ), expected(t, pol, cmd, roles, q, w) as (values
    -- profiles: own row only, and a user may not create or rename someone else's profile
    ('profiles','profiles_select_own','SELECT','authenticated',
       '(id = (select auth.uid()))',''),
    ('profiles','profiles_insert_own','INSERT','authenticated',
       '','(id = (select auth.uid()))'),
    ('profiles','profiles_update_own','UPDATE','authenticated',
       '(id = (select auth.uid()))','(id = (select auth.uid()))'),
    -- sources: the shared post cache, readable only via an import OR a save (08 §2.2 rule 1)
    ('sources','sources_select_via_membership','SELECT','authenticated',
       '((exists (select 1 from imports i where ((i.source_id = sources.id) and (i.user_id = (select auth.uid()))))) or (exists (select 1 from saved_place_sources sps where ((sps.source_id = sources.id) and (sps.user_id = (select auth.uid()))))))',''),
    -- imports: own only. The UPDATE with_check is what stops a user re-parenting their import.
    ('imports','imports_select_own','SELECT','authenticated',
       '(user_id = (select auth.uid()))',''),
    ('imports','imports_update_own','UPDATE','authenticated',
       '(user_id = (select auth.uid()))','(user_id = (select auth.uid()))'),
    -- extractions: the same two membership branches as sources (0011 added the second)
    ('extractions','extractions_select_via_source_membership','SELECT','authenticated',
       '((exists (select 1 from imports i where ((i.source_id = extractions.source_id) and (i.user_id = (select auth.uid()))))) or (exists (select 1 from saved_place_sources sps where ((sps.source_id = extractions.source_id) and (sps.user_id = (select auth.uid()))))))',''),
    -- the two global tables: visible only to a user who saved the place
    ('places','places_select_if_saved','SELECT','authenticated',
       '(exists (select 1 from saved_places sp where ((sp.place_id = places.id) and (sp.user_id = (select auth.uid())))))',''),
    ('place_provider_refs','ppr_select_if_place_saved','SELECT','authenticated',
       '(exists (select 1 from saved_places sp where ((sp.place_id = place_provider_refs.place_id) and (sp.user_id = (select auth.uid())))))',''),
    -- the library
    ('saved_places','saved_places_select_own','SELECT','authenticated',
       '(user_id = (select auth.uid()))',''),
    ('saved_places','saved_places_insert_own','INSERT','authenticated',
       '','(user_id = (select auth.uid()))'),
    ('saved_places','saved_places_update_own','UPDATE','authenticated',
       '(user_id = (select auth.uid()))','(user_id = (select auth.uid()))'),
    ('saved_places','saved_places_delete_own','DELETE','authenticated',
       '(user_id = (select auth.uid()))',''),
    -- provenance. sps_insert_own's second conjunct is the no-borrowed-provenance rule: the source
    -- must be one this user actually imported. Losing it would let a user attach any source id.
    ('saved_place_sources','sps_select_own','SELECT','authenticated',
       '(user_id = (select auth.uid()))',''),
    ('saved_place_sources','sps_insert_own','INSERT','authenticated',
       '','((user_id = (select auth.uid())) and (exists (select 1 from imports i where ((i.source_id = saved_place_sources.source_id) and (i.user_id = (select auth.uid()))))))'),
    ('saved_place_sources','sps_delete_own','DELETE','authenticated',
       '(user_id = (select auth.uid()))','')
    -- place_lookups deliberately has no policy at all: deny-all server-side cache (R11)
  )
  select string_agg(msg, '; ' order by msg) into v from (
    select format('UNEXPECTED %s.%s', a.t, a.pol) msg from actual a
      left join expected e on e.t = a.t and e.pol = a.pol where e.t is null
    union all
    select format('MISSING %s.%s', e.t, e.pol) from expected e
      left join actual a on a.t = e.t and a.pol = e.pol where a.t is null
    union all
    select format('DRIFT %s.%s: cmd %s vs %s, roles %s vs %s, qual [%s] vs [%s], with_check [%s] vs [%s]',
                  e.t, e.pol, a.cmd, e.cmd, a.roles, e.roles, a.q, e.q, a.w, e.w)
      from expected e join actual a on a.t = e.t and a.pol = e.pol
     where a.cmd <> e.cmd or a.roles <> e.roles or a.q <> e.q or a.w <> e.w
  ) d;
  if v is not null then raise exception 'FAIL 2: policy drift: %', v; end if;
  raise notice 'PASS 2  sixteen policies, exact name/command/role/qual/with_check match (place_lookups deliberately has none)';
end $$;

-- ── 3. anon holds nothing at all (08 §5.1) ──────────────────────────────────────────────────
-- Three independent sweeps, because no single view sees everything:
--   3a information_schema.role_table_grants — TABLE-level grants actually held, which is the level
--      08 §5.1 is written at and the level a `grant select on <table> to anon` lands at. The
--      previous version of this check consulted role_column_grants only; that view does expand a
--      table grant per column, but it is the wrong instrument for a table-level claim and it says
--      nothing at all about a relation with no columns visible to it.
--   3b information_schema.role_column_grants — the column-level half (`grant select (col)`).
--   3c pg_class + aclexplode — the catalogue itself. Two reasons it is not redundant: the
--      information_schema `role_*` views only show rows whose grantor or grantee is a *currently
--      enabled* role, so if the role running this script is not a member of `anon` both 3a and 3b
--      can come back empty while the grant exists; and information_schema omits MATERIALIZED VIEWS
--      entirely, so a matview granted to anon is invisible to 3a/3b by construction. 3c also
--      catches a grant made to PUBLIC, which `anon` holds by virtue of being a role.
do $$
declare v text;
begin
  select string_agg(distinct format('%s:%s', table_name, privilege_type), ', ') into v
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';
  if v is not null then raise exception 'FAIL 3a: anon holds table-level privileges: %', v; end if;

  select string_agg(distinct format('%s.%s:%s', table_name, column_name, privilege_type), ', ')
    into v
    from information_schema.role_column_grants
   where grantee = 'anon' and table_schema = 'public';
  if v is not null then raise exception 'FAIL 3b: anon holds column-level privileges: %', v; end if;

  select string_agg(distinct format('%s %s:%s(%s)', c.relkind, c.relname, a.privilege_type,
                                    case when a.grantee = 0 then 'PUBLIC' else 'anon' end), ', ')
    into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and a.grantee in ('anon'::regrole, 0)          -- 0 = PUBLIC, which anon is a member of
  ;
  if v is not null then raise exception 'FAIL 3c: anon (or PUBLIC) holds relation privileges: %', v; end if;

  select string_agg(distinct format('%s.%s:%s(%s)', c.relname, att.attname, a.privilege_type,
                                    case when a.grantee = 0 then 'PUBLIC' else 'anon' end), ', ')
    into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
    cross join lateral aclexplode(att.attacl) a
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and a.grantee in ('anon'::regrole, 0)
  ;
  if v is not null then raise exception 'FAIL 3d: anon (or PUBLIC) holds column privileges: %', v; end if;

  raise notice 'PASS 3  anon holds nothing: no table, view, matview or column privilege in public, and none via PUBLIC';
end $$;

-- ── 4. the relation-level grant matrix for `authenticated` ──────────────────────────────────
-- Source changed from information_schema.role_table_grants to pg_class + aclexplode, on purpose:
--   * information_schema does not list MATERIALIZED VIEWS at all, and its `role_*` views are
--     limited to currently enabled roles;
--   * the previous form filtered nothing by relkind but could only ever see tables and views,
--     so `create materialized view public.m as select * from saved_places` — which runs with the
--     owner's rights and therefore bypasses RLS entirely — was invisible to the runtime proof.
-- This is the runtime half of the hole that scripts/check-migration-grants.sh now catches
-- statically. `p` (partitioned), `f` (foreign) and `v`/`m` are all included: the expected set below
-- contains only ordinary tables, so ANY grant on a view, matview, partitioned or foreign table
-- shows up as UNEXPECTED and fails. 4b names the same condition separately, because "a view in
-- public is readable by a browser role" deserves its own message rather than a drift entry.
do $$
declare v text;
begin
  with actual as (
    select c.relname::text t, a.privilege_type::text p
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and a.grantee = 'authenticated'::regrole
  ), expected(t, p) as (values
    ('profiles','SELECT'), ('profiles','INSERT'),
    ('imports','SELECT'),
    ('extractions','SELECT'),
    ('places','SELECT'),
    ('place_provider_refs','SELECT'),
    ('saved_places','SELECT'), ('saved_places','INSERT'), ('saved_places','DELETE'),
    ('saved_place_sources','SELECT'), ('saved_place_sources','INSERT'),
    ('saved_place_sources','DELETE')
    -- deliberately absent: every write on sources/extractions/places/place_provider_refs (global
    -- tables are server-written); INSERT and DELETE on imports (R10, start_import only); anything
    -- at all on place_lookups (R11); table-level SELECT on sources (R8 — columns only, below)
  )
  select string_agg(format('%s %s.%s', kind, t, p), ', ' order by t, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.p from actual a
      left join expected e on e.t = a.t and e.p = a.p where e.t is null
    union all
    select 'MISSING' kind, e.t, e.p from expected e
      left join actual a on a.t = e.t and a.p = e.p where a.t is null
  ) d;
  if v is not null then raise exception 'FAIL 4: table grant drift for authenticated: %', v; end if;
  raise notice 'PASS 4  relation-level grants for authenticated match the design (tables, views and matviews all inspected)';
end $$;

-- ── 4b. views and matviews in `public`: the RLS-bypass surface ───────────────────────────────
-- A view reads its underlying tables with its OWNER's privileges and, unless it was created WITH
-- (security_invoker = true), is NOT subject to their RLS policies. One
-- `create view public.v as select * from saved_places` is therefore a complete cross-user read of
-- every user's library — and it needs no grant of its own if the hosted default privileges are
-- still handing new relations to `authenticated`. A materialized view is worse: it cannot be
-- security_invoker at all, so its contents are a permanent RLS-free copy of whatever it selected.
--
-- Two assertions, because a grant check alone is not enough. A view with no grant today is one
-- dashboard `grant` away from being the hole, and the grant is the easy half to notice.
--   4b-i  any view in public that is not security_invoker fails, whether or not it is granted;
--   4b-ii any view or matview granted to anon, authenticated or PUBLIC fails.
-- The V1 schema contains no view and no matview, so both pass trivially today and start failing the
-- moment one appears. That is intended: a view is a deliberate decision that has to be argued for
-- and then written into this check, not something that arrives quietly with a migration.
-- This is the runtime half of the same hole scripts/check-migration-grants.sh now catches statically.
do $$
declare v text;
begin
  select string_agg(format('view %s (reloptions=%s)', c.relname,
                           coalesce(array_to_string(c.reloptions, ','), 'none')), ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (
           select lower(replace(o, ' ', '')) from unnest(coalesce(c.reloptions, '{}')) o), false);
  if v is not null then
    raise exception 'FAIL 4b: view(s) in public run with owner rights and bypass RLS — create them WITH (security_invoker = true) or drop them: %', v;
  end if;

  select string_agg(distinct format('%s %s→%s(%s)',
           case c.relkind when 'v' then 'view' else 'matview' end,
           c.relname,
           case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
           a.privilege_type), ', ') into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relkind in ('v', 'm')
     and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 0);
  if v is not null then
    raise exception 'FAIL 4b: view/matview reachable by a browser role (owner rights, RLS bypassed): %', v;
  end if;

  select string_agg(c.relname, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'm';
  if v is not null then
    raise notice 'NOTE 4b materialized view(s) exist in public (%) — a matview cannot be security_invoker, so it must never be granted to a browser role', v;
  end if;
  raise notice 'PASS 4b no view bypasses RLS and no view or matview is granted to anon, authenticated or PUBLIC';
end $$;

-- ── 4c. nothing in `public` is granted to PUBLIC ─────────────────────────────────────────────
-- Separate from 3c and 4 because a grant to PUBLIC is held by every role that exists now and every
-- role created later, including `anon`, and it is not visible as an `anon` grant in
-- information_schema. No migration in this repo grants a relation privilege to PUBLIC; the
-- assertion is therefore absolute, and it is the check that would catch a dashboard-issued
-- `grant select on <table> to public`.
do $$
declare v text;
begin
  select string_agg(distinct format('%s:%s', c.relname, a.privilege_type), ', ') into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and a.grantee = 0;
  if v is not null then raise exception 'FAIL 4c: relation privileges granted to PUBLIC: %', v; end if;
  raise notice 'PASS 4c no relation privilege in public is granted to PUBLIC';
end $$;

-- ── 5. the column-level grants: R7/R8/R10 and the overlay-only UPDATE ───────────────────────
-- Also moved off information_schema, for the same two reasons as check 4 (matviews absent, enabled
-- roles only) and one more: pg_attribute.attacl holds ONLY real column grants, whereas
-- role_column_grants also expands table-level grants per column. Every row in the expected set
-- below is a genuine column grant — `authenticated` holds no table-level UPDATE anywhere and no
-- table-level SELECT on `sources` — so the two sources agree on this schema, and the catalogue form
-- keeps agreeing if a view or matview ever appears. A table-level UPDATE appearing by accident is
-- caught by check 4, not here; both are needed.
do $$
declare v text;
begin
  with actual as (
    select cl.relname::text t, att.attname::text c, a.privilege_type::text p
      from pg_class cl
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = cl.oid and att.attnum > 0 and not att.attisdropped
      cross join lateral aclexplode(att.attacl) a
     where n.nspname = 'public'
       and cl.relkind in ('r', 'p', 'v', 'm', 'f')
       and a.grantee = 'authenticated'::regrole
       and (a.privilege_type = 'UPDATE' or cl.relname = 'sources')
  ), expected(t, c, p) as (values
    -- profiles: display name only
    ('profiles','display_name','UPDATE'),
    -- imports: cancel and completion only (R7)
    ('imports','status','UPDATE'), ('imports','completed_at','UPDATE'),
    -- saved_places: the per-user overlay only — user_id, place_id, origin are not grantable
    ('saved_places','display_name','UPDATE'), ('saved_places','category_override','UPDATE'),
    ('saved_places','note','UPDATE'), ('saved_places','visit_state','UPDATE'),
    ('saved_places','visited_at','UPDATE'),
    -- sources: display fields only. content_text, created_at and updated_at are withheld (R8)
    ('sources','id','SELECT'), ('sources','platform','SELECT'),
    ('sources','platform_source_id','SELECT'), ('sources','canonical_url','SELECT'),
    ('sources','author_handle','SELECT'), ('sources','author_name','SELECT'),
    ('sources','thumbnail_url','SELECT'), ('sources','fetch_status','SELECT'),
    ('sources','fetch_error_code','SELECT'), ('sources','fetched_at','SELECT')
  )
  select string_agg(format('%s %s.%s(%s)', kind, t, c, p), ', ' order by t, c, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.c, a.p from actual a
      left join expected e on e.t = a.t and e.c = a.c and e.p = a.p where e.t is null
    union all
    select 'MISSING' kind, e.t, e.c, e.p from expected e
      left join actual a on a.t = e.t and a.c = e.c and a.p = e.p where a.t is null
  ) d;
  if v is not null then raise exception 'FAIL 5: column grant drift for authenticated: %', v; end if;
  raise notice 'PASS 5  column grants match: caption withheld, overlay-only UPDATE, no forged review payload';
end $$;

-- ── 6. function execute privileges — the load-bearing grant list (security.md §1) ───────────
-- Exhaustive, both directions: EXECUTE defaults to PUBLIC on every new function, so an omission
-- here is a grant to everyone rather than a grant to nobody. That is how anon ended up able to call
-- save_place (0009). has_function_privilege accounts for privileges held via PUBLIC.
do $$
declare v text;
begin
  with fns as (
    select p.oid, p.proname::text n
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
  ), actual as (
    select n, 'anon' role from fns where has_function_privilege('anon', oid, 'EXECUTE')
    union all
    select n, 'authenticated' from fns where has_function_privilege('authenticated', oid, 'EXECUTE')
  ), expected(n, role) as (values
    ('save_place','authenticated'),      -- the user-facing write, SECURITY INVOKER
    ('km_between','authenticated')       -- the near-me query runs as the user
    -- anon: nothing, ever (08 §5.1)
    -- resolve_place / merge_places / start_import: service_role only
    -- place_name_key / place_survivor_id (0011): service_role only
    -- touch_updated_at / assert_* / handle_new_user: nobody
  )
  select string_agg(format('%s %s→%s', kind, role, n), ', ' order by role, n) into v from (
    select 'UNEXPECTED' kind, a.n, a.role from actual a
      left join expected e on e.n = a.n and e.role = a.role where e.n is null
    union all
    select 'MISSING' kind, e.n, e.role from expected e
      left join actual a on a.n = e.n and a.role = e.role where a.n is null
  ) d;
  if v is not null then raise exception 'FAIL 6: function grant drift: %', v; end if;
  raise notice 'PASS 6  only save_place and km_between are reachable by a browser role; anon has nothing';
end $$;

-- ── 7. the triggers that carry invariants actually exist and are enabled ────────────────────
do $$
declare v text;
begin
  with expected(tbl, trg) as (values
    ('auth.users','on_auth_user_created'),               -- R9: the profile precondition
    ('public.places','places_alias_required'),           -- 08 §1.6: every place has an alias
    -- 0011: the same invariant from the alias side. Deleting or re-pointing every alias of a LIVE
    -- place left it with no provider identity at all; places_alias_required is AFTER INSERT ON
    -- places and never saw it. Tombstones are exempt by ruling (08 §1.4/§1.6).
    ('public.place_provider_refs','ppr_alias_retained_on_delete'),
    ('public.place_provider_refs','ppr_alias_retained_on_move'),
    ('public.saved_places','saved_places_provenance_required'),
    ('public.saved_place_sources','sps_provenance_preserved'),
    ('public.profiles','profiles_touch'), ('public.sources','sources_touch'),
    ('public.imports','imports_touch'), ('public.places','places_touch'),
    ('public.saved_places','saved_places_touch')
  )
  select string_agg(format('%s on %s', e.trg, e.tbl), ', ') into v
    from expected e
   where not exists (
     select 1 from pg_trigger t
      where t.tgname = e.trg and not t.tgisinternal
        and t.tgrelid = e.tbl::regclass and t.tgenabled = 'O');
  if v is not null then raise exception 'FAIL 7: missing or disabled trigger(s): %', v; end if;
  raise notice 'PASS 7  all eleven invariant/touch triggers exist and are enabled';
end $$;

-- ── 7b. the four invariant triggers are CONSTRAINT triggers, deferred to COMMIT ──────────────
-- Not cosmetic. Each of these invariants is only true at the END of a legitimate multi-statement
-- operation: resolve_place inserts the place before its alias, save_place the saved place before
-- its source row, and an alias replacement is a delete followed by an insert. Recreated as a plain
-- (immediate) trigger, every one of those correct sequences starts failing mid-transaction — and
-- the failure would look like a bug in the caller, not like trigger drift. tgconstraint <> 0 is
-- what makes it a constraint trigger; tgdeferrable + tginitdeferred are what make it fire at
-- COMMIT and, with it, what make `set constraints all immediate` in the policy tests meaningful.
do $$
declare v text;
begin
  with expected(tbl, trg) as (values
    ('public.places','places_alias_required'),
    ('public.place_provider_refs','ppr_alias_retained_on_delete'),
    ('public.place_provider_refs','ppr_alias_retained_on_move'),
    ('public.saved_places','saved_places_provenance_required'),
    ('public.saved_place_sources','sps_provenance_preserved')
  )
  select string_agg(format('%s on %s (constraint=%s deferrable=%s initdeferred=%s)',
                           e.trg, e.tbl, t.tgconstraint <> 0, t.tgdeferrable, t.tginitdeferred),
                    ', ') into v
    from expected e
    join pg_trigger t on t.tgname = e.trg and t.tgrelid = e.tbl::regclass and not t.tgisinternal
   where not (t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred);
  if v is not null then
    raise exception 'FAIL 7b: invariant trigger(s) not DEFERRABLE INITIALLY DEFERRED constraint triggers: %', v;
  end if;
  raise notice 'PASS 7b all five invariant triggers are constraint triggers deferred to COMMIT';
end $$;

-- ── 8. no extension was created by this schema (D6: no PostGIS, no geohash) ─────────────────
do $$
declare v text;
begin
  select string_agg(extname, ', ') into v from pg_extension
   where extname not in ('plpgsql', 'pg_stat_statements', 'pgcrypto', 'pg_graphql',
                         'pgjwt', 'uuid-ossp', 'supabase_vault', 'pg_net', 'pgsodium');
  if v is not null then
    raise notice 'NOTE 8  extensions present beyond the Supabase baseline: % — confirm none is ours (D6)', v;
  else
    raise notice 'PASS 8  no extension beyond the Supabase baseline; D6 holds';
  end if;
end $$;

rollback;
