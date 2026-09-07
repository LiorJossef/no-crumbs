/**
 * The pin band's floor is conditional on something replacing the pins — the fix for the blank
 * collection map (`docs/archive/handoff-2026-08-29-navigation-pages.md` §5.1).
 *
 * The defect: `place-marker-layer.tsx` set `minzoom: PIN_BAND_MIN` on *every* `MapSurface`, but
 * only `/map` passes `summaries` and therefore only `/map` mounts the country/area bands that are
 * meant to draw in the pins' place. On `/collections/[id]` the pins were removed below z8.5 and
 * nothing took over: zoom out and the map is empty.
 *
 * Two kinds of assertion, the same split `no-density-clustering.test.ts` uses and for the same
 * reason. `pinLayerZoomRange` is a **value** and is called directly. Which prop the surface passes
 * is a **statement** inside JSX that needs a WebGL context to execute, so that half is asserted
 * against the source text — coarse, and honest about being coarse. It proves the floor and the
 * bands are decided by the same expression; it is not evidence that anything rendered. That
 * evidence is a browser at both breakpoints and it lives with the task.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { pinLayerZoomRange } from '@/components/map/place-marker-layer';
import { PIN_BAND_MIN } from '@/components/map/zoom-bands';

const LAYER_SOURCE = readFileSync('src/components/map/place-marker-layer.tsx', 'utf8');
const SURFACE_SOURCE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');

/** Code, not prose: both files deliberately *explain* the defect in their headers, so a whole-file
 *  grep would match the explanation rather than the behaviour. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('pinLayerZoomRange', () => {
  it('applies the floor when a summary layer replaces the pins below it', () => {
    expect(pinLayerZoomRange(PIN_BAND_MIN)).toEqual({ minzoom: PIN_BAND_MIN });
  });

  /**
   * The whole fix. A surface with no bands keeps every pin at every zoom, because for it the floor
   * is pure loss — it hides places and shows nothing instead, which is the opposite of what a
   * retrieval product is for (`06` §9.1).
   */
  it('applies no floor at all when nothing replaces the pins', () => {
    expect(pinLayerZoomRange(null)).toEqual({});
  });

  /**
   * `{}` rather than `{ minzoom: 0 }`, and the distinction is not cosmetic: an absent `minzoom` is
   * MapLibre's own way of saying "every zoom", while a `0` reads to the next author as a tuned
   * floor that happens to sit at the bottom of the scale, and invites tuning.
   */
  it('omits the key rather than writing a zero floor', () => {
    expect(Object.hasOwn(pinLayerZoomRange(null), 'minzoom')).toBe(false);
  });

  it('does not care what the floor is, only that one is justified', () => {
    expect(pinLayerZoomRange(6.25)).toEqual({ minzoom: 6.25 });
  });
});

describe('the floor is never applied unconditionally again', () => {
  /** The regression itself: a literal `minzoom: PIN_BAND_MIN` in the layer file is the bug. */
  it('never hard-codes the band floor in the layer', () => {
    expect(code(LAYER_SOURCE)).not.toContain('minzoom: PIN_BAND_MIN');
    expect(code(LAYER_SOURCE)).not.toContain("PIN_BAND_MIN");
  });

  /** A default would put the assumption back and make it invisible for a second time. */
  it('gives the prop no default', () => {
    // `[^=]` so this reads a destructuring default and not `replacedBelowZoom === null`, which is
    // the comparison the helper is allowed — and required — to make.
    expect(code(LAYER_SOURCE)).not.toMatch(/replacedBelowZoom\s*=[^=]/);
  });

  it('requires every caller to answer the question', () => {
    expect(LAYER_SOURCE).toContain('readonly replacedBelowZoom: number | null;');
    expect(LAYER_SOURCE).not.toContain('replacedBelowZoom?:');
  });
});

describe('the surface decides the bands and the floor with one expression', () => {
  it('gates the summary layer on hasSummaryBands', () => {
    expect(code(SURFACE_SOURCE)).toContain('{hasSummaryBands && (');
  });

  it('gates the floor on the same boolean', () => {
    expect(code(SURFACE_SOURCE)).toContain('replacedBelowZoom={hasSummaryBands ? PIN_BAND_MIN : null}');
  });

  /** One derivation, so the two can never drift apart. */
  it('derives that boolean once, from the summaries prop', () => {
    expect(code(SURFACE_SOURCE)).toContain('const hasSummaryBands = summaries !== undefined;');
    expect(code(SURFACE_SOURCE).match(/hasSummaryBands =/g)).toHaveLength(1);
  });
});
