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

  it('leaves residential street names where CARTO put them', () => {
    // `roadname_minor` is the noise that makes a map read as a generic maps app, and it does not
    // answer "roughly where is this".
    expect(LABEL_ZOOM_RANGES).not.toHaveProperty('roadname_minor');
  });
});

describe('the POI names layer', () => {
  it('is tinted by the existing label role rather than a new one', () => {
    // The `poi_` prefix is load-bearing: it is what `ROLE_PATTERNS` matches, so adding this layer
    // needed no change to the role map. Renaming it silently drops it out of the palette.
    expect(roleFor(POI_LABEL_LAYER_ID)).toBe('label');
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
