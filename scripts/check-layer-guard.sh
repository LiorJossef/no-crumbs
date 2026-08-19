#!/usr/bin/env bash
# MS2 exit criterion: prove the layer guard actually fails a violation.
# Writes deliberate domain/ violations, asserts ESLint rejects each one, removes them,
# then greps the real domain/ tree for I/O independently of ESLint.
# If this script ever passes silently, the guard has been disabled and the four-layer
# architecture (docs/07 §10) is no longer a checked property of the repo.
set -uo pipefail
cd "$(dirname "$0")/.."

FIXTURE="src/domain/__layer_guard_violation__.ts"
cleanup() { rm -f "$FIXTURE"; }
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
