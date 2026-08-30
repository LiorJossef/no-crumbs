# Handoff — the list scope, the PlaceDetail reuse, and the review card

Session of **2026-08-29**, on `feat/country-band-map-layer`. Eight commits, `d1ccc0c`..`a2d2b6e`.
Tree is clean apart from two owner-owned untracked files (`docs/product-backlog-2026-08-29.md`,
`scripts/rebuild-prod.sh`) and this handoff, which the owner asked not to commit.

`npx tsc --noEmit` clean · `npx vitest run` **1678/1678** · `npm run check:layers` 18 OK ·
`npx eslint .` 0 errors, the 2 pre-existing `<img>` warnings. **Nothing hosted was touched**; no
migration was written or applied; no Google Places quota was spent (both browser imports were
re-imports with extraction and resolutions already cached).

---

## 1. DONE and browser-verified

### The sidebar no longer describes a map that isn't there — `eba8fd1`, `8a15423`

The reported symptom: zoom out until the country badges appear and the list still says
`18 places in London`.

**The root cause was not the list model.** `list-scope.ts` shipped complete-but-unwired in
`0ce9512`, and wiring it in was necessary but not sufficient: `pannedSinceReport` in
`map-surface.mapcn.tsx` was written by **`dragend` alone**, so a wheel, pinch or double-click zoom
reported `userInitiated: false`. A zoom is the *only* gesture that can cross a zoom band, so every
transition `scopeAfterCameraSettled` defines was dead code. `zoomend` now reports as well, guarded
on **`originalEvent`** rather than on the event name — `zoomend` also fires for `flyTo`, `fitBounds`
and `easeTo`, so keying on it alone would let all six camera movers rewrite the list, which is worse
than not reporting zooms at all.

Verified in a browser at 800×1247 against the real local library (32 places, 2 countries):

| Gesture | Map | Sidebar |
|---|---|---|
| start | Tel Aviv pins | `14 in Tel Aviv-Yafo` |
| zoom out to area band | `Tel Aviv-Yafo 14` badge | `14 in Tel Aviv-Yafo` |
| zoom out to country band | `🇮🇱 Israel 14` badge | **`32 in 2 countries`** |
| tap the Israel badge | badge gains the mint ring | **`14 in Israel`** |

**Camera mover 5 is reversed** (owner ruling, 2026-08-29). Its comment argued that framing a country
must change nothing else; it is rewritten to say it was reversed and by whom. The enumeration also
claimed "exactly five" movers while **mover 6 was already running and documented** in
`map-surface.mapcn.tsx` (`selectedOcclusionFraction`); it now says six.

**A real bug in `list-scope.ts`, found by writing its 55 tests before wiring it.** `scopeLabel`'s
global arm collapsed to the single country's name whenever `countries.length === 1`. The countryless
bucket is labelled after its **first area**, so a library of three Kowloon saves and two Osaka saves,
none carrying a country, rendered `5 places in Kowloon` over a list plainly holding Osaka. The
shortcut is now taken only when the label speaks for everything under it.

### `PlaceDetail` names the row it writes to — `a4df729`

`CollectionPlaceDetail` was a hand-copied layout kept in step by eye, and the obvious fix was a trap:
`PlaceDetail` took the `saved_places` id it writes to from `place.id`, which is a **collection item**
id on `/collections/[id]`. Naive reuse would have aimed rename, been, category, note, remove and
add-to-collection at a row the caller does not own.

Two things make the reuse safe, both structural rather than a flag:

- **`savedPlace: { id, visited } | null`, required and undefaulted.** One object, not an id and a
  `visited` beside it — the two are facts about the same row, and passed separately they can
  disagree with a **silent** failure: an id with a null `visited` would render the read-only screen,
  so every control on `/map` would vanish with nothing raised. The agent that built it flagged this
  and deferred; I took its recommendation and collapsed the pair.
- **`SharedOnlyPlaceFacts`** pins every overlay key to `never`, so putting a private field on the
  collection path is a compile error rather than a privacy incident.

`place.id` is no longer read anywhere in the component. The privacy claim holds twice over and
independently: `CollectionPlace` has no overlay fields because the query never selects them, and the
type would reject them if it did.

### The review card shows one clean result — `42c3283`

Owner ruling, after using it. **Pre-ticked again**: a duplicate check had started un-ticking an
already-saved place, and on a post whose only candidate was a duplicate the single card arrived off
and `Select a place to save` was **disabled** — the screen offered nothing to do at all. The
shortlist is closed behind `Not this place?` and shown **only when there is more than one option**.
Three redundant lines cut (the caption's own wording for the name, directly under the name it
resolved to; the verbatim caption fragment; the duplicate warning) and two apologetic paragraphs
cut. What is left is name, category, address, checkbox.

### Badge centring — `a2d2b6e`

Diagnosed as marker geometry, not data: the country means are solidly over land (GB `51.485,
-0.124`, IL `32.071, 34.771`). `icon-text-fit: 'width'` fits the icon to the *text* box, so the
asymmetric flag cap put the drawn pill's centre **10 CSS px left** of the country's mean — ~244 km at
z1. Fixed with a data-driven `text-offset` on the country layer only. **Not visually confirmed**;
10 px is a judgement about how it looks and that is the owner's.

### Smaller — `d1ccc0c`, `3cb6f81`, `d2703bb`

19 tests for `universal-input.ts`, which shipped with none (verify was green because the module is
unreachable, not because it works). The comment at `probe/route.ts` that made manual add look blocked
is corrected — `sps_insert_own` is a policy on **`saved_place_sources`**, and `save_place` only
reaches it inside `if p_source_id is not null`, verified against `0006` and `0017`.

**A sweep for the trapdoor `34e5445` fell through found two more.** The live one:
`share-panel.test.ts` asserts on the domain's `MEMBER_NAME_MAX_LENGTH` while `name-prompt.tsx`
rendered `maxLength` from its own copy — same value, so nothing looked broken, but moving the domain
limit would have moved validation and left the field behind with the test still green.
`COLLECTION_NAME_MAX_LENGTH` in `use-create-collection.ts` was simply dead.

**Still duplicated and left alone:** `PEEK_PX`, across `place-sheet.tsx`, `sheet-geometry.ts` and
`query-rect.ts`. That one is *documented* at each site — `place-sheet.tsx` transitively imports
`server-only`, so no unit test can reach it. It still deserves a pure home.

---

## 2. OPEN — the one thing I did not finish

**A country badge tap scopes the list but does not fly the camera.** Half of mover 5 works and half
does not. Instrumented rather than guessed, and here is exactly how far it gets:

```
[PROBE focusBounds] {"got":true,"same":false,"hasMap":true,
                     "fb":{"bounds":{...Tel Aviv...},"minZoom":4.65,"maxZoom":8}}
[PROBE fit] {"padding":{"top":148,"bottom":176,"left":48,"right":48},"cw":385,"ch":714,
             "camera":{"zoom":8,"center":{"lng":34.766,"lat":32.038}},
             "before":{"z":0.4798,"c":{"lng":35.018,"lat":~0}}}
```

So: the effect fires, the guards pass, `cameraForBounds` returns a **correct** target, and `easeTo`
is called. The camera does not move. `easeTo` itself is fine — called directly from the console on
the same map instance, with `duration: 600`, it animates and completes (`movestart → zoomstart →
zoomend@8.00 → moveend@8.00`).

**The lead worth following first:** `before.z` is `0.4798` — the map was at **world view** when the
tap happened, and between two consecutive taps it moved only `0.4798 → 0.4913`. That is the shape of
an animation being started and immediately reset. Note the map is *supposed* to have framed the
anchor area on load. Something is re-fitting the camera to a world view and fighting the flight.

**It is intermittent.** On a later load the initial framing worked correctly (Tel Aviv, `14 in Tel
Aviv-Yafo`). `whenReady`'s own comment describes this exact failure — a map created before its
container has a size finishes its style but never fires `load`, leaving the camera "stranded at zoom
0". So the two symptoms are plausibly one bug: when the initial framing loses that race, the camera
sits at world view *and* something keeps re-asserting it.

Next step I would take: check whether the `bounds` effect's dependency (`initialBounds =
anchorCluster?.bounds`) is changing identity across renders and re-firing `fitToBounds`, which would
explain both the stranding and the overridden flight. **The debug probes have been removed** from
`map-surface.mapcn.tsx`; the snippets above are recorded here so nobody has to re-derive them.

---

## 3. The dedup answer, preserved — because the code was reverted

`supabase-database` measured this against the local container (every write inside
`begin; … rollback;`). **The module it wrote was reverted**, so this section is the only record.

**The gap is at `places` identity — not at `saved_places`, and not only in the UI.** `saved_places`
is airtight: `unique (user_id, place_id)` (`0006`) plus an idempotent `save_place`, both proved. The
failure is that two `places` rows get minted for one venue, after which every layer downstream
behaves correctly and the user still gets two pins.

`resolve_place` is idempotent on an exact provider id and fragile on everything else. Second call
with a different provider id and the same name: **10 m away → reused; 150 m away → duplicate.** Same
coordinates, name in Hebrew instead of English → duplicate. Same everything, `country_code` NULL vs
`'IL'` → duplicate.

The owner's library proves it: 32 saves over 32 `place_id`s for about twenty real venues. `hakosem`
has **3** rows spanning 568 m; `kohi` has 2 rows **1.11 m** apart, one Overture and one Google, same
video, differing only because one name is English and one Hebrew.

**Every true duplicate came from the same TikTok, re-imported.** `source_id` is a discriminator
already stored and never used.

The honest ladder, strongest first:

1. `place_provider_refs (provider='google', provider_place_id)` — exact, already `UNIQUE`, already
   RLS-readable by the user's own session, **no migration**. Covers 2 of 32 places today.
2. `place_name_key(name)` + `country_code` + **non-null** `address_line` + a distance bound.
3. **Same `source_id` + same `place_name_key`** — the signal every real duplicate carries and no
   false pair does. This is the rung that actually fires on the real corpus.
4. Nothing else. `name_key` + 75 m is what exists and misses by design: `llm_guess` coordinates are
   65–470 m out and drift a median 327 m between two runs of the same caption.

**Address alone is never an identity.** Against the 10 462-row Tel Aviv `poi_index`, **1495 address
groups hold more than one distinct venue — 42% of the index**. `הרוקמים 26, חולון` holds 20 distinct
restaurants at one address string. Add the name and it collapses to **8 of 10 462**, all chains in
different cities. Also: `address_line` is NULL on 9 of 32 places, including **both** `The Life
Goddess` rows — absent exactly where it is most needed.

---

## 4. Decisions carried for the owner — none urgent, all irreversible

1. **Should `resolve_place` gain a fourth matching arm?** (name + country + non-null equal address +
   a widened ~500 m bound, keeping the existing 75 m no-address arm.) This is the only thing that
   stops duplicate pins at the source. It changes identity semantics for every future import and
   **cannot be un-run once rows have merged**. Migration.
2. **Collapse the ~10 existing duplicates?** `merge_places` does it correctly — proved on the real
   `The Life Goddess` pair, 2 pins → 1, aliases and provenance preserved. But it is `service_role`
   only and **there is no user-reachable path to it**: the owner cannot merge two of their own pins.
   Migration either way.
3. **`save_place` clobbers `note` on a repeat save.** `0024:651`,
   `do update set note = coalesce(excluded.note, saved_places.note)`. I verified the agent's claim
   and it **overstated the severity**: the path is currently *unreachable*, because
   `saveExtractedCandidates` hardcodes `note: null` and `saveCollectionPlace` passes none. So it is
   not live data loss — it is a landmine that **arms the moment manual add ships**, which is in
   scope. `extracted_reason` was deliberately made INSERT-only and documented; `note` never got the
   same treatment.
4. **Point local dev at a hosted database?** The owner asked about writing imports into prod for a
   shared cache. Both caches (`place_lookup` from `0023`, and `extractions`) live in whatever
   database `.env.local` names, so sharing one is a real quota saving against the 100/day ceiling.
   **I recommended staging, not prod** — a `.env.local.bak-staging` already exists. Prod would put an
   RLS-bypassing production key on the laptop (not undone by switching the URL back), mix test
   imports into the owner's real library with no user-reachable way to remove or merge them, and run
   against a schema this branch has drifted from. Prod also still 500s on `/map` and `/import`.
   **Not acted on.**

---

## 5. Known drift, worth knowing before anyone reads a red run as a regression

- **Local migration history has drifted from this branch.** Applied: `0001–0020`, `0024–0027`.
  `0027_import_rate_limit` has **no file on this branch** (it is on `0a37593`) yet `rate_limit_events`
  exists in the container. A `db:reset` on this branch would not reproduce the current database.
- **`npm run db:test` cannot run against this container** — `0008_policy_tests.sql:158` asserts
  `count(*) from extractions = 1` and there are 23 real rows. It needs `db:reset` first.
- The resolver was **unreachable** during one browser test (7 of 8 pins fell back to the caption).
  Pre-existing, unrelated to this session's changes, and worth a look.

## 6. Things surfaced by this session's wiring and deliberately not chased

1. **`Elsewhere` duplicates under a country scope.** With the UK selected the body shows all 18 UK
   places *and* `Elsewhere` still lists London and Bristol, because `elsewhereGroups` subtracts one
   area id and a country scope has none. Tapping the redundant row still works — a wart, not a break.
   Fixing it means deciding what `Elsewhere` *becomes* under a country and a global scope.
2. **No scroll reset when switching country → country.** Both list surfaces key their reset on
   `activeAreaId`, which is `null` for every non-area scope.
3. **The post-import anchor is clobbered** — the import writer sets the scope to a place id not yet
   in `places`, and the render-phase fallback overwrites it before the revalidated rows land. The old
   `activeAreaAnchor` code did the same, so **not a regression**, but the comment claiming it
   "resolves itself once the refreshed rows arrive" is wrong. An import into a new city flies the
   camera there while the list stays put. Needs a pending-anchor concept that survives the data gap.

## 7. Agents used

`nextjs-architect` (wrote the `PlaceDetail` reuse and its 16 tests; I overrode its two-prop shape for
the one it recommended itself). `maps-geospatial` (wrote the scope wiring, the 55 `list-scope` tests
and the badge-offset fix; diagnosed the `userInitiated` bug but **could not apply it** — the file was
held by another agent, so I applied it). `supabase-database` (the §3 investigation; its Layer 1
implementation was reverted after the owner's ruling removed its only consumer — I stopped it
mid-flight for that reason).

**None of their results were taken on their word.** Every claim above that says "verified" was
re-checked by me, and two agent claims were corrected: the `note` clobber's severity (§4.3), and the
handoff's own assumption that the collection privacy boundary was already a property of the data —
it was true of the read blocks and **not at all** of the five unconditional mutation blocks. Nothing
is left running.

---

# Addendum — 2026-08-29, second session

Two pieces of work on top of the above: the handoff's open camera bug, and the owner's category
and tagging taxonomy. Branches `fix/map-camera-framing` (2 commits) and `feat/category-taxonomy`
(1 commit), both off `44f0737`.

`npx tsc --noEmit` clean · `npx vitest run` **1717/1717** · `npm run check:layers` 18 OK ·
`npx eslint` clean on every file touched. `npm run check:schema` **fails**, pre-existing: the local
container holds 16 tables against the inventory's 15, because `rate_limit_events` exists without a
migration file on this branch — §5's drift, unrelated to any of this. Nothing hosted was touched,
no migration written, no Google Places or LLM quota spent.

**Another session is working in this tree.** `src/app/healthz/route.ts`,
`src/app/healthz/required-config.ts`, `tests/unit/app/healthz.test.ts` and two `docs/evidence/`
files are theirs, uncommitted, and were left alone. They currently fail `tsc`; that is their work
in progress, not a regression from either branch here.

---

## 8. THE TAXONOMY — owner specification, 2026-08-29

Logged here in full because it is now the definition the code is built from, and the two levels are
easy to collapse back into one by accident.

### 8.1 Primary categories — strict, fixed, exactly one per place

| Value | Covers |
|---|---|
| `restaurant` | dining, casual through fine dining |
| `cafe` | cafés, specialty coffee, bakeries, patisseries, ice cream and desserts |
| `bar` | cocktail bars, wine bars, pubs, speakeasies |

The architecture stays **open at the top** — hotels and nightlife events are named as likely
additions — and everything downstream derives from the array rather than restating it.

**UI rules, as specified.** These three determine the map pin colours and icons, and the top filter
chips on the main map display strictly these core categories. *Neither is implemented yet* — see
§8.5.

### 8.2 Sub-tags — controlled vocabulary, 0 to 2 per place, never free text

Cuisines and dining styles, mostly for `restaurant`:
`Italian` (pizza, pasta) · `Japanese` (sushi, ramen, izakaya) · `Asian` (Thai, Vietnamese, Chinese,
pan-Asian) · `Middle Eastern` (Levantine, skewers, local street food) · `Mexican` (tacos, Mexican
street food) · `American` (burgers, BBQ, diners) · `Mediterranean` (Greek, coastal, seafood)

Sub-vibes and specialities, mostly for `cafe` and `bar`:
`Bakery` · `Desserts` · `Specialty Coffee` · `Brunch` · `Cocktails` · `Wine Bar` · `Beer & Pub` ·
`Speakeasy`

### 8.3 What was built

`src/domain/places/taxonomy.ts` is the single definition. The extraction schema, the model-facing
JSON schema and the prompt are all generated from it; none of them restates a value.

- **`categoryHint` narrows from seven values to three.** `ExtractedCategoryHint` is now an alias of
  `PrimaryCategory`, which is also exactly the three the scorer scores — so `categoryHintFor` is
  the identity, and stays only as the seam where the two vocabularies are *declared* equal.
- **`tags` narrows from five free-form to two whitelisted.** The prompt hands the model the list
  verbatim and forbids everything else; `extraction/tags.ts` drops what arrives outside it.
- **Stored keys, shown labels.** The model is shown `Beer & Pub`; the database holds `beer pub`,
  because `normalise` drops the ampersand. `tests/unit/places/taxonomy.test.ts` asserts
  `tagKey(label) === key` for all fifteen, so a label the model can emit and no filter can find is
  a build failure rather than a dead chip.
- **Aliases are spelling variants only** — `Cocktail`→`Cocktails`, `Beer and Pub`→`Beer & Pub`,
  `Dessert`→`Desserts`, `Bakeries`→`Bakery`. `Natural wine` is *not* rounded to `Wine Bar` and
  `Greek` is *not* rounded to `Mediterranean`: rounding is how a closed vocabulary reopens.
- `EXTRACTION_SCHEMA_VERSION` 3→4, `PROMPT_VERSION` p12→p13. Both halves move: v3 and v4 have the
  same *shape* and different *vocabularies*, so only this number stops a cached v3 candidate being
  read as an answer to the new question.
- `stored-candidates.ts` gains a v3 rung. Without it a stored `bakery` failed the current shape and
  then failed v2 and v1 too — both derive from the current schema and inherited the narrow enum —
  and the ladder ended at `invalid`, which the confirm route answers with a **500** on a row that
  is well-formed for its own version. **2 of the 23 local `extractions` rows are affected**, across
  5 candidate objects, all `shop`.

### 8.4 Two decisions taken, both stated rather than assumed

1. **`null` remains a legal category.** The spec says every place maps to exactly one primary
   category; the prompt still says `restaurant` is not a fallback and `null` is. Read as "one
   category, not several" rather than "guess when you cannot tell" — forcing a guess is the one
   thing `CLAUDE.md` says never to do, and `productCategoryFor` still fills the gap from the
   resolver's own category where it can. **Reversible in one line if the owner meant the other
   thing.**
2. **The whitelist is enforced in the domain, not declared as a JSON-Schema `enum`.** An enum is
   the stronger expression and is where this should end up. The one measured fact about this schema
   is that Gemini's `responseSchema` validator is particular about *nested* arrays — 400 at
   `tags.maxItems` 8, 200 at 5, bisected 2026-08-27 — and whether it accepts a 15-value enum on a
   nested array's `items` is unmeasured, with "every import returns 400" as the failure mode. That
   measurement costs live quota, so it waits for a run that is happening anyway.

### 8.5 What this does NOT do, and the numbers the owner needs before deciding

**Nothing was migrated and nothing was re-categorised.** The 31 saved places and the `places` rows
behind them are exactly as they were.

- **The existing tag vocabulary mostly falls outside the whitelist.** Measured on the live local
  database: 35 distinct tags across the library, of which **4** are in the new list — `italian`
  (3 places), `japanese` (2), `specialty coffee` (2), `bakery` (1). The other 31 include
  `hidden gem` (5), `market stall` (5), `hotel restaurant` (4), `pan asian` (4), plus five Hebrew
  tags. They still render, still filter, and are now unreachable by anything new. **Decision owed:
  leave them, drop them, or map what maps.**
- **The three UI rules are not implemented.** Pin colours and icons still key on the eight-value
  `ProductCategory`, and the filter chips still offer whatever the library contains. Implementing
  "strictly these three" makes every `dessert`/`shop`/`attraction`/`other` row unfilterable, which
  is why it is a separate change with the backfill question above attached to it.
- **Not measured against a live model.** The prompt version moved, so every import is now a fresh
  extraction; checking whether the model actually obeys a closed list costs quota. Recommendation:
  fold it into the next corpus run rather than spending a probe on it. The things to watch are tag
  *volume* (expect one tag or none where there used to be three — that is the design, not a
  regression) and whether `null` categories rise, which would say the three-value list is too
  narrow for real captions rather than that the model is being cautious.
- Backlog items this closes or moves: **1.2** (facet mixing) and **1.3** (`bakery` as both a tag
  and a category) are closed at the extraction end. **1.1** (the 7-vs-8 mismatch) is closed
  differently than proposed — by narrowing the extractor to 3 rather than widening the review
  label path to 8. **1.4** (Hebrew tags leaking) is structurally closed: a Hebrew tag cannot be on
  an English whitelist. **1.5** (category is not a filter) and **1.6**/**1.8**/**1.9** are
  untouched.

---

## 9. The handoff's §2 open item — root-caused, fixed, not browser-verified

**`fitBounds` silently does nothing when the padding cannot fit the transform** — `cameraForBounds`
returns `undefined` and `_fitInternal` returns before moving anything, with no exception, no camera
event and nothing in the console. `fitTo` set `framedTo` and `hasFramedOnce` *before* calling it, so
a fit that never happened was recorded as one that did, and `hasFramedOnce` then blocked every
retry for the life of the page.

The probe number in §2 is the proof rather than a coincidence. `zoom 0.4798` in a 714 px container
is exactly `log2(714 / 512)` — the transform's own minimum zoom under `renderWorldCopies: false`,
with the latitude clamped to 0. That is not "a world view"; it is *the camera never having been
framed at all*. Reproduced live: `jumpTo({zoom: 0.48})` on a 1280×720 canvas lands at `1.3219`,
which is `log2(2.5)`, the floor for that width.

The impossible fit is reachable, not theoretical: MapLibre falls back to a 400×300 transform when
it is constructed before its container has a size, and `/map`'s mobile padding is 324 px of
vertical. This also explains the intermittency §2 reported.

Two more defects found by inspection in the same area and fixed:

- **Camera mover 5 recorded no framing at all**, which the file's own header forbids — a resize
  must re-fit "whatever was last framed… otherwise a resize silently undoes a focus flight". A box
  would not have been enough, because `fitBounds` has no resting floor: re-fitting a country
  through it lands on pins for a small country and back on the country marker for a large one,
  which is the pair of failures mover 5 exists to prevent. The record now carries the *kind* of
  framing and `refitFramed` reproduces the request.
- **The `+`/`−` buttons did not count as user zooms.** `handleZoomEnd`'s comment said "there is no
  `NavigationControl` on this map, so there are no zoom buttons to account for" — true of
  MapLibre's own control and false of the map, which renders mapcn's `<MapControls showZoom>`.
  Those call `map.zoomTo`, a programmatic command with no `originalEvent`, so pressing `−` until
  the country badges appeared left the list describing a city the map had stopped drawing: the
  exact symptom `8a15423` was meant to end, surviving on the zoom affordance a desktop user reaches
  for first.

**Not verified in a browser, and the reason matters for whoever picks this up.** The Browser pane
available this session is hidden, which pauses the page's `requestAnimationFrame` loop:
`map.easeTo({zoom: 8, duration: 600})` sits still for 1200 ms, symbol placement never updates so
`queryRenderedFeatures` cannot hit a country badge, `map.once('idle')` never fires, and `computer`
input actions time out after 30 s. What *was* verified live, with the pane forced to render by
screenshotting: the app loads, the map frames Tel Aviv at z13.2, tiles and pins render, `loaded()`
is true, and the list heading is correct. **Someone with a visible browser should tap a country
badge before this is called done.**
