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
 * ## What a pill counts, and what a tap on it opens (2026-09-04)
 *
 * Absorption used to move the absorbed area's **count** onto the absorber, so `תל אביב-יפו 13`
 * counted a group while its tap carried the absorber's id alone and opened `6 matches in
 * תל אביב-יפו` — *"the pill said 13 and I got 6"*. A pill is a count and a tap target, and those
 * two were describing different sets.
 *
 * That was first fixed on the **tap**: a grouped pill stopped opening anything and expanded the
 * camera instead. The owner used it the same day and rejected it — *"when you click on 'tel aviv'
 * cluster the reposition of the map isn't good why? it was better"*, then, naming the control
 * himself, *"like when you click on ראשון — the zoom is good... or any other city"*. `ראשון לציון`
 * is an **ungrouped** pill: what he was calling good is camera mover 4, a `fitBounds` over that
 * area's own matching places with the sheet's padding. Splitting the gesture had taken that away
 * from exactly one city, and it was the wrong end of the problem.
 *
 * **So the tap is uniform again and the count is what changed: a pill shows its own area's count,
 * never the group's.** The number on the pill is the number its tap opens, at every zoom, for every
 * pill. Absorption still decides *which* pills are drawn — that is a collision problem and it does
 * not go away — but it no longer moves a number onto a pill that will not open it.
 *
 * ### What that costs, stated plainly
 *
 * **At a zoom where two cities collide, the drawn pills no longer sum to the country's count.** The
 * absorbed area is not drawn and its places are not counted anywhere in the area band. Measured on
 * the real twelve-area library (`tests/unit/map/area-band-counts.test.ts` asserts every number):
 * the drawn pills account for **42 of 58** places at the coarsest step and 52 of 58 at the finest,
 * and five areas — פתח תקווה, הוד השרון, תל יצחק, רעננה, כפר סבא, six places between them — are
 * absorbed at *every* step and so are never drawn as a pill at any zoom in this band.
 *
 * **Those five were already undrawn before this change; what is new is that they are also
 * uncounted.** Absorption has never drawn them — it moved their number onto a neighbour. So the
 * delta here is arithmetic and not visibility: a pill that used to say `13` says `6`, and the six
 * places behind the other seven are found where they always were, in the list and in the pin band.
 *
 * This file used to reject that outright, and the sentence is still in its history: *"the collision
 * index again — 18 of 58 places invisible and uncounted — which is the defect this whole file exists
 * to end"*. The ground it stood on has moved, in two ways:
 *
 *  1. **Nothing is unreachable.** A tap on the pill that is drawn is mover 4, which fits that area's
 *     own places and lands in the pin band — where *every* place is its own marker and the absorbed
 *     neighbour's places are drawn individually. The list beside the map names them too, in
 *     `Everywhere else`, and the country pill above still counts every one of them. Country → city
 *     → pins is the disclosure the map already runs on.
 *  2. **A pill that lies about what it opens is worse than a pill that is absent.** The absent one
 *     under-promises; the other one is a number the product cannot honour, one tap away from proving
 *     it, and it was the shape of the owner's report.
 *
 * The gap is real and it is worth closing properly, on the pill rather than on the tap: a `+N`
 * affordance on a pill that stands in front of others would say *there is more here* without
 * claiming those places as its own. `groupSize` below is already the number it would read, which is
 * why absorption still tracks it. That is a change to the pill's **bitmap**, which is
 * `country-flag-image.ts` / `summary-style.ts` and not this file's to make.
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
  /**
   * How many areas this pill stands **in front of** — 1 for an area drawn as itself.
   *
   * It no longer changes anything about the pill or its tap, and it is kept deliberately: it is the
   * number a `+N` affordance would draw, and it is the only place the layout records that something
   * was displaced. Every test about the collision behaviour asserts against it.
   */
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
  /** The area's **own** count, and it never changes — see the header. It is here rather than read
   *  through `feature` because `overlaps` sizes the pill from it, and the pill's width is a fact
   *  about what is drawn. */
  readonly count: number;
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
 * One step's pills: greedy in descending count, and that single pass is the whole layout.
 *
 * **It used to need a second, fixed-point pass** (`compact`), because absorbing added the absorbed
 * area's count to the absorber, which made the absorber's pill *wider*, which could push it into a
 * pill that had already been placed. Since a pill carries only its own count (see the header), a
 * placed pill never changes size or position again — so the greedy pass's own invariant, "no
 * candidate is placed that overlaps anything already placed", is the final one. The second pass was
 * removed rather than left in: a loop that provably cannot fire is a claim about the code that is
 * not true.
 */
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
      // The blocker stands in front of it. Its *count* is untouched — that is the 2026-09-04
      // ruling — and `groupSize` is the only record that anything was displaced.
      blocker.groupSize += 1;
    } else {
      placed.push(candidate);
    }
  }
  return placed;
}

/**
 * Every step's pills, in one collection.
 *
 * A pill keeps **its own coordinate, its own label and its own count**. Never the group's weighted
 * mean — a pill reading `תל אביב-יפו` belongs over Tel Aviv, and a marker that drifts toward the
 * places it stands in front of is the same lie the displacement design was rejected for — and,
 * since 2026-09-04, never the group's number either, so that the count and the tap are two
 * statements about one set. See the header for what that costs and why it is the better trade.
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
