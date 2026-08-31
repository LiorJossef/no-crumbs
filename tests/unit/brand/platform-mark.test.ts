/**
 * **The platform mark: the seam that makes the trademark ruling a one-file change, and the fence
 * on the two pigments the measurement refused.**
 *
 * Whether TikTok's own mark may be drawn in this product is a terms question and it is open. The
 * shape that makes either answer cheap is one component every surface consumes, and the half of
 * that promise a docblock cannot keep is here: **no screen draws a platform glyph of its own.**
 *
 * The colour half is the same discipline `chrome-tokens.test.ts` applies to the mascot gold —
 * *build the fence before the pigment* — with one difference worth stating, because it is the whole
 * finding: **there is no pigment to fence.** Measured with this repository's own instruments,
 * neither TikTok brand colour can enter the system at all, so the fence guards a value that never
 * arrives rather than one that arrives with conditions. It exists because the next author reaching
 * for "the TikTok colour" will reach for exactly these two hexes.
 *
 * The instruments are copied rather than imported: `ciede2000`/`lab` from
 * `tests/unit/ui/palette-tokens.test.ts` and the Machado, Oliveira & Fernandes (2009) matrices from
 * `tests/unit/map/basemap-night.test.ts`, both of which state why they are written out. Copying a
 * third time is the cost of `vitest.config.ts` collecting `*.test.ts` only; the drift risk is
 * covered by the fact that all three reproduce the figures already quoted in `palette.ts`.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PlatformMark } from '@/components/brand/platform-mark';
import { BRAND_MINT } from '@/components/brand/brand-colors';
import { CATEGORY_COLOR, CATEGORY_COLOR_DARK } from '@/ui/place/palette';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

/** TikTok's two published brand colours. Quoted here and **nowhere in `src/`** — this file is the
 *  one place in the repository they are allowed to be written, because it is the place that
 *  forbids them. */
const TIKTOK_CYAN = '#25F4EE';
const TIKTOK_RED = '#FE2C55';

/**
 * **Comments blanked, line numbers kept** — `token-call-sites.test.ts`'s `withoutComments`, and its
 * ruling with it: *a guard asserting that a thing is not used should strip comments.* Four guards
 * in this repository have been fooled by prose, and this one made it five on its first run: the
 * `Link2` assertion below failed on the two comments that explain **why `Link2` was removed**,
 * which is the exact failure mode that teaches authors to stop naming things in comments.
 *
 * Narrow on purpose: block comments (which covers the JSX `{...}` form) and `//` to end of line,
 * with `//` left alone after a `:` or a quote so a `https://` inside a string survives.
 */
function withoutComments(source: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
}

function sources(extensions: readonly string[]): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => extensions.some((ext) => name.endsWith(ext)))
    .map((name) => ({ path: name, source: withoutComments(readFileSync(SRC + name, 'utf8')) }));
}

describe('the mark itself', () => {
  it('draws in currentColor and nothing else, which is what makes it theme-blind by construction', () => {
    /*
     * The property the swap depends on. A mark that carried its own pigment would have to be
     * re-measured against every surface it lands on, in both themes; one that inherits is correct
     * on all of them by not having an opinion. It is also what keeps it out of `K12`'s hex budget
     * and out of `token-call-sites.test.ts`'s white/black pigment list.
     */
    const markup = renderToStaticMarkup(createElement(PlatformMark, { className: 'size-4' }));
    for (const value of markup.matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
      expect(value[1], markup).toMatch(/^(?:currentColor|none)$/);
    }
    expect(markup).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
  });

  it('is decorative, on every surface, with no label of its own', () => {
    /*
     * Every call site names TikTok in words beside it — `Add a TikTok`, `Open TikTok`,
     * `@handle's TikTok`. A mark that announced itself would be a second claim about the same
     * fact, and the brief's constraint is that the mark may not assert anything the words do not:
     * not endorsement, not verification, not a relationship with TikTok.
     */
    const markup = renderToStaticMarkup(createElement(PlatformMark, {}));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/<title|role="img"|aria-label/);
  });

  it('records which treatment rendered, so a screenshot can be read back', () => {
    const markup = renderToStaticMarkup(createElement(PlatformMark, {}));
    expect(markup).toMatch(/data-platform-mark="(?:neutral|tiktok)"/);
  });
});

describe('one file, every surface', () => {
  it('leaves no chain-link glyph standing in for the platform', () => {
    /*
     * The defect this package exists to fix, as a ratchet at zero. `Link2` was the mark on the
     * paste kicker, the rail kicker and the three source-row thumbnail fallbacks — five surfaces
     * describing the only platform the product supports as "a link".
     *
     * `Link2Off` is deliberately not matched and is still in use: on the failure screens it means
     * *this link is broken*, which is a statement about a link and not a stand-in for a platform.
     */
    const offenders = sources(['.tsx', '.ts'])
      .filter(({ source }) => /(?<![\w])Link2(?![\w])/.test(source))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('has every platform glyph coming from the one module', () => {
    /*
     * What makes the open terms question cost one file. A surface that inlined its own `<svg>` for
     * the platform would survive every other assertion here and would be the second place the
     * ruling has to be applied — and the second place is the one nobody finds.
     */
    const importers = sources(['.tsx'])
      .filter(({ source }) => /PlatformMark/.test(source))
      .map(({ path, source }) => ({ path, source }));
    // The component's own file, plus its consumers. Six at the time of writing; the assertion is
    // that each of them reaches the mark by import rather than by drawing one.
    expect(importers.length).toBeGreaterThan(1);
    for (const { path, source } of importers) {
      if (path === 'components/brand/platform-mark.tsx') continue;
      expect(source, path).toContain("from '@/components/brand/platform-mark'");
      expect(source, path).not.toMatch(/data-platform-mark/);
    }
  });
});

describe('the pigment fence', () => {
  it('has neither TikTok brand colour anywhere in src/, in any notation', () => {
    /*
     * By value, not by name — the shape `chrome-tokens.test.ts` settled on for the mascot gold,
     * because a pasted hex in a paint expression mentions no brand. Hex and `rgb()` are the two
     * notations that appear in this codebase; `token-call-sites.test.ts`'s `pigmentOf` states the
     * same boundary and the same reason for drawing it where it is.
     *
     * `.css` as well as `.ts`/`.tsx`: `globals.css` is the whole token layer, and a
     * `--platform-tiktok` declared there would be the pigment entering through the one door the
     * component-level guards cannot see.
     */
    const targets = [TIKTOK_CYAN, TIKTOK_RED].map(asRgb);
    const found: string[] = [];
    for (const { path, source } of sources(['.tsx', '.ts', '.css'])) {
      const literals = [
        ...source.matchAll(/#[0-9A-Fa-f]{6}\b/g),
        ...source.matchAll(/\brgba?\(\s*\d+[\s,]+\d+[\s,]+\d+/g),
      ];
      for (const literal of literals) {
        const rgb = parseLoose(literal[0]);
        if (rgb && targets.some((t) => t.every((c, i) => c === rgb[i]))) {
          found.push(`${path}: ${literal[0]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('reproduces the measurement the fence rests on, so the docblock cannot rot away from it', () => {
    /*
     * The numbers `platform-mark.tsx` quotes, recomputed. This is the arrangement `palette.ts` and
     * `chrome-tokens.test.ts` already use: a comment that quotes a measurement is only trustworthy
     * with something tying it to the values it was measured from. If the house mint or the
     * restaurant category moves, this fails and the docblock is updated in the same commit —
     * including, if the numbers ever climb above the floors, the argument for the fence itself.
     *
     * The floors named in the comments are this repository's own: **18** for a normal-vision pair
     * (`palette-tokens.test.ts`) and **7** under simulated colour-vision deficiency
     * (`basemap-night.test.ts`).
     */
    expect(ciede2000(TIKTOK_CYAN, BRAND_MINT)).toBeCloseTo(10.0, 1);
    expect(cvdDelta(TIKTOK_CYAN, BRAND_MINT, 'deutan')).toBeCloseTo(7.8, 1);
    expect(cvdDelta(TIKTOK_CYAN, BRAND_MINT, 'protan')).toBeCloseTo(5.1, 1);

    expect(ciede2000(TIKTOK_RED, CATEGORY_COLOR_DARK.restaurant)).toBeCloseTo(13.4, 1);
    expect(cvdDelta(TIKTOK_RED, CATEGORY_COLOR_DARK.restaurant, 'deutan')).toBeCloseTo(3.2, 1);
    expect(ciede2000(TIKTOK_RED, CATEGORY_COLOR.restaurant)).toBeCloseTo(14.1, 1);
    expect(cvdDelta(TIKTOK_RED, CATEGORY_COLOR.restaurant, 'deutan')).toBeCloseTo(6.8, 1);

    // The clause that is not about hue at all: cyan on the product's one saturated surface.
    expect(contrast(TIKTOK_CYAN, BRAND_MINT)).toBeCloseTo(1.03, 2);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Instruments. See this file's header for where each comes from and why it is copied.
 * ------------------------------------------------------------------------------------------- */

function asRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** A hex or the head of an `rgb()`/`rgba()` call, as channel bytes. `null` for anything else. */
function parseLoose(literal: string): [number, number, number] | null {
  if (literal.startsWith('#')) return asRgb(literal);
  const parts = literal.match(/\d+/g);
  return parts && parts.length >= 3
    ? (parts.slice(0, 3).map(Number) as [number, number, number])
    : null;
}

function toHex(rgb: readonly number[]): string {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/** sRGB hex to CIE L*a*b* (D65). */
function lab(hex: string): [number, number, number] {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(1), channel(3), channel(5)] as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

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
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

/** Machado, Oliveira & Fernandes (2009) at severity 1.0. **The matrices operate on linear RGB** —
 *  applied to gamma-encoded sRGB the same pair scores more than twice as far apart. */
const MACHADO = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const;

function simulateCvd(hex: string, kind: keyof typeof MACHADO): string {
  const lin = asRgb(hex).map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  const out = MACHADO[kind].map((row) => row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!);
  return toHex(
    out.map((v) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, c)) * 255);
    }),
  );
}

function cvdDelta(a: string, b: string, kind: keyof typeof MACHADO): number {
  return ciede2000(simulateCvd(a, kind), simulateCvd(b, kind));
}

/** WCAG contrast ratio, for the clause that is about legibility rather than about hue. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channels = asRgb(hex)
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
