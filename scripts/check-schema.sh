#!/usr/bin/env bash
# Read-only schema inventory, as part of `npm run verify`.
#
# WHY THIS IS IN `verify`. On 2026-08-26 a branch sat with a **red required CI check** for several
# commits while every local check was green, and was reported as finished on that basis. The failing
# job was `migrations · RLS policy tests`, and the failing step inside it was `db:inventory` — a
# check that `npm run verify` did not run. Two real defects were hiding behind it: a grant matrix
# that had drifted from migration 0017, and `anon` holding EXECUTE on `save_place` again (0009's bug,
# reintroduced). Neither was exotic. Both were simply never looked at locally.
#
# `db:inventory` is the one part of CI's `database` job that is safe to run against a working dev
# database: it is strictly read-only and asserts the *schema*, not the data. Its sibling `db:test`
# is not — `supabase/tests/0008_policy_tests.sql` asserts exact row counts and needs a freshly reset,
# unseeded database, so it stays out of `verify` and stays in CI where the schema is rebuilt from
# migration 0001 every run.
#
# SKIPS RATHER THAN FAILS when there is no database to talk to. CI's own `verify` job runs on a
# runner with no Postgres, and a contributor without Docker running must still be able to lint and
# typecheck. A skip prints loudly and says what is left unverified, because a quiet skip is how this
# gap opened in the first place. It is not a substitute for CI: `docs/git-workflow.md` §9 is explicit
# that CI is the gate and this is only the fast filter in front of it.
set -uo pipefail
cd "$(dirname "$0")/.."

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
INVENTORY="supabase/tests/inventory.sql"

skip() {
  echo "check:schema  SKIPPED — $1"
  echo "              The schema inventory is part of the REQUIRED CI check"
  echo "              'migrations · RLS policy tests'. Skipping it here leaves the grant, policy,"
  echo "              function and trigger matrix unverified until CI runs."
  echo "              To run it locally:  npx supabase start  &&  npm run db:inventory"
  exit 0
}

command -v psql >/dev/null 2>&1 || skip "no psql on PATH."

# `-c 'select 1'` rather than pg_isready: pg_isready reports the server is accepting connections
# without proving these credentials can actually open one, which would turn a skip into a confusing
# failure two lines later.
psql "$DB_URL" -tAc 'select 1' >/dev/null 2>&1 \
  || skip "no database answering at ${DB_URL%%\?*}."

[ -f "$INVENTORY" ] || { echo "check:schema  FAIL — $INVENTORY is missing." >&2; exit 1; }

# ON_ERROR_STOP is what turns a failed assertion inside the file into a non-zero exit; without it
# psql prints the ERROR and exits 0, which is a check that cannot fail.
if ! output=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$INVENTORY" 2>&1); then
  echo "$output" >&2
  echo "" >&2
  echo "check:schema  FAIL — the live schema does not match supabase/tests/inventory.sql." >&2
  echo "              Either a migration changed something the inventory does not expect, or the" >&2
  echo "              inventory is out of date with a deliberate change. Decide which, in that" >&2
  echo "              order — the inventory is the spec, so moving it needs a reason written down." >&2
  exit 1
fi

echo "$output" | grep -E 'NOTICE:  (PASS|NOTE)' | sed 's/^psql:[^ ]* //' || true
echo "check:schema  OK — $(echo "$output" | grep -c 'NOTICE:  PASS') inventory checks passed against $DB_URL"
