# Handoff — the country band is on screen, and the navigation question is open

**Session: 2026-08-29, afternoon. Branch: `feat/country-band-map-layer`, three commits, not pushed.**
Started from `handoff-2026-08-29-collections-merge-and-country-band.md`, whose §3 named the missing
third piece of `ux-library-at-scale.md` §2. That piece now exists.

**Read §1, §5 and §6 if you read nothing else.** §1 is what landed and how I know; §5 is what is
open; §6 is what needs the owner.

---

## 1. What landed, and how it was verified

Three commits on `feat/country-band-map-layer`:

| | |
|---|---|
| `bf652cc` | The country level as one shared summary — `summariseByCountry`, `elsewhereGroups`, `toCountryName` |
| `223eff4` | The three zoom bands, the two taps, camera mover 5, and `Elsewhere` grouped by country |
| `10f9c3d` | The six specialist documents behind all of it |

**1 488 unit tests pass, `tsc` is clean, lint has the two pre-existing `no-img-element` warnings and
no errors.** `npm run verify` still exits 1 at `check:schema` for the reason the previous handoff
gave — and the reason is sharper than it recorded: migration `0027` is applied to the dev container
and **its SQL file does not exist anywhere in the repo**, so `main` cannot catch up by pulling. That
is worth chasing before the next `db:reset`. `verify` also stops at that step and never reaches
`check:agents` or `vitest`, so it is not the signal it looks like — run them separately.

### Verified by using it, in a browser at 375×812, against the real 31-place library

- **z ≥ 8.5** — pins, unchanged.
- **z 6, over London** — a white disc reading `18` with `London` beneath it. Screenshot taken.
- **z 3, over Europe** — the Union Jack disc **with the mint ring** (it is the active area's country)
  reading `United Kingdom 18`. Screenshot taken.
- Layer inspection on the live map confirms the three bands carry `maxzoom 4.5` / `4.5–8.5` /
  `minzoom 8.5`, that both sources hold the right features with correct centroids, and that every
  `icon-image` id a feature names has been registered.

**Not verified, and you should not assume it works:** the two taps. I confirmed the handlers are
attached to the right layers and that the camera code is the shape the mechanics evidence calls for,
but I did not tap a country marker or an area marker in a browser and watch the camera land. That is
the first thing to do.

**Also not verified: a country group.** The real library is one area per country (London, Tel Aviv),
so §2.6's group case never renders — every entry is a single-area row. The grouping rules have 17
unit tests over a fixture with Bristol and Manchester added, but nobody has seen a group on screen.

---

## 2. The four decisions I took that the spec did not

Recorded here because each one departs from a document, and a silent departure is worse than a
wrong one.

1. **The active area is excluded from `Elsewhere` before grouping, not after.** A country total that
   included the rows already on screen above it would count the same places twice on one screen.
   This makes §2.6 rule 3 bite only when the active country still has two or more areas left, and
   rule 1 turn it into a single row when it does not.
2. **`Elsewhere` also expands the country you came from**, not only the one you are in. The area
   switch was one-way: from Tokyo, the route back to London was three taps, two below the fold.
   `previousAreaId` is written by writer 2 alone — a pan is not a navigation anyone is undoing.
3. **A collapsed country group is `inert`, not unrendered.** The audit ruled "do not render" on
   simplicity grounds, which is fair, but unrendered children cannot animate — the wrapper would
   mount already open and §7's one piece of motion here would silently not exist. `inert` takes the
   subtree out of the tab order *and* the accessibility tree, which is all "do not render" was
   buying, and leaves something for `grid-template-rows: 0fr → 1fr` to move.
4. **The country marker carries the country's name.** §2.2 specifies flag + count; Plotline's
   marker reads `🇨🇿 Czechia 2` and is plainly more legible. A flag alone asks the reader to know
   250 of them, and our own fallback for a missing flag glyph is a two-letter code, which is worse.
   Only the flag has to be a bitmap.

I also disagreed with the audit's §2.1 on one mechanical point: rather than mapping `Area` into a
bare `GeoCluster` at the call site, `bucketAreasByCountry` gained a cluster type parameter, so it
hands back the same `Area` objects it was given. That keeps the domain module free of the UI's type
(a type parameter is not an import) *and* removes the need to re-match a country's clusters to its
areas afterwards.

---

## 3. Defects fixed on the way, because the band makes each one worse

Every one of these was live on `main` and none was introduced by this work.

- **Switching area never reset the scroll.** `rg 'scrollTop|scrollTo|scrollIntoView' src/` returned
  nothing across the whole tree. You scrolled two thousand pixels to reach `Elsewhere`, tapped a
  city, and the browser clamped `scrollTop` — landing you at the *bottom* of the city you chose.
  Specified in `ux-stable-area-list.md` since the area model shipped, never built.
- **At the `half` stop, the bottom of the sheet's scroll container was 242 px below the screen.**
  `Drawer.Content` is `h-full` and vaul translates it, so everything down there was laid out,
  painted, hit-testable, reported `visible` by a testing library — and unreachable, because
  scrolling to the container's end still did not bring it on screen. The content column is now
  bound to its stop in `dvh`.
- **The area-tap camera framed the whole area, ignoring the filter that produced the row.** Tapping
  `London · 1 match` under a search flew to a box around all eighteen London places.
- **`CollectionsNavRow` was the last thing in a scroll that is ~3 200 px deep at 100 places**, and
  it is the only door to `/collections` in the product. Moved out of the scroll container.
- **`show on map` was the wrong accessible name for an area row** — the tap changes the list's
  scope, and on a phone at `full` shows nothing on the map at all. Now `open this area`.
- The area rows had no `focus-visible` ring where every other row in the list has one; the header
  had no crossfade, which §7 lists as shipped.

`elsewhereRows` is deleted. It and `elsewhereGroups` were two implementations of one set of rules.

---

## 4. What the specialists produced, and where I disagreed

Four ran; all four are collected and none is still running.

- **`ux-interaction`** — the audit, then the navigation ruling and its supplement. It corrected its
  own §1.7 unprompted after the owner pushed back, and the correction is the important one: it had
  assessed Collections' reachability at `half` and `full` and never asked what the *resting* state
  offers. The app opens at `peek`, where the whole scroll container is off screen, so moving the row
  out of the scroll does not discharge the owner's complaint. Its answer is a third peek slot, not a
  tab bar. **I agree and did not build it** — see §5.
- **`qa-reliability`** — the pre-change baseline. It found the `half`-stop defect above, and that
  `no-density-clustering.test.ts` asserts against the *source text* of `place-marker-layer.tsx`,
  which is why the new layers are in their own file.
- **`maps-geospatial`** — the MapLibre 6.4.1 mechanics, ten assertions executed against the
  installed source. Three of its findings corrected code I had already written: my `symbol-sort-key`
  drew the largest country *underneath* the smallest, `circle-pitch-alignment` was pointless at
  pitch 0 and routed hit-testing down the wrong branch, and a circle layer is tappable outside its
  band. Its evidence is why the area band is a symbol layer.
- **`product-lead`** — the competitor feature rulings. Its most useful finding is that nine of the
  23 items were already ours.

---

## 5. Open, and sequenced

**Nothing here is in this branch, deliberately.**

| | Task | Why |
|---|---|---|
| 0 | **Tap a country and an area marker in a browser** | The one thing that landed unverified |
| 0 | **See a country group on screen** | Needs a second area in one country; the rules have tests, the rendering has none |
| 1 | `NAV-1` — the third peek slot | Discharges the owner's actual complaint. Same component as this branch, which is why it waits |
| 2 | `LIBRARY-IA-2b` — the off-screen recovery row | The band makes "camera far from your data" ordinary; there is currently no one-tap way back |
| 3 | The attributed caption quote (`product-inspiration` item 16) | Ranked first of the competitor items, nearly free — but **gated**: it may not ship until `extracted_reason` is written by the service-role writer. Today it is browser-forgeable, and unattributed that is a user lying to themselves, where attributed it is our product printing fabricated words beside a named creator |
| 4 | `LIBRARY-IA-3` — the filter bar | Answers the "categories" half of the owner's message |

**Known and unfixed on this branch:** the area label repeats the basemap's own city label directly
beneath the disc (`London` under a disc sitting on `London`) — cosmetic, visible at z6, not chased.
The mint ring is still the same value on dark as on light, because the dark ramp is an unsigned
first pass. And rotating the viewport without a reload still leaves the camera framed for the old
size, which predates all of this and is owned by nobody.

---

## 6. Needs the owner

Everything in the previous handoff's §6 still stands — the Google Places quota, the global-refusal
copy, the product name, the model provider, and production still being down on an empty env store.

New from today:

1. **The navigation structure.** The owner asked whether Collections and categories need somewhere
   of their own rather than living at the bottom of one scroll. The ruling is
   `ux-navigation-structure-2026-08-29.md`: a third peek slot, not a tab bar, with the honest
   alternative costed in its §1.5 if the owner wants a bar anyway. That is an owner decision, not an
   implementation choice.
2. **`product-inspiration-plotline-2026-08-29.md` §8 asks for two things**: whether `Open now` stays
   cut (recommended: yes, and `Open in Maps` is the honest version), and the attribution gate above.
3. **`L1-F7` (manual add) is `cut: never`, owned by two agents, and unstarted since 2026-08-27** —
   while the critical path has F4, the no-places screen, waiting on it. That is an unstaffed
   never-cut feature sitting under the modal import outcome.
