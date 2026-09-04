# Map list stability — design ruling (ux-interaction, 2026-08-28). BUILT.

> **Status 2026-09-04 — the zoom rule below is superseded, and this is where it says so.**
> §Behaviour's *"Zoom, any amount: NOTHING, ever"* was written when `activeAreaId` was the whole
> model and the list could only ever be one city; a zoom could then only hand it to another city by
> accident, so refusing every zoom was the right rule. The **zoom bands** (`ux-library-at-scale.md`
> §2.1) changed what a zoom means: the map now draws countries, then areas, then pins, and crossing
> a band is the user asking for a different *kind* of answer. `ui/place/list-scope.ts` therefore
> makes the discrete band the trigger, and a zoom is the only gesture that can cross one.
>
> So the live rule is: **a zoom that stays inside one band still changes nothing, ever** — that half
> of the sentence survives intact, and it is the half the owner's "do not refilter on every small
> map pan" was about. A zoom that **crosses a band** changes the scope, in the three ways
> `scopeAfterCameraSettled` tabulates. Everything else here — writer 4, the `originalEvent`
> enforcement, the cluster-not-rectangle decision, the pan rules, the copy — is unchanged.
>
> **Status 2026-08-30.** **Dead:** the "Elsewhere" one-row-per-area section and everything leaning on
> it — the owner deleted that tree (`d9cbdf2`, one `git revert` away), so §"The list" bullet 2, the
> `No matches in London` rationale and §"Disclosure" describe a UI that is gone; cut 6's "no
> collections UI" is reversed (collections shipped). **Live:** the cluster-not-rectangle decision,
> the behaviour table, the header copy strings, motion, a11y and the remaining cuts.

## The failure, precisely
A continuous, unauthored input (camera position) drives a binary, destructive output (list
membership). Camera changes from inertia, pinch overshoot, ResizeObserver re-fit, tile load,
framing a pin — often with NO user action behind it (I saw 21 -> 9 with nobody touching anything).
A row that leaves is gone and the only way back is to reproduce a camera position by hand.
Coupling is right; the GRANULARITY is wrong. The unit of scope should be a PLACE, not a RECTANGLE.
Also: "12 places in London" reads as a fact about the library; it behaved as a fact about a
rectangle. That is a lie by connotation in a product whose posture is never to convert
uncertainty into certainty.

## CORRECTION TO MY PREMISE (important)
current-state §9.1 credits the list binding with fixing the continental-view failure. §0.1
disproves it: the causes were (a) a MapLibre container-measurement bug and (b) anchoring the
camera on ONE cluster instead of fitBounds over all. **Unbinding membership does NOT reintroduce
the continental view, provided the anchor rule stays.**

## THE DECISION: the active area is a place CLUSTER, not a rectangle
`src/domain/places/clusters.ts` already does ~50 km coordinate clustering (deliberately not the
`locality` string — the library holds 3 spellings for 2 cities). The map says WHICH OF YOUR AREAS
you are in. Pan/zoom freely inside an area: nothing changes at all. Cross into another of your
areas: the list switches, and you meant it. The cluster boundary IS the hysteresis — data-shaped,
not screen-shaped, no magic constant to tune.

## THE ONE RULE
**Narrowing never navigates. Navigation is always an explicit tap.**
Search/tags/filters narrow and NEVER move the camera or change the active area.

## State: `activeAreaId: ClusterId`, FOUR writers and no others
1. initial anchor resolution (existing rule: valid recent camera w/ >=1 place -> cluster of most
   recently saved place -> largest cluster)
2. a tap on an area row
3. post-import (area of the newly saved places)
4. a SETTLED USER GESTURE that crossed into another area
NEVER re-derived from settled bounds. Enforcement: in `moveend`, only consider writer 4 when
`e.originalEvent` is present — a programmatic move has none, so it structurally cannot rewrite
the list. THIS IS THE SPECIFIC FIX FOR 21 -> 9.

**`originalEvent` is necessary and not sufficient, measured 2026-09-04.** Three user gestures drive
the camera and produce `moveend`/`zoomend` with no `originalEvent` on them, so the guard as written
refuses the user as well as the machine: the `+`/`−` controls (`map.zoomTo` is a programmatic
command), a **discrete mouse-wheel notch** (MapLibre 6.4.1's `ScrollZoomHandler._onTimeout` sets
`_type = 'wheel'` and starts the zoom without ever assigning `_lastWheelEvent`, so `renderFrame()`
returns `originalEvent: undefined` — 26 consecutive notches at 650 ms spacing all reported
`userInitiated: false`, while a trackpad burst of the same size reported `true`), and a shift-drag
box zoom (`fitScreenCoordinates` is called with no `eventData`). Those three are covered by
listening to `wheel`, `boxzoomend` and the control's own callback. The rule the enforcement is
really after is *the camera event was caused by a person*, and `originalEvent` answers it for every
gesture MapLibre routes through a `cameraAnimation` and for none of these three.

## The list
- Section 1: EVERY place in the active area, filtered by search/tags, sorted most-recently-saved
  first. Order never changes on pan/zoom/resize.
- Section 2 "Elsewhere" (only if >=1 other area): ONE ROW PER OTHER AREA, count desc:
  `Tel Aviv-Yafo · 8 places · ›`. Tap = set active area + fly + scroll top + focus header.
- Area label: existing 70% normalised-locality rule but computed PER CLUSTER over the cluster's
  members, memoised once per library (stable for the session). Ambiguous -> "this area".

## Behaviour
- Load: anchor frames one cluster. Header/rows correct on first paint, DO NOT change when the map
  settles/resizes/re-fits.
- Pan within area: NOTHING (not header, rows, order, or scroll offset).
- Zoom **inside one band**, any amount: NOTHING, ever.
- Zoom **across a band edge** (`zoom-bands.ts`), settled and user-initiated: the scope follows what
  the map has started drawing — into the country band the list becomes the whole library; out of it
  the area under the camera, or — **in the area band only** — its country when two of that country's
  areas are on screen; and out of the area band into the pin band a *country* scope narrows to one
  of its own cities. A country never narrows to somewhere it does not contain, and a country
  arrived at by a landing that was already in the pin band is left alone — see `list-scope.ts`.
  Superseded the 2026-08-28 rule; see the status note at the top.
- **The country promotion is an area-band rule**, corrected 2026-09-04 after it made the fix above
  fire and change nothing. It exists so a country tap's landing and a manual zoom to the same
  camera produce the same heading, and a country tap cannot land in the pin band
  (`COUNTRY_LANDING_ZOOM.max` is half a band below it) — so in the pin band there is no second
  route to reconcile, and no area capsule on screen to promote. Measured against the real library:
  Israel's clusters are small enough that *every* view of the Tel Aviv metro holds eight to ten of
  them, so with the promotion applied at pin zoom `36 places in Israel` could never be escaped by
  zooming at all. Narrowing hides nothing — the map draws `matches`, not the scope, and every
  out-of-scope match stays in the continuation below the heading.
- Pan across boundary: at moveend (keep 120ms trailing debounce) with originalEvent -> dominant
  area = cluster with most pin anchors in the query rect; none in view -> nearest centroid to
  viewport centre; TIES PREFER CURRENT. Header crossfades 140ms, list scrolls to top.
- Pan into empty ocean: NOTHING changes. `Nothing saved in this area` + `Show my places` are
  DELETED — that state can no longer occur.
- Tap pin: select + detail; list unchanged; scroll list to matching row.
- Tap list row: frame the pin; activeAreaId explicitly HELD.
- Tag chip/search: filters the WHOLE library. Area rows show their own match counts. No camera
  movement, no area change.
- Import completes: writer 3.

## Header copy (exact)
`12 places in London` / `1 place in London` / `12 places in this area`
`3 matches in London` / `1 match in London` / `3 matches in this area`
`No matches in London`  <- needs NO escape button; the Elsewhere rows below already show where
                            the matches are, with counts, one tap away. Replaces `Show all matches`.
`Nothing matches "momos"` + Clear search   |   `Nothing tagged "momos"` + Clear filter
`Your map starts here.` (empty library, unchanged)
Library total still appears NOWHERE on /map.

## Motion — exactly two things move
- header on area change: 140ms opacity crossfade (marks the one legitimate change)
- camera flight on area-row tap: existing spatial ease ~700ms, cap z13
Nothing else. No row stagger, no count roll, no skeleton. prefers-reduced-motion: instant swap,
camera jump.

## A11y
- Live region announces ONLY on area change. Panning announces nothing (automatic — nothing changed).
- Area rows are real <button>, >=44x44, name "Tel Aviv-Yafo, 8 places, show on map".
- Focus to header heading after an area switch by tap.
- Map aria-label: "Map of your saved places in London. The list below names all 12."

## NOT building (explicit cuts)
1. NO "Search this area" pill — solves data volume we don't have (21 rows), adds a tap, still
   destroys the set. Existing ruling stands.
2. NO latch/pin/freeze control — a mode with an invisible off-state. Only needed if the default
   destroys; it no longer does.
3. NO pixel/percentage hysteresis threshold, no dwell timers.
4. NO dimming of rows whose pins are off-screen — puts the instability texture back, continuously.
   Revisit only if one area routinely exceeds ~25 rows.
5. NO distance-from-viewport-centre sort — a child of the binding. Distance belongs to near-me.
6. NO city-switcher screen, no collections UI, no favourites.
7. NO grouping on the `locality` string. Coordinate clustering only.
8. NO auto-flight on filter/search.
9. NO persisted activeAreaId.
10. DO NOT touch clusters.ts or the 50 km radius.

## Near-me (L1-F11) — SHIPPED 2026-08-30
Near-me is the single mode where the list is ORDERED BY DISTANCE and distances are displayed,
because distance-from-you is a fact about the world while distance-from-map-centre never was.
Shipped with permission requested only on an explicit tap, and a distance label only against a fix
accurate to 500 m.

## Disclosure
Partially overturns the §9.3 / ux-map-is-the-query §8 refusal of a "city switcher" — but only to a
list SECTION with a tap target, not a screen. Both refusals were written under the viewport-binding
premise the owner has now reopened.
This change removes 2 camera movers (`Show my places`, `Show all matches`) and adds 1 (area-row
tap) — close current-state §7's six-vs-four enumeration debt in the same pass.

## If out of time
Ship without the Elsewhere rows; render other areas' places as a plain ungrouped continuation.
The stability win lands either way.
