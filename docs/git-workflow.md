# Git workflow — how the history tells the build story

**Adopted 2026-08-20.** Binding on all implementation work from this date forward. Nothing already
committed is rewritten to match it.

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
3. Run the relevant tests/checks — `npm run verify` for app code, `npm run db:verify` for migrations,
   or the narrower script when that is what the change touches.
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

## 9. Push, PR and review boundary

Local commits at stable checkpoints are encouraged. Do **not** push, merge, force-push, rebase shared
history, delete branches, or open a PR without explicit authorisation for that action. Never
force-push without approval.

When work does land, it lands the way `docs/ms3-branch-protection.md` already establishes: on a
branch, through a PR, with CI green. `.githooks/pre-push` refuses direct pushes to `main`; that hook
and its `ALLOW_MAIN_PUSH=1` escape hatch stand unchanged. Authorisation is per-action and does not
generalise to the next one.

When a feature is ready for review, report: branch name · feature completed · exit-criteria status ·
checks and tests run · commits created · known limitations and follow-up work. Then stop.

## 10. Process is not the product

This is hygiene, not bureaucracy. The priority stays shipping the smallest correct increment defined
by the current MVP plan. Session discipline is unchanged: one ledger task per session, handoff doc
kept cold-start-ready, implementation routed through the specialist agents in `.claude/agents/`.

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
