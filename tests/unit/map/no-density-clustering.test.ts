/**
 * `L1-F5-T5` — density clustering of saved places is removed, and stays removed.
 *
 * Owner ruling, 2026-08-28 (`docs/06-map-and-places-decision.md` §9.1): collapsing nearby saved
 * places into a numbered bubble — a pair especially — is wrong for a retrieval product. At city and
 * local browsing zoom the user must see the actual pins.
 *
 * ## Two kinds of assertion here, and the split is deliberate
 *
 * The **layer** is now a value: `pinLayerLayout` / `pinLayerPaint` were extracted out of the
 * `useEffect` precisely so "there is one layer and it has no cluster filter" could be checked by
 * calling a function instead of reading a file.
 *
 * The **source options** are still a statement — `map.addSource(..., { cluster: true })` is not a
 * value anything can return — and they need a live `Map` and a WebGL context to execute. So that
 * half is asserted against the source text. The repo already takes that route where the property is
 * structural (`scripts/check-layer-guard.sh` greps for forbidden imports for the same reason). It
 * is coarse and honest about being coarse: it proves nobody re-enabled supercluster, not that the
 * map looks right. The on-screen half of exit criterion 1 is verified in a real browser at both
 * breakpoints, and that evidence lives with the task.
 *
 * The ruling anticipates re-derivation specifically — the deleted `clusterRadiusExpression` carried
 * a comment arguing the two-point bubble was correct — so this file exists to fail loudly rather
 * than to be thorough.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { toPlaceFeatures } from '@/components/map/place-features';
import * as markerStyle from '@/components/map/marker-style';
import { pinLayerLayout, pinLayerPaint } from '@/components/map/marker-style';
import type { MapPlace } from '@/components/map/types';

const LAYER_SOURCE = readFileSync('src/components/map/place-marker-layer.tsx', 'utf8');
const STYLE_SOURCE = readFileSync('src/components/map/marker-style.ts', 'utf8');

/** Everything supercluster needs to be switched on, plus the property it writes onto a merged
 *  feature. Any one of them reappearing means the bubble is back. */
const CLUSTER_WIRING = [
  'cluster: true',
  'clusterMaxZoom',
  'clusterRadius',
  'clusterMinPoints',
  'clusterProperties',
  'point_count',
  'getClusterExpansionZoom',
];

/** Code, not prose: the header of both files deliberately *discusses* clustering so the ruling
 *  cannot be lost, so a naive whole-file grep would fail on its own explanation. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the saved-places source is not clustered', () => {
  it.each(CLUSTER_WIRING)('never wires %s', (needle) => {
    expect(code(LAYER_SOURCE)).not.toContain(needle);
  });

  it('draws exactly one layer from the source', () => {
    // Three layers used to be added here: a cluster circle, a cluster count, and the pins.
    expect(code(LAYER_SOURCE).match(/map\.addLayer\(/g) ?? []).toHaveLength(1);
    expect(code(LAYER_SOURCE)).not.toContain("type: 'circle'");
  });

  it('passes no filter to the pin layer, because nothing can be a cluster feature', () => {
    // The old `filter: ['!', ['has', 'point_count']]` is gone. Keeping it would be a no-op dressed
    // up as a safeguard, and the next reader would assume clusters still existed somewhere.
    expect(code(LAYER_SOURCE)).not.toMatch(/\bfilter:/);
  });

  it('builds a layer spec that mentions no cluster property anywhere', () => {
    const spec = JSON.stringify({ layout: pinLayerLayout(['Open Sans Regular']), paint: pinLayerPaint() });
    expect(spec).not.toContain('point_count');
    expect(spec).not.toContain('cluster');
  });

  it('keeps the label gate that makes a world-zoom "show everything" an icons-only case', () => {
    // Not a clustering property, but the thing that took clustering's place as the answer to the
    // 2 000-point zoom-out: below the lowest tier the `step` yields the literal '' and MapLibre
    // shapes zero glyphs. If someone removes the gate, the removal stops being cheap — `06` §9.1.
    //
    // **This asserted a single flat gate at 14 until `W2-3`.** It is now a ladder, because the home
    // camera comes to rest on the user's own pins (`W2-1`) at z8.8–13 and a flat gate at 14 meant
    // an overview with pins and not one name on it. The property that made the flat gate cheap is
    // asserted directly rather than as a shape: the first branch is the empty *string*, and the
    // per-pin test lives inside the later branches where it costs an expression evaluation and
    // never a glyph.
    const field = pinLayerLayout(['Open Sans Regular'])['text-field'] as unknown[];
    expect(field[0]).toBe('step');
    expect(field[1]).toEqual(['zoom']);
    expect(field[2]).toBe('');
    expect(field.slice(3).filter((_, index) => index % 2 === 0)).toEqual([
      ...markerStyle.LABEL_TIER_ZOOMS,
    ]);
    // The ladder ends where the flat gate was, and ends unconditionally: every name is drawn by 14,
    // exactly as before, so nothing this change does can hide a label that is visible without it.
    expect(field[field.length - 2]).toBe(markerStyle.LABEL_ALL_ZOOM);
    expect(markerStyle.LABEL_ALL_ZOOM).toBe(14);
  });

  /**
   * The tiering's cost, as the property that bounds it. Every branch above the floor is a `case`
   * over a **feature** property, so the zoom expression is still evaluated once per feature per
   * tile rather than resolving to a glyph run: what decides whether a name is shaped is
   * `labelZoom`, and `labelZoom` is bounded by screen geometry (`withLabelZooms`).
   */
  it('tests the pin, not the library, in every branch above the floor', () => {
    const field = pinLayerLayout(['Open Sans Regular'])['text-field'] as unknown[];
    for (const branch of field.slice(4).filter((_, index) => index % 2 === 0)) {
      expect(JSON.stringify(branch)).toContain("[\"get\",\"labelZoom\"]");
    }
  });

  it('keeps overlap on, which is what makes a dense pair two visible pins', () => {
    const layout = pinLayerLayout(['Open Sans Regular']);
    expect(layout['icon-allow-overlap']).toBe(true);
    expect(layout['icon-ignore-placement']).toBe(true);
  });

  it('exports no cluster expression at all', () => {
    for (const name of Object.keys(markerStyle)) {
      expect(name.toLowerCase()).not.toContain('cluster');
    }
    expect(code(STYLE_SOURCE)).not.toContain('point_count');
  });
});

describe('two saved places 50 m apart are two pins', () => {
  /** 50 m north of the other, at Tel Aviv's latitude: 0.00045 deg ~= 50 m. Both are real
   *  coordinates from the local library's neighbourhood, not round numbers. */
  const near: readonly MapPlace[] = [
    {
      id: 'a',
      name: 'Anat Bakery',
      category: 'cafe',
      lat: 32.0596,
      lng: 34.7654,
      note: '',
      sourceUrl: undefined,
      visited: false,
    },
    {
      id: 'b',
      name: 'Next Door',
      category: 'cafe',
      lat: 32.06005,
      lng: 34.7654,
      note: '',
      sourceUrl: undefined,
      visited: false,
    },
  ];

  it('emits one feature each, with their own coordinates and categories', () => {
    const { features } = toPlaceFeatures(near);
    expect(features).toHaveLength(2);
    expect(features.map((f) => f.properties.id)).toEqual(['a', 'b']);
    expect(features.map((f) => f.properties.category)).toEqual(['cafe', 'cafe']);
    // Distinct coordinates: neither is merged onto the other's position.
    expect(features[0]?.geometry.coordinates).not.toEqual(features[1]?.geometry.coordinates);
  });

  it('carries no count property for anything to render as a number', () => {
    for (const feature of toPlaceFeatures(near).features) {
      expect(Object.keys(feature.properties).sort()).toEqual([
        'category',
        'id',
        'name',
        'visited',
      ]);
    }
  });
});
