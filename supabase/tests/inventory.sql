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
-- it. Locally those defaults are absent, so a fresh `supabase db reset` looks correct either way —
-- which is why the guarantee lives in `scripts/check-migration-grants.sh` (a static check over the
-- migrations, run in CI) rather than in a test that would pass locally regardless. Checks 4 and 5
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

-- ── 1. RLS is enabled AND forced on all eleven tables ───────────────────────────────────────
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
  -- 9 through 0009; 11 from 0010 (poi_regions, poi_index). The count is asserted, not just the
  -- flags: a table nobody designed is exactly the thing this check exists to notice.
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r') <> 11 then
    raise exception 'FAIL 1: expected 11 tables in public, found %',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r');
  end if;
  raise notice 'PASS 1  eleven tables, RLS enabled and forced on every one';
end $$;

-- ── 2. the policy set is exactly the designed one, in both directions ───────────────────────
do $$
declare v text;
begin
  with actual as (
    select tablename::text t, policyname::text p from pg_policies where schemaname = 'public'
  ), expected(t, p) as (values
    ('profiles','profiles_select_own'), ('profiles','profiles_insert_own'),
    ('profiles','profiles_update_own'),
    ('sources','sources_select_via_membership'),
    ('imports','imports_select_own'), ('imports','imports_update_own'),
    ('extractions','extractions_select_via_source_membership'),
    ('places','places_select_if_saved'),
    ('place_provider_refs','ppr_select_if_place_saved'),
    ('saved_places','saved_places_select_own'), ('saved_places','saved_places_insert_own'),
    ('saved_places','saved_places_update_own'), ('saved_places','saved_places_delete_own'),
    ('saved_place_sources','sps_select_own'), ('saved_place_sources','sps_insert_own'),
    ('saved_place_sources','sps_delete_own')
  )
  select string_agg(format('%s %s.%s', kind, t, p), ', ' order by t, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.p from actual a
      left join expected e on e.t = a.t and e.p = a.p where e.t is null
    union all
    select 'MISSING' kind, e.t, e.p from expected e
      left join actual a on a.t = e.t and a.p = e.p where a.t is null
  ) d;
  if v is not null then raise exception 'FAIL 2: policy drift: %', v; end if;
  raise notice 'PASS 2  sixteen policies, exactly as designed (place_lookups, poi_regions and poi_index deliberately have none)';
end $$;

-- ── 3. anon holds nothing at all (08 §5.1) ──────────────────────────────────────────────────
do $$
declare v text;
begin
  select string_agg(distinct format('%s:%s', table_name, privilege_type), ', ') into v
    from information_schema.role_column_grants
   where grantee = 'anon' and table_schema = 'public';
  if v is not null then raise exception 'FAIL 3: anon holds privileges: %', v; end if;
  raise notice 'PASS 3  anon holds no privilege on any table or column in public';
end $$;

-- ── 4. the table-level grant matrix for `authenticated` ─────────────────────────────────────
do $$
declare v text;
begin
  with actual as (
    select table_name::text t, privilege_type::text p
      from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
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
    -- at all on place_lookups (R11); table-level SELECT on sources (R8 — columns only, below);
    -- anything at all on poi_regions/poi_index (10 §12 Q2 — the index is server-side only, because
    -- a browser that can query it directly sits in front of no rate limiter). Those two need no
    -- entry here to be checked: this comparison is exhaustive in both directions, so a leaked
    -- grant on a new table appears as UNEXPECTED without anyone remembering to add it.
  )
  select string_agg(format('%s %s.%s', kind, t, p), ', ' order by t, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.p from actual a
      left join expected e on e.t = a.t and e.p = a.p where e.t is null
    union all
    select 'MISSING' kind, e.t, e.p from expected e
      left join actual a on a.t = e.t and a.p = e.p where a.t is null
  ) d;
  if v is not null then raise exception 'FAIL 4: table grant drift for authenticated: %', v; end if;
  raise notice 'PASS 4  table-level grants for authenticated match the design';
end $$;

-- ── 5. the column-level grants: R7/R8/R10 and the overlay-only UPDATE ───────────────────────
do $$
declare v text;
begin
  with actual as (
    select table_name::text t, column_name::text c, privilege_type::text p
      from information_schema.role_column_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and (privilege_type = 'UPDATE' or table_name = 'sources')
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
    -- pg_trgm's ~10 functions are absent because 0010 installs it into `extensions`, not `public`.
    -- In `public` each would arrive EXECUTE-able by PUBLIC and this check would fail a dozen times
    -- over — which is the reason for the schema choice, not a happy accident of it.
    -- anon: nothing, ever (08 §5.1)
    -- resolve_place / merge_places / start_import: service_role only
    -- place_name_key: service_role only
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
  raise notice 'PASS 7  all nine invariant/touch triggers exist and are enabled';
end $$;

-- ── 8. only the allow-listed extensions exist (D6: no PostGIS, no geohash) ──────────────────
-- Was a NOTE until 2026-08-18: "beyond the baseline" was reported for a human to adjudicate, which
-- is not a check. It is now an allow-list and a FAIL, because MS5 deliberately creates exactly one
-- extension and the whole value of saying so is that a *second* one is caught.
--   baseline  = what a hosted Supabase project ships with; not ours, not our business.
--   permitted = ours, one entry, justified: pg_trgm backs the POI index name prefilter (10 §5).
-- D6 is unaffected: it ruled on geometry types (no PostGIS), not on the extension mechanism.
do $$
declare v text;
begin
  select string_agg(extname, ', ' order by extname) into v from pg_extension
   where extname not in (
     -- Supabase baseline
     'plpgsql', 'pg_stat_statements', 'pgcrypto', 'pg_graphql',
     'pgjwt', 'uuid-ossp', 'supabase_vault', 'pg_net', 'pgsodium',
     -- ours, deliberately
     'pg_trgm');
  if v is not null then
    raise exception 'FAIL 8: unexpected extension(s): %. Ours is pg_trgm and nothing else (D6, 10 §5)', v;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    raise notice 'PASS 8  only pg_trgm beyond the Supabase baseline, as designed; D6 holds';
  else
    raise notice 'PASS 8  no extension beyond the Supabase baseline (pre-0010); D6 holds';
  end if;
end $$;

rollback;
