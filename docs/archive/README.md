# Archive — how this was built, not what is true now

The 89 documents here were moved out of `docs/` on 2026-09-07. Every one of them is **DATED** in the
sense `../README.md` defines: a record of what was decided, measured or specified on a day, not a
description of the present.

**Nothing here is maintained.** Read one when you want to know *why* something is the way it is —
what was tried, what was measured, what the owner ruled, and what got reversed. Never read one to
find out what is true now; [`../current-state.md`](../current-state.md) is the only document that
answers that.

Being archived is not a verdict that a document was wrong. Most of these were right on the day and
have simply stopped describing the present: a session handoff whose session ended, a build spec whose
feature shipped, a review round that closed. Code comments and current specs that cite one still
point at it — the paths were rewritten when it moved.

What is in here:

- **Session handoffs** (`handoff-*.md`) — one per working session, plus the overnight run logs.
- **Overnight run material** (`overnight-*.md`) — the run sheet, the ledger, the state log, the
  per-package reports and the specs written for a single run.
- **Review rounds** — `product-review-*`, `ui-review-*`, `rtl-audit-*`, `qa-ui-verification-*`,
  `no-crumbs-conformance`, `ux-*-audit-*`, and the feedback-round work plans.
- **Dated rulings** — `db-ruling-*`, `product-ruling-*`, `security-ruling-*`. The decisions
  themselves live in the schema, the code and `../ux-rulings.md`; these are the reasoning.
- **Shipped build specs** — the one-shot `ux-*` specs whose surface now exists.
- **Finished plans and milestones** — `iteration-*`, `plan-nav2-map-shell`, `ms1-ms4-audit-handoff`,
  `ms2-cloud-setup`, `ms4-database`, `entity-proposal`, `presentation-outline`.
- **`history-2026-08.md`** — the session narrative `current-state.md` used to carry.
