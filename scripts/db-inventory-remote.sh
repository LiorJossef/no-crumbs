#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db-inventory-remote.sh — run the read-only structural proof against ONE named
# hosted environment.
#
#   npm run db:inventory:staging   ->  scripts/db-inventory-remote.sh staging
#   npm run db:inventory:prod      ->  scripts/db-inventory-remote.sh prod
#
# supabase/tests/inventory.sql opens a read-only transaction and rolls back; it is
# the only check in this repo that may be pointed at production
# (docs/ms4-database.md §1). The behavioural suite (0008_policy_tests.sql) must
# never be: it creates fixture auth.users rows (R12). There is deliberately no
# db:test:prod script for that reason.
#
# This is also step 6 of scripts/db-push.sh: a push is proven, not assumed.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/db-env.sh
. scripts/db-env.sh

resolve_db_env "${1:-}"
require_db_url

say "read-only inventory against $env_name -> $project_name ($project_ref)"
# inventory.sql's own header prints the database and server address it reached, so
# the run's output identifies its target independently of this script's claim.
psql "$db_url" -v ON_ERROR_STOP=1 -f supabase/tests/inventory.sql \
  || die "inventory FAILED against $project_name ($project_ref).
Read the first FAIL line above. If a push preceded this, the schema is live and wrong:
docs/db-migration-runbook.md §4 (forward-fix only)."

printf '\n\033[32mOK\033[0m inventory clean against %s (%s)\n' "$project_name" "$project_ref"
