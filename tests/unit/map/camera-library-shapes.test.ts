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
 * **Rules 1 and 2 were inverted on 2026-08-30, on the owner's ruling, and that is deliberate.** The
 * fix for defect 1 above — anchor on one cluster, land in the pin band — was itself used in
 * production and rejected: anchoring on the cluster holding the most recent save meant that saving
 * a place and signing back in opened the map on that place. *"I added this Jerusalem Hotel, and
 * after that, when I signed in again, it opened on the Jerusalem Hotel, but I'm not interested in
 * that... So on mobile and on desktop."* The first load is now the **overview**: *"open the map
 * when you see the countries, not last added place."* §9.3's pin-on-screen criterion no longer
 * applies to the first load, and Rules 1 and 2 below assert the replacement rather than a
 * weakened version of what they used to say.
 *
 * The assertions below are the product's **rules**, never pixel values, so they stay true when the
 * padding constants or the band edges are tuned:
 *
 *  - the first load frames the **whole library** and comes to rest **out of the pin band**, so the
 *    home view is geography — flag discs where the library spans countries, area pills where it
 *    does not — and never a place;
 *  - what was saved **last cannot move it**, which is the defect stated as a property;
 *  - the movers that *are* about a place — selecting one, a finished import, near-me — still reach
 *    the pin band, because they never went through the home framing's range;
 *  - a selected place lands inside the **band above the sheet**, not merely inside the viewport;
 *  - a zero-place library gets a camera of its own rather than MapLibre's constructor default.
 *
 * The derivation below is the page's own — `clusterByProximity` → `buildAreas`' boxes →
 * `unionBounds` → the surface's fit under `HOME_LANDING_ZOOM` — with the real functions wherever
 * one is importable. `camera-model.ts` explains which two links are mirrored and why they cannot
 * be imported.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EMPTY_LIBRARY_BOUNDS } from '@/ui/place/viewport';
import {
  clusterByProximity,
  pickAnchorCluster,
  type GeoBounds,
  type GeoCluster,
  type GeoPoint,
} from '@/domain/places/clusters';
import { meanCentroid, unionBounds as unionGeoBounds } from '@/domain/places/country-bucket';
import { buildAreas } from '@/ui/place/active-area';
import { summariseByCountry } from '@/ui/place/library-summary';
import {
  SUMMARY_PILL_HEIGHT,
  summaryPillFitAllowance,
  type SummaryPillLabel,
} from '@/components/map/country-flag-image';
import { NEAR_ME_ZOOM } from '@/components/map/near-me';
import {
  bandForZoom,
  COUNTRY_LANDING_ZOOM,
  HOME_LANDING_ZOOM,
  PIN_BAND_MIN,
} from '@/components/map/zoom-bands';

import {
  BREAKPOINTS,
  DESKTOP,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  FLOATING_TOP_CHROME_MOBILE_PX,
  FLOATING_TOP_CHROME_PX,
  CONTROL_COLUMN_PX,
  PHONE,
  framePadding,
  SHEET_HALF_FRACTION,
  fitCamera,
  inBand,
  unionBounds,
  visibleBand,
  type Viewport,
} from './camera-model';
import {
  ANTIMERIDIAN,
  EMPTY,
  FIVE_ISRAELI_AREAS,
  LABEL_SHAPES,
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
 * `const initialBounds = areas.length > 0 ? unionBounds(areas.map(a => a.bounds)) :
 * EMPTY_LIBRARY_BOUNDS` — what the page hands the surface. The union is taken over the *areas'*
 * boxes with the production `unionBounds`, not over raw points, so this is the page's own geometry
 * rather than a second definition of it.
 *
 * The fallback is Rule 4: an empty library has no area to union, and passing `undefined` fell
 * through to MapLibre's constructor default (the globe at zoom 0).
 */
function initialBoundsFor(shape: LibraryShape): GeoBounds | undefined {
  const clusters = clustersOf(shape);
  if (clusters.length === 0) return EMPTY_LIBRARY_BOUNDS;
  return unionGeoBounds(clusters.map((cluster) => cluster.bounds));
}

/** The home framing as the surface performs it: that box, under `HOME_LANDING_ZOOM`'s ceiling.
 *  `frameBounds`' `Math.max(zoom, minZoom)` is a no-op at `min === 0`, so a `fitCamera` with the
 *  same ceiling is the whole of it. */
function homeCamera(shape: LibraryShape, viewport: Viewport) {
  return fitCamera(initialBoundsFor(shape) as GeoBounds, viewport, {
    maxZoom: HOME_LANDING_ZOOM.max,
  });
}

/* ------------------------------------------------------------------ Rule 1 */

describe('the first load opens on the overview, not on a place', () => {
  for (const shape of POPULATED_SHAPES) {
    for (const viewport of BREAKPOINTS) {
      /**
       * **The inversion of what this assertion said until 2026-08-30.** It required
       * `z >= PIN_BAND_MIN`; it now requires the opposite, because the owner used the pin-band home
       * view in production and rejected it. At or below `HOME_LANDING_ZOOM.max` the pin layer does
       * not draw (`place-marker-layer.tsx`), so what is on screen is the summary geography — flag
       * discs below `COUNTRY_BAND_MAX`, area pills above it — which is *"open the map when you see
       * the countries"*.
       *
       * Stated against `bandForZoom` rather than against 8.5, so tuning the bands moves it.
       */
      it(`${shape.name} settles out of the pin band at ${viewport.label}`, () => {
        const bounds = initialBoundsFor(shape);
        expect(bounds).toBeDefined();
        const camera = homeCamera(shape, viewport);
        expect(camera).not.toBeNull();
        expect(camera?.zoom).toBeLessThanOrEqual(HOME_LANDING_ZOOM.max);
        expect(bandForZoom(camera?.zoom as number)).not.toBe('pin');
      });

      /**
       * The replacement for *"at least one place on the visible map"*, and it is strictly stronger:
       * the home view frames the **whole** library, so every saved place is on screen, not one.
       * A camera that dropped back to a single cluster would fail this on every multi-area shape.
       */
      it(`${shape.name} settles with every place on the visible map at ${viewport.label}`, () => {
        const camera = homeCamera(shape, viewport);
        const band = visibleBand(viewport);
        const offScreen = shape.places.filter(
          (place) => camera === null || !inBand(camera.screenOf(place), band),
        );
        expect(offScreen).toHaveLength(0);
      });
    }
  }
});

/* ------------------------------------------------------------------ Rule 2 */

describe('what you saved last cannot decide where the map opens', () => {
  /** The reported defect as a property. `places` arrives `created_at desc`, so the most recent save
   *  is `places[0]`; saving "Jerusalem Hotel" is exactly a reordering of this array. The home box
   *  is a union, so it is order-independent — and that is the whole fix, stated without reference
   *  to any particular city. */
  it('frames the same box however the library is ordered', () => {
    for (const shape of POPULATED_SHAPES) {
      const reordered: LibraryShape = { ...shape, places: [...shape.places].reverse() };
      expect(initialBoundsFor(reordered)).toEqual(initialBoundsFor(shape));
    }
  });

  /**
   * The same property one level up, at the thing the user sees: the anchor cluster still *moves*
   * with the most recent save — `preferredAreaId` needs it to, as the list's fallback after a
   * deletion — and the camera no longer follows it anywhere.
   */
  it('still picks a different anchor when the newest save is elsewhere, and ignores it', () => {
    const reordered: LibraryShape = {
      ...TEL_AVIV_PLUS_TOKYO,
      places: [...TEL_AVIV_PLUS_TOKYO.places].reverse(),
    };
    expect(anchorClusterOf(reordered)?.count).not.toBe(anchorClusterOf(TEL_AVIV_PLUS_TOKYO)?.count);
    expect(homeCamera(reordered, PHONE)?.zoom).toBe(homeCamera(TEL_AVIV_PLUS_TOKYO, PHONE)?.zoom);
  });

  /**
   * **The outlier is now on screen, and that is the point.** This assertion used to require the
   * opposite — Tokyo off screen, because the camera belonged to one cluster. A library that spans
   * continents is exactly the library whose overview should be a world view; leaving half of it
   * outside the frame is what made the home view feel like it had picked a favourite.
   */
  it('keeps a distant outlier on screen rather than anchoring away from it', () => {
    const camera = homeCamera(TEL_AVIV_PLUS_TOKYO, PHONE);
    const band = visibleBand(PHONE);
    const tokyo = TEL_AVIV_PLUS_TOKYO.places.find((place) => place.countryCode === 'JP');
    expect(tokyo).toBeDefined();
    expect(camera).not.toBeNull();
    expect(inBand((camera as NonNullable<typeof camera>).screenOf(tokyo as FixturePlace), band)).toBe(
      true,
    );
  });

  /**
   * Stated as *what is on screen* rather than as a zoom, for the reason the anchored version of
   * this test gave: it stays true whatever zoom a particular library happens to fit at. All five of
   * the owner's areas are visible at once, where the anchored camera showed exactly one.
   */
  it("shows all five of the owner's areas, where the anchored camera showed one", () => {
    const home = homeCamera(FIVE_ISRAELI_AREAS, PHONE);
    const anchor = fitCamera(
      anchorClusterOf(FIVE_ISRAELI_AREAS)?.bounds as GeoBounds,
      PHONE,
    );
    const band = visibleBand(PHONE);
    // Counted in *clusters*, not locality strings: `Tel Aviv` and `תל אביב-יפו` are two spellings
    // of one area, and the whole point of clustering on coordinates is that they are one thing.
    const areas = clustersOf(FIVE_ISRAELI_AREAS);
    const visibleAreas = (camera: ReturnType<typeof fitCamera>) =>
      areas.filter((area) =>
        area.members.some((place) => camera !== null && inBand(camera.screenOf(place), band)),
      ).length;

    expect(visibleAreas(home)).toBe(5);
    expect(visibleAreas(anchor)).toBe(1);
  });

  /**
   * A library that spans continents lands in the **country** band, which is the literal reading of
   * the owner's words — flag discs, no pins, no area pills. The one-country shapes cannot get
   * there (their own extent is smaller than a country band fit), so they land on area pills
   * instead; that degradation is the ruling, not a gap.
   */
  it('reaches the country band on a library that spans continents', () => {
    for (const shape of [TEL_AVIV_PLUS_TOKYO, TWO_CITIES]) {
      expect(bandForZoom(homeCamera(shape, PHONE)?.zoom as number)).toBe('country');
    }
    expect(bandForZoom(homeCamera(FIVE_ISRAELI_AREAS, PHONE)?.zoom as number)).toBe('area');
  });
});

/* ----------------------------------------------------------------- Rule 2b */

describe('the movers that are about a place still reach the pin band', () => {
  /**
   * **The regression risk in the 2026-08-30 home-view change, covered directly.** The home framing
   * and the place framings share `frameBounds`/`fitTo` inside the surface but not their zoom
   * ranges: the home view now rests under `HOME_LANDING_ZOOM.max`, while movers 2, 3, 7 and 8 keep
   * `FIT_BOUNDS_MAX_ZOOM` or their own fixed zoom. If the new ceiling ever leaked into those, a
   * user tapping a place would be shown area pills — so each is asserted to still reach the band
   * the pin layer draws in.
   */
  it('a finished import frames the places it saved inside the pin band', () => {
    for (const shape of [ONE_CITY, SINGLE]) {
      for (const viewport of BREAKPOINTS) {
        const camera = fitCamera(unionBounds(shape.places), viewport);
        expect(camera?.zoom).toBeGreaterThanOrEqual(PIN_BAND_MIN);
      }
    }
  });

  /** Mover 8 does not fit a box at all — it rests at a fixed zoom, declared against `PIN_BAND_MIN`
   *  so that tuning the bands cannot leave near-me looking at bubbles. */
  it('near-me rests in the pin band', () => {
    expect(NEAR_ME_ZOOM).toBeGreaterThanOrEqual(PIN_BAND_MIN);
    expect(bandForZoom(NEAR_ME_ZOOM)).toBe('pin');
  });

  /** Mover 5 is the deliberate exception and stays one: a country tap must land on area markers
   *  (§2.4), which is the same band the home view of a one-country library lands in. */
  it('a country tap still lands on area markers, not pins', () => {
    expect(COUNTRY_LANDING_ZOOM.max).toBeLessThan(PIN_BAND_MIN);
  });

  /**
   * The seam the two ranges meet at, checked against the surface's source because no test can
   * import it: the home framing reads `HOME_LANDING_ZOOM` and the place framing still reads
   * `FIT_BOUNDS_MAX_ZOOM`. This is what makes the three assertions above guards rather than
   * restatements of `camera-model.ts`.
   */
  it('keeps the home range out of the place framing', () => {
    const SOURCE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
    expect(SOURCE).toContain('minZoom: HOME_LANDING_ZOOM.min');
    expect(SOURCE).toContain('maxZoom: HOME_LANDING_ZOOM.max');
    expect(SOURCE).toContain('maxZoom: FIT_BOUNDS_MAX_ZOOM');
    expect(SOURCE).not.toContain('HOME_LANDING_MIN_ZOOM');
  });
});

/* ----------------------------------------------------------------- Rule 2c */

/**
 * **Every summary marker, whole, inside the visible map** — the 2026-08-30 clipping report.
 *
 * The reproduction was one library (UK 18 + Israel 14) and one screenshot, and a fix tuned until
 * that screenshot looked right would be a fix for that screenshot. So the marker geometry here is
 * derived from the *labels each synthetic library actually has*, through the same
 * `summaryPillFitAllowance` the surface calls, and asserted for every marker of every shape at both
 * breakpoints. Nothing below knows what a country is called.
 *
 * The four variables the allowance has to be a function of, one shape each:
 * a long country name, a single country, full-width CJK labels, and twenty countries at once.
 */

/** The page's own summary derivation, with the page's own functions. */
function summariesOf(shape: LibraryShape) {
  const areas = buildAreas(clustersOf(shape), {
    toId: (place: FixturePlace) => place.id,
    toPoint: (place: FixturePlace) => place,
    toLocality: (place: FixturePlace) => place.locality,
  });
  const countries = summariseByCountry(
    areas,
    (place: FixturePlace) => place.countryCode,
    (place: FixturePlace) => place,
  );
  return { areas, countries };
}

/**
 * Every marker the two bands draw, as `{ anchor, label }`. The label text mirrors
 * `labelAndCount()` in `summary-style.ts` — label, two spaces, count — because that is the string
 * the symbol layer shapes, and it is what the surface passes too.
 */
function markersOf(shape: LibraryShape): readonly {
  readonly anchor: GeoPoint;
  readonly label: SummaryPillLabel;
}[] {
  const { areas, countries } = summariesOf(shape);
  return [
    ...countries.map((country) => ({
      anchor: country.centroid,
      label: {
        text: `${country.label}  ${country.count}`,
        capped: country.countryCode !== null,
      },
    })),
    ...areas.map((area) => ({
      anchor: meanCentroid(area.points) ?? { lat: 0, lng: 0 },
      label: { text: `${area.label ?? ''}  ${area.count}`, capped: false },
    })),
  ];
}

/** The home framing, allowance and all — the whole of what the surface does. */
function homeCameraWithMarkers(shape: LibraryShape, viewport: Viewport) {
  const allowance = summaryPillFitAllowance(markersOf(shape).map((marker) => marker.label));
  return fitCamera(initialBoundsFor(shape) as GeoBounds, viewport, {
    maxZoom: HOME_LANDING_ZOOM.max,
    markerAllowance: allowance,
  });
}

describe('every summary marker lands whole inside the visible map', () => {
  const SHAPES = [...POPULATED_SHAPES, ...LABEL_SHAPES];

  for (const shape of SHAPES) {
    for (const viewport of BREAKPOINTS) {
      it(`${shape.name} keeps every pill inside the frame at ${viewport.label}`, () => {
        const camera = homeCameraWithMarkers(shape, viewport);
        expect(camera).not.toBeNull();
        const band = visibleBand(viewport);

        for (const marker of markersOf(shape)) {
          // Each marker is checked against **its own** width, not against the widest in the
          // library: the allowance pays for the widest, so a narrower pill has room to spare, and
          // asserting per marker is what catches an allowance that happens to be big enough for
          // the shape it was written against.
          const half = summaryPillFitAllowance([marker.label]);
          const point = (camera as NonNullable<typeof camera>).screenOf(marker.anchor);
          expect(point.x - half.x).toBeGreaterThanOrEqual(band.minX);
          // Clear of the zoom controls, not merely of the viewport edge — `Israel 14` was under
          // them in the report.
          expect(point.x + half.x).toBeLessThanOrEqual(band.maxX - CONTROL_COLUMN_PX + 0.001);
          expect(point.y - half.y).toBeGreaterThanOrEqual(band.minY);
          expect(point.y + half.y).toBeLessThanOrEqual(band.maxY);
        }
      });
    }
  }

  /** The allowance is a function of the widest **label**, and of nothing else. Twenty countries
   *  cost exactly what their widest name costs; a fit that grew per marker would be impossible on
   *  a phone long before twenty. */
  it('does not grow with the number of markers', () => {
    const one = summaryPillFitAllowance([{ text: 'Israel  14', capped: true }]);
    const many = summaryPillFitAllowance(
      Array.from({ length: 40 }, () => ({ text: 'Israel  14', capped: true })),
    );
    expect(many.x).toBe(one.x);
  });

  /** It *is* a function of the label, which is the property that makes it dynamic rather than
   *  tuned. Longer name, wider pill; full-width script, wider still per character. */
  it('grows with the label, and measures scripts rather than counting characters', () => {
    const short = summaryPillFitAllowance([{ text: 'Israel  14', capped: true }]).x;
    const long = summaryPillFitAllowance([
      { text: 'Bosnia and Herzegovina  12', capped: true },
    ]).x;
    expect(long).toBeGreaterThan(short);

    const latin = summaryPillFitAllowance([{ text: 'aaaa', capped: false }]).x;
    const cjk = summaryPillFitAllowance([{ text: '東京東京', capped: false }]).x;
    expect(cjk).toBeGreaterThan(latin);

    const hebrew = summaryPillFitAllowance([{ text: 'תל אביב-יפו  3', capped: false }]).x;
    expect(hebrew).toBeGreaterThan(0);
  });

  /** A capless pill is narrower than a capped one carrying the same text — the flag cap is real
   *  geometry, and the area band does not pay for it. */
  it('charges for the flag cap only where one is drawn', () => {
    const capped = summaryPillFitAllowance([{ text: 'Israel  14', capped: true }]).x;
    const capless = summaryPillFitAllowance([{ text: 'Israel  14', capped: false }]).x;
    expect(capped).toBeGreaterThan(capless);
  });

  /** Nothing to draw, nothing to pay: `/collections/[id]` passes no summaries and must not be
   *  handed padding for markers it does not have. */
  it('is zero for a surface with no summary markers', () => {
    expect(summaryPillFitAllowance([])).toEqual({ x: 0, y: 0 });
    expect(markersOf(EMPTY)).toHaveLength(0);
  });

  /** `y` is exact geometry rather than an estimate: half the pill bitmap, which is the same number
   *  the tap target is derived from. */
  it('reserves exactly half a pill vertically', () => {
    expect(summaryPillFitAllowance([{ text: 'x', capped: false }]).y).toBe(SUMMARY_PILL_HEIGHT / 2);
  });

  /**
   * **The degradation, asserted rather than hidden.** A library either side of the antimeridian
   * arrives as a box wider than 180° — `unionBounds` always emits `west <= east` — and
   * `frameBounds` answers that by easing to the box's centroid at `minZoom` without consulting the
   * padding at all. The allowance therefore does not apply on that path, and this test says so:
   * the case is recognised, and it is the *pre-existing* documented degradation, not something the
   * padding change introduced. No camera frames Auckland and Honolulu with both pills whole.
   */
  it('leaves the antimeridian degradation exactly as it found it', () => {
    const bounds = initialBoundsFor(ANTIMERIDIAN) as GeoBounds;
    expect(bounds.east - bounds.west).toBeGreaterThan(180);
    const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
    expect(SURFACE).toContain('if (bounds.east - bounds.west > 180) {');
  });

  /**
   * **An allowance that does not fit must shrink, never strand the camera.** `fitBounds` answers
   * padding wider than the transform by doing nothing at all, silently — the failure `fitTo`'s
   * docblock records. `clampFitPadding` is what stops that, and adding the allowance *before* the
   * clamp rather than after is what keeps it inside that guarantee.
   */
  it('degrades to a possible fit on a viewport too small for the allowance', () => {
    const TINY: Viewport = { label: '320×480', width: 320, height: 480 };
    const huge = { x: 400, y: 400 };
    const padding = framePadding(TINY, undefined, huge);
    expect(padding.left + padding.right).toBeLessThan(TINY.width);
    expect(padding.top + padding.bottom).toBeLessThan(TINY.height);
    expect(fitCamera(initialBoundsFor(TWO_CITIES) as GeoBounds, TINY, {
      maxZoom: HOME_LANDING_ZOOM.max,
      markerAllowance: huge,
    })).not.toBeNull();
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
      // And the pin is *drawn*: mover 3 keeps `FIT_BOUNDS_MAX_ZOOM`, so the 2026-08-30 home-view
      // ceiling cannot reach it. Inside the band but below `PIN_BAND_MIN` would be an empty frame.
      expect(camera?.zoom).toBeGreaterThanOrEqual(PIN_BAND_MIN);
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
  /** The anchor is no longer a camera — it is `preferredAreaId`, the list's fallback after a
   *  deletion — but "there is nothing to fall back to" is still the honest answer for an empty
   *  library, and the camera's own fallback below is what covers §9.3. */
  it('has no cluster to anchor on, which is honest', () => {
    expect(anchorClusterOf(EMPTY)).toBeNull();
  });

  /**
   * §9.3: *"Zero places shows no bare world map: a plausible regional view."* The page used to hand
   * the surface `anchorCluster?.bounds`, the surface's `boundsFor` then returned `null`, and
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
