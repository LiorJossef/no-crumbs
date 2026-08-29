/**
 * `LIBRARY-IA-1-FIX-1` — the country and area bands are pills, and stay pills.
 *
 * The defect this guards against is the one the owner reported against the running app: the
 * country's name and count drawn as bare text on the basemap, colliding with CARTO's own labels,
 * and the area's name repeated directly under a disc sitting on the city the basemap had already
 * named. The fix is one stretchable pill per marker with the label fitted inside it.
 *
 * Three kinds of assertion, and the split is the same one `no-density-clustering.test.ts` makes.
 *
 * The **layout and paint** are values — `countryLayerLayout` / `areaLayerLayout` /
 * `summaryLayerPaint` exist as functions so "the label sits on a surface" can be checked by calling
 * one rather than by reading a file.
 *
 * The **zoom bands** are values too, but "MapLibre owns the swap" is a statement about what is
 * *absent* from the component — no zoom listener, no React state on zoom — and absence is only
 * assertable against the source text.
 *
 * The **pixels** are not asserted anywhere. Nothing here proves the pill looks right; it proves the
 * layer says what the spec says. On-screen verification is a browser's job.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  AREA_BAND_ZOOM,
  AREA_DISC_SPEC,
  COUNTRY_BAND_ZOOM,
  SUMMARY_TAP_TARGET_PX,
  areaLayerLayout,
  countryLayerLayout,
  summaryLayerPaint,
} from '@/components/map/summary-style';
import { AREA_BAND_MAX, AREA_BAND_MIN, COUNTRY_BAND_MAX } from '@/components/map/zoom-bands';
import { countryDiscImageId, resolveDiscTokens } from '@/components/map/country-flag-image';

const COMPONENT_SOURCE = readFileSync('src/components/map/summary-marker-layer.tsx', 'utf8');
const STYLE_SOURCE = readFileSync('src/components/map/summary-style.ts', 'utf8');

const FONT = ['Open Sans Regular'];
const country = () => countryLayerLayout(FONT);
const area = () => areaLayerLayout(FONT, countryDiscImageId(AREA_DISC_SPEC, 'light'));
const bands = () => [country(), area()];

/** Code, not prose: both files deliberately *discuss* the discs and the circle layer they replaced,
 *  so a naive whole-file grep would fail on their own explanations. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('every summary marker is a pill, not text on the basemap', () => {
  it.each([
    ['country', country()],
    ['area', area()],
  ])('fits the %s label into its own image', (_name, layout) => {
    expect(layout['icon-text-fit']).toBe('width');
    expect(layout['icon-image']).toBeDefined();
  });

  it('paints no halo, because the label is on its own surface now', () => {
    const paint = summaryLayerPaint(resolveDiscTokens('light'));
    expect(paint['text-halo-width']).toBeUndefined();
    expect(paint['text-halo-color']).toBeUndefined();
    expect(paint['text-color']).toBe('#1B1B1A');
  });

  it('gives both bands the same paint, because they are the same object', () => {
    // One function, so there is no second reading of `--card` to drift from the first.
    expect(code(STYLE_SOURCE)).not.toContain('areaLayerPaint');
    expect(code(STYLE_SOURCE)).not.toContain('countryLayerPaint');
  });

  it('never sets an icon-anchor, which icon-text-fit ignores outright', () => {
    // `maplibre-gl/src/symbol/shaping.ts:635-637`. An anchor here would read as configuration and
    // do nothing.
    for (const layout of bands()) expect(layout['icon-anchor']).toBeUndefined();
  });
});

describe('the count and the label stay live text', () => {
  it.each([
    ['country', country()],
    ['area', area()],
  ])('renders the %s count from the feature, never from the bitmap', (_name, layout) => {
    expect(JSON.stringify(layout['text-field'])).toContain('count');
    expect(layout['text-field']).toEqual([
      'concat',
      ['get', 'label'],
      '  ',
      ['to-string', ['get', 'count']],
    ]);
  });

  it('uses one text section, so the RTL plugin actually shapes Hebrew', () => {
    // `shaping.ts:135-146`: bidi runs through `processBidirectionalText` only while
    // `sections.length === 1`. A `format` with a per-section font-scale would need
    // `processStyledBidirectionalText`, and without it the text is shaped with no bidi at all.
    expect(code(STYLE_SOURCE)).not.toContain("'format'");
    expect(code(STYLE_SOURCE)).not.toContain('font-scale');
  });

  it('never wraps, because a second line would overflow a width-fitted pill', () => {
    for (const layout of bands()) {
      expect(layout['text-max-width']).toBeGreaterThanOrEqual(20);
      // Zero is not how to say "never wrap": `determineAverageLineWidth` divides by it.
      expect(layout['text-max-width']).not.toBe(0);
    }
  });
});

describe('the bands stay declarative and stay symbol layers', () => {
  it('keeps the three thresholds in zoom-bands.ts alone', () => {
    expect(COUNTRY_BAND_ZOOM).toEqual({ maxzoom: COUNTRY_BAND_MAX });
    expect(AREA_BAND_ZOOM).toEqual({ minzoom: AREA_BAND_MIN, maxzoom: AREA_BAND_MAX });
    // Exhaustive and mutually exclusive: a layer draws when `minzoom <= z < maxzoom`.
    expect(COUNTRY_BAND_ZOOM.maxzoom).toBe(AREA_BAND_ZOOM.minzoom);
    for (const literal of ['4.5', '8.5']) {
      expect(code(STYLE_SOURCE)).not.toContain(literal);
      expect(code(COMPONENT_SOURCE)).not.toContain(literal);
    }
  });

  it('adds two symbol layers and no circle layer', () => {
    const source = code(COMPONENT_SOURCE);
    expect(source.match(/type: 'symbol'/g)).toHaveLength(2);
    expect(source).not.toContain("type: 'circle'");
    expect(source).not.toContain('circle-radius');
  });

  it('never listens for zoom and never holds it in React state', () => {
    const source = code(COMPONENT_SOURCE);
    for (const needle of ["'zoom'", "'zoomend'", 'getZoom(', 'useState']) {
      expect(source).not.toContain(needle);
    }
  });

  it('lets neither band be dropped for colliding with the basemap', () => {
    for (const layout of bands()) {
      expect(layout['icon-allow-overlap']).toBe(true);
      expect(layout['icon-ignore-placement']).toBe(true);
      expect(layout['text-allow-overlap']).toBe(true);
      expect(layout['text-ignore-placement']).toBe(true);
    }
  });

  it('draws the busier marker on top', () => {
    // `symbol_bucket.ts` sorts ascending, so a higher key is buffered later and therefore above.
    for (const layout of bands()) expect(layout['symbol-sort-key']).toEqual(['get', 'count']);
  });
});

describe('the area band and the country band are one object', () => {
  it('draws every area on the capless pill the countryless country also uses', () => {
    expect(AREA_DISC_SPEC.countryCode).toBeNull();
    expect(area()['icon-image']).toBe(countryDiscImageId({ countryCode: null }, 'light'));
  });

  it('no longer draws the area name as a second layer under the marker', () => {
    // The defect: `London` printed under a disc sitting on the basemap's own `London`.
    expect(code(STYLE_SOURCE)).not.toContain('areaLabelLayerLayout');
    expect(code(COMPONENT_SOURCE)).not.toContain('areaLabelLayerId');
    expect(code(COMPONENT_SOURCE)).not.toContain("'text-offset'");
  });

  it('differs between the bands only in where the image id comes from', () => {
    const { 'icon-image': countryIcon, ...countryRest } = country();
    const { 'icon-image': areaIcon, ...areaRest } = area();
    expect(countryIcon).toEqual(['get', 'icon']);
    expect(typeof areaIcon).toBe('string');
    expect(countryRest).toEqual(areaRest);
  });
});

describe('tap targets', () => {
  it('clears §6’s 44 px floor on the pill alone', () => {
    expect(SUMMARY_TAP_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
