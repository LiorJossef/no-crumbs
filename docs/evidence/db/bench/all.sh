#!/bin/bash
set -e
for N in 100 1000 10000; do
  echo "############################## SCALE: ${N} users x 500 places"
  psql -U postgres -q -f /reset.sql
  psql -U postgres -q -v n_users=$N -v per_user=500 -f /seed.sql
  psql -U postgres -q -f /setup-postgis.sql
  echo "--- warm p50/p95 over 200 randomised parameter sets, planner free to choose"
  psql -U postgres -q -f /run.sql 2>/dev/null | grep -E "^ Q-"
  echo "--- EXPLAIN (ANALYZE, BUFFERS), warm (second execution)"
  psql -U postgres -q -f /explain.sql > /dev/null 2>&1 || true
  psql -U postgres -q -f /explain.sql 2>&1
  echo "--- PostGIS with the GiST index dropped (ST_DWithin as a filter on the user's rows)"
  psql -U postgres -q -f /nogist.sql 2>/dev/null | grep -E "^ Q-"
  psql -U postgres -q -c "create index places_geog_gix on public.places using gist (geog); analyze places;"
done
