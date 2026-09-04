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
 * **Rules 1 and 2 were inverted on 2026-08-30, on the owner's ruling, and Rule 1 was inverted again
 * on 2026-08-31.** Both are deliberate and the second is not a return to the first.
 *
 * The fix for defect 1 above — anchor on one cluster, land in the pin band — was used in production
 * and rejected: anchoring on the cluster holding the most recent save meant that saving a place and
 * signing back in opened the map on that place. *"I added this Jerusalem Hotel, and after that, when
 * I signed in again, it opened on the Jerusalem Hotel, but I'm not interested in that... So on
 * mobile and on desktop."* Two things were changed in answer: the box widened from the anchor
 * cluster to the whole library, and the resting zoom was clamped to a ceiling inside the area band.
 *
 * **Only the box answered the complaint.** A union is order-independent, which Rule 2 asserts
 * directly and which is the whole of the fix. The ceiling was separate, and it was `W2-1`'s defect
 * 0a: pins draw at `z >= PIN_BAND_MIN` and the ceiling sat below it, so **the home screen drew none
 * of the user's places, for every library, at every size.** The ceiling is gone as of 2026-08-31;
 * no floor replaces it, because a floor is the one change that would re-break the owner's
 * complaint (it discards the box, so Israel-plus-Tokyo lands zoomed in on open sea).
 *
 * The assertions below are the product's **rules**, never pixel values, so they stay true when the
 * padding constants or the band edges are tuned:
 *
 *  - the first load frames the **whole library** and comes to rest wherever that box honestly fits,
 *    never inside the guard window around the band boundary — so a one-metro library opens on its
 *    own pins and a three-continent library opens on flag discs, and both are correct;
 *  - what was saved **last cannot move it**, which is the defect stated as a property;
 *  - the movers that *are* about a place — selecting one, a finished import, near-me — reach the
 *    pin band through their own ranges, which the home rule may not leak into;
 *  - a selected place lands inside the **band above the sheet**, not merely inside the viewport;
 *  - a summary pill is whole in frame wherever a summary pill is **drawn**, and the camera does not
 *    pay for one where none is;
 *  - a zero-place library gets a camera of its own rather than MapLibre's constructor default.
 *
 * The derivation below is the page's own — `clusterByProximity` → `buildAreas`' boxes →
 * `unionBounds` → the surface's two-pass fit and `settleZoom` — with the real functions wherever
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
import { LABEL_FIT_ALLOWANCE } from '@/components/map/marker-style';
import { NEAR_ME_ZOOM } from '@/components/map/near-me';
import {
  BAND_EDGE_GUARD,
  bandForZoom,
  COUNTRY_LANDING_ZOOM,
  HOME_LANDING_ZOOM,
  PIN_BAND_MIN,
  settleZoom,
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
  FOUR_CITIES,
  LABEL_SHAPES,
  ONE_CITY,
  POPULATED_SHAPES,
  SINGLE,
  TEL_AVIV_PLUS_TOKYO,
  TWENTY_COUNTRIES,
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

/**
 * **The home framing as the surface performs it, all of it** — `map-surface.mapcn.tsx`'s
 * `fitToBounds`, mirrored.
 *
 * Fit the box bare, `settleZoom` the answer clear of the band boundary, then pay for whichever mark
 * is actually drawn where it landed — and only if the library can afford it.
 *
 *  - **Out of the pin band**: re-fit paying the ~200 px summary-pill allowance, and settle again.
 *    Paying it unconditionally is what pushed the fit back *out* of the pin band in the first place:
 *    the owner's five-area library fits at z8.78 bare and z7.68 with the pill allowance at 390×844.
 *  - **In the pin band**: no pill is drawn, but a *name* is (`W2-3`), and a name is wider than the
 *    pin the fit frames. Re-fit paying `LABEL_FIT_ALLOWANCE`, and keep that fit only if it is still
 *    in the pin band. The band wins; the label is what gives way.
 *
 * `homeCameraWithMarkers` used to be a second, fuller derivation beside this one. It is gone: there
 * was never a case where the surface framed home *without* the allowance rule, so two functions
 * meant Rule 1 and Rule 2c were asserting against two different cameras.
 */
function homeFraming(
  shape: LibraryShape,
  viewport: Viewport,
): {
  readonly camera: ReturnType<typeof fitCamera>;
  readonly zoom: number;
  readonly allowance: { readonly x: number; readonly y: number };
  /**
   * The honest fit before `settleZoom` touched it. Below `HOME_LANDING_ZOOM.min` it means *the box
   * does not fit on this viewport at all* — `Math.max(zoom, minZoom)` then clamps the camera up to
   * 0 and the outermost markers are outside the frame. Pre-existing and unchanged by `W2-1`:
   * `frameBounds` has always clamped that way. See the degradation test below.
   */
  readonly fitZoom: number;
} {
  const bounds = initialBoundsFor(shape) as GeoBounds;
  const none = { x: 0, y: 0 };
  const bare = fitCamera(bounds, viewport, { maxZoom: HOME_LANDING_ZOOM.max });
  const bareZoom = settleZoom(bare?.zoom ?? HOME_LANDING_ZOOM.min);
  if (bandForZoom(bareZoom) === 'pin') {
    // The pins are named at rest, and a name is wider than its pin, so the fit pays for one —
    // but only where paying does not push the library back out of the band. See `fitToBounds`.
    const padded = fitCamera(bounds, viewport, {
      maxZoom: HOME_LANDING_ZOOM.max,
      markerAllowance: LABEL_FIT_ALLOWANCE,
    });
    const paddedZoom = settleZoom(padded?.zoom ?? HOME_LANDING_ZOOM.min);
    const affordable = bandForZoom(paddedZoom) === 'pin';
    return {
      camera: fitCamera(bounds, viewport, {
        maxZoom: HOME_LANDING_ZOOM.max,
        exactZoom: affordable ? paddedZoom : bareZoom,
        ...(affordable ? { markerAllowance: LABEL_FIT_ALLOWANCE } : {}),
      }),
      zoom: affordable ? paddedZoom : bareZoom,
      allowance: affordable ? LABEL_FIT_ALLOWANCE : none,
      fitZoom: bare?.zoom ?? HOME_LANDING_ZOOM.min,
    };
  }
  const allowance = summaryPillFitAllowance(markersOf(shape).map((marker) => marker.label));
  const padded = fitCamera(bounds, viewport, {
    maxZoom: HOME_LANDING_ZOOM.max,
    markerAllowance: allowance,
  });
  const zoom = settleZoom(padded?.zoom ?? HOME_LANDING_ZOOM.min);
  return {
    camera: fitCamera(bounds, viewport, {
      maxZoom: HOME_LANDING_ZOOM.max,
      markerAllowance: allowance,
      exactZoom: zoom,
    }),
    zoom,
    allowance,
    fitZoom: padded?.zoom ?? HOME_LANDING_ZOOM.min,
  };
}

/** The settled camera alone, for the assertions that only care where things land on screen. */
function homeCamera(shape: LibraryShape, viewport: Viewport) {
  return homeFraming(shape, viewport).camera;
}

/* ------------------------------------------------------------------ Rule 1 */

describe('the first load opens on the overview, not on a place', () => {
  for (const shape of POPULATED_SHAPES) {
    for (const viewport of BREAKPOINTS) {
      /**
       * **This assertion has now been inverted twice, and the second inversion is not a return to
       * the first.**
       *
       * Until 2026-08-30 it required `z >= PIN_BAND_MIN` — a *floor*, guaranteeing a pin on the
       * home view. The owner used that in production and rejected it, so it was changed to require
       * the opposite: a *ceiling*, at or below which the pin layer does not draw at all. That
       * second version is what `current-state.md` defect 0a is: the home screen of a map product
       * drew none of the user's places, for every library, at every size.
       *
       * What it asserts now is **neither**. No floor and no ceiling: the library's own box decides
       * the band, and the only rule left is that the camera may not come to rest *inside the
       * boundary's guard window*, where MapLibre's rounding would decide which of two layers draws.
       * A one-city library therefore rests on pins and a three-continent library on flag discs, and
       * both are correct — which is why "which band" is asserted per shape below rather than here.
       *
       * Stated against `PIN_BAND_MIN` and `BAND_EDGE_GUARD` rather than against 8.5 and 0.15, so
       * tuning the bands moves it.
       */
      it(`${shape.name} settles clear of the band edge at ${viewport.label}`, () => {
        const bounds = initialBoundsFor(shape);
        expect(bounds).toBeDefined();
        const { camera, zoom } = homeFraming(shape, viewport);
        expect(camera).not.toBeNull();
        expect(camera?.zoom).toBe(zoom);
        expect(zoom).toBeLessThanOrEqual(HOME_LANDING_ZOOM.max);
        expect(zoom).toBeGreaterThanOrEqual(HOME_LANDING_ZOOM.min);
        const inside =
          zoom > PIN_BAND_MIN - BAND_EDGE_GUARD && zoom < PIN_BAND_MIN + BAND_EDGE_GUARD;
        expect(inside).toBe(false);
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
    expect(
      inBand((camera as NonNullable<typeof camera>).screenOf(tokyo as FixturePlace), band),
    ).toBe(true);
  });

  /**
   * Stated as *what is on screen* rather than as a zoom, for the reason the anchored version of
   * this test gave: it stays true whatever zoom a particular library happens to fit at. All five of
   * the owner's areas are visible at once, where the anchored camera showed exactly one.
   */
  it("shows all five of the owner's areas, where the anchored camera showed one", () => {
    const home = homeCamera(FIVE_ISRAELI_AREAS, PHONE);
    const anchor = fitCamera(anchorClusterOf(FIVE_ISRAELI_AREAS)?.bounds as GeoBounds, PHONE);
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
   * the owner's words — flag discs, no pins, no area pills. That half is unchanged by `W2-1` and
   * is what makes "remove the ceiling" different from "restore the floor": a floor would have
   * forced this library to z8.65 over the centroid of Israel-plus-Tokyo, i.e. open sea.
   *
   * **The third assertion is the defect, and it has flipped.** The owner's own five-area library
   * used to be asserted into the area band — four grey capsules and none of their seven places —
   * and the comment here called that *"the ruling, not a gap"*. It fits at z8.78 on a phone, which
   * is the pin band, and that is where it now rests: seven pins across five cities, on one screen.
   */
  it('reaches the country band on a library that spans continents', () => {
    for (const shape of [TEL_AVIV_PLUS_TOKYO, TWO_CITIES]) {
      expect(bandForZoom(homeCamera(shape, PHONE)?.zoom as number)).toBe('country');
    }
  });

  /**
   * **Defect 0a, as the property that fixes it.** `growth-plan.md`'s K14, restated by
   * `ux-overnight-specs.md` `OQ-5` because the literal version is unachievable — no camera shows
   * three continents *and* three pins — as: *home rests in the pin band whenever the library's
   * bounding box allows it.*
   *
   * A library inside one metro area is exactly the case whose box allows it, at both breakpoints,
   * and the shapes below are the two the product is actually used with. Nothing here is a fixed
   * zoom: the assertion is the band, so tuning the padding or the bands cannot make it pass by
   * accident.
   */
  it('rests on the pins whenever the library is small enough to allow it', () => {
    for (const shape of [ONE_CITY, SINGLE, FIVE_ISRAELI_AREAS]) {
      for (const viewport of BREAKPOINTS) {
        const { zoom } = homeFraming(shape, viewport);
        expect(bandForZoom(zoom)).toBe('pin');
      }
    }
  });

  /**
   * **The measurement that made the two-pass allowance necessary, pinned so it cannot regress
   * silently.** Removing the zoom ceiling is not on its own enough for the library the defect was
   * reported against: paying the ~200 px summary-pill allowance widens the padding, which lowers
   * the fitted zoom, which pushes the camera back down into the band that draws the pills it was
   * paying for. At 390×844 the owner's library fits at z8.78 bare and z7.68 with the allowance —
   * pins on one side of a pill's own width, four grey capsules on the other.
   */
  /**
   * **The label allowance, and the rule that it is the label which gives way.** A pin's name is
   * drawn at rest since `W2-3` and is wider than the pin the fit frames, so the camera pays for it
   * — but paying widens the padding, which lowers the zoom, which on a phone is enough to push a
   * library out of the pin band and back onto the capsules `W2-1` exists to remove.
   *
   * Both branches, on real shapes: a one-city library can afford it several times over, and the
   * owner's five-area library at z8.78 cannot. Neither is asserted as a number — what is pinned is
   * that the band survives either way, which is the property that makes the trade safe.
   */
  it('pays for a pin\'s name only where the band survives it', () => {
    const oneCity = homeFraming(ONE_CITY, PHONE);
    expect(oneCity.allowance).toEqual(LABEL_FIT_ALLOWANCE);
    expect(bandForZoom(oneCity.zoom)).toBe('pin');

    const owners = homeFraming(FIVE_ISRAELI_AREAS, PHONE);
    expect(owners.allowance).toEqual({ x: 0, y: 0 });
    expect(bandForZoom(owners.zoom)).toBe('pin');
  });

  /** And the allowance is real geometry rather than a tuned number: half a label's width, because
   *  a name is centred on its pin, and the offset plus its lines below the anchor. */
  it('reserves half a name horizontally and its lines vertically', () => {
    expect(LABEL_FIT_ALLOWANCE.x).toBeGreaterThan(0);
    expect(LABEL_FIT_ALLOWANCE.y).toBeGreaterThan(0);
    // Wider than the control column it has to clear, which is what the photographed defect was.
    expect(LABEL_FIT_ALLOWANCE.x).toBeGreaterThan(CONTROL_COLUMN_PX / 2);
  });

  it('does not pay for a pill it is not going to draw', () => {
    const bounds = initialBoundsFor(FIVE_ISRAELI_AREAS) as GeoBounds;
    const allowance = summaryPillFitAllowance(
      markersOf(FIVE_ISRAELI_AREAS).map((marker) => marker.label),
    );
    const bare = fitCamera(bounds, PHONE, { maxZoom: HOME_LANDING_ZOOM.max });
    const paid = fitCamera(bounds, PHONE, {
      maxZoom: HOME_LANDING_ZOOM.max,
      markerAllowance: allowance,
    });
    expect(bandForZoom(bare?.zoom as number)).toBe('pin');
    expect(bandForZoom(paid?.zoom as number)).toBe('area');
    expect(homeFraming(FIVE_ISRAELI_AREAS, PHONE).allowance).toEqual({ x: 0, y: 0 });
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
    // The home framing asks `cameraForBounds` under `HOME_LANDING_ZOOM.max`, settles the answer,
    // and requests exactly that — the degenerate range near-me already uses. Its old
    // `minZoom: HOME_LANDING_ZOOM.min` / `maxZoom: HOME_LANDING_ZOOM.max` request is gone with the
    // ceiling; what is worth pinning now is that the settle rule is the *only* thing deciding
    // where it comes to rest.
    expect(SOURCE).toContain('maxZoom: HOME_LANDING_ZOOM.max');
    expect(SOURCE).toContain('settleZoom(');
    expect(SOURCE).toContain('minZoom: bareZoom, maxZoom: bareZoom');
    expect(SOURCE).toContain('minZoom: zoom, maxZoom: zoom');
    // And the place framing is still on its own ceiling, which is what stops the home rule leaking
    // into movers 2, 3 and 7.
    expect(SOURCE).toContain('maxZoom: FIT_BOUNDS_MAX_ZOOM');
    expect(SOURCE).not.toContain('HOME_LANDING_MIN_ZOOM');
    // No camera may compare a band edge itself — `settleZoom` and `bandForZoom` are the two places
    // that know where a band starts, and both live in `zoom-bands.ts`. Asserted over the code with
    // the comments stripped, because the docblocks above quote the boundary in prose and the
    // sentence *"pins draw at `z >= PIN_BAND_MIN`"* is exactly the explanation that has to survive.
    const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(CODE).not.toMatch(/[<>]=?\s*PIN_BAND_MIN/);
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

describe('every summary marker lands whole inside the visible map', () => {
  const SHAPES = [...POPULATED_SHAPES, ...LABEL_SHAPES];

  for (const shape of SHAPES) {
    for (const viewport of BREAKPOINTS) {
      it(`${shape.name} keeps every pill inside the frame at ${viewport.label}`, () => {
        const { camera, zoom, fitZoom } = homeFraming(shape, viewport);
        expect(camera).not.toBeNull();
        const band = visibleBand(viewport);

        // **The box does not fit on this viewport at any allowed zoom.** `frameBounds` answers that
        // with `Math.max(zoom, minZoom)` — it clamps up to 0 and the outermost pill goes off the
        // edge, and it has always done so. Recognised here rather than asserted away; the
        // degradation has its own test below.
        if (fitZoom < HOME_LANDING_ZOOM.min) return;

        // **A pill that is not drawn cannot be clipped.** Since `W2-1` the home camera skips the
        // pill allowance entirely when the library fits in the pin band, because no summary layer
        // draws there — `summary-marker-layer.tsx`'s bands end at `PIN_BAND_MIN`. Asserting pill
        // geometry against that camera would be asserting the position of something that is not on
        // screen, and it would pass for the wrong reason. The band is what decides, so the band is
        // what is checked first.
        if (bandForZoom(zoom) === 'pin') {
          // …and the camera has not paid for one either. What it may have paid for is the *label*
          // allowance, which is a different and much smaller number for a mark that is drawn here.
          expect(homeFraming(shape, viewport).allowance).not.toEqual(
            summaryPillFitAllowance(markersOf(shape).map((marker) => marker.label)),
          );
          return;
        }

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
    const long = summaryPillFitAllowance([{ text: 'Bosnia and Herzegovina  12', capped: true }]).x;
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
   * **A second degradation, found while `W2-1` made this model faithful, and pre-existing.**
   *
   * A library spread over four cities — or twenty countries — does not fit inside a 390 px phone at
   * any zoom `HOME_LANDING_ZOOM.min` allows: its honest fit, once the pill allowance is paid, is
   * *below* zoom 0. `frameBounds` has always answered that with `Math.max(zoom, minZoom)`, so the
   * camera rests at 0 and the outermost pills are off the edge. Nothing in `W2-1` changed it; what
   * changed is that `camera-model.ts` now models the clamp (`exactZoom`) instead of projecting the
   * unreachable negative zoom, so the case became visible.
   *
   * Recorded rather than repaired: repairing it means either letting the camera go below zoom 0
   * (MapLibre's own transform floor is `log2(containerHeight / 512)` under `renderWorldCopies:
   * false`, so it cannot) or shrinking the allowance for very wide libraries, which is a change to
   * what a pill *is*. Both are out of this package's scope, and a phone showing twenty countries
   * with the two outermost pills clipped is a better screen than either a stranded camera or a
   * silent lie in a test.
   */
  it('recognises the library that does not fit on a phone at all', () => {
    for (const shape of [FOUR_CITIES, TWENTY_COUNTRIES]) {
      expect(homeFraming(shape, PHONE).fitZoom).toBeLessThan(HOME_LANDING_ZOOM.min);
      // Desktop has room for both, so this is a phone-width fact rather than a library-shape one.
      expect(homeFraming(shape, DESKTOP).fitZoom).toBeGreaterThan(HOME_LANDING_ZOOM.min);
    }
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
    expect(
      fitCamera(initialBoundsFor(TWO_CITIES) as GeoBounds, TINY, {
        maxZoom: HOME_LANDING_ZOOM.max,
        markerAllowance: huge,
      }),
    ).not.toBeNull();
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
   * `SHEET_HALF_FRACTION` used to be checked as source text, because `place-sheet.tsx` exported it
   * and that module cannot be imported here. `NAV2` moved it to `components/shell/sheet-geometry`,
   * which is `server-only`-free on purpose, so `camera-model.ts` now re-exports the real constant
   * and there is nothing left to mirror. What is still worth pinning is that `place-sheet.tsx` has
   * not quietly grown a second declaration of its own.
   */
  it('holds the sheet stop the sheet actually moves to, and holds it once', () => {
    const SHEET_SOURCE = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
    expect(SHEET_SOURCE).toContain('export const SHEET_HALF_FRACTION = HALF_FRACTION;');
    expect(SHEET_SOURCE).not.toMatch(/SHEET_HALF_FRACTION\s*=\s*0\.\d/);
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
