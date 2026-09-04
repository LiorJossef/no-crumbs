/**
 * The area band's **hierarchy**: which area pills are drawn at which zoom, and what happens to the
 * ones there is no room for.
 *
 * ## The defect this exists for
 *
 * `summary-style.ts` used to hand the question to MapLibre's collision index —
 * `icon-allow-overlap: false` plus a negated `symbol-sort-key`, so "the area holding the most
 * places is placed first and the loser is hidden until zooming in makes room". The comment claimed
 * the recovery always arrives, *"because z8.5 ends the band"*. Measured against the owner's real
 * library on 2026-09-02, it does not:
 *
 * | pair | separation at z4.5 | at z7 | at z8.4 (top of the band) | pill widths |
 * |---|---|---|---|---|
 * | `תל אביב-יפו 20` ↔ `הרצליה 3` | 3.7 px | 20.9 px | 55 px | 165 px and 118 px |
 *
 * A pill hangs half its width either side of its own coordinate, so those two need ~141 px of
 * horizontal clearance or 42 px of vertical clearance, and under the collision index — which
 * measured the shadow-padded box, not the drawn pill — they reached neither until z8.4, inside the
 * 0.15-wide window `settleZoom` deliberately keeps a resting camera out of. **Herzliya was
 * therefore never drawn at any zoom in the band**, and neither were seven of the library's twelve
 * areas: at every zoom from 4.5 to 8, Israel's eight areas drew as `תל אביב-יפו 20` alone, with 18
 * saved places neither visible nor counted anywhere on the map. That is the owner's report — *"you
 * can see Tel Aviv but can't see Herzliya"* — and the mechanism is that a collision index is not a
 * hierarchy. It answers *which pixels are free*, and it answers it by silently deleting a feature.
 *
 * ## The rule that replaces it
 *
 * **An area that cannot be drawn is absorbed into the neighbour that displaced it, and its places
 * are added to that neighbour's count.** Nothing is dropped, so the invariant is arithmetic and a
 * test can hold it at every zoom:
 *
 * > the counts on the pills drawn in the area band sum to the size of the library.
 *
 * A saved place may be *summarised* — that is what a summary band is — but it may never be both
 * invisible and uncounted, which is what the collision index was doing to 18 of 58.
 *
 * **This is not density clustering returning under another name** (`06` §9.1, `L1-F5-T5`, and
 * `place-marker-layer.tsx`'s header). Nothing here touches a saved place or a radius: the inputs
 * are the *areas the list already has*, the ones that name its active scope and render as its
 * section headers, and the output is the same objects with the ones that do not fit folded into
 * the one that does. No pin is hidden behind a bubble; the pin band is untouched, and every place
 * is its own pin the moment the band ends.
 *
 * ## Why aggregation and not displacement
 *
 * The alternative — nudge the loser aside on a leader line, the way a cartographer de-collides a
 * label — was measured and rejected. Herzliya needs 31 px of vertical displacement to clear Tel
 * Aviv at z7, which at that zoom is **16 km**: the pill would name Herzliya while sitting over
 * Bat Yam. At z5, where the eight Sharon areas span 5 px, an honest layout is a 400 px column of
 * pills each up to 200 km from the place it names. That is a label-spreading diagram, not a map,
 * and it manufactures exactly the *"header said `1 in הרצליה` for a Jerusalem save"* class of
 * defect the project already has open. A count that is right is worth more than a position that is
 * approximately wrong.
 *
 * Also rejected: a **reduced form** for the loser (count-only, no label). It buys one zoom level —
 * a 52 × 24 px marker still collides with Tel Aviv's pill until z7.9 — and it spends the label,
 * which is the only thing that makes the band a *named* geography.
 *
 * ## What a grouped pill's tap means (2026-09-04)
 *
 * Absorption left the pill saying two different things. `תל אביב-יפו 13` counted a **group** while
 * its tap carried the **absorber's** id alone, so the tap opened `6 matches in תל אביב-יפו` — "the
 * pill said 13 and I got 6", the same confidently-wrong number as the pre-`bc7d1ea` bands, one
 * gesture over. A pill is a count and a tap target, and those two were describing different sets.
 *
 * Three ways to make them one set, and the third is what shipped:
 *
 *  1. **Carry the absorbed ids and open all of them.** It needs a list scope that is a *set of
 *     areas*, and that scope would be a **pixel accident**: the same city tapped at z5 and at z7
 *     would produce different lists, and the scope also resolves `preferredAreaId`, `defaultScope`
 *     and `initialBounds`. A layout artefact must not become navigation state.
 *  2. **Show the absorber's own count and drop the absorbed one.** That is the collision index
 *     again — 18 of 58 places invisible and uncounted — which is the defect this whole file exists
 *     to end. Rejected outright.
 *  3. **Stop the pill standing for several areas at all, by taking the user to a zoom where it does
 *     not.** A tap on a grouped pill is an *expand*: the camera eases to `expandZoom`, the first
 *     zoom at which this area is drawn on its own, and the group visibly separates into the pills
 *     it was standing for — each of which then opens exactly what it counts. Nothing is uncounted,
 *     no scope is invented, and the count and the tap finally answer one question: *these are the
 *     13, here they are*.
 *
 * It is the ordinary cluster gesture, and it terminates: a group that never separates inside the
 * band expands into the pin band, where every place is its own marker.
 *
 * ## Why it costs no zoom listener
 *
 * The layout depends on zoom, and §2.1's whole design is that **MapLibre owns the swap**: no zoom
 * listener, no React state on zoom, no re-render while the user pinches. So the layout is computed
 * ahead of time at five fixed step floors and every variant is emitted at once, carrying the step
 * it belongs to; `summary-marker-layer.tsx` draws one layer per step with `minzoom`/`maxzoom` and a
 * static `['==', ['get', 'step'], i]` filter. The band still swaps declaratively, one level deeper.
 *
 * Each step is computed at its **floor**, which is its worst case: pixel separation grows with
 * zoom and pill widths do not, so a layout that does not collide at the floor cannot collide
 * anywhere else in the step. That is what lets the pills go back to `icon-allow-overlap: true` —
 * with nothing overlapping by construction, there is no collision for MapLibre to resolve, and
 * therefore nothing it can silently drop.
 */

import { SUMMARY_PILL, summaryPillFitAllowance } from './country-flag-image';
import type { AreaFeatureCollection, AreaFeatureProperties } from './summary-features';
import { AREA_BAND_MAX, AREA_BAND_MIN, BAND_EDGE_GUARD, PIN_BAND_MIN } from './zoom-bands';

/**
 * The zoom each step is computed at, and the range it is drawn over: `[floor, next floor)`, the
 * last one ending at `AREA_BAND_MAX`.
 *
 * One zoom level wide, which is a trade rather than a tuning. Wider steps are cheaper and coarser —
 * an area that could stand on its own at 7.9 waits for the pin band. Narrower ones cost a layer
 * each and buy nothing the eye can see, because the thing that changes across a step is a factor of
 * two in separation.
 *
 * **The last step is the exception, and it is a quarter of a level.** Two cities ten kilometres
 * apart — Tel Aviv and Herzliya, which is the pair the owner reported — first clear each other
 * vertically at z8.15, and the band ends at 8.5. A one-level step would compute that stretch at
 * 7.5, where they do not clear, and hand the user straight to the pin band having never named
 * Herzliya on the map at all. So the finest step is as fine as the band allows: it is where the
 * summary is about to become pins, and it should be as close to the pins as the geometry permits.
 */
export const AREA_BAND_STEPS: readonly { readonly minzoom: number; readonly maxzoom: number }[] = [
  { minzoom: AREA_BAND_MIN, maxzoom: AREA_BAND_MIN + 1 },
  { minzoom: AREA_BAND_MIN + 1, maxzoom: AREA_BAND_MIN + 2 },
  { minzoom: AREA_BAND_MIN + 2, maxzoom: AREA_BAND_MIN + 3 },
  { minzoom: AREA_BAND_MIN + 3, maxzoom: AREA_BAND_MAX - 0.25 },
  { minzoom: AREA_BAND_MAX - 0.25, maxzoom: AREA_BAND_MAX },
];

/**
 * Clear air between two pills, in CSS pixels.
 *
 * `summaryPillFitAllowance` already carries an 8% margin for the basemap's glyphs not being the
 * measurement canvas's font; this is on top of it, and it is what stops two pills that merely
 * *touch* reading as one wide pill.
 */
const PILL_GAP_PX = 8;

/**
 * The vertical clearance two pills need, and it is the **drawn** pill's height plus the gap — not
 * `SUMMARY_PILL_HEIGHT`, which adds the transparent shadow margin on both sides.
 *
 * Worth the distinction: 16 px of invisible padding is a third of the box, and it is the difference
 * between Tel Aviv and Herzliya clearing each other at z8.15 and never clearing at all inside the
 * band. The gap absorbs the drop shadow, which reaches about 6.5 px below the pill.
 */
const PILL_CLEAR_Y_PX = SUMMARY_PILL.height + PILL_GAP_PX;

export interface AreaBandFeatureProperties extends AreaFeatureProperties {
  /** Which of `AREA_BAND_STEPS` this variant is drawn in. */
  readonly step: number;
  /** How many areas this pill stands for — 1 for an area drawn as itself. Not rendered today; it
   *  is what a "there is more inside" treatment would read, what the tests assert against, and —
   *  since 2026-09-04 — **what decides which of the two things a tap on this pill means**. */
  readonly groupSize: number;
  /**
   * **The zoom a tap on this pill goes to when it stands for more than one area**, and `null` when
   * it stands for itself.
   *
   * The first zoom at which this pill stops speaking for anybody else: the floor of the earliest
   * later step where this same area is laid out with `groupSize === 1`, or, for a group that never
   * separates inside the band, a hair into the pin band (`PIN_BAND_MIN + BAND_EDGE_GUARD` — the
   * one place a camera is allowed to read a band boundary from, and clear of the rounding window
   * `settleZoom` documents). Pins are the ultimate separation: every place is its own marker there,
   * so the expansion always terminates.
   *
   * The camera keeps the tapped pill in the centre rather than framing a group bounding box, and
   * the measurement that makes that sound is the real library's worst case: the ten-area Sharon
   * group Tel Aviv carries at z4.5 never separates inside the band, so it expands to 8.65, where a
   * 390 px-wide phone shows about 63 km across and 165 km down and the group spans 14 km by 34 km.
   * It arrives whole. A future library that breaks that would want the bounding box, and the
   * absorbed features are what it would be built from.
   */
  readonly expandZoom: number | null;
}

export type AreaBandFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AreaBandFeatureProperties
>;

/** Web Mercator, in the 512 px tile units MapLibre measures screen pixels in. */
function projectX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 512 * Math.pow(2, zoom);
}

function projectY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05, Math.min(85.05, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 512 * Math.pow(2, zoom);
}

/** Half the width the pill will shape to, label and count together. The count is part of it, so a
 *  pill that absorbs a neighbour gets wider and is re-tested — see `compact`. */
function halfWidthPx(label: string, count: number): number {
  return summaryPillFitAllowance([{ text: `${label}  ${count}`, capped: false }]).x;
}

interface Candidate {
  readonly feature: GeoJSON.Feature<GeoJSON.Point, AreaFeatureProperties>;
  readonly x: number;
  readonly y: number;
  count: number;
  groupSize: number;
}

function overlaps(a: Candidate, b: Candidate): boolean {
  const clearX = halfWidthPx(a.feature.properties.label, a.count) +
    halfWidthPx(b.feature.properties.label, b.count) +
    PILL_GAP_PX;
  return (
    Math.abs(a.x - b.x) < clearX && Math.abs(a.y - b.y) < PILL_CLEAR_Y_PX
  );
}

/** Bigger first, and **ties broken on the area's own id** — a layout that reordered between two
 *  renders of the same library would make pills appear to swap places on their own. */
function byCount(
  a: GeoJSON.Feature<GeoJSON.Point, AreaFeatureProperties>,
  b: GeoJSON.Feature<GeoJSON.Point, AreaFeatureProperties>,
): number {
  return (
    b.properties.count - a.properties.count ||
    (a.properties.id < b.properties.id ? -1 : a.properties.id > b.properties.id ? 1 : 0)
  );
}

/**
 * Absorbing widens the absorber, which can push it into a pill that was already placed. So the
 * greedy pass is followed by a fixed point: merge the smaller of any overlapping pair into the
 * larger and go round again. Counts only ever grow, and each pass removes a pill, so it terminates
 * in at most `n` rounds.
 */
function compact(placed: Candidate[]): Candidate[] {
  for (let guard = 0; guard < placed.length; guard += 1) {
    let merged = false;
    outer: for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i] as Candidate;
        const b = placed[j] as Candidate;
        if (!overlaps(a, b)) continue;
        const [keep, gone] = a.count >= b.count ? [a, b] : [b, a];
        keep.count += gone.count;
        keep.groupSize += gone.groupSize;
        placed.splice(placed.indexOf(gone), 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) break;
  }
  return placed;
}

/** One step's pills: greedy in descending count, then compacted. */
function layoutStep(
  features: readonly GeoJSON.Feature<GeoJSON.Point, AreaFeatureProperties>[],
  zoom: number,
): Candidate[] {
  const placed: Candidate[] = [];
  for (const feature of [...features].sort(byCount)) {
    const candidate: Candidate = {
      feature,
      x: projectX(feature.geometry.coordinates[0] ?? 0, zoom),
      y: projectY(feature.geometry.coordinates[1] ?? 0, zoom),
      count: feature.properties.count,
      groupSize: 1,
    };
    const blocker = placed.find((other) => overlaps(other, candidate));
    if (blocker) {
      blocker.count += candidate.count;
      blocker.groupSize += 1;
    } else {
      placed.push(candidate);
    }
  }
  return compact(placed);
}

/**
 * Every step's pills, in one collection.
 *
 * The absorbing pill keeps **its own coordinate and its own label**, never the group's weighted
 * mean: a pill reading `תל אביב-יפו` belongs over Tel Aviv, and a marker that drifts toward the
 * places it has absorbed is the same lie the displacement design was rejected for. What it does
 * carry is the whole group's count — and, since 2026-09-04, the zoom that takes the user to the
 * places that count is about. The id stays the absorber's, and it is only read where the pill
 * stands for one area; see the header for why a grouped pill no longer opens it.
 */
export function layoutAreaBand(areas: AreaFeatureCollection): AreaBandFeatureCollection {
  const steps = AREA_BAND_STEPS.map((step) => layoutStep(areas.features, step.minzoom));
  const features: GeoJSON.Feature<GeoJSON.Point, AreaBandFeatureProperties>[] = [];
  steps.forEach((placed, index) => {
    for (const candidate of placed) {
      features.push({
        type: 'Feature',
        geometry: candidate.feature.geometry,
        properties: {
          ...candidate.feature.properties,
          count: candidate.count,
          step: index,
          groupSize: candidate.groupSize,
          expandZoom:
            candidate.groupSize > 1
              ? expandZoomFor(candidate.feature.properties.id, index, steps)
              : null,
        },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

/** See `AreaBandFeatureProperties.expandZoom`. Reads the layouts that were computed for the finer
 *  steps rather than re-deriving a separation zoom, so the zoom a tap goes to is by construction a
 *  zoom at which this layout draws the area on its own. */
function expandZoomFor(id: string, step: number, steps: readonly Candidate[][]): number {
  for (let later = step + 1; later < steps.length; later += 1) {
    const drawn = (steps[later] as Candidate[]).find(
      (candidate) => candidate.feature.properties.id === id,
    );
    if (drawn && drawn.groupSize === 1) {
      return (AREA_BAND_STEPS[later] as { minzoom: number }).minzoom;
    }
  }
  return PIN_BAND_MIN + BAND_EDGE_GUARD;
}
