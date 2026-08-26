# Git workflow — how the history tells the build story

**Adopted 2026-08-20. Amended 2026-08-26** (§5, §9, §10, §11 — the owner removed the approval
requirement for routine merges; the gate moved from a person to CI plus `scripts/merge-pr.sh`).
Binding on all implementation work from this date forward. Nothing already committed is rewritten to
match it.

The history is a narrative of how the product was built, structured as:

**Product Level (L0–L3) → Feature → Subtask → Atomic commit**

Optimise for small, coherent, reviewable, revertable units of *working* software — not for a large
number of commits.

## 1. Feature branches

One branch per meaningful feature or workstream, not per tiny task. Lowercase kebab-case with a
conventional prefix:

`feat/global-place-resolution` · `feat/tiktok-import-pipeline` · `feat/auth` · `feat/review-flow` ·
`feat/private-map` · `feat/manual-place-add` · `fix/resolver-ranking` · `docs/mvp-plan`

Never `dev`, `updates`, `new-stuff`, `work`, `test-branch`.

Before creating a branch, inspect the current branch and working tree (§6). Never overwrite,
discard, reset or accidentally carry along pre-existing user changes.

**Pre-existing branches keep their names.** `ms5-design`, `ms3-technical-design`,
`audit/ms1-ms4-fixes` are milestone-era names from before this ruling; they are not renamed. The
prefix scheme applies to branches created from now on.

**Syncing a long-lived branch with `main`, added 2026-08-22 after an incident:** a branch's history
was once found to contain a commit titled "Merge branch 'main' into ..." that was actually a
single-parent commit — the result of a squash (`git merge --squash`, or an equivalent flattening)
committed under a merge-sounding message, which broke git's ability to relate that branch's files
to `main`'s real history and caused false "add/add" conflicts on a later real merge. To bring a
feature branch up to date with `main`, always run a real merge (`git merge origin/main`) or rebase
deliberately (never squash), and verify the result actually has two parents before pushing:
`git log --format='%P' -1` on the resulting commit should print two hashes. If it prints one, the
sync did not do what its message claims — fix it before continuing, don't push it.

**Docs/plan updates ride with the slice they belong to, not a separate branch.** If a vertical
slice or feature needs an `execution-plan.md`/`mvp-plan.md` update (a deviation note, a task closed,
a re-scope) to make sense on its own, that update is a commit on the *same* feature branch, in the
same PR — not a standalone `docs/*` branch split off from the code it explains. A `docs/*` prefix
stays for genuine docs-only work with no accompanying code (e.g. a standalone decision-doc rewrite).

## 2. Decompose before implementing

Before starting a feature, derive its concrete subtasks from `docs/mvp-plan.md` (the plan of record)
and the ledger in `docs/implementation-plan.md`. Example, for L0 step 2b:

> **Feature: global place resolution** — 1. Nominatim provider adapter · 2. response normalisation ·
> 3. cityHint/countryHint integration · 4. cache · 5. rate limiting · 6. resolution scoring ·
> 7. tests · 8. documentation / ruling updates

This decomposition is a working checklist, **not permission to redesign the product**. Charter §4
remains the scope contract. Work the subtasks in order unless a dependency forces otherwise, and
never land a whole Level or milestone as one undifferentiated change.

## 3. Atomic commits

Commit when a coherent subtask reaches a stable checkpoint. A commit should normally:

- represent one logical change (split by change, never by kind — code and its test belong together);
- have the relevant tests passing;
- pass the typecheck / lint / build checks relevant to it;
- contain no unrelated modifications;
- be reviewable on its own;
- be revertable without reverting unrelated work.

Do not commit on elapsed time or file count, and do not manufacture micro-commits for trivial edits
that only make sense together.

## 4. Commit messages

Conventional Commits: `<type>(<scope>): <imperative description>`.

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`, `build`, `ci`.

```
feat(resolver): add Nominatim provider
feat(resolver): cache successful lookups
fix(resolver): scope lookup with country hint
test(resolver): cover ambiguous global matches
docs(architecture): record global resolver strategy
chore(deps): update map dependencies
```

Subjects say what the commit accomplishes. Never `updates`, `changes`, `fix stuff`, `wip`,
`more work`, `final`, `final2`.

Add a body whenever the reason, the tradeoff, a migration implication, or non-obvious behaviour
matters — this project's habit of explaining *why* in the message is kept, it just moves into the
body under a Conventional subject.

**Pre-2026-08-20 history is prose-subject** (`Ingest Tel Aviv from the pinned release, …`) and is
left exactly as it is. Conventional Commits start with the next commit.

## 5. Before every commit

1. `git status`.
2. Read the diff that will actually be committed (`git diff --staged`).
3. Run the relevant tests/checks — `npm run verify` for app code, `npm run db:verify` for migrations
   (a full reset, so it wipes local dev data), or the narrower script when that is what the change
   touches. `verify` now includes `check:schema`, a read-only inventory against whatever local
   database is running; it **skips with a printed notice** when there is none, and a skip is a gap,
   not a pass. See §9's "CI is the gate" for why that distinction is written down.
4. Confirm every staged file belongs to the same logical change.
5. Confirm no secrets, credentials, generated junk, debugging artifacts or unrelated user changes are
   staged.
6. Stage intentionally (`git add <path>`), never blanket-stage the working tree.

Unrelated changes stay untouched and out of the commit. If a change cannot pass an expected check,
do not commit it as complete — explain the blocker.

## 6. Existing working-tree safety

Uncommitted changes in the tree are **user-owned**. Never discard, overwrite, `git reset --hard`,
`git clean`, stash away, or silently include them. If they touch files the task needs, read them and
preserve them; ask only on a genuine conflict that cannot be resolved safely.

## 7. Documentation

Update docs when the implementation changes a documented contract, architectural ruling, schema
behaviour, security assumption, or plan status. Keep the doc edit **inside** the implementation
commit when it is inseparable from it; use a separate `docs(...)` commit when the documentation is a
meaningful architectural or product decision in its own right.

Do not rewrite planning documents to make finished work look consistent. The decision ledger and the
change logs in `implementation-plan.md` and `mvp-plan.md` are append-only history — and any
deferral, cut or re-order still gets written into the plan, unasked.

## 8. Feature completion

A feature is done only when its exit criteria (per `mvp-plan.md`) are met. At completion: run the
broader verification suite, inspect the full branch diff against its base, confirm the implementation
matches the plan/spec, confirm the docs are current, and confirm the branch is a clean sequence of
meaningful commits. Do not squash or rewrite useful history to tidy it up unless asked.

## 9. Push, PR, merge — and the boundaries that remain

**Standing authorisation, granted 2026-08-20, extended 2026-08-26: push, PR *and merge* are
automatic.** Once a feature's exit criteria (§8) are met and the merge preconditions below hold,
push the branch, open its pull request, and land it — without asking. The owner's 2026-08-26 ruling:
*"routine merges to main no longer require my approval; when work is verified and required checks
are green, merge and verify main yourself."*

What was removed was a **person reading the CI status before anything reached `main`**. Nothing on
GitHub's side replaces them, and that is not a detail: `docs/ms3-branch-protection.md` records — and
2026-08-26 re-confirmed with a fresh `403` — that branch protection and rulesets are Pro/Team-only
for a private repo. **CI is not a merge gate.** A red PR can be merged with one command and GitHub
will not object.

So the gate is a script, and using it is not optional.

### 9.1 Merging

```bash
npm run merge:pr -- <pr-number>            # add --dry-run to check without landing
```

`scripts/merge-pr.sh` refuses unless **all six** hold, each one something a branch ruleset would
have enforced server-side:

1. the PR is `OPEN` and not a draft;
2. it targets `main` — a stacked PR lands its parent first (GitHub then re-targets it), rather than
   being force-landed out of order;
3. **every check is passing, and none is pending.** Pending is not green. This is the distinction
   that gets eyeballed away at the end of a long session;
4. at least one check was reported — an empty list reads as green in a terminal and is not;
5. GitHub reports the PR cleanly `MERGEABLE`;
6. the head branch **contains current `main`**. "Require branches to be up to date" is part of the
   ruleset we cannot have, so it is computed locally: if `main` moved after the last CI run, that
   green run says nothing about the combination that would actually land.

It merges with `--merge`, never `--squash`: §3 and §8 treat the atomic commits as the build's
narrative, so they arrive on `main` intact. It never passes `--admin` and never enables auto-merge —
both mean "land it without the checks", which is the one thing the script exists to prevent. It does
not delete the branch.

**Do not merge by hand** (`gh pr merge`, the GitHub UI, a local merge and push). Not because the
script is sacred, but because every precondition above is one that has to be *checked*, and the
failure mode is silent. If the script is wrong, fix the script.

### 9.2 CI is the gate; local `verify` is the filter

**Learned the hard way, 2026-08-26.** A branch sat with a **red required check** for several commits
while `npm run verify` was green, and was reported as finished on that basis. The red job was
`migrations · RLS policy tests`; the failing step was `db:inventory`, which `verify` did not run.
Two real defects were hiding behind it — a grant matrix drifted from migration `0017`, and `anon`
holding `EXECUTE` on `save_place` again (`0009`'s bug, reintroduced by a signature change). Neither
was exotic. Nothing local was looking.

Two consequences, and both are rules:

- **`npm run verify` covers one of CI's four jobs.** It is a fast filter, not a proxy for CI.
  `check:schema` was added to it so today's specific failure class cannot recur silently, but
  `next build`, `playwright` and the from-scratch migration rebuild still only happen in CI.
- **Never report a branch as finished, and never merge, on the strength of a local run.** The
  authority is `gh pr checks <pr>`. "It passed locally" is not a status; it is a hope.

When a check is red, fix the failure. Do not re-run it hoping, do not merge around it, and do not
describe the PR as ready while it is red.

### 9.3 Still off-limits without a specific instruction each time

The merge boundary moved. These did not, and the list grew where the new autonomy made it matter:

- force-push, in any form, to any branch;
- rebasing or otherwise rewriting shared history;
- deleting branches, local or remote;
- pushing directly to `main`, including via `ALLOW_MAIN_PUSH=1`;
- `gh pr merge --admin`, `--auto`, or anything else that lands work without its checks;
- merging a PR whose checks are red, pending, or absent — no matter how confident the reasoning;
- reverting or rewriting anything already on `main`;
- destructive database operations on staging or production (`db:push:*` is a deliberate, announced
  step, not a routine one), and `db:reset` against a local database holding data worth keeping;
- anything the owner has flagged as needing a decision (`working-agreement.md` §7) — merging is now
  routine, but the *product* judgement inside a PR is not automatically routine with it.

`.githooks/pre-push` still refuses direct pushes to `main`; the hook and its documented
`ALLOW_MAIN_PUSH=1` escape hatch stand unchanged, and the escape hatch is not a shortcut past §9.1.

Landing is now: branch → PR → **CI green** → `npm run merge:pr` → **verify `main`** (§11).

### 9.4 Reporting

When a PR is opened, report: branch name · feature completed · exit-criteria status · checks and
tests actually run · commits created · PR link and **CI status read from `gh pr checks`** · known
limitations and follow-up work.

After landing, report what §11 found. A merge is not the end of the task; a verified `main` is.

## 10. Process is not the product

This is hygiene, not bureaucracy. The priority stays shipping the smallest correct increment defined
by the current MVP plan.

**Corrected 2026-08-26.** This section used to say session discipline was "one ledger task per
session … implementation routed through the specialist agents in `.claude/agents/`". Both halves are
superseded by [`working-agreement.md`](working-agreement.md), which is the operating model: the loop
is *inspect → identify → prioritise → implement → test → use → critique → improve → continue*, not
one task and stop; and specialists are used where their expertise genuinely helps, not as a
mandatory routing layer in front of every change. What survives unchanged is the handoff standard —
`docs/current-state.md` stays cold-start-ready (`working-agreement.md` §9).

A good history looks like:

```
feat/global-place-resolution
  feat(resolver): add Nominatim provider
  feat(resolver): normalize Nominatim responses
  feat(resolver): scope queries with location hints
  feat(resolver): add lookup cache
  feat(resolver): enforce rate limit
  test(resolver): cover global resolution cases
  docs(resolver): record scoring behavior
```

The real commits follow the real implementation, not this example mechanically.

## 11. After the merge

A merge is not the end of the task. Nothing on GitHub re-runs the checks against the merged result,
and `main` is what deploys — so the merged combination gets verified once, deliberately:

```bash
git checkout main && git pull
npm run verify                       # the merged tree, not the branch's copy of it
gh run list --branch main --limit 1  # CI on main itself
```

Then look at the deployed product. Vercel builds `main`; a green CI job is not a working page. Open
the deployment, sign in, and exercise the thing that changed — the same standard
`working-agreement.md` §2 sets for a feature branch, applied to what users would actually get.

If `main` is broken, fixing it forward is the first priority, ahead of whatever came next. Reverting
anything already on `main` needs a specific instruction (§9.3) — report the breakage and the
proposed fix rather than rewriting published history.
