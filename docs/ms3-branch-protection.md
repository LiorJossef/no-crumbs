# main is protected locally, not on GitHub

**Date:** 2026-08-18 · **Milestone:** MS3

## What was attempted

A GitHub branch ruleset on `main`: block deletion, block force-push, require a pull request, and
require the four CI jobs (`lint · typecheck · layer guard · unit`, `next build`, `playwright`,
`migrations · RLS policy tests`) to pass with the branch up to date. No bypass actors.

## Why it is not in place

```
POST /repos/LiorJossef/P-002/rulesets
403 {"message": "Upgrade to GitHub Pro or make this repository public to enable this feature."}
```

`LiorJossef/P-002` is private on a free plan. Both classic branch protection and rulesets are
Pro/Team features for private repositories. The choice made was to keep the repo private and enforce
the same rule locally rather than pay or publish.

## What is in place instead

`.githooks/pre-push`, wired up by `core.hooksPath` (set automatically by the `prepare` script, so
`npm install` on a fresh clone activates it). Pushing anything to `refs/heads/main` is refused, with
the PR flow printed in the error. It distinguishes three cases: direct push, non-fast-forward push,
and branch deletion.

Verified 2026-08-18 with `git push --dry-run`:

| attempt | result |
|---|---|
| `git push origin HEAD:main` | refused, exit 1 |
| `ALLOW_MAIN_PUSH=1 git push origin HEAD:main` | allowed (documented override) |
| `git push origin HEAD:refs/heads/ms3-branch-protection` | allowed |

## Honest limits

A client-side hook is **advisory**, not a server-side guarantee:

- it is bypassable — by `--no-verify`, by `ALLOW_MAIN_PUSH=1`, or by pushing from a clone where
  `npm install` never ran;
- it is invisible to a grader inspecting the repo's GitHub settings;
- CI still cannot be made a *merge gate* — the workflow runs on every PR and push to `main`, but
  nothing on GitHub's side blocks a red merge.

The working rule for the rest of the build is therefore a convention backed by a speed bump: all
MS4+ work lands on a branch, through a PR, with CI green. If the repo is ever made public, or the
account upgraded, apply the ruleset described above and delete the hook.

## Update 2026-08-26 — the convention now needs teeth

**Re-confirmed today, unchanged:** `GET /repos/LiorJossef/P-002/rulesets` still returns
`403 Upgrade to GitHub Pro`. The repo is still private on a free plan. Nothing above has improved.

What changed is on the other side. The owner removed the approval requirement for routine merges
(`git-workflow.md` §9): verified work with green checks now lands without a human in the loop. Until
today, "CI cannot be made a merge gate" was survivable precisely *because* a person read the check
status before every merge. That person is gone, and the honest limits above were suddenly load-
bearing rather than theoretical.

The same day, a branch was found sitting with a **red required check** for several commits while
every local check was green, and had been reported as finished on that basis. Under the old rule
that PR would have stopped at a human. Under the new one, nothing would have stopped it.

**What replaces the approval: `scripts/merge-pr.sh`** (`npm run merge:pr -- <n>`). It is a
client-side re-implementation of the ruleset this file could not create — same intent, same six
conditions, enforced before `gh pr merge` is ever called:

| The ruleset we cannot have | What the script does instead |
|---|---|
| Require a pull request | Refuses anything that is not an `OPEN`, non-draft PR targeting `main` |
| Require the four CI jobs to pass | Reads `gh pr checks`; refuses on any state that is not `SUCCESS`/`NEUTRAL`/`SKIPPED`, **pending included** |
| — | Refuses an empty check list; "no checks reported" is not a pass |
| Require branches to be up to date | `git merge-base --is-ancestor origin/main origin/<head>` — a green run against a stale base proves nothing |
| No bypass actors | Never passes `--admin`, never enables `--auto` |
| Block force-push / deletion of `main` | Unchanged: `.githooks/pre-push`, and both remain instruction-only per `git-workflow.md` §9.3 |

**The same honest limits still apply, and are worth restating plainly.** This is a script, not a
server-side guarantee: it is bypassable by anyone who types `gh pr merge` directly, it is invisible
to a grader inspecting GitHub settings, and it protects only the path that goes through it. It is a
better speed bump, not a gate. The real fix remains the one named above — make the repo public or
upgrade the account, apply the ruleset, and then delete both the hook and the script's reason for
existing.
