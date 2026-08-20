# P-002 — Personal geographic recommendation map

Under construction against an ordered plan, **re-planned by product level on 2026-08-20**.
[`docs/mvp-plan.md`](docs/mvp-plan.md) is the plan of record: four levels — **L0** walking skeleton,
**L1** the course MVP and the submission target, **L2** product-grade, **L3** post-course — every one
of them submittable, climbed one at a time. `docs/implementation-plan.md` keeps the decision ledger,
the M3 architecture answer, the migration order and the build orders; its milestone ladder and its
half-day budget are retired.

Done: repo, toolchain and deploy (was MS2), the technical design (MS3), the database (MS4, nine
migrations on both hosted projects), and the POI index chain `0010`/`0014` plus the resolver
vocabulary, the ported scorer, the 44-case golden file and the Tel Aviv ingest with measured Overture
confidences (was MS5 tasks 1–5). **No application code exists yet** — no auth, no UI, no map, no
pipeline.

**L0 is in progress.** Its five steps and their exit criteria are in `mvp-plan.md` §5: the import
domain, the resolve seam (was MS5 task 7 — a candidate string resolving against the ingested rows,
including the `score` column on the 57 of 71 replayable benchmark rows), the adapters, the migrations
applied to staging and production (was MS5 task 8), and the streaming route proven from a preview
deployment. MS5 task 6 (Tokyo, London) has moved to L2.

The MVP boundary, and it is three decisions rather than a feature list: one link in one field;
**TikTok only** — the sole VERIFIED access mechanism, so an Instagram or YouTube link is a recognised
redirect to manual add, never a failure; and "info" fixed at name · category · coordinates · source
link · user note, which is exactly what open data lets us store forever. At LEVEL B's ~27% hit rate,
**"no places found" is the modal import outcome**, so its screen is a core surface, not an error path.

**Read before doing anything in this repo:**
1. `docs/mvp-plan.md` — **the plan of record**: the MVP boundary, the four levels, the exit criteria
2. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
3. `docs/implementation-plan.md` — the decision ledger, the M3 architecture answer, the change log
4. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks
5. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack: Next.js + TypeScript + Supabase + Vercel. **D2 is closed** — MapLibre GL v5 + Protomaps
tiles + our own resolver over Overture `places` extracts (`docs/06-map-and-places-decision.md`,
schema in `docs/10-poi-index.md`).

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
