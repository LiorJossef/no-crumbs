# Expert Agent Roster

Eleven specialists, each defined as a real invocable subagent in
[`.claude/agents/`](../.claude/agents/) so the next phase can call them by name. Every agent loads
[`00-project-charter.md`](00-project-charter.md) and
[`02-risks-and-unknowns.md`](02-risks-and-unknowns.md) as shared context.

| # | Agent | `subagent_type` | Owns (single-sentence mandate) |
|---|-------|-----------------|-------------------------------|
| 1 | Product Lead | `product-lead` | Scope, the V1 contract, acceptance criteria, and tie-breaking on priority |
| 2 | UX / Interaction Designer | `ux-interaction` | Information architecture, mobile interaction, motion concept, accessibility |
| 3 | Design System / Frontend | `design-system-frontend` | Tokens, component architecture, animation implementation, frontend performance |
| 4 | Next.js / TypeScript Architect | `nextjs-architect` | App structure, server/client boundaries, data flow, types, error handling |
| 5 | Supabase / Database Engineer | `supabase-database` | Schema, migrations, indexes, RLS, query design, data integrity |
| 6 | Maps / Geospatial Engineer | `maps-geospatial` | Provider evaluation, map UX mechanics, clustering, geolocation, POI resolution |
| 7 | AI / Extraction Engineer | `ai-extraction` | Extraction schema, prompts, provider abstraction, confidence, evals |
| 8 | Social Platform Integration | `social-integration` | What each platform *actually* permits, verified by experiment |
| 9 | Security / Privacy Engineer | `security-privacy` | Auth boundaries, RLS review, secrets, abuse, untrusted input, location privacy |
| 10 | QA / Reliability Engineer | `qa-reliability` | Test strategy, edge cases, failure behaviour, acceptance verification |
| 11 | DevOps / Vercel Engineer | `devops-vercel` | Environments, deploys, env vars, migrations, observability, production readiness |

Orchestration (this session) owns synthesis, conflict resolution, and the decision log.

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

Proposals move through a fixed challenge path so that no single perspective ships unopposed:

```
UX proposes an interaction
   → Frontend judges feasibility and frame cost
   → Geospatial judges whether the map provider supports it efficiently
   → Architect judges where the logic lives and what it costs in complexity
   → Security judges data exposure and privacy
   → Product decides whether it belongs in V1 at all
   → QA defines how it will be verified
```

Rules: claims about third parties need evidence; disagreements end in a recorded decision, not a
compromise that keeps both designs; the Product Lead breaks scope ties, the Architect breaks
structural ties, and Security's veto on data exposure is not overridable by either.
