# The library as it grows — country, area, place

> Owner: UX / Interaction. Date: **2026-08-29**. Task **LIBRARY-IA-1**.
> Status: **spec for implementation.** `design-system-frontend` owns the code; this document owns the
> surface. I have no shell and have verified nothing at runtime.
>
> The question this answers: *after places are saved, what should the library surface actually be as
> it grows?* Not *which post-save capabilities do we build* — `product-lead` is ruling on that
> separately and this document does not rank features.
>
> Binding inputs: `docs/ux-stable-area-list.md` (the area model, shipped) ·
> `docs/brand-and-product-foundation.md` §1, §4, §6 · `docs/ux-architecture.md` §11 (a11y), §12
> (copy) · `docs/06-map-and-places-decision.md` §9.1 (clustering removed, country summary) ·
> `docs/execution-plan.md` `L1-F5-T5` and the L2 country line · `docs/00-project-charter.md` §6.
>
> Design target: **100+ saved places across many countries, on a phone, one hand.** Not 25 in two
> cities. Desktop follows in §9 and never leads.

---

## 0. The one idea

**The library has exactly three levels of geography, and they are the same three on the map and in
the list.**

| Level | What it is | On the map | In the list |
|---|---|---|---|
| **Country** | `places.country_code` | one marker, flag + count, world zoom only | the `Elsewhere` section's top level |
| **Area** | a ~50 km coordinate cluster (`clusterByProximity`), already shipped | one marker, name + count, mid zoom | the active scope; a row inside `Elsewhere` |
| **Place** | a saved place | a pin, city zoom and below | a row |

Nothing else groups anything. No density bubbles at any zoom, no time headers, no folders, no
`locality` string grouping (the library holds four spellings for two cities and always will).

Two things follow, and they are the whole spec:

1. **Today's `ELSEWHERE — London, 12 places` is the seed of the zoomed-out view, and it should grow
   a country level rather than a longer flat list.** At 100 places across many countries it is
   otherwise 20 undifferentiated rows appended to the bottom of a scroll.
2. **The zoomed-out map is the same object rendered differently**, which is what makes it
   accessible: the canvas is unreachable by a screen reader, and the list beside it already carries
   the identical summary.

This also repairs the thing `L1-F5-T5` breaks. Removing density clustering makes world zoom *worse*
than today — a mat of overlapping teardrops carrying no information (`06` §9.1). The country band is
what makes zooming out mean something again.

---

## 1. Default order, and what is structural

### 1.1 The order: most recently saved first, inside the active area

Unchanged from what ships today, and it is the right default for three reasons that matter more at
100 places than at 25:

- **It is the only order that is a fact about the user rather than about the data.** Alphabetical is
  arbitrary. Category is a grouping wearing a sort's clothes. Distance needs a permission we do not
  ask for on load and is the wrong answer for the trip half of the user (`brand-and-product-
  foundation` §2).
- **The top of the list is the only reliably actionable set** — the places you have just banked and
  done nothing with.
- **It never reorders on pan, zoom or resize**, which is the property the area ruling exists to
  protect. Any distance-based default puts that instability straight back.

**What changes is that the order stops being invisible.** Today the sort is a silent property of the
array. Every row gets a quiet date (§3), so "most recent first" is something the user can see rather
than infer. That single change is what makes the order survive 100 rows.

**No user-facing sort control.** A sort picker is a mode with an invisible off-state, it is a second
thing to get wrong on a phone, and at 100 places re-sorting is almost never the question the user
actually has. The question is *which of these*, and that is a filter.

**Near-me (`L1-F11`) is the one exception, and it stays one.** It is a distinct mode with its own
header (`12 places near you`), distances shown, ordered by distance, entered by an explicit tap.
Distance from *you* is a fact about the world; distance from the map centre never was
(`ux-stable-area-list.md`).

### 1.2 The structural grouping is geography, at two levels

- **Inside the list:** the **area**. One area is the active scope. This is shipped and is not
  reopened here.
- **Below it:** `Elsewhere`, grouped by **country** (§2).
- **Not structural:** recency. **No time headers** — no `This week` / `Earlier`. The positioning is
  "organised by where, not by when" and a date header is exactly the saves-folder shape we are
  replacing.
- **Not structural:** category. It is a filter, never a section.

### 1.3 Where filtering lives on a phone

A **filter bar**, pinned directly under the search field, above the rows, inside the sheet. Not a
modal, not a second sheet, not a popover.

```
┌─────────────────────────────────────┐
│ 13 places in Tel Aviv-Yafo          │  heading (sticky)
│ ⌕ Search your places                │  (sticky)
│ [All] [☕ Café 4] [🍽 Rest. 6] [🍞…  │  filter bar, horizontal scroll (sticky)
│ ─────────────────────────────────── │
│  rows…                              │
```

Rules:

1. **Horizontally scrollable, one line, never wraps.** Wrapping chips push the first row off screen.
2. **The bar only ever offers filters that would return something in the active area.** A category
   with zero places here is not rendered. A filter that leads to an empty list is a broken promise
   with a tap target on it — the same rule `elsewhereRows` already applies to area rows.
3. **Each chip carries its count** (`Café 4`). The count is what makes the bar a summary of the area
   as well as a control — at a glance you know this city is six restaurants and four cafés.
4. **Chips are ≥44px tall with ≥8px gaps**, and the bar is `role="group"`, chips are
   `aria-pressed` toggle buttons.
5. **One category at a time. `All` is a chip, first, selected by default.** Multi-select turns a
   glance into arithmetic.
6. **The bar is the home of the tag filter too.** When a tag filter is active (set from a place
   detail's chips, as today), its pill renders as the first chip in the bar in the selected state
   with an inline `×`, rather than as a separate row above the list. One place where narrowing is
   visible and undoable.
7. **The bar, the search field and the heading stick to the top of the scroll container** at `half`
   and `full`. At 40 rows the way out of a filter must never be 40 rows up.
8. **Filtering never moves the camera and never changes the active area.** Shipped rule, restated
   because the bar makes it easy to break.

**Known trade, stated rather than hidden:** at `half`/`full`, scrolled deep into 40 rows, the
`Add a TikTok` primary is off screen (it lives at `peek`). I am **not** adding a floating action
button over the sheet — new persistent chrome over the map is the banned aesthetic and it would sit
exactly where the thumb needs to scroll. The way back is one drag on the handle. If this proves
wrong in use, the fix is the sticky header growing a compact `＋` at its trailing edge, not a FAB.

### 1.4 What happens at 40 rows in one area

Nothing structural. The library is fetched whole and filtered client-side under the 2 000-place
ceiling (`06` §9.1), the list is a plain scroll, and **virtualisation is not built** until a single
area is measured above ~200 rows. Below that it is a solution to a problem we do not have and a
source of focus and screen-reader bugs we would.

---

## 2. The zoomed-out view

This is the piece with no spec today. It is one model — country → area → place — rendered as three
zoom bands on the map and as one nested section in the list.

### 2.1 The three zoom bands

Declarative, via `minzoom` / `maxzoom` on the layers. **MapLibre owns the swap**: no zoom listener,
no React state, no re-render on zoom.

| Zoom | What is on the map | What is not |
|---|---|---|
| **z < 4.5** — world / continent | **Country markers**: flag + saved-place count | no area markers, no pins |
| **4.5 ≤ z < 8.5** — country / region | **Area markers**: the area's own name + count | no country markers, no pins |
| **z ≥ 8.5** — metro and below | **Individual pins**, as they are today. Name labels still gated at `LABEL_MIN_ZOOM = 14` | no summary markers of any kind |

Why an area band exists at all, and it is the important part: it is the answer to the transition
problem named in `D2-CLUSTER-REMOVAL-SIZING`. Going straight from a country bubble to pins means a
country with 24 saves spread over 1 500 km loses its bubble and gains 24 pins that are all off
screen — you tap a country, you see nothing. **You can never jump from country to pins.** You land
on named areas, which are always visible because tapping a country frames its areas.

Thresholds are values in one constants file, not literals in a layer definition. 4.5 and 8.5 are my
starting numbers (at z8.5 a phone viewport is roughly one metro area, which is exactly the point a
50 km cluster stops being a useful summary of itself); they are the one thing here I would expect to
tune on a device.

### 2.2 What a country marker is

- **A disc carrying a flag image and the count**, e.g. 🇯🇵 24. Positioned at the **Cartesian-mean
  centroid of the user's own saved places in that country** — no country-centroid table, nothing to
  license, and the marker sits where *your* places are. Average in Cartesian space, or the
  antimeridian and far-flung territories go wrong.
- **The flag must be a canvas-drawn image**, not a `text-field`. Two independent measured reasons in
  `execution-plan.md`: MapLibre's glyph atlas is single-channel alpha so colour is impossible, and a
  regional-indicator pair needs a ligature that per-codepoint shaping cannot form — you get two tofu
  boxes reading "J" "P".
- **Fallback, chosen deliberately rather than discovered:** where the platform font has no flag
  glyph (Windows' Segoe UI Emoji ships none), draw the **two-letter country code** in the same disc,
  in the same typography as the count. Mobile-first makes this a desktop-only fallback. It must be
  drawn at image-build time by feature-testing one flag once, not per marker.
- **The count is plain digits in a symbol layer.** Never baked into the image.
- **The active area's country carries a mint ring.** At world zoom the map still says *you are here*
  while showing everything. This is the only state colour on the marker.

### 2.3 What an area marker is

- A **circle layer** for the disc with the count, plus a **symbol layer** for the area's own label
  beneath it with a halo. No canvas image needed — the label is text and the RTL plugin is already
  loaded, so `תל אביב-יפו` renders correctly.
- The label is `Area.label`, the shipped plurality rule. When it is `null` the marker shows the
  count alone and the list row beside it reads `Another area` — never `this area`, which is only
  true of the one you are in.
- **Overlap is allowed** (`icon-allow-overlap` is already on). Two areas 60 km apart do briefly sit
  close together near z4.5–5. That is an accepted imperfection, not a reason to build collision
  logic; the country band takes over immediately below it.

### 2.4 Getting from world zoom into a city

Two taps, and each one is explicit.

| Tap | What happens |
|---|---|
| **A country marker** | Camera eases to fit **that country's areas**, at a zoom clamped inside the area band (so you always land on labelled area markers, never on emptiness). ~600 ms, `spatial`. **The active area does not change** — you have not chosen a place yet. |
| **An area marker** | Camera flies to the area's bounds, capped z13, padded for the sheet. **The active area becomes this one** — this is the same writer as an `Elsewhere` row tap, writer 2 of the four-writer rule, not a new one. The sheet's list switches, the header crossfades, the list scrolls to top, focus moves to the heading. |

**Zoom is still never a writer of the active area.** Zooming out to the world does not hand the list
to anything, and the sheet keeps saying `13 places in Tel Aviv-Yafo` while the map shows six
countries. That is not a disagreement — the `Elsewhere` section below the rows is showing exactly
those six countries at the same moment. Making zoom a writer is how `21 places` became `9 places`
with nobody touching anything, and that fix is structural (`dragend`, not `moveend`) and stays.

### 2.5 Places with no country

Measured on the local library: 25 places → `GB` 12, `IL` 11, **`NULL` 2**. About 8% would fall out
of any country bucket. Dropping them makes them invisible at world zoom, which is a lie by omission
in a product whose whole posture is not to convert uncertainty into certainty.

**The ruling: bucket by the area's country, not the place's.** An area is a 50 km cluster, so it is
in exactly one country by construction. Take the country of the plurality of its members — the same
move `clusterLabel` already makes for the locality string. Then:

- an area with some NULL members still lands in the right country, and **no place ever disappears**;
- an area where *every* member is NULL renders at country zoom as an **unflagged marker with its own
  area name**, and in the list as a top-level `Elsewhere` row with no flag, sorted last.

No backfill required, no migration, and the surface is honest about the gap instead of hiding it.

### 2.6 The `Elsewhere` section, at 100 places

The same model, as a list. This replaces the flat run of area rows that ships today.

```
ELSEWHERE
┌───────────────────────────────────────────┐
│ 🇬🇧  United Kingdom            14 places ⌄ │   country group (expander)
│      London                    12 places › │   area row
│      Bristol                    2 places › │
│ 🇯🇵  Tokyo                      6 places › │   one area → one row, no group
│ 🇮🇹  Italy                      5 places ⌄ │
│      Another area               5 places › │   area we cannot name
└───────────────────────────────────────────┘
```

Rules, in order of how much they matter:

1. **A country with exactly one area is one row**, labelled with the *area* name and the country's
   flag. Never make someone tap twice to reach one thing.
2. **A country with two or more areas is a group**, showing the country's name and total.
3. **Collapsed by default, except the active area's own country**, which is expanded — if you are in
   London you care that you also have Bristol.
4. **Sorted by count descending, then name, then id.** Deterministic, so rows never reorder between
   two renders of the same library. Same rule as `elsewhereRows` today.
5. **Under a filter, every count becomes a match count** and anything with zero drops out entirely,
   country groups included. `No matches in London` still needs no escape button of its own, because
   the rows beneath it say where the matches are.
6. **Areas with no country sort last**, unflagged, as top-level rows.
7. **Country names come from a static code → name table.** Small new data asset, English only, no
   migration. Unknown code → the two-letter code itself, never a blank.

### 2.7 Copy

| Where | String |
|---|---|
| Section heading | `Elsewhere` |
| Country group row | `{Country} · {n} places` / `{n} place` |
| Country group row, filtering | `{Country} · {n} matches` / `{n} match` |
| Area row | unchanged: `{Area} · {n} places` / `{n} matches` |
| Country group, screen reader | `{Country}, {n} places in {m} areas, expand` / `collapse` |
| Area row, screen reader | unchanged: `{Area}, {n} places, show on map` |
| Unnamed area | `Another area` (shipped constant) |

No new string uses a banned word, and none of them names a mechanism.

---

## 3. The row

### 3.1 Ruling on the list-row tag chips: **they stay inert, permanently. This item is closed.**

The deferral reasoning in `place-enrichment.tsx:29-38` is correct on its own terms — a 20px chip
inside the row's own 64px button is nested-interactive and under the touch floor — and the
"taller-row redesign" it defers to is **not** the right answer either. Making the chip line its own
44px row pushes every row to ~108px, which at 100 places is a real cost paid on every screen to
serve a control most users touch once.

The third option is better than both, and it is why I can close this rather than defer it a third
time: **a tag filter is a library-wide action and a list row is an area-scoped object.** Putting a
library-wide control inside an area-scoped row is a category error regardless of how big the target
is. The one-tap path the deferral was hedging for now exists somewhere it belongs — the filter bar
in §1.3, where the tags of the current area are real 44px targets at the top of the list, next to
the search field, sticky.

So: on a **list row**, tags are labels. On a **place detail**, chips are controls (shipped,
unchanged). In the **filter bar**, tags are controls. Three surfaces, one consistent rule: *a chip
is pressable exactly where filtering is the surface's job.*

The second open item in that file — `TagChipList` outside a `TagFilterContext` falling back to inert
spans — is correct behaviour and needs no change. An inert fallback is what makes a control fail
closed instead of rendering a dead button.

### 3.2 `Category · Area` is the wrong second line, and here is why

Inside the active area, that line is **redundant twice over**:

- the **Area** half is identical on all 13 rows and repeats the header directly above them;
- the **Category** half is already carried by the coloured pin glyph at the row's leading edge, which
  is the whole reason `cb58e12` drew it.

So the most informative-looking line on the row carries no information at all. At 25 rows that reads
as tidy; at 100 it is the reason the list reads as sludge.

### 3.3 The row, specified

```
┌─────────────────────────────────────────────┐
│ ◍  HaKosem                                  │  15px extrabold, dir="auto", line-clamp-2
│    Falafel · Shlomo HaMelech 1      12 Aug  │  13px muted / 12px muted, tabular
│    "the one Noa said to try"                │  13px muted, line-clamp-1 — only if a note exists
│    [Falafel] [Street food] [+2]             │  inert chips — only if tags exist
└─────────────────────────────────────────────┘
```

- **Leading glyph** — unchanged: the category's colour and glyph, the same one the map draws.
- **Line 1, the name.** `line-clamp-2`, **not `truncate`** (§4).
- **Line 2, the differentiator.** `{Category} · {street}` where `places.address_line` exists;
  `{Category} · {locality}` where it does not (older rows, manual adds). The street is what answers
  *is this near where I will be*, which is the actual decision inside one city, and it is already
  stored — no new field.
- **Line 2 trailing, the date.** `Today` · `2d` … up to 7 days, then `12 Aug`, then `12 Aug 2025`
  beyond twelve months. Right-aligned, its own element (never interpolated into a mixed string, §4),
  tabular figures so a column of dates does not jitter. This is what makes the default order legible.
- **Line 3, the note** — the user's own words, `line-clamp-1`, rendered **above** the tags. A
  sentence the user wrote outranks labels a model chose, always. Most rows have no note, so most
  rows are three lines.
- **Line 4, the tags** — inert, as today, `+n` overflow as today.

Height: 64px minimum (unchanged floor), ~64–96px in practice. A row that is taller because you
annotated it is good differentiation, not inconsistency.

**One target per row, the whole row, opening place detail.** No secondary targets, no swipe actions,
no long-press menu. Swipe is unavailable to us anyway — the sheet already owns vertical drag and the
map owns horizontal pan.

---

## 4. Hebrew and English in one column

The interface strings are English and stay English. What is bidirectional is the *content*, and in
the primary market most of it. `האחים` and `HaKosem` sit adjacent today and will keep doing so.

1. **The row's frame stays LTR. Only the text isolates.** The container is `dir="ltr"` so the glyph
   is always leading and the date always trailing; each text element carries `dir="auto"`, which
   also makes it a bidi isolate under the HTML5 UA rule. A column where every other row mirrors its
   whole layout is unreadable. This is the single most important rule here.
2. **The name element has no `dir` today** (`place-sheet.tsx:425`) **and it is `truncate`.** That is
   the exact defect `ux-when-we-ask.md` §12.2 names: `text-overflow: ellipsis` on an RTL string
   inside an LTR box clips the *beginning* of the name — the identifying part. Fix both: add
   `dir="auto"`, and replace `truncate` with `line-clamp-2`. A two-line name is rare; a name whose
   identifying half is gone is a defect.
3. **Never build line 2 as one interpolated string.** `Café · בן יהודה 155` must be three elements —
   category, a literal separator, and the street in its own `dir="auto"` isolate. Concatenate and
   the digits and the separator land on the wrong side.
4. **Text alignment stays start-of-container** (left) for every row, whatever the script. The ragged
   edge is on the same side for every row, which is what makes 100 rows scannable.
5. **The date is a separate right-aligned element**, never appended to line 2's string.
6. **Area and country labels obey the same rules** — `dir="auto"`, and the count/chevron stay in the
   LTR frame.
7. **Do not tune line lengths against English samples only.** Hebrew renders ~15–20% shorter, so the
   risk is a short line sitting oddly beside a long Latin name, not overflow. Check a mixed area on
   device.
8. **Not this spec's fix, but it lands here and will be conspicuous:** locality strings are still
   stored five ways (`תל אביב-יפו`, `Tel Aviv`, `ת״א`…). The area label's plurality rule contains it
   for the header; line 2's fallback-to-locality case is where it will show. Flagging, not scoping.

Other scripts are best-effort: the same isolate rules apply and nothing is script-specific.

---

## 5. Why the library is worth reopening

No notifications, no streaks, no badges, no "you have 3 unvisited places" nags. The honest version is
to **show facts the product already knows and has never said**. Three of them cost no new stored
field.

### 5.1 What sits near what — the strongest one, and it is free

On place detail, below the address and above the note:

```
3 of your places are a short walk from here
  Kohi Coffee Shop      ·  Café · 240 m
  Anat Bakery           ·  Bakery · 400 m
  Tokii                 ·  Restaurant · 550 m
```

- **Within 800 m, up to 3, nearest first.** `haversineKm` already exists in
  `domain/places/clusters.ts`. Nothing new is stored, nothing is computed server-side.
- Copy: `{n} of your places are a short walk from here` / `1 of your places is a short walk from
  here`. Rendered only when `n ≥ 1`; absent otherwise, with no placeholder.
- **This recommends nothing.** It reports adjacency, which is a fact. The anti-user rule in
  `product-specification` §2.1 stands untouched.
- Why it is the best available: two places 200 m apart, saved from two different TikToks six weeks
  apart, is the single most useful thing the product knows and has never told anyone. It turns 100
  isolated pins into neighbourhoods, and it is the reason to open a place you already saved.
- Each row is a 44px target that selects that place — one tap, staying inside the sheet.

### 5.2 The country view *is* the trip view

"What does a trip look like" needs no new object. `🇯🇵 Tokyo · 6 places` **is** the trip: it is the
answer to *what do I already have in this city*, which is one of the two retrieval questions the
single user profile has. Tapping it is planning. We are not building an itinerary planner (Charter
§1) and this is the version of the same value that does not become one.

### 5.3 Time is visible

Dates on rows (§3.3) mean the library visibly accumulates. It is the only free "something has
changed since you last looked", and it needs no read state and no notification.

### 5.4 Near me

Already planned (`L1-F11`), still the everyday hook, unchanged by this document. It is the one mode
that re-orders the list, and its permission is asked on an explicit tap and never on load
(`ux-when-we-ask` discipline, `ux-architecture` §6.7).

### 5.5 What I did not invent, and why

The strongest revisit loop available — *these are the places you saved and never did anything with* —
needs a **read/visit timestamp we do not store**. I am not faking it from a proxy (no note, no
category override) because a proxy that is wrong is worse than an absence. It is in §8 as an owner
decision, with a recommendation.

---

## 6. Accessibility

The list is not an accessible *alternative* to the map — it is the primary surface and the map is a
picture of it. Everything below follows from that.

- **Nothing in this spec is a dialog.** The filter bar, the country groups and the nearby block are
  all in-place content inside the existing non-modal sheet. **Explicitly forbidden:** a filter sheet
  stacked over the places sheet, a sort modal, a country picker dialog. A drawer once marked the
  whole `<main>` `aria-hidden` and made the map page unreachable to screen readers; there is a
  regression guard for it (`use-non-modal-background.ts`) and no surface here may create a second
  chance at that class of failure.
- **Country and area markers are canvas and unreachable. The list is the equivalent, and it must be
  complete** — every country and every area in the library is reachable from `Elsewhere` without
  touching the map. This is a hard requirement on §2.6, not a nicety.
- **The map's accessible name must not churn on zoom.** Leave `mapAccessibleName` as it is; add one
  static `aria-describedby` sentence: `Zooming out summarises your places by area and by country.
  The list below has the same summary.` Announcing zoom bands would be noise.
- **Focus order, DOM order, no reordering tricks:** heading → search field → clear-search → filter
  chips (`All` first) → rows → `Elsewhere` heading → country groups → area rows.
- **Country group** is a `<button>` with `aria-expanded`, controlling its own `<ul>` by `aria-
  controls`. Expanding does not move focus.
- **One live region, in the existing place**, announcing only on **area change**. Filter changes
  update the existing debounced count line; they do not get a second region. Panning announces
  nothing, because nothing changed.
- **Targets:** rows ≥64px; filter chips, country groups, area rows and nearby rows ≥44px with ≥8px
  gaps; the date is not a target and must not be inside one.
- **Contrast:** the date is the quietest text on the row and still needs ≥4.5:1 — we take no
  large-text exemption for anything the user reads (`ux-architecture` §11.6). It must be
  `muted-foreground`, not `muted-foreground/70`.
- **Counts are text, never colour alone.** A country's weight is its number, not its disc size.
- **Safe areas:** the sticky header block sits under `env(safe-area-inset-top)` only at `full`; the
  list's bottom padding keeps `env(safe-area-inset-bottom)`. Sheet height stays bound to
  `visualViewport` so the search field is never behind the keyboard.

---

## 7. Motion

Five things move. Everything else is a state change.

| Moment | Intent | Timing | `prefers-reduced-motion` |
|---|---|---|---|
| Zoom band swap (country ↔ area ↔ pins) | none — it is not an event | **no animation at all.** MapLibre's `minzoom`/`maxzoom` owns it | identical |
| Country marker tap | "these are your areas in that country" | camera `easeTo` its areas' bounds, ~600 ms, `spatial`, clamped into the area band | `jumpTo` |
| Area marker or area row tap | "you are going there" | existing flight, ~700 ms `spatial`, cap z13, padded for the sheet | `jumpTo` |
| Header on area change | marks the one legitimate change of scope | 140 ms opacity crossfade (shipped) | instant swap |
| Country group expand/collapse | "this came from the row you pressed" | height 180 ms, `spatial` | instant |

**Nothing else, and these absences are decisions:**

- **Filtering does not animate.** Rows appear and disappear instantly. A list that re-animates on
  every keystroke is unusable, and a row that flies away cannot be recovered by someone who
  mis-tapped.
- **No row entrance stagger, no count roll, no skeletons, no shimmer** anywhere in the library.
- **No marker entrance animation** on the country or area layers. They are a summary, not an event.
- The pins-landing choreography after an import (`ux-architecture` §10.4) is untouched.

---

## 8. Owner decisions

Everything above works with **zero new stored fields**. These are the ones that would change what we
build, and none of them should be assumed.

1. **A read/visit timestamp on `saved_places`** (`last_opened_at`, or a user-set `been`). This is the
   only thing standing between §5 and its strongest form — *the places you saved and never acted
   on*, and *the ones you have been to*, which is also the most requested filter in this category.
   **Recommendation: yes for `last_opened_at`** (written by us, no UI, no user work, purely
   additive), **and treat a user-set been/want-to-go as a separate, larger decision** — it is a new
   piece of user-authored state, i.e. a widening of the MVP's `name · category · coordinates ·
   source link · user note` boundary, not a derived convenience.
2. **User-owned tags or collections** (`saved_places.user_tags`, reserved by `0019`). The filter bar
   in §1.3 is the surface they would land in, and it is designed to take them without redesign.
   Genuinely the owner's: it is user-authored state and it is adjacent to the L2 collections item.
3. **When the country/area zoom bands ship.** `execution-plan.md` files the country summary at L2 and
   `L1-F5-T5` (removing density clustering) at L1 — but the removal makes world zoom *worse* than it
   is today, and §2 is what repairs it. **Recommendation: they land together, or the country band
   lands immediately after.** This is a sequencing call, not a scope one.
4. **A static country-code → name table.** Small, English-only, no migration, but it is a new data
   asset and a future localisation surface. **Recommendation: yes**, with the raw code as the
   fallback so an unknown code is never a blank row.
5. **The two NULL `country_code` rows.** §2.5 designs around them so nothing disappears, but the data
   is still wrong and a backfill is a write to real rows. Recommendation: leave them; the storage bug
   is fixed and the area-level bucketing makes them harmless.
6. **Whether category filter chips are L1 or L2.** `execution-plan.md` has "category filter" in the
   L2 list, and `L1-F6`'s notes call chips an L2 call. §1.3 makes them the mechanism by which the
   list survives 100 rows, which is an argument for moving them — but it is a ranking question and
   `product-lead` owns it.

## 9. Desktop, in one paragraph

Same content, same order, same three levels. The left panel replaces the sheet: no snap points, no
drag, no sticky-header trick needed because the panel scrolls independently. Country groups render
**expanded by default** — there is room, and collapsing is a mobile economy. The filter bar wraps to
two lines instead of scrolling horizontally, because horizontal scroll with a mouse is worse than
wrapping. Zoom bands, marker design, tap behaviour and copy are identical; the map is simply wider.
Hover on a country or area marker shows its label as a tooltip, and **no behaviour depends on
hover**.

## 10. Dark mode consequences — noted, not designed

Dark tokens are an unsigned first pass and are not reworked here. Three things this spec adds that
will need a value when that pass happens: the **country/area marker surface** (it must be an opaque
token-driven disc, never a hard-coded colour, or the §11.6 contrast rule fails against a dark
basemap); the **date's muted colour**, which is the tightest contrast on the row; and the **flag
images**, which are full-colour and will not tint — they need a light disc behind them in both
themes, which is what the design already calls for.

## 11. Acceptance checks

1. At 100+ places across 5+ countries, zooming out from a city passes through **exactly three
   states**: pins, then named area markers, then flag markers. No numbered density bubble appears at
   any zoom.
2. Tapping a country marker lands the camera on **visible, labelled area markers** — never on an
   empty map, and never on pins.
3. Zooming from street level to world and back **does not change the sheet's header or its rows**.
4. Every country and every area in the library is reachable by keyboard from `Elsewhere`, with the
   map untouched. Verified by tabbing, not by reading the code.
5. A country with exactly one area renders as **one row**, not a group containing one row.
6. Under an active search, a country group's count is a **match** count and countries with no matches
   are absent entirely.
7. A place whose `country_code` is NULL is **still present at world zoom**, under its area's country.
8. A list row's second line never repeats the area name that is in the header directly above it.
9. `האחים` renders on a row with its first characters visible — no clipped beginning — beside
   `HaKosem`, with both rows' glyphs on the left and both dates on the right.
10. A tag chip on a list row is not focusable and has no pointer cursor. The same tag is a 44px
    toggle in the filter bar.
11. `prefers-reduced-motion: reduce`: tapping a country marker jumps the camera, the country group
    expands with no height animation, and no list row animates at any point.
12. Opening any surface in this spec leaves `<main>` present in the accessibility tree — the existing
    regression guard still passes.
