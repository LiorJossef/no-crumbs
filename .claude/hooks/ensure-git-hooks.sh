#!/usr/bin/env bash
# SessionStart hook: re-arm the local stand-in for branch protection.
#
# `.githooks/pre-push` is the only thing refusing a direct push to `main` — GitHub rulesets are
# Pro/Team-only for this private repo (docs/ms3-branch-protection.md), so there is no server-side
# gate behind it. It is wired by `package.json`'s `prepare` script, which means it is armed by
# `npm install` and by nothing else: a fresh clone that has not installed yet, a wiped
# `node_modules`, or a `git config --unset` leaves `main` unprotected and says nothing about it.
#
# Measured 2026-08-30: `core.hooksPath` was unset on this checkout and `.git/hooks/` did not exist.
# The guard had been dead for an unknown period. This hook closes that window by re-checking at the
# start of every session rather than at install time.
#
# Silent on success by design — a hook that prints on every session start gets ignored.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[ -x .githooks/pre-push ] || exit 0

current=$(git config core.hooksPath 2>/dev/null || true)
if [ "$current" != ".githooks" ]; then
  git config core.hooksPath .githooks
  echo "ensure-git-hooks: core.hooksPath was '${current:-unset}' — re-armed to .githooks (main is protected again)." >&2
fi

exit 0
