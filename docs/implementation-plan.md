# Implementation Plan — the ordered build

> Owner: Product Lead + Architect. Date: **2026-08-18**. Status: **the plan of record.**
> Inputs, all of which are already written and are not restated here:
> [`00-project-charter.md`](00-project-charter.md) (scope contract) ·
> [`02-risks-and-unknowns.md`](02-risks-and-unknowns.md) (R0 schedule, cut discipline) ·
> [`03-university-requirements.md`](03-university-requirements.md) (the graded contract) ·
> [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md) (D1, VERIFIED) ·
> [`06-map-and-places-decision.md`](06-map-and-places-decision.md) (D2) ·
> [`07-import-execution-model.md`](07-import-execution-model.md) (D3, D12) ·
> [`08-place-identity.md`](08-place-identity.md) (D5, D6) ·
> [`product-specification.md`](product-specification.md) (M2, acceptance criteria, cut order) ·
> [`ux-architecture.md`](ux-architecture.md) (screens, states, motion) ·
> [`security.md`](security.md) (interim; 12 owed items).
>
> This document adds exactly one thing to the pile: **order**. What is built, in what sequence, what
> each step must prove before the next one starts, and what is abandoned if a step runs long.

---

## 1. What this document is, and what it deliberately is not

It **is** the final planning deliverable: the milestone ladder, the architecture summary the course
grades under M3, the schedule for the remaining documents, and the submission checklist.

It is **not a calendar.** Per the owner's instruction recorded in `02` §R0, milestones are *ordered
and sized*, not dated. The plan names what is cut when a milestone runs long — which is the decision
that actually protects the deadline. Dates would only encode a guess about which day the slip lands.

Two hard framing facts:

- **Deadline: 6 September 2026.** Written on 18 August 2026 → **19 calendar days**, budgeted below as
  **38 half-days** of working capacity with a declared reserve.
- **The premise is already proven.** `04` closed the blocking dependency with committed evidence:
  full caption text from an arbitrary public TikTok, server-side, no auth, no key, 16/16, p90 626 ms.
  The pivot branch in `02` §A1 is dead. What remains is a build, not an investigation.

## 2. Naming — read this before anything below

The course numbers its requirements **M1–M12** (`03`). This plan numbers its milestones **MS0–MS16**.
They are unrelated sequences. Course requirements are always written `M9 (course)` where confusion is
possible; milestones are always `MS9`.

## 3. Where the project stands — the decision ledger

| ID | Decision | Status | Recorded in |
|----|----------|--------|-------------|
| D1 | TikTok capability level and supported-content boundary | **CLOSED** — mechanism Level A (oEmbed, VERIFIED), product outcome **LEVEL B**: ~27% of genuine recommendations name a resolvable venue in caption text | `04` |
| D1b | Instagram / YouTube status | **CLOSED** — both Deferred post-V1, with re-entry conditions recorded; no investigation performed, by design | `05` |
| D2 | Map + places provider pair | **RECOMMENDED, pending Security review** — MapLibre GL v5 + Protomaps (CC0 style) + our own resolver over Overture Maps places, Nominatim capped fallback | `06` §11 |
| D3 | Import execution model | **CLOSED** — one `POST /api/imports` Node Route Handler streaming NDJSON. No queue, no worker, no Realtime | `07` |
| D4 | Confidence model | **CLOSED** — resolution evidence is the only gate (`06` §6.2). Extraction contributes no confidence signal; `modelConfidence` is stored for measurement only, plus one pre-resolution plausibility filter | `09` §5 |
| D5 | Place identity and dedup | **CLOSED** — our own uuid; `(provider, provider_place_id)` as aliases; 75 m + normalised-name + country secondary merge guard | `08` |
| D6 | PostGIS vs plain lat/lng | **CLOSED** — no PostGIS. Two `double precision` columns, bbox `BETWEEN`, Haversine refine. No extensions | `08` |
| D7 | LLM provider, model, abstraction shape | **CLOSED** — Anthropic `claude-haiku-4-5` in structured-output mode, one adapter behind the existing port; ~$0.003/import measured against a real caption, closing assumption B6. Escalation to `claude-sonnet-5` is one constant | `09` §2 |
| D8 | Auth methods offered | **CLOSED** — Supabase Auth email + password only, judged on live-demo reliability; magic link rejected, OAuth deferred. One role, no RLS impact | `security.md` §2.5 |
| D9 | Visual direction, map style, tokens | **PARTIALLY CLOSED** — UX architecture, screens, states, copy deck and five motion moments are specified; the token values and the forked Protomaps style are not authored | `technical-design.md` (written MS3; token values still owed) |
| D10 | Test strategy depth | **CLOSED (sized)** — four tiers and a 3 hd time-box, §13. The graded document is still written in MS13 | §13 → `test-specification.md` |
| D11 | Rate limits and cost ceilings | **HALF-CLOSED** — provider-call ceilings exist (`06` §6.4: 8 lookups/import, 30 imports/user/day, Nominatim ≤1 rps / ≤200 day). The per-user limiter implementation and the monthly ceiling are not written up | `scale.md` (owed) |
| D12 | Map shell and route topology | **CLOSED** — persistent `(map)` route-group layout owns one map instance; plain nested routes; no parallel/intercepting routes | `07` §11 |

**Reading of the ledger:** every decision that would be expensive to reverse *after* code exists is
now closed. MS1 shut the last five in one sitting (§4). What remains is D2's security sign-off — a
review of an existing recommendation, not an open choice — and it gates MS5's places ingest, so MS2
through MS4 can start against a settled design.

## 4. What MS1 closed, and the one decision still open

**MS1 is complete (2026-08-18).** Five decisions closed in one sitting, exactly as §5 rule 6 intends —
before the code they govern exists:

| Decision | Closed as | Recorded in |
|---|---|---|
| D7 LLM provider, model, output contract, prompt contract | `claude-haiku-4-5`, structured output, one adapter, versioned prompt | `09` §2–§4 |
| D4 extraction half of the confidence model | No model-derived gating; plausibility filter before resolution | `09` §5 |
| D1b Instagram / YouTube | Both Deferred post-V1, re-entry conditions recorded | `05` |
| D8 auth methods | Email + password only, chosen on demo reliability | `security.md` §2.5 |
| D10 test depth | Four tiers, 3 hd time-box | §13 below |

**Still open, and it blocks MS5, not MS2:**

| Decision | Owner | Closes by | Blocking |
|---|---|---|---|
| D2 sign-off | Security-Privacy | Answering the 7 questions in `06` §11 — one of them (whether the OSM alias join contaminates stored data with share-alike obligations) changes the ingest design, so it is answered **before MS5** | MS5 places ingest |

Nothing else may open a new decision. New ideas go to §21, per Charter §4.

## 5. Planning rules

1. **Ordered, not dated.** A milestone starts when its predecessor's exit criteria are met.
2. **Every milestone has exit criteria that are checkable by someone else**, not "done".
3. **Vertical before horizontal.** The pipeline is proven end-to-end on the ugliest path (real TikTok
   → real Postgres row) before any screen is beautiful. The first deploy happens in MS2, not MS15.
4. **Deployed early, deployed always.** `02` R2 says a demo that only works on the laptop is a
   project failure; the counter-measure is that a preview deployment exists from MS2 onward and the
   TikTok mechanism is re-proven from Vercel's IPs in MS6, not at the end.
5. **Effort sizes are half-days (hd).** S = 1 hd, M = 2 hd, L = 3–4 hd. Sizes are estimates; the
   *order* and the *cut lines* are the commitments.
6. **Documents are milestones, not homework.** The five graded documents have reserved slots in the
   ladder (§12). `03` gap 3 is binding: `technical-design.md` must be complete and dated **before**
   MS4 code lands — satisfied 2026-08-18.
7. **A milestone that runs 50% over its size triggers the cut list (§16) — not overtime.**

## 6. The milestone ladder

| # | Milestone | Size | Proves | Cuttable? |
|---|---|---|---|---|
| MS0 | TikTok feasibility spike | — | **DONE.** Evidence in `docs/evidence/tiktok/` | — |
| MS1 | Close D7 / D4-extraction / D8 / D10; write `09` and `05` | M (2) | **DONE** — nothing is built on an open decision | No |
| MS2 | Repo, toolchain, layering enforcement, both cloud projects, first preview deploy | M (2) | **DONE** — M5/M10 (course) mechanically work on day one | No |
| MS3 | `technical-design.md` — the pre-implementation design document | M (2) | **DONE** — M4 (course), and that the build order below is real | No |
| MS4 | Database: migrations 0001–0008, RLS forced, policy fixtures | L (3) | The data model of `08` exists and denies by default | No |
| MS5 | Places index: Overture city extracts ingested; resolver + scorer ported from the benchmark | L (3) | `06` §6 scoring reproduces its 44-case results in TypeScript | No |
| MS6 | Import domain: canonicaliser, ports, `runImport`, events, error taxonomy — with unit tests | L (3) | The central business logic exists as pure, testable code | No |
| MS7 | Integrations + the streaming route + **the Vercel re-proof** | L (3) | A real TikTok URL becomes real candidates **from a preview deployment** | No |
| MS8 | Auth, app shell, design tokens, the persistent map layout (D12) | M (2) | One role, RLS-backed; the map object survives navigation | No |
| MS9 | Import UI: paste → stage rail → review/disambiguation → confirm | L (4) | The flagship process, end to end, in the browser | No |
| MS10 | Map: style, pins, clustering, camera rules, place detail, near-me | L (4) | Retrieval — the half of the product that pays the loop back | No |
| MS11 | List view + search, manual place add/delete (capability 13 = course CRUD) | M (2) | M3/M4 (course) CRUD, and the map's independent recovery path | Partly (§16) |
| MS12 | Onboarding and empty states | S (1) | R5 — a new user's map is never bare | Partly |
| MS13 | `test-specification.md` + the implemented suite | L (3) | M6/M7 (course); RLS denial proven by a failing cross-user read | No |
| MS14 | Security: the full M9 document + the hardening pass over the 12 owed items | M (2) | M9 (course), currently the largest known gap | No |
| MS15 | Pipeline evaluation on the 50-post golden set; threshold re-fit | M (2) | The §7.1 honesty bar in `product-specification.md` | Partly |
| MS16 | `scale.md`, `deployment.md`, `how-the-system-works.md`, presentation, motion polish, submission | L (4) | M8/M10/M11/M12 (course) | Polish only |

**Sum: 42 half-days of estimated work against 38 available.** That is a 4 hd deficit stated on
purpose: the plan does not fit, and the mechanism that makes it fit is the cut list (§16), not
optimism. §15 does the arithmetic.

## 7. Architecture plan (course requirement M3)

This section is the M3 answer in one place. The detail lives in `07` §10 (layering, ports, types),
`08` §3 (schema), `06` §8 (provider interfaces) and `technical-design.md` (MS3).

**Which components exist.** Four layers, enforced by an ESLint `no-restricted-imports` rule in CI,
not by convention:

```
ui/           React components; client islands are explicit
app/          Next.js only — auth, rate limiting, HTTP, NDJSON streaming, server actions
domain/       pure TypeScript — types, errors, ports, the import orchestrator, canonicaliser,
              confidence, dedup. No next/*, no react, no vendor SDK, no fetch
integrations/ one adapter per port; vendor types and Zod schemas die here
```

**Is a database used, and which central entities.** Yes — Supabase Postgres, source of truth, RLS
enabled *and forced* on every table. Six central tables (`08` §3): `profiles`, `sources` (one row per
platform post, global, cross-user cache), `extractions` (LLM output per source × extractor version),
`places` (one physical place, our own uuid, global), `place_provider_refs` (provider-id aliases),
`saved_places` (the user's library entry and the only place a user's edits live), plus `imports` (the
record of one import run, holding pre-confirmation candidates as `jsonb`).

**Which pages.** All under one persistent route group so the map instance never unmounts (D12):
`/map`, `/place/[id]`, `/import`, `/import/[importId]`, plus the anonymous surface (marketing + auth).

**Which API routes or server actions.**
- `POST /api/imports` — Route Handler, Node runtime, `maxDuration = 60`; runs the pipeline and streams
  NDJSON stage events. This is the only long-running request in the product.
- `GET /api/imports/[id]` — reconnect / refresh-safe resume; returns the `ImportOutcome`.
- Server Action `confirmImport` — the transactional save of the user's confirmed candidates.
- Server Action `addPlace` — manual place addition (capability 13).
- Everything else is a server-component read through Supabase under the user's JWT.

**How data flows.** Browser posts a URL → route handler authenticates and rate-limits → domain
`runImport(ports, input, signal)` orchestrates: canonicalise (also the SSRF gate) → `SourceAdapter`
(TikTok oEmbed) → `ContentExtractor` (caption) → `PlaceExtractor` (LLM, schema-constrained) →
`PlaceResolver` (our Overture index, ≤8 lookups) → confidence banding → events streamed to the
client, rows written to `sources` / `extractions` / `imports` as they are produced → the user
confirms in the review sheet → server action writes `places` (dedup) + `saved_places` → the map reads
its own rows through RLS.

**Which users and permissions exist.** Exactly one authenticated role, the owner of their own map,
plus the anonymous visitor who sees only marketing and auth. `anon` holds no grant on any table.
Authorisation *is* RLS: global tables are membership-gated (a user reads a `places` row only if they
hold a `saved_places` row pointing at it), users hold no write grant on any global table, and the two
`SECURITY DEFINER` functions are granted to `service_role` only. This is `03`'s gap 1, answered.

**Which external services, and why.**

| Service | Why it, in one sentence |
|---|---|
| Supabase (Postgres + Auth) | Required by the course; RLS makes authorisation a property of the database rather than of our code |
| Vercel | Required by the course; fluid-compute defaults give the pipeline 300 s against a measured ~8 s need |
| TikTok public oEmbed | The only permitted mechanism that returns an arbitrary public post's full caption with no auth, no key and no cost (VERIFIED, `04`) |
| Overture Maps places (open data) | The only way to store a name and coordinates **forever**, which every credentialed places API forbids (`06` §1) |
| Protomaps tiles + MapLibre GL | CC0 style we may fork and own, one attribution string, no credit card anywhere |
| Nominatim (capped) | Out-of-region fallback only, rate-limited to policy and cached |
| One LLM provider (D7, MS1) | Structured-output extraction of place names from caption prose; behind one port, one adapter |

## 8. Data model and migration order

Migrations are checked in, ordered, and applied in this sequence (`08` §3): `0001_conventions` →
`0002_profiles` → `0003_sources` → `0004_extractions` → `0005_places` → `0006_saved_places` →
`0007_functions` → `0008_policy_tests`. Rules that hold for all of them:

- RLS `ENABLE` **and** `FORCE` on every table in the same migration that creates it. A table without
  a policy is a table nobody can read — that is the intended failure direction.
- No extensions. D6 is "no PostGIS", and nothing else needs one.
- `save_place()` is `SECURITY INVOKER` so the product's most important write stays governed by RLS;
  `resolve_place()` / `merge_places()` are `SECURITY DEFINER` and granted to `service_role` **only**.
  That grant list is load-bearing (`security.md` §1) and is a code-review checklist item, not a
  detail.
- Column-level `GRANT UPDATE` on `saved_places` excludes `user_id`, `place_id`, `origin`.

## 9. Build order for the central business logic

The import pipeline is built **inside-out**, because the pure core is the part that can be tested
without a network, a browser or a database:

1. `domain/types.ts`, `domain/errors.ts`, `domain/ports.ts` — the vocabulary and the closed error
   union (`07` §9, 14 codes). Nothing else may cross into the app layer.
2. `domain/source/canonicalise-tiktok-url.ts` — pure, table-driven, and simultaneously the SSRF
   boundary (`04` §2). Heaviest unit-test target in the codebase.
3. `domain/import/pipeline.ts` — `runImport(ports, input, signal)`, emitting `ImportEvent`s and
   enforcing the budgets. Tested against fake ports before a single real adapter exists.
4. `domain/place/confidence.ts` and `domain/place/dedup.ts` — the two rulings from `06` §6.2 and
   `08` §1, as pure functions with the benchmark as their regression test.
5. Adapters (MS7), each with its own Zod schema at the vendor boundary.
6. The route handler last — it is thin by construction: auth, rate limit, stream, done.

**Partial success is a first-class outcome** (`07` §8) and `NO_PLACES_FOUND` is an *outcome*, not an
error — at LEVEL B it is the modal result (~73%). Any code or metric that models it as a failure is
wrong.

## 10. Frontend build order

Tokens → primitives → screens → motion. In that order, because `02` R6 says the premium bar is the
thing most likely to eat the remaining days.

1. **Tokens locked first** (type, space, radius, elevation, motion, surfaces) and the forked
   Protomaps style authored against the same palette. Radix/shadcn supply behaviour only.
2. **The shell**: `(map)` layout owning one `MapCanvas` created once in a `useRef`; the sheet is a
   *sibling* that covers the map with CSS and never unmounts it. This rule is written down because
   `{isOpen && <Map/>}` is the natural mistake and it is unrecoverable mid-demo.
3. **Import screens** (MS9) before **map polish** (MS10) — the import is the magic moment.
4. **Motion last, five moments only**, and moments 3–5 are cut line #2.

## 11. Milestones in detail

Each milestone lists what is done, what must be true to leave it, and what is abandoned if it
overruns.

### MS1 — Close the open decisions · M (2 hd) · **DONE 2026-08-18**
Delivered: `09-extraction-and-resolution.md` (D7 + the D4 extraction half, with the output schema, the
prompt contract, the injection posture, and the evaluation bars that feed MS15);
`05-secondary-platforms.md` (D1b); the D8 ruling in `security.md` §2.5; the D10 sizing in §13.
**Exit met:** the §3 ledger shows no OPEN row. The one remaining item is D2's security sign-off, which
is a review of an existing recommendation rather than an open decision, and it gates MS5 (§4).

### MS2 — Repo, toolchain, cloud projects, first deploy · M (2 hd) · **DONE 2026-08-18**
Next.js + TypeScript strict, the four-layer folder skeleton with the `no-restricted-imports` zones
active, Vitest + Playwright configured, Supabase project, Vercel project, env-var matrix, and a
trivial page deployed to a preview URL and to production.
**Exit:** a public URL renders; CI fails a deliberate `domain/` → `next/*` import.
**Overrun:** nothing to cut; this is the floor.
**Exit met:** production renders at **https://p-002-zeta.vercel.app**, `/healthz` returns
`{"ok":true,"stage":"production","commit":"0962d64"}` from `fra1`, and `npm run check:layers` proves
ESLint rejects a `domain/` → `next/server` import. Delivered: Next 16 + React 19 + TS strict, the
four-layer skeleton with the `no-restricted-imports` zones active, Vitest + Playwright (4/4 green
against the deployment itself), CI workflow, the env-var matrix in `README.md`, and two Supabase
projects in `eu-central-1` co-located with the Vercel function region. Setup record and reproduction
steps: [`ms2-cloud-setup.md`](ms2-cloud-setup.md). No schema yet — that is MS5.

### MS3 — `technical-design.md` · M (2 hd) · **DONE 2026-08-18**
The graded pre-implementation design (course M4): folder tree, component structure, schema DDL, the
CRUD matrix, the route/action inventory, the pipeline as central business logic, state strategy, the
error taxonomy, Zod validation points, and the core UX flows. Mostly assembly — `07`, `08`, `06` and
`ux-architecture` already contain the content; this is the document that makes them one design.
**Exit:** the file is complete and dated **before MS4 writes code** (`03` gap 3).
**Exit met:** [`technical-design.md`](technical-design.md) is written and dated 2026-08-18, with no
application code beyond the MS2 skeleton. Beyond assembly it did two things the milestone did not
anticipate: §14 records **seven reconciliations** where `07` and `08` disagreed (id naming, the
import status set — now six values including a distinct `no_places`, the observability columns on
`imports`, `source_id NOT NULL` resolved by inserting the pending `sources` row at canonicalisation
time, the idempotency index, the `place_lookups` cache, and revoking the user's
`UPDATE (candidates)` grant), each a small delta **MS4 must apply when it writes the migrations**;
and §15 names the seven open items with their owners, none of which blocks MS4.
Also landed under MS3: `main` is protected by a local pre-push hook rather than a GitHub ruleset —
rulesets are Pro/Team-only on a private repo — and CI now runs Playwright in its own container
image. Trade-off and limits: [`ms3-branch-protection.md`](ms3-branch-protection.md).

### MS4 — Database · L (3 hd)
The eight migrations, applied to both environments. Policy fixtures from `0008` seeded.
**Exit:** a SQL test proves user B's select of user A's `saved_places` returns zero rows, and that
`places` is invisible to a user who has not saved it. **Overrun:** never cut — this is the graded
core and the whole authorisation story.

### MS5 — Places index and resolver · L (3 hd)
Ingest Overture per-city extracts (Tel Aviv, Tokyo, London — the benchmark cities) into Postgres with
the region scoping from `06` §6.1 step 2. Port the scorer from
`evidence/places/resolve-overture-scored.py` to TypeScript, weights and thresholds in **one exported
constant object**, with the 44-case benchmark as its regression test.
**Exit:** the TypeScript scorer reproduces `06` §6.3 — 29/29 preselect correct, zero false
auto-accepts. **Blocked by:** the OSM/share-alike answer in `06` §11 (see §4). **Overrun:** cut to
two cities, never to zero scoping — the Padella result shows unscoped search is actively wrong.

### MS6 — Import domain · L (3 hd)
Items 1–4 of §9, against fake ports. No network, no database, no React.
**Exit:** `runImport` produces the full event sequence and every one of the 14 error codes is
reachable in a test. The canonicaliser passes the whole table in `04` §2, including
`tiktok.com.evil.io` and `nottiktok.com` failing closed.

### MS7 — Integrations, the streaming route, and the Vercel re-proof · L (3 hd)
oEmbed source adapter, caption content extractor, LLM place extractor, place resolver, import store;
`POST /api/imports` with `runtime='nodejs'` and `maxDuration=60` **in code, not the dashboard**; the
per-user limiter; `GET /api/imports/[id]`.
**Exit — the single most important gate in the plan:** a real TikTok URL, pasted against a **preview
deployment**, returns real resolved candidates, with the measured stage latencies logged. This closes
`02` R2/A7 with production infrastructure rather than a laptop.
**Overrun:** nothing here is cuttable; if it slips, MS11/MS12 pay for it.

### MS8 — Auth, shell, tokens, the persistent map layout · M (2 hd)
Supabase Auth per D8; the `(map)` route group; tokens locked; the module-scope map singleton and the
`sessionStorage` camera mirror from `07` §11 step 5.
**Exit:** `/map` → `/place/[id]` → back → `/import` → back leaves `getCenter()`/`getZoom()` unchanged.

### MS9 — Import UI · L (4 hd)
Paste screen, the three-stage rail consuming `ImportEvent`s with minimum-dwell pacing, the review and
disambiguation sheet (N candidates, preselect/confirm/no_match bands rendered per `06` §6.2), the
designed failure states (F9/F10) with their three recoveries — retry, open the original, add a known
place — and the `confirmImport` action.
**Exit:** an import of a real multi-place TikTok saves the right rows, and a `NO_PLACES_FOUND` post
lands on F10 without the word "error" anywhere on screen.
**Overrun:** the disambiguation sheet is never simplified; the rail's motion is.

### MS10 — Map and retrieval · L (4 hd)
Forked Protomaps style, custom pins, `cluster:true` GeoJSON source, the four authorised camera
movers, place detail with the link back to the source TikTok, geolocation and "what did I save near
me" over the bbox + Haversine query.
**Exit:** ~200 pins at 60 fps on a mid-range Android; near-me returns correct rows with no coordinate
in any URL or log. **Overrun:** cut clustering sophistication to plain pins (cut line #6).

### MS11 — List view and manual place addition · M (2 hd)
Paginated list with text search and category filter; manual POI search → select → save; delete; edit.
This doubles as the course's CRUD evidence.
**Overrun:** filter first, then sorting, then editing — cut lines #3, #4, #5 in that order.

### MS12 — Onboarding and empty states · S (1 hd)
Never show a bare empty map; land the first places in the first session (`02` R5).

### MS13 — Test specification and the suite · L (3 hd)
`test-specification.md` (course M6) then the implementation (M7): unit tests on canonicalisation,
scoring, dedup and confidence; RTL on the review sheet; SQL policy tests asserting cross-user reads
fail; Playwright on the golden path, on double-paste idempotency, and on map-camera stability.
**Never cut:** the policy tests and the golden path.

### MS14 — Security document and hardening · M (2 hd)
The full M9 document, plus the 12 owed items in `security.md` §3 — the three ⚠ items (D8, SSRF
design, the OSM share-alike question) having already been answered earlier because they govern code
written before this point. Verify the two invariants: no `SECURITY DEFINER` global-row function
granted to `authenticated`, and the import-ownership predicate still in `sps_insert_own`.

### MS15 — Pipeline evaluation · M (2 hd)
`10-pipeline-evaluation.md`: run the real pipeline over the 50-post golden set, re-fit the `06` §6.2
thresholds, and state the resulting honest capability claim against `product-specification.md` §7.1.
**Overrun:** shrink the golden set to 25 posts and say so in the document.

### MS16 — Documents, polish, submission · L (4 hd)
`scale.md`, `deployment.md`, `how-the-system-works.md`, the presentation deck, the five motion
moments, the README with local-run instructions and the env-var explanation, and the §20 checklist.

## 12. Document deliverables schedule

| Document | Written in | Course req |
|---|---|---|
| `05-secondary-platforms.md` | MS1 ✅ | — |
| `09-extraction-and-resolution.md` | MS1 ✅ | — |
| `technical-design.md` | MS3 ✅ | **M4** |
| `test-specification.md` | MS13 | **M6** |
| `security.md` (full) | MS14, ⚠ items earlier | **M9** |
| `10-pipeline-evaluation.md` | MS15 | — |
| `scale.md` | MS16 | **M8** |
| `deployment.md` + `README.md` | MS16 (drafted at MS2) | **M10** |
| `how-the-system-works.md` | continuous, finished MS16 | **R2** |
| `presentation-outline.md` + deck | MS16 | **M11** |
| `adr/` | one file per closed decision, as it closes | **R1** |

`product-specification.md` (M2) and the architecture plan (M3, §7 above) are already written.

## 13. Test strategy (D10 — closed at MS1; the graded document is written in MS13)

**Sizing ruling: 3 hd total, spent in this ratio — 1.5 hd tier 1, 0.5 hd tier 2, 0.5 hd tier 3,
0.5 hd tier 4.** That is deliberately lopsided toward pure functions, because they are the cheapest
tests to write, the fastest to run, and they cover the seams the charter names as the ones that break.
Tiers 1 and 2 are never cut; tiers 3 and 4 shrink to the golden path alone if MS13 overruns.

Four tiers:

1. **Pure-function units (cheap, high value).** URL canonicalisation including the hostile-host table,
   resolution scoring against the 44-case benchmark, dedup and the 75 m merge guard, confidence
   banding, the LLM output Zod schema against malformed and hostile payloads.
2. **Database policy tests (mandatory, not optional).** `03` gap 2: multiple users exist, so
   permission tests are required. The strongest evidence we can show an examiner is a test that
   *fails to read* another user's data, per table, per operation.
3. **Component tests.** The review sheet across preselect / confirm / no_match, and the failure states.
4. **End-to-end (Playwright).** The golden path (paste → save → find on map), double-paste
   idempotency, and the map-camera-stability assertion that guards D12 from silent regression.

Deliberately not tested: vendor behaviour we do not control (that is what `docs/evidence/` is for),
visual appearance, and the LLM's output quality — that is measured by the golden-set evaluation in MS15
(`09` §8), which is a benchmark with recorded numbers, not a pass/fail test in CI.

## 14. Security work plan

The 12 owed items in `security.md` §3 are not one lump. They split three ways:

- **Answer before the code they govern** (already scheduled): D8 → MS1; SSRF design → MS6 (the
  canonicaliser *is* the boundary); the OSM alias share-alike question → before MS5 ingest.
- **Answer with the code**: caption-retention TTL, cached-source GC on user deletion, the
  `imports.candidates` grant, the tile-key posture, concrete rate limits — MS7 and MS11.
- **Collect and write up**: the M9 document and QA's pre-submission checklist — MS14.

The Security veto on data exposure (Charter §9) stands over every one of these; a milestone is not
complete while it holds an unanswered ⚠.

## 15. Effort budget and reserve

42 hd of estimated work against 38 hd of capacity does not fit, and pretending otherwise would be
the most dangerous sentence in this document. The reserve is therefore taken from scope, not from
time:

- **MS11, MS12 and MS15 (5 hd combined) are the declared reserve.** If MS5, MS7 or MS9 overrun, they
  are consumed in the cut order of §16 before anything in the never-cut list is touched.
- **MS16's polish component (2 hd of the 4) is the second reserve.** The documents inside MS16 are
  graded; the motion is not.
- That is **7 hd of recoverable scope**, which turns 42 hd into 35 hd against 38 available. The plan
  fits only once at least the first 4 hd of it are actually cut — so the cut decisions are made when
  a milestone overruns, not at the end when there is nothing left to trade.

## 16. Cut lines, mapped onto milestones

Applied strictly top-down, from `product-specification.md` §8.1:

| Order | Cut | Milestone it comes out of |
|---|---|---|
| 1 | Any second source platform | already Deferred (MS1 records it) |
| 2 | Motion moments 3, 4, 5 | MS16 polish |
| 3 | Category filter on the list | MS11 |
| 4 | List-view polish and sorting | MS11 |
| 5 | Manual place *editing* (add + delete survive) | MS11 |
| 6 | Clustering sophistication → plain pins | MS10 |
| 7 | The visual polish phase in full | MS16 |
| **Never** | Capabilities 2–10 and 12, the designed failure state, RLS + the permission tests, onboarding's first-3-places outcome, the deployed public URL | MS4, MS7, MS9, MS12, MS13 |

## 17. Risk triggers and what fires them

The R1/R2 pivot branches from `02` are closed by MS0's evidence. What remains is live:

| Trigger, observed at | Fires |
|---|---|
| TikTok oEmbed starts failing or gating (R-TT1) | The product's one undocumented dependency. Fall back to nothing — this is the concentrated risk the owner accepted, recorded in `02` §D1. Mitigation is the cached `sources` table, which keeps already-imported posts working |
| MS7's Vercel re-proof behaves differently from local | Stop. This is R2 and it invalidates the demo, not just the milestone |
| Measured end-to-end latency exceeds ~30 s | Revisit D3 (`07` §12). Not before — a queue must be *earned* |
| Saved-place volume per user exceeds a few thousand | Revisit D6 (PostGIS). `08` §6.4 holds the thresholds |
| Any milestone 50% over size | The §16 cut list, immediately, in order |
| An unanswered ⚠ security item at the milestone it governs | Milestone is not complete |

## 18. Definition of done for V1

1. A pasted public TikTok URL, on a production URL, from a phone, becomes confirmed places on the
   user's private map — with the source link preserved, dedup holding across re-imports, and the
   review step never bypassed.
2. A post that names no place lands on a designed screen that offers retry, the original post, and
   manual place search — and never asks for the caption.
3. A second user cannot read the first user's data, and there is a test that proves it by failing to.
4. The five graded documents exist, are current, and match the code.
5. The student can explain every component, every library and every decision in one sentence each —
   which is what `adr/` and `how-the-system-works.md` exist to guarantee.

## 19. Deployment and the public URL (course M10)

- **Two environments**: Vercel preview (per branch, against a Supabase branch/staging project) and
  production. Both exist from MS2, not from MS16.
- **Env-var matrix** documented in `deployment.md` and mirrored in `README.md`: Supabase URL + anon
  key (public by design), Supabase service-role key (server-only, never in a client bundle), the LLM
  provider key (server-only), the Protomaps tile key (public, URL-restricted), and the feature flag
  that keeps the transcription `ContentExtractor` **off**.
- **Migrations** are applied through checked-in SQL files in order, never through the dashboard, so
  the production database is reproducible from the repository.
- **The public URL is a deliverable, not a by-product**: it is verified working from a device that
  has never opened the project, on a network that is not the developer's.

## 20. Submission checklist (course M12)

| # | Artefact | Produced by | Status |
|---|---|---|---|
| 1 | Link to the live app | MS16 (URL exists from MS2) | pending — **https://p-002-zeta.vercel.app** is live and production-verified since MS2; the artefact is a link to the *finished* product, so this closes at MS16 |
| 2 | Link to the GitHub repository | MS2 | ✅ `github.com/LiorJossef/P-002` — ⚠ **private**, so the link is not yet openable by an examiner. Making it public (or adding the grader as a collaborator) is a submission-day action, tracked in `ms3-branch-protection.md` |
| 3 | Product specification | done | ✅ `product-specification.md` |
| 4 | Technical design document | MS3 | ✅ `technical-design.md` |
| 5 | Test specification | MS13 | pending |
| 6 | Test code | MS13 | pending |
| 7 | Scale document | MS16 | pending |
| 8 | Security document | MS14 | pending (interim file exists) |
| 9 | Local run instructions | MS2 draft, MS16 final | pending — the MS2 draft exists (`README.md` §Local setup + the env-var matrix); MS16 owns the final pass |
| 10 | 10–15 minute presentation deck | MS16 | pending |

## 21. Post-V1 backlog

Parked here so it stays out of the sprint (Charter §4): Instagram behind the existing `SourceAdapter`
seam; YouTube if it proves near-free; audio transcription as a `ContentExtractor` implementation
behind the flag that is already designed and defaulted off; collections and sharing; a credentialed
places provider benchmarked against the open-data resolver; alternate-name indexing to fix the
measured non-Latin-script resolution gap (`06` §7).

---

## Change log

| Date | Change |
|---|---|
| 2026-08-18 | Created. Ledger reflects D1/D3/D5/D6/D12 closed, D2 pending security sign-off, D4/D7/D8/D10/D11 open or half-open |
| 2026-08-18 | **MS1 complete.** D7, D4, D1b, D8 and D10 closed (`09`, `05`, `security.md` §2.5, §13). Only D2's security sign-off remains, and it gates MS5 rather than MS2 |
| 2026-08-18 | **MS2 complete.** Repo, toolchain, layer enforcement, both cloud projects, production deploy verified |
| 2026-08-18 | **MS3 complete.** `technical-design.md` written before any application code (`03` gap 3 satisfied). Seven schema/design reconciliations recorded in its §14 are now MS4 input |
| 2026-08-18 | **MS4 started with a review.** Five further reconciliations (R8–R12) and one defect in `resolve_place`'s concurrency path found before transcription. Executing the schema then found a second, worse defect: both constraint trigger functions referenced a record the firing trigger does not have, which would have failed *every* `places` insert at COMMIT — invisible until the tests stopped rolling back without firing their deferred triggers (P7b). Migration set + 17-assertion authorisation proof green in CI. Staging then exposed a third defect that no local run could have found: the hosted default privileges had granted `authenticated` UPDATE/DELETE/**TRUNCATE** on three tables — TRUNCATE ignores RLS, so it was a path to wiping every user's rows. Closed by `0008` plus a static CI guard, since the defaults themselves are owned by `supabase_admin` and cannot be removed. A fourth defect followed from the same inventory: EXECUTE defaults to `PUBLIC`, so `0007`'s revoke-from-anon left `save_place` callable by `anon` (`0009`). Nine migrations; CI green; **staging applied and verified clean by `inventory.sql` (PASS 1–8); production still untouched, so MS4 is not closed**. Record: [`ms4-database.md`](ms4-database.md) |
| 2026-08-18 | §20 submission checklist audited against reality: artefacts 2 (repo, ⚠ private) closed; 1 and 9 annotated with what already exists and what still gates them |
