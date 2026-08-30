# Product backlog — completeness pass, 2026-08-29

A broad, practical list to review and work through. **Nothing here is a decision** — it is a menu.
One or two lines per item, grouped by product area, with rough value (V) and effort (E), and any
dependency.

**E-scale:** XS ≈ minutes · S ≈ an hour or two · M ≈ half a day · L ≈ bigger · XL ≈ a project.

---

## 0. Read this before planning from anything below

**`session/2026-08-28-parallel-streams` is already merged.** PR #66 landed it on `main` on
2026-08-28; `origin/main` and HEAD are identical, 0 ahead and 0 behind. *(An earlier claim in this
session that 57 commits were unlanded with no PR open was measured against a stale local `main` ref
— I had not fetched. There is nothing to land and no PR to open.)*

Several figures in older handoffs are nonetheless `main`-era in the sense of predating this work,
and are **wrong**:

| Reads as current in older docs | Actually true on this branch |
|---|---|
| Recognition 44% (7/16) | **12/16 auto-correct, 0 wrong** (p11 record; prompt is now p12) |
| Category term at weight 0.10 is the TLV-RANK-1 problem | `SCORING.total.category` is already **0** |
| "Should a lone candidate auto-accept?" is open | Already answered per-provider by `SoleCandidateMeaning` |
| Local DB is at migration `0023` | Schema is ~`0023`; the **ledger says `0020`** and its `0017` row carries a name that doesn't exist in the repo |

Two live problems found during this pass that are **bugs, not backlog**:

- **P0 — production is broken.** `/map` and `/import` both return **500** (verified today); `/` and
  `/sign-in` are fine. Cause is the empty Vercel env store: `src/proxy.ts` non-null-asserts
  `NEXT_PUBLIC_SUPABASE_URL`. `/healthz` still returns `ok:true` throughout, which is why it has
  gone unnoticed since 2026-08-26. **Status: the migration half is fixed** — production was rebuilt
  to `0023` this session (§17) — so this is now purely the env store, and it is on hold at the
  owner's instruction pending an import rate limit.
- **P0 — `saved_places.source_url` has been silently dead since migration `0017`.** `0016` created
  `apply_saved_place_source_link` and had `save_place` call it; `0017` recreated `save_place`
  without the call, and nothing in `src/` calls it. Row counts confirm: 6/6 populated before,
  1/14 the day of, **0/11 since**. It degrades invisibly because the sheet falls back to the joined
  `sources.canonical_url`.

**Housekeeping:** the auth audit created four probe accounts in the **local** `auth.users`.
**Deleted 2026-08-29** on the owner's instruction; `demo@example.com` and all 31 local saved places
are intact.

---

## 1. Categories and tags — the taxonomy

This is the area you called out, and it is genuinely incoherent in three separate ways.

| # | Item | V/E | Dep |
|---|---|---|---|
| 1.1 | **`ExtractedCategoryHint` has 7 values, `ProductCategory` has 8.** A gelateria reads "Shop" on the review card and "Dessert" on the saved row, one tap apart — a place changes what it *is* by being saved. Add `dessert` to the review label path | V-high E-S | prompt re-measure if the extractor vocabulary widens |
| 1.2 | **Tags mix six facets with no facet field.** Real vocabulary across 31 rows: cuisine (`italian`, `pan asian`), dish (`pasta`, `matcha`, `בורקס`), venue type (`market stall`, `hotel restaurant`), neighbourhood (`marylebone`, `covent garden` — already in `locality`), vibe (`hidden gem`, `underground`), noise (`בקר` = "beef", a typo of "morning"; `חצר` = "courtyard") | V-high E-M | — |
| 1.3 | **`bakery` and `bar` are simultaneously tags and `ProductCategory` values**, and `מאפייה` is Hebrew for bakery — one concept, three spellings, two vocabularies that don't know about each other | V-high E-S | 1.2 |
| 1.4 | **The "tags are English" rule has leaked** — 5 Hebrew tags survive in live rows despite p11 | V-med E-S | corpus re-run |
| 1.5 | **Category is not a filter.** It colours every pin and heads every row; the only filter dimensions are search, tag, and "not been yet" | V-high E-M | — |
| 1.6 | Drop neighbourhood tags at extraction — `locality`/`address_line` already carry them | V-med E-S | — |
| 1.7 | Review cards carry no category colour or glyph; the map and list rows do. The visual language starts only after saving | V-med E-S | — |
| 1.8 | Tags are absent from the review screen entirely — the vocabulary the library is indexed by is invisible when it's created | V-med E-M | — |
| 1.9 | Tag chips have three affordances for one object: pressable in detail (32px), inert on rows (20px), absent in review | V-med E-M | — |
| 1.10 | Dishes are chip-shaped data rendered as a `·`-joined string; searchable, never on a row, never in review | V-low E-S | — |
| 1.11 | `dishes` are stored `normalise()`d, so a *quote* loses casing and accents (`Café au lait` → `cafe au lait`). Tags should normalise; quotes arguably shouldn't | V-low E-S | — |
| 1.12 | Count how often users use `category_override` — the honest measure of whether the 8-value vocabulary is right | V-med E-S | needs usage |

---

## 2. Import — the field, the wait, the review

| # | Item | V/E | Dep |
|---|---|---|---|
| 2.1 | **Enter/Go does nothing** — the input isn't in a `<form>` and has no `onKeyDown`. The first action in the flagship flow is tap-only on a phone | V-high E-S | — |
| 2.2 | Missing `enterKeyHint="go"`, `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}` on a URL field | V-med E-S | — |
| 2.3 | **Stage 3 "Matching locations" never becomes active or done** — `resolve` stays `pending` forever. The rail displays a step it never runs | V-high E-S | — |
| 2.4 | No reassurance ladder and no timeout against a measured 7–34s extraction; a hung request spins forever | V-high E-M | — |
| 2.5 | **`Cancel` clears the pasted URL** — the user must go back to TikTok and re-copy | V-high E-S | — |
| 2.6 | Paste detection: offer the clipboard's TikTok URL when the screen opens | V-high E-M | — |
| 2.7 | Tolerate the share-sheet junk TikTok actually copies (`caption … https://vm.tiktok.com/xyz`) — extract the URL from surrounding text rather than rejecting the paste | V-high E-S | — |
| 2.8 | No offline pre-check: submitting offline runs the whole rail and lands on `INTERNAL` ("that didn't work on our side"), which is a lie | V-med E-S | — |
| 2.9 | **`googleMapsSearchUrl` ignores the user's pick** — after choosing the Basel branch, the link searches the caption's raw string while the `aria-label` names the branch | V-med E-S | — |
| 2.10 | No **"None of these"** in the picker — the user must deselect the whole candidate | V-med E-S | — |
| 2.11 | The picker's explanation is a fixed string ("The caption doesn't say which") even where the caption *did* give the street | V-med E-M | needs `Confidence.reason` in `domain/types.ts` |
| 2.12 | Review rows should be pre-checked opt-out, not opt-in | V-med E-S | — |
| 2.13 | `items` always sends `note: null`; the confirm endpoint accepts a per-candidate note and no UI offers one | V-low E-S | — |
| 2.14 | Partial-failure state offers no retry for the failed candidates, only "Continue to map" | V-med E-M | — |
| 2.15 | Import overlay is not a dialog — no `role="dialog"`, no focus trap, no Escape, and the map behind it stays tabbable | V-med E-M | — |
| 2.16 | `sign_in` from the import flow navigates away and drops the pasted URL | V-med E-M | — |
| 2.17 | `Reference: INTERNAL` shows a user the same word for a dropped connection and a server bug | V-med E-S | — |
| 2.18 | All 14 error codes share one composition, so `UNSUPPORTED_HOST`/`NO_CAPTION` (not failures) look identical to `POST_UNAVAILABLE` (a failure) | V-med E-S | — |
| 2.19 | **Privacy: the review screen hotlinks TikTok's CDN** (`<img src={probe.thumbnailUrl}>`), so TikTok gets the user's IP, UA and Referer on every import, unmentioned. Proxy it or drop it | V-med E-S | — |

---

## 3. "No places found" — the modal outcome

At the current hit rate this is the most common import result and it is the weakest screen.

| # | Item | V/E | Dep |
|---|---|---|---|
| 3.1 | **`NoPlacesScreen` is unreachable.** The render branch exists at `import-page-client.tsx:844` and the `no_places` kind is declared — but **nothing ever constructs it**. The zero case falls through to `CaptionPreviewScreen`: a source row, one muted sentence, a half-empty card | V-high E-M | — |
| 3.2 | **Manual add (S8 / `L1-F7-T1`) does not exist** — so the modal outcome has no forward path. Smallest honest version: one search field on that screen that runs a single resolver query and saves the picked row | V-high E-M | Google quota |
| 3.3 | The capability disclosure ("Some TikToks only show the place on screen") lives in the dead component, not the live path | V-med E-S | 3.1 |
| 3.4 | No "Open the original TikTok" in the live path — the "here is your thing back" move is missing exactly where it matters most | V-med E-S | 3.1 |
| 3.5 | "We read it and it named nothing" and "every candidate was filtered out as implausible" render identically | V-med E-S | — |
| 3.6 | `capped`, `not_attempted`, `unresolved` and `failed` all render headline-less, so "we never looked" and "we looked and found nothing" read the same | V-med E-S | — |
| 3.7 | Nothing to keep: the user walks away with no saved link, no "remind me" | V-med E-M | scope call |

---

## 4. Map

| # | Item | V/E | Dep |
|---|---|---|---|
| 4.1 | **The canvas has no accessible name.** `mapAccessibleName()` is written *and unit-tested* with zero production call sites | V-high E-S | — |
| 4.2 | **Zero-place library → `[0,0]` z0**, the bare world map the acceptance criteria forbid. One-place → a zero-area box at `maxZoom:15`, street level on a blank tile | V-high E-S | — |
| 4.3 | **Geolocation button is an unexplained permission ask** — no pre-prompt, `console.error` as its only failure state, a camera flight to z14 (a fifth camera mover), and no active-area update, so the list says "13 places in Tel Aviv" while the camera is in Berlin | V-high E-M | — |
| 4.4 | No "show all my places" / recentre — no way to re-frame after panning away | V-med E-S | — |
| 4.5 | Tapping a pin never offsets the camera, so a pin in the lower half is hidden the instant the sheet rises | V-med E-S | — |
| 4.6 | No tile-failure state — if CARTO is unreachable, three pulsing dots run forever and nothing is said | V-med E-M | — |
| 4.7 | Zoom/locate controls sit `bottom-10 right-2`; only the attribution got the sheet/safe-area padding fix | V-med E-S | — |
| 4.8 | No labels below z14, so city zoom is anonymous coloured dots | V-med E-S | — |
| 4.9 | Two-way selection: tapping a list row centres its pin; tapping a pin scrolls to its row | V-med E-M | — |
| 4.10 | Map viewport is not remembered between sessions | V-med E-S | — |
| 4.11 | No hover tooltip on markers for mouse users | V-low E-S | — |
| 4.12 | Zoomed out, a large library is a mat of overlapping teardrops with no summary | V-med E-L | clustering removal is deliberate |

---

## 5. Library and list

| # | Item | V/E | Dep |
|---|---|---|---|
| 5.1 | **No date on any row, and `created_at` isn't in `SAVED_PLACES_SELECT`** — only in `.order()`. "Most recently saved first" is invisible and unverifiable | V-high E-S | — |
| 5.2 | Heading, search and filters are not sticky in the scroll region; at 40 rows the way out of a filter is 40 rows up | V-high E-S | — |
| 5.3 | At `peek` the search field and both filters are off screen, and the map has no Search shortcut | V-med E-S | — |
| 5.4 | `NotBeenFilterChip` renders unconditionally — a filter that returns everything when nothing is marked | V-med E-S | — |
| 5.5 | Row second line is `Category · Locality`, identical on every row inside one area and a repeat of the header above; `address_line` is stored and unused on rows | V-med E-S | — |
| 5.6 | Row name is `truncate` with no `dir="auto"` — Hebrew names clip their identifying start (same in review cards and the popover) | V-high E-S | — |
| 5.7 | No bulk actions — 20 rows are 20 round trips | V-med E-M | — |
| 5.8 | `Elsewhere` is a flat area list with no country grouping | V-med E-M | — |
| 5.9 | No sort control and no grouping inside an area | V-low E-L | — |
| 5.10 | Desktop panel can't be collapsed — the map is permanently ~360px narrower | V-med E-S | — |
| 5.11 | **Import history has no surface at all.** `imports` (60 rows, status incl. `no_places`, `error_code`, timings) and `sources` are readable under RLS with an index already in place. Zero migrations needed | V-high E-M | — |
| 5.12 | Group by `source_id` — "everything from this post / this creator". Already stored, unbuilt | V-med E-S | — |
| 5.13 | Filter by origin — "from TikTok" vs "added by hand" — one predicate over an existing column | V-med E-S | 3.2 |

---

## 6. Place detail and post-save behaviour

| # | Item | V/E | Dep |
|---|---|---|---|
| 6.1 | **No rename.** `display_name` is selected, rendered, and granted for INSERT and UPDATE — **written by nothing**. A complete feature missing only its trigger. Zero migrations | V-high E-M | — |
| 6.2 | **A wrong pin cannot be fixed.** Nothing writes coordinates or re-resolves. Smallest version: "Fix this place" → one search on the saved name → upgrade the `llm_guess` row to a provider identity | V-high E-M | Google quota |
| 6.3 | **A saved `llm_guess` pin is indistinguishable from a resolved one** — `get-spots.ts` never selects `places.provider`, so the map can't say "approximate" about a coordinate 65–470 m out. The import screen says it and then the product forgets | V-high E-S | — |
| 6.4 | **Delete has no undo** — the only irreversible action in the product, two taps away | V-high E-S | soft delete: 7.3 |
| 6.5 | No way to remove or edit model-assigned tags / `why_go` / dishes — inferred personal data with no rectification path | V-high E-M | 7.2 |
| 6.6 | **Only one source is ever shown** — `earliestSource()` takes the first and drops the rest, so "one place, many TikToks" is invisible | V-med E-M | — |
| 6.7 | `Matched via {dataset} · 87% confidence` prints a dataset name and a percentage on a screen whose sibling (review) bans confidence numbers by rule | V-med E-S | — |
| 6.8 | `visited_at` is stored and never shown — "Been · March" is a fact we hold and never say | V-med E-S | — |
| 6.9 | Every place should have a Directions escape hatch to Apple/Google Maps | V-med E-S | — |
| 6.10 | Long-press the address to copy it — the most-used utility action on a place card everywhere else | V-med E-XS | — |
| 6.11 | Swipe/long-press a row for been + delete without drilling in | V-med E-M | — |
| 6.12 | Note should save on blur, no Edit mode | V-med E-S | — |
| 6.13 | No adjacency block ("3 of your places are a short walk from here") though `haversineKm` exists | V-med E-M | — |
| 6.14 | Desktop detail is a **288px** popover holding a 9-chip radiogroup, a 4-row textarea, a toggle and a delete confirm; two close buttons, one of them 20px | V-med E-M | — |
| 6.15 | A save produces no named confirmation with Undo | V-med E-S | — |
| 6.16 | Deduplicate loudly — "you already saved this" with a jump to the existing place, not a second row | V-med E-M | — |
| 6.17 | Flag a dead source link (the TikTok 404s) quietly on the row; never auto-delete | V-low E-M | — |

---

## 7. Data model — one column from a visible feature

From a full read of all 23 migrations against the live local DB (31 saved places, 31 places, 60 imports).

| # | Item | V/E | Dep |
|---|---|---|---|
| 7.1 | **Favourites** — one additive column `is_favourite boolean` + the 0006 UPDATE grant | V-med E-S | — |
| 7.2 | **User-authored labels** — `user_tags text[]` is already *reserved* in 0019, blocked on OD-1. `tags` is system-derived and must not be reused | V-high E-S | **OD-1 ruling** |
| 7.3 | **Soft delete / undo** — `deleted_at` + grant, **plus** replacing the unique with a partial `where deleted_at is null`, or a soft-deleted row permanently blocks re-saving that place | V-high E-M | — |
| 7.4 | `places.region`, `provider_payload`, `last_verified_at` are 0/31 — `place-store.ts` passes `null` unconditionally. Either wire or document as inert | V-low E-S | — |
| 7.5 | `imports.attempt_count` and `sources.fetch_attempts` are 0 on every row — retry observability that doesn't exist | V-low E-S | — |
| 7.6 | `imports.expires_at` is enforced by nothing; no sweeper exists, and an abandoned review pins that `(user, source)` pair forever | V-med E-M | — |
| 7.7 | `place_lookups` has 0 rows — the cache shipped in 0023 and has never been exercised locally | V-low E-S | — |
| 7.8 | The merge/tombstone subsystem (0011, 0013) has never run; it is the designated repair path for exactly the `llm_guess` duplicates we have, with no operator surface | V-med E-M | — |
| 7.9 | **`country_code IS NOT DISTINCT FROM` treats NULL as a value** — a candidate whose country the model failed to guess is structurally undedupable. Same defect class as the 75 m radius | V-med E-S | — |
| 7.10 | **Do not widen the 75 m merge radius** — the model's own coordinate noise (median 327 m drift) is 4.4× it. A canonical provider id is the fix; recognition fixes duplicates for free | — | recorded so it isn't re-proposed |
| 7.11 | `extractions.candidates` is table-granted SELECT to `authenticated` and holds verbatim caption substrings — `sources.content_text` is column-withheld under R8 for exactly that reason. Bounded to your own imports, so an inconsistency rather than a breach | V-med E-S | — |
| 7.12 | `resolution_score` is a per-user fact on a shared row — two users resolving the same venue overwrite each other, and it's now on screen | V-low E-S | — |
| 7.13 | Missing indexes for obvious next queries: `places(locality)`, `saved_places(user_id, visit_state)` | V-low E-S | at scale |
| 7.14 | **RLS holds.** Cross-user reads were attacked on every table as another user and as `anon`: `profiles` returned only own row, `saved_places`/`imports`/`extractions` `[]`, `places`/`sources` `42501`, `anon` denied everywhere | — | no action |

---

## 8. Extraction and recognition

Measured against this branch, not `main`. Re-extract the corpus at p12 before judging any of it.

| # | Item | V/E | Dep |
|---|---|---|---|
| 8.1 | **Re-extract the corpus at p12 and refresh the scoreboard** (~13 Gemini calls) — every number on record is a p11 artefact | V-high E-S | — |
| 8.2 | **`@`-mentions are unreachable by construction.** 11/113 captions carry one, mostly the venue's own account (`@stolero_restaurant`, `@Manteigaria.fr`); one Amsterdam caption names nothing in prose and four venues in mentions. The prompt says "handles — never a place" and `isHandleOrUrl` drops them. Admit as weak, capped, labelled evidence | V-high E-M | — |
| 8.3 | **`filterPlausible`'s duplicate rule keys on `rawName` alone**, ignoring `addressHint`, so a caption's second branch is silently dropped. One line — and it's the missing signal that makes F1 safe | V-high E-S | — |
| 8.4 | **`regionCode` is dead code** — it needs a 2-letter code and receives a country *name* ("ישראל"), so it's null on every real import. `toCountryCode` already exists | V-high E-S | — |
| 8.5 | **`nameVariants`/`identifiedName` never reach Google retrieval** — `buildTextQuery` is `rawName + cityHint` only. The bilingual work is our best measured lever and it stops at the scorer | V-high E-M | **quota** |
| 8.6 | `venueQueryString()` — measured to beat the bare name 6/9 vs 4/9 top-1 — is written, tested, and called by nothing; `ResolveQuery` has no `areaHint` | V-high E-M | architect |
| 8.7 | `max_tokens: 1024` on the Anthropic adapter against a 14-field candidate; a 5–7 place caption plausibly truncates into `EXTRACTOR_INVALID_OUTPUT` | V-high E-S | — |
| 8.8 | Neither adapter reads `stop_reason`/`finishReason` — truncation, a safety stop and malformed output are one indistinguishable error | V-high E-S | — |
| 8.9 | A Zod failure discards **every** candidate in the response; parse item-by-item and keep the valid ones | V-high E-M | — |
| 8.10 | Anthropic adapter sets no `temperature`; Gemini sets 0. The production adapter samples where the evaluated one doesn't | V-med E-S | — |
| 8.11 | `GENERIC_WORDS` is English-only — no Hebrew descriptor can ever be dropped, in our primary market | V-med E-S | — |
| 8.12 | `isCityOrCountryOnly` only compares against the candidate's own hints, so `Shibuya` with `cityHint: Tokyo` survives | V-med E-S | — |
| 8.13 | Prompt is ~4,874 tokens and input dominates every call; it grew by accretion p8→p12. A measured trim is the cheapest cost lever | V-med E-M | — |
| 8.14 | `author_name` often carries the city ("Tel Aviv City", "Kelsey💗London Travel Creator") and never reaches the model — a free `cityHint` prior | V-med E-S | — |
| 8.15 | The user's own saved places are never consulted before a lookup — a `name_key` hit would skip a Text Search *and* converge identity | V-med E-M | **saves quota** |
| 8.16 | `ResolveQuery.near` is always null; Google's `locationBias` is never sent | V-med E-M | — |
| 8.17 | No `businessStatus` — a closed venue or a previous tenant is indistinguishable from a live one. Check the billing SKU first | V-med E-S | SKU check |
| 8.18 | **The false-positive side is entirely unmeasured** — all 13 corpus captions name a real venue, so no case exists where `[]` is right. `evidence_not_in_caption` has fired 4 times, wrong 4/4 | V-high E-S | 8 Gemini calls |
| 8.19 | Corpus is 13 URLs against a 20–30 target; `bars_and_wine_bars` has zero | V-high E-S | 1 call per URL |
| 8.20 | `modelConfidence` correlation with correctness has never been computed, though every run holds it. Pure offline arithmetic | V-med E-S | — |
| 8.21 | No per-language (he vs en) breakdown of any number, in a product whose scope is he↔en | V-med E-S | — |
| 8.22 | **Cost per import is ~$0.0075, 2.4× the documented $0.0032** — `09` §2.2 assumed a ≤800-token system prompt against today's ~4,874. Gemini logs `costModel: 'unmeasured'` | V-med E-S | — |
| 8.23 | Prompt caching is untried; the system prompt is constant and ~87% of every call's input | V-med E-M | — |
| 8.24 | Re-admit the category term as **bonus-only** (`max(0, …)`, never a penalty) — settled offline by replaying the golden-44 + scoreboard | V-med E-S | no network |
| 8.25 | Write down the lone-candidate ruling and close `10` §12 Q3 — the sweep already answered it (Google `exhaustive-search` 7→12 preselect, 0 wrong) | V-high E-S | no network |
| 8.26 | F1 (pure-suffix auto-accept) recovers the last `weak_name` case with 0 false accepts on all three corpora; held only for the sibling-branch risk that 8.3 removes | V-high E-M | 8.3 |
| 8.27 | Hebrew construct-state generics (`מסעדת` 213 rows, `מאפיית` 82, `סניף` 42) absent from `SCORING.generic` | V-med E-S | — |
| 8.28 | Tags have **no grounding gate at all** and world knowledge has leaked in (`falafel`, `middle eastern` on a caption saying neither), with no counter to show it recurring | V-med E-M | — |
| 8.29 | Nothing captures the outcome of the Google Maps click-through — the only mitigation we claim for `world_knowledge` coordinates, and we learn nothing from it | V-med E-M | — |

---

## 9. Collections and organisation

**The headline: a container is justified by a share target, not by an organiser.** You can filter by
a label but you cannot *send* one. So collections are downstream of a sharing decision, not upstream
— which sharpens the existing L2 deferral rather than reopening it.

The ladder, and where to stop:

| Rung | What it gives | V/E | Dep |
|---|---|---|---|
| **R1 — user labels** | Names the ~20% of intent geography can't derive ("date night", "coffee to try"). One reserved column, normalisers already written | V-high E-S | **OD-1** |
| **R2 — pinned labels** | Up to ~5 labels as a chip row — a named view, **zero schema**, pure UI over R1 | V-med E-S | R1 |
| R3 — order within a label | Sequence. **This is the rung where the array stops working** — and therefore the honest trigger to reconsider the table, not R4's feature list | V-low E-M | — |
| R4 — collection object | A real container. Two new tables, RLS/FORCE/REVOKE, 4 policies each, composite FK | V-med E-L | a sharing ruling |
| R5 — covers/ordering/manager | Polish on R4 | V-low E-M | R4 |

**Recommendation: R1 + R2, stop there.** At 31 places with 32 tags across six facets, the problem
isn't a missing container — it's that six facets are jammed into one chip row (see §1.2). R1 fixes
that by separating *the user's words* from *ours*.

Jobs geography genuinely can't serve, and what they actually need:

- "The four places I want Thursday" → **not a container** — sequence + a moment, i.e. a trip, which we decline. Ad-hoc multi-select → copy as text.
- "The list I send my sister" → **not a container** — this is export, and the selection is one-shot.
- "Date night", "the top 3", "all the bakeries" → a label or an existing filter.

Of the jobs geography can't do, only *sequence* and *audience* reach past a label, and both are
answered by selection + export rather than a stored container.

**Tighten the promotion test** in `mvp-plan.md` §8 to a single criterion: *a user asks to send a list
a second time after having sent one as text.*

---

## 10. Sharing and collaboration

Separate the two — they have completely different costs.

| Level | Smallest version | V/E | Surface |
|---|---|---|---|
| **S1 — one place, read-only** | `navigator.share` / clipboard: name · address · why-go · TikTok URL. No new read path, no token | V-med E-XS | Low — the source URL was already public |
| **S2a — a list, read-only, as text** | Multi-select → text block + one maps URL per place | V-high E-S | Low, and *self-limiting* — no live object to leak later |
| S2b — a list, hosted at `/share/[token]` | Share-token table, non-`anon` server render (because `places` is only readable via a `saved_places` row), revocation, expiry, enumeration resistance | V-med E-L | **Real** — the first unauthenticated URL over a personal location dataset |
| S3 — someone adds to your list | Every `saved_places` policy moves from `user_id = auth.uid()` to membership-based | V-med E-XL | Multi-writer personal location data; a revoked member's rows |
| S4 — shared library | — | **Refuse** | Deletes the ownership model |

**Ship first if you ship one: S2a**, which subsumes S1 and buys the whole "we're both going and only
one of us has the list" job at zero RLS cost. **Hold hardest: S2b** — not because it's expensive but
because it's the first unauthenticated read of personal location data, and that needs a sign-off.

**A privacy fact not written down anywhere in our docs:** sharing a place marked `want_to_go`
discloses **future** location intent, which is a stronger disclosure than a past visit. Any share
design must decide whether `visit_state` travels. Recommendation: it does not.

Small wins available today at zero schema and zero policy change:

| # | Item | V/E |
|---|---|---|
| 10.1 | Copy a place as text: name · address · why-go · source link | V-high E-S |
| 10.2 | Multi-select in the list → "Copy 4 places" / native share sheet | V-high E-M |
| 10.3 | `navigator.share` on the place detail | V-med E-XS |
| 10.4 | A maps-search URL per place in the exported text, so the recipient can tap through | V-med E-S |
| 10.5 | Export the library as CSV/GeoJSON — also the data-portability answer | V-med E-S |

---

## 11. Auth, account and identity

Findings below were produced by attacking the local container, not by reading descriptions.

| # | Item | V/E | Dep |
|---|---|---|---|
| 11.1 | **Anyone can sign up as anyone.** `enable_confirmations = false`; a signup with an unowned address returned a live token with `email_confirmed_at` already set. **The demo login is unaffected** — `seed.sql` sets `email_confirmed_at` directly | V-high E-S | — |
| 11.2 | **No `/auth/confirm` route exists**, so even with confirmations on the emailed link has nowhere to land. The sign-in UI already handles `email_not_confirmed` | V-high E-S | 11.1 |
| 11.3 | **No password reset.** The backend works (`/auth/v1/recover` → 200); everything missing is app-side. Four pieces, and the fourth is the one people forget: `site_url`/`additional_redirect_urls` currently list only `127.0.0.1:3000`, so a reset link on any deployment refuses to redirect | V-high E-M | 11.2 |
| 11.4 | The recovery email template is commented out in `config.toml`; Supabase's default uses implicit flow while `@supabase/ssr` is PKCE, so the link dies on any other device unless overridden to `{{ .TokenHash }}` | V-high E-S | 11.3 |
| 11.5 | **`secure_password_change = false`** — `updateUser({password})` doesn't require the current password. Combined with non-HttpOnly cookies, one stolen session becomes permanent account takeover | V-high E-S | — |
| 11.6 | **Sign-in is not throttled.** 70 wrong-password attempts, first 25 in **1 second**, all plain `400`, no throttle — against `minimum_password_length = 6` and no complexity requirement. Hosted is *probably* covered by the platform, but that is **unverified** | V-high E-S | verify hosted |
| 11.7 | **Session refresh doesn't cover `/import`.** `src/proxy.ts` matches `/map/:path*` only, while `server.ts` comments that "the middleware refreshes the session on every request" — true for `/map`, false for `/import`. A user past the hour has their session die mid-flow | V-high E-S | — |
| 11.8 | **Delete account** — GDPR Art. 17, and genuinely small: exactly three tables carry `user_id` and all cascade from `profiles` ← `auth.users`, so one service-role handler calling `admin.deleteUser` removes every user-linked byte | V-high E-S | — |
| 11.9 | What survives deletion is defensible and worth writing down: `sources`/`extractions` cascade from `sources`, not a user, and `imports` — the only user↔source link — is deleted, so what remains is a de-identified global cache | V-med E-S | a ruling |
| 11.10 | **Export my data** — GDPR Art. 20. One Server Action selecting `saved_places` joined to `places` | V-high E-S | — |
| 11.11 | Change password (blocked on 11.5), sign out everywhere (`signOut({scope:'global'})` — the only recovery from a leaked 400-day cookie), change email | V-med E-S | 11.5 |
| 11.12 | **No rate limit on the import route.** `enable_signup = true` + no confirmation means an attacker registers in one request and posts distinct URLs in a loop; each costs a Gemini call against 500/day and a Google call against **100/day**. A few hundred requests takes the product down for the day | V-high E-M | — |
| 11.13 | `sign-in/page.tsx:55` still ends `default: return error.message` — unmapped Supabase codes print raw vendor copy, guarded only by a `/phone/i` regex. (The "phone" defect itself **is fixed**) | V-med E-S | — |
| 11.14 | `noValidate` + `minLength=6` means client validation never fires; every short submit costs a round trip | V-med E-S | — |
| 11.15 | Auth failure uses `role="status"`; should be assertive | V-low E-S | — |
| 11.16 | **Hazard to write into `git-workflow.md` §9.3:** `supabase config push` would push local `enable_confirmations = false` onto a hosted project and silently disable production email confirmation | V-med E-S | — |
| 11.17 | Cookies are **not HttpOnly** — inherent to `@supabase/ssr`, not a mistake in our client. Mitigation is a CSP header, not a cookie flag; it's what makes 11.5 load-bearing | V-med E-M | — |
| 11.18 | **No privacy policy, terms, or attributions page anywhere.** Also where the ODbL sign-off must surface *before* the Nominatim adapter merges | V-high E-M | — |
| 11.19 | Third-party disclosure absent: pasting a link sends the caption to Gemini and place strings to Google Places; the user is told none of it | V-high E-S | — |
| 11.20 | Creator captions and handles stored indefinitely, no TTL, no stated posture — third-party personal data. Needs a ruling more than code | V-med E-S | — |

---

## 12. Production readiness

| # | Item | V/E | Dep |
|---|---|---|---|
| 12.1 | **Restore the Vercel env store**, then redeploy (`NEXT_PUBLIC_*` bake in at build). Prove it: `/map` must return **307, not 500** | V-high E-S | **owner** |
| 12.2 | **Push migrations, staging first.** Re-measured 2026-08-29 with **explicit project refs**: staging `0018` (missing `0019`–`0023`, 5); **production `0009` (missing `0010`–`0023`, 14)**. This confirms `docs/evidence/deploy/hosted-migration-state-2026-08-28.md` — it was right. *(An earlier reading in this session that put production at `0018` was wrong: `SUPABASE_PROJECT_REF_PROD` is empty in `.env.local`, so `--project-ref ""` fell back to the linked project, which is staging. Production was measured twice as staging. Always pass the ref explicitly.)* Env alone will not fix production: at `0009`, `get-spots.ts` names columns that do not exist and `save_place` is the 3-arg form against a 4-arg call | V-high E-M | `PROD_DATABASE_URL` + a `pg_dump` first |
| 12.3 | **`/healthz` reads no configuration**, so it answers `ok:true` on a completely broken deployment — measured today. Assert env *presence* (never values) + one cheap query, 503 when missing | V-high E-S | — |
| 12.4 | Then something must call it: a GitHub Actions cron 4×/day (free in dollars, ~120 min/month against the allowance in 12.9), or an external monitor (**a new third-party account — your call**) | V-high E-S | 12.3 |
| 12.5 | **App shell in one commit:** `icon.png` + `apple-icon.png` + `opengraph-image.png` (Next 16 picks them up by filename), `not-found.tsx` + `global-error.tsx`, `robots.ts`, delete `maximumScale: 1`, a real `<title>`, and a `headers()` block. Production `/favicon.ico` and `/manifest.webmanifest` both **404** today | V-high E-S | title blocked on the name |
| 12.6 | **No `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere.** Measured, not theoretical: unstyled white `__next_error__` on `/import`, bare `text/plain` on `/map` | V-high E-S | — |
| 12.7 | **`maximumScale: 1` blocks pinch-zoom app-wide** — WCAG 1.4.4, one line | V-high E-S | — |
| 12.8 | **Hebrew has no font.** Manrope has **no Hebrew subset to add** (`cyrillic, greek, latin, latin-ext, vietnamese`) — adding `'hebrew'` fails the build. Needs a second family (Rubik / Assistant / Noto Sans Hebrew all carry both scripts) appended to the stack | V-med E-M | design call |
| 12.9 | **CI is on track to exhaust the free private-repo Actions allowance this month** — ~1,450 of 2,000 minutes used, ~690 in the last two days, ~8 billable minutes/run × 181 runs in August. Overage is $0.008/min. **This is the measured number behind the path-aware-CI ruling** | V-high E-M | **spend decision** |
| 12.10 | `next build` runs twice per CI run — once as `build`, once inside `playwright`'s `webServer`. ~1 min duplicated every run; the obvious first cut | V-med E-S | — |
| 12.11 | **`check:agents` runs nowhere in CI** — the agent-roster gate is local-only, so a broken `.claude/agents` merges green. One line in the `verify` job | V-med E-S | — |
| 12.12 | **The `playwright` check is not evidence** — `28 skipped, 6 passed`; the job starts no Supabase and sets no `E2E_PASSWORD`. PR #64 is the open fix | V-high E-M | #64 |
| 12.13 | **`.env.example` is not reproducible from a clean clone** — the code reads 17 names; the file omits `PLACE_RESOLVER`, `PLACE_LOOKUP_CACHE`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and still lists `NEXT_PUBLIC_PROTOMAPS_API_KEY`, which must not be set | V-high E-S | — |
| 12.14 | **No backup of either hosted database, and the recovery path is a paragraph.** The runbook says so itself: *"This path has never been rehearsed."* **The window is now** — production holds essentially nothing, so the habit costs one command today and a data-loss window later | V-high E-S | before 12.2 |
| 12.15 | The rehearsal: `pg_restore` a dump into a scratch DB, run `db:inventory` against it, then delete the "never rehearsed" sentence honestly | V-high E-S | 12.14 |
| 12.16 | **The local ledger is at `0020` while the schema is ~`0023`**, and its `0017` row carries a name that doesn't exist in the repo. Every "local is at 0023" claim is read off the file list, not the database. `db:reset` is the only fix — dump `extractions` first, they stand between us and the 500/day ceiling | V-med E-S | — |
| 12.17 | **No `maxDuration` anywhere**, and `probe/route.ts` justifies that with *"never meant to reach a deployed environment"* — **now false**; it is the shipped import path, doing oEmbed + an LLM call + N Google lookups serially. Measure p95 on a preview before specifying the streaming route | V-high E-M | 12.1 |
| 12.18 | `rateLimitedLocal` has zero production call sites — the route advertises a 429 it can never send | V-high E-M | 11.12 |
| 12.19 | ~312 KB brotli to render a two-field login; no maplibre in those chunks, so it's almost certainly `supabase-js` reaching the client. Next measurement: read `next build`'s per-route First Load JS | V-med E-M | — |
| 12.20 | No security headers beyond Vercel's HSTS — no `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors`. ~15 lines | V-med E-S | — |
| 12.21 | `actions/checkout@v4` / `setup-node@v4` are on deprecated Node 20 — an annotation on every run | V-low E-S | — |
| 12.22 | **Nobody reads the logs.** Instrumentation is genuinely good (structured JSON, redacted coordinates, `classifyGoogleStatus`); there's no drain, no alert, no reporter. Production has 500'd since 2026-08-26 and nothing noticed | V-high E-M | 12.3 |

---

## 13. Onboarding, accessibility, and cross-surface consistency

| # | Item | V/E |
|---|---|---|
| 13.1 | The import overlay doesn't auto-open over an empty library (spec'd, unbuilt) | V-med E-S |
| 13.2 | No first-run coaching — nothing says a pin is tappable, and pins are canvas | V-med E-S |
| 13.3 | Seed links live only on the paste screen, so a user with nothing saved must open import to find them | V-med E-S |
| 13.4 | Touch targets under 44px, each defended individually and cumulative in practice: chips 32, filters 36, import `✕` 36, map controls 32, popup close 20 | V-med E-M |
| 13.5 | No global `prefers-reduced-motion` rule; `motion-reduce:` appears in two files while the sign-in height animation, the popup zoom and the loader pulse all run regardless | V-med E-S |
| 13.6 | Focus never moves into the sheet on pin tap and is never restored on close; the desktop popover does neither | V-med E-S |
| 13.7 | `RemoveSavedPlace` `autoFocus`es the destructive button | V-high E-XS |
| 13.8 | The peek row's `aria-label` replaces the visible heading, so a screen-reader user never hears "12 places in London" | V-med E-S |
| 13.9 | Contrast: `text-muted-foreground/70` and `border-[var(--tag-foreground)]/15` are below the bar | V-med E-S |
| 13.10 | No skip link; the first tab stop on `/map` is the sign-out chip | V-low E-S |
| 13.11 | `<html lang="en">` is hardcoded, so a Hebrew place name is announced in an English voice | V-low E-S |

**Inconsistencies across surfaces** — each is small on its own and they compound:

1. **Four labels for one action:** `Open TikTok` / `Open the original TikTok` / `Open the TikTok` / `@handle's TikTok ↗`
2. **Four empty-state registers:** "Your map starts here." / "No matches in London" / "You've been to all of them" / "No places named"
3. **Four orderings, none stated:** list `created_at desc`, `Elsewhere` count-desc, review extraction-order, dishes model-order
4. **Two ways to leave one screen:** `Back to the map` (ghost, footer) and `✕` (36px, top-left)
5. **Two "no caption" screens** depending on whether it arrived as a probe result or a domain error
6. **Confidence** banned by rule on review, printed as `· 87% confidence` on detail
7. Name truncation without `dir="auto"` in three of four surfaces (§5.6)

---

## 14. Transcription, audio and visual understanding

**Ruling: dead, not dormant — and the reason has changed, which is why it shouldn't be re-litigated.**

Re-verified against TikTok's own developer docs on 2026-08-28: the Display API still returns seven
metadata fields for the authenticated user's *own* uploads (doc updated 2026-08-19); the Research API
still requires a non-commercial academic applicant; the embed player exposes a caption *icon* toggle
(`closed_caption=1`) and a player-state postMessage bus — **but no message carries caption text**
(doc updated 2026-08-04); nothing in the 2026 changelog touches oEmbed or transcripts. The binding
ToS clause forbids extraction *"using any automated system or software that is not provided by
TikTok"*, which still binds any vendor we'd pay to do it for us.

**But compliance is no longer the decisive fact.** On the E7 corpus (n=16 posts, human-labelled):

| Route | Posts recovered of 16 |
|---|---|
| Caption-only, today | 3 |
| **A user typing the venue name** | **+3 to +5** |
| Perfect ASR over the audio, if it were ever permitted | **+5 max — the same five posts** |
| Share target / auto-captions / data export | +0 recall |

**The compliant route and the forbidden route reach the same five posts.** Transcription isn't a
route to information we can't otherwise get — it's a route to doing the typing for the user. That's a
convenience argument, not a capability argument, weighed against a ToS breach and our only VERIFIED
retrieval mechanism. Best case by *any* route is 8 of 16; three posts ("comment for the name") are
unrecoverable by everything including perfect ASR.

**Only two things reopen it:** TikTok publishing a caption-track or on-screen-text field for
*arbitrary public posts*, or an owner + `security-privacy` ruling on a licensed vendor — which the
ceiling above no longer justifies asking for.

| # | Item | V/E | Dep |
|---|---|---|---|
| 14.1 | **"What's it called?" on the `no_places` screen** — one field into the extractor and resolver we already run. Highest ceiling movement per line of code in this pass. **Needs an owner ruling**: `04` §9.5 records that manual caption paste was *withdrawn by you*, and that withdrawal is what caps this route — not TikTok. Narrowed from "paste the caption" (redundant) to "tell us the name" (the missing datum) | V-high E-S | **owner ruling** |
| 14.2 | Ship S8 manual add — the promised destination for **two** screens that have none: `no_places` and the `UNSUPPORTED_HOST` Instagram/YouTube redirect. Its exit criterion is stale against the Google Places switch | V-high E-M | = 3.2 |
| 14.3 | Exploit `@`-business-mentions and `📍` — free, ToS-clean, and the top recommendation of two prior reports, still unexploited. Resolver-side text search on the handle | V-high E-M | = 8.2 |
| 14.4 | **Accept a pasted list of links, or the user's own TikTok data-export zip.** ToS-clean (it's their data, handed to them by TikTok), matches the "recommendation graveyard" premise exactly, and makes your ~100-TikTok batch one action. **Sequence after 14.1/14.2** — landing it first manufactures ~73 no-places screens with nowhere to go | V-high E-M | 14.1, 14.2 |
| 14.5 | Android `share_target` in the manifest — genuinely tiny. Document as **Android-only** in the same commit: iOS Safari has no `share_target` (WebKit bug 194593, still open) and won't on our timeline | V-med E-S | manifest (12.5) |
| 14.6 | **Data Portability API — new, and not in our docs at all.** User-authorised via Login Kit; carries watch/share history with links and post titles, and Favorites under the full-archive scope. **No captions, no transcripts, no third-party media.** A *volume* mechanism, not a recall one, and app-review-gated | V-med E-L | app review |
| 14.7 | Correct `04` §1 with the embed-player detail and a Data Portability row, so the next session doesn't rediscover the API and mistake it for a transcript route | V-med E-S | — |
| 14.8 | Photo carousels are misreported — oEmbed returns `type: "video"` for them. `onImageChange` on the embed bus might carry a carousel index; testable against TikTok's own embed with no scraping | V-low E-S | — |
| 14.9 | *Competitive note, not a task:* **TikTok GO Dining** (changelog 2026-01-20) ships merchant APIs for outlets and vouchers — TikTok is building its own venue graph next to this product's premise | — | — |

**Cover-frame OCR stays refuted** — measured 1/8 recall, and it read shopfronts as recommendations.
Don't re-run it.

---

## 15. The twelve I would start with

Ordered by value per hour, not by area.

1. **Fix production** (12.1 → 12.2 → 12.3) — the app is 500ing for every signed-in user and the health check says it's fine.
2. **Restore `source_url`** (§0, P0) — one line, and it's been silently dead for two migrations.
3. **App shell in one commit** (12.5–12.7) — icons, error pages, pinch-zoom, a real title. Lowest risk, highest visible credibility.
4. **Email confirmation + password reset** (11.1–11.4) — anyone can sign up as anyone, and a forgotten password is currently a lost account with no support channel.
5. **Rate-limit the import route** (11.12) — one free account can exhaust the 100/day Google quota and take the product down on demo day.
6. **Make "no places found" the designed screen** (3.1) — it's the modal outcome, the screen built for it is unreachable, and the live path is a muted sentence in a half-empty card.
7. **The import rail's three defects** (2.1, 2.3, 2.5) — Enter does nothing, a step is shown that never runs, and Cancel eats the URL. The flagship flow's longest moment.
8. **Category parity + category as a filter** (1.1, 1.5) — a place must not change what it is by being saved, and the dimension that colours every pin should be narrowable.
9. **Say when a pin is a guess** (6.3) — we say "approximate" during import and then hide a 65–470 m guess behind a pin that looks resolved.
10. **Rename and fix-this-place** (6.1, 6.2) — the first is zero migrations and only missing its trigger; the second turns every recognition miss into a one-tap correction.
11. **Undo on delete** (6.4) — the one irreversible action, two taps away.
12. **The four offline recognition wins** (8.3, 8.4, 8.25, 8.1) — a one-line duplicate-rule fix, a dead `regionCode`, a ruling already settled by measurement, and a corpus re-run. No quota, no network.

**Deliberately not on this list:** collections (§9 — R1/R2 at most, and only after OD-1), hosted
sharing (§10 S2b), transcription in any form (§14), and anything that needs the Google Places quota
raised.

---

## 16. Owner queue — settled 2026-08-29

### Rulings taken

| # | Question | Ruling |
|---|---|---|
| 1 | **OD-1** — does the info boundary admit `user_tags`? | **Deferred to L2 with the rest of collections.** §9's R1 and R2 are off the table at L1. Consequence: the six-facet tag problem (§1.2) must be fixed **extraction-side only** — cleaner tags out of the model, drop neighbourhood tags (§1.6), enforce the English rule (§1.4). The user's own labels wait for L2 |
| 2 | **Reopening "tell us the name"** (14.1) | No preference expressed → **my call, and I'm taking the narrow version**: venue name only, on the no-places screen. Smallest and most reversible; distinct from the withdrawn "paste the caption". Say the word if you'd rather it stayed withdrawn |
| 3 | **CI spend** (12.9) | **Cut the waste, keep the gate** — remove the duplicate `next build`, add path-aware skipping with skipped jobs still reporting success so `merge-pr.sh` doesn't break. No spend |
| 4 | **Backfill** | **Backfill, preserving hand-written rows** — re-extract only model-authored enrichment, skip the Anat Bakery and Kiaans fixture sentences. ~11 Gemini calls |
| 5 | **Local probe accounts** | **Done** — the four accounts the auth audit created are deleted from the local container. `demo@example.com` and all 31 saved places intact |

### Still genuinely yours — nobody else can do these

1. **Restore the Vercel env store** (12.1) — the actual fix for the production 500. No Vercel CLI here, no token, and entering API keys into a third-party form is something I must not do regardless. `docs/vercel-env-restore.md` §2 has the table; scope per environment, then redeploy.
2. **`PROD_DATABASE_URL` (or `SUPABASE_DB_PASSWORD` + `SUPABASE_PROJECT_REF_PROD`) in `.env.local`.** All three are **present as names but empty**. Without one of them I cannot back up production, and I will not push 14 migrations to it unbacked — free-tier Supabase has no PITR and the recovery path has never been rehearsed.
3. *Deferred by the owner 2026-08-29 unless they start blocking:* the Google Places quota, and the product name.

### Mine, not yours — moving now

- **Staging is backed up** (`~/p-002-backups/staging-20260828T141752Z.dump`) and its 5-migration push is unblocked.
- **Production is blocked on (2) above** — 14 migrations, no backup possible yet.
- The two P0 bugs in §0, the CI cut, and the backfill.
- **No PR needed for the branch:** PR #66 already merged `session/2026-08-28-parallel-streams` into `main`; `origin/main` and HEAD are identical. An earlier claim in this session that 57 commits were unlanded was measured against a stale local `main` ref.

---

## 17. Session pause — resume from exactly here

Paused by the owner 2026-08-29. **Standing hold: no further changes to production, Vercel,
Supabase auth, Google Places or Gemini** until the owner lifts it.

### Done and verified this session

- **Production rebuilt from zero and verified.** Ledger `0001 → 0023`, none missing.
  `save_place` is the 4-arg form, `saved_places` has 8/8 enrichment columns, `poi_index`/
  `poi_regions` present, `anon` holds 0 grants. The push's own inventory proof passed all 18
  assertions. Backups: `~/p-002-backups/prod-20260828T143102Z.dump` (pre-rebuild) and
  `staging-20260828T141752Z.dump`.
- **Supabase CLI link restored to staging** (`jfuqjzubphfhfleqnkno`). Verify this before any
  hosted command next session.
- **Four owner rulings recorded** in §16, and the local probe accounts deleted.
- `.env.local`: `PROD_DATABASE_URL` supplied by the owner; `SUPABASE_PROJECT_REF_PROD` filled by
  me (non-secret). Backup at `.env.local.bak-before-ref-fill`.

### Deliberately NOT done — the resume point

The session stopped on a live decision, not mid-task. The owner declined to restore the Vercel env
store yet, on the grounds that a working production exposes the Gemini (500/day) and Google Places
(100/day) budgets to abuse. **That reasoning is correct and evidenced:** `rateLimitedLocal` has zero
production call sites, `enable_signup = true`, `enable_confirmations = false` — so one unconfirmed
signup plus a loop of distinct URLs drains both budgets.

Two options were on the table when we paused, and **neither has been chosen**:

- **Option A** — restore the Vercel env store (§12.1, the walkthrough is in the session transcript),
  then immediately turn **off** *Allow new users to sign up* in the production project's
  Authentication → Sign In / Providers → Email. Production has **zero users**, and the quota is only
  reachable through `/import`, which needs an account — so closing signup reduces the spend surface
  to nil while fixing the outage.
- **Option B** — hold Vercel entirely until the rate limit and email confirmation ship. Costs
  roughly a session; production keeps 500ing meanwhile.

**Unverified and worth checking first:** whether hosted production actually has signup open. It is
inferred from `config.toml`, not measured — `.env.local` holds no production anon key, so
`/auth/v1/settings` could not be queried.

### Still open, unblocked, and needing nothing from the owner

The two P0 bugs in §0 (production 500 is env-only now that migrations are current; and
`source_url` dead since `0017`), the CI cut (§12.9–12.11, ruled), the enrichment backfill
(ruled, ~11 Gemini calls — **blocked by the standing hold on Gemini**), staging's clean 5-migration
push (owner asked to keep on hold), and everything in §15.

### Housekeeping

- `scripts/rebuild-prod.sh` is a **one-off** and should be deleted once the owner has reviewed what
  ran. It is untracked.
- `docs/product-backlog-2026-08-29.md` (this file) is untracked. Neither has been committed.
- If `.claude/settings.local.json` was created for the rebuild permission, it can be removed —
  the production DB work it existed for is complete.
