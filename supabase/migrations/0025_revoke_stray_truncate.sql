-- 0025_revoke_stray_truncate.sql — take TRUNCATE on the two POI tables back off `service_role`.
--
-- PROBLEM. `service_role` holds TRUNCATE on `public.poi_regions` and `public.poi_index`, and no
-- migration in this repo ever granted it. Measured on the local container 2026-08-28:
--
--   select c.relname, string_agg(a.privilege_type, ',' order by a.privilege_type)
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     cross join lateral aclexplode(c.relacl) a
--    where n.nspname = 'public' and c.relname in ('poi_regions', 'poi_index')
--      and a.grantee = 'service_role'::regrole group by 1;
--     -> poi_index   | DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--        poi_regions | DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- `0010` lines 224-225 grant exactly four verbs — `select, insert, update, delete` — and its own
-- comment on the very next line says why the fifth is absent:
--
--   "No TRUNCATE: a region reload is `delete from poi_index where region_id = $r` inside the load
--    transaction (10 s7), which is per-region and rollback-able. TRUNCATE is neither."
--
-- So `0010` decided this, wrote the decision down, and did not get it. The other four verbs in the
-- list above (MAINTAIN, REFERENCES, TRIGGER, TRUNCATE) come from a `postgres`-owned
-- ALTER DEFAULT PRIVILEGES entry that hands `service_role` `Dxtm` on every new table in `public`:
--
--   select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;
--     -> postgres | r | {postgres=arwdDxtm/postgres, service_role=Dxtm/postgres}
--
-- `0008` does not remove it. `0008` revokes the equivalent defaults for `anon` and `authenticated`
-- and says so in its own header; `service_role` is named nowhere in that file, deliberately, because
-- `08` §5 wants the trusted server path to keep its grants. That reasoning is right for the nine
-- tables `0012` grants ALL to and wrong for the two tables `0010` deliberately narrowed — the
-- default silently re-widened them.
--
-- WHY TRUNCATE AND NOTHING ELSE. TRUNCATE is the one verb in that set that is **not subject to
-- RLS**: no policy is consulted and no row is filtered, so it is a single statement whose blast
-- radius is the whole table regardless of how correct the policies are. `0008`'s header makes
-- exactly this argument about `authenticated`; this is the same argument applied to the other role
-- that can reach these tables. MAINTAIN, REFERENCES and TRIGGER are left alone: they are not a data
-- boundary, `inventory.sql` check 9 tolerates them on these two tables by an explicit written
-- ruling, and removing them would be a second, unrelated decision smuggled into this one.
--
-- WHY NOT THE OTHER FOUR VERBS EITHER. `select, insert, update, delete` are REQUIRED here.
-- `service_role` is the only reader and writer of the POI index (`10` §12 ruling 2 — the browser
-- roles hold nothing at all, which is `inventory.sql` checks 3, 4 and 6b/6c in the policy tests),
-- and the region loader needs all four. Revoking any of them breaks ingest at runtime with CI green.
--
-- THIS RESTORES A STATE, IT DOES NOT CHANGE A DECISION. The design statement is `0010`'s, written
-- at the table's creation and quoted above verbatim; all that happened is that a platform default
-- granted something the migration had deliberately left ungranted, and nothing looked. What
-- is new here is the looking: `inventory.sql` check 9d (added alongside `0024`) is now the standing
-- assertion that `service_role` holds TRUNCATE only on the nine tables `0012` grants ALL to. Before
-- this migration that check fails on these two tables; after it, it passes on a database that
-- carries the Supabase defaults, which is the only kind of database where the finding is real.
--
-- EVERY FUTURE TABLE IN `public` ARRIVES WITH THIS GRANT. That is the durable half of the lesson and
-- it does not go away by fixing two tables: the default privilege entry above cannot be removed by
-- the migration role (`0008` tries, for the anon/authenticated entries, and reports that it cannot —
-- see its `raise notice`), so **every** `create table` in `public` from now on hands `service_role`
-- TRUNCATE on arrival. `0024` is the first migration in this repo to revoke it at creation time — it
-- names `service_role` in the same statement as the two browser roles, e.g.
-- `revoke all on public.collections from anon, authenticated, service_role;` — and every new
-- migration must keep doing that unless TRUNCATE is genuinely part of the table's design, in which
-- case the migration that wants it should grant it explicitly and say why. Check 9d is what enforces
-- this; it is a full scan of `public` against an allow-list, so a new table that skips the revoke
-- fails it by name.
--
-- Forward-only (`08` §9): `0010` is NOT edited. It has already been applied to local containers and
-- to both hosted projects, and editing an applied migration leaves them silently divergent from a
-- fresh `supabase db reset`. The correction is a new file, exactly as `0018` corrected `0017`.
--
-- No new tables and no new views, so `scripts/check-migration-grants.sh` has nothing to assert here.

begin;

-- Two statements rather than one comma-separated statement, so a failure names the table it
-- failed on. REVOKE on a privilege the role does not hold is a no-op, not an error, so this is
-- idempotent and is also correct on a database (a bare replay, a future Supabase image) whose
-- default privileges never granted it in the first place.
revoke truncate on public.poi_regions from service_role;
revoke truncate on public.poi_index   from service_role;

-- The four verbs `0010` actually asked for are restated rather than assumed. On a database that
-- never carried the default privilege entry, `0010`'s grants are the only source of these and this
-- block is a no-op; on one that did, it is the proof that the REVOKE above took exactly one verb
-- and not five. GRANT is idempotent.
grant select, insert, update, delete on public.poi_regions to service_role;
grant select, insert, update, delete on public.poi_index   to service_role;

-- Fail loudly here rather than let `inventory.sql` find it later. A migration that silently does
-- nothing is the failure mode this whole file exists because of.
do $$
declare v text;
begin
  select string_agg(format('%s:%s', c.relname, a.privilege_type), ', ' order by c.relname) into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relname in ('poi_regions', 'poi_index')
     and a.grantee = 'service_role'::regrole
     and a.privilege_type = 'TRUNCATE';
  if v is not null then
    raise exception '0025: TRUNCATE is still held by service_role after the revoke (%)', v;
  end if;

  select string_agg(format('%s missing %s', t, p), ', ') into v
    from (values ('poi_regions'), ('poi_index')) tbl(t)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) pv(p)
   where not exists (
     select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relname = tbl.t
        and a.grantee = 'service_role'::regrole and a.privilege_type = pv.p);
  if v is not null then
    raise exception '0025: the region loader lost a privilege it needs (%). 10 s7 requires all four', v;
  end if;

  raise notice '0025: service_role now holds exactly select/insert/update/delete on poi_regions and poi_index, as 0010 intended';
end $$;

commit;
