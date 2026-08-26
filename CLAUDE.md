# P-002 — Personal geographic recommendation map

Under construction against an ordered plan, **re-planned by product level on 2026-08-20**.
[`docs/mvp-plan.md`](docs/mvp-plan.md) is the plan of record: four levels — **L0** walking skeleton,
**L1** the course MVP and the submission target, **L2** product-grade, **L3** post-course — every one
of them submittable, climbed one at a time. `docs/implementation-plan.md` keeps the decision ledger,
the M3 architecture answer, the migration order and the build orders; its milestone ladder and its
half-day budget are retired.

Done: repo, toolchain and deploy (was MS2), the technical design (MS3), the database (MS4; 17
migrations locally, nine on both hosted projects), and the POI index chain `0010`/`0014` plus the
resolver vocabulary, the ported scorer, the 44-case golden file and the Tel Aviv ingest with
measured Overture confidences (was MS5 tasks 1–5).

**Application code exists and the core loop runs end to end**: auth, the map (MapLibre + CARTO),
the saved-places list and sheet, and a real TikTok import — oEmbed → caption → LLM extraction →
review and confirm → `places`/`saved_places`. Verified against real TikToks, not only tests. What
it is *not* yet: there is no `PlaceResolver`, so every coordinate is the model's own guess and is
measurably 65–470 m out; the streaming route (`L0-F6`) does not exist and `/api/imports/probe` is
still the request/response stand-in.

**L0 is in progress.** Its six steps and their exit criteria are in `mvp-plan.md` §5: the import
domain, the local resolve seam (was MS5 task 7 — a candidate string resolving against the ingested rows,
including the `score` column on the 57 of 71 replayable benchmark rows), **the global resolver
(step 2b, D2b)**, the adapters, the migrations
applied to staging and production (was MS5 task 8), and the streaming route proven from a preview
deployment. MS5 task 6 (Tokyo, London) has moved to L2, where it is now an
accuracy accelerator rather than the product's coverage boundary.

The MVP boundary, and it is three decisions rather than a feature list: one link in one field;
**TikTok only** — the sole VERIFIED access mechanism, so an Instagram or YouTube link is a recognised
redirect to manual add, never a failure; and "info" fixed at name · category · coordinates · source
link · user note, which is exactly what open data lets us store forever. At LEVEL B's ~27% hit rate,
**"no places found" is the modal import outcome**, so its screen is a core surface, not an error path.

**How this project is built — [`docs/working-agreement.md`](docs/working-agreement.md), binding
from 2026-08-26.** The owner is the product owner, not your QA engineer, UX reviewer or task
dispatcher. The default loop is *inspect → identify → prioritise → implement → test → use →
critique → improve → continue*, not *await instruction → implement narrowly → report done → wait*.
Find a bug, fix it. Weak UX, improve it. Half-finished, finish it. **Implemented is not done**: run
the app, use the feature, inspect the persisted rows, check desktop and mobile, then say what you
verified and how. Never convert uncertainty into certainty — preserve source, provenance, evidence
and the extracted-vs-inferred distinction; an uncertain result beats a confidently wrong place. Ask
only for decisions that are genuinely the owner's (§7), and don't stop unrelated work while waiting.

**[`docs/current-state.md`](docs/current-state.md) is the cold-start document** — what is working,
what is verified and how, what is unresolved, and the next highest-impact step. Read it first.

**Read before doing anything in this repo:**
1. `docs/mvp-plan.md` — **the plan of record**: the MVP boundary, the four levels, the exit criteria
1b. `docs/execution-plan.md` — **the ladder and the running status**: Level → Feature → Task
1c. `docs/brand-and-product-foundation.md` — positioning, user, tone, visual direction, the eight
   surfaces, the main flow. The product **name is still open** (owed at L1-F1-T1)
2. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
3. `docs/implementation-plan.md` — the decision ledger, the M3 architecture answer, the change log
4. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks
5. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack: Next.js + TypeScript + Supabase + Vercel. **D2 is closed** — MapLibre GL v5 + Protomaps
tiles + our own resolver over Overture `places` extracts (`docs/06-map-and-places-decision.md`,
schema in `docs/10-poi-index.md`). **D2b, 2026-08-20: the MVP resolves globally** — two sources
behind one `PlaceResolver` port, the Overture index where a region is loaded (85% top-1) and
Nominatim everywhere else (63%), routed on the extraction's `cityHint`. Nominatim's ODbL write path
re-opens `06` §11 Q2; that sign-off is owed **before** the adapter merges.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
