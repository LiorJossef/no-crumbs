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
