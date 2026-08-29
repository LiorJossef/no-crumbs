# Baseline: what the library list and the map actually do today

> Owner: `qa-reliability`. Task **LIBRARY-IA-2-QA-BASELINE**. Date **2026-08-29**.
> Investigation only. No source file was touched; this document is the only write.
>
> Purpose: an empirical floor under `docs/ux-library-at-scale.md` §2 before the country band is
> implemented, so "the band improved X" is measured against a number rather than a memory.

## 0. What this was measured against, and the one thing that moved under me

| | |
|---|---|
| Tree at start | `6575e29` on `main`, clean but for two untracked docs/scripts |
| Tree at end | `bf652cc` on branch **`feat/country-band-map-layer`**, plus uncommitted work |
| Runtime measurements taken | 11:38–11:50 IDT, against the dev server already running on `localhost:3000` |
| Library | the local dev database: **31 saved places, one user** |

**The orchestrator landed new work in this tree while I was measuring.** Between my first grep
(11:38) and my last (11:50), `bf652cc` plus five uncommitted files appeared:
`src/components/map/summary-features.ts`, `summary-style.ts`, `zoom-bands.ts`,
`src/ui/place/library-summary.ts`, `src/ui/place/elsewhere-groups.ts`.

Two checks say the baseline below is still the baseline:

1. **None of the new modules is imported by any component.** A grep for all five module names
   across `src/`, excluding their own definitions, returns nothing. Nothing renders them.
2. **The five files I measured are byte-identical to `6575e29`** except `active-area.ts`, which
   gained one additive field (`Area.count`) and no behaviour.

So the runtime findings describe the app as shipped. The one claim that has already expired is
§1.3's "zero importers", and it is corrected in place below.

Everything is labelled **MEASURED** (I ran it and read the number), **CALCULATED** (arithmetic from
measured constants), or **READ** (source only, no runtime evidence).

## 1. World zoom today

### 1.1 There is no zoom gating on the pin layer. MEASURED and READ.

`src/components/map/place-marker-layer.tsx:129-138` adds exactly one layer and passes it no
`minzoom` and no `maxzoom`:

```ts
map.addLayer({
  id: pinLayerId,
  type: 'symbol',
  source: sourceId,
  layout: pinLayerLayout(styleTextFont(map)) as never,
  paint: pinLayerPaint() as never,
});
```

`pinLayerLayout` (`src/components/map/marker-style.ts:231-270`) returns no zoom key either. The only
zoom-dependent thing in the whole pin path is the *label* gate,
`'text-field': ['step', ['zoom'], '', LABEL_MIN_ZOOM, ['get','name']]` with `LABEL_MIN_ZOOM = 14`
(`marker-style.ts:219`) — that gates the name, never the icon.

A grep for `minzoom|maxzoom` across `src/` now returns hits only in the two **unwired** new files
(`zoom-bands.ts`, `summary-style.ts`) and one unrelated `maxZoom: FIT_BOUNDS_MAX_ZOOM` in
`map-surface.mapcn.tsx:316`. **Every saved place draws its own pin at every zoom, from z0 up.**

### 1.2 What that looks like, on this library. MEASURED.

Screenshots taken at 390×844, `deviceScaleFactor: 2`, signed in as the local demo user, zooming out
with the keyboard from the arrival camera.

**At roughly z4 (Iceland to Italy on screen): London's 18 saved places render as one red restaurant
pin.** Nothing on screen says 18. Tel Aviv is off screen.

**At world zoom (Greenland to South Africa on screen): the entire library — 31 places, 2 countries —
renders as two pins.** One red `restaurant` fork over England, one pink `dessert` cone over Israel.

The pink one is the finding. Product categories in the Tel Aviv area, from the database:

| category | n |
|---|---|
| cafe | 5 |
| restaurant | 5 |
| bakery | 1 |
| bar | 1 |
| dessert (`Gelalucci`, stored as `shop`) | 1 |

So the single glyph representing 13 places is a **1-of-13 minority category**. It is the most
recently saved member — `icon-allow-overlap: true` and `icon-ignore-placement: true` mean all 13
pins are genuinely drawn, perfectly stacked, and the one on top wins. The map is not merely
uninformative at world zoom; it is confidently wrong about what is in the city.

### 1.3 Why the stack is exact, not approximate. CALCULATED.

Measured cluster bounds, against the pin bitmap's measured size of **37 × 52.5 CSS px**
(`pinGeometry(false)`, `marker-style.ts:110-129`):

| zoom | London (18 places) spread | Tel Aviv (13 places) spread |
|---|---|---|
| z2 | 0.6 × 0.8 px | 0.2 × 0.2 px |
| z3 | 1.2 × 1.7 px | 0.4 × 0.5 px |
| z4 | 2.3 × 3.3 px | 0.7 × 1.0 px |
| **z4.5** (the spec's band edge) | **3.3 × 4.7 px** | **1.0 × 1.4 px** |
| z6 | 9.3 × 13.2 px | 2.9 × 3.9 px |
| z8 | 37.3 × 52.8 px | 11.7 × 15.4 px |

Below z4.5 each city occupies under 5 px against a 37 px pin: a single pin-shaped blob. Even at
**z8** London's spread is exactly one pin width — the pins are still fully overlapping at the top of
the spec's *area* band, which is an argument for the area band rather than against it.

### 1.4 Importers of the country helpers — the handoff's claim, corrected. MEASURED.

The handoff said `bucketAreasByCountry` and `buildCountryDiscImages` have zero importers outside
their own files and tests. **That was true at 11:38 and is false at 11:50.** Verified, not repeated:

| symbol | importers at `6575e29` (11:38) | importers now (11:50) |
|---|---|---|
| `bucketAreasByCountry` | its own file + `tests/unit/places/country-bucket.test.ts` only | `src/ui/place/library-summary.ts:16` |
| `buildCountryDiscImages` | its own file + `tests/unit/map/country-flag-image.test.ts` only | still zero |
| `countryDiscImageId` | zero | `src/components/map/summary-features.ts:18,72` |
| `COUNTRY_DISC` | zero | `src/components/map/summary-style.ts:14` |

The important part is unchanged: **none of the new consumers is reachable from a rendered
component.** `library-summary.ts`, `summary-features.ts`, `summary-style.ts`, `zoom-bands.ts` and
`elsewhere-groups.ts` have no importer in any `.tsx` file. The country level exists as data and has
no surface.

**Also dead: `mapAccessibleName` (`src/ui/place/active-area.ts:436`).** Exported, covered by two
assertions in `tests/unit/ui/active-area.test.ts:390,403`, and imported by nothing in `src/`. The
canvas's actual accessible name at runtime is the string `Map`. Its 12 tested characters of "the
list below names all 12" reach no user. Not in scope for the band, but it is a live example of the
gap this baseline exists to catch: green tests over an unreachable export.

## 2. The list's scroll container, and what happens at its end

### 2.1 The scroll element. MEASURED.

One scroller, and only one, inside `[data-testid="place-sheet"]`:

`src/components/sheet/place-sheet.tsx:392-395`
```
div[data-vaul-no-drag].min-h-0.flex-1.overflow-y-auto.pb-[calc(env(safe-area-inset-bottom)+1rem)]
```

At the `full` stop, 390×844, 18 rows in the active area:

| | |
|---|---|
| `clientHeight` | 660 |
| `scrollHeight` | 1721 |
| max `scrollTop` | 1061 |
| `padding-top` | `0px` |
| `padding-bottom` | `16px` (the `env()` inset resolves to 0 in headless Chromium) |
| bounding rect | y 184 → 844 |

### 2.2 The exact DOM order after the last `PlaceRow`. MEASURED.

The scroller has exactly three element children, in this order:

1. `<ul>` — 18 `PlaceRow` `<li>`s (`place-sheet.tsx:400-404`)
2. `<section class="mt-2 border-t border-border/70 pt-3">` — `ElsewhereSection`
   (`place-sheet.tsx:406`, defined at `:628`); its own children are the `ELSEWHERE` `<h3>` and a
   `<ul>` of area-row buttons
3. `<a href="/collections" class="flex min-h-11 …">` — `CollectionsNavRow`
   (`place-sheet.tsx:407`)

`ClearSearchEscape` is also inside the scroller, first, but only when `heading.escape ===
'clear-search'` (`place-sheet.tsx:397-399`).

The desktop panel is structurally identical: `place-desktop-panel.tsx:131` is the scroller,
children `UL(18)`, `SECTION`, `A` in the same order.

### 2.3 Is the heading / search / filter block sticky? **No — and it does not need to be.** MEASURED.

This is the yes/no.

**There is not one `position: sticky` or `position: fixed` element anywhere inside the sheet.**
A runtime scan of every descendant returned `stickyCount: 0` at `full`, at `half`, and on desktop.

**But the block is not inside the scroll container at all.** The heading (`:361`), the search field
(`:371`), the `Not been yet` chip (`:378`), the active-tag pill (`:380`) and the heading note
(`:385`) are siblings *above* the scroller inside a `flex flex-col` (`:308`). They cannot scroll
away because nothing scrolls them.

Measured, at `full`, before and after driving the scroller to its maximum `scrollTop` of 1061:

| | scrollTop 0 | scrollTop 1061 |
|---|---|---|
| heading rect top | 30 | **30** |
| search rect top | 72 | **72** |

Measured at `half` (snap `0.55`; sheet top 379.8), before and after the same:

| | scrollTop 0 | scrollTop 1061 |
|---|---|---|
| heading rect top | 409.8 | **409.8** |
| search rect top | 451.8 | **451.8** |

**Verdict on spec §1.3 rule 7: the required *outcome* — heading, search and filters reachable
without scrolling back, at `half` and at `full` — already holds today, by layout rather than by
`position: sticky`.** The filter *bar* the rule describes does not exist yet; when it is added, the
cheap correct move is to put it in the same block above the scroller, not to make it sticky inside
one. Adding `sticky` inside the scroller would be a regression: two stacking contexts where there
is currently none.

### 2.4 DEFECT, and it lands exactly where the country band goes. MEASURED.

**At the `half` stop, the bottom ~380 px of the list cannot be reached by scrolling. That includes
the whole `Elsewhere` section and the `Collections` row.**

`Drawer.Content` is `h-full max-h-[100dvh]` (`place-sheet.tsx:229`) at every stop; vaul implements a
snap point by translating that full-height box down. So at `half` the flex column is still sized for
844 px, `flex-1` still gives the scroller 660 px, and 379.8 px of the scroller sits below the bottom
edge of the screen.

Measured at 390×844, `half`, after 40 real wheel events (not a programmatic `scrollTop` write):

| | |
|---|---|
| viewport height | 844 |
| scroller rect | y **563.8 → 1223.8** |
| below the fold | **379.8 px** |
| `scrollTop` | 1061 = its maximum |
| `ELSEWHERE` section rect | y **1085.8 → 1162.8** |
| `Collections` row top | y **1163** |

At maximum scroll the `Elsewhere` section is 242 px below the bottom of the screen. The screenshot
at that state shows rows 13–15 of 18 as the last visible content.

Two things make this worth writing down rather than filing quietly:

- **Playwright's `isVisible()` returns `true` for the `Elsewhere` button in this state.** It checks
  CSS visibility and a non-empty box, not whether the pixels are on the screen. An e2e assertion
  written the obvious way would pass over this defect. Any test guarding the country band needs
  `getBoundingClientRect().bottom <= window.innerHeight`, not `toBeVisible()`.
- **`full` is fine** (scroller y 184 → 844, nothing below the fold) and **desktop is fine**
  (scroller y 256 → 900, nothing below the fold). It is `half`-only.

How a user reaches `half`: by dragging the handle. The peek heading button goes straight to `full`
(`place-sheet.tsx:250`), so the common path avoids it. Severity **major, not critical**: it does not
break the core loop, but it makes an entire navigation surface unreachable in one of three stops,
and §2.6 puts the country groups into precisely that surface.

`Elsewhere` is reachable at `half` only when the whole scrolled content ends more than ~380 px above
the container's bottom — i.e. roughly three rows or fewer in the active area. With four or more, it
is gone.

## 3. Area switching, traced end to end

### 3.1 What happens on an `Elsewhere` row tap. MEASURED.

Tapped the one row present, `aria-label="Tel Aviv-Yafo, 13 places, show on map"`, from the `full`
stop with the scroller at its maximum (`scrollTop` 1061 of 1061).

| within | measured |
|---|---|
| 300 ms | heading `18 places in London` → `13 places in Tel Aviv-Yafo`; `document.activeElement` is the `H2`; `scrollTop` **514**, `scrollHeight` 1174 |
| 2.1 s | unchanged: `scrollTop` **514**, `clientHeight` 660 |

**The scroll container is never reset.** There is no `scrollTop`, `scrollTo` or `scrollIntoView`
anywhere in `src/` — a grep across the whole tree returns nothing. The 514 is not a reset; it is the
browser clamping the old 1061 to the new content's maximum (1174 − 660 = 514). The user lands at the
**bottom** of the new list.

The screenshot confirms it: after the tap the visible rows are `HaKosem`, `Anat Bakery`,
`Nordoy Café`, `Old North Espresso Bar`, `Container`, `Café Florentin`,
`Neve Tzedek Coffee House` — rows 7 through 13 of 13 — then `ELSEWHERE / London / 18 places`, then
`Collections`. Rows 1–6 of the area they just chose are above the fold and were never seen.

**Focus does move to the heading, correctly.** `place-sheet.tsx:301-304`:

```ts
const selectArea = (areaId: string) => {
  onSelectArea(areaId);
  headingRef.current?.focus({ preventScroll: true });
};
```

`preventScroll: true` is load-bearing and is also why the scroll position survives: the heading is
outside the scroller, so focusing it would not have scrolled the list to the top anyway, and the
flag stops the browser scrolling the *page*.

### 3.2 State and camera. READ.

`src/app/map/map-page-client.tsx:362-371` — writer 2 of the four-writer rule — does three things and
only three:

```ts
setActiveAreaAnchor(area.id);
setSelectedId(null);
setFocusPlaceIds(area.members.map((place) => place.id));
```

`focusPlaceIds` reaches `map-surface.mapcn.tsx:536-552`, which builds bounds over exactly those
places and calls `fitTo(instance, target, true)` → `map.fitBounds(target, { padding, maxZoom: 15,
duration: 1200 })`. `FOCUS_FLIGHT_MS = 1200` (`map-surface.mapcn.tsx:149`).

### 3.3 What §2.4 specifies and is not true today

| §2.4 says | today |
|---|---|
| "the list scrolls to top" | **False.** Scroll position is carried over and clamped; the user lands at the bottom of the new list (§3.1). |
| "the header crossfades" | **False.** The `<h2>` text swaps in one frame. No `AnimatePresence`, no `motion.*`, no opacity transition anywhere in `place-sheet.tsx` — the only `transition-*` classes are `transition-colors` on row hover. |
| "focus moves to the heading" | **True**, measured. |
| "camera flies to the area's bounds, capped z13, padded for the sheet" | **Partly.** Padded, yes; the cap is **z15**, not z13 (`FIT_BOUNDS_MAX_ZOOM = 15`, `map-surface.mapcn.tsx:126`). Duration is 1200 ms, and §2.4 asks for ~600 ms for the country tap. |
| "the active area becomes this one — the same writer as an `Elsewhere` row tap" | **True**, and the writer already exists at `map-page-client.tsx:362`. An area-marker tap should call it, not add a fifth writer. |

## 4. The empty-viewport state

### 4.1 There is no empty state. That is the finding. MEASURED.

Zoomed out to world, then panned three times with a real mouse drag until the camera was over Asia
and Australia with **no pin anywhere on screen**. What the user sees:

- the map: the basemap, zero pins;
- the sheet at `peek`: **`18 places in London`** for the first pan, then **`13 places in
  Tel Aviv-Yafo`** for the second and third;
- opening the list: the full heading `13 places in Tel Aviv-Yafo`, the search field, the
  `Not been yet` chip, and all 13 Tel Aviv rows.

So the answer to "what does the user see when the camera is over an area with none of their places"
is: **a list of somewhere else's places, with a confident heading naming a city that is not on
screen.** No empty state, no "nothing here", no note.

### 4.2 The heading strings, and why none of them can appear. READ.

`areaHeading` (`src/ui/place/active-area.ts:358-425`) can return:

| condition | string |
|---|---|
| unfiltered, `n` in area | `18 places in London` / `1 place in London` / `12 places in this area` |
| filtered | `3 matches in London` / `1 match in London` |
| visit filter alone | `7 to go in London` |
| filters match here: none, elsewhere: some | `No matches in London` |
| search matches nowhere | `Nothing matches "momos"` + `Clear search` |
| tag matches nowhere | `Nothing tagged "Momos"` |
| visit filter alone, nothing left anywhere | `You've been to all of them` + `Nothing left on your list. Paste a TikTok and it starts filling up again.` |
| visit filter alone, nothing left here | `You've been to all of them in London` + `Your other areas still have places waiting.` |
| area label is a tie between spellings | `… in this area` (`UNNAMED_AREA_LABEL`, `:57`) |

**Every one of those is filter-driven. None of them is camera-driven, and none can say "your places
are not here".** `Nothing saved in this area` was deliberately deleted (the `:333-337` comment says
so): an area is defined by the places in it, so an unfiltered area always has ≥1.

The reason the camera can never produce an empty heading is `dominantArea`
(`active-area.ts:183-207`): when no pin anchor falls inside the query rect it does **not** return
`null`, it falls back to the area whose bounding box is nearest the rect's centre. Verified against
the real 31 rows:

```
dominantArea(central Mediterranean rect, current = London) → Tel Aviv-Yafo
dominantArea(mid-Atlantic rect,          current = London) → London
dominantArea(whole-world rect,           current = London) → London   (18 > 13)
```

Which is exactly what the pan test showed at runtime: **panning across empty ocean silently switched
the list from London to Tel Aviv-Yafo.** That is the specified behaviour, not a bug — but it means
"the camera is nowhere" resolves to "the camera is at your nearest area", forever.

### 4.3 Is there a one-tap route back? **Only to a different area.** MEASURED.

The `Elsewhere` section is the only navigation control in the list, and by construction it excludes
the active area (`elsewhereRows`, `active-area.ts:274-292`, `if (area.id === activeId) continue`).

So with the scope on Tel Aviv-Yafo and the camera over Australia, the rows on offer are
`London, 18 places, show on map` and nothing else. **One tap returns you to your places — but only
by changing which area you are in.** There is no control anywhere that re-frames the camera on the
area the header is currently naming. `Show my places` was removed with `Nothing saved in this area`.

Whether that matters is a product call, not mine. What is certain is that it is a state the country
band changes: at world zoom with country markers, "your places" become tappable objects on the map
for the first time, which is a route back that does not exist today.

## 5. Test coverage the country band must not break

### 5.1 The files, with counts

| file | tests | what it pins |
|---|---|---|
| `tests/unit/ui/active-area.test.ts` | **44** | the whole area model: `buildAreas`, `resolveArea`, `dominantArea`, `areaAfterCameraSettled`, `elsewhereRows`, `areaHeading`, `mapAccessibleName` |
| `tests/unit/places/clusters.test.ts` | **33** | `clusterByProximity`, `clusterLabel`, bounds, the 50 km radius |
| `tests/unit/map/country-flag-image.test.ts` | **24** | `buildCountryDiscImages`, `hasFlagGlyphs`, `flagEmoji`, `normaliseCountryCode`, `countryDiscImageId`, the image cache |
| `tests/unit/map/marker-style.test.ts` | **19** | the palette, `pinGeometry`, `pinIconImageExpression`, `pinSortKeyExpression`, the layout/paint objects |
| `tests/unit/places/country-bucket.test.ts` | **15** | `areaCountry`, `meanCentroid`, `bucketAreasByCountry` |
| `tests/unit/map/no-density-clustering.test.ts` | **8** | the `L1-F5-T5` ruling, asserted against the layer file's source text |
| `tests/unit/places/country-code.test.ts` | — | `toCountryCode` |
| `tests/unit/ui/visit-state.test.ts` | — | touches `active-area` |
| `tests/e2e/import-happy-path.spec.ts` | 1 | the only e2e that touches the list, and only via `[aria-label="Show your places"]` containing `/\d+ places saved/i` |

### 5.2 The assertions that pin behaviour about to change

**`elsewhereRows` as a flat list** — `tests/unit/ui/active-area.test.ts:242-279`, four tests:

```ts
expect(elsewhereRows(areas, london.id, everything)).toEqual([
  { id: telAviv.id, label: 'Tel Aviv-Yafo', count: 9 },
]);
```

`toEqual` on the whole array against a bare `{id,label,count}` shape. Any country grouping that
changes this function's return type breaks all four at once. The band should introduce a *new*
function over `elsewhereRows`' output rather than widening `AreaRow` — which is what
`src/ui/place/elsewhere-groups.ts` (uncommitted, 188 lines, 233 lines of tests) appears to be doing,
correctly.

The other three, same block: counts reflect filter matches not area size (`:255`); an area emptied
by the filters is dropped, `toEqual([])` (`:261`); sort is count-desc then label, and an unlabelled
area reads `Another area` (`:265-278`).

**The copy** — `active-area.test.ts:281-292`: `areaRowCountText` gives exactly `8 places` / `1 place`
/ `3 matches` / `1 match`, and `areaRowAccessibleName` gives exactly
`Tel Aviv-Yafo, 8 places, show on map`. §2.7 keeps the area-row strings unchanged, so these should
survive untouched; if a country group row reuses `areaRowCountText`, the `{Country} · {n} places`
form must not change what the area row emits.

**The clustering ruling** — `tests/unit/map/no-density-clustering.test.ts`, and this is the one to be
careful with, because **it asserts against the raw source text of
`src/components/map/place-marker-layer.tsx`**:

- `it('draws exactly one layer from the source')` counts `map.addLayer(` occurrences in the file
  and requires exactly **1**, and requires the file not to contain `type: 'circle'` (`:62-66`).
- `it('passes no filter to the pin layer')` requires the file to match no `/\bfilter:/` (`:68-72`).
- seven `it.each` cases forbid `cluster: true`, `clusterMaxZoom`, `clusterRadius`,
  `clusterMinPoints`, `clusterProperties`, `point_count`, `getClusterExpansionZoom` (`:38-46`).
- `it('exports no cluster expression at all')` iterates `Object.keys(markerStyle)` and requires no
  export name to contain `cluster` (`:99-105`).

Consequences for the band, stated plainly:

1. **Adding a country layer or an area layer inside `place-marker-layer.tsx` breaks the one-layer
   assertion.** §2.3's area marker is a `circle` layer, so it would break the `type: 'circle'`
   assertion too. The band's layers belong in their own component with their own source; that keeps
   this file's ruling intact and is the reason it is written as a source-text assertion.
2. **The `filter:` ban is file-scoped**, so a filter in a *new* file is fine.
3. `Object.keys(markerStyle)` is scoped to `marker-style.ts`. A `COUNTRY_BAND_MAX` living in
   `zoom-bands.ts` or `summary-style.ts` does not trip it.

**Do not relax any of these to make the band fit.** The ruling they encode is an owner ruling
(`06` §9.1, `L1-F5-T5`) and the source-text form is deliberate.

### 5.3 The gap: nothing renders the sheet

**There is no unit test for `src/components/sheet/place-sheet.tsx`, `ElsewhereSection`,
`PlaceRow`, `CollectionsNavRow` or `place-desktop-panel.tsx`.** No test file in `tests/unit/**`
imports `@/components/sheet/*` at all. The only test that reads a sheet file reads
`place-marker-layer.tsx` as text.

So `elsewhereRows` is covered as *data* and the `Elsewhere` section is covered as *rendering* by
nothing. The evidence that the section renders at all is:

- `tests/manual/drive-app-both-breakpoints.mjs` — a manual Playwright driver needing a running dev
  server, and it screenshots rows and detail views, not the `Elsewhere` section;
- the ad-hoc drivers I wrote for this baseline, which are not in the repo.

**Recommendation, mine to own:** the country band is the moment to add
`tests/unit/ui/…` coverage over the grouped-row builder (`elsewhere-groups.ts` already has 233 lines
of it, good) **plus** one e2e in `tests/e2e/**` that opens the list, taps a country group, taps an
area row, and asserts the heading changed *and* that the section's
`getBoundingClientRect().bottom <= window.innerHeight` — the `isVisible()` trap in §2.4 is exactly
the class of bug that survives a unit tier.

## 6. `npm run verify` — the real result

Run at 11:36–11:40 IDT on `6575e29`. **Exit code 1.**

### 6.1 The handoff's claim is confirmed, with one correction that matters

`npm run check:schema` fails, and for exactly the stated reason:

```
psql:supabase/tests/inventory.sql:87: ERROR:  FAIL 1: expected 15 tables in public, found 16
check:schema  FAIL — the live schema does not match supabase/tests/inventory.sql.
```

The 16th table is `rate_limit_events`. Confirmed at the source:

```
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;
 0027 | import_rate_limit
 0026 | collection_membership_is_not_undone_by_a_link
 0025 | revoke_stray_truncate
```

`supabase/migrations/` on disk stops at `0026`. **There is no `0027` file in the repo at all** — the
dev container holds a migration whose source is not in the tree. That is a slightly sharper statement
than "the container is ahead of `main`": `main` cannot catch up, because the SQL does not exist here.
Someone should establish where `0027_import_rate_limit` lives before the next `db:reset`, or it is
gone. Flagging, not acting — migrations are `supabase-database`'s and the orchestrator's.

`supabase/tests/inventory.sql:80-83` asserts the count explicitly (`<> 15`), with a comment saying
"a table nobody designed is exactly the thing this check exists to notice". The check is behaving
as designed.

### 6.2 **The correction: `verify` never reaches the tests.**

`verify` is `lint && typecheck && check:layers && check:migrations && check:schema && check:agents &&
test`. `check:schema` is sixth. It fails, the `&&` chain stops, and **`check:agents` and `vitest`
never run.** Anyone reading "verify fails on check:schema, everything else is fine" off a `verify`
run is reading something the run did not say.

I ran the remaining two separately:

| step | result |
|---|---|
| `npm run lint` | pass — 0 errors, **2 warnings**, both `@next/next/no-img-element` (`src/app/import/import-page-client.tsx:1565`, `src/components/sheet/place-sheet.tsx:1035`) |
| `npm run typecheck` | pass |
| `npm run check:layers` | pass — 19 guard assertions |
| `npm run check:migrations` | pass — 15 relations in `public`, all revoked from both browser roles, RLS enabled+forced. **Note it says 15 while the database has 16** — this guard reads the migration files, `check:schema` reads the live database, which is why only one of them notices |
| `npm run check:schema` | **FAIL** — as above |
| `npm run check:agents` | pass — 11 agent definitions consistent with the roster |
| `npm test` | pass — **81 files, 1469 tests, 0 failures**, 1.67 s |
| `npm run build` | pass — 12 routes, exit 0. **Not part of `verify`**; run separately |

### 6.3 What I could not verify

- **Hosted anything.** No staging, no production, no `db:push`, no `vercel`. Guardrails §2.
- **`npm run db:test`** — needs a freshly reset database. Guardrails §6 forbids `db:reset`. The RLS
  policy tests are unverified locally and remain CI's job.
- **`tests/e2e/**` under Playwright.** I drove the app with my own scripts against the dev server
  the orchestrator already had running; I did not run the committed e2e suite, because its
  `global-setup.ts` and its assumptions about server state are the orchestrator's to schedule.
- **Real-device behaviour.** Everything at 390×844 and 1440×900 is headless Chromium with
  `deviceScaleFactor: 2`, `isMobile: true`, a Pixel 7 user agent. `env(safe-area-inset-bottom)`
  resolves to 0 there; on a notched device the `half`-stop defect in §2.4 gets ~34 px worse, not
  better, but I have not measured it on hardware.
- **The country band itself.** `summary-features.ts`, `summary-style.ts`, `zoom-bands.ts`,
  `library-summary.ts` and `elsewhere-groups.ts` are uncommitted and unwired. I read them only far
  enough to confirm they render nothing. They are unverified.
- **Whether the `half`-stop defect is a regression.** I did not bisect.

## 7. Findings, ranked

| # | finding | severity | evidence |
|---|---|---|---|
| 1 | At `half`, the bottom ~380 px of the list is unreachable — the whole `Elsewhere` section and `Collections`. Playwright's `isVisible()` reports it visible. | **major** | §2.4, MEASURED |
| 2 | An `Elsewhere` tap carries the old scroll position into the new list; the user lands at the bottom of the area they just chose, having never seen its first rows. §2.4 of the spec says "scrolls to top". | **major** | §3.1, MEASURED |
| 3 | At world zoom, 13 Tel Aviv places render as one `dessert` pin — a 1-of-13 minority category standing in for the city. Not merely uninformative; wrong. | **major**, and the band's whole justification | §1.2, MEASURED |
| 4 | Panning over empty ocean silently switches the active area; the sheet then names a city with no pin on screen and offers no route back to it. | **minor**, by design, but a state the band changes | §4, MEASURED |
| 5 | No render-level test exists for the sheet, `ElsewhereSection` included. The flat-row behaviour is pinned only as data. | **major** as a process gap | §5.3, MEASURED |
| 6 | Migration `0027_import_rate_limit` is applied to the dev database and its SQL is nowhere in the repo. | **major**, not mine to fix | §6.1, MEASURED |
| 7 | `npm run verify` stops before `check:agents` and `vitest`; a red `verify` says nothing about the tests. | **minor**, but it makes every "verify fails on schema, rest is fine" claim unsupported | §6.2, MEASURED |
| 8 | `mapAccessibleName` is exported, tested twice, and imported by nothing. The canvas's real accessible name is `Map`. | **minor** | §1.4, MEASURED |
| 9 | The area-flight camera cap is z15 and the flight is 1200 ms; §2.4 specifies z13 and ~600 ms. | **minor**, a spec/implementation gap to settle before the band, not a defect | §3.2, READ |
