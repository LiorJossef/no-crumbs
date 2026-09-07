#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db-push.sh — apply the checked-in migrations to ONE named hosted environment.
#
# Invoked only through the npm scripts, which name the target at the call site:
#
#   npm run db:push:staging      ->  scripts/db-push.sh staging
#   npm run db:push:prod         ->  scripts/db-push.sh prod
#
# Why this wrapper exists (MS1-MS4 audit, task 7): `supabase db push --linked`
# pushes to whatever project happens to be linked in supabase/.temp. Running the
# production command while linked to staging - or the reverse - is a silent
# mis-target of a schema migration, and nothing in the output says which database
# was hit. Every remote command below is therefore bound to an explicit
# --project-ref, the link state is asserted to agree with it, and the run is
# proven afterwards instead of assumed.
#
# Order of operations, and none of them is skippable:
#   0. DB_PUSH_DRY_RUN=1 stops after step 3 with --dry-run and writes nothing
#   1. resolve the target project ref for the named environment (fail if unset)
#   1b. run the static grant guard over the migration set (npm run check:migrations)
#   2. assert the linked project == the target (fail loudly, never re-link silently)
#   3. `supabase migration list --project-ref <ref>`  - the operator SEES local
#      vs remote drift before anything is written
#   3b. refuse to start if the post-check cannot run (no DB URL, no psql)
#   4. confirm the target by typing its ref (or DB_PUSH_CONFIRM=<ref>)
#   5. `supabase db push --project-ref <ref>`
#   6. post-check: `migration list` again, then the read-only inventory proof
#      (supabase/tests/inventory.sql) against that same environment
#
# ROLLBACK POSTURE: forward-fix only. This repo has no down migrations and will
# not grow any - see docs/db-migration-runbook.md §4 for the full posture and the
# named recovery path. A migration that lands badly is corrected by a new,
# higher-numbered migration pushed the same way. Read that section BEFORE you
# push to prod, not after.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/db-env.sh
. scripts/db-env.sh

# --- 1. the environment -> project ref binding (scripts/db-env.sh) ----------
resolve_db_env "${1:-}"

# DB_PUSH_DRY_RUN=1 runs every check and `db push --dry-run`, and writes nothing.
# It is the only way to exercise this script against a hosted project safely.
dry_run="${DB_PUSH_DRY_RUN:-}"

say "target: $env_name -> $project_name ($project_ref)"

# --- 1b. the static grant guard, before anything leaves this machine --------
# Every table created in public arrives with ALL granted to anon and authenticated
# on the hosted projects, and the migration role cannot change that default
# (docs/archive/ms4-database.md §2.3). check-migration-grants.sh is the only control that
# catches a missing REVOKE before it is live, so it runs on the way out too, not
# only in CI.
say "pre-check: static grant guard over supabase/migrations"
npm run --silent check:migrations \
  || die "the migration set fails scripts/check-migration-grants.sh. Nothing has been pushed.
A table without an explicit REVOKE from anon and authenticated is world-readable the
moment it lands on a hosted project."

# --- 2. link state must agree with the named target ------------------------
# --project-ref already decides where the write goes, so this is not what makes
# the push safe; it is what stops the operator reading `--linked` output from a
# different database than the one they are about to write to (step 3 uses the ref,
# but `supabase status`, the dashboard tab and muscle memory all follow the link).
linked_ref_file="supabase/.temp/project-ref"
if [ -f "$linked_ref_file" ]; then
  linked_ref="$(tr -d '[:space:]' < "$linked_ref_file")"
else
  linked_ref=""
fi

if [ "$linked_ref" != "$project_ref" ]; then
  die "linked project does not match the requested target.
  requested : $project_ref  ($env_name / $project_name)
  linked    : ${linked_ref:-<nothing linked>}
Nothing has been pushed. Link the intended project first, then re-run:
  npx supabase link --project-ref $project_ref
This is the mis-target guard: it will not re-link for you, because a command that
silently repoints itself at production is the defect it exists to prevent."
fi

# --- 2b. pre-flight for the POST-check, asserted before anything is written -
# A push that cannot be proven is not allowed to start, so this is checked now
# rather than after the write, when the failure would be expensive.
[ -n "$dry_run" ] || require_db_url

# --- 3. pre-check: local vs remote migration ledger ------------------------
say "pre-check: supabase migration list --project-ref $project_ref"
supa migration list --project-ref "$project_ref" \
  || die "could not read the remote migration ledger. Nothing has been pushed.
Check network, \`npx supabase login\` / SUPABASE_ACCESS_TOKEN, and SUPABASE_DB_PASSWORD."

cat <<EOF

Read the two columns above before continuing:
  * a LOCAL row with no REMOTE counterpart is what this push will apply
  * a REMOTE row with no LOCAL counterpart means this checkout is BEHIND the
    database - stop, pull, and do not push (see runbook §3)
EOF

if [ -n "$dry_run" ]; then
  say "DRY RUN: supabase db push --dry-run --project-ref $project_ref (writes nothing)"
  supa db push --dry-run --project-ref "$project_ref"
  printf '\n\033[32mOK\033[0m dry run only - nothing was written to %s, and the inventory\n' "$project_name"
  printf '     post-check was skipped because there is nothing new to prove.\n'
  exit 0
fi

# --- 4. confirmation naming the target -------------------------------------
say "type the target project ref to confirm the push to $env_name"
confirm="${DB_PUSH_CONFIRM:-}"
if [ -n "$confirm" ]; then
  printf 'confirmation supplied via DB_PUSH_CONFIRM\n'
elif [ -t 0 ]; then
  printf 'push migrations to %s (%s)? retype the ref: ' "$project_name" "$project_ref"
  read -r confirm
else
  die "no TTY and DB_PUSH_CONFIRM is unset. Nothing has been pushed.
Re-run interactively, or set DB_PUSH_CONFIRM=$project_ref if this is a scripted run."
fi
[ "$confirm" = "$project_ref" ] || die "confirmation '$confirm' != '$project_ref'. Nothing has been pushed."

# --- 5. the push -----------------------------------------------------------
say "pushing to $project_name ($project_ref)"
supa db push --project-ref "$project_ref" \
  || die "db push failed against $project_name ($project_ref).
A failed push is not automatically a clean database: read the CLI output for how far
it got, then follow docs/db-migration-runbook.md §4 (forward-fix only - do NOT
hand-edit the remote schema or the migration history table)."

# --- 6. post-check: prove the push, do not assume it -----------------------
say "post-check: supabase migration list --project-ref $project_ref"
supa migration list --project-ref "$project_ref" \
  || die "push reported success but the ledger could not be re-read. State UNPROVEN - see runbook §3."

say "post-check: read-only inventory proof against $project_name"
bash scripts/db-inventory-remote.sh "$env_name" \
  || die "PUSH APPLIED, PROOF FAILED against $project_name ($project_ref).
The schema is live and does not match the expected inventory. Push nothing else.
Follow docs/db-migration-runbook.md §4."

printf '\n\033[32mOK\033[0m migrations applied and proven against %s (%s)\n' "$project_name" "$project_ref"
printf '     ledger: local == remote (step 6) · inventory: read-only PASS lines above\n'
