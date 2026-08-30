# The documents — what to read, and what to trust

> Written 2026-08-30, because `docs/` had grown to 60 files and roughly 23,000 lines and nothing
> said which of them was still true. This file is the map. It is short on purpose.

## If you are starting cold, read these four, in this order

| # | File | What it tells you |
|---|---|---|
| 1 | [`current-state.md`](current-state.md) | What is built, what is measured, what is open. ~100 lines, all of it current. The session narrative it used to carry is in [`history-2026-08.md`](history-2026-08.md). |
| 2 | [`mvp-plan.md`](mvp-plan.md) | The strategy: the MVP boundary, the four levels L0–L3, what is deliberately absent and where it went. |
| 3 | [`execution-plan.md`](execution-plan.md) | The ladder and the running status: Level → Feature → Task, with an exit criterion per task. |
| 4 | [`working-agreement.md`](working-agreement.md) | How this project is built, and which decisions are the owner's. |

`../CLAUDE.md` sits above all four and wins where they disagree.

## The rule this directory runs on

**A document is either CURRENT or it is DATED, and it has to say which in its own first lines.**

- **CURRENT** — kept true. If the code changes, the document changes in the same branch. Being wrong
  here is a defect, not untidiness: a stale sentence in a current document sends the next session
  down a road that no longer exists.
- **DATED** — a record of what was decided or measured on a day. It is not maintained and does not
  need to be. It carries a header saying so, and it is still valuable: the measurements and the
  owner rulings inside it are why we do not re-litigate settled questions.

A dated document is never silently corrected. If its conclusion was overturned, the header says what
overturned it and where the current answer lives.

## What each group is for

**Decision records — CURRENT, and they are the ones that stop old arguments being reopened.**
`00-project-charter.md` (product definition and the scope contract) ·
`implementation-plan.md` (the decision ledger) · `06-map-and-places-decision.md` ·
`07-import-execution-model.md` · `08-place-identity.md` · `09-extraction-and-resolution.md` ·
`10-poi-index.md` · `11-resolver-vocabulary.md` · `technical-design.md`

**Process — CURRENT and binding.** `working-agreement.md` · `git-workflow.md` ·
`agent-guardrails.md` · `01-agent-roster.md`

**Product and UX specs — CURRENT where the surface still exists.** Led by
`brand-and-product-foundation.md` and `ux-architecture.md`. See the status header on each.

**Feasibility and evidence — DATED, and load-bearing anyway.** `04-tiktok-feasibility.md` ·
`05-secondary-platforms.md` · `03-university-requirements.md` · everything under `evidence/`.
These carry the VERIFIED / ASSUMED / UNAVAILABLE labels the house rules require. Design may only
depend on VERIFIED.

**Runbooks — CURRENT, because they are operational.** `db-migration-runbook.md` ·
`vercel-env-restore.md`

**Session history — DATED, all of it, always.** [`history-2026-08.md`](history-2026-08.md) and the
`handoff-*.md` / `ms*.md` files. One per working session. They are the archaeology: what was tried, what was measured, what the owner ruled. Read one
when you want to know *why*, never to find out *what is true now*. `current-state.md` is the only
document that answers that.

## Two things that were wrong here on 2026-08-30, as a warning

Both were found by reading the repo instead of the documents.

1. Several documents said **production was down and blocked on the owner**. It is live, healthy, and
   serving current `main` — `https://p-002-zeta.vercel.app/healthz` answers
   `{"ok":true,"stage":"production","commit":"99324dd"}`.
2. `current-state.md` opened with a warning that two commits were **unpushed** and a file was
   uncommitted. They had landed, and the tree was clean.

The failure in both cases was the same: a document written at the end of a session described the
world at that moment, and nothing marked it as a moment. Hence the CURRENT/DATED rule above.
