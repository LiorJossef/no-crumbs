# Execution Plan — Level → Feature → Task

> Owner: Product Lead + Architect. Date: **2026-08-20**. Status: **the execution ladder.**
>
> Division of labour between the three planning documents:
> [`mvp-plan.md`](mvp-plan.md) holds the **strategy** — the four levels, the MVP boundary, the cut
> lines. [`brand-and-product-foundation.md`](brand-and-product-foundation.md) holds the **product and
> brand decisions** the screens are built against. This document holds the **ladder and the running
> status**: what gets built, in what order, and what each task must prove.
> [`implementation-plan.md`](implementation-plan.md) remains the decision ledger and the M3
> architecture answer.

## Conventions

- **IDs are stable.** `L0-F3` is a feature, `L0-F3-T2` a task. A deferral is written "L1-F6-T2 → L2"
  and stays traceable.
- **A task is one session.** If a task cannot be closed in one, it was two tasks.
- **Every task has an exit criterion checkable by someone else.** Not "done".
- **Owners are specialists** from `.claude/agents/`. The coordinating session integrates and verifies;
  it does not implement.
- **Cut flag** is `never` or a number, which is this level's cut order (`mvp-plan.md` §6).
- No hours and no days, by instruction. Task counts are the only size signal.
- **Status** starts `todo` for everything below. Closing a task means: exit criterion met, and the
  change log at the bottom of this file says so in one line.

---

## L0 — Walking skeleton

**Proves:** the product is possible. A real link becomes real rows through the real pipeline, with no
browser involved. **15 tasks, 6 features, nothing cuttable.**

### L0-F1 — Import domain core · `nextjs-architect` · depends: — · cut: never
Pure TypeScript. No network, no database, no React.

| Task | What | Exit criterion |
|---|---|---|
| T1 | The vocabulary: `domain/errors.ts`, the closed 14-code union, `ImportEvent` types | Every code has a constructor and a test; no code is reachable only by a string literal; `NO_PLACES_FOUND` is typed as an **outcome**, not a member of the error union |
| T2 | `canonicalise-tiktok-url.ts` — pure, table-driven, and the SSRF boundary | The whole table in `04` §2 passes, including `tiktok.com.evil.io` and `nottiktok.com` failing **closed**; and a non-TikTok URL is classified as *recognised platform* vs *not a link we read*, which is what the manual-add redirect in `brand-and-product-foundation.md` §1 needs |
| T3 | `runImport(ports, input, ctx)` against fake ports | The full event sequence is emitted in order; all 14 codes are reachable in tests; the `MAX_CANDIDATES = 7` budget is enforced; partial success is a first-class result |

### L0-F2 — Local resolve seam · `maps-geospatial` · depends: — · cut: never · **DELIVERED 2026-08-27**
**T1 and T2 are done and on `main`** ([PR #40](https://github.com/LiorJossef/P-002/pull/40),
[#41](https://github.com/LiorJossef/P-002/pull/41)). `poi_index` holds 10 462 Overture rows for
`tlv`; `public.poi_prefilter` (`0021`) does both arms of `10` §5; the shipped adapter is measured
against the real index at 11/15 top-1 with zero false auto-accepts. T1's exit criterion is met and
its query plan concern is answered — the two arms are a `UNION` of independently-costed scans
(1.2 ms), not the `OR` whose plan flipped. **The history below is kept because it is why this took
so long to start, and the pause clause it resumed under.**

Was MS5 task 7. **Paused 2026-08-22 — see `06` §3.4.** Not started; superseded for the current
build increment by AI-based resolution (a new, not-yet-numbered task under `L0-F4`/adjacent — the
LLM `PlaceExtractor` identifies the likely real venue and the app links out to a Google Maps
search). Resumes, in whatever form, at the eventual Google renderer+resolver switch `06` §3.3
already named as its own future task, or sooner if AI-based resolution proves too inaccurate.

| Task | What | Exit criterion |
|---|---|---|
| T1 | The server-side query: region scope + `pg_trgm` prefilter → candidate rows | A TLV candidate string returns rows; the query plan is **measured** on the real 4 997-row extract and recorded, since `0010`'s plan flipped between `Seq Scan` and `BitmapOr` on identical data |
| T2 | Wire the query to the ported scorer and assert the benchmark through the index | Tel Aviv's 8/14 reproduced *through the index*; the `score` column asserted on the **57 of 71** replayable rows; the other 14 accounted for by name; TLV-13's promoted `Sabich Frishman` reported rather than absorbed |

### L0-F3 — Global resolver (D2b) · `maps-geospatial` + `security-privacy` · depends: F2 · cut: never · **T1 CLOSED, rest still parked**
**T1, the ODbL sign-off, is answered and is no longer a gate on anything we intend to build**
(`docs/evidence/licensing/odbl-osm-alias-ingest-2026-08-27.md`, `06` §11 Q2, 2026-08-27). Verdict:
an OSM alias join is permitted but makes `poi_index` an ODbL Derivative Database, and it buys 423
rows against 6 699 Hebrew-named ones — **so the recommendation is not to do it**, and the
real-caption corpus agrees (see the change log). The second source for un-ingested cities is a
separate question and stays parked.

The feature that makes the MVP global. Carries the only gate outside its owner's control.
**Paused 2026-08-22. Briefly reopened 2026-08-27 under `06` §3.4's own exit clause, measured, then
PARKED again the same day by the owner** — who chose visible product capability over resolver
infrastructure and declined to make a provider decision. **Parked, explicitly not rejected.** The
measurement is preserved so this resumes cold:
`docs/evidence/places/resolver-future-direction.md`, plus a draft (not adopted) ODbL sign-off in
`docs/evidence/licensing/`. Two things that change the task when it resumes: the model's real error
shape is **multi-branch venues getting a point that is no branch at all** (516–1140 m at 0.90–0.99
confidence), not the flat "65–470 m" recorded before; and **`importance` is unusable** as the
confidence analogue T3 assumes, being a country-level constant.

| Task | What | Exit criterion |
|---|---|---|
| T1 | **The ODbL sign-off** — `06` §11 Q2, re-opened by this feature | The substantive question answered in writing (derivative *database* vs Produced Works), `security.md` updated, the attribution surface named. **This task gates T2's merge**, not its authorship |
| T2 | Nominatim adapter behind `PlaceResolver`: routing rule, cache, rate ceiling | A candidate in a city we have **not** ingested resolves to correct coordinates; the ≤1 rps and daily ceilings are enforced **server-side** and proven by a test that trips them; the base URL is one env var, so the hosted-geocoder swap is config |
| T3 | The confidence analogue and the band re-check on the global path | The Overture-confidence substitute (`importance` or a documented constant) is chosen by **re-running the 41 adjudicated cases**, keeps **zero false auto-accepts**, and the chosen mapping is recorded with its measurement — not with an argument |

### L0-F4 — Source and extraction adapters · `social-integration`, `ai-extraction`, `supabase-database` · depends: F1 · cut: never

| Task | What | Exit criterion |
|---|---|---|
| T1 | oEmbed `SourceAdapter` + caption `ContentExtractor`, Zod at the vendor boundary | A real public TikTok URL yields its caption; every failure mode maps to a declared error code; the `sources` row is cached so a re-import costs nothing |
| T2 | LLM `PlaceExtractor` — structured output, versioned prompt | Schema-valid candidates from a real caption; a caption naming no place returns **zero** candidates cleanly; per-import cost logged against the ~$0.003 estimate |
| T3 | Import store + `confirmImport` — the transactional save | Rows written to `imports`/`extractions` as they are produced, and confirmed candidates land in `places` + `saved_places` through `save_place()` under the user's JWT; a second import of the same post creates no duplicate place |

**Deviation, 2026-08-20 (owner request):** `L0-F3` (global resolver) and `L0-F4` (real source/
extraction adapters) are **paused after L0-F1**, not cut. Owner wants the core product loop — real
UI, a real map, add/save/display a place — proven end-to-end before spending more sessions on real
TikTok extraction and global resolution. `L0-F5` (schema live) is **not paused**: it only depends on
`F2`, not on `F3`/`F4`, so it proceeds. `L0-F6` (the streaming route) stays paused with `F3`/`F4`
since its exit criterion needs both.

In their place, a **pre-L1 vertical slice** (not on the L0/L1 ladder, no cut flag, own commits/PR):
one small app shell, MapLibre + Protomaps rendering saved pins, and manual add/save/delete against
**directly-entered or fixture place data** — no `PlaceResolver` search, no TikTok import. This
reuses `L1-F1`'s and `L1-F5`'s surfaces where convenient but is explicitly not those features: no
design tokens, no auth beyond the minimum Supabase session needed for `saved_places` RLS to mean
anything, no camera-mover discipline yet. It gets rebuilt/absorbed into `L1-F1`, `L1-F5` and `L1-F7`
once those are actually scheduled. Real TikTok extraction (`L0-F3`/`L0-F4`) resumes after this slice
proves the loop.

Within this slice, the first pass is map-rendering-first: pins come from a static fixture
(`domain/places/fixtures.ts`'s `mockSavedPlaces`), not `saved_places`, so persistence, manual add
and delete against the real table are deferred to a later pass in this same slice rather than
built alongside the map.

**Further deviation, 2026-08-21:** live MapLibre + Protomaps rendering is itself paused within
this slice — no Protomaps API key is set up yet. A provider-agnostic port (`MapPlace`,
`MapSurfaceProps`; `src/components/map/types.ts`) now sits between product logic and the map
renderer, and a temporary static mock visual stands in behind that port
(`src/components/map/map-surface.tsx` is the swap point) until a tile provider key is available,
at which point `map-surface.live.tsx`'s real MapLibre implementation is swapped back in with no
change to any caller.

### L0-F5 — Schema live · `supabase-database` + `devops-vercel` · depends: F2 · cut: never
Was MS5 task 8. Deliberately after F2, so we do not apply a schema no code has exercised.

| Task | What | Exit criterion |
|---|---|---|
| T1 | Apply `0010` + `0014` to **staging** | `inventory.sql` PASS on staging with the new tables in the matrix; the policy suite green; `pg_trgm` the only extension beyond baseline |
| T2 | Apply to **production**, load Tel Aviv on both | Same PASS on production; row counts recorded and reproducible from pinned release `2026-07-22.0` |

### L0-F6 — Streaming route and the Vercel proof · `nextjs-architect` + `devops-vercel` · depends: F1, F3, F4, F5 · cut: never

| Task | What | Exit criterion |
|---|---|---|
| T1 | `POST /api/imports` — Node runtime and `maxDuration` **in code**, auth, per-user rate limit, NDJSON stream; `GET /api/imports/[id]` for resume | The stream emits the stage events the rail will render; the limiter rejects with the user id as the key; a refresh mid-import can recover the outcome |
| T2 | **The Vercel proof** | A real TikTok URL, sent to a **preview deployment**, returns real candidates with per-stage latencies logged — and a no-place post returns `NO_PLACES_FOUND` as an outcome. This closes `02` R2 on production infrastructure |

**L0 exit:** a stranger's TikTok about a venue anywhere in the world, sent to a deployed URL, produces
correct candidates and a saved row.

**Deviation, 2026-08-20 (owner request, not a ladder change):** immediately after `L0-F6-T1` lands,
before any L1 work starts, build one throwaway, unstyled test page — a text input, a submit button,
raw output — that calls the real `POST /api/imports` route. Its purpose is a visible, real-data demo
of the walking skeleton, nothing else: it is not `L1-F1`'s shell, not `L1-F2`'s paste screen, carries
none of their design tokens or motion, and does not count toward closing either feature. It is deleted
or fully rebuilt when `L1-F1`/`L1-F2` land. No task ID, no exit criterion beyond "a human can paste a
real link and see real candidates come back."

---

## L1 — The course MVP

**Proves:** the submission. **31 tasks, 10 features.** Surfaces are `brand-and-product-foundation.md`
§6; the flow is its §7.

### L1-F1 — Auth, shell, tokens, the name · `design-system-frontend` + `security-privacy` · depends: L0 · cut: never

| Task | What | Exit criterion |
|---|---|---|
| T1 | **The product name** decided; the wordmark string only | A name exists in one constant and in the deck outline. No logo, no icon set (Charter §4) |
| T2 | Token values — semantic roles, **light values only**, type scale. **Partially pre-empted 2026-08-21:** the mint accent, radius scale and Manrope-only typography (`brand-and-product-foundation.md` §5) were decided and approved against the sign-in screen ahead of this task; closing T2 is now about carrying those same tokens through the rest of the surfaces and running the contrast check, not choosing values from scratch | Every token named in `ux-architecture` §10 and §11.6 has a value in one file; the accent passes contrast **measured on the surface it sits on**; a hard-coded colour anywhere fails review; dark mode's stale placeholder values are reworked or explicitly left disabled, not silently inconsistent |
| T3 | Supabase Auth email + password; S1 minimal landing, S2 sign-in; authenticated visitors redirected server-side | A second browser profile cannot see the first user's rows, proven by attempt, not by assertion |
| T4 | The `(map)` route group: one map instance in a module-scope singleton + the `sessionStorage` camera mirror | `/map` → `/place/[id]` → back → `/import` → back leaves `getCenter()`/`getZoom()` unchanged |

### L1-F2 — Import: paste and the rail · spec `ux-interaction` / build `design-system-frontend` · depends: F1, L0-F6 · cut: rail motion = 5

| Task | What | Exit criterion |
|---|---|---|
| T1 | S6 paste screen — one field in the thumb zone, client validation, the instant acknowledgement | An invalid link is refused on blur/submit with copy deck string C06; acceptance is acknowledged **before** any work completes |
| T2 | The three-stage rail consuming real `ImportEvent`s, reassurance ladder cut to **two** messages | Each stage advances on a genuine event, never on a timer; the copy matches the deck; `prefers-reduced-motion` honoured |
| T3 | Refresh-safety, cancel and timeout | A mid-import refresh resumes from `GET /api/imports/[id]`; cancel leaves no partial write the user can see |

### L1-F3 — Review and confirm · spec `ux-interaction` / build `design-system-frontend` · depends: F2 · cut: never

| Task | What | Exit criterion |
|---|---|---|
| T1 | The review surface: N candidates rendered in their confidence bands, per `06` §6.2 | Preselect / confirm / no-match render distinctly; N=1 and N=7 both usable on a phone |
| T2 | The four interactions of `ux-architecture` §4.2 — accept, choose an alternative, reject, and correct | Nothing is saved without an explicit human confirm; a rejected candidate cannot be resurrected by a refresh |
| T3 | `confirmImport` wired, including partial success | The right rows are saved; 2-of-3 resolution is a success screen, not an error; a re-import of the same post adds no duplicate |

### L1-F4 — No-places and the recoveries · spec `ux-interaction` / build `design-system-frontend` · depends: F3, F7 · cut: never
Depends on F7 because manual add **is** its main recovery. This is the modal outcome (~73%), not an edge.

| Task | What | Exit criterion |
|---|---|---|
| T1 | F10 "read, but no places named" + the three recoveries: retry · open the original · add a place you know | The word "error" and the word "caption" appear nowhere on screen; each recovery reaches a working destination |
| T2 | F9 "couldn't read this one", plus the **unsupported-platform** redirect | An Instagram or YouTube link is named as recognised-but-unsupported and lands on manual add — never on a failure screen |

### L1-F5 — Map, pins, camera, place detail · `maps-geospatial` + `design-system-frontend` · depends: F1 · cut: clustering → plain pins = 6

| Task | What | Exit criterion |
|---|---|---|
| T1 | Saved pins as a GeoJSON source, upstream Protomaps style with the palette swapped | Pins carry their own opaque surface, so pin-on-tile contrast holds against the worst background the style produces |
| T2 · **IN PROGRESS 2026-08-27** | The authorised camera movers, **the anchor-cluster home camera, and binding the list to the viewport** — "the map is the query" | No code path moves the camera outside the enumerated list; the flight reads as one motion, not a jump; every non-empty library settles with at least one *individual* pin and one readable place *name* on screen; panning changes the sheet |
| T3 | S5 place detail as a sheet over the map, with the link back to the source post | Refresh-safe and deep-linkable; the source link opens the original post |
| T4 | Sheet gesture arbitration and the performance pass | ~200 pins pan and zoom smoothly on a mid-range Android; sheet drag never fights map pan |

### L1-F6 — Saved list and search · `design-system-frontend` · depends: F5 · cut: search = 1

| Task | What | Exit criterion |
|---|---|---|
| T1 | S4 — the sheet at full height as the list, sorted by recency | The list is the sheet, not a route; the three snap points behave per `ux-architecture` §6.5 |
| T2 | Text search over saved places — **closed 2026-08-26**, `feat/saved-places-search` | Typing narrows the list and the visible pins consistently; empty result has designed copy |

**T2 as built, and the two things it changed outside its own scope.** `domain/places/search.ts`
matches on the project's one `normalise()`, so accents fold both ways (`cafe` finds `Café
Florentin`, and the reverse) and `tel aviv` finds both `Tel Aviv` and `Tel Aviv-Yafo`. Searchable is
exactly what a row shows — name, category, locality, note — which is also why the row now shows the
city. Client-side over the already-loaded places, which is what buys "narrows the list and the pins
in the same frame"; a library big enough to need a server-side query needs a different interaction
(debounce, pending state) and is a real change, not a tuning knob.

1. **`ux-architecture.md` §1.3 deviation, deliberate:** the field renders at `half` as well as
   `full`. The `Search` text-link that used to sit at `half` did nothing but expand the sheet so the
   user could reach a text field. The spec's actual shortcut (top-left of the map) still does not
   exist.
2. **A fifth camera mover, owed to `L1-F5-T2`:** a settled search flies the camera to its results,
   and clearing frames the whole library again (§9.3's `Show all places`). Not in `06` §9.2's list of
   four. It is here because without it, searching `tel aviv` from a London view filtered the list to
   eight places and the map to zero pins — the list and the map disagreeing about one library.
   `L1-F5-T2` has to either adopt it as authorised or replace it.

**Extended 2026-08-27 (`feat/map-is-the-query`): tags and dishes are searchable.** The searchable
rule moved from *anything the row shows you* to *the labels a place carries* — name, category,
locality, note, plus `tags` and `dishes`. Measured on the live library: nine saved places carry tags
and three carry dishes, and `natural wine`, `hidden gem`, `late night` and `momos` matched nothing
before. Prose (`reason`, `why_go`) stays out, and the line is now drawn between labels and sentences
rather than between on-row and off-row: prose matches on incidental words, so it widens results
without making anything findable.

**Still open on this feature:** the category-filter chips of S4/§1.4 (`[All][Food]`) are not built,
and the *tag* chips on a row are still inert labels — making a chip pressable is the remaining half
of `mvp-plan`/`current-state` §9.1.1's "make the chips do what they look like they do"; the search
half is done. `L1-F6-T1`'s snap-point behaviour is unverified against `ux-architecture` §6.5 by a
test; it was exercised by hand, not by Playwright.

### L1-F7 — Manual add and delete (CRUD) · `nextjs-architect` + `supabase-database` · depends: F1, L0-F3 · cut: never
The course's CRUD evidence **and** F4's recovery. One feature, two jobs.

| Task | What | Exit criterion |
|---|---|---|
| T1 | S8 — POI search over the resolver (global, so it works anywhere), select, save | A place in an un-ingested city can be found and saved by name |
| T2 · **DONE 2026-08-26** | Delete, and update of the user's note | Create / read / update / delete each demonstrable in the UI on a saved place — verified at 390×844 and 1440×900 by `tests/manual/crud-e2e.manual.mjs` |
| T3 · **DONE 2026-08-26** | Ownership verification | The column grants on `saved_places` still exclude `user_id`/`place_id`/`origin`, and a cross-user write attempt fails at the database, not in the UI — P4 (cross-user UPDATE and DELETE affect zero rows) and P5c/P5c-ii/P5c-iii, plus P5c-iv asserting `note` *is* writable |

**T1 — owner ruling, 2026-08-27. In scope, and deliberately not started yet.**
The scope question this task was blocked on is answered: **manual add as *place search* falls inside
Charter §2.** Charter §2 forbids asking the user for caption text; typing a name and picking a
resolved place is a different object with the same resolver and the same provenance fields, and the
old wording forbade something wider than intended.

What the owner did **not** authorise is starting it now, and the reason is a quality bar rather than
a priority: *"I only want it if we can make it a proper place-search experience, not a basic
manual-entry form."* A name field and a Save button would technically close the task and would be
the wrong thing to ship. So T1 stays unstarted until the current work closes, and its implementation
is a decision to take then, not now.

The pressure behind it is unchanged and worth restating: manual add is the recovery for the modal
import outcome, and the missing destination for three failure screens plus `NoPlacesScreen`'s
`Add manually →`, which currently calls `reset()` and returns the user to an empty paste field.
"An un-ingested city" in the exit criterion means the `PlaceResolver` of `L0-F2b`/D2b, still parked.

### L1-F11 — Near me · `maps-geospatial` + `design-system-frontend` · depends: F5-T2 · cut: never
**Promoted from L2 to L1 by owner ruling, 2026-08-27.** Numbered F11 rather than inserted mid-ladder
so no existing task id moves.

Three reasons, and the third is why it is cheap: nobody in the category has it (two of the closest
competitor's reviewers ask for it by name and do not get it); it is the everyday half of the single
primary user in `brand-and-product-foundation.md` §2, the half L1 otherwise does not serve; and once
`L1-F5-T2` binds the list to the viewport, **near-me is a control that sets the viewport**, not a
second retrieval system. It inherits that feature's nearest-first sort with no special case.

| Task | What | Exit criterion |
|---|---|---|
| T1 | A near-me control that requests location once and moves the camera to it | The permission prompt appears only on an explicit tap, never on load; a denial is a designed state with a working alternative, not an error |
| T2 | Distance, shown only where it is a fact about the world | Distance is displayed only against a real user location, never against a map centre; refusing the permission removes the distances rather than showing wrong ones |

**Not in scope and named so it is not absorbed:** background location, any location stored on the
server or in the database, a location-derived default camera on load, and geofencing or arrival
notifications. The permission is requested on a tap and the result never leaves the browser.

### L1-F8 — Account popover and first run · spec `ux-interaction` / build `design-system-frontend` · depends: F1 · cut: —

| Task | What | Exit criterion |
|---|---|---|
| T1 | The 3-item popover (account, how this works, sign out) with delete-my-data, and the zero-places state of S3 | No account *page* exists; a new user never sees a bare empty map |

### L1-F9 — Verification · `qa-reliability` · depends: F1–F7 · cut: e2e → documented manual = 4
The schedule's pressure point: the mandatory permission tests sit behind every UI feature.

| Task | What | Exit criterion |
|---|---|---|
| T1 | `test-specification.md` (course M6) | Covers core features, invalid inputs, central processes, permissions, database, edge cases, basic UI |
| T2 | **Verification of** the unit tier: canonicalisation, scoring, dedup, confidence. The feature agents author these tests; `qa-reliability` verifies coverage and adversarially re-checks them (roster, 2026-08-27) | The existing 136 tests still green, plus the new seams; no test asserts a number the code derives from the same constant |
| T3 | **RLS policy tests** — mandatory, not optional (`03` gap 2) | A cross-user read **fails**, and that failing test is the evidence artefact for M6/M7 |
| T4 | Playwright: the golden path, double-paste idempotency, camera stability | The golden path passes against a **deployment**, not only locally |

### L1-F10 — Graded artefacts and submission · `security-privacy`, `devops-vercel`, `product-lead` · depends: F9 · cut: how-it-works = 3

| Task | What | Exit criterion |
|---|---|---|
| T1 | `security.md` in full (course M9) + the 12 owed items | The largest known gap closed: auth, authorisation, restricted actions, cross-user prevention, input validation, API protection, secret storage, remaining risks |
| T2 | `scale.md` (M8) | Heavy queries named, indexes justified, pagination and over-fetching addressed, the client/server split argued, limits stated |
| T3 | `deployment.md` + README env matrix (M10) | A stranger can run it locally from the README and knows what every variable is for |
| T4 | `how-the-system-works.md` (R2) | Every component, library and decision explained in one sentence each — the study guide for M11's interview questions |
| T5 | Deck + the ten-artefact checklist | The product works from a device that has never opened the project, on a network that is not the developer's; the repo is openable by an examiner |

**L1 exit:** the five Definition-of-Done statements in `implementation-plan.md` §18, on plain pins and
an unforked map style.

---

## L2 / L3 — named, not expanded

No task breakdown until L1 closes, by design.

**L2, in order:** the forked Protomaps style (D9b) · clustering sophistication · category filter · onboarding that lands
the first places · more ingested cities (an accuracy accelerator now, not a coverage requirement) ·
the five motion moments · the 50-post pipeline evaluation and threshold re-fit · the OSM alias join.

**L3:** Instagram · YouTube · audio transcription behind the `ContentExtractor` flag · collections and
sharing · a credentialed provider benchmark · alternate-name indexing.

## Critical path

`L0-F1 → L0-F4 → L0-F6` is the spine, with `L0-F2 → L0-F3` and `L0-F5` feeding F6. In L1 the long
pole is `F1 → F2 → F3 → F4`, and **F4 waits on F7**. Everything converges on **F9**, which cannot be
cut and cannot start early.

Three consequences worth holding in mind while executing:
1. **F7 is early, not late.** Treating manual add as "the CRUD chore we do at the end" breaks the
   modal user outcome, because F4's recovery is F7.
2. **L0-F3-T1 is a merge gate owned by someone else.** Start it early; it is a document, not code.
3. **F9 absorbs every upstream slip.** When a cut is needed, take it from F2's motion, F6's search or
   F10's how-it-works — in that order — and never from F9's policy tests.

## Change log

| Date | Change |
|---|---|
| 2026-08-20 | Created in session with the owner: the Level → Feature → Task ladder for L0 and L1, **46 tasks across 16 features**, one line and one checkable exit criterion each, with owners drawn from `.claude/agents/` and cut flags carrying `mvp-plan.md` §6's order. Structure approved before expansion. Three orderings here differ from anything the retired milestone ladder said, and each is a consequence rather than a preference: **L1-F4 depends on L1-F7**, because the no-places screen's main recovery *is* manual add and that outcome is modal (~73%) rather than exceptional — so the course's CRUD surface moves early; **L0-F3-T1 (the ODbL sign-off) is a merge gate owned outside the feature**, so it is scheduled as its own task rather than assumed; and **L0-F5 (applying the schema) follows L0-F2**, so no hosted project acquires a shape that no code has exercised. L2 and L3 are named but deliberately unexpanded, with near-me first in L2 |
| 2026-08-22 | L0-F4-T1 closed: the oEmbed `SourceAdapter` + caption `ContentExtractor` are on `main`. L0-F4-T2 (the LLM `PlaceExtractor`) starts this session, with an owner-requested constraint added to its scope: the model-provider abstraction must support a **local model in development** (no per-run cost) and a **stronger hosted model in production**, selected by config, not a code fork. **Open decision flagged, not resolved:** the owner wants coordinates sourced from **Google Maps** going forward, which reopens D2/D2b (`06` §11) — Google's ToS on caching/storing geocoded coordinates conflicts with the MVP boundary's "store forever" open-data premise, and Google Maps billing/key setup is new infra. This is explicitly **not** a replacement of the Overture/Nominatim `PlaceResolver` architecture as part of the current task — it needs its own sign-off (`maps-geospatial` + `security-privacy` + `product-lead`) before any code changes, same pattern as the ODbL gate on L0-F3-T1 |
| 2026-08-22 | **The Google-coordinates flag is closed: resolved as an incremental move, not switched now.** A first ruling rejected the ask outright (bright-line ToS conflict) on the premise that the renderer stays MapLibre+CARTO and storage must be forever; the owner corrected both premises, then ruled explicitly: no renderer swap now, no live Google resolver adapter now — §2 (CARTO) and §3 (Overture/Nominatim, L0-F2/L0-F3) proceed exactly as planned. The only forward-looking change: when `maps-geospatial` builds the `PlaceResolver` port (L0-F3-T2), the `provider` union/check-constraint should be written so adding a `'google'` provider later is a migration, not a redesign — no Google-specific code owed now. The eventual switch (renderer + resolver together, since the ToS analysis only clears if both move together) is a separate task, started only when the owner explicitly asks. Recorded in `06-map-and-places-decision.md` §3.3 |
| 2026-08-22 | **Reopened same day, further: L0-F2 and L0-F3 (Overture/pg_trgm local index, Nominatim) are paused, not built now.** Manual testing of the real extraction pipeline (this session, on a throwaway `/import` probe screen) surfaced that a raw extracted candidate ("Paradiso", Prague, cafe) needs real-world identification to be useful (the real venue is "Paradiso Matcha Bar"), and building the Overture-index resolver to do that felt like wasted effort given the owner's stated intent to move the map/resolver to Google Maps eventually anyway (`06` §3.3's already-flagged future task). Owner's ruling: for now, the LLM `PlaceExtractor` identifies the most likely real venue from caption context using its own world knowledge, and the app links out to a Google Maps search for a human to verify — no local index, no Nominatim adapter, no auto-accept. This is a real, stated tension, not resolved: an LLM's real-world identification is unverified recall (charter: design may only depend on VERIFIED, model confidence isn't a gating signal), mitigated only by a human clicking through before anything is trusted. Recorded in full, including why this doesn't trigger Google's ToS non-Google-map prohibition, in `06-map-and-places-decision.md` §3.4. L0-F2/L0-F3 resume at the eventual Google renderer+resolver switch, or sooner if this approach proves too inaccurate |
| 2026-08-23 | L0-F4-T3 (`confirmImport`, the transactional save) starts this session — a confirmed extracted candidate lands in `places` + `saved_places` and is visible on the map, clickable, showing name/city/category/note/source. Scope ruled with the owner: (1) the place-detail photo is the existing TikTok source thumbnail (`SourceMediaThumbnail`, `place-sheet.tsx`); no new photo field, no change to `mvp-plan.md`'s photos-excluded stance. (2) Category stays the existing 7-value `ExtractedCategoryHint` vocabulary for this task. **Deferred, not scheduled:** the owner wants places to carry multiple free-form tags/labels (e.g. "Italian", "matcha") rather than one fixed category, generated by the AI from source content rather than drawn only from a predefined list — this is a separate future task touching the extraction schema, `places`/`saved_places` schema, and the detail UI. (3) No transcription logic or pipeline is built now, but `confirmImport`'s save path should not assume TikTok-caption is the only source of place info going forward — when a transcript (or another source) is added later, the intent is to combine all available source content for one place and hand it to the extractor together, so this task should avoid hard-wiring single-source assumptions where the cost of avoiding them is low. No transcript-specific code is owed this task |
| 2026-08-26 | **Operating model reset by the owner, written into the repo as `docs/working-agreement.md`** (binding) and `docs/current-state.md` (the cold-start document); `CLAUDE.md` points at both and its "no application code exists yet" line is retired. Work this session was ownership-driven rather than ticket-driven, on branch `fix/import-server-owned-confirm`: the interrupted server-owned-confirm security fix was verified end to end against a real multi-place London TikTok and committed, and seven further defects found *by using the product* were fixed and re-verified — a finished import moving the camera to what it saved and saying what landed (it used to be silent and leave the map on another continent); place identity keyed on the caption's `rawName` instead of the model's nondeterministic `identifiedName`, which was minting duplicate `places` rows on every re-paste; the `extractions` cache read side, which had never existed, so every re-paste re-paid the model against a 500-call/day ceiling; a vaul/Radix defect that marked the whole `<main>` `aria-hidden` and made the map page unreachable by screen readers; and the review/confirm screen rebuilt to the `ux-interaction` spec in `docs/ux-import-review-screen.md` — places above the caption, **per-candidate selection** (which closes `L1-F3-T2`'s "nothing is saved without an explicit human confirm" on this path), the model's self-reported "95%" removed in favour of a measured, honest statement, and a candidate the model could not place stated as unsaveable before the button is pressed. **Deferred, recorded rather than done:** the coordinate-accuracy question (measured 65–470 m error) stays open pending an owner decision on Google — the existing key works but no new spend is authorised; a backfill for pre-existing NULL `country_code` rows, which still defeat `resolve_place`'s near-duplicate guard, is a data decision and is left to the owner; a rate limit on `/api/imports/probe` stays with `L0-F6-T1`; and `docs/ux-import-review-screen.md` §8 (motion) is specified but unimplemented by choice |
| 2026-08-26 | **`L1-F6-T2` (text search over saved places) closed** on branch `feat/saved-places-search`, chosen as the highest-impact next step over coordinate accuracy (blocked on an owner decision about Google) and richer tags (a schema change that should wait until the library surfaces make the need concrete). The field had been decorative since it was built — a bare `<Input>` with no state behind it. Three commits: the pure matching rule and its 23 tests; the wiring, which filters the **pins** as well as the list because two surfaces answering the same question differently is worse than no filter; and the camera flight. Six things the wiring pulled in that were not optional — the count no longer says `4 saved` when it means `4 of 20`; the `peek` count says so and is the way back to the off-screen field; a selected place the query excludes is deselected, because its pin is gone; starting an import clears the query; `Escape` clears the field and is stopped before the sheet reads it as "close"; and a debounced `role="status"` line announces the result count, carrying the query it describes so clearing and retyping cannot announce the previous search. Verified by use at 1440×900 and 390×844 against the real 20-place local library, not by tests alone. **Two deviations recorded above rather than silently taken:** the field renders at `half` as well as `full` (against `ux-architecture` §1.3), and the search flight is a **fifth camera mover** that `L1-F5-T2` must reconcile. **Not built, deliberately:** the category-filter chips of §1.4 — one text field that also searches category and city covers most of the need, and chips are an L2 call. Also on this branch's parent, `fix/import-server-owned-confirm` was pushed and PR'd (#23) under `git-workflow.md` §9's standing authorisation; it had been sitting finished and unpushed |
| 2026-08-26 | **Merge autonomy granted, and the workflow reviewed against it.** The owner's ruling: routine merges to `main` no longer need approval — verified work with green required checks lands without asking, and `main` plus the deployed product get verified afterwards. The review that followed found the rule written in four instruction files that would otherwise have contradicted each other, and two genuinely stale passages: `git-workflow.md` §10 still described "one ledger task per session … routed through the specialist agents" (superseded by `working-agreement.md` in August), and `ms3-branch-protection.md` closed with a convention that silently depended on a human approving every merge. **The risk the ruling creates was addressed rather than noted:** GitHub branch protection is Pro/Team-only for a private repo (403, re-confirmed), so CI is not a merge gate and nothing server-side would stop a red merge; `scripts/merge-pr.sh` (`npm run merge:pr`) is now the gate, refusing a draft, a non-`main` base, any check failing **or pending**, an empty check list, a non-mergeable PR, or a branch not containing current `main`, and never passing `--admin`/`--auto`. **The local-green/CI-red gap was closed at its specific cause:** `npm run verify` gained `check:schema`, the read-only inventory whose absence let `migrations · RLS policy tests` sit red for several commits — proven to fail on a reintroduced `0009` bug and to skip cleanly with no database. The honest limit is written down in three places: `verify` covers one of CI's four jobs, so `gh pr checks` is the authority, not a local run. Applied immediately: PR #23 and PR #24 both landed through the new gate, which caught a real stale-base case on #24 and required a proper merge of `main` first. **Kept unchanged deliberately:** branch naming, decompose-first, atomic commits, Conventional Commits, the never-squash sync rule, working-tree safety, and the pre-push hook |
| 2026-08-26 | **Staging brought to `0018` and proven; production deliberately not.** Staging had drifted three ways — `0016`'s content recorded under version `0019` (the tel-aviv branch renumbered the same file), a remote-only `0020`, and an entire out-of-band transcription feature with no ledger row at all, from the paused `codex/cloudflare-audio-transcription` experiment. `supabase db push` refuses to run in that state and `inventory.sql` failed its first check. All orphan definitions were preserved and replay-proved first (#27, `docs/evidence/db/orphans/`), then dropped with the owner's approval; ledger repaired; `0017`/`0018` pushed; 15/15 inventory PASS plus 22 behavioural assertions and a signed-in run of `/map` at both breakpoints. **Production stays at `0009`** — the owner deferred it pending `PROD_DATABASE_URL`, and `db-push.sh` refuses to start a push it cannot prove |
| 2026-08-26 | **Production's recorded cause was wrong, and the correction re-orders the plan.** `current-state.md` §3.0 blamed the missing migrations; `/import` also 500s and never queries `saved_places`. The Vercel project has **no environment variables in any environment** — confirmed by `vercel env ls` and independently by grepping the deployed bundle for a Supabase URL that is not there. Migrating production would not have fixed it. `docs/vercel-env-restore.md` added; restoring the env store is now the first item in `current-state.md` §6, ahead of any feature work, and it is the owner's to do |
| 2026-08-26 | **`L1-F7-T2` closed and `L1-F7-T3` completed** (#29) — delete a saved place, and edit your own note, at both breakpoints. No migration needed; the grants were already right. **Scope added deliberately, and recorded here rather than absorbed silently: the list became an entry point to place detail.** The only route into detail was a MapLibre pin painted into a `<canvas>`, so the feature would have been mouse-only, unreachable by keyboard, and undrivable from Playwright without pixel coordinates — which `L1-F9-T4` needs. Two knock-ons: **a sixth camera mover** (selecting from the list must bring an off-screen place into view, or the desktop popover clamps to the map edge pointing at nothing) which joins the fifth as a loose end for `L1-F5-T2`; and the mobile `peek` count line is now always a tap target instead of only while filtering. **`L1-F7-T1` (manual add) remains open, and is blocked in spirit**: its exit criterion names an un-ingested city, which is the `PlaceResolver` of `L0-F2b`/D2b that does not exist yet — so it either waits or ships against one source with the boundary stated |
| 2026-08-26 | **Delegation transparency added to the working agreement (§1.3, then §1.1 before the 2026-08-27 renumbers) and `CLAUDE.md`, at the owner's request.** Whenever a specialist subagent is used, the report names what was delegated, which agent, whether it wrote code or only investigated/reviewed, and how its output changed the result — including disagreements. Explicitly transparency and not a quota: no performative delegation, no requiring an agent to write code where thinking was the right contribution, and a session that used none simply says so |
| 2026-08-27 | **Specialist-first operating rule (`working-agreement.md` §1.1, owner ruling).** Before meaningful work, check whether a local agent in `.claude/agents/` covers the domain; where there is a genuine match, use the specialist rather than defaulting to doing it yourself. Doing it yourself is now a choice to justify, not the default path. Trivial work and performative delegation are both excluded. Orchestration, integration, judgement and final verification stay with the main session — delegating work never delegates accountability. When nothing fits, the report says the check happened, so silence means "no match" rather than "did not look". The prior delegation-transparency ruling renumbers §1.1 → §1.3. Paired with the owner raising `effortLevel` from `low` to `high` |
| 2026-08-27 | **Process proportional to risk (`working-agreement.md` §1.2, owner ruling).** The workflow is a safety mechanism, not an objective: choose the lightest process that still gives appropriate confidence and recoverability, and be able to say why it was sufficient. Docs-only and no-runtime-effect changes do not get the full §2 bar; anything touching runtime behaviour, UI, data, security, deployment, migrations **or the verification machinery itself** does — a weakened gate is invisible until something else fails. Two hard limits: it does not relax `git-workflow.md` §9.3's specific-instruction list, and it is not cover for verification that was merely inconvenient. Renumbers delegation-transparency §1.2 → §1.3 |
| 2026-08-27 | **`current-state.md` §3.5 closed — honest import failures** (`fix/honest-import-errors`). Every `/api/imports/probe` failure answered HTTP 502 whatever happened, a malformed body was reported as `INTERNAL, retryable: true`, the real cause was discarded rather than logged, and the `imports` row was never stamped — `status='failed'` + `error_code` had been required by `imports_failed_implies_code` since `0003` with **no writer across all 22 imports**. Each of the 14 codes now carries its own status (a 500 is reachable only through `INTERNAL`, which is what makes `07` §7.1's "page a human" mean anything), one redacted structured log line, and a real audit row — verified against live Postgres, not a mock. **No 15th code was added**: the set is closed and owned by `07` §9, and the gap it exposes is recorded as `current-state.md` §3.12 rather than filled by a call site. **A real M6/R9 data leak was found and closed**: V8's `JSON.parse` `SyntaxError` echoes its input — short inputs whole, and a mid-payload window on a trailing comma — so logging the cause of a malformed model response put real coordinates in the log; the first severity assessment of this was wrong and was corrected by measurement. **A second, larger defect surfaced while integrating**: `RedirectScreen` was unreachable dead code because `canSubmit` was gated on `validation.ok`, so an Instagram link, a TikTok profile link and a photo post all rendered `MALFORMED_URL`'s inline copy — contradicting the MVP boundary in `CLAUDE.md` that a recognised-but-unsupported platform is a redirect, never a failure. Fixed, and the two divergent screens merged onto one copy map. **The adversarial pass found a regression this branch introduced**: `Cancel` cleared the URL without aborting the fetch, so the doomed request returned and left `Retry` a dead primary button; there is now a real `AbortController`, a race gate and an in-flight guard (five scripted clicks previously spent five model calls against a 500/day ceiling), and a caller abort writes no `error_code` because none of the 14 would be true. Landed as five commits with 474 unit tests and 18 e2e specs green |
| 2026-08-27 | **Owner steer: bias the next workstream to visible product progress**, not incremental hardening — the product should become noticeably smarter and more capable, not only the engineering underneath it. Applied immediately, and it **overturned a choice already made**: `L1-F7-T1` (manual add) was queued because it closed the most dead ends and plan items, which the owner named as the wrong reason. Reassessed against the core chain — TikTok → extraction → **place identification** → enrichment → saved — the broken link is place identification: coordinates are the model's own guess, measured **65–470 m** out, and the UI admits it on screen ("Pin is approximate", plus a Google Maps link for the user to check it themselves). On a map product the pin being wrong is the product being wrong, and manual add adds a second path without repairing the main one. **Next workstream: real place identification** — the `PlaceResolver` port with a Nominatim provider (free, global, no key, no billing, so the no-new-spend constraint holds), delivering real coordinates, a real address, a stable provider place id and a real `country_code` (which also repairs the dedup defect in §3.2). This **resumes `L0-F2b`/`L0-F3` under the pause's own exit clause** — `06` §3.4 wrote "or sooner, if AI-based resolution proves too inaccurate to be useful", and 65–470 m is that measurement — rather than overriding the ruling. Two things stated rather than buried: the **ODbL sign-off (`06` §11 Q2, `L0-F3-T1`) is a genuine merge gate** owed before the adapter lands, and the `provider` union stays open so a later Google switch is a migration, not a redesign. First step is measurement against the existing 44-case benchmark, not code: Nominatim's 63% top-1 was measured on **raw** candidate strings, whereas our extractor already disambiguates ("Paradiso" → "Paradiso Matcha Bar") and supplies a city hint, so 63% is a floor — a hypothesis to test, not to assert |
| 2026-08-27 | **Rich place extraction shipped** (`feat/rich-place-extraction`), chosen after the owner twice redirected the workstream — first from hardening toward visible product value, then away from `PlaceResolver` infrastructure toward the core TikTok→extraction→useful-and-organised chain. The choice was made by **measuring the product rather than reading the plan**: 7 of 20 saved places had no `extracted_reason` at all, 2 more echoed the place's own name, the rest were verbatim caption substrings (emoji included), and `category` held **4 distinct values across 20 places, 14 of them `restaurant`**. The captions already said "seasonal Italian", "Nepalese kitchen", "pan-Asian inside Tooting Market" — the extractor was paying for that intelligence and discarding it. Schema v2 (same oEmbed, same single model call) adds `tags`, `whyGo`, `dishes` and `areaHint`: measured v1→v2 on four real captions, usable tags **0/9 → 9/9**, a real `whyGo` **0/9 → 8/9**, verbatim-slice `whyGo` **0/8** checked mechanically, and location words welded into the venue name **3/8 → 0/8**. Stored on `saved_places` **not** `places` — `places_select_if_saved` lets any user who saved the same venue read it, so shared tags would ship one user's caption-derived model output into another's browser; it is also the reversible direction. All three columns are SELECT-only for `authenticated` and the writer is `service_role`-only, **proven by attack from a real signed-in session** (nine forged-write shapes, all 42501) rather than by reading DDL. **Deliberately not built: tag filtering** (next branch; the chips are built and inert) and **no backfill** (20 existing rows stay empty; re-extracting is a data decision and spends model calls). **`L1-F7-T1` reclassified from blocked to urgent** — its exit criterion names the parked resolver, so it ships against what exists with the boundary stated |
| 2026-08-27 | **`L0-F2`/`L0-F3` reopened, measured and parked again the same day — parked, explicitly not rejected.** Reopened under `06` §3.4's own exit clause ("or sooner, if AI-based resolution proves too inaccurate"), measured, then the owner chose visible product capability over resolver infrastructure and declined to make a provider decision. **The measurement changed two things and is preserved so this resumes cold** (`docs/evidence/places/resolver-future-direction.md`): the repo's flat "65–470 m" is not the real shape — on single-location venues the model is 35–200 m out, but on **multi-branch venues it emits a point that is no branch at all** (516 m and 1140 m from the nearest, at 0.90–0.99 confidence), which is invisible to the user and not fixable by prompting; and **`importance` is unusable** as the confidence analogue `L0-F3-T3`'s exit criterion assumes, being a country-level constant. Also measured: a gazetteer hit is ~10 m against the model's ~150 m; **Tel Aviv is a data hole** with three target venues verified absent from OSM, which argues *for* D2b's two-source design; and a shortlist-shaped provider yields **zero `preselect` bands**, so the recommendation is to keep `preselect` for the Overture index rather than re-fit it. A **draft, non-adopted** ODbL sign-off is in `docs/evidence/licensing/` — its two useful facts are that the OSMF's Geocoding Guideline treats individual results as *insubstantial extracts* (so the "store forever" premise holds) and that Nominatim's policy **requires** caching while carrying a clause obliging the *application developer* to take deliberate responsibility, which is an owner decision that has not been taken |
| 2026-08-27 | **Hebrew ↔ English place identity: found, scoped, designed, deferred.** A live defect, not a future concern — `places.name` stores whichever script the model chose and there is no alias anywhere, so the same Tel Aviv venue saved from a Hebrew caption and an English one is **two `places` rows nothing will ever merge**, quietly breaking charter invariant 4 today. Verified rather than assumed: `normalise()` folds accents (`Café Levinsky` == `Cafe Levinsky`) but **cannot bridge scripts** (`הקוסם` ≠ `hakosem`), and no change to it could. **Owner ruling: Hebrew ↔ English is the supported scope**; other scripts stay best-effort, and this must not become a generic internationalisation or entity-resolution project. **Deferred out of the current branch by the owner** once it became clear that implementing it properly would expand scope — the design is written up ready to implement (`docs/evidence/places/place-alias-design.md`), ruling aliases onto `places` (the opposite answer from tags, deliberately), withdrawing its own first idea of a `place_names` table, and ruling that the dedup guard consult aliases **only on exact key equality, never a similarity threshold**, because merging two distinct venues is worse than failing to merge one |
| 2026-08-27 | **Four owner rulings, taken as a batch at the start of the session** — the seven questions `current-state.md` §9.2 carried forward, answered rather than resolved in passing. (a) **Manual add as *place search* is inside Charter §2** — typing a name and picking a resolved place is a different object from the caption entry §2 forbids, with the same resolver and the same provenance fields. But it is **deliberately not started**: the owner wants it only as a proper place-search experience, not a basic manual-entry form, and the current work finishes first. The scope block is lifted; the quality bar replaces it. (b) **Near-me promoted from L2 to L1** — new feature `L1-F11`, two tasks, depending on `L1-F5-T2`, because binding the list to the viewport turns near-me into a control that *sets* the viewport rather than a second retrieval system. (c) **The five duplicate pairs in the demo library stay** as the most realistic messy-state fixture; delete them from the UI before a demo instead. No backfill, no merge path, and the 75 m radius is untouched. (d) **~27% is not accepted as a permanent product position, and media ingestion is not reopened either** — the priority is making the caption-based pipeline excellent and reliable end to end first; transcription, OCR and other inputs are revisited after that foundation is solid, which leaves `04` M9 closed for now and means the no-places copy should not yet be rewritten to defend the rate as a stated position |
| 2026-08-27 | **`L1-F5-T2` reopened as "the map is the query"** — the plan-of-record's own next highest-impact step (`current-state.md` §9.1.1), and the first work in a while that changes what the product *feels* like rather than what it can survive. Three parts, one idea: the camera anchors on **one cluster** instead of fitting all of them (12 London + 8 Tel Aviv fitted to one box is a continental view with two bubbles and no individual pins); the list is bound to the **viewport**, so the sheet is always exactly what is on the map and its header names the area (`12 places in London`, not `20 places saved`); and the extraction v2 vocabulary becomes **findable** (`momos`, `natural wine`, `hidden gem` matched nothing before). Costs no model calls, no provider decision, no ODbL gate and no schema change. Specified in full in `docs/ux-map-is-the-query.md`, which also rules that `ux-architecture` §6.6.2's `Search this area` pill should **never be built** — its entire job was binding the list to the viewport on demand, and that binding is now permanent |
| 2026-08-27 | **The resolver is real, and measuring it on real captions reordered the work.** `L0-F2` is delivered ([#40](https://github.com/LiorJossef/P-002/pull/40), [#41](https://github.com/LiorJossef/P-002/pull/41)); `L0-F3-T1` (the ODbL sign-off) is closed. **The number that matters changed by more than any fix did.** The owner supplied 13 real TikToks; through the shipped flow the **auto-match rate is 4/16 (25%)** where the synthetic benchmark says 11/15 — because `benchmark-spec.json`'s queries are script-matched to the index by construction, so half the old number was the measuring instrument. `tests/manual/tiktok-recognition.manual.ts` is now the harness of record for product accuracy; the synthetic one measures the scorer against a fixed substrate and its floor is raised 7 → 11 with that caveat written on the file. **Three ordering consequences, each from the corpus rather than from argument.** (a) **The address signal is promoted to the top of the resolver work.** The extractor already populates `addressHint` for 9 of 17 candidates and `ResolveQuery` has no address field at all; exact `address_line` matches sit in the index for four venues we get wrong, and `קוהי` → `Kohi Coffee Shop` shows the address is **script-neutral evidence** — it bridges Hebrew↔Latin where no name match can. (b) **The OSM `alt_names` join is deprioritised on evidence, not only on licence cost.** The handoff ranked it second on the theory that Latin captions cannot reach Hebrew rows; 11 of the owner's 12 captions are Hebrew and the index is 64% Hebrew, so they match in script already (`האחים` scores 1.000). The dominant failures are address blindness and Hebrew generic tokens. (c) **The scoring and prefilter fixes that moved the synthetic benchmark 7/15 → 11/15 moved the real number by exactly zero** — not a criticism of either, but the clearest evidence available that a benchmark can be improved without improving a product. **Two defects recorded for whoever touches this next**: the `source_dataset` CHECK that `0010` calls "the enforcement of `06` §11 Q2" does not fire (proven with a rolled-back UPDATE), and `alt_names` currently flows from `place-resolver.ts` through the stored resolution record and out to the browser in `probe/route.ts` |
| 2026-08-29 | **Overnight: the map brief closed, "generic information" split into three problems, and one recognition idea refuted.** Four PRs merged ([#50](https://github.com/LiorJossef/P-002/pull/50), [#51](https://github.com/LiorJossef/P-002/pull/51), [#52](https://github.com/LiorJossef/P-002/pull/52)) with a fifth open ([#53](https://github.com/LiorJossef/P-002/pull/53)); full account in `docs/handoff-2026-08-29-overnight-map-and-information.md`. **The map answers all three complaints in the 2026-08-28 brief**: per-category teardrop pins with drawn glyphs, clusters that ease into their members on tap and take the colour of the category holding a strict majority, and a basemap re-tinted at runtime into warm paper / mint water / sage parks. `mapcn`'s `MapClusterLayer` is gone — we own the source and the three layers, ~150 lines against `useMap()`, which is what the previous handoff predicted and it held. **Google Maps is not needed and that is now a measurement**: the limitation was one wrapper component, so D2 stands. **"The information feels generic" was three separate problems**: presentation (three stacked uppercase kickers, a category printed as the raw enum, and the street address never shown at all — it was in the data the whole time); storage (a Hebrew `countryHint: "ישראל"` resolved to nothing because `toCountryCode`'s ICU index was English-only, so `country_code` stored NULL and `resolve_place`'s dedup guard was disabled for those rows — this is what `HaKosem` appearing three times actually is); and extraction (prompt p8 → p11). The prompt work was measured against real captions each time, and **the marketing voice turned out not to be hallucination** — every adjective in "Enjoy a dreamy morning breakfast…" is the creator's own, and what makes it read as invented is the imperative mood plus dropping "Sunday to Friday", the one checkable fact, to keep "dreamy". **Recognition: 7/16 (44%) with zero false auto-accepts under p11**, the same rate as p8 with a better failure shape — `extraction_miss` 3 → 1, so Gelalucci and WOW now reach the picker with the right venue at rank 1 instead of never being named. Two self-inflicted regressions were caught only by a corpus run and fixed (p9 turned `מתחת לעץ` into the phonetic `Metahat LeEtz` and lost a 0.997 auto-match; p10's quote-clipping fix then produced the corpus's first-ever false auto-accept, via a `nameVariants` entry that named a *branch*). **`clippedQuote` closes a structural fragility**: one over-long `evidence` string was making Zod reject the whole response, so the caption the model read best in the corpus produced no places at all. **DEFERRED, each with the measurement recorded rather than a plan to revisit**: (a) the **decisive-margin band change** — compelling on the corpus (7/16 → 11/16) and **refuted by the 44-case golden benchmark**, where TLV-14 (`Bar 51`) auto-accepts the wrong venue `Hostel 51` at 0.900/0.095 because Overture files it as `bar` and the real `Bar 51` as `restaurant`; no threshold in (score, margin) separates it, and the finding points at the scorer's category term, which is TLV-RANK-1 still open at weight 0.10 (`docs/evidence/places/band-policy.md`); (b) the **75 m merge radius** — the two `La Nonna Brixton` rows are 90 m apart with the same `name_key` and country, so the guard misses by 15 m, but widening it is a migration and would wrongly merge two branches of a chain, so it is the owner's call; (c) **whether a lone candidate should auto-accept** (`WOW` has one prefiltered row and therefore no margin, so it can never reach `preselect` by construction); (d) **landing and sign-in copy**, left alone deliberately because it is positioning and a rebrand session is planned. **Two choices made that the previous handoff had put to the owner**: drawn glyphs over emoji (consistent across platforms at pin size, one table to restyle), and all seven category pin types rather than fewer louder ones |
