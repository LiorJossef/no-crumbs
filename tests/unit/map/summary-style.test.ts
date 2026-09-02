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
import {
  countryDiscImageId,
  resolveDiscTokens,
  summaryPillFitAllowance,
  summaryPillWidth,
  type SummaryPillLabel,
} from '@/components/map/country-flag-image';
import { countryPillsAffordLabels } from '@/components/map/summary-style';
import { countryPillText } from '@/components/map/summary-features';
import { MAX_MARKER_ALLOWANCE_SHARE } from '@/components/map/query-rect';

const COMPONENT_SOURCE = readFileSync('src/components/map/summary-marker-layer.tsx', 'utf8');
const STYLE_SOURCE = readFileSync('src/components/map/summary-style.ts', 'utf8');

const FONT = ['Open Sans Regular'];
const country = () => countryLayerLayout();
const area = () => areaLayerLayout(FONT, countryDiscImageId(AREA_DISC_SPEC, 'light'));

/** Code, not prose: both files deliberately *discuss* the discs and the circle layer they replaced,
 *  so a naive whole-file grep would fail on their own explanations. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('every summary marker is a pill, not text on the basemap', () => {
  it('fits the area label into its own image', () => {
    expect(area()['icon-text-fit']).toBe('width');
    expect(area()['icon-image']).toBeDefined();
  });

  it('bakes the country label into the image instead, so a pill stacks as one card', () => {
    // MapLibre paints a symbol layer's icons in one pass and its glyphs in another, so while the
    // country label was live text a lower pill's name floated above an upper pill's background and
    // two countries sharing an anchor smeared together. The band's markers are now one bitmap each
    // (`country-flag-image.ts` draws flag, name and count), which occludes as one opaque card.
    expect(country()['icon-text-fit']).toBeUndefined();
    expect(country()['text-field']).toBeUndefined();
    expect(country()['text-offset']).toBeUndefined();
    expect(country()['icon-image']).toEqual(['get', 'icon']);
    expect(countryLayerLayout(false)['icon-image']).toEqual(['get', 'iconShort']);
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
    expect(area()['icon-anchor']).toBeUndefined();
    // The country band has no `icon-text-fit` to ignore it, so it anchors its bitmap explicitly.
    expect(country()['icon-anchor']).toBe('center');
  });
});

describe('the count and the label stay live text', () => {
  it('renders the area count from the feature, never from the bitmap', () => {
    expect(area()['text-field']).toEqual([
      'concat',
      ['get', 'label'],
      '  ',
      ['to-string', ['get', 'count']],
    ]);
  });

  it("keeps the country count a number rather than a picture of one, in the image's own text", () => {
    // The count is still assembled from the feature — `countryPillText` in `summary-features.ts` —
    // and drawn as text into the canvas. What changed is which pass draws it, not where it comes
    // from: nothing scales a pill by its count, and no count is baked as artwork.
    const features = readFileSync('src/components/map/summary-features.ts', 'utf8');
    expect(features).toContain('countryPillText');
    expect(features).toContain('country.count');
  });

  it('uses one text section, so the RTL plugin actually shapes Hebrew', () => {
    // `shaping.ts:135-146`: bidi runs through `processBidirectionalText` only while
    // `sections.length === 1`. A `format` with a per-section font-scale would need
    // `processStyledBidirectionalText`, and without it the text is shaped with no bidi at all.
    expect(code(STYLE_SOURCE)).not.toContain("'format'");
    expect(code(STYLE_SOURCE)).not.toContain('font-scale');
  });

  it('never wraps, because a second line would overflow a width-fitted pill', () => {
    for (const layout of [area()]) {
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
      expect(layout['icon-allow-overlap']).toBe(true);
    }
    expect(area()['text-ignore-placement']).toBe(false);
    expect(area()['text-allow-overlap']).toBe(true);
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

  it('still shares everything the two bands can share, now that only one draws live text', () => {
    // The bands stopped being field-for-field identical on 2026-09-02, when the country band's
    // label moved inside its bitmap so a pill would stack as one opaque card. What survives is the
    // part that was ever really the same object: an undroppable symbol that does not blind the
    // basemap's own labels, drawn biggest-last.
    for (const key of ['icon-allow-overlap', 'icon-ignore-placement', 'symbol-sort-key']) {
      expect(country()[key]).toEqual(area()[key]);
    }
    // And the country band carries no half of the old arrangement: no text, no fit, no offset.
    for (const key of ['text-field', 'text-font', 'text-size', 'icon-text-fit', 'text-offset']) {
      expect(country()[key]).toBeUndefined();
    }
  });
});

describe('the country pill is centred on its own coordinate', () => {
  it('anchors the whole bitmap, so the flag cap cannot pull the pill off its country', () => {
    // The old defect: `icon-text-fit: 'width'` centred the *text* on the coordinate and hung the
    // cap outside it, so a flagged pill drew ~10 px left of the mean of the user's saved places
    // and needed `CAPPED_PILL_CENTRING_EM` to correct it. With the label inside the image there is
    // one box, `icon-anchor: 'center'` centres it, and the correction has nothing left to correct.
    expect(country()['icon-anchor']).toBe('center');
    expect(country()['icon-offset']).toBeUndefined();
    expect(country()['text-offset']).toBeUndefined();
    expect(code(STYLE_SOURCE)).not.toContain('CAPPED_PILL_CENTRING_EM');
  });

  it('measures a capped pill wider than a capless one carrying the same label', () => {
    expect(summaryPillWidth(true, 'Israel  35')).toBeGreaterThan(
      summaryPillWidth(false, 'Israel  35'),
    );
    // And the label is what sizes it now, not a fixed atlas slot.
    expect(summaryPillWidth(true, 'United Kingdom  18')).toBeGreaterThan(
      summaryPillWidth(true, 'Israel  35'),
    );
  });

  it('leaves the area band fitted to live text, which is where the RTL plugin still matters', () => {
    expect(area()['icon-text-fit']).toBe('width');
    expect(area()['text-offset']).toBeUndefined();
    expect(areaLayerLayout(FONT, 'x')['text-offset']).toBeUndefined();
  });
});

describe('tap targets', () => {
  it('clears §6’s 44 px floor on the pill alone', () => {
    expect(SUMMARY_TAP_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});

/**
 * `W2-D` — a phone cannot draw a country's name, and the flag is what it draws instead.
 *
 * Measured on the owner's 58-place library at 390x844, arrival, against `fa96c1a`'s framing:
 * `United Kingdom  18` drew 206.6 CSS px against anchors the camera frames 48 px from the edge, so
 * 36.9 px of it was off the left edge; `Israel  35` (134.2 px) ran 19.6 px off the right. The
 * numbers here are the *fallback* estimator's, not the browser canvas's — these run in Node — so
 * they are deliberately wider than what shipped. The assertions are about the ordering and the
 * threshold, never about a specific pixel count.
 */
describe('the country band spends what the container can afford', () => {
  const library: SummaryPillLabel[] = [
    { text: 'United Kingdom  18', capped: true },
    { text: 'Czechia  4', capped: true },
    { text: 'Israel  35', capped: true },
    { text: 'Another area  1', capped: false },
  ];

  it('keeps the names on a desktop container and drops them on a phone', () => {
    expect(countryPillsAffordLabels(library, 1440)).toBe(true);
    expect(countryPillsAffordLabels(library, 390)).toBe(false);
  });

  it('flips at exactly the share the camera refuses to pad at', () => {
    // The point of the predicate: the pill stops charging at the same width the camera stops
    // paying (`affordableMarkerAllowance`). One number, two consumers, so a pill can never be both
    // unpadded and too wide to survive the padding that is left.
    const widest = 2 * summaryPillFitAllowance(library.filter((l) => l.capped)).x;
    const boundary = widest / MAX_MARKER_ALLOWANCE_SHARE;
    expect(countryPillsAffordLabels(library, boundary)).toBe(true);
    expect(countryPillsAffordLabels(library, boundary - 1)).toBe(false);
  });

  it('ignores the unflagged bucket, which it cannot narrow', () => {
    // `Another area  1` is wider than a phone edge affords and has no flag to trade the name for.
    // Letting it force every *flagged* pill to drop its name would spend the names and buy nothing.
    const flagged: SummaryPillLabel[] = [{ text: 'Israel  35', capped: true }];
    const withBucket = [...flagged, { text: 'Another area  1', capped: false }];
    expect(countryPillsAffordLabels(withBucket, 600)).toBe(
      countryPillsAffordLabels(flagged, 600),
    );
  });

  it('affords everything when there is no flagged pill, and when the width is unknown', () => {
    expect(countryPillsAffordLabels([{ text: 'Another area  1', capped: false }], 320)).toBe(true);
    expect(countryPillsAffordLabels(library, 0)).toBe(true);
    expect(countryPillsAffordLabels(library, Number.NaN)).toBe(true);
  });

  it('draws the count alone on a flagged pill, and the name on the unflagged bucket', () => {
    // §2.1 and §2.2 specify the country marker as flag + count. The name beside it is the later
    // addition; the flag carries it. §2.5 requires the bucket with no flag to keep its own name,
    // and a pill reading `1` is not a summary of anything.
    // The choice now lives in the image the layer names, and in `countryPillText`, which keeps the
    // unflagged bucket's name at every width because it has no flag to trade it for.
    expect(countryLayerLayout(false)['icon-image']).toEqual(['get', 'iconShort']);
    expect(countryPillText({ countryCode: 'IL', label: 'Israel', count: 35 }, false)).toBe('35');
    expect(countryPillText({ countryCode: null, label: 'Other', count: 1 }, false)).toBe('Other  1');
    expect(countryPillText({ countryCode: 'IL', label: 'Israel', count: 35 }, true)).toBe(
      'Israel  35',
    );
  });

  it('leaves the area band labels alone at every width', () => {
    // The area band's name is the only thing that makes it a *named* geography
    // (`area-band-layout.ts`), and an area pill has no flag to trade it for.
    expect(area()['text-field']).toEqual([
      'concat',
      ['get', 'label'],
      '  ',
      ['to-string', ['get', 'count']],
    ]);
  });

  it('swaps the field on the live layer instead of rebuilding it', () => {
    // A rebuild would drop the source with the layer, and the source is written by a different
    // effect keyed on `countries` — so a resize would empty the band until the next data change.
    expect(code(COMPONENT_SOURCE)).toContain("setLayoutProperty");
    expect(code(COMPONENT_SOURCE)).toContain("map.on('resize'");
  });
});

