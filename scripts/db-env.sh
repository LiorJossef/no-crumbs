#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db-env.sh — the single environment -> (project ref, connection string) table.
# Sourced, never executed. Sets: env_name, project_ref, project_name, db_url,
# db_url_var, and defines supa()/die()/say().
#
# One table, two consumers (scripts/db-push.sh, scripts/db-inventory-remote.sh),
# so "which database is this?" has exactly one answer per environment name and no
# command can inherit a target from ambient link state.
# ---------------------------------------------------------------------------

die() { printf '\n\033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }
say() { printf '\n\033[36m==>\033[0m %s\n' "$1"; }

# The pinned CLI (2.115.0, a package.json devDependency) - never a globally
# installed one, whose version this repo knows nothing about.
supa() {
  if [ -x "./node_modules/.bin/supabase" ]; then
    ./node_modules/.bin/supabase "$@"
  else
    die "supabase CLI not found at ./node_modules/.bin/supabase - run \`npm ci\` first.
Refusing to fall back to a global CLI: this repo pins 2.115.0."
  fi
}

# resolve_db_env <staging|prod>
resolve_db_env() {
  env_name="${1:-}"

  # Project refs are NOT secrets - the ref is the host of the public
  # NEXT_PUBLIC_SUPABASE_URL - and both are recorded in docs/archive/ms4-database.md §5,
  # so they are defaulted here to keep a clean clone runnable. Override per
  # environment if a project is ever recreated:
  #   SUPABASE_PROJECT_REF_STAGING / SUPABASE_PROJECT_REF_PROD
  case "$env_name" in
    staging)
      project_ref="${SUPABASE_PROJECT_REF_STAGING:-jfuqjzubphfhfleqnkno}"
      project_name="p-002-staging"
      db_url="${STAGING_DATABASE_URL:-}"
      db_url_var="STAGING_DATABASE_URL"
      ;;
    prod)
      project_ref="${SUPABASE_PROJECT_REF_PROD:-vtboskegexinvhasghri}"
      project_name="p-002-prod"
      db_url="${PROD_DATABASE_URL:-}"
      db_url_var="PROD_DATABASE_URL"
      ;;
    *)
      die "usage: $(basename "${0}") <staging|prod>   (got: '${env_name}')"
      ;;
  esac

  [ -n "$project_ref" ] || die "the project ref for '$env_name' is empty.
Set SUPABASE_PROJECT_REF_$(printf '%s' "$env_name" | tr '[:lower:]' '[:upper:]') to the ref in the
dashboard URL (/project/<ref>). See .env.example and docs/db-migration-runbook.md §2."

  # A ref is 20 lowercase letters. Catching a URL, a project name or a truncated
  # paste here is cheaper than catching it from an API error mid-command.
  printf '%s' "$project_ref" | grep -Eq '^[a-z]{20}$' \
    || die "'$project_ref' is not a Supabase project ref (expected 20 lowercase letters).
Refusing to act on an unidentifiable target."
}

# require_db_url — the connection string must exist AND must name this project.
# Without the second half, an unset variable makes DATABASE_URL empty, npm's
# `${DATABASE_URL:-postgresql://…54322…}` fallback kicks in, and a "staging proof"
# quietly passes against the local container. That is the same silent-mis-target
# defect this task exists to close, so it is checked, not commented.
require_db_url() {
  [ -n "$db_url" ] || die "$db_url_var is unset.
Refusing to run: with no connection string this would fall back to the LOCAL database
and report a PASS that says nothing about $project_name. Set $db_url_var to the
session-mode pooler URI from the project's Connect dialog (see .env.example and
docs/db-migration-runbook.md §2)."

  # Both Supabase connection-string shapes carry the ref: the pooler user is
  # `postgres.<ref>` and the direct host is `db.<ref>.supabase.co`.
  case "$db_url" in
    *"$project_ref"*) : ;;
    *) die "$db_url_var does not mention the project ref for $env_name.
  expected the string to contain : $project_ref  ($project_name)
The connection string and the environment name disagree, so one of them is wrong.
Nothing has been run. Fix $db_url_var, or correct the ref override." ;;
  esac

  command -v psql >/dev/null 2>&1 \
    || die "psql is not on PATH (\`brew install libpq\`), so nothing can be proven against
$project_name. Nothing has been run."
}
