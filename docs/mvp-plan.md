# MVP Plan — "paste a link, get it on your map"

> Owner: Product Lead + Architect. Date: **2026-08-20**. Status: **the MVP plan of record.**
>
> Written at the owner's instruction on 2026-08-20: *plan the course MVP for the idea "put links
> from social media → get it on a map with info", and **size it by product level, not by days**.*
>
> This document supersedes [`implementation-plan.md`](implementation-plan.md) **as the ordering
> authority**. That document keeps its value and is not deleted: its decision ledger (§3), its
> architecture answer (§7), its migration order (§8) and its build order (§9, §10) are all still
> binding inputs. What it no longer supplies is the *ladder* — 46 half-days against a capacity that
> has since shrunk by two days, with no application code yet written, is not a plan that can be
> executed. Levels replace half-days.
>
> Scope contract remains [`00-project-charter.md`](00-project-charter.md) §4. The graded contract
> remains [`03-university-requirements.md`](03-university-requirements.md). Deadline: **6 September
> 2026**.

---

## 1. Why levels instead of half-days

The previous plan sized 17 milestones in half-days and then had to keep proving, in its own §15,
that the sum did not fit. Two half-days of estimate error anywhere turned into a re-negotiation of
the whole ladder. That accounting was honest and it was also the wrong instrument: it measured
*effort we cannot verify* instead of *product we can see*.

A level is defined by **what a person can do with the product**, and is therefore checkable by
someone who is not the builder. The rule that replaces the effort budget:

> **Every level is submittable.** If work stops the moment a level closes, what exists is a coherent
> product and a coherent submission — never a half-built one. Levels are climbed in order and never
> in parallel.

Effort estimates are gone from this document on purpose. The order, the exit criteria and the cut
lines are the commitments.

## 2. The MVP, restated precisely

> A signed-in user pastes a link to a social-media post. The product reads the post, finds the real
> places it recommends, puts them on the user's private map, and keeps the link to the post that
> recommended them.

Three words in that sentence are load-bearing, and each is a decision:

**"a link"** — one URL in one field. No file upload, no screenshot, no caption typed by the user
(Charter §2 corollary 2), no share-sheet integration (Charter §7.6 — a web app cannot appear in the
iOS share sheet, and pretending otherwise designs a flow that cannot exist).

**"social-media post"** — at MVP level this means **TikTok, and only TikTok**. That is not a
narrowing of the idea, it is the only platform whose content access is VERIFIED
([`04-tiktok-feasibility.md`](04-tiktok-feasibility.md): full caption of an arbitrary public post,
server-side, no auth, no key, 16/16, p90 626 ms). Instagram and YouTube were investigated to a
Deferred verdict in [`05-secondary-platforms.md`](05-secondary-platforms.md) and stay Deferred. The
consequence is a **product decision, not an error path**: a pasted Instagram or YouTube URL is
recognised, named, and answered with "we only read TikTok links today — you can add this place by
name instead", which lands the user on the manual-add path rather than on a failure.

**"anywhere"** — the MVP resolves places **globally**, decided 2026-08-20. This is not a new
architecture: `06` §0 already chose "out-of-region fallback: **Nominatim**, hard-capped and cached,
ODbL-attributed", and `src/domain/types.ts` already declares `PlaceProvider = 'overture' |
'nominatim'` and `SourceDataset = 'overture-places' | 'osm-nominatim'`. What changes is *when* —
that fallback moves from "MS7 at the earliest" into the MVP core, and the resolver becomes
**two sources behind one port**: the Overture index where a region is loaded (measured 85% top-1),
Nominatim everywhere else (measured 63%). The candidate's `cityHint` / `countryHint`, which the
extraction contract already emits (`09` §3), is what scopes the global query — and scoping is a
*correctness* requirement, not a performance one: `06` §209 measured that an unscoped lookup ranks
confidently wrong answers. Recorded as **D2b** in §11 below.

**"with info"** — a saved place carries: its real name, its category, its coordinates, the link back
to the post that recommended it, and the user's own note. Nothing else. Opening hours, photos,
ratings, price level and reviews are not in the MVP and are not in V1 — we hold open data
([`06-map-and-places-decision.md`](06-map-and-places-decision.md) §1), and the reason we hold it is
that we may store a name and coordinates *forever*, which is exactly the information above.

**The honest capability claim.** At the verified access level, roughly **27%** of genuine
recommendation posts name a place that our resolver can find (`04`, D1 product outcome LEVEL B).
The modal outcome of an import is therefore *no place found* (~73%), and the MVP is designed around
that fact rather than in spite of it: "no places in this post" is a **normal outcome with a
designed screen and a manual-add recovery**, never an error. Any level whose demo only works
because the presenter picked the good posts is not passing its exit criteria.

## 3. What already exists and carries into the MVP

This is the part the previous plan's arithmetic obscured: a large amount of the hard work is done,
and none of it is wasted by re-levelling.

| Asset | State | Used by |
|---|---|---|
| Repo, TS strict, four-layer ESLint enforcement, CI, Vitest + Playwright | **done** (MS2) | every level |
| Two Supabase projects + Vercel, production URL live, `/healthz` green | **done** (MS2) | L0, L1 |
| Nine migrations applied to staging **and** production, RLS forced, 54 policy assertions | **done** (MS4) | L0, L1 |
| Migrations `0010` + `0014` (POI index, `pg_trgm`, provenance columns) | written, proven on a container, **not applied to either hosted project** | L0 step 4 |
| Resolver vocabulary, ported scorer, 44-case golden file (136 tests green) | **done** (MS5 tasks 2–4) | L0 step 2 |
| Tel Aviv POI index — 4 997 food-and-drink rows, pinned release `2026-07-22.0`, per-row confidences measured | **done** (MS5 task 5), loadable by script | L0 step 2 |
| The global resolution path — provider chosen (`06` §0), provider/dataset enums declared in `domain/types.ts`, `places` provenance columns and `resolve_place()` writes, `cityHint`/`countryHint` in the extraction contract | **designed, not built.** No adapter exists | L0 step 3 |
| TikTok caption access | **VERIFIED** with committed evidence | L0 step 1 |
| Product spec, technical design, UX architecture, copy deck, five decided-and-recorded provider decisions | **done** | L1 documents |
| Application code — auth, UI, map, pipeline | **none exists** | L0, L1 |

Read that last row against the rest: **the design work is finished and the product does not exist
yet.** Every level below is about closing that gap in the order that keeps a submittable product at
every stop.

## 4. The levels

| Level | What a person can do | Submittable as | Status |
|---|---|---|---|
| **L0 — Walking skeleton** | Nothing, in a browser. A script turns a real TikTok URL into real saved rows in the real database, through the real pipeline. | Nothing on its own — L0 is the proof that the product is possible, one layer below the UI. | next |
| **L1 — The course MVP** | Sign in, paste a TikTok link, watch it being read, confirm the places it found, see them on a map, open one and get back to the post, add a place by name, delete it, find it again in a list. On a public URL, from a phone. | **The submission.** All ten M12 artefacts, all twelve M1–M12 requirements. | the target |
| **L2 — Product-grade** | The same product, but it feels like software someone paid for: our own map style, clustering, near-me, onboarding that lands the first places, more than one city, motion. | A better-graded version of the same submission. | only if L1 closes early |
| **L3 — Post-course** | Instagram and YouTube, audio transcription, collections, sharing, alternate-name indexing. | Not this course. | parked (`implementation-plan.md` §21) |

The single most important line in this table is that **L1 is the target and L2 is not**. The course's
own stated grading philosophy is "better a small, clear, useful, secure, well-built product than a
big, messy, unstable one" (`03`). L2 is where the premium bar from Charter §6 lives, and it is
explicitly *not* what the MVP is judged on.

---

## 5. L0 — the walking skeleton

**The point:** prove the whole vertical, from a URL a stranger posted to rows in the production
database, with no browser involved. Everything here is server-side and script-driven, so every
failure is legible.

| # | Step | Exit criterion — checkable by someone else |
|---|---|---|
| 1 | **The import domain**, pure: canonicaliser (also the SSRF gate), ports, `runImport`, the event sequence, the closed 14-code error union | `runImport` runs against fake ports; every error code is reachable in a test; the canonicaliser passes the whole table in `04` §2 including `tiktok.com.evil.io` failing closed |
| 2 | **The local resolve seam** (MS5 task 7): region scope + `pg_trgm` prefilter feeding the ported scorer | A candidate string in → ranked places out, against the ingested Tel Aviv rows. Tel Aviv's benchmark 8/14 reproduced *through the index*, and the `score` column asserted on the 57 of 71 replayable rows with the 14 accounted for by name |
| 2b | **The global resolver** (D2b): a Nominatim adapter behind the same `PlaceResolver` port, scoped by `cityHint`/`countryHint`, writing `source_dataset = 'osm-nominatim'`; the routing rule (loaded region → index, otherwise → global); the permanent cache for open-data hits and 90-day for Nominatim; the ≤1 rps sequential queue and the daily ceiling | Three, and the third is the one that matters: (a) a candidate in a city we have **not** ingested resolves to correct coordinates; (b) the ≤1 rps cap and the daily ceiling are enforced **server-side** and provable by a test that trips them; (c) the confidence bands are **re-checked on the global path** and still produce **zero false auto-accepts** over the 41 adjudicated benchmark cases. The base URL is one env var, so the hosted-geocoder escape hatch in §9 is a config change |
| 3 | **The adapters**: TikTok oEmbed source, caption extractor, LLM place extractor (schema-constrained), the import store | One script, one real public TikTok URL, one printed `ImportOutcome` with real candidates and per-stage latencies |
| 4 | **Migrations `0010`/`0014` applied to staging and production**, Tel Aviv loaded on both (MS5 task 8) | `inventory.sql` PASS on both hosted projects, `pg_trgm` the only extension beyond baseline, row counts recorded and reproducible from the pinned release |
| 5 | **The streaming route**: `POST /api/imports`, Node runtime, `maxDuration` in code, per-user rate limit, `GET /api/imports/[id]` | **The gate that matters:** a real TikTok URL, `curl`ed against a *preview deployment*, streams NDJSON stage events and returns real candidates. This closes `02` R2 with production infrastructure, not a laptop |

**L0 exit, as one sentence:** a stranger's TikTok URL about a venue **anywhere in the world**, sent
to a deployed URL, produces correct candidate places and a saved row — and a post that names no place produces `NO_PLACES_FOUND` as an
*outcome*, not an exception.

**Nothing in L0 is cuttable.** It is the product.

---

## 6. L1 — the course MVP

The capability set, cut down from Charter §4's fourteen. The numbering is Charter §4's, so what is
absent is visible:

| Charter # | Capability | In L1 |
|---|---|---|
| 1 | Authentication (Supabase Auth, email + password) | **yes** |
| 2 | Paste a link; validate and canonicalise it | **yes** — TikTok resolved, other platforms recognised and redirected to manual add |
| 3 | Acquire post content with no user text entry | **yes** (oEmbed caption) |
| 4 | LLM extraction of 0..N candidates, schema-validated | **yes** |
| 5 | Resolve candidates to real POIs with coordinates | **yes, globally** — Overture index where a region is loaded, Nominatim elsewhere (D2b) |
| 6 | Review: confirm / correct / reject before anything is saved | **yes — never cut.** Charter §3 invariant 2 |
| 7 | Designed failure state: retry · open the original · add a known place | **yes** — and it is the *modal* path, not the edge |
| 8 | Persist confirmed places, deduplicated, linked to the source | **yes** |
| 9 | Interactive map of saved places | **yes**, plain pins, upstream Protomaps style with a palette swap |
| 10 | User location and "what did I save near me" | **no** → L2 |
| 11 | List view with text search and category filter | **search yes, category filter no** → L2 |
| 12 | Place detail with info and a link back to the post | **yes** |
| 13 | Manual place addition (search POI → select → save), plus delete | **yes — never cut.** It is the course's CRUD evidence *and* capability 7's recovery. One feature, two jobs |
| 14 | Touch-designed responsive UI | **yes at the level of "correct on a phone"** — safe areas, thumb reach, bottom sheets. Not at the level of Charter §6's premium bar |

### The ordered steps

| # | Step | Exit criterion |
|---|---|---|
| 1 | **Auth + the app shell + the persistent map layout** — Supabase Auth email/password, the `(map)` route group owning one map instance created once, tokens given values (only the tokens the MVP screens consume), **and the product gets a name** | `/map` → `/place/[id]` → back → `/import` → back leaves `getCenter()`/`getZoom()` unchanged. A second browser profile cannot see the first user's rows |
| 2 | **The import screen** — paste, the stage rail consuming the L0 event stream, the review sheet with its confidence bands, `confirmImport` | A real multi-place TikTok saves the right rows; re-importing the same post saves nothing new (dedup); the review step cannot be bypassed |
| 3 | **The no-places screen** — the three recoveries, and never the word "error" or the word "caption" | A post that names no place lands here, and the manual-add recovery from it saves a place |
| 4 | **The map and place detail** — plain pins, the four authorised camera movers, detail with the source link | ~200 pins scroll and pan smoothly on a mid-range phone; tapping a pin opens the place; the source link opens the original post |
| 5 | **List, search, manual add, delete** — the CRUD surface | Create (manual add), read (list + map + detail), update (the user's note), delete — each demonstrable in the UI, each governed by RLS |
| 6 | **Tests** — `test-specification.md`, then the suite: unit on canonicalisation/scoring/dedup, RLS policy tests, Playwright on the golden path | A cross-user read **fails in a test**, and that test is the evidence for M6's permission requirement. The golden path passes against a deployment |
| 7 | **The graded documents** — `security.md` in full (M9, the largest known gap), `scale.md` (M8), `deployment.md` + README env matrix (M10), `how-the-system-works.md` (R2) | Each file complete, dated, and matching the code as it actually is — not as this plan hoped it would be |
| 8 | **Submission** — the ten M12 artefacts, repo made openable, the deck | The product works from a device that has never opened the project, on a network that is not the developer's |

**L1 exit, as one sentence:** the five Definition-of-Done statements in `implementation-plan.md` §18
are all true, with the map on plain pins and an unforked style.

### Cut order inside L1

Applied strictly top-down if L1 is threatened. This list is the mechanism that protects the
deadline; it is not a wish list.

| Order | Cut | Comes out of |
|---|---|---|
| 1 | Text search on the list (the list itself stays) | step 5 |
| 2 | The user's note on a saved place (update becomes editing nothing — **only if** another update target exists for CRUD) | step 5 |
| 3 | `how-the-system-works.md` reduced to the presentation deck's speaker notes | step 7 |
| 4 | Playwright golden path → a documented manual test (M7 explicitly permits documented manual tests) | step 6 |
| 5 | The stage rail's pacing and minimum dwell → a plain spinner | step 2 |
| **Never** | Auth, the review step, the no-places screen, manual add + delete, the deployed URL, the RLS policy tests, the M8/M9 documents | — |

---

## 7. Course requirement coverage at L1

The MVP is not a reduced-grade product. This table is the argument that L1 alone satisfies the whole
graded contract:

| Req | Satisfied at L1 by |
|---|---|
| M1 web app with business value | The conversion from saved video to retrievable place — `product-specification.md` |
| M2 product specification | Written (`product-specification.md`); one revision pass to match the MVP boundary in §2 above |
| M3 architecture plan | Written (`implementation-plan.md` §7) — components, entities, pages, routes, data flow, permissions, external services with per-service justification |
| M4 technical design before implementation | Written and dated before MS4's SQL (`technical-design.md`); `03` gap 3 satisfied |
| M5 Next.js + TS + Supabase + Vercel, reachable by URL | Live since MS2; L1 step 8 verifies it from a foreign device |
| M6 test specification | L1 step 6 |
| M7 implemented tests | L1 step 6 — central processes, invalid inputs, permissions, database, edge cases |
| M8 scale document | L1 step 7 |
| M9 security document | L1 step 7 — the interim file's 12 owed items close here |
| M10 deployment + env vars + local run | L1 step 7 |
| M11 presentation | L1 step 8 |
| M12 ten artefacts | L1 step 8 |
| R1 own the code | `adr/` and the decision ledger; every provider choice has a written loser |
| R3 small and solid over large and unstable | **This document is the answer to R3.** The MVP boundary in §2 and the cut list in §6 are the evidence that the discipline was applied, not merely stated |

Two of these are worth naming as risks rather than rows: **M9 is the largest gap in the project**
(the file is an interim with a 12-item owed list), and **M6/M7's permission tests are mandatory for
us**, not optional, because every user has a private map (`03` gap 2). Neither is cuttable and both
sit late in the order — that is the L1 tension to watch.

## 8. What the MVP deliberately does not have, and where it went

Absent from L1, with its destination, so that nothing is silently dropped:

**→ L2:** near-me and geolocation · the forked Protomaps style and the premium bar · clustering ·
category filter · onboarding and empty-state seeding · more cities in the Overture index — which after D2b is an **accuracy
accelerator, not a coverage requirement**: the product already works everywhere, and each ingested
region moves that city from 63% to 85%. The ingest is a parameterised script, so this stays the
cheapest L2 item and the first to take if L1 closes early · the five motion moments · the 50-post pipeline evaluation and threshold re-fit · the OSM
alias join that would fix Tel Aviv's 8/14.

**→ L3:** Instagram · YouTube · audio transcription behind the `ContentExtractor` seam · collections
and sharing · a credentialed places provider · alternate-name indexing for non-Latin scripts.

**Not anywhere:** manual caption entry (Charter §2 — it defeats the product), social graph, public
profiles, creator discovery, itinerary generation, recommendation ranking, offline mode, native
apps, PWA share-target.

## 9. Risks specific to this MVP shape

| Risk | Why it is live at MVP level | What we do |
|---|---|---|
| **63% outside loaded regions**, and Nominatim returned *zero* results on all five benchmark misspellings | It is the accuracy the product has almost everywhere in the world | Stated as the honest claim in the spec and the deck, per §2. The manual-add path (capability 13, never-cut) is the designed recovery, and it now carries more weight than it did at one-city scope |
| **The Nominatim rate ceiling.** Policy is ≤1 request/second and `06` §275 sets ≤200/day project-wide, against a theoretical 30 imports × 7 lookups = 210 for a *single* user | A live demo that trips the ceiling looks like a broken product | Three defences, in order: the permanent resolution cache (`06` §276), the Overture index absorbing every loaded region, and the **escape hatch** — the provider base URL is one env var, so a hosted OSM geocoder (LocationIQ / Geoapify: same data, same ODbL storage rights, real ToS, ~5 k/day) is a config change. Chosen 2026-08-20: build on Nominatim, keep the swap ready |
| **ODbL provenance enters the database.** L0 step 2b is precisely the PR `06` §11 Q2 was deferred to | An unsigned licensing question in a graded security document is worse than a hard one answered | Sign-off owed **before** step 2b merges, not after: attribution shipped (already required by the basemap), per-row provenance in `places.source_dataset`, and the position that share-alike binds distribution of a derived database — which we do not do. Owner: `security-privacy` |
| **~27% hit rate.** Most posts name no resolvable place | It looks like a broken product to anyone who does not know the measurement | The no-places screen is a *designed* outcome (L1 step 3), and the honest number goes in the spec and the deck. `product-specification.md` §7.1 already holds this bar |
| **TikTok oEmbed is one undocumented dependency** | If it gates, the product's input disappears | Accepted risk, recorded in `02` §D1; the cached `sources` table keeps already-imported posts working, and the demo can run on cached rows |
| **M9 security document is the largest gap and lands late** | A late graded document with 12 owed items is the classic way to lose marks that the code already earned | It is on the never-cut list; if L1 step 7 is threatened, cut list items 1–5 pay for it first |
| **Levels can be climbed out of order under pressure** | The temptation is to make the map beautiful before the loop is honest | The rule in §1: one level at a time, and every level is submittable |

## 10. What this changes in the other documents

1. [`implementation-plan.md`](implementation-plan.md) keeps its ledger, architecture answer,
   migration order and build orders, and **loses its milestone ladder as the ordering authority**.
   MS5 tasks 6–8 survive: task 7 becomes L0 step 2, task 8 becomes L0 step 4, task 6 moves to L2.
   MS6/MS7 become L0 steps 1/3/5. MS8–MS14 collapse into L1's eight steps. MS8b, MS10's near-me,
   MS11's filter, MS12 and MS15 move to L2.
2. `product-specification.md` needs one revision pass so its capability list matches §6 above and
   its platform boundary matches §2 — the graded spec must describe the product that exists.
3. [`06-map-and-places-decision.md`](06-map-and-places-decision.md) records **D2b** as an amendment,
   not a reversal: §0's "out-of-region fallback" line is unchanged in substance and promoted in time,
   and §11 **Q2 is re-opened** by L0 step 2b exactly as its own re-entry condition said it would be
   ("the first PR that adds an OSM-derived alias, a Nominatim write path, or a second dataset").
4. `CLAUDE.md`'s "MS5 in progress" framing becomes "L0 in progress", with this file as the plan of
   record and `implementation-plan.md` as the design-decision archive.

## 11. D2b — global place resolution (decided 2026-08-20)

**The decision.** The MVP resolves places worldwide, through **two sources behind the one
`PlaceResolver` port**: the Overture POI index for any loaded region, Nominatim for everywhere else,
routed on the candidate's `cityHint` / `countryHint`. Nominatim is built now; a hosted OSM geocoder
with the same data and the same ODbL storage rights is the escape hatch behind one env var.

**Why this and not the alternatives.** Two were considered and both lose on their own terms:

- *Ingest Overture globally.* ~8–12 M filtered rows ≈ 2–3 GB plus a trigram index over all of it,
  hours of ingest — and it **still does not remove the dependency**, because a global lookup needs a
  place-name → bounding-box gazetteer to be correct at all (`06` §209), and the cheapest gazetteer
  available to us is the same OSM service. It pays gigabytes to keep the dependency.
- *A credentialed places API.* Already rejected in `06` §3 on grounds that have not changed: Google,
  Mapbox and Foursquare all forbid storing a name and coordinates beyond 30 days, and two of the
  three require their own basemap. Charter §1 needs a row that lives forever.

**What it costs, recorded so nothing is discovered later.** Accuracy outside loaded regions is a
measured **63%** against 85% inside them; the five benchmark misspellings return nothing at all; the
rate ceiling and the ODbL sign-off are §9 rows with named owners. And one small ruling is owed inside
step 2b: the scorer's `0.10 · confidence` term reads Overture's per-row confidence, which Nominatim
rows do not have. Its analogue (`importance`, or a documented constant) must be **chosen by
re-running the 41 adjudicated cases** and keeping zero false auto-accepts — not picked by argument.
Until that is done, the 44-case bands are proven for the local path only, and saying otherwise would
be the kind of claim Charter §9 exists to prevent.

**Presentation (decided the same day).** Silent — the user sees the same confidence bands either way
and no dataset vocabulary anywhere in the UI. The 85% / 63% split is stated in
`product-specification.md` §7.1, `scale.md` and the deck. This is a decision about *vocabulary*, not
about attribution: ODbL attribution remains mandatory and is already carried by the basemap's
"© OpenStreetMap" plus `/attributions` (`06` §3.2).

## Change log

| Date | Change |
|---|---|
| 2026-08-20 | Created at the owner's instruction: re-plan the course MVP around "links from social media → a map with info", sized by **product level rather than half-days**. Four levels declared (L0 walking skeleton · L1 the course MVP and the submission target · L2 product-grade · L3 post-course), each submittable, climbed in order. The MVP boundary is stated as three decisions rather than a feature list: one link in one field, **TikTok only** (the only VERIFIED access mechanism — other platforms become a recognised, named redirect to manual add rather than a failure), and "info" fixed at name · category · coordinates · source link · user note, because that is exactly what open data lets us store forever. Charter §4's fourteen capabilities are mapped one by one, with capabilities 10 and the category filter half of 11 moved to L2 and the rest kept; capability 6 (review before save) and 13 (manual add + delete) are named never-cut — 13 because it is simultaneously the course's CRUD evidence and capability 7's recovery path. The previous plan's 46-hd ladder is retired as the ordering authority and its content reallocated in §10 with nothing dropped silently. Two facts recorded that the effort-budget framing had obscured: the design work is complete while **no application code exists**, and the ~27% LEVEL B hit rate makes "no places found" the modal import outcome, which makes the no-places screen a core surface rather than an error path |
| 2026-08-20 | **D2b: the MVP goes global, and it does so by promoting a decision rather than taking a new one.** The owner ruled that one-city resolution is not an acceptable MVP boundary. The change is contained because the global path was already designed and merely scheduled late: `06` §0 had chosen Nominatim as the out-of-region fallback, `domain/types.ts` already declares both providers and both datasets, `places` already carries the provenance columns `resolve_place()` writes, and the extraction contract already emits `cityHint`/`countryHint` — so what was owed was an adapter, not an architecture. Two alternatives were rejected on measured grounds: a global Overture ingest (2–3 GB, hours, and it *still* needs an OSM gazetteer to be correct, so it buys nothing it does not also keep paying for) and a credentialed API (all three forbid storing name + coordinates forever, which Charter §1 requires). L0 gains step **2b** with three exit criteria, and the third is the honest one — the confidence bands must be **re-measured on the global path** and keep zero false auto-accepts, because the 44-case benchmark was fit on Overture rows and the scorer's confidence term has no Nominatim input yet. Three costs are now §9 rows with owners rather than discoveries waiting to happen: **63%** top-1 outside loaded regions against 85% inside (with all five misspellings returning nothing), the **≤1 rps / ~200-per-day ceiling** against a theoretical 210 lookups for one user — defended by the permanent cache, the local index, and a one-env-var swap to a hosted OSM geocoder — and the **ODbL sign-off**, owed *before* step 2b merges because this is exactly the PR `06` §11 Q2 deferred itself to. Pre-loading cities is reclassified from a coverage requirement to an accuracy accelerator in L2. Presentation ruled silent: same bands, no dataset vocabulary in the UI, the split stated in the spec, `scale.md` and the deck — which changes nothing about the mandatory OSM attribution the basemap already carries |
