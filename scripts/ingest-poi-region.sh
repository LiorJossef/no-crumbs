#!/usr/bin/env bash
# ---------------------------------------------------------------------------------------------
# ingest-poi-region.sh — extract, normalise and load ONE region of the POI index.
#
#   scripts/ingest-overture-extract.py   Overture S3 -> extract CSV     (Python + DuckDB)
#   scripts/load-poi-region.ts           extract CSV -> COPY CSV        (TypeScript, normalise())
#   this script                          COPY CSV    -> poi_index       (one psql transaction)
#
# The reload semantics are docs/10-poi-index.md §7, unchanged and in one transaction:
#   delete from poi_index where region_id = $r  ->  copy poi_index (...)  ->  update poi_regions
# TRUNCATE is deliberately not granted (10 §6); the delete is per region and nothing cascades to
# public.places, which is the whole point of the two tables being unrelated (10 §1).
#
# Three guards run BEFORE anything is written, all inside the transaction:
#   1. the region row exists;
#   2. poi_regions.dataset_release equals the pin in scripts/poi-ingest.config.json — otherwise the
#      load is refused unless --allow-release-change is passed. `06` §6.3's 44-case numbers were
#      measured on 2026-07-22.0, and loading a different release silently invalidates all of them;
#   3. poi_regions' bbox equals the config bbox the extract actually queried. A disagreement loads
#      rows a region-scoped query can never reach.
#
# It runs as service_role's equivalent (the migration/service connection), never in the request path
# and never in CI.
#
# Usage:
#   DATABASE_URL=postgresql://... scripts/ingest-poi-region.sh tlv [--work-dir DIR] \
#       [--skip-extract] [--allow-release-change] [--python PATH]
# ---------------------------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.."

die() { printf '\n\033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }
say() { printf '\n\033[36m==>\033[0m %s\n' "$1"; }

region=""
work_dir=""
skip_extract=0
allow_release_change=false
python_bin="${POI_PYTHON:-./venv/bin/python}"

while [ $# -gt 0 ]; do
  case "$1" in
    --work-dir) work_dir="${2:-}"; shift 2 ;;
    --python) python_bin="${2:-}"; shift 2 ;;
    --skip-extract) skip_extract=1; shift ;;
    --allow-release-change) allow_release_change=true; shift ;;
    -*) die "unknown option '$1'" ;;
    *) [ -z "$region" ] || die "one region at a time (got '$region' and '$1')"; region="$1"; shift ;;
  esac
done
[ -n "$region" ] || die "usage: $(basename "$0") <region> [--work-dir DIR] [--skip-extract] [--allow-release-change]"

command -v psql >/dev/null 2>&1 || die "psql is not on PATH (\`brew install libpq\`)."
command -v node >/dev/null 2>&1 || die "node is not on PATH."

# The pin, read from the one config the three halves share.
release="$(node -e 'process.stdout.write(require("./scripts/poi-ingest.config.json").overtureRelease)')" \
  || die "could not read overtureRelease from scripts/poi-ingest.config.json"

# Same default as package.json's db:test / db:inventory, so a local run needs no environment.
db_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
work_dir="${work_dir:-${TMPDIR:-/tmp}/p002-poi}"
mkdir -p "$work_dir" || die "could not create work dir $work_dir"
extract_csv="$work_dir/$region-extract.csv"
copy_csv="$work_dir/$region-copy.csv"

if [ "$skip_extract" -eq 0 ]; then
  say "extracting $region from Overture release $release"
  [ -x "$python_bin" ] || die "python interpreter '$python_bin' not found or not executable.
duckdb is not installed for the system python3; create the venv the way
docs/evidence/places/README.md's Reproduce block does, or pass --python.
  python3 -m venv venv && ./venv/bin/pip install duckdb"
  "$python_bin" scripts/ingest-overture-extract.py "$region" --out-dir "$work_dir" \
    || die "extract failed"
else
  say "skipping the extract, using $extract_csv"
  [ -f "$extract_csv" ] || die "$extract_csv does not exist, so there is nothing to load."
fi

say "normalising with src/domain/places/normalise.ts"
node scripts/load-poi-region.ts "$region" --in "$extract_csv" --out "$copy_csv" || die "load prep failed"
norm_version="$(node -e 'const m=require("fs").readFileSync(process.argv[1],"utf8");process.stdout.write(String(JSON.parse(m).norm_version))' "${copy_csv%.csv}-manifest.json")"
row_count="$(node -e 'const m=require("fs").readFileSync(process.argv[1],"utf8");process.stdout.write(String(JSON.parse(m).row_count))' "${copy_csv%.csv}-manifest.json")"
[ "$row_count" -gt 0 ] || die "the COPY CSV has no rows; refusing to mark the region loaded."

say "loading $row_count rows into poi_index (one transaction)"
sql_file="$work_dir/$region-load.sql"
cat > "$sql_file" <<'SQL'
\set ON_ERROR_STOP on
begin;

-- psql does NOT interpolate :variables inside a dollar-quoted body. Measured, on 17.6.1.064:
--   do $$ begin raise notice '%', :'region'; end $$;  ->  ERROR: syntax error at or near ":"
-- It fails loudly rather than silently, but it fails, so the guards' parameters are handed to the
-- DO blocks as transaction-local settings and read with current_setting() inside the body.
select set_config('poi.region',      :'region',              true),
       set_config('poi.release',     :'release',             true),
       set_config('poi.allow_change',:'allow_release_change',true),
       set_config('poi.row_count',   :'row_count',           true),
       set_config('poi.min_lat',     :'min_lat',             true),
       set_config('poi.max_lat',     :'max_lat',             true),
       set_config('poi.min_lng',     :'min_lng',             true),
       set_config('poi.max_lng',     :'max_lng',             true) \g /dev/null

-- Guards. All three raise, so the transaction ends before a single row is touched.
do $$
declare
  r         record;
  region    text    := current_setting('poi.region');
  release   text    := current_setting('poi.release');
  allow     boolean := current_setting('poi.allow_change')::boolean;
begin
  select * into r from public.poi_regions where id = region;
  if not found then
    raise exception 'region % is not seeded in poi_regions (migration 0010 seeds tlv, tyo, ldn)', region;
  end if;
  if r.dataset_release <> release and not allow then
    raise exception 'release pin mismatch for %: poi_regions says %, the config pin is %', region, r.dataset_release, release
      using hint = 'The 44-case benchmark in docs/06 6.3 was measured on the pinned release; '
                   'loading another one re-measures every number in it. Pass '
                   '--allow-release-change if that is genuinely intended.';
  end if;
  if r.min_lat <> current_setting('poi.min_lat')::double precision
     or r.max_lat <> current_setting('poi.max_lat')::double precision
     or r.min_lng <> current_setting('poi.min_lng')::double precision
     or r.max_lng <> current_setting('poi.max_lng')::double precision then
    raise exception 'bbox mismatch for %: poi_regions has (% % .. % %), the extract used (% % .. % %)',
      region, r.min_lat, r.min_lng, r.max_lat, r.max_lng,
      current_setting('poi.min_lat'), current_setting('poi.min_lng'),
      current_setting('poi.max_lat'), current_setting('poi.max_lng');
  end if;
end $$;

delete from public.poi_index where region_id = :'region';

SQL

# The COPY line is appended with the path substituted by the SHELL, not by psql. Measured on
# psql 17: `\copy ... from :'copy_csv'` reports `error: :: No such file or directory` — \copy
# parses its argument raw and is the one backslash command that does not interpolate variables.
printf '\\copy public.poi_index (%s) from %s with (format csv, header true)\n' \
  'source_dataset, dataset_place_id, region_id, name, name_norm, provider_category, address_line, locality, lat, lng, dataset_confidence' "'${copy_csv}'" >> "$sql_file"

cat >> "$sql_file" <<'SQL'

update public.poi_regions
   set row_count     = (select count(*) from public.poi_index where region_id = :'region'),
       ingested_at   = now(),
       is_loaded     = true,
       norm_version  = :norm_version,
       dataset_release = :'release'
 where id = :'region';

do $$
declare
  region   text    := current_setting('poi.region');
  expected integer := current_setting('poi.row_count')::integer;
  n        integer;
begin
  select row_count into n from public.poi_regions where id = region;
  if n <> expected then
    raise exception 'loaded % rows but the CSV had % — refusing to commit', n, expected;
  end if;
  raise notice 'loaded % rows into poi_index for region %', n, region;
end $$;

commit;

select id, dataset_release, norm_version, row_count, is_loaded, ingested_at
  from public.poi_regions where id = :'region';
SQL

bbox_json="$(node -e 'const r=require("./scripts/poi-ingest.config.json").regions[process.argv[1]];process.stdout.write([r.minLat,r.maxLat,r.minLng,r.maxLng].join(" "))' "$region")"
read -r min_lat max_lat min_lng max_lng <<< "$bbox_json"

psql "$db_url" -v ON_ERROR_STOP=1 \
  -v region="$region" -v release="$release" -v copy_csv="$copy_csv" \
  -v norm_version="$norm_version" -v row_count="$row_count" \
  -v allow_release_change="$allow_release_change" \
  -v min_lat="$min_lat" -v max_lat="$max_lat" -v min_lng="$min_lng" -v max_lng="$max_lng" \
  -f "$sql_file" || die "the load transaction failed; nothing was committed."

say "done: region $region, release $release, $row_count rows, norm_version $norm_version"
