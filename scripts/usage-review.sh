#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# usage-review.sh — READ-ONLY look at what a hosted environment actually stored
# during real use. Built for the owner's live-usage runs: they import in the
# product, this reads back what the resolver did, so the record is the database
# and not a memory of the screen.
#
#   bash scripts/usage-review.sh prod [since]      # since defaults to today
#
# Read-only by construction: one `set transaction read only` block, no writes,
# no DDL, no provider calls, so it spends no Google Places quota. Target comes
# from scripts/db-env.sh, so it cannot inherit a database from ambient link state.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/db-env.sh
. scripts/db-env.sh

resolve_db_env "${1:-}"
require_db_url
since="${2:-today}"

say "read-only usage review against $env_name -> $project_name ($project_ref), since '$since'"

psql "$db_url" -v ON_ERROR_STOP=1 -v since="$since" <<'SQL'
begin;
set transaction read only;

\echo ''
\echo '== 1. HOW EACH PIN WAS PLACED (the accuracy headline) =='
select coalesce(p.source_dataset, '(no provenance)') as placed_by,
       count(*) as places,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
  from public.saved_places sp
  join public.places p on p.id = sp.place_id
 where sp.created_at >= :'since'::timestamptz
 group by 1
 order by places desc;

\echo ''
\echo '== 2. EVERY PLACE SAVED, newest first =='
select to_char(sp.created_at, 'MM-DD HH24:MI') as saved,
       sp.origin,
       coalesce(sp.display_name, p.name)       as name,
       p.category,
       coalesce(p.locality, '-')               as locality,
       p.country_code                          as cc,
       coalesce(p.source_dataset, '?')         as placed_by,
       round(p.lat::numeric, 5) as lat,
       round(p.lng::numeric, 5) as lng,
       coalesce(array_to_string(sp.tags, ','), '') as tags
  from public.saved_places sp
  join public.places p on p.id = sp.place_id
 where sp.created_at >= :'since'::timestamptz
 order by sp.created_at desc;

\echo ''
\echo '== 3. IMPORTS AND WHAT EACH ONE YIELDED =='
select to_char(i.created_at, 'MM-DD HH24:MI') as at,
       i.status,
       i.stage,
       coalesce(i.error_code, '')    as error_code,
       coalesce(i.degraded_code, '') as degraded,
       i.ms_extract,
       i.ms_resolve,
       s.author_handle,
       left(s.canonical_url, 55) as link,
       -- Exact, not time-windowed: a saved place cites its source in saved_place_sources,
       -- so this counts the places this very post produced, however long the review took.
       (select count(*) from public.saved_place_sources sps
         where sps.source_id = i.source_id
           and sps.user_id  = i.user_id) as places_saved
  from public.imports i
  join public.sources s on s.id = i.source_id
 where i.created_at >= :'since'::timestamptz
 order by i.created_at desc;

\echo ''
\echo '== 4. PLACES WITH NO NOTE / NO TAGS (what the extractor left empty) =='
select count(*) filter (where sp.note   is null or btrim(sp.note) = '')   as no_note,
       count(*) filter (where sp.tags   is null or cardinality(sp.tags) = 0) as no_tags,
       count(*) filter (where sp.why_go is null or btrim(sp.why_go) = '') as no_why_go,
       count(*) filter (where sp.source_url is null)                      as no_source_url,
       count(*) as total
  from public.saved_places sp
 where sp.created_at >= :'since'::timestamptz;

\echo ''
\echo '== 5. GOOGLE PLACES QUOTA SPENT FROM THIS ENVIRONMENT TODAY =='
-- A row in place_lookups is written on a cache MISS, i.e. one real provider call. `hit_count`
-- counts the calls the cache saved. The daily cap is 100 Text Search requests PER CLOUD PROJECT
-- and the laptop shares the same key, so this is a LOWER BOUND on the day's total spend.
select l.provider,
       count(*) filter (where l.created_at >= date_trunc('day', now())) as calls_today,
       100 - count(*) filter (where l.created_at >= date_trunc('day', now())) as headroom_if_sole_user,
       coalesce(sum(l.hit_count), 0) as calls_saved_by_cache_all_time,
       count(*) as cached_entries_all_time
  from public.place_lookups l
 group by l.provider
 order by calls_today desc;

rollback;
SQL

printf '\n\033[32mOK\033[0m read-only review complete against %s (%s)\n' "$project_name" "$project_ref"
