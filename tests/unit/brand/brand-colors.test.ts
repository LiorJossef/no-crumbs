/**
 * **The brand literals and the tokens must not drift.**
 *
 * `src/components/brand/brand-colors.ts` holds the values as literals, because four surfaces have
 * no stylesheet to read a custom property from: the static `icon.svg`, the rasterised
 * `apple-icon.png`, the satori-rendered `opengraph-image.tsx` and `global-error.tsx`, which
 * replaces the whole document. `src/app/globals.css` holds the same values as tokens, because
 * everything else in the product is themeable from there.
 *
 * The failure this catches is the quiet kind — the mint retuned on one side, an app icon one green
 * and the app it opens another, nothing failing anywhere. Same arrangement, same reasoning and the
 * same mechanism as `tests/unit/ui/palette-tokens.test.ts`, which does this for the map's palette.
 *
 * Source text, not rendering: `vitest.config.ts` runs in node and the CSS never meets a style
 * engine. What is being asserted *is* that two files contain the same characters.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BRAND_HAIRLINE,
  BRAND_INK,
  BRAND_INK_MUTED,
  BRAND_INK_ON_MINT,
  BRAND_MINT,
  BRAND_MINT_DEEP,
  BRAND_SURFACE,
} from '@/components/brand/brand-colors';

const GLOBALS = fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url));

/** Every `--name: value` in `:root`, with `var(--other)` chains followed to the literal. */
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

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--mint-400', BRAND_MINT],
  ['--ink-on-mint', BRAND_INK_ON_MINT],
  ['--brand', BRAND_MINT_DEEP],
  ['--background', BRAND_SURFACE],
  ['--foreground', BRAND_INK],
  ['--muted-foreground', BRAND_INK_MUTED],
  ['--border', BRAND_HAIRLINE],
];

describe('the brand literals', () => {
  const tokens = rootTokens();

  it.each(PAIRS)('%s matches its literal', (token, literal) => {
    expect(tokens.get(token)?.toUpperCase()).toBe(literal.toUpperCase());
  });

  it('carries no gold', () => {
    // `brand-and-product-foundation.md` §3.1 rule 3: toast-gold is refused as a brand colour
    // because it sits a few degrees from the café category amber, and on this map colour means
    // *what a place is*. Mint is the only brand colour; gold belongs to the mascot alone; the two
    // never share a surface. Every value here is mint, ink or paper.
    const source = readFileSync('src/components/brand/brand-colors.ts', 'utf8');
    for (const hex of source.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
      const red = Number.parseInt(hex.slice(1, 3), 16);
      const blue = Number.parseInt(hex.slice(5, 7), 16);
      // Gold is warm: red well above blue. Mint, ink and this product's paper never are by more
      // than the paper's own two points of warmth.
      expect(red - blue, `${hex} is a warm colour on a brand surface`).toBeLessThan(24);
    }
  });
});
