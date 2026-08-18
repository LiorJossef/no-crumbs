#!/usr/bin/env bash
# MS2 exit criterion: prove the layer guard actually fails a violation.
# Writes a deliberate domain/ -> next/* import, asserts ESLint rejects it, removes it.
# If this script ever passes silently, the guard has been disabled and the four-layer
# architecture (docs/07 §10) is no longer a checked property of the repo.
set -uo pipefail
cd "$(dirname "$0")/.."

FIXTURE="src/domain/__layer_guard_violation__.ts"
cleanup() { rm -f "$FIXTURE"; }
trap cleanup EXIT

cat > "$FIXTURE" <<'TS'
import { NextResponse } from 'next/server';
export const violation = NextResponse;
TS

if npx eslint "$FIXTURE" >/dev/null 2>&1; then
  echo "FAIL: ESLint accepted a domain/ -> next/* import. The layer guard is not enforcing." >&2
  exit 1
fi

echo "OK: ESLint rejects a domain/ -> next/* import."
