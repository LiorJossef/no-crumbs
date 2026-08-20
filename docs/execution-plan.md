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
Was MS5 task 7.

| Task | What | Exit criterion |
|---|---|---|
| T1 | The server-side query: region scope + `pg_trgm` prefilter → candidate rows | A TLV candidate string returns rows; the query plan is **measured** on the real 4 997-row extract and recorded, since `0010`'s plan flipped between `Seq Scan` and `BitmapOr` on identical data |
| T2 | Wire the query to the ported scorer and assert the benchmark through the index | Tel Aviv's 8/14 reproduced *through the index*; the `score` column asserted on the **57 of 71** replayable rows; the other 14 accounted for by name; TLV-13's promoted `Sabich Frishman` reported rather than absorbed |

### L0-F3 — Global resolver (D2b) · `maps-geospatial` + `security-privacy` · depends: F2 · cut: never
The feature that makes the MVP global. Carries the only gate outside its owner's control.

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
| T2 | Token values — semantic roles, **light values only**, type scale, the display face in its three placements | Every token named in `ux-architecture` §10 and §11.6 has a value in one file; the accent passes contrast **measured on the surface it sits on**; a hard-coded colour anywhere fails review |
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
| 2026-08-20 | Created in session with the owner: the Level → Feature → Task ladder for L0 and L1, **46 tasks across 16 features**, one line and one checkable exit criterion each, with owners drawn from `.claude/agents/` and cut flags carrying `mvp-plan.md` §6's order. Structure approved before expansion. Three orderings here differ from anything the retired milestone ladder said, and each is a consequence rather than a preference: **L1-F4 depends on L1-F7**, because the no-places screen's main recovery *is* manual add and that outcome is modal (~73%) rather than exceptional — so the course's CRUD surface moves early; **L0-F3-T1 (the ODbL sign-off) is a merge gate owned outside the feature**, so it is scheduled as its own task rather than assumed; and **L0-F5 (applying the schema) follows L0-F2**, so no hosted project acquires a shape that no code has exercised. L2 and L3 are named but deliberately unexpanded, with near-me first in L2 |
