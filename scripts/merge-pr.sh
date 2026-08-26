#!/usr/bin/env bash
# Merge a pull request into `main`, refusing unless every precondition actually holds.
#
# WHY THIS EXISTS. On 2026-08-26 the owner removed the approval requirement for routine merges:
# verified work with green required checks lands without asking. That removes the human who used to
# read the CI status before anything reached `main`. Nothing on GitHub's side replaces them —
# `docs/ms3-branch-protection.md` records that branch protection and rulesets are Pro/Team-only for
# a private repo (403, re-confirmed 2026-08-26), so **CI is not a merge gate**: a red PR can be
# merged with one command and GitHub will not object.
#
# So the gate is here. Every check below is one a branch ruleset would have enforced server-side.
# The point is not ceremony; it is that "I looked and it seemed green" is exactly the failure that
# happened the same day this script was written — a branch was reported finished on the strength of
# a green `npm run verify` while a required CI job had been red for several commits.
#
# WHAT IT REFUSES, and each one is a real way to land something broken:
#   1. a PR that is not OPEN, or is a draft;
#   2. a PR not targeting `main` — a stacked PR must have its parent landed first, which also
#      re-targets it, rather than being force-landed out of order;
#   3. any check not passing: a failure, or a run still pending (a pending check is not a green one,
#      and this is the distinction that gets eyeballed away at the end of a long session);
#   4. zero checks reported — "no news" reads as green in a terminal and is not;
#   5. a PR GitHub does not consider cleanly mergeable (conflicts, unknown state);
#   6. a head branch whose CI ran against a stale base. GitHub's "require branches to be up to date"
#      is part of the ruleset we cannot have, so it is computed here: if `main` has moved since this
#      branch last merged it, the green run proves nothing about the combination.
#
# It never passes `--admin` and never enables auto-merge, because both mean "land it without the
# checks", which is the one thing this file is for. It does not delete the branch: branch deletion
# still needs a specific instruction (`docs/git-workflow.md` §9).
#
# `--merge` is deliberate over `--squash`: §3 and §8 of the git workflow treat the atomic commits as
# the build's narrative, so they arrive on `main` intact rather than flattened into one.
#
# Usage:  npm run merge:pr -- <pr-number>       (add --dry-run to check without merging)
set -euo pipefail
cd "$(dirname "$0")/.."

PR="${1:-}"
DRY_RUN=0
for arg in "$@"; do [ "$arg" = "--dry-run" ] && DRY_RUN=1; done
[ "${PR}" = "--dry-run" ] && PR="${2:-}"

if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
  echo "usage: npm run merge:pr -- <pr-number> [--dry-run]" >&2
  exit 2
fi

command -v gh >/dev/null 2>&1 || { echo "merge:pr  FAIL — the gh CLI is not installed." >&2; exit 1; }

fail() { echo "" >&2; echo "merge:pr  REFUSED — $1" >&2; shift; for l in "$@"; do echo "                    $l" >&2; done; exit 1; }

echo "── preconditions for PR #$PR ─────────────────────────────────────────"

meta=$(gh pr view "$PR" --json state,isDraft,baseRefName,headRefName,mergeable,title)
state=$(echo "$meta"      | python3 -c 'import sys,json;print(json.load(sys.stdin)["state"])')
draft=$(echo "$meta"      | python3 -c 'import sys,json;print(json.load(sys.stdin)["isDraft"])')
base=$(echo "$meta"       | python3 -c 'import sys,json;print(json.load(sys.stdin)["baseRefName"])')
head=$(echo "$meta"       | python3 -c 'import sys,json;print(json.load(sys.stdin)["headRefName"])')
mergeable=$(echo "$meta"  | python3 -c 'import sys,json;print(json.load(sys.stdin)["mergeable"])')
title=$(echo "$meta"      | python3 -c 'import sys,json;print(json.load(sys.stdin)["title"])')

echo "   title      $title"
echo "   branch     $head → $base"

[ "$state" = "OPEN" ]  || fail "PR #$PR is $state, not OPEN."
[ "$draft" = "False" ] || fail "PR #$PR is a draft."

# 2. base must be main. A stacked PR lands its parent first; GitHub then re-targets this one.
[ "$base" = "main" ] || fail \
  "PR #$PR targets '$base', not 'main'." \
  "This is a stacked PR. Land '$base' first — GitHub re-targets this one automatically," \
  "and its checks then re-run against the base it will actually merge into."

# 3 + 4. every check green, none pending, and at least one reported.
# `gh pr checks` exits non-zero when anything is pending or failing *and still prints valid JSON*,
# so its exit code is deliberately ignored here — treating it as "no data" would turn a red PR into
# the "no checks at all" message and diagnose the wrong problem. The JSON is what is trusted, and it
# is validated below rather than assumed.
checks=$(gh pr checks "$PR" --json name,state 2>/dev/null || true)

# The JSON is passed through argv, not interpolated into the program text: a check name is arbitrary
# text from a workflow file, and building a script around it is how a quoting bug (or worse) gets in.
if ! stats=$(python3 - "${checks:-}" <<'PY'
import sys, json
try:
    rows = json.loads(sys.argv[1]) if sys.argv[1].strip() else []
except json.JSONDecodeError:
    sys.exit(3)
if not isinstance(rows, list):
    sys.exit(3)
# NEUTRAL and SKIPPED are genuine non-failures GitHub reports for conditional jobs; everything else
# that is not SUCCESS — including PENDING, QUEUED, IN_PROGRESS — is not a pass.
ok = {"SUCCESS", "NEUTRAL", "SKIPPED"}
bad = [r for r in rows if r.get("state") not in ok]
detail = "; ".join(r.get("name", "?") + "=" + str(r.get("state")) for r in bad) or "-"
print(len(rows), len(rows) - len(bad), len(bad), detail)
PY
); then
  fail "could not read the check list for PR #$PR." \
       "gh returned something that is not a JSON array. Do not merge on an unreadable status."
fi
read -r total passing notpassing summary <<< "$stats"

[ "$total" -gt 0 ] || fail \
  "PR #$PR reports no checks at all." \
  "An empty check list is not a pass — CI may not have started, or the workflow may not" \
  "trigger for this branch. Find out which before landing anything."

if [ "$notpassing" -gt 0 ]; then
  fail "PR #$PR has $notpassing check(s) not passing: $summary" \
       "Pending counts as not passing. Wait for the run, or fix the failure."
fi
echo "   checks     $passing/$total passing, none pending"

# 5. GitHub's own view of mergeability.
[ "$mergeable" = "MERGEABLE" ] || fail \
  "GitHub reports mergeable=$mergeable for PR #$PR." \
  "CONFLICTING means merge 'main' into the branch and let CI re-run." \
  "UNKNOWN means GitHub has not finished computing it — re-run this in a moment."

# 6. the branch must contain current main, or its green run was against a stale base.
git fetch --quiet origin main "$head"
if ! git merge-base --is-ancestor origin/main "origin/$head"; then
  behind=$(git rev-list --count "origin/$head..origin/main")
  fail "'$head' is $behind commit(s) behind 'main'." \
       "Its checks passed against a base that no longer exists, which proves nothing about the" \
       "combination that would land. Merge main into it (a real merge, never a squash —" \
       "git-workflow.md §1) and let CI run again."
fi
echo "   freshness  contains current origin/main"

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "merge:pr  DRY RUN — every precondition holds; PR #$PR would be merged."
  exit 0
fi

echo ""
echo "── merging ───────────────────────────────────────────────────────────"
# No --admin (that is "bypass the checks"), no --auto (that is "merge it later, unwatched"), no
# --delete-branch (branch deletion needs its own instruction).
gh pr merge "$PR" --merge
echo ""
echo "merge:pr  MERGED — PR #$PR into main. Now verify main itself (git-workflow.md §11):"
echo "          git checkout main && git pull && npm run verify"
echo "          gh run list --branch main --limit 1"
