# Implementation Plan — the ordered build

> Owner: Product Lead + Architect. Date: **2026-08-18**. Status: **superseded as the ordering
> authority on 2026-08-20 by [`mvp-plan.md`](mvp-plan.md)**, which re-plans the build by *product
> level* instead of half-days. This document remains binding for everything else it holds — the
> decision ledger (§3), the architecture answer (§7, course M3), the migration order (§8) and the
> build orders (§9, §10). Its milestone ladder (§6, §11) and its effort budget (§15) are retired;
> `mvp-plan.md` §10 records where every milestone went, with nothing dropped silently.
> Inputs, all of which are already written and are not restated here:
> [`00-project-charter.md`](00-project-charter.md) (scope contract) ·
> [`02-risks-and-unknowns.md`](02-risks-and-unknowns.md) (R0 schedule, cut discipline) ·
> [`03-university-requirements.md`](03-university-requirements.md) (the graded contract) ·
> [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md) (D1, VERIFIED) ·
> [`06-map-and-places-decision.md`](06-map-and-places-decision.md) (D2) ·
> [`07-import-execution-model.md`](07-import-execution-model.md) (D3, D12) ·
> [`08-place-identity.md`](08-place-identity.md) (D5, D6) ·
> [`10-poi-index.md`](10-poi-index.md) (the POI index schema, MS5) ·
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
| D2 | Map + places provider pair | **CLOSED** — MapLibre GL v5 + Protomaps (CC0 style) + our own resolver over Overture Maps places, Nominatim capped fallback. Security sign-off taken 2026-08-18 by splitting `06` §11 rather than answering it as a block: Q1 answered, Q2 narrowed to the milestone that first writes an ODbL-derived row, Q3–Q7 open but incapable of changing an Overture-only schema | `06` §11 |
| D3 | Import execution model | **CLOSED** — one `POST /api/imports` Node Route Handler streaming NDJSON. No queue, no worker, no Realtime | `07` |
| D4 | Confidence model | **CLOSED** — resolution evidence is the only gate (`06` §6.2). Extraction contributes no confidence signal; `modelConfidence` is stored for measurement only, plus one pre-resolution plausibility filter | `09` §5 |
| D5 | Place identity and dedup | **CLOSED** — our own uuid; `(provider, provider_place_id)` as aliases; 75 m + normalised-name + country secondary merge guard | `08` |
| D6 | PostGIS vs plain lat/lng | **CLOSED** — no PostGIS. Two `double precision` columns, bbox `BETWEEN`, Haversine refine. Scope clarified 2026-08-18: D6 is the *geometry* question. `pg_trgm` is permitted for the POI index's name prefilter (`10` §5) — it is not a geometry type, and `06` §5's cost model always assumed it | `08`, `10` |
| D7 | LLM provider, model, abstraction shape | **CLOSED** — Anthropic `claude-haiku-4-5` in structured-output mode, one adapter behind the existing port; ~$0.003/import measured against a real caption, closing assumption B6. Escalation to `claude-sonnet-5` is one constant | `09` §2 |
| D8 | Auth methods offered | **CLOSED** — Supabase Auth email + password only, judged on live-demo reliability; magic link rejected, OAuth deferred. One role, no RLS impact | `security.md` §2.5 |
| D9 | Visual direction, map style, tokens | **PARTIALLY CLOSED, and split 2026-08-19 into D9a + D9b** because the two halves were sized as one and scheduled in two places. **D9a — the token values** (type, space, radius, elevation, motion, surfaces): not authored, owned by MS8. **D9b — the forked Protomaps style**: not authored, owned by the new MS8b. UX architecture, screens, states, copy deck and the five motion moments are specified and are not part of either | `technical-design.md` (written MS3; both halves still owed) |
| D10 | Test strategy depth | **CLOSED (sized)** — four tiers and a 3 hd time-box, §13. The graded document is still written in MS13 | §13 → `test-specification.md` |
| D11 | Rate limits and cost ceilings | **HALF-CLOSED** — provider-call ceilings exist (`06` §6.4: 7 lookups/import, 30 imports/user/day, Nominatim ≤1 rps / ≤200 day). The per-user limiter implementation and the monthly ceiling are not written up | `scale.md` (owed) |
| D2b | **Global place resolution** | **CLOSED 2026-08-20** — two sources behind one `PlaceResolver` port: the Overture index for loaded regions (85%), Nominatim globally (63%), routed on the extraction's `cityHint`. Nominatim built now, a hosted OSM geocoder as a one-env-var escape hatch. Amends D2 by promoting its own out-of-region fallback into the MVP core; re-opens `06` §11 Q2, whose sign-off is owed before the adapter merges | `mvp-plan.md` §11, `06` §0/§11 |
| D12 | Map shell and route topology | **CLOSED** — persistent `(map)` route-group layout owns one map instance; plain nested routes; no parallel/intercepting routes | `07` §11 |

**Reading of the ledger:** every decision that would be expensive to reverse *after* code exists is
now closed. MS1 shut five in one sitting, and the last one — D2's security sign-off — closed on
2026-08-18 (§4). **The ledger has no open row.** Every milestone from MS5 onward builds on settled
design; the next decision this project makes will be one it deliberately re-opens, not one it
discovers.

## 4. What MS1 closed, and how the last open decision was closed

**MS1 is complete (2026-08-18).** Five decisions closed in one sitting, exactly as §5 rule 6 intends —
before the code they govern exists:

| Decision | Closed as | Recorded in |
|---|---|---|
| D7 LLM provider, model, output contract, prompt contract | `claude-haiku-4-5`, structured output, one adapter, versioned prompt | `09` §2–§4 |
| D4 extraction half of the confidence model | No model-derived gating; plausibility filter before resolution | `09` §5 |
| D1b Instagram / YouTube | Both Deferred post-V1, re-entry conditions recorded | `05` |
| D8 auth methods | Email + password only, chosen on demo reliability | `security.md` §2.5 |
| D10 test depth | Four tiers, 3 hd time-box | §13 below |

**The last one, closed 2026-08-18 — and the manner of closing is the reusable part.** D2's
sign-off had been sitting as a single gate over seven heterogeneous questions, so it could only be
paid off in full or not at all, and it was not being paid off at all. The move was to ask a smaller
question — *which of these can actually change the artefact MS5 produces?* — and answer that one:

| Decision | Owner | Closed by | Still blocking |
|---|---|---|---|
| D2 sign-off | Security-Privacy | **CLOSED 2026-08-18.** Not by answering all seven questions, but by establishing which of them can actually change the ingest: Q1 answered (and its first deliverable, the repo `NOTICE`, shipped), Q2 narrowed — the OSM alias join and the Nominatim fallback are both out of MS5, so no MS5 row is ODbL-derived and the POI index constrains `source_dataset` to make that enforceable rather than promised. Q2 re-opens on the first PR that adds an OSM alias, a Nominatim write, or a second dataset | Nothing. MS5 is unblocked |

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
| MS5 | Places index: the POI index schema + migration 0010, Overture city extracts ingested, resolver + scorer ported from the benchmark | L (5) | `06` §6 scoring reproduces its 44-case results in TypeScript | No |
| MS6 | Import domain: canonicaliser, ports, `runImport`, events, error taxonomy — with unit tests | L (3) | The central business logic exists as pure, testable code | No |
| MS7 | Integrations + the streaming route + **the Vercel re-proof** | L (3) | A real TikTok URL becomes real candidates **from a preview deployment** | No |
| MS8 | Auth, app shell, design tokens (D9a), the persistent map layout (D12) | M (2) | One role, RLS-backed; the map object survives navigation | No |
| MS8b | The forked Protomaps style (D9b) — the brand surface | M (2) | Charter §6's premise: the map style *is* the brand, and it is ours | Partly (§16) |
| MS9 | Import UI: paste → stage rail → review/disambiguation → confirm | L (4) | The flagship process, end to end, in the browser | No |
| MS10 | Map: pins, clustering, camera rules, place detail, near-me | L (4) | Retrieval — the half of the product that pays the loop back | No |
| MS11 | List view + search, manual place add/delete (capability 13 = course CRUD) | M (2) | M3/M4 (course) CRUD, and the map's independent recovery path | Partly (§16) |
| MS12 | Onboarding and empty states | S (1) | R5 — a new user's map is never bare | Partly |
| MS13 | `test-specification.md` + the implemented suite | L (3) | M6/M7 (course); RLS denial proven by a failing cross-user read | No |
| MS14 | Security: the full M9 document + the hardening pass over the 12 owed items | M (2) | M9 (course), currently the largest known gap | No |
| MS15 | Pipeline evaluation on the 50-post golden set; threshold re-fit | M (2) | The §7.1 honesty bar in `product-specification.md` | Partly |
| MS16 | `scale.md`, `deployment.md`, `how-the-system-works.md`, presentation, motion polish, submission | L (4) | M8/M10/M11/M12 (course) | Polish only |

**Sum: 46 half-days of estimated work against 38 available.** That is a 4 hd deficit stated on
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
`runImport(ports, input, ctx)` orchestrates: canonicalise (also the SSRF gate) → `SourceAdapter`
(TikTok oEmbed) → `ContentExtractor` (caption) → `PlaceExtractor` (LLM, schema-constrained) →
`PlaceResolver` (our Overture index, ≤7 lookups — `MAX_CANDIDATES = 7`) → confidence banding → events streamed to the
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
- **One extension, and only one: `pg_trgm`**, created by MS5's migration for the POI index name
  prefilter (`10` §5). D6 is "no PostGIS" — a ruling about geometry types, not a ban on the
  extension mechanism — and `06` §5 sized POI storage "with a trigram index" from the start. The
  earlier absolute ("nothing else needs one") was written before the POI index was designed and is
  withdrawn. `inventory.sql` check 8 enforces the allow-list, so a *second* extension is a FAIL.
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
3. `domain/import/pipeline.ts` — `runImport(ports, input, ctx)`, emitting `ImportEvent`s and
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

1. **Tokens locked first** (D9a: type, space, radius, elevation, motion, surfaces) in MS8.
   Radix/shadcn supply behaviour only.
1b. **The forked Protomaps style authored against those tokens** (D9b) in MS8b — after the palette
   exists, not alongside it. `ux-architecture` §13.1 Q2 asked which of the two lands first precisely
   because they constrain each other; the answer is tokens, and the style is then a dependent
   deliverable rather than a simultaneous one.
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
**Exit met:** the §3 ledger shows no OPEN row. The one remaining item was D2's security sign-off, a
review of an existing recommendation rather than an open decision; it gated MS5 and was closed
2026-08-18 (§4).

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
steps: [`ms2-cloud-setup.md`](ms2-cloud-setup.md). No schema yet — that is MS4.

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

### MS4 — Database · L (3 hd) · **DONE 2026-08-18**
The migrations, applied to both environments. Policy fixtures from `0008` seeded.
**Exit:** a SQL test proves user B's select of user A's `saved_places` returns zero rows, and that
`places` is invisible to a user who has not saved it. **Overrun:** never cut — this is the graded
core and the whole authorisation story.
**Exit met:** `0008_policy_tests.sql` asserts both, as `authenticated` with `request.jwt.claims` set,
green in CI against a fresh `supabase db reset`
([32168400182](https://github.com/LiorJossef/P-002/actions/runs/32168400182)) — **P1** B reads zero
rows of A's `saved_places`, **P2** `places` and `place_provider_refs` are invisible to a non-saver,
plus 17 further assertions.
Delivered **nine** migrations, not eight: `0008_revoke_hosted_defaults.sql` and
`0009_function_grants.sql` were added for defects only a real deployment exposed, and the policy
tests moved to `supabase/tests/` (R12) so fixture users can never reach production.
Applied and **independently verified on both hosted projects** — `inventory.sql` returns `PASS 1`–`8`
against `p-002-staging` and `p-002-prod`, each run identifying its own target: RLS enabled and forced
on all nine tables, the exact sixteen policies, `anon` holding nothing, both grant matrices matching
the design, only `save_place`/`km_between` reachable by a browser role, nine triggers enabled, no
extension beyond baseline (D6 holds).
Five defects in `08` §3's SQL were found and fixed, each by a different method — reading, executing
locally, executing against a hosted project, and making a check exhaustive. Full record, including
what could **not** be fixed (the `supabase_admin` default privileges, and the static guard that
compensates): [`ms4-database.md`](ms4-database.md).

### MS5 — Places index and resolver · L (5 hd)
Re-sized 3 → 5 hd and re-scoped on 2026-08-18 after review; the sizing came from the reserve (§15).

**In scope, in this order:**
1. **The POI index schema** — designed in [`10-poi-index.md`](10-poi-index.md), which is written and
   reviewed *before* the migration, exactly as `technical-design.md` was written before MS4's SQL.
   `technical-design.md` §130 named "our Postgres POI index" and nothing ever designed it; the whole
   milestone rested on a table that did not exist.
2. **Migration 0010** — `poi_regions` + `poi_index` + `pg_trgm`, plus the four columns `06` §0/§7.5
   promised and MS4 did not ship: `places.source_dataset`, `source_dataset_id`, `resolution_score`,
   `last_verified_at`. `inventory.sql` is extended so MS4's proof does not silently stop covering the
   schema. **Written and executed 2026-08-18** against a throwaway `supabase/postgres:17.6.1.064`
   container: `0001`–`0010` clean, `inventory.sql` `PASS 1`–`8`, the 19 MS4 policy assertions green,
   independently re-run by a second session. Not yet run via `supabase db reset`, in CI, or on either
   hosted project.
3. **Ingest** of the Overture per-city extracts (Tel Aviv, Tokyo, London — the benchmark cities) with
   the region scoping from `06` §6.1 step 2, against a **pinned** Overture release.
4. **Port the scorer** from `evidence/places/resolve-overture-scored.py` to TypeScript, weights and
   thresholds in **one exported constant object**, with the 44-case benchmark as its regression test.

**Explicitly out of scope, and why:**
- **The OSM alias join** (`06` §7.1a). It is the fix for Tel Aviv's 8/14, it is not optional
  *eventually*, and it is not MS5 — it is the one thing that would drag ODbL into the schema and
  re-open `06` §11 Q2, and it is a second dataset with its own proximity-join tuning. **MS5 therefore
  ships Tel Aviv at its measured 8/14, knowingly.** Scheduled as its own milestone before MS15's
  threshold re-fit, or cut to the Future list if the reserve is gone by then.
- **The resolution cache** (`06` §6.4). Belongs with the code that makes provider calls — MS7.
  Recorded here because it previously belonged to no milestone at all.

**Exit — all four, checkable by someone else:**
1. `inventory.sql` returns PASS 1–8 on both hosted projects with the new tables in the matrix, and
   `pg_trgm` as the *only* extension beyond the Supabase baseline.
2. The TypeScript scorer reproduces `06` §6.3 **band-for-band on all 44 cases** — 29 preselect / 12
   confirm / 3 no_match, the same case in each band, and zero false auto-accepts. A case that drifts
   preselect → confirm is a **failure**, not a pass with a smaller number: the bands are the contract.
3. The per-case scores are golden-filed against `raw-overture-scored.json`, not just the band labels,
   because the benchmark's numbers come from DuckDB's `jaro_winkler_similarity` and a TS
   implementation differing in prefix scale by a few thousandths crosses the `margin ≥ 0.05` gate that
   the zero-false-accept result rests on.
   **Met for `name_score`, `token_cov` and `cat_match` on 2026-08-19 (task 4): 220/220 rows.
   Partially deferred for the `score` column** — `raw-overture-scored.json` never recorded the
   per-row Overture `confidence` that the prototype's `0.10 · (conf or 0.5)` term read, so that one
   column is not replayable from this evidence at all (`conf = 0.5` reproduces **0 of 220** rows;
   the implied confidence spans **0.27–1.00**). It is closed in task 5/7 against
   `poi_index.dataset_confidence` loaded from the same pinned release (`2026-07-22.0`), not here, and the prefix-scale risk this criterion was written
   for is fully covered by the three columns that did replay.
   **Task 5 supplied the missing input and proved it is the right one, 2026-08-19:** the per-row Overture
   confidences are measured from the pinned release and loaded (0 of 4 997 Tel Aviv rows at the `0.5`
   default, 4 757 distinct values over 0.043–0.9996), and they reconstruct the recorded `score` on
   **71/71** in-bbox benchmark rows — 55 exact at 3 dp, 16 off by exactly 0.001, worst residual
   **0.000826**, which is inside the two-rounding bound and no row's implied confidence is 0.5. The
   column itself is asserted in task 7, against the index rather than the file, on the **57 of 71**
   rows that survive the ingest's category filter.
4. The ingest is reproducible: same pinned release in, same row counts out, recorded.

**Blocked by:** nothing. D2 sign-off closed 2026-08-18 (§4).
**Overrun:** cut to two cities, never to zero scoping — the Padella result shows unscoped search is
actively wrong. Do not cut the golden-file test to save time; it is the only thing standing between a
ported scorer and a silently different one.

#### MS5 task ledger — one task per session, in this order

Written 2026-08-19 when MS5 resumed. The ordering rule for this ledger: **the vertical slice comes
first, and infrastructure earns its place only by blocking it.** Task 7 is the milestone's real
proof — a candidate string resolving against ingested rows — and it is the thing every earlier task
exists to make possible. Tasks are sized so one session closes one row.

| # | Task | Owner | Why now |
|---|---|---|---|
| 1 | ✅ **done 2026-08-19.** **Untangle `0010` vs `0011`–`0013`.** `0010:258` drops `resolve_place` and recreates it with the provenance parameters, while `0011`/`0013` alter the pre-`0010` signature. In numeric order that is broken; on staging, where `0011`–`0013` are already applied, `0010` would revert them. Split it: `0010` keeps `pg_trgm` + the two POI tables + the four `places` columns, and the function change moves to a new `0014` that carries `0011`'s and `0013`'s bodies forward. Prove `0001`→`0014` clean on a throwaway container, `inventory.sql` + the 53 policy assertions green | `supabase-database` | Nothing else in MS5 can be applied anywhere until the migration chain applies at all. This is the one infrastructure task that is a genuine blocker |
| 2 | ✅ **done 2026-08-19.** **Declare the resolver vocabulary once.** One `PlaceResolver` port with `RankedPlace` / `ResolveResult` in `domain/`, replacing the three incompatible interfaces in `06`/`07`/`technical-design`; and give `normalise()` a legal home in `domain/` (`10` §155 puts it in `integrations/`, which the scorer cannot import — that is an ESLint error, not a preference) | `nextjs-architect` | Tasks 4 and 7 both write against these names, and MS7's adapters implement the port. Deciding it after the scorer exists means rewriting the scorer |
| 3 | ✅ **done 2026-08-19.** **Port the scorer to TypeScript** — `evidence/places/resolve-overture-scored.py` → `src/domain/places/`, weights and thresholds in **one exported constant object**. No database, no network, no React | `maps-geospatial` | The milestone's functional core |
| 4 | ✅ **done 2026-08-19.** **Golden-file the 44 cases.** Per-case scores against `raw-overture-scored.json`, not only band labels, plus band-for-band 29/12/3. Exit criteria 2 and 3. **Use `Number(x.toFixed(3))`, not `Math.round(x*1000)/1000`** — task 3 measured five rows sitting on a `.0005` boundary whose double is a hair below the half (Onibus/Yakumo `name_score` = 0.92849999999999999201, recorded `0.928`); Python's `round` and `toFixed` both round down there and `Math.round` rounds up, for five spurious diffs | `qa-reliability` | The Jaro-Winkler prefix-scale risk in the exit criteria is real; the test is what makes the port trustworthy rather than plausible |
| 5 | ✅ **done 2026-08-19.** **Ingest Tel Aviv only**, with the region scoping from `06` §6.1 step 2, against Overture release **`2026-07-22.0`** — the release `ingest-overture-city-extract.py` already hard-codes and therefore the one the 44-case benchmark was measured on. Pinning any *other* release is a scope change, not a detail: it re-measures every number in `06` §6.3. Record the row counts. **Rider from task 4:** emit the per-`overture_id` `confidence` as a `measure-dataset-confidence.py` sibling under `docs/evidence/places/`, documented in that README's table, and load it into `poi_index.dataset_confidence` rather than letting the column's `default 0.5` stand in for it — the benchmark file never recorded `confidence`, so `conf = 0.5` reproduces **0 of 220** rows and the `score` column of exit criterion 3 is unprovable without it (implied confidence spans 0.27–1.00). On the same release the values are the ones the benchmark scored with, so this closes the column in task 7 rather than merely deferring it again | `maps-geospatial` | One city is enough to prove the pipeline end to end. Tokyo and London are task 6, and are the first thing to cut. It also carries the only unmet half of an MS5 exit criterion: without the confidences task 7 can replay the ranking but not the score |
| 6 | **Ingest Tokyo and London**, same pinned release, same recorded counts | `maps-geospatial` | Cuttable per `Overrun` above |
| 7 | **The end-to-end resolve.** A thin server-side query (region scope + `pg_trgm` prefilter) feeding the ported scorer, callable from a script: candidate string in → ranked `RankedPlace[]` out, against the ingested Tel Aviv rows. Reproduce the benchmark's Tel Aviv 8/14 through the real index, and — with task 5's loaded confidences — replay the **`score`** column of the TLV rows of `raw-overture-scored.json`, the half of exit criterion 3 task 4 could not prove from the evidence file alone. **Scope correction from task 5, measured not guessed:** the benchmark scored the *unfiltered* extract, so 13 of the 66 TLV `overture_id`s — 14 of its 71 in-bbox result rows — are not in the loaded index at all, and **57 of 71 rows are replayable verbatim**. Twelve of the thirteen are correctly-dropped non-food rows; the thirteenth is TLV-13's recorded **rank-1** `I Love Sandwich` (`sandwich_shop`, 0.658). Task 7 must therefore assert per-row `score` on the 57 and account for the 14 by name — a whole-file replay will fail and the failure will look like a scorer defect. TLV-01/03/05/06/11/13/14 cannot have their full top-5 compared. Note before assuming the 8/14 is unchanged: dropping TLV-13's wrong rank-1 promotes `Sabich Frishman` (0.635) to top, which is arguably the *right* answer, and its margin becomes 0.041 — still under the 0.05 preselect gate, so the band should hold, but this is the one case where the filter can move an accuracy number and it must be reported rather than absorbed | `maps-geospatial` | **The MS5 exit that was named nowhere.** Schema, scorer and ingest can each pass their own test while the seam between them does not work; nothing before MS7 would have caught it |
| 8 | **Apply to staging, then production**, `inventory.sql` PASS on both with the new tables in the matrix and `pg_trgm` as the only extension beyond baseline. Exit criterion 1 | `devops-vercel` + `supabase-database` | Infrastructure, deliberately last: it is required by MS7's preview-deployment gate, not by anything in tasks 1–7, and applying a schema that task 7 has not yet exercised is how a hosted project acquires a shape we then have to migrate off |

**Task 1 closed, 2026-08-19.** `0010` reduced to its non-function work; `0014_resolve_place_provenance.sql`
adds the three provenance parameters on **`0011`'s audited body**, `place_survivor_id()` intact — the
body `0010` carried had inlined a single-hop `coalesce(merged_into_place_id, id)`, so applying it would
have restored `0011` defect 1. Proven on a throwaway `17.6.1.064` container, `0001`→`0014`:
`inventory.sql` 15 PASS, `0008_policy_tests.sql` 54 PASS + 1 UNPROVEN (P23), exactly one
`resolve_place` in `pg_proc`. Both failure modes were **measured, not argued** — numeric order gives
`42725 function … is not unique`, out-of-order arrival gives a silently reverted body that inventory
passed and policy test P11 caught.
Two riders taken in the same session: inventory **check 6b** (no overloads in `public`, plus
`resolve_place`'s argument list asserted positionally — checks 6 and 9c match on `proname` alone and
were blind to the overload state), policy test **P24** (provenance written on insert, not on an
alias-only match, coalesced on refresh), and `0011`'s overstated header §2. `inventory.sql` check 9 also
had a live `FAIL 9` introduced by the merge, not by `0014`; fixed.
Also corrected out of this task: [`db-migration-runbook.md`](db-migration-runbook.md) now carries the
**authoritative applied state** — staging `0013`, production `0009`, `0010`/`0014` nowhere. Its
"no `db push` has ever run" block was true when written and stale after audit task 13; task 8 is told
to trust `db:status:staging` over prose.

**Task 2 closed, 2026-08-19.** One `PlaceResolver` in [`src/domain/ports.ts`](../src/domain/ports.ts),
the vocabulary in [`src/domain/types.ts`](../src/domain/types.ts), `normalise()` in
[`src/domain/places/normalise.ts`](../src/domain/places/normalise.ts). Rulings and their reasons:
[`11-resolver-vocabulary.md`](11-resolver-vocabulary.md). `lint`, `typecheck`, `check:layers` and 76
tests green.
**Ten conflicts, not the three the row anticipated.** The ones that were defects rather than naming:
(a) `06` §8's `readonly id: 'overture-local'` **could never have been inserted** —
`place_provider_refs.provider` is `check (provider ~ '^[a-z][a-z0-9_]{1,31}$')` (0005) and the hyphen
fails it; the value is `'overture'`. (b) `09` §4.2's `categoryHint` enum has **seven** values and
`06` §6.1's `CAT_TOKENS` has **three keys, indexed directly** — `CAT_TOKENS['bakery']` is a
`KeyError`, so a literal port of the prototype crashes or silently scores 0 on four of the seven;
closed by a total `categoryHintFor()` (`bakery → cafe`, the rest → `null`). (c) `Confidence.margin`
is now `number | null`, which is what makes `10` §8's `margin = 1.0` single-candidate defect
impossible to reproduce by accident rather than merely documented. (d) `region_loaded` is closed —
the omission the 2026-08-18 review recorded — as `regionsSearched: RegionId[]` plus a `regionLoaded()`
function, and `resolveOne`, the method `06` §7.3 and `10` §2 attribute it to, **exists in no
interface anywhere**; both corrected. (e) `areaHint` dropped: no producer in `09`, no consumer in the
scorer.
`normalise()`'s home was an ESLint error as documented, **measured both ways** (`@/integrations/...`
and `../../integrations/...` both rejected) before the ruling was written; `10` §4.1 corrected. Its
port is byte-identical to the prototype on all 44 benchmark queries plus 18 adversarial cases,
pinned from a run of the unmodified Python — which incidentally proved the prototype's kept CJK range
is *not* redundant (`中華・そば` survives only because of it) and that NFKD turns `라면` into five
jamo, the behaviour 0010's 1 000-character `name_norm` CHECK was sized for. One bounded divergence is
recorded in the function header, not hidden: `\p{Mn}` is not exactly Python's non-zero combining
class.
Deliberately **not** done, so task 3 does not wait for it: no scorer, no Zod (not a dependency, and
parsing stays in MS7's adapter), and five of `07` §10's six ports are still MS6's. `domain/places/`
is **plural** — ruled, and `07` §10 and `technical-design.md` §2 corrected to match the ledger.

**Task 3 closed, 2026-08-19.** The scoring core is three files in `src/domain/places/`:
[`jaro-winkler.ts`](../src/domain/places/jaro-winkler.ts),
[`scoring-constants.ts`](../src/domain/places/scoring-constants.ts) and
[`score.ts`](../src/domain/places/score.ts), with 40 new tests. Pure as the row required — no
database, no network, no React, **no new dependency**; `scoreCandidates()` takes prefiltered rows and
`regionsSearched` as arguments, which is precisely the seam task 7 has to build. `SCORING` is the one
frozen constants object the row and `06` §6.3 both demand: the 0.45/0.55 blend, the 0.72/0.18/0.10
weights, the 0.04/0.15 penalty, the 0.97 substring credit, the 0.92/0.05/0.80 gates, the top-5
default, and `GENERIC`/`CAT_TOKENS` verbatim. Two knobs are deliberately **outside** it, with the
reason on both sides: Jaro-Winkler's prefix scale/cap/gate (compatibility with the measurement, not
calibration — tuning them invalidates the evidence rather than adjusting the resolver) and
`NORM_VERSION` (a data-migration fact).

**The Jaro-Winkler risk the exit criteria named is closed by measurement, and it was real.** DuckDB
was reachable, so the claim is VERIFIED, not ASSUMED: `jaro_winkler_similarity` pinned from DuckDB
**1.5.5** over **2 153 pairs** — every whole-string and token pair the 44 cases actually evaluate
(666 unique), 30 adversarial pairs, and 1 500 seeded fuzz pairs across Latin/Hebrew/CJK/mixed —
compared with `===` on doubles, never `toBeCloseTo`
([`measure-jaro-winkler.py`](evidence/places/measure-jaro-winkler.py),
[`jaro-winkler-duckdb.json`](evidence/places/jaro-winkler-duckdb.json)). **2 153/2 153 bit-identical**,
after four divergences a plausible-looking port would have shipped: (a) **DuckDB compares UTF-8 bytes,
not characters** — `jaro('猿田彦珈琲','猿田彦珈琲 渋谷')` is `(1 + 15/22 + 1)/3`, and a UTF-16 port
diverges *only* on the Hebrew and Japanese rows, i.e. exactly the cases `06` §7.1 already calls our
weakest; (b) **transpositions floor-divide**, not halve — wrong on 46 of the 666 real pairs, worth up
to ~0.008 of `name_score`; (c) the prefix boost is **gated at Jaro > 0.7**, scale 0.1, cap 4 bytes
(that the gate is strict `>` is ASSUMED and unreachable — 60 000 random pairs produced no Jaro equal
to the double `0.7`); (d) the boost is a **fused multiply-add** — the naive form is one ulp low on 12
of the 666 real pairs, which cannot move a band alone but can swap top-1 at the 0.000-margin cases
(The Dove) and would have surfaced as an unexplained task-4 failure.

**Verified against the benchmark independently of the porting agent:** all **220** result rows in
`raw-overture-scored.json` replayed through `nameScore`/`categoryScore` — **0 mismatches** on
`name_score`, `token_cov` and `cat_match` at 3 dp — and the pinned DuckDB values re-measured from a
fresh DuckDB 1.5.5 run on a sample including the byte-length Hebrew/CJK pairs, the 0.7-gate pair and
the one-ulp `('brat','basta') = 0.805` case, all bit-exact. That is not task 4: no golden file was
written, and its per-case/band assertions remain that row's work.

**Five divergences from the prototype, all deliberate and all in the `score.ts` header.** Two are the
defect fixes already ruled (`margin: null` rather than 1.0; no `conf or 0.5` coalesce), one is the
`CategoryHint`-only category table, one is `altNames` left unscored (the column is empty until the OSM
alias join, and scoring an always-empty array would let a future load move every benchmark number
silently). The fifth is a ruling made in this session, where the docs admitted two readings: **`margin`
and the band are computed from the full ranking, before `maxResults` truncates the shortlist.** The
prototype takes its margin from its own top-5 slice, which is defect 1 wearing a different hat — a
cap of 1 would report an unmeasured margin over hundreds of real candidates. `types.ts` corrected to
match; at the default cap of 5 the two readings coincide, so the benchmark is untouched.

Smaller findings, each pinned as a test rather than argued: `0.72 + 0.18 + 0.10 === 0.9999999999999999`
in binary, so a perfect match scores a hair *under* 1 — the safe side of `places.resolution_score`'s
`between 0 and 1`, and asserted so a re-fit that breaks the sum is caught; the margin gate is
float-exact, so `0.95 − 0.90 = 0.04999999999999993` does **not** clear `≥ 0.05`, and nothing rounds
before the comparison; Python's `len(t) > 1` counts code points, so the distinctive-token filter uses
`Array.from(t).length`; and the prototype's tuple sort continues into a possibly-`None` `category`,
which *raises* in Python — an ordering that cannot be relied on is not an ordering, so the comparator
stops at the name and adds `providerPlaceId` to make the sort total.

**One documentation defect found and corrected in `06` §6.1 step 4:** it credited the 0.97 substring
rule with rescuing prefixed names such as `פלאפל הקוסם`, which it cannot — that name tokenises on the
space, so `הקוסם` is an *exact token* match at 1.0 and the credit never fires. (TLV-07's query is
`הקוסם` alone, and the falafel row is one of §6.3's three absent-from-dataset misses regardless.) The
rule stands on the agglutinated case, `CafeXoho`.

**Deferred past MS5, from the `ms5-design` row list in [`ms1-ms4-audit-handoff.md`](ms1-ms4-audit-handoff.md).** None of them block the vertical slice, and each is recorded so it is not lost:

- `inventory.sql` check 1's table count, and `0011`'s overstated header §2 → the next session that
  touches `inventory.sql`, i.e. task 1 or task 8, as a rider.
- The `pg_trgm`-in-`extensions` rationale being factually wrong (`0010:22`, `inventory.sql:214`) —
  no exposure, the PASS merely overstates its scope → **MS14**, with the security document.
- `06` §8's vanished `MapSurface` seam and its unenforced `maplibre-gl` import rule → **MS10**, the
  milestone that first imports a map library.
- The `technical-design` §16 trigram contradiction, the plan's own arithmetic (§6 vs §15), the
  "ledger has no open row" contradiction (§65), the `0001–0008` migration lists (§117, §198) and the
  six-vs-nine table count in §7 → one documentation-sync session, taken **between MS6 and MS7**,
  because §7 is M3-graded and must be right before the MS7 gate is written up.
- The streaming/`maxDuration = 60` duration probe → **MS7**, whose exit criterion rests on it.
- **The food-and-drink category filter needs a ruling, not an edit** (found and measured in task 5, `06` §7.4, `10` §7.1). It is wrong at both margins: its substring patterns admit **377 non-food rows** (7.5% of the Tel Aviv load — `%bar%` → `barber` 168, `%pub%` → `public_and_government_association` 69, `public_relations` 51, `public_plaza` 44) and it drops genuine food categories (`delicatessen` 96, `butcher_shop` 86, `lounge` 36, `candy_store` 30, `sandwich_shop` 27, `chocolatier` 18, `gelato` 8). Two of those, `deli` and `lounge`, are tokens in the scorer's own `CAT_TOKENS`, so those tokens **can never fire on loaded data**. Task 5 left the list verbatim, which was correct: re-cutting it moves `06` §3.1's storage model and re-measures every §6.3 number, and doing that inside an ingest task would have destroyed the benchmark comparison the milestone exists to make. → **the OSM-alias/threshold-re-fit milestone before MS15**, which is already the session that re-measures §6.3 and can afford to move these numbers. Cut to the Future list with the alias join if the reserve is gone.
- The `10-` number collision (`10-poi-index.md` vs MS15's reserved `10-pipeline-evaluation.md`) →
  renamed when MS15's document is created, not before; renaming now invalidates live cross-references.

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

### MS8 — Auth, shell, tokens (D9a), the persistent map layout · M (2 hd)
Supabase Auth per D8; the `(map)` route group; **the token values authored (D9a)**; the module-scope
map singleton and the `sessionStorage` camera mirror from `07` §11 step 5.
**Exit — both:**
1. `/map` → `/place/[id]` → back → `/import` → back leaves `getCenter()`/`getZoom()` unchanged.
2. Every token named in `ux-architecture` §10 (motion durations and easings) and §11.6 (the accent,
   against the contrast constraint) has a value, in one file, referenced by nothing hard-coded.
**Also settled here, at no cost in size:** the **product name**. It has never been decided, the
project is called `P-002`, and MS8 is the first milestone that puts a word in a shell header — and
MS16's deck and the §20 submission link both need the product to be called something. A name, not an
identity system: no wordmark, no logo, no icon set. Those stay out of scope per Charter §4.
**Overrun:** the shell and the singleton are never cut; the token set narrows to the tokens the MS9
screens actually consume.

### MS8b — The forked Protomaps style (D9b) · M (2 hd)
Charter §6 rests on *the map style is the brand*, and `06` chose Protomaps' CC0 style specifically so
the fork would be ours to own. That fork was named in two places and sized in neither — §10 item 1
put it beside the tokens in MS8, and MS10's detail listed it as MS10 work. It is now its own slot,
positioned after MS8 because it is authored **against** the tokens, and before MS10 because MS10's
pins and clustering are judged on top of it.
**Exit — both:**
1. The forked style renders at the three zoom bands the camera rules use, on the MS2 production URL,
   with one attribution string and no vendor logo.
2. A pin at the §11.6 accent passes the contrast constraint **on top of the fork**, measured, not
   asserted — this is the check the two-in-one-milestone version could never have run, because the
   accent and the surface it sits on were being authored at the same time.
**Overrun:** ship the upstream Protomaps style unforked with only the palette swapped, and record the
gap. This is a **new cut candidate**, added to §16 at order 2b.

### MS9 — Import UI · L (4 hd)
Paste screen, the three-stage rail consuming `ImportEvent`s with minimum-dwell pacing, the review and
disambiguation sheet (N candidates, preselect/confirm/no_match bands rendered per `06` §6.2), the
designed failure states (F9/F10) with their three recoveries — retry, open the original, add a known
place — and the `confirmImport` action.
**Exit:** an import of a real multi-place TikTok saves the right rows, and a `NO_PLACES_FOUND` post
lands on F10 without the word "error" anywhere on screen.
**Overrun:** the disambiguation sheet is never simplified; the rail's motion is.

### MS10 — Map and retrieval · L (4 hd)
Custom pins, `cluster:true` GeoJSON source, the four authorised camera
movers, place detail with the link back to the source TikTok, geolocation and "what did I save near
me" over the bbox + Haversine query. The style itself is **MS8b**, not here; the size stays L (4)
because the fork was never costed inside it.
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
  canonicaliser *is* the boundary); the OSM alias share-alike question → **not** before MS5, which
  ingests no ODbL data, but before the first PR that adds an OSM alias or a Nominatim write path
  (`06` §11 Q2).
- **Answer with the code**: caption-retention TTL, cached-source GC on user deletion, the
  `imports.candidates` grant, the tile-key posture, concrete rate limits — MS7 and MS11.
- **Collect and write up**: the M9 document and QA's pre-submission checklist — MS14.

The Security veto on data exposure (Charter §9) stands over every one of these; a milestone is not
complete while it holds an unanswered ⚠.

## 15. Effort budget and reserve

**44 hd** of estimated work against 38 hd of capacity does not fit, and pretending otherwise would
be the most dangerous sentence in this document. (42 hd until 2026-08-18, when MS5 was re-sized 3 → 5
on review.) The reserve is therefore taken from scope, not from time:

- **MS11, MS12 and MS15 (5 hd combined) are the declared reserve.** If MS7 or MS9 overrun, they
  are consumed in the cut order of §16 before anything in the never-cut list is touched.
  **2 hd of it is already spent:** MS5 was re-sized 3 → 5 hd on 2026-08-18, when the review found
  it had been scoped as "port a scorer" while actually being "design a schema, migrate, ingest,
  port a scorer" — the POI index table was named in `technical-design.md` §130 and never designed.
  Spending the reserve deliberately at the point the estimate was found wrong is the intended use;
  discovering it mid-milestone is not. **3 hd of reserve remains.**
- **MS16's polish component (2 hd of the 4) is the second reserve.** The documents inside MS16 are
  graded; the motion is not.
- That was **7 hd of recoverable scope**, of which **5 hd remains** after MS5's re-size. 46 hd less
  5 hd is **41 hd against 38 available** — so the plan does not fit even after cutting everything
  currently declared cuttable, by **roughly three half-days**. This is recorded rather than smoothed
  over, because it is the whole point of keeping the budget honest: **the next overrun of any size
  forces a new cut decision, not a new reserve.**
- **That decision is now due, and this edit is what made it due.** On 2026-08-19 D9 was split and the
  Protomaps fork given its own 2 hd slot (MS8b), taking the estimate 44 → 46 hd. The 2 hd is not new
  work — it is work that existed in two milestones' prose and in neither milestone's size — but
  naming it moves the deficit from ~1 hd to ~3 hd, and a deficit that large is no longer absorbable
  by rounding. The candidates, in the order §16 would take them: **MS8b's own overrun clause** (ship
  the unforked style with a palette swap, 2b), **MS10's near-me feature**, **MS9's third
  failure-state recovery**. None is chosen here — choosing is the owner's call, and it is owed before
  MS8 starts rather than when MS10 is already late.

## 16. Cut lines, mapped onto milestones

Applied strictly top-down, from `product-specification.md` §8.1:

| Order | Cut | Milestone it comes out of |
|---|---|---|
| 1 | Any second source platform | already Deferred (MS1 records it) |
| 2 | Motion moments 3, 4, 5 | MS16 polish |
| 2b | The Protomaps **fork** → upstream style with the palette swapped | MS8b |
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
| 2026-08-18 | **MS4 complete.** Nine migrations applied to staging and production and verified there by `inventory.sql` (`PASS 1`–`8` on both, each run naming its own target); exit criteria P1/P2 green in CI. Five schema defects found and fixed: the `resolve_place` concurrency race (by review), two trigger functions referencing an unassigned record (by executing locally — one would have failed *every* `places` insert at COMMIT), `authenticated` holding UPDATE/DELETE/**TRUNCATE** on three tables from hosted default privileges (by executing against a hosted project — TRUNCATE ignores RLS, so it was a path to wiping every user's rows), and `anon`-callable `save_place` (EXECUTE defaults to `PUBLIC`). Two controls added beyond the milestone: `scripts/check-migration-grants.sh` in CI, and `inventory.sql` as the read-only check that may be pointed at production |
| 2026-08-18 | **MS5 reviewed before it started, and unblocked.** The review found three blockers and four porting risks. (a) D2's sign-off was gating MS5 as an undifferentiated block of seven questions; it is closed by splitting it — Q1 answered and its `NOTICE` shipped, Q2 narrowed to the first PR that writes an ODbL-derived row, which MS5 is not, and made enforceable by a `source_dataset` constraint rather than a promise. (b) The POI index table was named in `technical-design.md` §130 and never designed, so MS5 began with a schema decision disguised as an implementation task; design first, in `10-poi-index.md`. (c) `06` §5 sized POI storage "with a trigram index" while §11 of this plan said "No extensions" and `inventory.sql` check 8 enforced it — decided in favour of `pg_trgm`, D6 scoped to the geometry question it actually answered, and check 8 turned from a soft NOTE into an allow-list FAIL. Also found: four columns `06` promised that MS4 never shipped, the resolution cache belonging to no milestone, and `region_loaded` missing from the §6 output type it appears in. MS5 re-sized 3 → 5 hd from the reserve; §15's arithmetic restated honestly — the plan is now ~1 hd over even after every declared cut |
| 2026-08-18 | **MS5 step 1: the POI index designed and migration 0010 written.** [`10-poi-index.md`](10-poi-index.md) approved with all four of its §12 questions ruled as recommended. `0010_poi_index.sql` delivers `poi_regions` + `poi_index`, `pg_trgm`, the three seed regions, the four `places` columns `06` promised, and a **dropped-and-recreated** `resolve_place` — dropped rather than replaced because adding defaulted parameters creates an overload, and every existing 12-argument call would then fail as *not unique* at run time in the import path. Three decisions were made during implementation and are recorded in `10`: `pg_trgm` installs into `extensions`, not `public`, because in `public` its ~10 functions would each arrive `EXECUTE`-able by `PUBLIC` and break inventory check 6 a dozen times over; `norm_version` moved to `poi_regions`; and the seed rows must be inserted **before** `FORCE ROW LEVEL SECURITY`, which applies to the owner too on a table with no policy. One review claim was wrong and is corrected: the resolution cache table already existed as `place_lookups` (0007). **The migration has not been executed** — Docker unavailable locally, so no `supabase db reset`; CI's `database` job is the first real test |
| 2026-08-18 | **0010 owned, corrected and executed by `supabase-database`** — the first task routed to a specialist rather than implemented centrally, which is now the standing rule. It found Docker running (the coordinating session had wrongly concluded otherwise from a timed-out `docker info`) and executed everything: seven defects, five of them findable only by running it. The two that mattered: **`service_role` had no explicit grant on either new table** — reaching them only through the `supabase_admin` default privileges that are deprecated and removed 2026-10-30, because BYPASSRLS skips the policy check and not the privilege check, which would have failed in the import path on a hosted project at run time; and **`name_norm` capped at 300** would reject legal Korean and Japanese names, since NFKD *decomposes* (a 300-character Hangul string measures 900 after normalisation) and one such row would take a whole 35 k-row COPY down. Also: `create schema if not exists` is not a safe no-op (Postgres checks CREATE on the database first), the seed-before-FORCE justification was false though the ordering stays, and a latent lng-before-lat column order in the seed. Verified independently from a clean container: `PASS 1`–`8`, 19/19 policy assertions. One claim was **not** confirmed on re-run — the combined prefilter's plan flipped between `Seq Scan` and `BitmapOr` on identical data, so index use is a cost decision to be re-measured on the real extract, not a property to write down |
| 2026-08-18 | §20 submission checklist audited against reality: artefacts 2 (repo, ⚠ private) closed; 1 and 9 annotated with what already exists and what still gates them |
| 2026-08-19 | **MS5 task 1: the `0010` vs `0011`–`0013` collision untangled.** `0010` dropped and recreated `resolve_place` with the provenance parameters while `0011`/`0013` altered the pre-`0010` signature: broken in numeric order, and on staging — where `0011`–`0013` are already applied — `0010` would have reverted them. `0010` is now reduced to its non-function work and `0014_resolve_place_provenance.sql` adds the three parameters on **`0011`'s audited body**, `place_survivor_id()` intact; the body `0010` carried had inlined a single-hop `coalesce(merged_into_place_id, id)` and applying it would have restored `0011` defect 1. Both failure modes were **measured, not argued**: numeric order gives `42725 function … is not unique`; out-of-order arrival gives a silently reverted body that `inventory.sql` passed and only policy test P11 caught. Proven `0001`→`0014` on a throwaway `17.6.1.064` container: inventory 15 PASS, policy 54 PASS + 1 UNPROVEN (P23), exactly one `resolve_place` in `pg_proc`. Riders taken: inventory **check 6b** (no overloads in `public`, `resolve_place`'s arguments asserted positionally — checks 6 and 9c matched on `proname` alone and were blind to the overload state), policy test **P24**, `0011`'s overstated header §2, and a live `FAIL 9` the merge had introduced. [`db-migration-runbook.md`](db-migration-runbook.md) now carries the authoritative applied state — staging `0013`, production `0009`, `0010`/`0014` nowhere |
| 2026-08-19 | **D9 split, and the map style given a milestone of its own.** The visual half of the product was scheduled in a way that could not have been executed as written: §10 item 1 put the forked Protomaps style beside the tokens in MS8's 2 hd, MS10's detail listed the same fork as MS10 work, and `ux-architecture` §13.1 Q2 had asked outright which of tokens and style lands first — the question the double-booking answered by ignoring. D9 is now **D9a** (token values, MS8) and **D9b** (the fork, the new **MS8b**), ordered tokens → style because the style is authored against the palette, and MS8b's second exit criterion is the contrast check that the simultaneous version could never have run: an accent measured *on top of* the surface it sits on. MS10 loses the style from its prose and keeps L (4), because the fork was never costed inside it. **The honest consequence is in §15:** the estimate goes 44 → 46 hd and the deficit-after-every-declared-cut goes ~1 hd → ~3 hd, which fires §15's own rule that the next overrun forces a cut decision. Candidates named, none chosen — that is the owner's call and it is owed before MS8 starts. One new cut line at order 2b (ship upstream Protomaps with a palette swap). Also settled into MS8 at no cost in size: **the product name**, which no milestone had ever owned while MS16's deck and the §20 submission link both assume one. A name only — wordmark, logo and icon set stay out of scope per Charter §4. Unchanged and deliberately so: UX (IA, the eleven flow states, failure states, accessibility) and product voice (the §12 copy deck) were complete before MS4 and are not milestones; what remains open there is `ux-architecture`'s own review chain, whose §13 questions are now partly answered by D3, D12 and MS4 and have never been written back |
| 2026-08-19 | **MS5 task 2: the resolver vocabulary declared once, in code.** `06` §8, `07` §10 and `technical-design.md` §6.3 each declared a `PlaceResolver` and no two agreed; `RankedPlace`/`ResolveResult` were used in three documents and defined in none. Now one port and one vocabulary in `src/domain/`, with [`11-resolver-vocabulary.md`](11-resolver-vocabulary.md) holding all ten conflicts and their rulings. Three were defects, not naming: `06`'s `'overture-local'` violates `place_provider_refs.provider`'s CHECK and could never have been inserted; `09`'s seven-value `categoryHint` enum against `06`'s three-key `CAT_TOKENS`, indexed directly, is a `KeyError` on four of seven — a literal port of the prototype would crash or silently score 0; and `resolveOne`, the method `06` §7.3 and `10` §2 hang `region_loaded` on, exists in no interface in the repository. `region_loaded` itself — the omission the 2026-08-18 review found and nothing had closed — is now `regionsSearched` + a `regionLoaded()` function, and `Confidence.margin: number \| null` makes `10` §8's single-candidate margin defect impossible to reproduce silently. `normalise()` moved from `integrations/` to `domain/places/`: `10` §4.1 as written was an ESLint error, measured in both import forms, and its port is byte-identical to the prototype on all 44 benchmark queries plus 18 adversarial cases. `search()` is gone — with one input and one output type it was `resolve()`'s signature twice. Deliberately not done: the scorer (task 3), Zod (MS7's adapter boundary), and five of the six ports (MS6) |
| 2026-08-19 | **MS5 task 3: the scorer ported to TypeScript, and its one real risk closed by measurement.** `06` §6.1 steps 4–5 and §6.2 are now [`score.ts`](../src/domain/places/score.ts), [`jaro-winkler.ts`](../src/domain/places/jaro-winkler.ts) and one frozen `SCORING` object ([`scoring-constants.ts`](../src/domain/places/scoring-constants.ts)) in `src/domain/places/` — pure, no database, no network, no React, no new dependency, 40 new tests, `npm run verify` green. **The Jaro-Winkler prefix-scale risk the MS5 exit criteria named was real, and it was four risks, not one.** DuckDB was reachable, so the claim is VERIFIED: `jaro_winkler_similarity` pinned from DuckDB 1.5.5 over **2 153 pairs** (every pair the 44 cases actually evaluate, plus adversarial and 1 500 fuzz pairs across Latin/Hebrew/CJK) and compared with `===` on doubles — **2 153/2 153 bit-identical** only after finding that DuckDB compares **UTF-8 bytes, not characters** (a UTF-16 port diverges precisely on the Hebrew and Japanese rows `06` §7.1 already calls our weakest), that transpositions **floor-divide** rather than halve (wrong on 46 of 666 real pairs), that the prefix boost is **gated at Jaro > 0.7** with a 4-byte cap, and that the boost is a **fused multiply-add** — the naive form is one ulp low on 12 real pairs, enough to swap top-1 at the 0.000-margin cases and surface later as an unexplained task-4 failure. Verified independently of the porting agent: all **220** result rows of `raw-overture-scored.json` replayed through the port with **0 mismatches** on `name_score`/`token_cov`/`cat_match`, and the pinned values re-measured from a fresh DuckDB run. One genuine ruling where the docs allowed two readings — **`margin` and the band come from the full ranking, before `maxResults` truncates the shortlist**, because the prototype's margin-from-top-5 is the `margin = 1.0` defect wearing a different hat; `types.ts` corrected, benchmark unaffected at the default cap of 5. Also corrected: `06` §6.1 step 4 credited the 0.97 substring rule with rescuing prefixed names (`פלאפל הקוסם`), which tokenise on the space and match at 1.0 — the rule stands on the agglutinated case only. Task 4 is handed the one fact that would otherwise cost it a session: round with `toFixed(3)`, not `Math.round(x*1000)`, or five `.0005`-boundary rows diff spuriously. Deliberately not done: the golden file (task 4), the prefilter and the seam (task 7), and `altNames` scoring (the column is empty until the OSM alias join, and scoring an always-empty array would let a future load move every benchmark number silently) |
| 2026-08-19 | **MS5 task 4: the 44 cases golden-filed, and one exit criterion sent back with its measurement.** [`tests/unit/places/benchmark-golden.test.ts`](../tests/unit/places/benchmark-golden.test.ts) replays all **220** recorded rows of `raw-overture-scored.json` through the port and bands all 44 cases through `confidenceOf()`; 17 new tests, 133 in total, `npm run verify` green. **Exit 3 met on `name_score`/`token_cov`/`cat_match`: 220/220** under `Number(x.toFixed(3))`, and the `.0005` boundary task 3 handed over is now a test rather than a comment — `Math.round(x*1000)/1000` breaks exactly five rows, pinned by name (Onibus Yakumo, KOFFEE MAMEYA Kakeru ×2, Bar Termini Centrale, The Andover Arms). **Exit 2 met: 29/12/3, asserted per case and not only tallied**, and zero false auto-accepts **checked against `adjudication.json`'s hand verdicts** rather than asserted — all six non-OK cases sit outside `preselect`, all 29 preselected are OK. Rounding cannot have moved a band: the closest approach to any gate is 0.004, eight times the file's ±0.0005, and the bands are identical under both readings of the recorded margin. **The genuine finding is that exit 3's `score` column is not provable from this evidence and was not papered over.** The prototype's `0.10 · (conf or 0.5)` term reads a per-row Overture `confidence` the file never recorded: `conf = 0.5` reproduces **0 of 220** rows (TYO-01 computes 0.937 against a recorded 0.987) and the implied per-row confidence spans **0.270–1.00**, so `0010`'s `dataset_confidence default 0.5` is a fact about our table and not about what was measured. What *was* provable about `score` is now tested: the **27 `overture_id`s that appear in two different cases** carry the same unrecorded confidence in both, so it cancels, and `Δscore = 0.72·Δname_score + 0.18·Δcat_match` holds on 27/27 (18 of them informative) to a worst deviation of **0.00088**, inside the two-rounding bound — which pins the 0.72/0.18 weights and our `name_score` against the recorded `score` column without inventing a confidence. Deferred, with a rider on task 5 to emit the confidences and close it in task 5/7. Not trusted on sight: four deliberate mutations (`whole` 0.45→0.46, `preselectMargin` 0.05→0.04, `substringCredit` 0.97→0.95, and `PREFIX_SCALE` 0.1→0.11 — the exact risk exit 3 was written for) each failed 3–4 tests. Also recorded as untested rather than passed: the full ranking and its tie-breaks (the file holds only each case's top-5 of an 18–2 904-row prefilter, and re-sorting needs the same missing confidence), divergence 2 (indistinguishable at the default cap of 5), and divergence 1 — **no case records `margin_top1_top2 = 1.0`**, so the prototype's single-candidate defect never fires here and the green must not be read as validating that ruling. One doc defect found and fixed out of the task: `06` §6.3 called the `no_match` trio "2 absent, 1 mis-ranked" where `adjudication.json` makes it 1 absent (TLV-02) and 2 mis-ranked (TLV-10, TLV-13) — the second ABSENT case, Orna and Ella, is in `confirm`. Bands and counts unaffected |
| 2026-08-19 | **MS5 task 5: Tel Aviv ingested from the pinned release, and the confidence the `score` column needed is now a measured fact.** `scripts/ingest-overture-extract.py` + `scripts/load-poi-region.ts` + `scripts/ingest-poi-region.sh` over one `scripts/poi-ingest.config.json`, promoted from evidence per `10` §7: DuckDB extracts and filters, TypeScript normalises through the **same** `normalise()` the resolver uses with `norm_version` read from `NORM_VERSION` rather than re-typed, psql runs the single reload transaction. **Counts, for exit criterion 4: 35 430 raw → 4 997 food-and-drink (14.1%, inside `06` §7.4's 14–35%) → 4 997 loaded**, 0 rejected, reload idempotent, and the raw 35 430 independently matches `06` §153's recorded Tel Aviv count — which is a second, unplanned confirmation that the release pin is the release the benchmark was measured on. Both guards exercised in both directions: a release mismatch and a bbox mismatch each refuse and write nothing. **The task-4 rider is closed, not deferred again.** `measure-dataset-confidence.py` pins the per-`overture_id` Overture `confidence` and the loader writes it: **0 of 4 997 rows sit at the column's `default 0.5`**, and the measured values reconstruct the recorded `score` on **71/71** in-bbox benchmark rows — 55 exact at 3 dp, 16 off by exactly 0.001, worst residual **0.000826**, no row implying 0.5. Verified independently of the ingesting agent by re-deriving all 71 from `raw-overture-scored.json` and the confidence file. So exit criterion 3's `score` column has its input and task 7 can assert it. `10` §4.3's owed half also closed: `normalise()` is byte-identical to the prototype on a 1 000-name sample of *ingested* names, 613 non-ASCII and 590 Hebrew, 1 000/1 000. **Three documented numbers were contradicted by measurement.** (a) `06` §7.4's "the Tel Aviv extract is 43% lawyers, estate agents and professional services" is **not reproducible** — those categories are 3 659 of 35 430 = **10.3%**, a generous grouping reaches 16.8%, and the defensible form of the same point is that **85.9% of raw is not food and drink**; corrected in `06` §7.4 and `10` §7. (b) The category filter is wrong at both margins: **377 non-food rows admitted** (`%bar%` → `barber`, `%pub%` → `public_plaza`) and real food categories dropped (`delicatessen` 96, `sandwich_shop` 27, `lounge` 36, …), two of which — `deli`, `lounge` — are `CAT_TOKENS` that therefore **can never fire on loaded data**. Left verbatim, correctly: re-cutting it re-measures every §6.3 number, so it is deferred to the milestone that already does that, with the numbers recorded. (c) Consequently **14 of the 71 TLV benchmark rows are not in the loaded index**, including TLV-13's recorded rank-1 `I Love Sandwich`; task 7's replay is **57 of 71** and its row now says so, because a whole-file replay would fail looking exactly like a scorer defect. One infrastructure fact recorded that had been costing sessions silently: on a bare `17.6.1.064` container `auth.uid()` reads the legacy `request.jwt.claim.sub` while `0008_policy_tests.sql` sets the modern `request.jwt.claims`, so the suite aborts at the first `save_place()` and every later assertion reports "current transaction is aborted" — which reads as a policy failure and is not one; with a two-line shim it is task 1's 54 PASS + 1 UNPROVEN. `npm run verify` green, 136 tests, `inventory.sql` 15 PASS and the policy suite green both before and after the load. Deliberately not done: Tokyo/London (task 6), the resolve seam and the `score` assertion itself (task 7), staging/production (task 8), `alt_names` |
| 2026-08-20 | **Re-planned by product level; this document's ladder retired.** The owner asked for a course-MVP plan for "links from social media → a map with info", sized by product level rather than by days, and the request landed on a plan whose own §15 had been arguing for two days that it did not fit: 46 hd against 38, ~3 hd over *after* every declared cut, and by 2026-08-20 two days of that capacity gone with **no application code in `src/` beyond the resolver and `/healthz`**. Sizing in half-days was measuring effort we cannot verify instead of product we can see. [`mvp-plan.md`](mvp-plan.md) replaces the ladder with four levels — L0 walking skeleton, **L1 the course MVP and the submission target**, L2 product-grade, L3 post-course — under one rule: every level is submittable, and they are climbed one at a time. Nothing is discarded: MS5 task 7 → L0 step 2, task 8 → L0 step 4, task 6 → L2; MS6/MS7 → L0 steps 1/3/5; MS8–MS14 collapse into L1's eight steps; MS8b, MS10's near-me, MS11's category filter, MS12 and MS15 → L2. The MVP boundary is now three decisions instead of a feature count: one link in one field, **TikTok only** (the sole VERIFIED mechanism — Instagram/YouTube links become a recognised redirect to manual add, not a failure), and "info" fixed at name · category · coordinates · source link · note, which is exactly what open data permits us to store forever. Two never-cut items are named for reasons this plan had left implicit: the review step (Charter §3 invariant 2) and manual add + delete, which is simultaneously the course's CRUD evidence and the no-places recovery. §16's cut list is replaced by a shorter one scoped to L1 |
| 2026-08-20 | **D2b — the MVP resolves places globally.** The owner rejected one-city resolution as an MVP boundary. Recorded in full in [`mvp-plan.md`](mvp-plan.md) §11 and added to §3's ledger; `06` §0 amended and its §11 **Q2 re-opened** by its own re-entry condition. The reason this is an amendment and not a re-architecture is that the global path was designed here and merely scheduled late: `06` §0 had already chosen Nominatim as the out-of-region fallback, `domain/types.ts` already declares `'nominatim'` and `'osm-nominatim'`, `places` already carries the provenance columns `0014`'s `resolve_place()` writes, and `09` §3's extraction contract already emits `cityHint`/`countryHint` — the missing piece is one adapter. Global Overture ingest was rejected on measurement (2–3 GB and hours, and it still needs an OSM gazetteer to be *correct*, per `06` §209's unscoped-search result) and credentialed APIs on licensing (`06` §3, unchanged). Three costs are now tracked with owners rather than left to be discovered: 63% top-1 outside loaded regions with all five benchmark misspellings returning nothing, the ≤1 rps / ~200-per-day ceiling against 210 theoretical lookups for one user, and the ODbL sign-off owed before the write path merges. One ruling is deliberately left to measurement inside the adapter's own step: the scorer's `0.10 · confidence` term has no Nominatim input, and its analogue must be chosen by re-running the 41 adjudicated cases to keep zero false auto-accepts — so the 44-case bands are proven for the local path only until then |
