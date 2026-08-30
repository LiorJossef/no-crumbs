/**
 * The basemap's geographic context: the zoom ranges we impose on CARTO's label layers, and the POI
 * names layer Positron does not ship.
 *
 * These are numbers tuned against a real viewport, so what is pinned here is the *reasoning* they
 * have to keep satisfying — a ceiling above the zoom the camera can reach, a floor at or below the
 * zoom it rests at, and no residential street names — rather than the values themselves.
 */

import { describe, expect, it } from 'vitest';

import {
  BASEMAP_LABEL_FONT,
  LABEL_ZOOM_RANGES,
  POI_LABEL_LAYER_ID,
  POI_LABEL_MIN_ZOOM,
  roleFor,
} from '@/components/map/basemap-tint';

/** `FIT_BOUNDS_MAX_ZOOM` in `map-surface.mapcn.tsx`, and a user may zoom past it by hand. */
const CAMERA_MAX_ZOOM = 15;
/** Where the anchor-cluster fit leaves the camera, which is the view being complained about. */
const CAMERA_RESTING_ZOOM = 13;

describe('label zoom ranges', () => {
  it('keeps every label alive above the zoom the camera can reach', () => {
    // The defect these exist for: CARTO retires settlement names at 14-16, so leaning in on a place
    // removed the town, city and neighbourhood names and left street geometry on blank paper.
    for (const [id, [, maxzoom]] of Object.entries(LABEL_ZOOM_RANGES)) {
      expect(maxzoom, `${id} must outlive the camera`).toBeGreaterThan(CAMERA_MAX_ZOOM);
    }
  });

  it('reveals an area name and a road name by the zoom the camera settles at', () => {
    for (const id of ['place_suburbs', 'roadname_major', 'roadname_pri']) {
      const range = LABEL_ZOOM_RANGES[id];
      expect(range, `${id} is missing`).toBeDefined();
      expect(range?.[0]).toBeLessThanOrEqual(CAMERA_RESTING_ZOOM);
    }
  });

  it('keeps residential street names out of the resting view', () => {
    // This used to assert `roadname_minor` was absent entirely, on the reasoning that residential
    // names are "the noise that makes a map read as a generic maps app". `exp/richer-basemap`
    // re-tests that trade against the owner's reference screenshots, which show them densely.
    //
    // What is still pinned is the half that was actually load-bearing: they must not appear in the
    // view the camera comes to rest in, so leaning in reveals them rather than the overview
    // arriving pre-cluttered. If the experiment is reverted, this goes back to `not.toHaveProperty`.
    const range = LABEL_ZOOM_RANGES['roadname_minor'];
    expect(range).toBeDefined();
    expect(range?.[0]).toBeGreaterThan(CAMERA_RESTING_ZOOM);
  });
});

describe('the POI names layer', () => {
  it('still resolves to the label role, though the tint now skips it', () => {
    // The `poi_` prefix is what `ROLE_PATTERNS` matches, and that is unchanged. Since
    // `exp/richer-basemap` the layer is *exempted* from the tint pass by id
    // (`basemap-tint-layer.tsx`) because it carries a per-class `match` on `text-color` that a
    // single-hue tint would collapse — so this now pins the prefix convention rather than the
    // tinting, and the exemption is what has to move if the layer is ever renamed.
    expect(roleFor(POI_LABEL_LAYER_ID)).toBe('label');
    expect(POI_LABEL_LAYER_ID.startsWith('poi_')).toBe(true);
  });

  it('appears at or below the zoom the camera settles at', () => {
    expect(POI_LABEL_MIN_ZOOM).toBeLessThanOrEqual(CAMERA_RESTING_ZOOM);
  });

  it('declares the same font stack as CARTO’s own label layers', () => {
    // A different stack is a different glyph URL, and one CARTO does not serve renders the layer
    // blank with no error — the failure mode that hid this layer the first time it was added.
    expect(BASEMAP_LABEL_FONT[0]).toBe('Montserrat Regular');
    expect(BASEMAP_LABEL_FONT).toContain('Noto Sans Regular');
    expect(BASEMAP_LABEL_FONT).toHaveLength(5);
  });
});
