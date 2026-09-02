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
import { AREA_BAND_MAX, AREA_BAND_MIN } from './zoom-bands';

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
   *  is what a "there is more inside" treatment would read, and what the tests assert against. */
  readonly groupSize: number;
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
 * carry is the whole group's count, and the group's id is the absorber's id — so tapping it frames
 * the area it names, exactly as before.
 */
export function layoutAreaBand(areas: AreaFeatureCollection): AreaBandFeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point, AreaBandFeatureProperties>[] = [];
  AREA_BAND_STEPS.forEach((step, index) => {
    for (const candidate of layoutStep(areas.features, step.minzoom)) {
      features.push({
        type: 'Feature',
        geometry: candidate.feature.geometry,
        properties: {
          ...candidate.feature.properties,
          count: candidate.count,
          step: index,
          groupSize: candidate.groupSize,
        },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}
