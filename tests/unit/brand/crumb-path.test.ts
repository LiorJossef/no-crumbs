import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRUMB_BOUNDS,
  CRUMB_HEAD_CENTRE,
  CRUMB_PATH,
  CRUMB_PIN_BOUNDS,
  CRUMB_PIN_TAIL_PATH,
} from '@/components/brand/crumb-path';

/**
 * `brand-and-product-foundation.md` §3.1 rule 1 is the only brand rule this repository can check by
 * machine: **the silhouette is the system**, one closed path shared by the mascot at 168px, the map
 * pin at 30px and the favicon at 16px, and *"if the outline changes, the pin is lost"*.
 *
 * A shared constant does not enforce that on its own — the failure mode is a second copy of the
 * path pasted into a file that could not import it (a static `.svg`, a canvas routine, an image
 * route). So this file asserts the property directly: **`crumb-path.ts` is the only place in `src/`
 * where the outline appears as a literal.**
 */

/** The distinctive head of the path, long enough that no other path could contain it by accident. */
const OUTLINE_SIGNATURE = 'M34 9C50 3 70 7 82 20';

/** Files that draw the mark. Each is asserted to reach the outline rather than restate it.
 */
const CONSUMERS = [
  'src/components/brand/pin-mark.tsx',
  'src/components/map/marker-images.ts',
  'src/app/opengraph-image.tsx',
  'src/app/apple-icon.tsx',
  'src/app/global-error.tsx',
];

describe('the crumb outline', () => {
  it('is a single closed subpath', () => {
    // One `M`, one `Z`, and nothing after the close. A second subpath would fill differently under
    // `nonzero` and `evenodd`, and canvas, SVG and satori do not all default to the same rule.
    expect(CRUMB_PATH.match(/M/g)).toHaveLength(1);
    expect(CRUMB_PATH.trimEnd().endsWith('Z')).toBe(true);
    expect(CRUMB_PATH.match(/Z/g)).toHaveLength(1);
  });

  it('has bounds that are inside, not equal to, the authoring square', () => {
    // Measured off the rendered alpha channel at 10x, not eyeballed. A renderer that assumes the
    // full 0..100 square draws the crumb ~11% small and slightly off-centre, which is visible at
    // 15px — see `crumb-path.ts`.
    expect(CRUMB_BOUNDS.minX).toBeGreaterThan(0);
    expect(CRUMB_BOUNDS.maxX).toBeLessThan(100);
    expect(CRUMB_BOUNDS.maxX - CRUMB_BOUNDS.minX).toBeCloseTo(89, 0);
    expect(CRUMB_BOUNDS.maxY - CRUMB_BOUNDS.minY).toBeCloseTo(87.9, 0);
  });

  it('puts the head centre at the middle of the ink, not the middle of the square', () => {
    expect(CRUMB_HEAD_CENTRE.x).toBeCloseTo(49.7, 1);
    expect(CRUMB_HEAD_CENTRE.y).toBeCloseTo(50.15, 1);
  });

  it('extends the pin only downwards — the head is the same width as the crumb', () => {
    // The tail may make the pin taller. If it ever changes the horizontal extent, the head has been
    // redrawn and rule 1 is broken.
    expect(CRUMB_PIN_BOUNDS.minX).toBe(CRUMB_BOUNDS.minX);
    expect(CRUMB_PIN_BOUNDS.maxX).toBe(CRUMB_BOUNDS.maxX);
    expect(CRUMB_PIN_BOUNDS.minY).toBe(CRUMB_BOUNDS.minY);
    expect(CRUMB_PIN_BOUNDS.maxY).toBeGreaterThan(CRUMB_BOUNDS.maxY);
    // The tail's shoulders sit inside the crumb so the union reads as one silhouette with no seam.
    expect(CRUMB_PIN_TAIL_PATH).toContain('90');
  });

  it('is copied into the favicon character for character', () => {
    // `app/icon.svg` is the one file that legitimately restates the path: it is a static asset
    // served to the browser and it cannot import anything. So the copy is asserted instead of
    // forbidden — this test *is* the mechanism that keeps the 16px mark and the 30px pin the same
    // shape, and it is named in a comment inside the SVG so the next editor finds it.
    const svg = readFileSync('src/app/icon.svg', 'utf8');
    expect(svg).toContain(CRUMB_PATH);
  });

  it('keeps the face off the map', () => {
    // `brand-and-product-foundation.md` §3.1 rule 2, second half, and it is absolute: *face on
    // chrome, silhouette on data*. Thirty-one smiling faces over a city is a toy, and a pin with
    // eyes cannot carry a category colour. The face constants exist and are used — by the app
    // icon, the link preview and the two chrome marks — so the thing worth asserting is not that
    // they are unused but that the map never reaches them.
    const map = readFileSync('src/components/map/marker-images.ts', 'utf8');
    expect(map).not.toContain('CRUMB_EYES');
    expect(map).not.toContain('CRUMB_SMILE');
  });

  it('puts the face only where rule 2 names', () => {
    /*
     * Chrome: the landing and sign-in mark (one surface in `voice-and-vocabulary.md` §2), the app
     * icon and the link preview. Not the error screens — they are on neither list, and a mascot
     * grinning at somebody whose screen just failed is its own defect.
     *
     * **Stated as a property of the surface rather than of a file's import list**, because the two
     * pages do not have to draw the lockup themselves and as of I2-4 they do not: `ChromeStage` is
     * the one composition both render, so that the mark and the name cannot drift between two
     * screens one step apart in the demo path. A permitted surface therefore *reaches* the faced
     * mark — directly or through the shared lockup — and a forbidden one reaches it by neither
     * route. Asserting the component alone would go on passing if a page stopped rendering it.
     */
    const reachesTheFace = (file: string) => {
      const source = readFileSync(file, 'utf8');
      return /<PinMark face|<ChromeMark\b|<ChromeStage\b/.test(source);
    };
    // The chain, asserted link by link so a break anywhere fails rather than only at the ends:
    // `chrome-mark.tsx` draws the faced mark, the stage renders the seam, the two permitted
    // surfaces render the stage. `chrome-mark.tsx` is where the gold mascot lands, which is the
    // reason the seam exists and the reason this assertion moved down one level.
    expect(
      readFileSync('src/components/brand/chrome-mark.tsx', 'utf8'),
      'the mascot seam should draw the faced mark',
    ).toContain('<PinMark face');
    expect(
      readFileSync('src/components/brand/chrome-stage.tsx', 'utf8'),
      'the chrome lockup should reach the mark through the seam',
    ).toContain('<ChromeMark');
    for (const file of ['src/app/page.tsx', 'src/app/sign-in/page.tsx']) {
      expect(reachesTheFace(file), `${file} should reach the faced mark`).toBe(true);
    }
    for (const file of ['src/app/error.tsx', 'src/app/not-found.tsx']) {
      expect(reachesTheFace(file), `${file} must not reach the faced mark`).toBe(false);
    }
  });

  it('appears as a literal in exactly one file', () => {
    for (const file of CONSUMERS) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} restates the outline instead of importing it`).not.toContain(
        OUTLINE_SIGNATURE,
      );
      // Two routes to the shared outline, and both are one step: the geometry directly, or the
      // drawing that is built from it. I2-W added the second — `crumb-mascot-markup.ts` is where
      // the face, the shading and the palette stopped being written once per renderer — and the
      // module itself is asserted below to read `crumb-path`, so the chain has no gap.
      expect(source, `${file} does not read the shared outline`).toMatch(
        /crumb-path|crumb-mascot/,
      );
    }
    expect(
      readFileSync('src/components/brand/crumb-mascot-markup.ts', 'utf8'),
      'the drawing should build from the shared geometry rather than restate it',
    ).toMatch(/from '\.\/crumb-path'/);
  });
});
