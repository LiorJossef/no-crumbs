#!/usr/bin/env bash
#
# Manual security probe for RICH-EXT-SEC — migration 0019's enrichment columns
# (`saved_places.tags` / `why_go` / `dishes`). NOT part of the CI suite.
#
#   bash tests/manual/rich-ext-sec.manual.sh
#
# WHAT THIS IS FOR, and why it is not a `supabase/tests/*.sql` assertion. `0008_policy_tests.sql`
# P25 proves the grants from *inside* Postgres, under `set local role authenticated`. That is the
# right place for it and it is not the same test as this one: the product's browser does not talk to
# Postgres, it talks to **PostgREST**, through Kong, with a real JWT minted by GoTrue. PostgREST
# compiles its own SQL — embeds, `on_conflict` upserts, `Prefer: resolution=merge-duplicates`, `PUT`
# — and the question this file answers is whether any of those request shapes reaches a column that
# `set local role` says is unreachable. `current-state.md` §3.4, the `extracted_reason` hole, was
# found exactly this way and not by reading DDL. `docs/working-agreement.md` §2/§3; the evidence
# feeds `L1-F10-T1`'s security document.
#
# Nine attack shapes, each run as a REAL signed-in user against their OWN row, so that RLS cannot be
# what refuses them — only the column grant can. Plus the same set as `anon`, the catalogue
# cross-check, the invisible-character coverage table, and the app/DB bound seam.
#
# SAFE TO RUN ON A DATABASE YOU CARE ABOUT — but read this paragraph before you do. Every attack is
# expected to be REFUSED, and a refused statement changes nothing. The one deliberate write is the
# control in §2: without proving the harness can write at all, nine refusals prove nothing. That
# write **snapshots `note` first and restores it**, because the author of this file overwrote a real
# note without snapshotting on the first run of these probes and could not restore the original
# value. It cannot restore `updated_at` (the `saved_places_touch` trigger owns it), so expect one
# row's `updated_at` to move to now. Set `PROBE_SKIP_CONTROL=1` to skip the control write entirely,
# at the cost of the negatives being unfalsifiable.
#
# It reads no `.env*` file and prints no key or token. The local anon key comes from
# `npx supabase status`, which is local-only, and is never echoed.
#
# Env overrides:
#   DATABASE_URL         default postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   PROBE_API            default http://127.0.0.1:54321
#   PROBE_EMAIL          default demo@example.com
#   PROBE_PASSWORD       default local-dev-preview-1234
#   PROBE_SKIP_CONTROL   set to 1 to skip the one deliberate write
#   PROBE_FUZZ           idempotency fuzz iterations, default 50000 (0 disables)
#
# NEVER point this at staging or production: it signs in, and `docs/agent-guardrails.md` §2.5
# forbids a specialist opening a hosted connection at all.

set -uo pipefail

DB="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
API="${PROBE_API:-http://127.0.0.1:54321}"
EMAIL="${PROBE_EMAIL:-demo@example.com}"
PASSWORD="${PROBE_PASSWORD:-local-dev-preview-1234}"
FUZZ="${PROBE_FUZZ:-50000}"

case "$DB$API" in
  *supabase.co*|*supabase.com*|*pooler*)
    echo "REFUSING: this looks like a hosted target. Local container only." >&2; exit 2;;
esac

TMP="$(mktemp -d)"
PASS=0; FAIL=0
cleanup () { rm -rf "$TMP"; }
trap cleanup EXIT

ok   () { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad  () { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
head_ () { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── preflight ────────────────────────────────────────────────────────────────────────────────
head_ "0. preflight"
command -v psql >/dev/null || { echo "psql not on PATH" >&2; exit 2; }
psql "$DB" -Atc 'select 1' >/dev/null 2>&1 || { echo "cannot reach $DB" >&2; exit 2; }
if [ "$(psql "$DB" -Atc "select count(*) from information_schema.columns
        where table_name='saved_places' and column_name in ('tags','why_go','dishes')")" != "3" ]; then
  echo "migration 0019 is not applied to this database" >&2; exit 2
fi
echo "  database reachable, 0019 applied"

ANON="$(npx --no-install supabase status 2>/dev/null | grep -o '"ANON_KEY":"[^"]*"' | cut -d'"' -f4)"
[ -n "$ANON" ] || { echo "could not read the local anon key from 'supabase status'" >&2; exit 2; }
echo "  anon key obtained (${#ANON} chars, not printed)"

# ── 1. a real session ────────────────────────────────────────────────────────────────────────
head_ "1. sign in as a real user (GoTrue password grant)"
TOK="$(curl -s -X POST "$API/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON" -H 'Content-Type: application/json' \
        -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')"
[ -n "$TOK" ] || { echo "sign-in failed for $EMAIL" >&2; exit 2; }
UID_="$(python3 -c '
import base64,json,sys
t=sys.argv[1].split(".")[1]; t+="="*(-len(t)%4)
print(json.loads(base64.urlsafe_b64decode(t))["sub"])' "$TOK")"
echo "  signed in, sub=$UID_ (token not printed)"

read -r ROW PLACE <<<"$(psql "$DB" -Atc \
  "select id || ' ' || place_id from public.saved_places where user_id='$UID_' order by created_at, id limit 1")"
[ -n "${ROW:-}" ] || { echo "$EMAIL owns no saved_places row to probe" >&2; exit 2; }
echo "  target row $ROW (owned by the signed-in user, so RLS permits it)"

# ── 2. control: the harness must be able to write, or the negatives below mean nothing ───────
head_ "2. control write (snapshot -> write -> restore)"
if [ "${PROBE_SKIP_CONTROL:-0}" = "1" ]; then
  echo "  SKIPPED (PROBE_SKIP_CONTROL=1) — every refusal below is now unfalsifiable"
else
  # SNAPSHOT AS BASE64, and this is not fussiness. The obvious form —
  #   psql -v n="$note" -c "update ... set note = :'n'"
  # is broken twice over: `psql -c` does NOT perform `:'var'` interpolation (only -f and stdin do),
  # so it fails with a syntax error, and a note containing a quote or a backslash would be a
  # quoting hazard even if it worked. Base64 is pure [A-Za-z0-9+/=], so it interpolates into SQL
  # with no escaping question at all. `@NULL@` is the sentinel for a genuinely absent note, which
  # must not come back as an empty string.
  NOTE_B64="$(psql "$DB" -Atc "select coalesce(translate(encode(convert_to(note,'UTF8'),'base64'),
                                E'\n', ''), '@NULL@')
                                 from public.saved_places where id='$ROW'")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/rest/v1/saved_places?id=eq.$ROW" \
          -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
          -d '{"note":"__rich_ext_sec_control__"}')"
  if [ "$code" = "204" ] || [ "$code" = "200" ]; then
    ok "an authenticated PATCH of a GRANTED column succeeds ($code) — the harness can write"
  else
    bad "the control write returned $code; every refusal below is meaningless"
  fi

  if [ "$NOTE_B64" = '@NULL@' ]; then
    psql "$DB" -qtc "update public.saved_places set note = null where id = '$ROW'" >/dev/null
  else
    psql "$DB" -qtc "update public.saved_places
                        set note = convert_from(decode('$NOTE_B64','base64'),'UTF8')
                      where id = '$ROW'" >/dev/null
  fi

  # VERIFY THE RESTORE. Printing 'restored' without checking is how the original of this probe lost
  # a real note: the restore had already failed silently and the message said otherwise.
  NOW_B64="$(psql "$DB" -Atc "select coalesce(translate(encode(convert_to(note,'UTF8'),'base64'),
                               E'\n', ''), '@NULL@')
                                from public.saved_places where id='$ROW'")"
  if [ "$NOW_B64" = "$NOTE_B64" ]; then
    ok "note restored byte-for-byte (updated_at cannot be — saved_places_touch owns it)"
  else
    bad "NOTE NOT RESTORED on row $ROW. Restore by hand before doing anything else:
           psql \"\$DATABASE_URL\" -c \"update public.saved_places set note =
             convert_from(decode('$NOTE_B64','base64'),'UTF8') where id = '$ROW'\""
  fi
fi

# ── 3. the nine attack shapes ────────────────────────────────────────────────────────────────
# Every one of these is a write the BROWSER is not allowed to make. All are aimed at the signed-in
# user's OWN row, so a refusal is the column grant and nothing else.
head_ "3. nine forged-write shapes, as the signed-in user, on their own row"

attack () { # label method path body [prefer]
  local label="$1" m="$2" p="$3" body="${4:-}" prefer="${5:-}"
  local out code
  out="$(curl -s -w '\n%{http_code}' -X "$m" "$API/rest/v1$p" \
          -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
          ${prefer:+-H "Prefer: $prefer"} ${body:+-d "$body"})"
  code="$(printf '%s' "$out" | tail -1)"
  if printf '%s' "$out" | grep -q '"code":"42501"'; then
    ok "$label -> 42501 refused at the database"
  else
    bad "$label -> HTTP $code, NOT refused: $(printf '%s' "$out" | head -1 | cut -c1-160)"
  fi
}

attack "A1 PATCH tags"                    PATCH "/saved_places?id=eq.$ROW" '{"tags":["forged"]}'
attack "A2 PATCH why_go"                  PATCH "/saved_places?id=eq.$ROW" '{"why_go":"forged"}'
attack "A3 PATCH dishes"                  PATCH "/saved_places?id=eq.$ROW" '{"dishes":["forged"]}'
attack "A4 PATCH note+tags (mixed)"       PATCH "/saved_places?id=eq.$ROW" '{"note":"x","tags":["forged"]}'
attack "A5 POST insert w/ tags (§3.4)"    POST  "/saved_places" \
       "{\"user_id\":\"$UID_\",\"place_id\":\"$PLACE\",\"origin\":\"manual\",\"tags\":[\"forged\"]}"
attack "A6 POST insert w/ why_go+dishes"  POST  "/saved_places" \
       "{\"user_id\":\"$UID_\",\"place_id\":\"$PLACE\",\"origin\":\"manual\",\"why_go\":\"f\",\"dishes\":[\"f\"]}"
attack "A7 upsert merge-duplicates"       POST  "/saved_places?on_conflict=user_id,place_id" \
       "{\"user_id\":\"$UID_\",\"place_id\":\"$PLACE\",\"origin\":\"manual\",\"tags\":[\"forged\"]}" \
       "resolution=merge-duplicates"
attack "A8 PUT single-row upsert"         PUT   "/saved_places?id=eq.$ROW" \
       "{\"id\":\"$ROW\",\"user_id\":\"$UID_\",\"place_id\":\"$PLACE\",\"origin\":\"manual\",\"tags\":[\"forged\"]}"
attack "A9 rpc apply_saved_place_extraction" POST "/rpc/apply_saved_place_extraction" \
       "{\"p_saved_place_id\":\"$ROW\",\"p_user_id\":\"$UID_\",\"p_tags\":[\"forged\"]}"

head_ "3b. the same, as anon (no user JWT)"
TOK_SAVE="$TOK"; TOK="$ANON"
attack "B1 anon PATCH tags"               PATCH "/saved_places?id=eq.$ROW" '{"tags":["forged"]}'
attack "B2 anon rpc the writer"           POST  "/rpc/apply_saved_place_extraction" \
       "{\"p_saved_place_id\":\"$ROW\",\"p_user_id\":\"$UID_\",\"p_tags\":[\"forged\"]}"
TOK="$TOK_SAVE"

head_ "3c. extracted_reason, the KNOWN hole (current-state.md §3.4) — for comparison, not a failure"
attack "C1 PATCH extracted_reason (UPDATE is closed)" PATCH "/saved_places?id=eq.$ROW" '{"extracted_reason":"forged"}'
echo "  NOTE: the INSERT half of §3.4 is still open by design and is NOT probed here — it would"
echo "        create a real row. \`supabase/tests/inventory.sql\` check 5 carries that measurement."

# ── 4. the catalogue, cross-checking what the requests just demonstrated ──────────────────────
head_ "4. grant matrix (the same claim, asked of the catalogue)"
psql "$DB" -Atc "
with g as (
  select privilege_type p, string_agg(column_name, ', ' order by column_name) c
    from information_schema.column_privileges
   where table_schema='public' and table_name='saved_places' and grantee='authenticated'
     and privilege_type in ('INSERT','UPDATE') group by 1)
select '  authenticated ' || p || ': ' || c from g order by 1;"
psql "$DB" -Atc "select '  saved_places relacl: ' || relacl::text from pg_class where oid='public.saved_places'::regclass;"
for col in tags why_go dishes; do
  n="$(psql "$DB" -Atc "select count(*) from information_schema.column_privileges
        where table_schema='public' and table_name='saved_places' and column_name='$col'
          and grantee in ('anon','authenticated','PUBLIC') and privilege_type in ('INSERT','UPDATE')")"
  [ "$n" = "0" ] && ok "$col carries no INSERT/UPDATE grant for any browser role" \
                 || bad "$col has $n browser INSERT/UPDATE grant(s)"
done
n="$(psql "$DB" -Atc "select count(*) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='public' and p.prosecdef
        and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
        and p.proname <> 'apply_saved_place_source_link'")"
[ "$n" = "0" ] && ok "no SECURITY DEFINER function is browser-reachable except the reviewed exception" \
               || bad "$n unreviewed SECURITY DEFINER function(s) reachable by a browser role (guardrails §5.18)"
n="$(psql "$DB" -Atc "select count(*) from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='public' and c.relkind in ('v','m')")"
[ "$n" = "0" ] && ok "no view exists in public that could sidestep the column grants" \
               || bad "$n view(s) in public — check security_invoker and ownership"

# ── 5. what actually reaches a browser as a chip ─────────────────────────────────────────────
head_ "5. invisible / bidi character coverage (these strings become UI chips)"
psql "$DB" -Atc "
with c(label, ch) as (values
  ('bidi override U+202E', U&'\\202E'), ('bidi isolate  U+2066', U&'\\2066'),
  ('RLM           U+200F', U&'\\200F'), ('ZWSP          U+200B', U&'\\200B'),
  ('ZWJ           U+200D', U&'\\200D'), ('BOM           U+FEFF', U&'\\FEFF'),
  ('soft hyphen   U+00AD', U&'\\00AD'), ('TAG smuggling U+E0041', U&'\\+0E0041'),
  ('variation sel U+FE0F', U&'\\FE0F'), ('hangul filler U+3164', U&'\\3164'),
  ('combining     U+0301', U&'\\0301'))
select '  ' || rpad(label, 22) ||
       case when public.normalize_tag('ab'||ch||'cd') = 'abcd' then 'stripped'
            else 'SURVIVES to the browser' end
  from c;"
n="$(psql "$DB" -Atc "select count(*) from (values (U&'\\202E'),(U&'\\2066'),(U&'\\200F'),(U&'\\200B'),
      (U&'\\200D'),(U&'\\FEFF'),(U&'\\00AD'),(U&'\\+0E0041')) v(ch)
      where public.normalize_tag('ab'||ch||'cd') <> 'abcd'")"
[ "$n" = "0" ] && ok "every bidi / zero-width / TAG-block character is stripped" \
               || bad "$n bidi or zero-width character(s) reach the browser"
psql "$DB" -Atc "select case when public.normalize_tag(U&'\\3164') is null
                   then '  (fixed) an all-invisible tag is now rejected'
                   else '  KNOWN (low): U+3164 passes [[:alnum:]], so an all-invisible tag is storable'
                 end;"

head_ "6. normalisation is a fixed point (the trigger re-runs on EVERY note edit)"
if [ "$FUZZ" -gt 0 ]; then
  bad_n="$(psql "$DB" -Atc "
    with alpha(c) as (values ('a'),('B'),(U&'\\0301'),(U&'\\0130'),(U&'\\1E9E'),(U&'\\FB01'),(U&'\\3392'),
                             (U&'\\00A0'),(U&'\\200E'),(U&'\\202E'),(U&'\\FEFF'),(U&'\\3164'),(U&'\\00AD'),
                             (U&'\\212A'),(U&'\\2126'),(U&'\\01C4'),(U&'\\017F'),(U&'\\FDFA'),(U&'\\3000'),
                             (U&'\\05D0'),(U&'\\30A2'),(U&'\\FF21'),(' '),('-'),('.'),(U&'\\2028')),
     s as (select (select string_agg(c,'' order by o) from (
                    select (array(select c from alpha))[1+floor(random()*26)::int] c, o
                      from generate_series(1, 1+floor(random()*8)::int) o) q) t
             from generate_series(1,$FUZZ)),
     n as (select public.normalize_tag(t) n1 from s)
    select count(*) filter (where public.normalize_tag(n1) is distinct from n1) from n where n1 is not null")"
  [ "$bad_n" = "0" ] && ok "normalize_tag is a fixed point over $FUZZ pathological strings" \
                     || bad "$bad_n non-fixed-point(s) — a stored value would brick that row's note editing"
else
  echo "  skipped (PROBE_FUZZ=0)"
fi

head_ "7. the app/DB bound seam (KNOWN, low): app bounds the RAW string, the DB bounds the NFKC form"
psql "$DB" -Atc "
select '  tag   raw 21 (app limit 28) -> normalised ' ||
        length(public.normalize_tag(repeat('a',20)||U&'\\FDFA')) || ' (DB limit 32)'
union all select
       '  dish  raw 59 (app limit 60) -> normalised ' ||
        length(public.normalize_tag(repeat('a',55)||repeat(U&'\\00BD',4))) || ' (DB limit 64)'
union all select
       '  whyGo raw 186 (app limit 200) -> normalised ' ||
        length(public.normalize_sentence(repeat('a',180)||repeat(U&'\\FDFA',6))) || ' (DB limit 280)';"
echo "  Each line is app-legal input that the DB CHECK REFUSES. The enrichment write must treat"
echo "  check_violation as non-fatal, or bound app-side on the NFKC form. See RICH-EXT-SEC."

# ── summary ──────────────────────────────────────────────────────────────────────────────────
head_ "summary"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "  A FAIL on any A1-A9/B1-B2 is a data-exposure finding: the browser wrote a system-derived"
  echo "  column. Escalate to security-privacy before the branch lands."
  exit 1
fi
echo "  The browser cannot write tags / why_go / dishes through any PostgREST shape tried here."
