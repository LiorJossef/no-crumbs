#!/usr/bin/env bash
# MS2 exit criterion: prove the layer guard actually fails a violation.
# Writes deliberate domain/ violations, asserts ESLint rejects each one, removes them,
# then greps the real domain/ tree for I/O independently of ESLint.
# If this script ever passes silently, the guard has been disabled and the four-layer
# architecture (docs/07 §10) is no longer a checked property of the repo.
set -uo pipefail
cd "$(dirname "$0")/.."

FIXTURE="src/domain/__layer_guard_violation__.ts"
UI_FIXTURE_DIR="src/ui/__layer_guard__/deep"
UI_FIXTURE="$UI_FIXTURE_DIR/violation.tsx"
INT_FIXTURE_DIR="src/integrations/__layer_guard__/deep"
INT_FIXTURE="$INT_FIXTURE_DIR/violation.tsx"
LIB_FIXTURE_DIR="src/app/_lib"
LIB_FIXTURE="$LIB_FIXTURE_DIR/__layer_guard_violation__.ts"
cleanup() {
  rm -f "$FIXTURE" "$LIB_FIXTURE"
  rm -rf src/ui/__layer_guard__ src/integrations/__layer_guard__
  # Only remove _lib if the fixture created it; a real _lib has other files.
  [ -d "$LIB_FIXTURE_DIR" ] && rmdir "$LIB_FIXTURE_DIR" 2>/dev/null
  return 0
}
trap cleanup EXIT

# --- Half 1: ESLint must reject each violation class. ---------------------------------
# Each case is a fixture body and the sentence printed when ESLint lets it through.
expect_eslint_rejects() {
  local what="$1"
  if npx eslint "$FIXTURE" >/dev/null 2>&1; then
    echo "FAIL: ESLint accepted $what. The layer guard is not enforcing." >&2
    exit 1
  fi
  echo "OK: ESLint rejects $what."
}

# Same assertion, for a fixture outside domain/.
expect_file_rejected() {
  local file="$1" what="$2"
  if npx eslint "$file" >/dev/null 2>&1; then
    echo "FAIL: ESLint accepted $what. The layer guard is not enforcing." >&2
    exit 1
  fi
  echo "OK: ESLint rejects $what."
}

expect_file_accepted() {
  local file="$1" what="$2"
  if ! npx eslint "$file" >/dev/null 2>&1; then
    echo "FAIL: ESLint rejected $what, which is legal. The zone patterns are too broad." >&2
    npx eslint "$file" >&2
    exit 1
  fi
  echo "OK: ESLint allows $what."
}

cat > "$FIXTURE" <<'TS'
import { NextResponse } from 'next/server';
export const violation = NextResponse;
TS
expect_eslint_rejects "a domain/ -> next/* import"

cat > "$FIXTURE" <<'TS'
export async function violation(u: string) { return await fetch(u); }
TS
expect_eslint_rejects "a call to the fetch global in domain/"

cat > "$FIXTURE" <<'TS'
export function violation() { return new XMLHttpRequest(); }
TS
expect_eslint_rejects "XMLHttpRequest in domain/"

cat > "$FIXTURE" <<'TS'
import { readFileSync } from 'node:fs';
export const violation = readFileSync;
TS
expect_eslint_rejects "a domain/ -> node:* import"

cat > "$FIXTURE" <<'TS'
import https from 'https';
import axios from 'axios';
export const violation = [https, axios];
TS
expect_eslint_rejects "a domain/ -> http(s)/axios import"

# --- Half 2: a grep that does not depend on ESLint being configured at all. -----------
# Deliberately narrow and redundant, not exhaustive: ESLint is the complete rule, this is
# the second lock so that disabling one config file cannot open the door. It is written to
# leave the legal `SourceAdapter.fetch` port method alone (`ports.source.fetch(...)` is a
# port call, `await fetch(...)` is I/O) and to fail in the safe direction otherwise.
IO_PATTERNS=(
  '(await|return|=|\(|,|;)[[:space:]]*fetch[[:space:]]*\(|call to the fetch global'
  '(globalThis|window|global|self)\.fetch|the fetch global via a global object'
  'XMLHttpRequest|new[[:space:]]+(WebSocket|EventSource)|a browser I/O global'
  "['\"](node:[^'\"]*|fs|fs/promises|http|https|net|dns|child_process|undici|axios|node-fetch)['\"]|an I/O module specifier"
)

scan_for_io() {
  local target="$1" hits=0 entry pattern label
  for entry in "${IO_PATTERNS[@]}"; do
    pattern="${entry%|*}"
    label="${entry##*|}"
    if grep -REn --include='*.ts' --include='*.tsx' "$pattern" "$target" 2>/dev/null; then
      echo "  ^ above: $label in domain/. domain/ performs no I/O (docs/07 §10)." >&2
      hits=$((hits + 1))
    fi
  done
  # 0 (success) means "I/O was found" so callers read as `if scan_for_io ...; then FAIL`.
  [ "$hits" -gt 0 ]
}

# Self-test: the grep must catch what ESLint catches, or it is decoration.
cat > "$FIXTURE" <<'TS'
import { readFileSync } from 'node:fs';
export async function violation(u: string) {
  const viaGlobal = await globalThis.fetch(u);
  const viaBare = await fetch(u);
  return [readFileSync, viaGlobal, viaBare, new XMLHttpRequest()];
}
TS
if ! scan_for_io "$FIXTURE" >/dev/null 2>&1; then
  echo "FAIL: the I/O grep did not flag a fixture full of I/O. The grep half is broken." >&2
  exit 1
fi
echo "OK: the I/O grep flags fetch, globalThis.fetch, XMLHttpRequest and node:* in domain/."
cleanup

# The real tree must be clean.
if scan_for_io src/domain; then
  echo "FAIL: domain/ contains I/O. Move it behind a port in integrations/." >&2
  exit 1
fi
echo "OK: src/domain contains no I/O."

# --- Half 3: the ui/ and integrations/ zones, incl. the deep-relative escape. ----------
# The earlier '../x/*', '../../x/*' enumerations missed a bare '@/integrations' and a
# '../../../integrations/*' from a nested folder. These fixtures sit two levels deep on
# purpose, so a regression to the enumerated form fails here rather than in review.
mkdir -p "$UI_FIXTURE_DIR" "$INT_FIXTURE_DIR"

cat > "$UI_FIXTURE" <<'TS'
import x from '@/integrations';
export const violation = x;
TS
expect_file_rejected "$UI_FIXTURE" "a ui/ -> bare '@/integrations' import"

cat > "$UI_FIXTURE" <<'TS'
import x from '../../../integrations/places/overture.place-resolver';
export const violation = x;
TS
expect_file_rejected "$UI_FIXTURE" "a ui/ -> ../../../integrations/* import from a nested folder"

cat > "$UI_FIXTURE" <<'TS'
import { serviceClient } from '@/app/_lib/supabase-service';
export const violation = serviceClient;
TS
expect_file_rejected "$UI_FIXTURE" "a ui/ -> @/app/_lib/* import (the server-only surface)"

cat > "$UI_FIXTURE" <<'TS'
import { serviceClient } from '../../../app/_lib/supabase-service';
export const violation = serviceClient;
TS
expect_file_rejected "$UI_FIXTURE" "a ui/ -> ../../../app/_lib/* import from a nested folder"

# The zone must not be so broad that it forbids the one legal ui/ -> app/ edge: a client
# component importing a Server Action. If this fails the rule is over-reaching.
cat > "$UI_FIXTURE" <<'TS'
import { confirmImport } from '@/app/actions/confirm-import';
export const legal = confirmImport;
TS
expect_file_accepted "$UI_FIXTURE" "a ui/ -> @/app/actions/* Server Action import"

cat > "$INT_FIXTURE" <<'TS'
import x from '@/ui';
export const violation = x;
TS
expect_file_rejected "$INT_FIXTURE" "an integrations/ -> bare '@/ui' import"

# Also proves integrationsZone covers *.tsx, not only *.ts.
cat > "$INT_FIXTURE" <<'TS'
import x from '../../../app/_lib/ports';
export const violation = x;
TS
expect_file_rejected "$INT_FIXTURE" "an integrations/*.tsx -> ../../../app/* import"

rm -rf src/ui/__layer_guard__ src/integrations/__layer_guard__

# --- Half 4: server-only is the real client-bundle boundary, not lint. ----------------
# `server-only` makes the *build* fail if a module reaches a client bundle. ESLint above is
# the fast signal; this is the mechanism. Two things must hold: the dependency exists, and
# every module in app/_lib declares it.
if ! node -e "process.exit(require('./package.json').dependencies['server-only'] ? 0 : 1)"; then
  echo "FAIL: 'server-only' is not a declared dependency. app/_lib's boundary rests on it (07 §10)." >&2
  exit 1
fi
echo "OK: 'server-only' is a declared dependency."

assert_lib_declares_server_only() {
  local missing=0 f
  [ -d "$LIB_FIXTURE_DIR" ] || return 0
  while IFS= read -r f; do
    if ! grep -q "['\"]server-only['\"]" "$f"; then
      echo "  $f does not import 'server-only'." >&2
      missing=$((missing + 1))
    fi
  done < <(find "$LIB_FIXTURE_DIR" -type f \( -name '*.ts' -o -name '*.tsx' \))
  [ "$missing" -eq 0 ]
}

mkdir -p "$LIB_FIXTURE_DIR"
cat > "$LIB_FIXTURE" <<'TS'
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
TS
if assert_lib_declares_server_only; then
  echo "FAIL: a app/_lib module without 'server-only' was accepted. The check is decoration." >&2
  exit 1
fi
echo "OK: an app/_lib module missing 'server-only' is flagged."
printf "import 'server-only';\n%s\n" "export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;" > "$LIB_FIXTURE"
if ! assert_lib_declares_server_only; then
  echo "FAIL: a correct app/_lib module was flagged. The check is wrong." >&2
  exit 1
fi
echo "OK: an app/_lib module that imports 'server-only' passes."
cleanup

# The real tree must satisfy it too.
if ! assert_lib_declares_server_only; then
  echo "FAIL: some app/_lib module does not import 'server-only'. A secret can reach the browser." >&2
  exit 1
fi
echo "OK: every app/_lib module (if any) imports 'server-only'."
