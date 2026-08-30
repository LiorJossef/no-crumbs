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
> The task-level ladder that executes this plan lives in
> [`execution-plan.md`](execution-plan.md) (Level → Feature → Task, 2026-08-20); the levels, the MVP
> boundary and the cut lines stay here.
> The product and brand decisions this plan builds screens against —
> positioning, the user, personality and tone, visual direction, the eight surfaces and the main
> mobile flow — are in [`brand-and-product-foundation.md`](brand-and-product-foundation.md)
> (2026-08-20). Scope contract remains [`00-project-charter.md`](00-project-charter.md) §4. The graded contract
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
| Migrations, RLS forced, 54 policy assertions | **measured 2026-08-30:** local `0001`–`0030` (29 files, no `0027`), **production `0026`**, **staging `0018`**. Production is eight *ahead* of staging | L0, L1 |
| Migrations `0010` + `0014` (POI index, `pg_trgm`, provenance columns) | **applied to both hosted projects** (both are past `0014`) | L0 step 4 |
| Resolver vocabulary, ported scorer, 44-case golden file | **done** (MS5 tasks 2–4). Suite now **1 959 tests in 107 files** (2026-08-30); the "136 tests" figure was MS5's | L0 step 2 |
| Tel Aviv POI index — 4 997 food-and-drink rows, pinned release `2026-07-22.0`, per-row confidences measured | **done** (MS5 task 5), loadable by script | L0 step 2 |
| The global resolution path — provider chosen (`06` §0), provider/dataset enums declared in `domain/types.ts`, `places` provenance columns and `resolve_place()` writes, `cityHint`/`countryHint` in the extraction contract | **designed, not built.** No adapter exists | L0 step 3 |
| TikTok caption access | **VERIFIED** with committed evidence | L0 step 1 |
| Product spec, technical design, UX architecture, copy deck, five decided-and-recorded provider decisions | **done** | L1 documents |
| Application code — auth, UI, map, pipeline | **exists and runs**: 170 files in `src/`, production live at `/healthz` (`{"ok":true,"stage":"production"}`). The "none exists" row here was true on 2026-08-20 and is corrected 2026-08-30 | L0, L1 |

That last row was the point of this section when it was written — the design work was finished and
the product did not exist. It does now; what is left of the gap is tracked per task in
[`execution-plan.md`](execution-plan.md), not here.

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
| 2b | **NEVER BUILT — superseded 2026-08-28 by the Google Places ruling; see §11.** **The global resolver** (D2b): a Nominatim adapter behind the same `PlaceResolver` port, scoped by `cityHint`/`countryHint`, writing `source_dataset = 'osm-nominatim'`; the routing rule (loaded region → index, otherwise → global); the permanent cache for open-data hits and 90-day for Nominatim; the ≤1 rps sequential queue and the daily ceiling | Three, and the third is the one that matters: (a) a candidate in a city we have **not** ingested resolves to correct coordinates; (b) the ≤1 rps cap and the daily ceiling are enforced **server-side** and provable by a test that trips them; (c) the confidence bands are **re-checked on the global path** and still produce **zero false auto-accepts** over the 41 adjudicated benchmark cases. The base URL is one env var, so the hosted-geocoder escape hatch in §9 is a config change |
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
| 10 | User location and "what did I save near me" | **yes**, owner ruling 2026-08-27 (was → L2) — **built** (`ffd55e1`) |
| 11 | List view with text search and category filter | **both yes** — the filter was deferred to L2 and then built at L1 anyway (`src/components/sheet/category-filter-bar.tsx`, `7f61251`); corrected 2026-08-30 |
| 12 | Place detail with info and a link back to the post | **yes** |
| 13 | Manual place addition (search POI → select → save), plus delete | **yes — never cut.** It is the course's CRUD evidence *and* capability 7's recovery. One feature, two jobs. **Built 2026-08-30** (`src/app/actions/manual-add.ts`, `src/components/add/add-sheet.tsx`) |
| 14 | Touch-designed responsive UI | **yes at the level of "correct on a phone"** — safe areas, thumb reach, bottom sheets. Not at the level of Charter §6's premium bar |
| — | **Been / not been yet** — the library's completion state | **yes, added 2026-08-29, built 2026-08-30** (`L1-F12`; `setSavedPlaceVisited`, `src/components/sheet/visit-state.tsx`). Not one of Charter §4's fourteen, and it is not a scope addition either: `saved_places.visit_state` / `visited_at` have existed since migration `0006`, inside the user's own UPDATE column grant, and were read by no screen until this shipped. See below |

**The one capability added to L1 since this table was written, and why it is not a widening.**
`product-ruling-after-the-save.md` (2026-08-29) ruled that the product's biggest after-the-save gap
is structural rather than featural: **the library is append-only with no completion state**, so it
can only grow and never gets lighter, which is the mechanism by which a save-it-for-later product
becomes a graveyard. The fix already exists in the schema — `visit_state` (`'want_to_go'` /
`'visited'`, NOT NULL with a safe default, so no backfill), `visited_at`, their CHECK, and a column
UPDATE grant to `authenticated`, all shipped in `0006` and wired to nothing until 2026-08-30. It is a **per-user
overlay**, the same class as `note`, and it stores no new fact about a place. **It therefore does not
touch the "info" boundary in §2 and needs no owner ruling.** What *does* need one is the next
capability along — user-authored labels — see §8.

### The ordered steps

| # | Step | Exit criterion |
|---|---|---|
| 1 | **Auth + the app shell + the persistent map layout** — Supabase Auth email/password, the `(map)` route group owning one map instance created once, the token values from [`brand-and-product-foundation.md`](brand-and-product-foundation.md) §5 (semantic roles, light values only, every colour a token), the eight surfaces of its §6, **and the product name, which that document leaves open with this step as its deadline** | `/map` → `/place/[id]` → back → `/import` → back leaves `getCenter()`/`getZoom()` unchanged. A second browser profile cannot see the first user's rows |
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

**→ L1, 2026-08-27: near-me is no longer an L2 item at all.** The owner promoted it into L1 outright,
having already promoted it to *first* in L2 on 2026-08-20. Three things decided it: nobody in the
category has it (two of the competitor's reviewers ask for it by name and do not get it), it serves
the everyday half of the single primary user in
[`brand-and-product-foundation.md`](brand-and-product-foundation.md) §2, and it became cheap the
moment the list was bound to the map's viewport — near-me is a control that *sets the viewport*, not
a second retrieval system. It is scheduled after `L1-F5-T2` ("the map is the query") for that reason,
and it inherits that feature's nearest-first sort with no special case.

**→ L2, with near-me removed from the front of it:** the forked Protomaps style and the premium bar · clustering ·
~~category filter~~ (built at L1, 2026-08-30) · onboarding and empty-state seeding · more cities in the Overture index — which after D2b is an **accuracy
accelerator, not a coverage requirement**: the product already works everywhere, and each ingested
region moves that city from 63% to 85%. The ingest is a parameterised script, so this stays the
cheapest L2 item and the first to take if L1 closes early · the five motion moments · the 50-post pipeline evaluation and threshold re-fit · the OSM
alias join that would fix Tel Aviv's 8/14.

**→ L3:** Instagram · YouTube · audio transcription behind the `ContentExtractor` seam · a
credentialed places provider · alternate-name indexing for non-Latin scripts.

**Collections and sharing, re-filed L3 → L2 on 2026-08-28 (owner correction).** They had been
deferred as a social-graph question; they are not one. A **private collection that named, invited
people both contribute to** is a multiplayer document — no feed, no discovery, no audience — and it
is retrieval for two people, which is the job we already claim. Both competitors ship it, and
Plotline's hangs off the *collection* rather than the trip, which is the evidence that collaboration
is separable from the itinerary planner we decline. **Boundary, binding:** named invitees only; no
public profiles, no follower graph, no discovery or trending feed. **Cost to respect:** it is our
first multi-writer object — membership-based RLS on every `saved_places` path, invite-link tokens as
a new public surface, an `added_by` column, and a `security-privacy` sign-off before the schema
lands. It does **not** precede the resolver. Evaluation:
`evidence/product/competitor-pass-2026-08-28.md` §G.

**Personal collections — placed for the first time, 2026-08-29: → L2, behind user-authored labels.
Deferred, not cut.** The entry above is about the *shared* object and is unaffected. Three reasons,
in full in `product-ruling-after-the-save.md` §4. The trip question — the case always cited for
collections — is answered **geographically and for free** by the L2 world-zoom country summary and
the "ELSEWHERE — London, 12 places" affordance that already ships, so a user-made "Tokyo" collection
duplicates a grouping we derive from coordinates and then disagrees with it the first time a place
lands in one and not the other. The part geography cannot derive ("date night", "coffee to try") is a
**label on a save**, not a container, and migration `0019` already reserves `user_tags` with the
normalisers written, granted and tested — roughly 80% of the felt value for one column and zero new
surfaces, against a new table, membership RLS on the hot read, a route, an ordering, a name, a cover
and a manager screen. And the library's actual disease is that it never resolves, not that it is
unsorted: a second organising axis over an append-only pile produces a tidier pile. **The evidence
that would promote them:** ship the labels, and if users create three or more and then reach for an
ordering, a cover, a description, or "send this list to someone", the container is justified.

**BUILT 2026-08-30, out of order, on the owner's explicit overnight instruction.** Both entries
above stand as written — the reasoning was not overturned, the *sequencing* was: the owner asked for
Collections including shared Collections to be built that night, which supersedes both the L2
deferral and the backlog's own §9 recommendation to stop at labels. What shipped is the shared
object of the 2026-08-28 entry and the personal one of the 2026-08-29 entry at the same time,
because they are the same table.

The 2026-08-29 deferral's central worry — that a container duplicates a grouping we already derive
from coordinates — is answered by construction rather than argued away: a collection **is a map**
(`/collections/[id]` is `/map` with a different set of pins), so it never competes with the area
list, it reuses it. And the cost the 2026-08-28 entry told us to respect was avoided rather than
paid: **a collection item points at `places`, not at `saved_places`**, so membership-based RLS never
touched the hot read at all — sharing opened exactly one new policy instead of rewriting every
`saved_places` path. `security-privacy` reviewed it adversarially before it landed and did not
exercise the veto; two authorisation defects it found are recorded in
`handoff-2026-08-30-collections.md` §8. `user_tags` and OD-1 below are **untouched** and still open.
Design: `ux-collections.md`. Schema: migrations `0024`/`0026`.

**User-authored labels (`user_tags`) — proposed, and it is the one thing here that needs the owner
to widen §2's "info" boundary.** Stated plainly rather than slipped past. §2 fixes stored info at
*name · category · coordinates · source link · user note*, "which is exactly what open data lets us
store forever". The argument that a label is already inside it: that sentence's **reason** is a
licensing constraint on **place facts obtained from a provider**, and a user-authored label is the
user's own words about their own save — the same class as `note`. The argument against: it is still a
new stored column, and Charter §4 says new ideas go to a Future list unless the owner rules
otherwise. **The question is one line: does the "info" boundary govern place facts only, or every
stored field?** If place facts only, `L1-F13` proceeds; if every field, it goes to the Future list.
Nothing else in this plan depends on the answer.

**Ruled out rather than deferred, 2026-08-29: any return trigger.** No notifications, no email or
weekly digest, no "on this day", no streaks, badges, counts-as-achievement, widgets or re-engagement
copy. We have no channel — Charter §4 excludes PWA install and share-target — and engagement
mechanics inside a product nobody has opened is a loop that starts nowhere. The honest trigger is
usefulness at the moment of need: near-me plus the completion state, which together answer *"three
places near you that you haven't been to yet."* If this is ever wanted, it starts with a channel
decision, not with a feature.

**Not anywhere:** manual caption entry (Charter §2 — it defeats the product), social graph, public
profiles, creator discovery, trending/discovery feeds, itinerary generation, recommendation ranking,
offline mode, native apps, PWA share-target, and the return-trigger list above.

## 9. Risks specific to this MVP shape

| Risk | Why it is live at MVP level | What we do |
|---|---|---|
| **MOOT 2026-08-30 — no Nominatim adapter was ever built (§11).** **63% outside loaded regions**, and Nominatim returned *zero* results on all five benchmark misspellings | It is the accuracy the product has almost everywhere in the world | Stated as the honest claim in the spec and the deck, per §2. The manual-add path (capability 13, never-cut) is the designed recovery, and it now carries more weight than it did at one-city scope |
| **MOOT 2026-08-30 — never built (§11); the live quota risk is Google Places at 100/day.** **The Nominatim rate ceiling.** Policy is ≤1 request/second and `06` §275 sets ≤200/day project-wide, against a theoretical 30 imports × 7 lookups = 210 for a *single* user | A live demo that trips the ceiling looks like a broken product | Three defences, in order: the permanent resolution cache (`06` §276), the Overture index absorbing every loaded region, and the **escape hatch** — the provider base URL is one env var, so a hosted OSM geocoder (LocationIQ / Geoapify: same data, same ODbL storage rights, real ToS, ~5 k/day) is a config change. Chosen 2026-08-20: build on Nominatim, keep the swap ready |
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

## 11. D2b — global place resolution (decided 2026-08-20, **superseded 2026-08-28**)

> **Verified 2026-08-30: no Nominatim adapter was ever written.** The owner's 2026-08-28 ruling made
> **Google Places** canonical and dropped Overture, superseding both sources below. Kept as the
> reasoning that ruling was taken against; §9's two Nominatim rows are marked moot.

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
| 2026-08-20 | **Product & brand foundation decided in session; recorded in [`brand-and-product-foundation.md`](brand-and-product-foundation.md).** Three of its rulings change this plan rather than only describing the product. (a) **Near-me is promoted to the first L2 item**, ahead of pre-loading cities: the owner merged the spec's three user profiles into one person with two retrieval questions — everyday and trips — and the everyday half is the one L1 does not serve, so the gap is now scheduled rather than noted. (b) **L1 step 1 gains the token values and the eight-surface set**, and carries the product name as an explicit deadline: the name is deliberately still open, and step 1 is the first surface with a header, so it blocks nothing in L0. (c) The surface inventory is **pruned from ten to eight** — the account screen becomes a popover and the landing page becomes a minimal sign-in — which is two fewer screens to design with nothing lost that the MVP needs. Ratified without change and explicitly not re-litigated: the map-is-the-shell IA, the F0→F8 flow spine, the copy deck and the accessibility intent, all of which predate MS4. Visual direction is **warm minimal, light only, dark-ready in architecture** — semantic token roles so a dark theme is later a value swap, but no dark values, no toggle and no dark map in the MVP; the L2 Protomaps fork is unaffected. One honesty item is carried in the product rather than in a footnote: the positioning says *social media* while the MVP reads *TikTok*, so a non-TikTok link is a recognised, named redirect to manual add |
| 2026-08-20 | **Execution ladder split out into [`execution-plan.md`](execution-plan.md).** L0's six steps and L1's eight steps are expanded there into **16 features and 46 tasks**, one checkable exit criterion each, with specialist owners and cut flags. This document keeps the strategy — levels, boundary, cut lines — and stops being the place day-to-day status is tracked |
| 2026-08-29 | **The loop after a save, ruled — `product-ruling-after-the-save.md` (`LOOP-AFTER-SAVE-1`), in response to owner intent that the product feels behaviorally thin once places are saved.** The finding that ordered everything: the product serves capture end to end and serves retrieval **only when the user already knows what they are looking for** — it has retrieval by *identity* (search) and by *geography* (map), and neither of the two modes people actually use, **by state** and **by proximity**. §6's capability table gains one row, and it is deliberately **not** a scope addition: `saved_places.visit_state` / `visited_at`, their CHECK and the user's own UPDATE column grant have existed since migration `0006` and are read by no screen, so the completion state that stops the library being append-only costs no migration, no grant and no boundary change. Ranked ahead of near-me (`L1-F11`, already in L1, unbuilt) because on its own near-me answers "what did I save near here" with a list including four places the user already went to. **Personal collections are placed for the first time — L2, behind user labels, deferred rather than cut** — on the argument that the trip case is answered geographically and for free by the L2 country summary, that the non-geographic case is a label rather than a container at a tenth of the build, and that a second organising axis over an append-only pile makes a tidier pile; the 2026-08-28 *shared*-collections ruling is untouched, and the evidence that would promote personal ones is written down. **One genuine boundary question is put to the owner rather than answered here**: whether §2's "info" boundary governs place facts only or every stored field, which is what decides `user_tags`. **A return trigger is ruled out entirely** — there is no channel, and the honest trigger is usefulness at the moment of need |
| 2026-08-30 | **Reconciled against the code (`DOC-FIX-1`).** §3's asset table was the worst of it: it still said **"Application code — none exists"** while `src/` holds 170 files and production is live (`/healthz` → `{"ok":true,"stage":"production"}`), and its migration rows were inverted — measured today, **production is at `0026` and staging at `0018`**, so production is eight *ahead*, and `0010`/`0014` are on both hosted projects rather than neither. The suite is **1 959 tests in 107 files**, not 136. §6's capability table: the **category filter shipped at L1** (`7f61251`) after being deferred to L2, so the "search yes, filter no → L2" row and the §8 L2 line were both wrong; capability 10 (near-me, `ffd55e1`), capability 13 (manual add) and the been/not-been row are all built. **D2b is marked superseded rather than deleted**: no Nominatim adapter was ever written, the 2026-08-28 Google Places ruling replaced both of its sources, and §9's two Nominatim risk rows describe an adapter that does not exist — the section stays because it is the reasoning the Google ruling was taken against. Still true and deliberately untouched: `POST /api/imports` does not exist |
| 2026-08-27 | **The seven carried-forward questions in `current-state.md` §9.2, answered by the owner as a batch.** Four of them change this plan. **Manual add as place search is inside the Charter §2 boundary** — the §8 row below that files manual entry under "Not anywhere" was forbidding something wider than intended; caption entry stays out, place search comes in, and it is deliberately *not started* until it can be a real place-search experience rather than a name field and a Save button. **Near-me moves from L2 to L1** (`L1-F11` in `execution-plan.md`), which is the second promotion this document has recorded for it and the last one available. **The demo library's five duplicate pairs stay** — the most realistic messy-state fixture we have, deleted from the UI before a demo rather than from the database; no backfill and no change to the 75 m merge radius. And **~27% is explicitly not adopted as a permanent product position**, but `04` M9 stays closed: the priority is the caption pipeline being excellent and reliable end to end, and transcription/OCR/other inputs are revisited after that, not now. The remaining three (the grounding line, export, the TikTok data export) are unanswered and stay in §9.2 |
