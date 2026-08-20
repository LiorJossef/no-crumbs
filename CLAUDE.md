# P-002 — Personal geographic recommendation map

Pre-implementation. No application code exists yet, by design.

**Read before doing anything in this repo:**
1. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
2. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks (nothing is VERIFIED yet)
3. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack direction: Next.js + TypeScript + Supabase + Vercel. Map/places providers undecided (D2).

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
