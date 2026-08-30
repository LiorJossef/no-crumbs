/**
 * **The two copies of the category palette must not drift.**
 *
 * `src/ui/place/palette.ts` holds the literals the MapLibre style expressions read, because the GL
 * renderer cannot resolve a CSS custom property. `src/app/globals.css` holds the same values as
 * `--category-*` tokens, because the list, the detail view and the filter chips paint from the DOM
 * and have to stay re-themeable. Both files say, at length, that the duplication is deliberate.
 *
 * Deliberate duplication is still duplication, and the failure it produces is the quiet kind: a
 * café retuned on one side only, a pin one brown and its filter chip another, nothing failing
 * anywhere. This is the assertion that makes that a test failure instead of a bug report six weeks
 * later.
 *
 * Source text, not rendering — `vitest.config.ts` sets `environment: 'node'` and the CSS never gets
 * a style engine here. Reading the declarations is exactly the right level: what is being asserted
 * *is* that two files contain the same characters.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRODUCT_CATEGORY_ORDER } from '@/domain/places/product-category';
import { CATEGORY_DISPLAY, categoryDisplay } from '@/ui/place/category-display';
import {
  CATEGORY_COLOR,
  PIN_LABEL_HALO,
  PIN_LABEL_INK,
  UNCATEGORISED_COLOR,
} from '@/ui/place/palette';

const GLOBALS = fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url));

/**
 * Every `--name: value` in `:root`, with `var(--other)` references followed to the literal they
 * end at. `--category-uncategorised` is written as `var(--mint-700)` on purpose — it *is* the house
 * mint rather than a fourth colour that happens to match — so a comparison that stopped at the
 * reference would be comparing a string to a colour.
 */
function rootTokens(): Map<string, string> {
  const block = /^:root \{([\s\S]*?)^\}/m.exec(readFileSync(GLOBALS, 'utf8'));
  if (block?.[1] === undefined) throw new Error('no :root block in globals.css');
  const raw = new Map<string, string>();
  for (const line of block[1].replace(/\/\*[\s\S]*?\*\//g, '').split('\n')) {
    const declaration = /^\s*(--[a-z0-9-]+)\s*:\s*(.+);\s*$/i.exec(line);
    if (declaration?.[1] !== undefined && declaration[2] !== undefined) {
      raw.set(declaration[1], declaration[2].trim());
    }
  }
  const resolve = (value: string, depth = 0): string => {
    const reference = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
    if (reference?.[1] === undefined) return value;
    if (depth > 8) throw new Error(`cyclic token reference at ${value}`);
    const next = raw.get(reference[1]);
    if (next === undefined) throw new Error(`${value} references a token :root does not define`);
    return resolve(next, depth + 1);
  };
  return new Map([...raw].map(([name, value]) => [name, resolve(value)]));
}

/** Hex is written upper-case in `globals.css` and in `palette.ts`, but comparing case-insensitively
 *  is what we mean: `#c2452f` and `#C2452F` are the same colour and neither is a drift. */
function sameColour(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

describe('the category palette and its CSS tokens are one palette', () => {
  it('holds a token for every category the taxonomy defines, and no orphan', () => {
    const tokens = rootTokens();
    const declared = [...tokens.keys()].filter((name) => name.startsWith('--category-')).sort();
    expect(declared).toEqual(
      [...PRODUCT_CATEGORY_ORDER.map((c) => `--category-${c}`), '--category-uncategorised'].sort(),
    );
  });

  it('gives each category the same colour on both sides', () => {
    const tokens = rootTokens();
    for (const category of PRODUCT_CATEGORY_ORDER) {
      const token = tokens.get(`--category-${category}`);
      expect(token, `--category-${category}`).toBeDefined();
      expect(
        sameColour(token as string, CATEGORY_COLOR[category]),
        `--category-${category} is ${token as string}, palette.ts is ${CATEGORY_COLOR[category]}`,
      ).toBe(true);
    }
  });

  it('paints uncategorised in the house mint on both sides', () => {
    // Not a fourth colour that happens to match `--mint-700`: `globals.css` writes it as a
    // reference precisely so that moving the mint moves this with it.
    const tokens = rootTokens();
    expect(sameColour(tokens.get('--category-uncategorised') ?? '', UNCATEGORISED_COLOR)).toBe(true);
    expect(sameColour(tokens.get('--mint-700') ?? '', UNCATEGORISED_COLOR)).toBe(true);
  });

  it('draws the pin label in --foreground on --background', () => {
    // MapLibre paints the name into the GL canvas, so these two need the literal as well.
    const tokens = rootTokens();
    expect(sameColour(tokens.get('--foreground') ?? '', PIN_LABEL_INK)).toBe(true);
    expect(sameColour(tokens.get('--background') ?? '', PIN_LABEL_HALO)).toBe(true);
  });

  it('leaves no colour literal in category-display.ts', () => {
    // The package's own exit criterion. That file is about which *word* goes with which colour.
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/ui/place/category-display.ts', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('still resolves a category to its colour through the display layer', () => {
    // The move is a relocation, not a redesign: everything that read a colour still gets one.
    for (const category of PRODUCT_CATEGORY_ORDER) {
      expect(CATEGORY_DISPLAY[category].color).toBe(CATEGORY_COLOR[category]);
      expect(categoryDisplay(category).color).toBe(CATEGORY_COLOR[category]);
    }
    expect(categoryDisplay(null).color).toBe(UNCATEGORISED_COLOR);
  });

  it('keeps café and restaurant far enough apart to tell apart at pin size', () => {
    /*
     * `facelift-plan.md` §1 finding 4, as an assertion rather than a note. The old pair sat at
     * CIEDE2000 14.8 while every other pair in the palette was 34–50, and 4 L* points apart, so a
     * 26px disc read as two shades of the same red. The floor below is deliberately well under the
     * palette's other pairs: brown-vs-brick cannot reach 34 without ceasing to be brown, and the
     * point of the test is to stop a *regression* toward confusable, not to demand a redesign.
     */
    const deltaE = ciede2000(CATEGORY_COLOR.restaurant, CATEGORY_COLOR.cafe);
    expect(deltaE).toBeGreaterThan(18);
    // Lightness is the axis that survives a 26px disc and a red-green deficiency; hue alone does
    // not. The old pair had 4 points of it.
    expect(Math.abs(lightness(CATEGORY_COLOR.restaurant) - lightness(CATEGORY_COLOR.cafe)))
      .toBeGreaterThan(8);
  });

  it('keeps every category pair distinguishable, not only the one that was broken', () => {
    const all = { ...CATEGORY_COLOR, uncategorised: UNCATEGORISED_COLOR };
    const names = Object.keys(all);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const [a, b] = [names[i] as string, names[j] as string];
        expect(
          ciede2000(all[a as keyof typeof all], all[b as keyof typeof all]),
          `${a} / ${b}`,
        ).toBeGreaterThan(18);
      }
    }
  });
});

/** sRGB hex to CIE L*a*b* (D65). */
function lab(hex: string): [number, number, number] {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(1), channel(3), channel(5)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function lightness(hex: string): number {
  return lab(hex)[0];
}

/**
 * CIEDE2000. Written out rather than pulled in, because adding a colour-science dependency for one
 * assertion is not a trade this repo makes — and because the formula is stable, so a local copy
 * cannot rot. Cross-checked against the values quoted in `palette.ts`'s header.
 */
function ciede2000(hexA: string, hexB: string): number {
  const [l1, a1, b1] = lab(hexA);
  const [l2, a2, b2] = lab(hexB);
  const rad = Math.PI / 180;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = (Math.atan2(b1, ap1) / rad + 360) % 360;
  const hp2 = (Math.atan2(b2, ap2) / rad + 360) % 360;
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = hp2 - hp1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);
  const lBar = (l1 + l2) / 2;
  const cpBar = (cp1 + cp2) / 2;
  let hBar = (hp1 + hp2) / 2;
  if (Math.abs(hp1 - hp2) > 180) hBar += 180;
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * rad) +
    0.24 * Math.cos(2 * hBar * rad) +
    0.32 * Math.cos((3 * hBar + 6) * rad) -
    0.2 * Math.cos((4 * hBar - 63) * rad);
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cpBar;
  const sH = 1 + 0.015 * cpBar * t;
  const rT =
    -2 *
    Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hBar - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH),
  );
}
