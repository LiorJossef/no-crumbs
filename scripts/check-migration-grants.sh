#!/usr/bin/env bash
# Every table created in `public` must ship with RLS enabled AND forced in the same migration, and
# every table AND view created in `public` must have ALL privileges revoked from BOTH
# browser-reachable roles by that migration or a later one. A view is the sharper case: it executes
# with its owner's rights and is not subject to the RLS of the tables it reads, and
# ALTER DEFAULT PRIVILEGES ... ON TABLES covers views, so an unrevoked view in `public` is a
# cross-user read on the hosted projects.
#
# This is a compensating control, not a style rule. The hosted projects carry
# ALTER DEFAULT PRIVILEGES, owned by `supabase_admin`, granting ALL on new tables in `public` to
# `anon` and `authenticated`. The migration role cannot remove those defaults (measured on
# p-002-staging 2026-08-18, see docs/ms4-database.md §2.3), so **every new table arrives wide open**
# and the revoke is the only thing that closes it. The local container carries the same defaults (an
# earlier draft of docs/ms4-database.md claimed the local database was clean; that was wrong, see
# §2.3 of that file), so the defaults are present everywhere. That is why this cannot be left to a
# test: RLS passes with or without the revoke, so a local `supabase db reset` looks correct either
# way and proves nothing about the revoke.
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

# A blanket `revoke all on all tables in schema public` only touches relations that already exist
# when it executes. In a later migration file that is guaranteed; inside the creating file it is not,
# so there the blanket revoke only counts if it appears AFTER the create.
blanket_revoked_after() {        # $1 = file, $2 = line the relation is created on
  local f="$1" after="$2" n
  while IFS=: read -r n _; do
    [ "$n" -gt "$after" ] && return 0
  done < <(grep -Eni "revoke +all +on +all +tables +in +schema +public +from +([^;]*\banon\b[^;]*\bauthenticated\b|[^;]*\bauthenticated\b[^;]*\banon\b)" "$f")
  return 1
}

# ── relation discovery ─────────────────────────────────────────────────────────────────────────
# Prints one record per CREATE TABLE / CREATE VIEW statement in $1:
#   table <line> <name>    a table in `public` — an unqualified `create table x` lands there too
#   view  <line> <name>    a view or materialized view in `public`
#   other <line> <schema>  a relation in another schema: the `public` default privileges do not reach it
#   bad   <line> <text>    looks like a CREATE TABLE/VIEW but does not parse — a hard failure, never a
#                   silent skip, because the form this guard cannot read is the dangerous one.
relations() {
  awk '
    function emit(kind, s,    rel, rest, dot, schema, name) {
      gsub(/"/, "", s)
      if (match(s, /^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?/) == 0) { print "bad " FNR " " $0; return }
      rel  = substr(s, 1, RLENGTH)
      rest = substr(s, RLENGTH + 1)
      if (rest !~ /^([ \t]*$|[ \t]*[(;]|[ \t]+as([ \t]|$))/) { print "bad " FNR " " $0; return }
      dot = index(rel, ".")
      if (dot) { schema = substr(rel, 1, dot - 1); name = substr(rel, dot + 1) }
      else     { schema = "public";                name = rel }
      if (schema != "public") { print "other " FNR " " schema; return }
      print kind " " FNR " " name
    }
    { l = tolower($0); sub(/^[ \t]+/, "", l) }
    l ~ /^--/ { next }
    l ~ /^create[ \t]+(unlogged[ \t]+)?table[ \t]/ {
      s = l
      sub(/^create[ \t]+(unlogged[ \t]+)?table[ \t]+(if[ \t]+not[ \t]+exists[ \t]+)?/, "", s)
      emit("table", s); next
    }
    l ~ /^create[ \t]+(or[ \t]+replace[ \t]+)?(materialized[ \t]+)?view[ \t]/ {
      s = l
      sub(/^create[ \t]+(or[ \t]+replace[ \t]+)?(materialized[ \t]+)?view[ \t]+(if[ \t]+not[ \t]+exists[ \t]+)?/, "", s)
      emit("view", s); next
    }
    l ~ /^create$/                                          { print "bad " FNR " " $0 }
    l ~ /^create[ \t]/ && l ~ /[ \t](table|view)([ \t;(]|$)/ { print "bad " FNR " " $0 }
  ' "$1"
}

for i in "${!files[@]}"; do
  f="${files[$i]}"
  while read -r kind ln t; do
    [ -z "$kind" ] && continue
    [ "$kind" = other ] && continue
    if [ "$kind" = bad ]; then
      echo "::error::$f:$ln has a CREATE this guard cannot parse, so it cannot be proven closed: $t" >&2
      echo "         Write it as \`create [unlogged ]table [if not exists ]public.<name>\` or" >&2
      echo "         \`create [or replace ][materialized ]view public.<name>\`." >&2
      fail=1
      continue
    fi
    checked=$((checked + 1))

    if [ "$kind" = table ]; then
      grep -Eqi "alter +table +public\.$t +enable +row +level +security" "$f" || {
        echo "::error::$f creates public.$t without ENABLE ROW LEVEL SECURITY in the same file" >&2
        fail=1
      }
      grep -Eqi "alter +table +public\.$t +force +row +level +security" "$f" || {
        echo "::error::$f creates public.$t without FORCE ROW LEVEL SECURITY in the same file" >&2
        fail=1
      }
    fi

    covered=0
    for ((j = i; j < ${#files[@]}; j++)); do
      if both_roles_revoked "${files[$j]}" "$t"; then covered=1; break; fi
      if [ "$j" -eq "$i" ]; then
        blanket_revoked_after "${files[$j]}" "$ln" && { covered=1; break; }
      elif both_roles_revoked "${files[$j]}" "ALL"; then
        covered=1; break
      fi
    done
    [ "$covered" = 1 ] || {
      echo "::error::public.$t ($kind, created at $f:$ln) is never revoked from both anon AND authenticated." >&2
      grep -Eqi "revoke +all +on +all +tables +in +schema +public" "$f" && {
        echo "         The blanket revoke in this file does not count: it runs before the create on" >&2
        echo "         line $ln, so it cannot touch this $kind. Move it after the create." >&2
      }
      echo "         A hosted project grants ALL on new relations in public to both roles by default," >&2
      echo "         so this $kind is wide open there even though a local reset looks fine." >&2
      if [ "$kind" = view ]; then
        echo "         A view is the worst case: it executes with its owner's rights and is not subject" >&2
        echo "         to the RLS of the tables it reads, so this is a full cross-user read." >&2
      fi
      fail=1
    }
  done < <(relations "$f")
done

if [ "$fail" = 1 ]; then
  echo "migration grant guard: FAILED" >&2
  exit 1
fi
echo "migration grant guard: $checked relations in public, all revoked from both browser roles;
       every table also RLS enabled+forced"
