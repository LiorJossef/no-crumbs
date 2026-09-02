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
  CAPPED_PILL_CENTRING_EM,
  COUNTRY_BAND_ZOOM,
  SUMMARY_TAP_TARGET_PX,
  SUMMARY_TEXT_PX,
  areaLayerLayout,
  countryLayerLayout,
  summaryLayerPaint,
} from '@/components/map/summary-style';
import { AREA_BAND_MAX, AREA_BAND_MIN, COUNTRY_BAND_MAX } from '@/components/map/zoom-bands';
import {
  countryDiscImageId,
  resolveDiscTokens,
  summaryPillWidth,
} from '@/components/map/country-flag-image';

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

  it('never lets a country be dropped for colliding with anything', () => {
    // A country that vanishes at world zoom is a country's worth of saved places the user cannot
    // see, and there is no zoom below the country band to recover it at.
    expect(country()['icon-allow-overlap']).toBe(true);
    expect(country()['text-allow-overlap']).toBe(true);
  });

  it('still lets everything else see the pill it must not displace', () => {
    // `ignore-placement` was true alongside `allow-overlap` until 2026-09-02, on the assumption
    // that the two together spelled "never dropped". They do not: read in the installed 6.4.1,
    // `placeCollisionBox` (`maplibre-gl-dev.mjs:6976`) skips the hit test whenever the overlap mode
    // is `always`, so `allow-overlap` alone is the whole guarantee, while `insertCollisionBox`
    // (:7131) files the box in `ignoredGrid` rather than `grid` when `ignore-placement` is true —
    // and `ignoredGrid` is read only by `queryRenderedSymbols` (:7111), never by placement. So the
    // flag cost the basemap's own labels the ability to step aside from our pills and bought
    // nothing. Both bands are `false`; both are still undroppable.
    for (const layout of [country(), area()]) {
      expect(layout['icon-ignore-placement']).toBe(false);
      expect(layout['text-ignore-placement']).toBe(false);
      expect(layout['icon-allow-overlap']).toBe(true);
      expect(layout['text-allow-overlap']).toBe(true);
    }
  });

  it('never lets an area be dropped for colliding either — the hierarchy decides, not the index', () => {
    // Reversed 2026-09-02 (`W2B-OVERLAP`). The area band ran with MapLibre's placement on from
    // 2026-08-30, on the argument that the loser was recovered by zooming in "because z8.5 ends the
    // band". Measured against the owner's own library, it was not: Tel Aviv and Herzliya first have
    // room at z8.4, inside `settleZoom`'s guard window, so seven of twelve areas drew at no zoom in
    // the band at all and 18 of 58 saved places were neither visible nor counted.
    //
    // `area-band-layout.ts` answers that question before the features reach MapLibre, by absorbing
    // an area that does not fit into the neighbour that displaced it and adding its places to that
    // neighbour's count. The pills in a step do not overlap by construction, so there is nothing
    // for the collision index to resolve — and turning it off is what guarantees it can never again
    // delete a marker the layout intended to draw.
    expect(area()['icon-allow-overlap']).toBe(true);
    expect(area()['text-allow-overlap']).toBe(true);
  });

  it('lets the busier marker draw on top, in both bands', () => {
    // `symbol_bucket.ts` sorts ascending and buffers in that order, so a *higher* key lands on top.
    // Neither band collides now, so this is draw order alone and the two bands share it again; the
    // area band's negated key went with its placement (see above).
    expect(country()['symbol-sort-key']).toEqual(['get', 'count']);
    expect(area()['symbol-sort-key']).toEqual(['get', 'count']);
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

  it('differs between the bands only in the image id, the cap, and colliding', () => {
    // Amended 2026-08-29 and again 2026-08-30, and deliberately not weakened: the two bands were
    // identical apart from where the image id comes from until the country band gained the flag
    // cap's centring offset, and then until the area band started colliding. Each exception is
    // asserted on its own above; everything *else* must still be equal, field for field.
    // Emptied on 2026-09-02: the area band stopped colliding, so the two bands differ in the image
    // id and the cap alone once more — which is what this assertion was written to protect.
    const collision: string[] = [];
    const strip = (layout: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(layout).filter(([k]) => !collision.includes(k)));
    const { 'icon-image': countryIcon, 'text-offset': offset, ...countryRest } = country();
    const { 'icon-image': areaIcon, ...areaRest } = area();
    expect(countryIcon).toEqual(['get', 'icon']);
    expect(typeof areaIcon).toBe('string');
    expect(offset).toBeDefined();
    expect(areaLayerLayout(FONT, 'x')['text-offset']).toBeUndefined();
    expect(strip(countryRest)).toEqual(strip(areaRest));
  });
});

describe('a capped pill is centred on its own coordinate', () => {
  // The owner's report: the macro badges do not sit over the places they count. They do not,
  // because `icon-text-fit: 'width'` centres the *text* on the coordinate and hangs the image's
  // fixed regions off the text box — and the flag cap is entirely on the leading edge, so the drawn
  // pill ends up half the cap's width to the left. See `CAPPED_PILL_CENTRING_EM`.

  it('measures the overhang from the pill widths rather than re-adding the cap geometry', () => {
    const overhang = summaryPillWidth(true) - summaryPillWidth(false);
    expect(overhang).toBeGreaterThan(0);
    expect(CAPPED_PILL_CENTRING_EM * SUMMARY_TEXT_PX).toBeCloseTo(overhang / 2, 10);
  });

  it('shifts the flagged pill right by half its cap, in ems, because text-offset speaks ems', () => {
    expect(country()['text-offset']).toEqual([
      'case',
      ['==', ['get', 'countryCode'], ''],
      ['literal', [0, 0]],
      ['literal', [CAPPED_PILL_CENTRING_EM, 0]],
    ]);
  });

  it('leaves every capless pill alone, because a capless pill is already symmetric', () => {
    // The countryless bucket carries `countryCode: ''` and draws the same capless image every area
    // marker does; correcting it would push it off its own coordinate in the other direction.
    expect(area()['text-offset']).toBeUndefined();
    const offset = country()['text-offset'] as unknown[];
    expect(offset[1]).toEqual(['==', ['get', 'countryCode'], '']);
    expect(offset[2]).toEqual(['literal', [0, 0]]);
  });

  it('moves the text, never the icon — the pill is fitted to the text and follows it', () => {
    // `icon-offset` would slide the pill off its own label: `fitIconToText` applies it to the icon
    // box alone (`maplibre-gl/src/symbol/shaping.ts`).
    expect(country()['icon-offset']).toBeUndefined();
    expect(area()['icon-offset']).toBeUndefined();
  });
});

describe('tap targets', () => {
  it('clears §6’s 44 px floor on the pill alone', () => {
    expect(SUMMARY_TAP_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
