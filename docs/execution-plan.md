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

### L0-F2 — Local resolve seam · `maps-geospatial` · depends: — · cut: never
Was MS5 task 7. **Paused 2026-08-22 — see `06` §3.4.** Not started; superseded for the current
build increment by AI-based resolution (a new, not-yet-numbered task under `L0-F4`/adjacent — the
LLM `PlaceExtractor` identifies the likely real venue and the app links out to a Google Maps
search). Resumes, in whatever form, at the eventual Google renderer+resolver switch `06` §3.3
already named as its own future task, or sooner if AI-based resolution proves too inaccurate.

| Task | What | Exit criterion |
|---|---|---|
| T1 | The server-side query: region scope + `pg_trgm` prefilter → candidate rows | A TLV candidate string returns rows; the query plan is **measured** on the real 4 997-row extract and recorded, since `0010`'s plan flipped between `Seq Scan` and `BitmapOr` on identical data |
| T2 | Wire the query to the ported scorer and assert the benchmark through the index | Tel Aviv's 8/14 reproduced *through the index*; the `score` column asserted on the **57 of 71** replayable rows; the other 14 accounted for by name; TLV-13's promoted `Sabich Frishman` reported rather than absorbed |

### L0-F3 — Global resolver (D2b) · `maps-geospatial` + `security-privacy` · depends: F2 · cut: never
The feature that makes the MVP global. Carries the only gate outside its owner's control.
**Paused 2026-08-22, same reason as F2 — see `06` §3.4.**

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

### L1-F2 — Import: paste and the rail · `ux-interaction` + `design-system-frontend` · depends: F1, L0-F6 · cut: rail motion = 5

| Task | What | Exit criterion |
|---|---|---|
| T1 | S6 paste screen — one field in the thumb zone, client validation, the instant acknowledgement | An invalid link is refused on blur/submit with copy deck string C06; acceptance is acknowledged **before** any work completes |
| T2 | The three-stage rail consuming real `ImportEvent`s, reassurance ladder cut to **two** messages | Each stage advances on a genuine event, never on a timer; the copy matches the deck; `prefers-reduced-motion` honoured |
| T3 | Refresh-safety, cancel and timeout | A mid-import refresh resumes from `GET /api/imports/[id]`; cancel leaves no partial write the user can see |

### L1-F3 — Review and confirm · `ux-interaction` · depends: F2 · cut: never

| Task | What | Exit criterion |
|---|---|---|
| T1 | The review surface: N candidates rendered in their confidence bands, per `06` §6.2 | Preselect / confirm / no-match render distinctly; N=1 and N=7 both usable on a phone |
| T2 | The four interactions of `ux-architecture` §4.2 — accept, choose an alternative, reject, and correct | Nothing is saved without an explicit human confirm; a rejected candidate cannot be resurrected by a refresh |
| T3 | `confirmImport` wired, including partial success | The right rows are saved; 2-of-3 resolution is a success screen, not an error; a re-import of the same post adds no duplicate |

### L1-F4 — No-places and the recoveries · `ux-interaction` · depends: F3, F7 · cut: never
Depends on F7 because manual add **is** its main recovery. This is the modal outcome (~73%), not an edge.

| Task | What | Exit criterion |
|---|---|---|
| T1 | F10 "read, but no places named" + the three recoveries: retry · open the original · add a place you know | The word "error" and the word "caption" appear nowhere on screen; each recovery reaches a working destination |
| T2 | F9 "couldn't read this one", plus the **unsupported-platform** redirect | An Instagram or YouTube link is named as recognised-but-unsupported and lands on manual add — never on a failure screen |

### L1-F5 — Map, pins, camera, place detail · `maps-geospatial` + `design-system-frontend` · depends: F1 · cut: clustering → plain pins = 6

| Task | What | Exit criterion |
|---|---|---|
| T1 | Saved pins as a GeoJSON source, upstream Protomaps style with the palette swapped | Pins carry their own opaque surface, so pin-on-tile contrast holds against the worst background the style produces |
| T2 | The four authorised camera movers, including the **post-confirm flight to new pins** | No code path moves the camera outside those four; the flight reads as one motion, not a jump |
| T3 | S5 place detail as a sheet over the map, with the link back to the source post | Refresh-safe and deep-linkable; the source link opens the original post |
| T4 | Sheet gesture arbitration and the performance pass | ~200 pins pan and zoom smoothly on a mid-range Android; sheet drag never fights map pan |

### L1-F6 — Saved list and search · `design-system-frontend` · depends: F5 · cut: search = 1

| Task | What | Exit criterion |
|---|---|---|
| T1 | S4 — the sheet at full height as the list, sorted by recency | The list is the sheet, not a route; the three snap points behave per `ux-architecture` §6.5 |
| T2 | Text search over saved places | Typing narrows the list and the visible pins consistently; empty result has designed copy |

### L1-F7 — Manual add and delete (CRUD) · `nextjs-architect` + `supabase-database` · depends: F1, L0-F3 · cut: never
The course's CRUD evidence **and** F4's recovery. One feature, two jobs.

| Task | What | Exit criterion |
|---|---|---|
| T1 | S8 — POI search over the resolver (global, so it works anywhere), select, save | A place in an un-ingested city can be found and saved by name |
| T2 | Delete, and update of the user's note | Create / read / update / delete each demonstrable in the UI on a saved place |
| T3 | Ownership verification | The column grants on `saved_places` still exclude `user_id`/`place_id`/`origin`, and a cross-user write attempt fails at the database, not in the UI |

### L1-F8 — Account popover and first run · `ux-interaction` · depends: F1 · cut: —

| Task | What | Exit criterion |
|---|---|---|
| T1 | The 3-item popover (account, how this works, sign out) with delete-my-data, and the zero-places state of S3 | No account *page* exists; a new user never sees a bare empty map |

### L1-F9 — Verification · `qa-reliability` · depends: F1–F7 · cut: e2e → documented manual = 4
The schedule's pressure point: the mandatory permission tests sit behind every UI feature.

| Task | What | Exit criterion |
|---|---|---|
| T1 | `test-specification.md` (course M6) | Covers core features, invalid inputs, central processes, permissions, database, edge cases, basic UI |
| T2 | Unit tier: canonicalisation, scoring, dedup, confidence | The existing 136 tests still green, plus the new seams; no test asserts a number the code derives from the same constant |
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

**L2, in order:** near-me and geolocation (**first**, per `brand-and-product-foundation.md` §2) ·
the forked Protomaps style (D9b) · clustering sophistication · category filter · onboarding that lands
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
| 2026-08-24 | **L0-F2 (the local resolve seam) resumes, scoped lean.** Consistent with the same-day decision to narrow the product's claimed scope to Tel Aviv: the owner wants the existing ~5K-place Tel Aviv database checked **first** when identifying a place, with the current LLM-guess + Google Maps link mechanism kept as the **fallback** for no match, not replaced. Scope, kept deliberately minimal for the MVP: (1) a `PlaceResolver` adapter that runs the `pg_trgm` prefilter against the loaded Tel Aviv index and feeds candidates to the already-tested scorer in `src/domain/places/score.ts` — both already built and unit-tested, but never wired to a live query or a live adapter; (2) wiring `runImport`'s existing `ports.resolver.resolve()` call (already present in `src/domain/import/pipeline.ts`) to this adapter; (3) if the adapter returns no confident match, fall through to the existing `llmGuessProviderPlaceId()` + Google Maps link path unchanged. Out of scope for this pass, by design: Nominatim/global resolution (D2b stays deferred, per the 2026-08-22 entries below and the 2026-08-24 status-sync entry), re-measuring confidence bands beyond what F2's original two exit criteria already require, and any UI change beyond the resolver returning a different `provider` tag on a match |
| 2026-08-20 | Created in session with the owner: the Level → Feature → Task ladder for L0 and L1, **46 tasks across 16 features**, one line and one checkable exit criterion each, with owners drawn from `.claude/agents/` and cut flags carrying `mvp-plan.md` §6's order. Structure approved before expansion. Three orderings here differ from anything the retired milestone ladder said, and each is a consequence rather than a preference: **L1-F4 depends on L1-F7**, because the no-places screen's main recovery *is* manual add and that outcome is modal (~73%) rather than exceptional — so the course's CRUD surface moves early; **L0-F3-T1 (the ODbL sign-off) is a merge gate owned outside the feature**, so it is scheduled as its own task rather than assumed; and **L0-F5 (applying the schema) follows L0-F2**, so no hosted project acquires a shape that no code has exercised. L2 and L3 are named but deliberately unexpanded, with near-me first in L2 |
| 2026-08-22 | L0-F4-T1 closed: the oEmbed `SourceAdapter` + caption `ContentExtractor` are on `main`. L0-F4-T2 (the LLM `PlaceExtractor`) starts this session, with an owner-requested constraint added to its scope: the model-provider abstraction must support a **local model in development** (no per-run cost) and a **stronger hosted model in production**, selected by config, not a code fork. **Open decision flagged, not resolved:** the owner wants coordinates sourced from **Google Maps** going forward, which reopens D2/D2b (`06` §11) — Google's ToS on caching/storing geocoded coordinates conflicts with the MVP boundary's "store forever" open-data premise, and Google Maps billing/key setup is new infra. This is explicitly **not** a replacement of the Overture/Nominatim `PlaceResolver` architecture as part of the current task — it needs its own sign-off (`maps-geospatial` + `security-privacy` + `product-lead`) before any code changes, same pattern as the ODbL gate on L0-F3-T1 |
| 2026-08-22 | **The Google-coordinates flag is closed: resolved as an incremental move, not switched now.** A first ruling rejected the ask outright (bright-line ToS conflict) on the premise that the renderer stays MapLibre+CARTO and storage must be forever; the owner corrected both premises, then ruled explicitly: no renderer swap now, no live Google resolver adapter now — §2 (CARTO) and §3 (Overture/Nominatim, L0-F2/L0-F3) proceed exactly as planned. The only forward-looking change: when `maps-geospatial` builds the `PlaceResolver` port (L0-F3-T2), the `provider` union/check-constraint should be written so adding a `'google'` provider later is a migration, not a redesign — no Google-specific code owed now. The eventual switch (renderer + resolver together, since the ToS analysis only clears if both move together) is a separate task, started only when the owner explicitly asks. Recorded in `06-map-and-places-decision.md` §3.3 |
| 2026-08-22 | **Reopened same day, further: L0-F2 and L0-F3 (Overture/pg_trgm local index, Nominatim) are paused, not built now.** Manual testing of the real extraction pipeline (this session, on a throwaway `/import` probe screen) surfaced that a raw extracted candidate ("Paradiso", Prague, cafe) needs real-world identification to be useful (the real venue is "Paradiso Matcha Bar"), and building the Overture-index resolver to do that felt like wasted effort given the owner's stated intent to move the map/resolver to Google Maps eventually anyway (`06` §3.3's already-flagged future task). Owner's ruling: for now, the LLM `PlaceExtractor` identifies the most likely real venue from caption context using its own world knowledge, and the app links out to a Google Maps search for a human to verify — no local index, no Nominatim adapter, no auto-accept. This is a real, stated tension, not resolved: an LLM's real-world identification is unverified recall (charter: design may only depend on VERIFIED, model confidence isn't a gating signal), mitigated only by a human clicking through before anything is trusted. Recorded in full, including why this doesn't trigger Google's ToS non-Google-map prohibition, in `06-map-and-places-decision.md` §3.4. L0-F2/L0-F3 resume at the eventual Google renderer+resolver switch, or sooner if this approach proves too inaccurate |
| 2026-08-24 | **Status sync, no ladder change.** Recorded to match code as it actually is. Migrations now number **16** (`0001`–`0016`), not the nine `mvp-plan.md` §3 still lists as done plus `0010`/`0014` as "not applied" — `0010`/`0014` **are** applied (L0-F5 exit criteria met), and `0011`–`0016` add auth/session support and the source-link + thumbnail denormalization on `saved_places` used by L1-F5/F7-adjacent UI. L0-F4 (adapters) is further along than "paused": T1 (oEmbed + caption) and T3 (`confirmImport`/`save_place`) are closed in code; T2 (LLM `PlaceExtractor`, Gemini-backed) is in place. **L0-F2/L0-F3 (D2b, the global resolver) stay explicitly deferred** — no Nominatim adapter exists; the LLM-guess + Google-Maps-search-link workaround from the 2026-08-22 entries above remains the interim path, by owner instruction, until D2b is revisited. **Correction, verified 2026-08-24:** L0-F6 (the streaming route) is not built at all, not merely unverified — `src/app/api/imports/route.ts` and `src/app/api/imports/[id]/route.ts` do not exist. Only `src/app/api/imports/probe/route.ts` exists, and its own header comment says it is explicitly a non-streaming, unauthenticated-rate-limit-free throwaway with no `runtime`/`maxDuration` export. `src/domain/import/pipeline.ts`'s own header defers idempotency, resume and the route handler itself to "the future L0-F6 route handler." T1 is un-started, not partially done. T2 (the Vercel preview proof) is consequently blocked on T1, and separately blocked on Vercel Deployment Protection returning 401 to a plain `curl` against any current preview — a bypass secret needs provisioning before T2 can even be attempted once T1 ships. In parallel, L1-shaped UI work has already started ahead of strict level order: auth + sign-in (L1-F1-T3, partial), the map surface with its live/mapcn/mock swap point (L1-F5-T1, partial), and a real (non-throwaway) import paste screen wired to `/api/imports` (L1-F2-T1, partial) are all on `main`. This is noted, not corrected — the ladder still governs closing order, but status tracking now reflects that L0 and L1 have been worked concurrently |
| 2026-08-23 | L0-F4-T3 (`confirmImport`, the transactional save) starts this session — a confirmed extracted candidate lands in `places` + `saved_places` and is visible on the map, clickable, showing name/city/category/note/source. Scope ruled with the owner: (1) the place-detail photo is the existing TikTok source thumbnail (`SourceMediaThumbnail`, `place-sheet.tsx`); no new photo field, no change to `mvp-plan.md`'s photos-excluded stance. (2) Category stays the existing 7-value `ExtractedCategoryHint` vocabulary for this task. **Deferred, not scheduled:** the owner wants places to carry multiple free-form tags/labels (e.g. "Italian", "matcha") rather than one fixed category, generated by the AI from source content rather than drawn only from a predefined list — this is a separate future task touching the extraction schema, `places`/`saved_places` schema, and the detail UI. (3) No transcription logic or pipeline is built now, but `confirmImport`'s save path should not assume TikTok-caption is the only source of place info going forward — when a transcript (or another source) is added later, the intent is to combine all available source content for one place and hand it to the extractor together, so this task should avoid hard-wiring single-source assumptions where the cost of avoiding them is low. No transcript-specific code is owed this task |
