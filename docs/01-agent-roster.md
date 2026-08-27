# Expert Agent Roster

Eleven specialists, each defined as a real invocable subagent in
[`.claude/agents/`](../.claude/agents/), callable by `subagent_type`.

**Restructured 2026-08-27 into three tiers.** Until then every definition was written in an
advisory voice — 45 advisory verbs against 9 implementation verbs across the eleven files, and the
word "implement" appearing only as a noun or as a pointer to another agent. That made the roster a
review panel. It is now a delivery team with an orchestrator.

| Tier | What it produces | `Bash` |
|---|---|---|
| **Build** | Production code, plus the unit tests for it | yes |
| **Probe** | Experiments, evidence, findings; throwaway scripts only | yes |
| **Advise** | Rulings, specs, review; `docs/**` only | no |

| # | Agent | `subagent_type` | Tier | Owns (single-sentence mandate) |
|---|-------|-----------------|------|-------------------------------|
| 1 | Product Lead | `product-lead` | Advise | Scope, the V1 contract, acceptance criteria, and tie-breaking on priority |
| 2 | UX / Interaction Designer | `ux-interaction` | Advise | Information architecture, mobile interaction, motion concept, accessibility |
| 3 | Design System / Frontend | `design-system-frontend` | Build | Tokens, components, motion, responsive — **the single build owner of production UI** |
| 4 | Next.js / TypeScript Architect | `nextjs-architect` | Build | App structure, server/client boundaries, data flow, types, error handling |
| 5 | Supabase / Database Engineer | `supabase-database` | Build | Schema, migrations, indexes, RLS, query design, data integrity |
| 6 | Maps / Geospatial Engineer | `maps-geospatial` | Build | Map mechanics, clustering, camera, geolocation; the resolver *decision* |
| 7 | AI / Extraction Engineer | `ai-extraction` | Build | Extraction schema, prompts, provider abstraction, confidence, evals |
| 8 | Social Platform Integration | `social-integration` | Probe | What each platform *actually* permits, verified by experiment |
| 9 | Security / Privacy Engineer | `security-privacy` | Probe | Auth boundaries, RLS review, secrets, abuse, untrusted input, location privacy |
| 10 | QA / Reliability Engineer | `qa-reliability` | Probe | Independent verification, regression hunting, harnesses and test infrastructure |
| 11 | DevOps / Vercel Engineer | `devops-vercel` | Probe | Environments, deploy diagnosis, env vars, observability, production readiness |

Every agent loads [`current-state.md`](current-state.md),
[`working-agreement.md`](working-agreement.md) §2 and §7, and its own rows in
[`execution-plan.md`](execution-plan.md). Build and Probe agents are additionally bound by
[`agent-guardrails.md`](agent-guardrails.md). `00-project-charter.md` and
`02-risks-and-unknowns.md` are consult-as-needed rather than always-loaded — they are founding
documents, and `current-state.md` carries more decision-relevant signal per token today.

## The orchestrator

The main session is the **lead developer**, not a router. It owns the overall context, decomposes
work into tasks, delegates meaningful implementation and investigation to the specialists,
integrates what comes back, verifies it, and commits.

It **owns verification without personally executing every step.** It decides what evidence a task
requires, ensures that evidence is independent, inspects it, and makes the done / not-done call.
Producing the evidence is delegable — `qa-reliability` driving a harness is exactly that. The one
hard constraint is independence: **the agent that built a thing is never the sole source of evidence
that it works.** A self-report is input, not proof.

It also holds every action a specialist must not take: commits, PRs, merges, deploys, hosted
migration pushes, and destructive database operations. See
[`agent-guardrails.md`](agent-guardrails.md).

**No subagent delegates.** Every handoff routes back through the orchestrator, which serialises
agents whose file scopes overlap.

## Ownership in detail

**1. Product Lead** — Guards Charter §4 against expansion. Converts capabilities into acceptance
criteria a QA agent can verify. Decides what gets cut when the schedule slips. Owns the delayed-value
problem (R4) and the onboarding path to the first five saved places. Says no more than yes.

**2. UX / Interaction Designer** — Owns the three hardest screens: the paste/analysis moment, the
candidate review/disambiguation list, and the map + bottom-sheet composition. Specifies motion as
intent and timing, not CSS. Owns thumb reach, safe areas, keyboard behaviour on URL input, the
location-permission ask, loading and empty states, and reduced-motion equivalents. Also owns the
honest failure states — "we found nothing in this post" must feel designed, not broken.

**3. Design System / Frontend Specialist** — Locks typography, spacing, radius, elevation, surfaces,
iconography and motion tokens *before* components are written. Builds primitives on Radix behaviour
without inheriting shadcn's look. Implements motion with Motion for React and owns whether it holds
60fps on a mid-range phone. Owns bundle size and the map's mount cost.

**4. Next.js / TypeScript Architect** — Owns the layering (`ui → app → domain → integrations`) and
enforces that domain code never imports a vendor SDK. Decides the import execution model (D3):
server action vs route handler vs job row + polling, plus retries and idempotency. Owns the shared
type vocabulary for Source / Extraction / PlaceCandidate / ResolvedPlace / SavedRecommendation, the
error taxonomy, and the boundary between server and client components. Breaks ties on structure.

**5. Supabase / Database Engineer** — Owns the schema and the dedup identity that keeps one physical
place as one row across many sources (D5). Owns migrations as checked-in SQL, indexes including the
geographic one, RLS policies on every user-owned table (written as the real authorisation boundary),
and the decision between PostGIS and bounding-box filtering (D6). Owns constraints that make bad
states unrepresentable — a saved place with no source, or two identical saves for one user.

**6. Maps / Geospatial Engineer** — Runs the provider benchmark (A2) on real target cities and brings
accuracy, cost and licensing findings together. Owns the resolution scoring function that turns a
candidate string plus city hint into a ranked POI list, the ambiguity signal that triggers user
confirmation, clustering strategy, viewport/camera behaviour, geolocation accuracy handling, and map
performance on mobile web.

**7. AI / Extraction Engineer** — Owns the extraction contract: a strict schema (name, city/area hint,
category hint, evidence quote, confidence) enforced through structured output, never prose parsing.
Owns the provider abstraction — one narrow interface, one adapter, no vendor types crossing the seam.
Builds the 50-post golden set *before* tuning prompts and owns the eval score. Owns the position that
model-reported confidence is untrusted until measured, and that captions are data, never instructions.

**8. Social Platform Integration Engineer** — The most consequential agent in week one. Empirically
determines, per platform, what is retrievable server-side through official/permitted mechanisms, and
labels every finding VERIFIED / ASSUMED / UNAVAILABLE with committed response samples. Owns URL
canonicalisation and platform detection (short links, `vm.tiktok.com`, Shorts, Reels, tracking params),
the failure taxonomy (private, deleted, region-locked, rate-limited), and ToS/licensing compliance.
Has explicit authority to declare a platform unsupported for V1.

**9. Security / Privacy Engineer** — Reviews every RLS policy adversarially and attempts cross-user
reads. Owns secret placement (nothing server-side ever reaches the client bundle), the rule that
user-scoped reads never use the service role, validation of all untrusted input at the boundary,
prompt-injection containment, SSRF considerations on user-supplied URLs, rate limiting and abuse
paths, and the privacy posture on location data — including the rule that a user's live position is
never persisted unless they save a place. Holds a veto on data exposure.

**10. QA / Reliability Engineer** — Turns acceptance criteria into a test strategy sized for the
timeline: unit tests on canonicalisation/scoring/dedup, contract tests on the extraction schema,
policy tests on RLS, and a small end-to-end path over the core loop. Owns the edge-case catalogue
(zero candidates, ten candidates, duplicate paste, unresolvable place, provider timeout, revoked
location permission, offline mid-import) and verifies the mobile matrix on real iOS Safari and
Android Chrome, not just a desktop emulator.

**11. DevOps / Vercel Engineer** — Owns local/preview/production environments and the env-var matrix
per environment, migration flow against Supabase, preview deploys that do not touch production data,
build health and CI, error/latency observability on the import pipeline, and cost ceilings and alerts.
Defines what "production ready" means for this project and confirms it before launch.

## Roles considered and deliberately folded in

- **Legal / data-licensing** → folded into Social Integration (platform ToS) and Security (data
  retention and privacy). A separate role would have no other work.
- **Eval / data-quality** → folded into AI Extraction, which owns the golden set directly.
- **Design Director** → folded into UX; splitting visual direction from interaction at this size
  produces disagreement, not quality.

## How the agents work together

Work moves through the orchestrator at every hop — no subagent calls another. The challenge path
below is a *sequence the orchestrator runs*, not a chain the agents walk themselves:

```
orchestrator picks the task from execution-plan.md (task ID + path scope)
   → ux-interaction specs the surface                        [Advise]
   → design-system-frontend builds it, with its unit tests    [Build]
   → orchestrator integrates and decides what evidence is needed
   → qa-reliability verifies it independently                 [Probe]
   → security-privacy reviews any data path or migration diff [Probe, veto]
   → orchestrator rules done / not-done, then commits
   → PR → CI green → npm run merge:pr → verify main and the deployment
```

The branch belongs to the **feature**, not the delegation: one feature branch, many delegated
subtasks committing onto it, exactly as `git-workflow.md` already describes. Delegation adds no new
git ceremony.

Agents whose path scopes overlap are **serialised, not parallelised** — `maps-geospatial` and
`design-system-frontend` both touch `src/components/map/**`, so they never run concurrently. At
L0's one-feature-at-a-time scale this is the whole collision story; worktree isolation is a
solution to a throughput problem this project does not yet have.

Rules: claims about third parties need evidence; disagreements end in a recorded decision, not a
compromise that keeps both designs; the Product Lead breaks scope ties, the Architect breaks
structural ties, and Security's veto on data exposure is not overridable by either.
