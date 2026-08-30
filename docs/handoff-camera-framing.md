# Deferred: the camera system, as one piece of work

**Owner ruling, 2026-08-30.** The desktop framing defect below was found while landing NAV-2
(`refactor/collections-as-map-scope`, PR #104). It is **not** being fixed there. The owner's call:
handle the camera as one focused piece of work in a fresh session rather than patching individual
symptoms inside a navigation refactor. No camera change is on PR #104.

## 1. What is wrong

**`/collections/[id]`, desktop, reproduced by the owner.** "London 2026" holds 15 places, all
within ~5 km of central London. The map frames Oxford → Colchester → Brighton, roughly 200 km
across. All 15 pins land in one overlapping clump ~60 px wide: individually untappable.

The **centre is correct**; the **scale** is wrong by several zoom levels. This is not an
off-centre/padding problem.

Correct on the same build: this route at phone width, and `/map` at desktop width. So it is
specific to how a *collection* fits its bounds at `lg+`.

**Probably the same root cause**, seen on the sibling route: `/collections` (the index) at desktop
frames its 2 pins (London, Tel Aviv) with both **clipped at the fit edges** — London's pin head cut
off at the top, Tel Aviv's at the bottom right. The pins sit exactly on the fitted box's corners,
and the marker glyph is ~90 px tall above its anchor while the fit allows it none.

**Pre-existing or introduced by this branch: UNKNOWN.** Not measured. A worktree of `main` at
`/private/tmp/p002-main` settles it cheaply and should be the first step.

## 2. Suspected cause — a hypothesis, not a finding

Unproven. Nobody has measured the numbers.

At `lg+` the desktop panel is a large opaque `occlusion.left`. The chain to look at:

- `src/components/map/map-surface.mapcn.tsx`
  - `FIT_BOUNDS_MAX_ZOOM = 15` (~line 138)
  - `fitBoundsPadding()` (~line 211) — sums `FIT_BOUNDS_PADDING` + floating top chrome +
    `mapOcclusionInsets`, then runs the result through `clampFitPadding`
  - the `cameraForBounds` / `fitBounds` call (~line 533)
  - the `markerAllowance` parameter, which both collections fits currently leave at zero. Its
    docblock asserts "a pin's icon is small and the 48 px of cosmetic breathing room already covers
    it" — the index's clipped pins suggest that assumption is false for this glyph.
- `src/components/map/query-rect.ts` — `clampFitPadding`, `mapOcclusionInsets`
- `src/components/map/bounds.ts` — `boundsOfPoints`, the mount-time `initialBounds` hint both
  collections routes pass

**The hypothesis:** `clampFitPadding` scales the whole padding box down to fit the container, and
what is left is so little usable map area that `cameraForBounds` answers a far lower zoom than the
bounds deserve. **Measure the real padding object and the returned zoom before changing anything.**

Both routes pass `floatingTopChromePx={0}` deliberately — `L2-COLL-CAM-2` measured why. Do not
"fix" that.

## 3. The five camera-mover checks — NO RESULTS

Commit `4f5b254` collapsed `focusPlaceIds` + `focusBounds` into **one focus slot** in
`src/components/shell/use-map-shell.ts` that all eight movers write through. Three were exercised
during the refactor: initial framing, list-row tap, detail flight.

Five were not: the country pill, the area pill, mover 5, post-import, near-me.

A verification run was started and **stopped before it reported**. **Every one of the five is
UNVERIFIED. No mover has been shown to pass, and none has been shown to fail.** Nothing here may be
read as evidence either way.

The two failure modes it was hunting, both of which pass unit tests and break the map:
1. a mover that no longer **re-fires on a repeat tap** — flights are keyed on array identity, so
   the second tap of the same pill may be a silent no-op;
2. two movers **racing** for the same slot (a pill tap and the refit landing in the same tick),
   last writer wins, user sees the wrong frame.

## 4. Camera files created, not committed, not verified

Untracked in the working tree. **Written by a stopped agent; never run to a reported result.**
Treat as drafts, not as passing tests.

- `tests/e2e/helpers/map-camera.ts` — `installCameraProbe`, `readCamera`, `settledCamera`,
  `renderedMarkers`, `tapMarker`, `savedPlaceIdsOnMap`
- `tests/e2e/camera-movers.spec.ts` — movers 5 (country), 4 (area), 8 (near me), 7 (＋ menu pick)
- `tests/e2e/camera-post-import.spec.ts` — mover 2 (post-import)

`camera-post-import.spec.ts` drives a **real import**, which spends a model call and a Google Places
lookup. Read it before running it.

`map-camera.ts` is one of three files carrying lint **warnings** (not errors).

## 5. Not to be confused with this work

`scripts/nls-benchmark.ts` and `docs/evidence/search/` are untracked, belong to a different
(natural-language-search) workstream, and are nobody's on this branch. `nls-benchmark.ts` alone
produces **all 19 lint errors and all 10 typecheck errors** in the repo, and blocks `npm run build`.
Deal with it as its own change.
