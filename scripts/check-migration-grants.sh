#!/usr/bin/env bash
# Every table created in `public` must ship with RLS enabled AND forced in the same migration, and
# must have ALL privileges revoked from BOTH browser-reachable roles by that migration or a later one.
#
# This is a compensating control, not a style rule. The hosted projects carry
# ALTER DEFAULT PRIVILEGES, owned by `supabase_admin`, granting ALL on new tables in `public` to
# `anon` and `authenticated`. The migration role cannot remove those defaults (measured on
# p-002-staging 2026-08-18, see docs/ms4-database.md §2.3), so **every new table arrives wide open**
# and the revoke is the only thing that closes it. Locally the defaults are absent, which is exactly
# why this cannot be left to a test: a fresh `supabase db reset` looks correct either way.
#
# What went wrong without it: 0002 and 0006 revoked only `from anon`, so `authenticated` held
# UPDATE (all columns), DELETE and TRUNCATE on profiles, saved_places and saved_place_sources on
# staging. TRUNCATE is not subject to RLS — that was a path to wiping every user's rows.
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob
files=(supabase/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "no migrations found" >&2; exit 1; fi

fail=0
checked=0

both_roles_revoked() {           # $1 = file, $2 = table name (or ALL)
  local f="$1" t="$2" target
  if [ "$t" = "ALL" ]; then
    target="all +tables +in +schema +public"
  else
    target="public\.$t"
  fi
  grep -Eqi "revoke +all +on +$target +from +[^;]*\banon\b[^;]*\bauthenticated\b" "$f" ||
  grep -Eqi "revoke +all +on +$target +from +[^;]*\bauthenticated\b[^;]*\banon\b" "$f"
}

for i in "${!files[@]}"; do
  f="${files[$i]}"
  while read -r t; do
    [ -z "$t" ] && continue
    checked=$((checked + 1))

    grep -Eqi "alter +table +public\.$t +enable +row +level +security" "$f" || {
      echo "::error::$f creates public.$t without ENABLE ROW LEVEL SECURITY in the same file" >&2
      fail=1
    }
    grep -Eqi "alter +table +public\.$t +force +row +level +security" "$f" || {
      echo "::error::$f creates public.$t without FORCE ROW LEVEL SECURITY in the same file" >&2
      fail=1
    }

    covered=0
    for ((j = i; j < ${#files[@]}; j++)); do
      if both_roles_revoked "${files[$j]}" "$t" || both_roles_revoked "${files[$j]}" "ALL"; then
        covered=1; break
      fi
    done
    [ "$covered" = 1 ] || {
      echo "::error::public.$t (created in $f) is never revoked from both anon AND authenticated." >&2
      echo "         A hosted project grants ALL on new tables to both roles by default, so this" >&2
      echo "         table is wide open there even though a local reset looks fine." >&2
      fail=1
    }
  done < <(grep -Eoi '^ *create +table +public\.[a-z_]+' "$f" | sed -E 's/.*public\.//')
done

if [ "$fail" = 1 ]; then
  echo "migration grant guard: FAILED" >&2
  exit 1
fi
echo "migration grant guard: $checked tables, all with RLS enabled+forced and both browser roles revoked"
