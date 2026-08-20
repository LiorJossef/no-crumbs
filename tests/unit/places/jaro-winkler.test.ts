/**
 * The DuckDB equivalence test. This is the one test in the milestone that is not checking our
 * arithmetic against our intention — it checks it against the *measurement*, because the prototype's
 * `jw()` was DuckDB's `jaro_winkler_similarity` and every number in `06` §6.3 came out of it.
 *
 * `docs/evidence/places/jaro-winkler-duckdb.json` is a committed table produced by
 * `measure-jaro-winkler.py` against DuckDB 1.5.5. It holds every whole-string and token pair the
 * 44-case benchmark actually evaluated, 30 hand-picked adversarial pairs, and 1 500 seeded fuzz
 * pairs over Latin, Hebrew and CJK. The comparison is `===` on doubles, not `toBeCloseTo`: at the
 * benchmark's 0.000-margin cases one ulp decides which row a user sees first, and a tolerance here
 * would let a re-implementation drift precisely where drift matters.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { jaroSimilarity, jaroWinklerSimilarity } from '@/domain/places/jaro-winkler';

interface Pair {
  readonly a: string;
  readonly b: string;
  /** Python `repr()` of the double DuckDB returned — 17 significant digits, i.e. exact. */
  readonly jw: string;
  readonly jaro: string;
}

const table = JSON.parse(
  readFileSync('docs/evidence/places/jaro-winkler-duckdb.json', 'utf8'),
) as { readonly duckdb_version: string; readonly pairs: readonly Pair[] };

describe('jaro-winkler vs DuckDB', () => {
  it('has a table big enough to be evidence', () => {
    // Guards against the file being truncated or regenerated with a smaller pair set, which would
    // turn a green test into no test at all.
    expect(table.pairs.length).toBeGreaterThan(2000);
    expect(table.duckdb_version).toMatch(/^\d+\./);
  });

  it('reproduces every DuckDB value bit for bit', () => {
    const divergent: string[] = [];
    for (const pair of table.pairs) {
      const jaro = jaroSimilarity(pair.a, pair.b);
      const jw = jaroWinklerSimilarity(pair.a, pair.b);
      if (jaro !== Number(pair.jaro) || jw !== Number(pair.jw)) {
        divergent.push(
          `${JSON.stringify(pair.a)} vs ${JSON.stringify(pair.b)}: ` +
            `jaro ${jaro} (duckdb ${pair.jaro}), jw ${jw} (duckdb ${pair.jw})`,
        );
      }
    }
    expect(divergent).toEqual([]);
  });
});

describe('the four behaviours the port had to measure rather than assume', () => {
  it('counts UTF-8 bytes, not characters', () => {
    // (1 + 15/22 + 1)/3 on byte lengths. On character lengths (5 and 8) this is 0.875.
    expect(jaroSimilarity('猿田彦珈琲', '猿田彦珈琲 渋谷')).toBe(0.8939393939393939);
    // (1 + 21/24 + 1)/3. On characters (11 and 14) it would be 0.9285714285714286.
    expect(jaroSimilarity('קפה לוינסקי', 'קפה לוינסקי 41')).toBe(0.9583333333333334);
  });

  it('floor-divides the transposition count, which can be odd', () => {
    // Three order-mismatched matched bytes: t = 1, not 1.5. With 1.5 this is 0.6722222222222222.
    expect(jaroSimilarity('port said', 'potion bar')).toBe(0.7000000000000001);
  });

  it('gates the prefix boost at 0.7 and caps the prefix at four bytes', () => {
    // Four-byte common prefix, but Jaro is below the gate: no boost at all.
    expect(jaroSimilarity('abcdefgh', 'abcdxxxx')).toBe(0.6666666666666666);
    expect(jaroWinklerSimilarity('abcdefgh', 'abcdxxxx')).toBe(0.6666666666666666);
    // Just above the gate: the full four-byte boost.
    expect(jaroWinklerSimilarity('abcdefg', 'abcdxxx')).toBe(0.8285714285714286);
    // Six-byte common prefix, boosted as if it were four.
    expect(jaroWinklerSimilarity('abcdefgh', 'abcdefzz')).toBe(0.9);
  });

  it('fuses the boost multiply-add, so the last bit matches', () => {
    // The plain `jaro + prefix*0.1*(1 - jaro)` gives 0.8049999999999999 here — one ulp low.
    expect(jaroWinklerSimilarity('brat', 'basta')).toBe(0.805);
    expect(jaroWinklerSimilarity('cofee', 'cafe')).toBe(0.805);
  });
});

describe('degenerate inputs', () => {
  it('scores the empty string 0, including against itself', () => {
    expect(jaroWinklerSimilarity('', '')).toBe(0);
    expect(jaroWinklerSimilarity('', 'cafe')).toBe(0);
    expect(jaroWinklerSimilarity('cafe', '')).toBe(0);
  });

  it('scores one-character strings without a negative match window', () => {
    expect(jaroWinklerSimilarity('a', 'a')).toBe(1);
    expect(jaroWinklerSimilarity('a', 'b')).toBe(0);
  });

  it('scores a two-character swap 0, because the window is 0 and not 1', () => {
    expect(jaroWinklerSimilarity('ab', 'ba')).toBe(0);
  });

  it('is symmetric on the pairs the scorer feeds it in one direction only', () => {
    for (const [a, b] of [
      ['glitch coffee roasters', 'glitch coffee and roasters'],
      ['פלאפל', 'פלאפל הקוסם'],
      ['a', 'ab'],
    ] as const) {
      expect(jaroWinklerSimilarity(a, b)).toBe(jaroWinklerSimilarity(b, a));
    }
  });
});
