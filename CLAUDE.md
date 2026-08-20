# P-002 — Personal geographic recommendation map

Under construction against an ordered plan. Repo, toolchain and deploy (MS2), the technical design
(MS3) and the database (MS4, nine migrations applied and verified on both hosted projects) are
done. **MS5 — the POI index and resolver — is in progress:** its task ledger in
`docs/implementation-plan.md` is the running state, and tasks 1–4 (the `0010`/`0014` migration chain,
the resolver vocabulary in `src/domain/`, the ported scorer, the 44-case golden file) are closed.
Task 5, the Tel Aviv ingest against a pinned Overture release, is next — and it carries task 4's
rider to record the per-row Overture `confidence`, without which the `score` column of MS5 exit
criterion 3 cannot be proved.
`docs/implementation-plan.md` is the plan of record and its change log is the current state.

**Read before doing anything in this repo:**
1. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
2. `docs/implementation-plan.md` — the milestone ladder, the decision ledger, and the change log
3. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks
4. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack: Next.js + TypeScript + Supabase + Vercel. **D2 is closed** — MapLibre GL v5 + Protomaps
tiles + our own resolver over Overture `places` extracts, Nominatim as a capped fallback
(`docs/06-map-and-places-decision.md`, schema in `docs/10-poi-index.md`).

Specialist subagents live in `.claude/agents/` and are invocable by `subagent_type`, e.g.
`social-integration`, `maps-geospatial`, `ai-extraction`.

House rules: claims about third-party capabilities are labelled VERIFIED / ASSUMED / UNAVAILABLE,
with evidence in `docs/evidence/`; design may only depend on VERIFIED. Charter §4 is the scope
contract — new ideas go to a Future list, not into the current sprint.

**Git workflow — [`docs/git-workflow.md`](docs/git-workflow.md), binding on all work from
2026-08-20.** The history tells the build story: **Level → Feature → Subtask → atomic commit**. One
kebab-case, prefixed branch per feature (`feat/global-place-resolution`, `fix/resolver-ranking`);
decompose the feature into subtasks from the plan before writing code; commit each coherent subtask
once its tests and checks pass, staged intentionally and reviewed as a diff first; Conventional
Commit subjects (`feat(resolver): add Nominatim provider`) with the *why* in the body. Uncommitted
changes in the tree are user-owned — never reset, cleaned, or swept into a commit. **A finished
feature whose checks pass is pushed and PR'd automatically; merging into `main` always needs explicit
approval** — as do force-push, history rewrites and branch deletion. Landing goes branch → PR → green
CI → approval → merge, per `docs/ms3-branch-protection.md`.
