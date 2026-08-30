/**
 * **Where the camera settles, across the library shapes `current-state.md` §9.3 names.**
 *
 * §9.3 has required this since 2026-08-27 and it was never discharged. Two camera defects then
 * shipped to production on 2026-08-30, both on the owner's own library, and both are shapes in
 * `library-shapes.ts`:
 *
 *  1. **The camera fitted every area instead of anchoring on one.** The settled view spanned
 *     Israel, Jordan and Syria: area-count pills, not one individual pin, under a header that
 *     correctly read `3 places in תל אביב-יפו`.
 *  2. **A place selected from the list came to rest behind the bottom sheet.** The pin was framed
 *     into the whole viewport rather than into the band the half-height sheet leaves visible.
 *
 * The assertions below are the product's **rules**, never pixel values, so they stay true when the
 * padding constants or the band edges are tuned:
 *
 *  - a non-empty library settles in the **pin band** (`z >= PIN_BAND_MIN`) with at least one
 *    individual place inside the visible map, because a view of nothing but cluster bubbles is the
 *    failure §9.3 names first;
 *  - the camera belongs to **one** cluster, so a distant outlier cannot drag it to a continental
 *    view;
 *  - a selected place lands inside the **band above the sheet**, not merely inside the viewport;
 *  - a zero-place library gets a camera of its own rather than MapLibre's constructor default.
 *
 * The derivation below is the page's own — `clusterByProximity` → `pickAnchorCluster` →
 * `anchorCluster.bounds` → the surface's fit — with the real functions wherever one is importable.
 * `camera-model.ts` explains exactly which two links are mirrored and why they cannot be imported.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EMPTY_LIBRARY_BOUNDS } from '@/ui/place/viewport';
import {
  clusterByProximity,
  pickAnchorCluster,
  type GeoBounds,
  type GeoCluster,
} from '@/domain/places/clusters';
import { COUNTRY_LANDING_ZOOM, PIN_BAND_MIN } from '@/components/map/zoom-bands';

import {
  BREAKPOINTS,
  DESKTOP,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  FLOATING_TOP_CHROME_MOBILE_PX,
  FLOATING_TOP_CHROME_PX,
  PHONE,
  SHEET_HALF_FRACTION,
  fitCamera,
  inBand,
  unionBounds,
  visibleBand,
  type Viewport,
} from './camera-model';
import {
  EMPTY,
  FIVE_ISRAELI_AREAS,
  ONE_CITY,
  POPULATED_SHAPES,
  SINGLE,
  TEL_AVIV_PLUS_TOKYO,
  TWO_CITIES,
  type FixturePlace,
  type LibraryShape,
} from './library-shapes';

/* ---------------------------------------------------------------------------
 * The page's derivation, reproduced with the page's own functions.
 * `src/app/map/map-page-client.tsx:313-354`.
 * ------------------------------------------------------------------------ */

function clustersOf(shape: LibraryShape): readonly GeoCluster<FixturePlace>[] {
  return clusterByProximity(shape.places, (place) => place, {
    toLocality: (place: FixturePlace) => place.locality,
  });
}

/** `anchorCluster` — the cluster holding the most recent save, else the largest. */
function anchorClusterOf(shape: LibraryShape): GeoCluster<FixturePlace> | null {
  const recentId = shape.places[0]?.id;
  return pickAnchorCluster(clustersOf(shape), {
    ...(recentId ? { recentItemId: recentId } : {}),
    toId: (place: FixturePlace) => place.id,
  });
}

/**
 * `const initialBounds = anchorCluster?.bounds ?? EMPTY_LIBRARY_BOUNDS` — what the page hands the
 * surface. The fallback is the fix for Rule 4: an empty library has no anchor cluster, and passing
 * `undefined` fell through to MapLibre's constructor default (the globe at zoom 0).
 */
function initialBoundsFor(shape: LibraryShape): GeoBounds | undefined {
  return anchorClusterOf(shape)?.bounds ?? EMPTY_LIBRARY_BOUNDS;
}

/* ------------------------------------------------------------------ Rule 1 */

describe('a non-empty library never settles on a view with no pin in it', () => {
  for (const shape of POPULATED_SHAPES) {
    for (const viewport of BREAKPOINTS) {
      /**
       * The §9.3 criterion in one assertion. Below `PIN_BAND_MIN` the pin layer does not draw at
       * all (`place-marker-layer.tsx`), so the user is looking at area bubbles — which is exactly
       * what the owner photographed. `COUNTRY_LANDING_ZOOM.max` is asserted alongside it because
       * the task names it, and because a camera resting in the country band is the same failure
       * one band further out.
       */
      it(`${shape.name} settles in the pin band at ${viewport.label}`, () => {
        const bounds = initialBoundsFor(shape);
        expect(bounds).toBeDefined();
        const camera = fitCamera(bounds as GeoBounds, viewport);
        expect(camera).not.toBeNull();
        expect(camera?.zoom).toBeGreaterThan(COUNTRY_LANDING_ZOOM.max);
        expect(camera?.zoom).toBeGreaterThanOrEqual(PIN_BAND_MIN);
      });

      it(`${shape.name} settles with at least one place on visible map at ${viewport.label}`, () => {
        const camera = fitCamera(initialBoundsFor(shape) as GeoBounds, viewport);
        const band = visibleBand(viewport);
        const onScreen = shape.places.filter(
          (place) => camera !== null && inBand(camera.screenOf(place), band),
        );
        expect(onScreen.length).toBeGreaterThan(0);
      });
    }
  }
});

/* ------------------------------------------------------------------ Rule 2 */

describe('the camera anchors on one cluster, never the union of all of them', () => {
  /**
   * The anchor for the owner's production library is the three Tel Aviv rows — which is what makes
   * the defect legible: the header named that cluster correctly while the camera did not.
   */
  it("picks the owner's Tel Aviv cluster, not all five areas", () => {
    const anchor = anchorClusterOf(FIVE_ISRAELI_AREAS);
    expect(anchor?.count).toBe(3);
    expect(anchor?.count).toBeLessThan(FIVE_ISRAELI_AREAS.places.length);
  });

  it('never anchors on a box containing every place, once there is more than one area', () => {
    for (const shape of [FIVE_ISRAELI_AREAS, TEL_AVIV_PLUS_TOKYO, TWO_CITIES]) {
      const anchor = anchorClusterOf(shape);
      expect(anchor?.count).toBeLessThan(shape.places.length);
    }
  });

  /** Tel Aviv + Tokyo is the shape a naive fit answers with an ocean. Anchoring means Tokyo is
   *  simply not on screen — which is correct, and is what `Elsewhere` is for. */
  it('leaves the distant outlier off screen rather than zooming out to contain it', () => {
    const camera = fitCamera(initialBoundsFor(TEL_AVIV_PLUS_TOKYO) as GeoBounds, PHONE);
    const band = visibleBand(PHONE);
    const tokyo = TEL_AVIV_PLUS_TOKYO.places.find((place) => place.countryCode === 'JP');
    expect(tokyo).toBeDefined();
    expect(camera).not.toBeNull();
    expect(inBand((camera as NonNullable<typeof camera>).screenOf(tokyo as FixturePlace), band)).toBe(
      false,
    );
  });

  /**
   * **The defect stated as a rule, and it is zoom-independent.** "The camera fitted all five areas
   * instead of anchoring on one" is a claim about *what is on screen*, so that is what is asserted:
   * a union fit shows all five of the owner's areas at once, an anchored fit shows exactly one.
   * Any code path that reaches the camera with the whole library flips this, whatever zoom the
   * particular library happens to fit at.
   */
  it("shows one of the owner's five areas, where a union fit would show all five", () => {
    const anchor = fitCamera(initialBoundsFor(FIVE_ISRAELI_AREAS) as GeoBounds, PHONE);
    const union = fitCamera(unionBounds(FIVE_ISRAELI_AREAS.places), PHONE);
    const band = visibleBand(PHONE);
    // Counted in *clusters*, not locality strings: `Tel Aviv` and `תל אביב-יפו` are two spellings
    // of one area, and the whole point of clustering on coordinates is that they are one thing.
    const areas = clustersOf(FIVE_ISRAELI_AREAS);
    const visibleAreas = (camera: ReturnType<typeof fitCamera>) =>
      areas.filter((area) =>
        area.members.some((place) => camera !== null && inBand(camera.screenOf(place), band)),
      ).length;

    expect(visibleAreas(union)).toBe(5);
    expect(visibleAreas(anchor)).toBe(1);
  });

  /**
   * **The measurement that says how the observed view was produced, and it is not a union fit.**
   *
   * Fitting the union of the owner's five areas on a 390×844 phone settles at **z 8.78** — above
   * `PIN_BAND_MIN`, so pins would still have drawn. The view the owner photographed had no pin on
   * it at all, which puts it *below* 8.5, and the only camera in this app that comes to rest there
   * by construction is the country landing: `COUNTRY_LANDING_ZOOM` caps at 8.0, half a zoom under
   * the pin floor, because §2.4 requires a country tap to land on area markers and never on pins.
   *
   * So this pair is a diagnosis, not a guard: a settled pill-only view over a whole country is
   * camera mover 5's framing, and the header naming one area underneath it means the scope and the
   * framing had come apart. Recorded here because it is the measurement, and the measurement is
   * what rules out the union-fit explanation.
   */
  it('a pill-only view of a whole country can only be the country landing', () => {
    const union = fitCamera(unionBounds(FIVE_ISRAELI_AREAS.places), PHONE);
    expect(union?.zoom).toBeGreaterThan(PIN_BAND_MIN);
    expect(COUNTRY_LANDING_ZOOM.max).toBeLessThan(PIN_BAND_MIN);
  });

  /**
   * The two shapes where a union fit *is* catastrophic and unmistakable: Tel Aviv + Tokyo settles
   * at z 0.98 and Tel Aviv + London at z 2.56, both deep in the country band. These are the guard
   * — if anything ever fits the whole library again, these fail loudly rather than marginally.
   */
  it('would fall out of the pin band entirely on a library that spans continents', () => {
    for (const shape of [TEL_AVIV_PLUS_TOKYO, TWO_CITIES]) {
      const union = fitCamera(unionBounds(shape.places), PHONE);
      expect(union?.zoom).toBeLessThan(PIN_BAND_MIN);
      const anchor = fitCamera(initialBoundsFor(shape) as GeoBounds, PHONE);
      expect(anchor?.zoom).toBeGreaterThanOrEqual(PIN_BAND_MIN);
    }
  });
});

/* ------------------------------------------------------------------ Rule 3 */

describe('a selected place comes to rest above the sheet, not behind it', () => {
  /** Camera mover 3 frames exactly the selected place (`setFocusPlaceIds([place.id])`), and
   *  selecting also raises the sheet to `half`. Both happen in the same tick. */
  function selectionCamera(place: FixturePlace, viewport: Viewport) {
    const box: GeoBounds = {
      north: place.lat,
      south: place.lat,
      east: place.lng,
      west: place.lng,
    };
    // The sheet is at `half` for as long as the place is open, and the surface resolves its fit
    // padding against *that* stop rather than the peek strip while `selected` is non-null
    // (`sheetFractionRef` in `map-surface.mapcn.tsx`). Framing against the peek strip is the
    // defect: it put the pin 28 px below the sheet's own top edge.
    return fitCamera(box, viewport, { restingSheetFraction: SHEET_HALF_FRACTION });
  }

  for (const viewport of BREAKPOINTS) {
    it(`puts the selected pin inside the band the sheet leaves visible at ${viewport.label}`, () => {
      const place = ONE_CITY.places[0] as FixturePlace;
      const camera = selectionCamera(place, viewport);
      expect(camera).not.toBeNull();
      // The sheet is at `half` for the whole time the place is open, so this — not the peek strip
      // — is the map the user can see.
      const band = visibleBand(viewport, SHEET_HALF_FRACTION * viewport.height);
      expect(inBand((camera as NonNullable<typeof camera>).screenOf(place), band)).toBe(true);
    });
  }

  /**
   * The same rule stated as the arithmetic that fails it, so a fix cannot satisfy the test by
   * moving the pin somewhere else that happens to be inside the band. On a 390×844 phone the
   * half-height sheet covers everything below y = 379.8; the framing above rests the pin lower
   * than that.
   */
  it('never frames a selected place lower than the top of the half-height sheet', () => {
    const place = ONE_CITY.places[0] as FixturePlace;
    const camera = selectionCamera(place, PHONE);
    const sheetTop = PHONE.height * (1 - SHEET_HALF_FRACTION);
    expect((camera as NonNullable<typeof camera>).screenOf(place).y).toBeLessThanOrEqual(sheetTop);
  });
});

/* ------------------------------------------------------------------ Rule 4 */

describe('a zero-place library gets a designed view', () => {
  it('has no cluster to anchor on, which is honest', () => {
    expect(anchorClusterOf(EMPTY)).toBeNull();
  });

  /**
   * §9.3: *"Zero places shows no bare world map: a plausible regional view."* The page hands the
   * surface `anchorCluster?.bounds`, the surface's `boundsFor` then returns `null`, and
   * `MapcnMap` is constructed with no `center` and no `zoom` — so an empty library falls through
   * to MapLibre's own default, which is `[0, 0]` at zoom 0. That is the bare world map, one zoom
   * level worse than the `zoom: 1` §9.1 recorded.
   *
   * Asserted at the page's own seam rather than against source text: whatever the designed view
   * turns out to be, this is the value that has to carry it. **If the answer turns out to be a
   * non-map empty screen instead of a regional camera, replace this assertion with one about that
   * screen — do not delete it.** The rule is that zero places is designed, not that it is a
   * bounding box.
   */
  it('still gives the surface a camera to open on', () => {
    expect(initialBoundsFor(EMPTY)).toBeDefined();
  });
});

/* ------------------------------------------------------------------ Rule 5 */

describe('the mirrored camera constants still match the surface', () => {
  const SURFACE_SOURCE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');

  /** `camera-model.ts` copies four private numbers out of a file no test can import. If any of
   *  them is tuned, the model above becomes fiction — silently — so the copy is checked. */
  it('holds the same four literals the surface declares', () => {
    expect(SURFACE_SOURCE).toContain(`const FIT_BOUNDS_PADDING = ${FIT_BOUNDS_PADDING};`);
    expect(SURFACE_SOURCE).toContain(`const FIT_BOUNDS_MAX_ZOOM = ${FIT_BOUNDS_MAX_ZOOM};`);
    expect(SURFACE_SOURCE).toContain(`const FLOATING_TOP_CHROME_PX = ${FLOATING_TOP_CHROME_PX};`);
    expect(SURFACE_SOURCE).toContain(
      `const FLOATING_TOP_CHROME_MOBILE_PX = ${FLOATING_TOP_CHROME_MOBILE_PX};`,
    );
  });

  /**
   * `SHEET_HALF_FRACTION` is mirrored too, and unlike the four above it is *exported* — from
   * `place-sheet.tsx`, whose own header says it is exported because the camera needs it. It still
   * cannot be imported here: that module transitively pulls in `server-only`, so the import fails
   * at load. The copy is checked the same way until the constant has an importable home.
   */
  it('holds the sheet stop the sheet actually moves to', () => {
    const SHEET_SOURCE = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
    expect(SHEET_SOURCE).toContain(
      `export const SHEET_HALF_FRACTION = ${SHEET_HALF_FRACTION} as const;`,
    );
  });

  /**
   * **The mirror checked against a real MapLibre answer**, not only against literals.
   *
   * `map-surface.mapcn.tsx`'s camera-mover-5 comment records a measurement taken from the running
   * map: *"both of its failures were measured on a 390×844 transform with `/map`'s real padding. A
   * globe-spanning country fits at zoom −0.331"*. A box 260° wide — which is what a country with
   * overseas territories spans — fits at exactly that zoom under the arithmetic in
   * `camera-model.ts`. Reproducing a number that came out of MapLibre rather than out of this
   * file is the only evidence available here that the two agree.
   */
  it('reproduces a zoom that was measured on the running map', () => {
    const wide = fitCamera({ north: 10, south: -10, east: 130, west: -130 }, PHONE);
    expect(wide?.zoom).toBeCloseTo(-0.331, 3);
  });

  /** The model assumes `/map` pays the default top chrome and the *peek* sheet, because the page
   *  passes neither override. If it starts passing one, the model has to learn about it. */
  it('confirms /map declares no resting-sheet or top-chrome override', () => {
    const PAGE_SOURCE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
    expect(PAGE_SOURCE).not.toContain('restingSheetFraction=');
    expect(PAGE_SOURCE).not.toContain('floatingTopChromePx=');
  });
});

/* -------------------------------------------------- Fixture self-assertions */

describe('the fixtures are the shapes they claim to be', () => {
  it('splits the five Israeli areas rather than merging them', () => {
    expect(clustersOf(FIVE_ISRAELI_AREAS)).toHaveLength(5);
  });

  it('keeps one city as one area across five spellings and a null locality', () => {
    expect(clustersOf(ONE_CITY)).toHaveLength(1);
  });

  it('holds one place with no extent to fit', () => {
    const bounds = initialBoundsFor(SINGLE) as GeoBounds;
    expect(bounds.north).toBe(bounds.south);
    expect(bounds.east).toBe(bounds.west);
  });

  it('separates the outlier from the tight cluster', () => {
    expect(clustersOf(TEL_AVIV_PLUS_TOKYO)).toHaveLength(2);
  });

  it('separates two well-separated cities', () => {
    expect(clustersOf(TWO_CITIES)).toHaveLength(2);
  });

  /** Both breakpoints leave a fittable band; a `null` camera anywhere below would mean the test
   *  was measuring an impossible fit rather than a bad one. */
  it('leaves a fittable band at both breakpoints', () => {
    for (const viewport of [PHONE, DESKTOP]) {
      expect(fitCamera(unionBounds(ONE_CITY.places), viewport)).not.toBeNull();
    }
  });
});
