/**
 * The sheet's geometry, and the four mirrors of `PEEK_PX` that cannot import each other.
 *
 * `ux-collections-as-scope.md` §5 item 8 deleted one of those mirrors (`/collections/[id]`'s
 * private copy) and was explicit that the *value* must not move: `globals.css` uses it to keep
 * CARTO's and OpenStreetMap's attribution clear of the sheet on a phone, which is a licence
 * condition rather than a layout preference. The three surviving copies live in a `.ts` module, a
 * different `.ts` module that may not import it, and a stylesheet — so the only thing that can hold
 * them together is a test that reads all three.
 *
 * No DOM here (`vitest.config.ts` sets `environment: 'node'`); none is needed, because every claim
 * below is arithmetic or source text.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  HALF_FRACTION,
  PEEK_PX,
  SNAP_POINTS,
  STOP_TO_CONTENT_HEIGHT,
  STOP_TO_SNAP,
  restingSheetFractionFor,
  snapToStop,
} from '@/components/shell/sheet-geometry';
import { SHEET_PEEK_PX } from '@/components/map/query-rect';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

describe('PEEK_PX and its mirrors', () => {
  it('is still 128', () => {
    // Spelled out rather than compared to itself: the ruling names the number, so the test does.
    expect(PEEK_PX).toBe(128);
  });

  it('is the same number the camera spends on its bottom budget', () => {
    expect(SHEET_PEEK_PX).toBe(PEEK_PX);
  });

  it('is the same number the attribution is lifted clear by', () => {
    // The licence mirror. Read as source text because CSS cannot import a constant, and asserted
    // as the whole declaration so a change to the *shape* of the calc() fails here too.
    const css = repoFile('src/app/globals.css');
    expect(css).toContain(
      `padding-bottom: calc(${PEEK_PX}px + env(safe-area-inset-bottom) + 0.25rem);`,
    );
  });

  it('is no longer declared anywhere under src/app/collections', () => {
    // §5 item 8's deletion, as a property rather than a memory. `sheet-geometry.ts` is gone from
    // that route; what must never come back is a second declaration of any of the three constants
    // it held, in any file there.
    const files = readdirSync(new URL('../../../src/app/collections/', import.meta.url), {
      recursive: true,
      encoding: 'utf8',
    }).filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'));

    expect(files).not.toContain('[id]/sheet-geometry.ts');
    for (const name of files) {
      const source = repoFile(`src/app/collections/${name}`);
      expect(source, name).not.toMatch(
        /(PEEK_PX|RESTING_SHEET_FRACTION|FLOATING_TOP_CHROME_PX)\s*=/,
      );
      // §5 item 9: one `Drawer.Root` for the product, and it is the shell's. The element, not the
      // word — a comment explaining where the second one went is the point of deleting it.
      expect(source, name).not.toContain('<Drawer.Root');
    }
  });
});

describe('the three stops', () => {
  it('are the snap points, in order, and nothing else is', () => {
    expect(SNAP_POINTS).toEqual([STOP_TO_SNAP.peek, STOP_TO_SNAP.half, STOP_TO_SNAP.full]);
    expect(SNAP_POINTS).toHaveLength(3);
  });

  it('round-trip through snapToStop', () => {
    for (const stop of ['peek', 'half', 'full'] as const) {
      expect(snapToStop(STOP_TO_SNAP[stop])).toBe(stop);
    }
  });

  it('treat anything unrecognised as peek', () => {
    // Where the sheet starts, and the only stop it is safe to be wrong about.
    expect(snapToStop(null)).toBe('peek');
    expect(snapToStop(0.42)).toBe('peek');
  });

  it('derive the half content height from the fraction, with no float noise in the CSS', () => {
    // `0.55 * 100` is 55.00000000000001 in IEEE 754, and that string would reach the browser
    // verbatim. This is the assertion that stops someone "simplifying" the rounding away.
    expect(STOP_TO_CONTENT_HEIGHT.half).toBe('calc(55dvh - 14px)');
    expect(STOP_TO_CONTENT_HEIGHT.half).not.toContain('55.0');
    expect(STOP_TO_CONTENT_HEIGHT.peek).toBe(`calc(${PEEK_PX}px - 14px)`);
    expect(STOP_TO_CONTENT_HEIGHT.full).toBe('calc(100dvh - 14px)');
  });
});

describe('what a resting stop costs the camera', () => {
  it('is undefined at peek, so the surface keeps its own pixel budget', () => {
    // Not an omission: 128px is a fixed strip and `128 / containerHeight` differs on every phone.
    expect(restingSheetFractionFor('peek')).toBeUndefined();
  });

  it('is the half fraction at half — the value L2-COLL-CAM-2 was fixed to', () => {
    expect(restingSheetFractionFor('half')).toBe(HALF_FRACTION);
    expect(HALF_FRACTION).toBe(0.55);
  });

  it('caps a full-height sheet at the half fraction rather than conceding the container', () => {
    // Conceding 100% would push `clampFitPadding` into scaling the box, which is the mechanism
    // behind L2-COLL-CAM-2. There is no honest framing behind a full sheet; the useful one is what
    // the user sees when they drag it down.
    expect(restingSheetFractionFor('full')).toBe(HALF_FRACTION);
  });
});
