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
-- Design: docs/08-place-identity.md §3, §5, §5.1; technical-design.md §4.3 and §14 R7/R8/R10/R11;
-- docs/security.md §2.6 for the `places` column list (check 5) and the `service_role` matrix and role
-- attributes (checks 9/9b/9c).

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

-- ── 1. RLS is enabled AND forced on all fifteen tables ──────────────────────────────────────
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
  -- 9 through 0009; 11 from 0010 (poi_regions, poi_index); 15 from 0024 (collections,
  -- collection_members, collection_items, collection_invites); 16 from 0031 (place_mentions). The
  -- count is asserted, not just the flags: a table nobody designed is exactly the thing this check
  -- exists to notice.
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r') <> 16 then
    raise exception 'FAIL 1: expected 16 tables in public, found %',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r');
  end if;
  raise notice 'PASS 1  sixteen tables, RLS enabled and forced on every one';
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
       '(user_id = (select auth.uid()))',''),

    -- ── 0024: shared collections. The first rows in this schema one user may read because
    -- ANOTHER user put them there, so read the predicates rather than the names.
    --
    -- Every membership test goes through a SECURITY DEFINER helper (collection_role,
    -- can_edit_collection, place_is_in_my_collection, shares_a_collection_with) and that is not a
    -- readability choice: `postgres` owns them and carries BYPASSRLS, so they read
    -- collection_members WITHOUT re-entering its own SELECT policy. Inline the same EXISTS into any
    -- predicate below and the policy calls itself — Postgres does not notice at CREATE POLICY time,
    -- it raises `infinite recursion detected in policy for relation collection_members` at query
    -- time, i.e. in production. A "simplification" here that removes a function call is that bug.
    --
    -- collections. The SELECT qual has TWO disjuncts and both are load-bearing. The owner_id arm is
    -- not redundant belt-and-braces: an AFTER INSERT trigger seats the owner's membership row, but
    -- Postgres applies the SELECT policy to an `insert .. returning` tuple DURING the insert,
    -- before that trigger fires. PostgREST always uses RETURNING, so with `collection_role(id) is
    -- not null` alone nobody can create a collection at all (measured: 42501). Asserted
    -- behaviourally by C0b in supabase/tests/0024_collections_policy_tests.sql.
    ('collections','collections_select_member','SELECT','authenticated',
       '((owner_id = (select auth.uid())) or (collection_role(id) is not null))',''),
    ('collections','collections_insert_own','INSERT','authenticated',
       '','(owner_id = (select auth.uid()))'),
    ('collections','collections_update_owner','UPDATE','authenticated',
       '(collection_role(id) = ''owner''::text)','(collection_role(id) = ''owner''::text)'),
    ('collections','collections_delete_owner','DELETE','authenticated',
       '(collection_role(id) = ''owner''::text)',''),

    -- collection_members. There is deliberately NO INSERT policy and no INSERT grant (check 4):
    -- every membership row is written by the owner-seating trigger or by join_collection_via_token,
    -- both SECURITY DEFINER, so membership cannot be forged from a browser at all.
    -- The DELETE qual is "leave, or be removed by the owner", and its first conjunct
    -- (role <> 'owner') is what stops the collection being orphaned — drop it and the owner can
    -- delete their own membership row, leaving a collection whose one-owner index points at nothing.
    -- The UPDATE pair reads OLD in the qual and NEW in the with_check, which is how a single policy
    -- forbids both demoting the owner and minting a second one.
    -- `0026`: both quals gained `removed_at is null`, and the DELETE policy is GONE — ending a
    -- membership is `end_collection_membership` (definer) and the DELETE grant is revoked, because
    -- with it a removed member could delete their own tombstone and rejoin as a stranger. If a
    -- DELETE policy on this table ever reappears here, that hole has been reopened.
    ('collection_members','collection_members_select_member','SELECT','authenticated',
       '((removed_at is null) and (collection_role(collection_id) is not null))',''),
    ('collection_members','collection_members_update_by_owner','UPDATE','authenticated',
       '((collection_role(collection_id) = ''owner''::text) and (role <> ''owner''::text) and (removed_at is null))','((collection_role(collection_id) = ''owner''::text) and (role = any (array[''editor''::text, ''viewer''::text])))'),

    -- collection_items. The INSERT with_check has three conjuncts and the saved_places EXISTS is
    -- the one that bounds the whole feature: without it a user could point an item at ANY row of
    -- the global `places` table, and places_select_if_in_shared_collection (below) would then turn
    -- that into a read primitive over every place in the database. added_by = auth.uid() is what
    -- makes "added by <name>" unforgeable.
    ('collection_items','collection_items_select_member','SELECT','authenticated',
       '(collection_role(collection_id) is not null)',''),
    ('collection_items','collection_items_insert_editor','INSERT','authenticated',
       '','(can_edit_collection(collection_id) and (added_by = (select auth.uid())) and (exists (select 1 from saved_places sp where ((sp.place_id = collection_items.place_id) and (sp.user_id = (select auth.uid()))))))'),
    ('collection_items','collection_items_update_editor','UPDATE','authenticated',
       'can_edit_collection(collection_id)','can_edit_collection(collection_id)'),
    ('collection_items','collection_items_delete_editor','DELETE','authenticated',
       'can_edit_collection(collection_id)',''),

    -- collection_invites. All four commands are owner-only, including SELECT: `token` is a bearer
    -- credential, so a member who could read the invite list could mint new members at will.
    ('collection_invites','collection_invites_select_owner','SELECT','authenticated',
       '(collection_role(collection_id) = ''owner''::text)',''),
    ('collection_invites','collection_invites_insert_owner','INSERT','authenticated',
       '','((collection_role(collection_id) = ''owner''::text) and (created_by = (select auth.uid())))'),
    ('collection_invites','collection_invites_update_owner','UPDATE','authenticated',
       '(collection_role(collection_id) = ''owner''::text)','(collection_role(collection_id) = ''owner''::text)'),
    ('collection_invites','collection_invites_delete_owner','DELETE','authenticated',
       '(collection_role(collection_id) = ''owner''::text)',''),

    -- The two cross-table read paths 0024 opens, and the ONLY two. `places` gains a second SELECT
    -- policy beside places_select_if_saved, so a collaborator sees the shared place's IDENTITY;
    -- nothing is added to saved_places, saved_place_sources, sources, extractions or
    -- place_provider_refs, so the adder's note, visit_state, tags, why_go, extracted_reason,
    -- source_url and provenance do not travel with a share. visit_state in particular: sharing a
    -- `want_to_go` would disclose FUTURE location intent to everyone the link reached.
    -- `profiles` gains the peer read that makes "added by <name>" renderable; profiles holds no
    -- email (0002), so the disclosure is a display name and two timestamps.
    -- A THIRD entry appearing under either table here is a privacy decision, not a refactor.
    ('places','places_select_if_in_shared_collection','SELECT','authenticated',
       'place_is_in_my_collection(id)',''),
    ('profiles','profiles_select_collection_peers','SELECT','authenticated',
       'shares_a_collection_with(id)',''),

    -- ── 0031: place_mentions, E1. THREE policies, and the fourth's absence is deliberate: there is
    -- NO INSERT POLICY because there is no INSERT grant (check 4/5), the shape `imports` has had
    -- since 0003 B7 and `collection_members` since 0024. A mention is written by
    -- record_place_mention(), SECURITY DEFINER and granted to service_role alone. An INSERT policy
    -- appearing here means someone also granted INSERT, or is about to: with no grant the policy is
    -- unreachable, and with a grant it is a standing permission nobody reviewed.
    --
    -- Every qual is `user_id = (select auth.uid())` and there is no second arm, no membership
    -- predicate and no helper function — a mention is import history in its purest form (a record
    -- that you pasted a post and what we thought was in it), so it must not become readable through
    -- a shared collection or an invite token. 0024:579-581 already refuses to disclose which post
    -- someone saved a place from; security-ruling-e1-caption-retention.md §4 upgrades that from a
    -- scope line to a veto condition for this table. A predicate here naming any collection_* table,
    -- or a new arm on sources_select_via_membership / the extractions policy above, is that veto
    -- being broken.
    --
    -- The UPDATE policy carries a with_check as well as a qual. It is not redundant: the only
    -- UPDATE-grantable column today is `dismissed`, so re-parenting is already impossible by grant —
    -- the with_check is what keeps it impossible if the grant is ever widened.
    ('place_mentions','place_mentions_select_own','SELECT','authenticated',
       '(user_id = (select auth.uid()))',''),
    ('place_mentions','place_mentions_update_own','UPDATE','authenticated',
       '(user_id = (select auth.uid()))','(user_id = (select auth.uid()))'),
    ('place_mentions','place_mentions_delete_own','DELETE','authenticated',
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

  -- ── condition 12 (0031): place_mentions has exactly THREE policies, and the fourth's absence is
  -- an asserted fact rather than an omission ────────────────────────────────────────────────────
  -- DELIBERATELY REDUNDANT with the both-directions comparison above, which already reports a
  -- fourth as `UNEXPECTED place_mentions.<name>`. Do not delete it as duplication: the count is the
  -- thing being asserted, and a generic UNEXPECTED line does not tell the next reader WHY three is
  -- the designed number. It is this:
  --
  --   A MISSING POLICY IS A DENY, AND IT FAILS LOUDLY, IN DEVELOPMENT. RLS is enabled *and forced*
  --   on every table in this schema, so if a later migration grants INSERT on place_mentions
  --   without an INSERT policy, the very first insert anyone tries returns zero rows / 42501, on a
  --   local container, immediately.
  --
  --   A POLICY WITHOUT A GRANT DOES THE OPPOSITE. It sits inert and unreadable as a control, and
  --   then activates SILENTLY — and activates as PERMISSION — the moment an unrelated change adds
  --   the grant, with nobody re-reading the predicate.
  --
  -- So three is not a convention and not a shortfall against the ruling's §4 "four" (superseded by
  -- its own author: the four contradicted the precedent that same section cites — `imports` 0003 B7
  -- and `collection_members` 0024, both of which have no INSERT grant AND no INSERT policy). Three
  -- is the arrangement whose failure mode is the safe one.
  --
  -- Behavioural half, when a container exists: M5f (authenticated holds no INSERT) and M12d (this
  -- same count, read under RLS) in supabase/tests/0031_place_mentions_policy_tests.sql.
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'place_mentions') <> 3 then
    raise exception 'FAIL 2: place_mentions has % policies, expected exactly three (select/update/delete own). There is deliberately NO INSERT POLICY, because there is no INSERT grant: a mention is written only by record_place_mention(), which is SECURITY DEFINER and granted to service_role alone. A fourth policy here means either the INSERT grant has been widened, or a policy is now sitting inert waiting to become permission the moment somebody widens it',
      (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'place_mentions');
  end if;

  raise notice 'PASS 2  thirty-six policies, exact name/command/role/qual/with_check match, and place_mentions has exactly three (place_lookups, poi_regions and poi_index deliberately have none)';
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
    ('place_provider_refs','SELECT'),
    ('saved_places','SELECT'), ('saved_places','DELETE'),
    ('saved_place_sources','DELETE'),
    -- 0024. SELECT and DELETE only, on all four. INSERT is COLUMN-level everywhere it exists (check
    -- 5) and absent entirely on collection_members, so a table-level INSERT appearing on any of
    -- these four is a real regression rather than a tidy-up: on collection_invites it would hand
    -- the client `token`, i.e. let the creator choose the bearer credential instead of taking
    -- gen_random_uuid()'s, which is how a share link becomes guessable. There is no table-level
    -- UPDATE either, for the same reason it is absent on saved_places.
    ('collections','SELECT'), ('collections','DELETE'),
    -- SELECT only since `0026`. `authenticated` holds NO INSERT, NO DELETE and no row-level UPDATE
    -- grant on this table at all: membership is created by a trigger or `join_collection_via_token`
    -- and ended by `end_collection_membership`, all SECURITY DEFINER. A DELETE reappearing in this
    -- list means a removed member can delete their own tombstone and rejoin as a stranger.
    ('collection_members','SELECT'),
    ('collection_items','SELECT'), ('collection_items','DELETE'),
    ('collection_invites','SELECT'), ('collection_invites','DELETE'),
    -- 0031: DELETE ONLY, and the omissions are the design. There is no column-level DELETE in
    -- Postgres, so this one is table-level by construction and is bounded by
    -- place_mentions_delete_own; the ruling permits it because, unlike `imports`, a mention is not
    -- an audit record and the user must be able to remove one. No table-level SELECT (the read is a
    -- named column list, check 5, so a column added later arrives ungranted — the discipline
    -- `extractions` does NOT have, which is why extractions.candidates.evidence is browser-readable
    -- today). No table-level UPDATE (only `dismissed` is writable). And NO INSERT AT ALL, at either
    -- level: a mention is created by record_place_mention() on the server, so an INSERT appearing
    -- here or in check 5 means a browser can mint mentions naming any source_id it likes.
    ('place_mentions','DELETE')
    -- deliberately absent: every write on sources/extractions/places/place_provider_refs (global
    -- tables are server-written); INSERT and DELETE on imports (R10, start_import only); anything
    -- at all on place_lookups (R11); table-level SELECT on sources (R8 — columns only, below) and,
    -- since 0012, table-level SELECT on `places` either (provider_payload is the raw provider
    -- response and must not reach a browser — security.md §2.6; columns only, check 5); anything at
    -- all on poi_regions/poi_index (10 §12 Q2 — the index is server-side only, because a browser
    -- that can query it directly sits in front of no rate limiter). Those last two need no entry
    -- here to be checked: this comparison is exhaustive in both directions, so a leaked grant on a
    -- new table appears as UNEXPECTED without anyone remembering to add it. Also deliberately
    -- absent since 0015: table-level INSERT on `saved_places` — replaced with a closed column-level
    -- grant (check 5), because a table-wide INSERT would have made the new `extracted_reason`
    -- column client-writable at row-creation time with no way to exclude it. And, since 0017,
    -- table-level SELECT **and** INSERT on `saved_place_sources` for the same reason: a table-wide
    -- grant on a link table is a standing licence over whatever columns it grows next, and the
    -- closed lists that replaced them are asserted in check 5 instead.
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

-- ── 5. the column-level grants: R7/R8/R10, the overlay-only UPDATE, and the places read list ──
-- Also moved off information_schema, for the same two reasons as check 4 (matviews absent, enabled
-- roles only) and one more: pg_attribute.attacl holds ONLY real column grants, whereas
-- role_column_grants also expands table-level grants per column. Every row in the expected set
-- below is a genuine column grant — `authenticated` holds no table-level UPDATE anywhere and no
-- table-level SELECT on `sources` or `places`, since 0015 no table-level INSERT on `saved_places`,
-- and since 0017 neither SELECT nor INSERT at table level on `saved_place_sources` — so the two
-- sources agree on this schema, and the catalogue form keeps
-- agreeing if a view or matview ever appears. A table-level UPDATE (or, for `saved_places`, INSERT)
-- appearing by accident is caught by check 4, not here; both are needed — and that division matters
-- for `places`:
-- a `grant select on public.places to authenticated` re-exposes provider_payload while leaving the
-- column grants below intact, so this check would still pass. Check 4 is the one that catches it.
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
       and (a.privilege_type = 'UPDATE'
            or cl.relname in ('sources', 'places', 'saved_places', 'saved_place_sources',
                              -- 0024's four: named here so their column-level INSERT lists are
                              -- asserted too, not just their UPDATE lists. Without these names the
                              -- `privilege_type = 'UPDATE'` arm above would let a widened INSERT
                              -- column list through unremarked, which on collection_invites means
                              -- a client-suppliable `token`.
                              'collections', 'collection_members',
                              'collection_items', 'collection_invites',
                              -- 0031: named so its SELECT list is asserted in full and so an
                              -- INSERT column grant on it would show up as UNEXPECTED. The
                              -- `privilege_type = 'UPDATE'` arm alone would see only `dismissed`
                              -- and would let a `grant insert (raw_name, ...)` through unremarked —
                              -- which is the whole no-INSERT-grant decision, undone silently.
                              'place_mentions'))
  ), expected(t, c, p) as (values
    -- profiles: display name only
    ('profiles','display_name','UPDATE'),
    -- imports: cancel and completion only (R7)
    ('imports','status','UPDATE'), ('imports','completed_at','UPDATE'),
    -- saved_places: the per-user overlay only — user_id, place_id, origin are not grantable
    ('saved_places','display_name','UPDATE'), ('saved_places','category_override','UPDATE'),
    ('saved_places','note','UPDATE'), ('saved_places','visit_state','UPDATE'),
    ('saved_places','visited_at','UPDATE'),
    -- saved_places: 0015's closed INSERT column list — everything a client legitimately creates a
    -- row with. `extracted_reason` was deliberately left out of it so the column would stay
    -- system-derived; **0017 grants it back**, because `save_place` is `security invoker` and so
    -- runs with the caller's privileges — without the column grant the function's own INSERT is
    -- rejected. The consequence is measured, not assumed: an authenticated client can POST straight
    -- to `/saved_places` with any `extracted_reason` it likes and it lands verbatim, bypassing
    -- `save_place` entirely. RLS confines that to the caller's **own** row (`saved_places_insert_own`
    -- checks `user_id = auth.uid()`), so it is a user lying to themselves about their own
    -- provenance, not a cross-user write — and UPDATE is still refused (42501), because the column
    -- is not in the UPDATE grant, so a reason cannot be rewritten after the fact. Closing it
    -- properly means making `save_place` `security definer` (with a pinned `search_path`) and
    -- revoking this grant; that is a security change owed its own review, tracked in
    -- `docs/current-state.md` §3, not something to slip in beside an unrelated migration.
    ('saved_places','extracted_reason','INSERT'),
    ('saved_places','user_id','INSERT'), ('saved_places','place_id','INSERT'),
    ('saved_places','display_name','INSERT'), ('saved_places','category_override','INSERT'),
    ('saved_places','note','INSERT'), ('saved_places','visit_state','INSERT'),
    ('saved_places','visited_at','INSERT'), ('saved_places','origin','INSERT'),
    -- saved_place_sources: 0017's narrowing of the provenance link table from table-level grants to
    -- closed column lists. `added_at` is readable but not insertable — it is the row's own record of
    -- when the link was made, and a client that could write it could backdate provenance.
    ('saved_place_sources','saved_place_id','INSERT'), ('saved_place_sources','source_id','INSERT'),
    ('saved_place_sources','user_id','INSERT'),
    ('saved_place_sources','saved_place_id','SELECT'), ('saved_place_sources','source_id','SELECT'),
    ('saved_place_sources','user_id','SELECT'), ('saved_place_sources','added_at','SELECT'),
    -- sources: display fields only. content_text, created_at and updated_at are withheld (R8)
    ('sources','id','SELECT'), ('sources','platform','SELECT'),
    ('sources','platform_source_id','SELECT'), ('sources','canonical_url','SELECT'),
    ('sources','author_handle','SELECT'), ('sources','author_name','SELECT'),
    ('sources','thumbnail_url','SELECT'), ('sources','fetch_status','SELECT'),
    ('sources','fetch_error_code','SELECT'), ('sources','fetched_at','SELECT'),
    -- places: our own normalised columns only (0012). provider_payload — the raw provider response —
    -- is the one that matters: table-wide SELECT shipped it to every co-saver's browser. Also
    -- withheld: name_key, provider_fetched_at, merged_into_place_id, created_at, updated_at.
    ('places','id','SELECT'), ('places','name','SELECT'), ('places','category','SELECT'),
    ('places','provider_category','SELECT'), ('places','address_line','SELECT'),
    ('places','locality','SELECT'), ('places','region','SELECT'),
    ('places','country_code','SELECT'), ('places','lat','SELECT'), ('places','lng','SELECT'),
    -- 0015: attribution + freshness for the Spot card. source_dataset_id stays withheld (0015's
    -- own header) — it is an internal join key, same class as name_key.
    ('places','source_dataset','SELECT'), ('places','resolution_score','SELECT'),
    ('places','last_verified_at','SELECT'),
    -- ── 0024: shared collections. Every entry below is a REAL column grant; the four tables also
    -- hold table-level SELECT and DELETE (check 4), which do not appear in attacl.
    -- collections: rename/redescribe, and create with exactly the three columns the client sends.
    -- id/created_at/updated_at are absent on purpose — a client-chosen primary key and a backdated
    -- row are what a table-level INSERT would have permitted.
    ('collections','name','UPDATE'), ('collections','description','UPDATE'),
    ('collections','owner_id','INSERT'), ('collections','name','INSERT'),
    ('collections','description','INSERT'),
    -- collection_members: `role` and nothing else, and NO INSERT of any kind — the two SECURITY
    -- DEFINER writers are the only way a membership row comes into existence.
    ('collection_members','role','UPDATE'),
    -- collection_items: the shared overlay is note+position. collection_id, place_id and added_by
    -- are INSERT-only, never UPDATE — an item cannot be moved, repointed or re-attributed after the
    -- fact, independently of whether the policy is right.
    ('collection_items','note','UPDATE'), ('collection_items','position','UPDATE'),
    ('collection_items','collection_id','INSERT'), ('collection_items','place_id','INSERT'),
    ('collection_items','added_by','INSERT'), ('collection_items','note','INSERT'),
    ('collection_items','position','INSERT'),
    -- collection_invites: `token` is DELIBERATELY ABSENT from the INSERT list and is the single
    -- most important omission in this whole expected set — it is the credential that admits a
    -- stranger to somebody else''s collection, so it must come from gen_random_uuid() and never
    -- from a request body. `revoked_at` is UPDATE-only (revocation is an act, not an initial
    -- state); `role` and `expires_at` are INSERT-only, so a live link cannot be silently upgraded
    -- from viewer to editor after it has been sent.
    ('collection_invites','revoked_at','UPDATE'),
    ('collection_invites','collection_id','INSERT'), ('collection_invites','role','INSERT'),
    ('collection_invites','expires_at','INSERT'), ('collection_invites','created_by','INSERT'),

    -- ── 0031: place_mentions, E1. Fifteen SELECT entries and exactly ONE UPDATE entry.
    -- `dismissed` is the only column a browser may write, on any statement, and that single line is
    -- acceptance criterion 5: `raw_name`, every hint and `reason` are the model's extraction of a
    -- third party's post, so an UPDATE of them from a browser must fail at the DATABASE with 42501,
    -- not in the UI. "The text is the post's, and is immutable" is a grant, not a policy — it holds
    -- independently of whether the RLS predicate is right.
    -- A SECOND ENTRY UNDER place_mentions IN THE UPDATE COLUMN, OR ANY ENTRY AT ALL WITH
    -- privilege_type = 'INSERT', IS A REGRESSION AND NOT A TIDY-UP:
    --   raw_name / *_hint / reason  UPDATE-able  -> a user can rewrite provenance after the fact
    --   user_id / source_id         UPDATE-able  -> a mention can be given away, or re-attributed
    --                                               to a post the user never pasted
    --   saved_place_id              UPDATE-able  -> "this became a place" becomes forgeable; it is
    --                                               written only by close_place_mention()
    --   anything                    INSERT-able  -> the no-INSERT-grant decision is gone, and with
    --                                               it the only thing making a mention the product
    --                                               of a deliberate server action
    -- `id`, `created_at` and `updated_at` are readable but not writable, for the reason 0024 states
    -- everywhere: a client-chosen primary key and a backdated row.
    ('place_mentions','dismissed','UPDATE'),
    ('place_mentions','id','SELECT'), ('place_mentions','user_id','SELECT'),
    ('place_mentions','source_id','SELECT'), ('place_mentions','external_url','SELECT'),
    ('place_mentions','raw_name','SELECT'), ('place_mentions','city_hint','SELECT'),
    ('place_mentions','country_hint','SELECT'), ('place_mentions','area_hint','SELECT'),
    ('place_mentions','address_hint','SELECT'), ('place_mentions','category_hint','SELECT'),
    ('place_mentions','reason','SELECT'), ('place_mentions','dismissed','SELECT'),
    ('place_mentions','saved_place_id','SELECT'), ('place_mentions','created_at','SELECT'),
    ('place_mentions','updated_at','SELECT')
  )
  select string_agg(format('%s %s.%s(%s)', kind, t, c, p), ', ' order by t, c, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.c, a.p from actual a
      left join expected e on e.t = a.t and e.c = a.c and e.p = a.p where e.t is null
    union all
    select 'MISSING' kind, e.t, e.c, e.p from expected e
      left join actual a on a.t = e.t and a.c = e.c and a.p = e.p where a.t is null
  ) d;
  if v is not null then raise exception 'FAIL 5: column grant drift for authenticated: %', v; end if;
  raise notice 'PASS 5  column grants match: caption and provider_payload withheld, overlay-only UPDATE, no forged review payload';
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
    ('km_between','authenticated'),      -- the near-me query runs as the user
    ('apply_saved_place_source_link','authenticated'),
    -- 0019's four normalisers. Pure, IMMUTABLE, SECURITY INVOKER, no table access — the same class
    -- as km_between, and they are on this list for a MEASURED reason rather than a cautious one: a
    -- CHECK constraint's function call IS permission-checked against the writing role (an insert
    -- without the grant fails 42501 `permission denied for function`), and Postgres re-evaluates
    -- every check constraint of a row on UPDATE. Without these four grants, a user editing the
    -- `note` on a saved place that happens to carry tags would have the edit refused — a silent
    -- break of L1-F7-T3. The trigger function `normalize_saved_place_enrichment` is deliberately
    -- NOT here: a trigger function is not permission-checked when the trigger fires (also measured),
    -- so granting it would be reachable surface with no purpose.
    ('normalize_tag','authenticated'),
    ('normalize_tag_list','authenticated'),
    ('normalize_sentence','authenticated'),
    ('tag_list_within','authenticated'),
    -- 0024's six browser-reachable functions. The first four are SECURITY DEFINER membership
    -- predicates and the grant is NOT optional: a policy expression is evaluated as the CALLING
    -- role, so without EXECUTE every read on the four collection tables fails 42501 instead of
    -- returning zero rows. They are safe to expose directly because none of them takes a user
    -- argument — collection_role/can_edit_collection/place_is_in_my_collection answer only about
    -- (select auth.uid()), so granting EXECUTE cannot turn them into a membership-probing oracle.
    -- shares_a_collection_with does take a user id and is still safe: it discloses nothing the
    -- caller could not read off the member lists of their own collections.
    ('collection_role','authenticated'),
    ('can_edit_collection','authenticated'),
    ('place_is_in_my_collection','authenticated'),
    ('shares_a_collection_with','authenticated'),
    -- The two invite entry points, both SECURITY DEFINER. join_collection_via_token is the ONLY
    -- client-reachable writer of a membership row; preview_collection_invite is what lets a join
    -- screen name the collection before the person is a member of it. Neither is granted to `anon`
    -- and that is a decision, not an oversight: an anon-callable preview would be an
    -- unauthenticated, token-guessable read of a real person''s collection name and display name.
    ('join_collection_via_token','authenticated'),
    ('preview_collection_invite','authenticated'),
    -- `0026`. `end_collection_membership` replaces the DELETE grant this file no longer expects;
    -- the other two are the owner's only way back from a removal, since rule 3 of the join function
    -- is absolute and the tombstones are invisible through the table itself.
    ('end_collection_membership','authenticated'),
    ('collection_removed_members','authenticated'),
    ('restore_collection_membership','authenticated')
    -- add_collection_owner_membership (0024) is NOT here, deliberately. It is a SECURITY DEFINER
    -- function that writes membership rows, and it is invoked by the executor as a trigger, which
    -- needs no EXECUTE grant (0009's claim, asserted behaviourally by P4b in 0008_policy_tests.sql
    -- and by C8b in 0024_collections_policy_tests.sql). Granting it would put a definer membership
    -- writer on the PostgREST RPC surface for no benefit at all.
    -- apply_saved_place_extraction (0019) is NOT here, and that is the whole point of it: it is the
    -- only writer of saved_places.tags / why_go / dishes, and it is granted to service_role alone.
    -- Those three columns carry no column grant either, so check 5 above proves the other half —
    -- a browser cannot write a place fact into them at all. That pair of absences is what keeps
    -- 0015/0017's `extracted_reason` hole (recorded in check 5) from being repeated three more times.
    -- SECURITY DEFINER (0016), called by save_place and safe to expose directly: it only ever
    -- writes source_url/source_thumbnail_url derived from a (saved_place, source) pair that its own
    -- WHERE clause requires the caller to already own via saved_place_sources, and only fills a
    -- currently-null value (coalesce), so a stray or repeated call is a no-op, never a forgery path.
    -- pg_trgm's ~10 functions are absent because 0010 installs it into `extensions`, not `public`.
    -- In `public` each would arrive EXECUTE-able by PUBLIC and this check would fail a dozen times
    -- over — which is the reason for the schema choice, not a happy accident of it.
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
  raise notice 'PASS 6  only save_place, km_between, apply_saved_place_source_link, 0019''s four pure normalisers and 0024''s six collection entry points are reachable by a browser role; apply_saved_place_extraction is service_role only; anon has nothing';
end $$;

-- ── 6b. no function in `public` is overloaded, and resolve_place's argument list is the designed one ──
-- WHY THIS EXISTS, and it is not hypothetical. 0010 as first written dropped the twelve-argument
-- `resolve_place` and created a fifteen-argument one, while 0011 — a HIGHER-numbered file — did
-- `create or replace` on the twelve-argument signature. In numeric order both signatures ended up
-- present, and every twelve-argument call then failed at run time with
-- `function public.resolve_place(...) is not unique` (42725) — in the import path, not in CI.
-- MEASURED on supabase/postgres:17.6.1.064 with 0001–0013 applied in order; fixed by 0014.
--
-- Neither check 6 nor check 9c could see it: both match by proname, so a second overload merely adds
-- a row that satisfies the same expectation. Overloading is therefore banned outright in `public`
-- rather than enumerated — nothing in this design has a reason to overload, adding parameters with
-- defaults is how the collision gets created by accident, and "one name, one function" is the
-- property every by-name check in this file silently assumes.
--
-- The argument list is asserted too, positionally. `resolve_place` is the one function whose
-- signature is a contract with the server-side caller (and with save_place's callers by proxy): a
-- migration that reorders two `text` parameters would keep every other check in this file green and
-- silently swap `locality` for `region` at every call site.
do $$
declare v text;
begin
  select string_agg(format('%s (%s overloads)', proname, n), ', ' order by proname) into v from (
    select p.proname::text, count(*) n
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
     group by 1 having count(*) > 1
  ) d;
  if v is not null then
    raise exception 'FAIL 6b: overloaded function(s) in public: %. One name, one function — every by-name check in this file assumes it, and an accidental overload makes existing calls ambiguous at run time (0010/0011, fixed in 0014)', v;
  end if;

  select pg_get_function_identity_arguments(p.oid) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'resolve_place';
  -- Names as well as types, because pg_get_function_identity_arguments prints both and the names are
  -- part of the contract: Supabase's RPC layer and every named-argument call site bind by name.
  if v is distinct from
       'p_provider text, p_provider_place_id text, p_name text, p_lat double precision, '
       'p_lng double precision, p_category text, p_provider_category text, p_address_line text, '
       'p_locality text, p_region text, p_country_code character, p_provider_payload jsonb, '
       'p_source_dataset text, p_source_dataset_id text, p_resolution_score real' then
    raise exception 'FAIL 6b: resolve_place argument list is %, expected the fifteen-argument form 0014 installs (…, jsonb, text, text, real)', coalesce(v, '<no such function>');
  end if;
  raise notice 'PASS 6b no function in public is overloaded; resolve_place takes the designed fifteen arguments';
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

-- ── 9. the `service_role` relation matrix — the trusted server path, asserted not assumed ────────
-- Until 0012 nothing in this repo granted `service_role` a single table privilege. Every server-side
-- read and write in `08` §5 ran on Supabase's ALTER DEFAULT PRIVILEGES (`service_role=arwdDxtm` on new
-- tables in `public`, owned by postgres and supabase_admin), which no migration states and no check
-- looked at. That fails closed, so it was never an exposure — but it was unproven in both directions:
-- if the defaults ever stop being seeded the server path breaks at runtime with CI green, and if
-- someone hand-narrowed it in the dashboard nothing would say so.
--
-- 0012 grants the matrix explicitly, so this check can be exact in both directions on every
-- environment. Two deliberate choices:
--   * the expected privilege SET is not hard-coded, it is `acldefault('r', ...)` — the full set of
--     privileges Postgres considers applicable to a table on THIS server version. PG17 added
--     MAINTAIN, so a literal seven-verb list would have been wrong on 17 and a literal eight-verb
--     list wrong on 15. The design statement is "ALL", and this is how you write ALL as a set.
--   * `is_grantable` must be false everywhere. WITH GRANT OPTION would let the server role hand
--     `authenticated` a privilege the design withholds — provider_payload on `places`, for instance —
--     from inside application code, with no migration and nothing for check 4 to catch until after.
-- Relations, not just tables: the expected set names every designed table, so a view or matview
-- granted to service_role shows up as UNEXPECTED. Any table a later migration adds must be named
-- here, which is the same discipline check 4 already imposes.
--
-- 0010's two POI tables are named in a SECOND set, with a different rule, and the difference is
-- deliberate. 0010 grants them `select, insert, update, delete` and no TRUNCATE on purpose (a region
-- reload is a scoped DELETE inside the load transaction, 10 §7), so the "exact ALL" rule above would
-- report four MISSING verbs on a database where the hosted ALTER DEFAULT PRIVILEGES had stopped
-- seeding — i.e. it would fail for doing the right thing. For these two the four verbs the loader
-- needs are REQUIRED and the rest are TOLERATED, because on every real environment the hosted
-- default hands service_role all eight and no migration role can take them back (0008, ms4-database
-- §2.3). Tolerating excess for service_role on a rebuildable search index is not a boundary
-- decision: these tables have no policy and zero grants to browser roles, which is checks 3 and 4.
do $$
declare v text;
begin
  with all_privs(p) as (
    select a.privilege_type::text from aclexplode(acldefault('r', 'service_role'::regrole)) a
  ), designed(t) as (values
    -- the global cache and the provider cache: `08` §5's whole justification for elevation
    ('sources'), ('extractions'), ('places'), ('place_provider_refs'), ('place_lookups'),
    -- user-owned. Held by hosted default, kept by ruling (0012 header part 2, security.md §2.6):
    -- service_role's boundary is key placement plus "a service-role query never filters by user_id",
    -- not privilege — a role with rolbypassrls cannot be fenced off these tables by grants.
    ('profiles'), ('imports'), ('saved_places'), ('saved_place_sources')
  ), designed_crud(t) as (values
    -- 0010: required four verbs, excess tolerated. See the note above.
    ('poi_regions'), ('poi_index')
  ), expected as (
    select d.t, ap.p from designed d cross join all_privs ap
    union all
    select d.t, v.p from designed_crud d
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) v(p)
  ), tolerated as (
    select d.t, ap.p from designed_crud d cross join all_privs ap
  ), actual as (
    select c.relname::text t, a.privilege_type::text p, a.is_grantable g
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and a.grantee = 'service_role'::regrole
  )
  select string_agg(format('%s %s.%s', kind, t, p), ', ' order by t, p) into v from (
    select 'UNEXPECTED' kind, a.t, a.p from actual a
      left join expected e on e.t = a.t and e.p = a.p
      left join tolerated tl on tl.t = a.t and tl.p = a.p
     where e.t is null and tl.t is null
    union all
    select 'MISSING' kind, e.t, e.p from expected e
      left join actual a on a.t = e.t and a.p = e.p where a.t is null
    union all
    select 'GRANTABLE' kind, a.t, a.p from actual a where a.g
  ) d;
  if v is not null then raise exception 'FAIL 9: service_role relation grant drift: %', v; end if;

  -- No column-level grant. service_role's grants are table-level ALL; a column grant would mean
  -- someone narrowed it by hand and this file no longer describes the database.
  select string_agg(distinct format('%s.%s:%s', c.relname, att.attname, a.privilege_type), ', ')
    into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
    cross join lateral aclexplode(att.attacl) a
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and a.grantee = 'service_role'::regrole;
  if v is not null then
    raise exception 'FAIL 9: service_role holds column-level grants (expected table-level ALL only): %', v;
  end if;

  raise notice 'PASS 9  service_role holds ALL on exactly the nine designed tables and at least CRUD on the two POI tables, without grant option, and no column-level grant';
end $$;

-- ── 9b. the role attributes the whole model rests on, none of which is a grant ────────────────
-- Grants are only half of it. `service_role` reads the global tables through **rolbypassrls**, not
-- through a policy — not one policy names it (check 2's expected set is `authenticated` throughout).
-- If that attribute were ever missing, RLS would be enforced against service_role, no policy would
-- match, and every trusted-server read would return zero rows: a silent, total server-path failure
-- that the grant matrix above cannot see. The mirror image is the exposure: BYPASSRLS on `anon` or
-- `authenticated` would defeat every policy in this schema at once, and the login-capability check is
-- what keeps the browser roles reachable only by PostgREST assuming them, never by direct connection.
-- Not settable from a migration (it needs superuser), which is exactly why it is asserted rather than
-- granted: this check is the only thing in the repo that would notice.
do $$
declare v text;
begin
  select string_agg(format('%s (bypassrls=%s login=%s super=%s)',
                           rolname, rolbypassrls, rolcanlogin, rolsuper), ', ' order by rolname)
    into v
    from pg_roles
   where (rolname = 'service_role'  and not rolbypassrls)
      or (rolname in ('anon', 'authenticated') and (rolbypassrls or rolcanlogin or rolsuper));
  if v is not null then
    raise exception 'FAIL 9b: role attributes wrong — service_role must have BYPASSRLS; anon and authenticated must have none of BYPASSRLS/LOGIN/SUPERUSER: %', v;
  end if;
  raise notice 'PASS 9b service_role bypasses RLS; anon and authenticated cannot bypass it, cannot log in and are not superusers';
end $$;

-- ── 9c. the trusted server can still call the functions it needs ─────────────────────────────
-- Check 6 is exhaustive about what a BROWSER role may execute, which is the direction that leaks.
-- This is the other direction, and it is the one that breaks the product silently: 0007/0009/0011
-- revoke EXECUTE from PUBLIC on every one of these, so if a future migration recreates one of them
-- and forgets the service_role grant, the whole import pipeline stops with a privilege error at
-- runtime and nothing in CI says a word.
--
-- Deliberately one-directional. An exhaustive expected set for service_role would fail here on every
-- Supabase project, because the same default privileges give it EXECUTE on every new function in
-- `public` (including the trigger functions granted "to nobody" in 0009's comment). Asserting that
-- excess absent would require revoking it, and EXECUTE on `touch_updated_at` held by the role that
-- already bypasses RLS is not a privilege boundary. The boundary that matters — those functions being
-- unreachable by `anon` and `authenticated` — is check 6, and it is exhaustive.
do $$
declare v text;
begin
  -- Matched by name, like check 6, rather than by a written-out signature: `resolve_place` takes
  -- twelve arguments and 0011 recreates it, so a literal signature here would be a maintenance trap
  -- that fails for the wrong reason. A name that resolves to no function fails as MISSING, which is
  -- the other regression worth catching.
  with expected(n) as (values
    ('resolve_place'), ('merge_places'), ('start_import'),
    ('place_survivor_id'), ('place_name_key'), ('km_between'),
    -- 0031's two writers. `authenticated` holds no INSERT on place_mentions and no grant on
    -- saved_place_id, so these are the ONLY way a mention is created or closed. If a later migration
    -- recreates either and forgets the service_role grant, "keep for later" stops working at runtime
    -- with a privilege error and check 6 — which is exhaustive only about the browser roles — says
    -- nothing. They are deliberately absent from check 6's expected set: neither is granted to anon
    -- or authenticated, and both would be an escalation if they were (they write columns the caller
    -- holds no grant on, security.md §1 invariant 1).
    ('record_place_mention'), ('close_place_mention')
  ), actual as (
    select p.proname::text n, p.oid
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
  )
  select string_agg(msg, ', ' order by msg) into v from (
    select format('MISSING %s', e.n) msg from expected e
      left join actual a on a.n = e.n where a.n is null
    union all
    select format('NO EXECUTE %s', a.n) from expected e join actual a on a.n = e.n
     where not has_function_privilege('service_role', a.oid, 'EXECUTE')
  ) d;
  if v is not null then
    raise exception 'FAIL 9c: service_role cannot execute the trusted-server function(s): %', v;
  end if;
  raise notice 'PASS 9c service_role can execute all eight server-side functions the pipeline, the repair path and the mention writers need';
end $$;

-- ── 9d. TRUNCATE for `service_role`: only where a migration actually asked for it ─────────────
-- WHY THIS IS SEPARATE FROM CHECK 9, which already compares service_role's whole ACL. Check 9 is a
-- matrix comparison and it TOLERATES excess on poi_regions/poi_index by design (read its header:
-- "the four verbs the loader needs are REQUIRED and the rest are TOLERATED"). That tolerance is
-- reasonable for SELECT/REFERENCES/TRIGGER/MAINTAIN and is NOT reasonable for TRUNCATE, so the one
-- verb that can empty a table in a single statement gets its own assertion with its own rule.
--
-- WHY TRUNCATE SPECIFICALLY. It is not subject to RLS — no policy is consulted, no row is filtered —
-- so it is the one privilege whose blast radius is "every row belonging to every user" regardless of
-- how correct the policies are. 0008's header records exactly this reasoning for `authenticated`;
-- this is the same argument applied to the other role that can reach these tables.
--
-- WHERE IT COMES FROM, measured on the local container 2026-08-28 while building 0024:
--
--   select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;
--     -> postgres | r | {postgres=arwdDxtm/postgres, service_role=Dxtm/postgres}
--
-- A `postgres`-owned ALTER DEFAULT PRIVILEGES entry, SEPARATE from the anon/authenticated ones 0008
-- documents and NOT removed by 0008 (which only revokes for anon and authenticated), hands
-- `service_role` D=TRUNCATE, x=REFERENCES, t=TRIGGER, m=MAINTAIN on every new table in `public`.
-- So a table that no migration ever mentions to service_role still arrives TRUNCATE-able by it.
-- 0024's four tables did exactly that and are revoked in 0024 as a result.
--
-- THE RULE, and the scan is over EVERY relation in `public` rather than a listed subset: TRUNCATE is
-- permitted only on the nine tables 0012 deliberately grants ALL to. That list is repeated verbatim
-- from check 9 rather than referenced, because a shared list would let a future edit to check 9
-- silently widen this one.
--
-- THE FIRST THING THIS CHECK FOUND, AND HOW IT WAS FIXED — read this before you touch the
-- allow-list. On its first run it failed on poi_regions and poi_index. 0010 grants those two
-- `select, insert, update, delete` and says in its own header that TRUNCATE is withheld on purpose
-- (a region reload is a scoped DELETE inside the load transaction, 10 §7), so the live grant
-- contradicted the migration that created them; check 9 tolerates that contradiction, this one
-- reported it. **`0025_revoke_stray_truncate.sql` fixes it forward** — it revokes TRUNCATE on those
-- two tables and nothing else, and restates the four verbs the region loader needs. So if this
-- check ever fails on poi_regions or poi_index again, 0025 has been lost or a later migration
-- re-widened them; the answer is another forward migration, NOT an entry in the allow-list below.
-- Adding a table to that list is a statement that TRUNCATE is part of its design, and there are
-- exactly nine tables for which that is true (0012).
-- ENVIRONMENT-SENSITIVE, and knowing which way round matters before you read a green run as proof:
-- this check PASSES on a database created without Supabase's ALTER DEFAULT PRIVILEGES (measured on a
-- bare replay of 0001–0024 into an empty database, where check 0 also reports PASS instead of its
-- usual NOTE) and FAILS on any database that carries them — which is every hosted project, the local
-- container, and CI after `supabase db reset`. So a PASS here from an environment whose check 0 says
-- PASS proves nothing; read check 0 first.
do $$
declare v text; n integer;
begin
  with designed_all(t) as (values
    -- verbatim from check 9's `designed` set: the nine tables 0012 grants ALL to.
    ('sources'), ('extractions'), ('places'), ('place_provider_refs'), ('place_lookups'),
    ('profiles'), ('imports'), ('saved_places'), ('saved_place_sources')
  ), actual as (
    select c.relname::text t, c.relkind::text k
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and a.grantee = 'service_role'::regrole
       and a.privilege_type = 'TRUNCATE'
  )
  select string_agg(format('%s (relkind=%s)', a.t, a.k), ', ' order by a.t), count(*)
    into v, n
    from actual a left join designed_all d on d.t = a.t
   where d.t is null;

  if v is not null then
    raise exception
      'FAIL 9d: service_role holds TRUNCATE on % relation(s) in public that no migration granted it '
      'on: %. TRUNCATE ignores RLS, so this is a single statement that empties every user''s rows. '
      'It arrives from the postgres-owned ALTER DEFAULT PRIVILEGES entry service_role=Dxtm, which '
      '0008 does not revoke (it names only anon and authenticated), so EVERY new table in public '
      'gets it unless the creating migration revokes it explicitly — as 0024 does for the four '
      'collection tables. Fix forward with `revoke truncate on public.<table> from service_role;` in '
      'a new migration; do not add the table to the allow-list above unless TRUNCATE is genuinely '
      'part of its design, in which case say so in the migration that grants it.', n, v;
  end if;
  raise notice 'PASS 9d service_role holds TRUNCATE only on the nine tables 0012 grants ALL to; no relation in public picked it up from the default privileges';
end $$;

rollback;
