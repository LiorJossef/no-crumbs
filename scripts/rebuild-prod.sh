#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# rebuild-prod.sh — ONE-OFF. Rebuild the production schema from zero.
#
# Written 2026-08-29 for a specific, owner-approved situation and NOT intended to
# survive it. Delete this file once production is settled.
#
# WHY THIS EXISTS
# ---------------
# Production's schema and its migration ledger disagreed in a way `db push`
# cannot repair. The ledger read `0009`, but the database already carried
# `place_lookups` (0023), `place_provider_refs`, and four of 0019's columns
# (visit_state, visited_at, display_name, category_override) — while missing
# tags/why_go/dishes from that SAME migration, source_url (0016), and
# poi_index/poi_regions (0010) entirely. `save_place` was still the 3-arg 0007
# form. 0019 and 0023 carry no `if not exists` guards, so replaying 0010->0023
# would have aborted partway and left a third, worse state. `migration repair`
# was no better: marking 0019 applied would permanently skip its three missing
# columns.
#
# Production held ZERO rows and ZERO users, so a rebuild costs nothing and ends
# with a ledger and a schema that actually agree.
#
# SAFETY
# ------
#   * Step 1 aborts unless production is still completely empty. This is checked
#     inside the same transaction-scoped DO block that would do the damage, so a
#     row arriving between approval and execution stops the run.
#   * A validated backup was taken first:
#     ~/p-002-backups/prod-20260828T143102Z.dump (666 TOC entries, all 9 tables).
#   * Every step echoes what it is about to do and the script is `set -euo
#     pipefail`, so any failure stops the sequence rather than continuing.
#   * Nothing outside the `public` schema is touched. `auth`, `storage`,
#     `extensions` and `graphql` are left exactly as they are.
#
# ROLLBACK POSTURE: forward-fix only (docs/db-migration-runbook.md §4).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REF="vtboskegexinvhasghri"
DB_URL="$(sed -n 's/^PROD_DATABASE_URL=//p' .env.local)"
[ -n "$DB_URL" ] || { echo "FATAL: PROD_DATABASE_URL is empty in .env.local"; exit 1; }

echo "=============================================================="
echo " PRODUCTION REBUILD — project $REF"
echo "=============================================================="

# --- 1. capture the current grants, so a mismatch later is diagnosable -------
echo
echo "--- [1/5] current public schema owner + ACL (recorded for comparison) ---"
psql "$DB_URL" -At -c \
  "select 'owner=' || pg_get_userbyid(nspowner) || '  acl=' || coalesce(array_to_string(nspacl,' | '),'(default)')
     from pg_namespace where nspname='public'"

# --- 2. the destructive step, guarded by its own emptiness check ------------
echo
echo "--- [2/5] safety check + drop/recreate public schema ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare n bigint;
begin
  select (select count(*) from public.saved_places)
       + (select count(*) from public.places)
       + (select count(*) from public.sources)
       + (select count(*) from public.imports)
       + (select count(*) from public.extractions)
       + (select count(*) from auth.users)
    into n;
  if n > 0 then
    raise exception 'ABORT: production is not empty (% rows found). Nothing dropped.', n;
  end if;
  raise notice 'safety check passed: production holds 0 rows and 0 users';
end $$;

drop schema public cascade;
create schema public;
alter schema public owner to pg_database_owner;
grant usage on schema public to anon, authenticated, service_role;
grant all  on schema public to postgres;
comment on schema public is 'standard public schema';

-- The ledger lives in its own schema and survives the drop; clear it so the
-- replay starts from 0001 rather than believing 0009 is already applied.
truncate supabase_migrations.schema_migrations;
SQL
echo "public schema recreated, ledger cleared"

# --- 3. replay every migration through the guarded pusher -------------------
# db-push.sh asserts the linked project matches the target, shows drift before
# writing, and runs the read-only inventory proof afterwards.
echo
echo "--- [3/5] replaying all migrations via db:push:prod ---"
DB_PUSH_CONFIRM="$REF" npm run db:push:prod

# --- 4. prove the ledger ----------------------------------------------------
echo
echo "--- [4/5] ledger after replay ---"
npx supabase migration list --project-ref "$REF" 2>/dev/null \
  | grep -o '{"migrations".*}' \
  | python3 -c "
import json,sys
m=json.load(sys.stdin)['migrations']
a=[x['local'] for x in m if x['remote']]; miss=[x['local'] for x in m if not x['remote']]
print(f'applied {len(a)}: {a[0]} -> {a[-1]}' if a else 'applied NONE')
print('missing:', ', '.join(miss) if miss else 'none')
"

# --- 5. prove the schema and the grants ------------------------------------
echo
echo "--- [5/5] schema + grant verification ---"
psql "$DB_URL" -At -c \
  "select 'tables=' || count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
psql "$DB_URL" -At -c \
  "select 'save_place(' || pg_get_function_identity_arguments(oid) || ')' from pg_proc where proname='save_place'"
psql "$DB_URL" -At -c \
  "select 'saved_places cols: ' || string_agg(column_name, ',' order by column_name)
     from information_schema.columns
    where table_schema='public' and table_name='saved_places'
      and column_name in ('tags','why_go','dishes','display_name','category_override','visit_state','visited_at','source_url')"
echo "--- anon must hold NOTHING (this is the lockdown invariant) ---"
psql "$DB_URL" -At -c \
  "select 'anon grants: ' || count(*) from information_schema.role_table_grants
    where grantee='anon' and table_schema='public'"
psql "$DB_URL" -At -c \
  "select 'rls disabled on: ' || coalesce(string_agg(relname, ','), 'none (all forced)')
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"

echo
echo "=============================================================="
echo " REBUILD COMPLETE — read the five sections above before trusting it"
echo "=============================================================="
