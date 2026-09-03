/**
 * A pin's name breaks where it changes direction, and nowhere the renderer would have chosen
 * (`src/components/map/label-lines.ts`).
 *
 * The bug these cover, in the owner's words on 2026-09-03: *"we have the same problem on the names
 * under the pins on the map"* — the one fixed for the summary pills the day before. On the pins it
 * is a different mechanism with the same symptom. MapLibre picks line breaks over the **logical**
 * string by width, and only then hands each line to the bidi plugin, which reorders that line on
 * its own. A name that is half Latin and half Hebrew therefore gets cut somewhere in the middle of
 * one of its halves, and the two lines no longer read in the order the name is written.
 *
 * Measured against the vendored plugin (`@mapbox/mapbox-gl-rtl-text@0.4.0`) driven directly:
 * `Black store-בלאק סטור תל אביב`, broken by width, comes back as `Black store-לת רוטס קאלב` over
 * `ביבא`. Broken at the direction boundary it comes back as `Black store-` over the whole Hebrew
 * name, correctly ordered.
 *
 * So the property asserted here is not "it looks right" — it is the one thing the renderer cannot
 * recover from: **no line of a pin label ever spans a direction boundary.** Everything else about
 * wrapping is still MapLibre's, because a break *inside* a single-direction run is harmless.
 */

import { describe, expect, it } from 'vitest';

import { directionRuns, pinLabelText } from '@/components/map/label-lines';
import { toPlaceFeatures } from '@/components/map/place-features';
import { pinHighlightLayerLayout, pinTextFieldExpression } from '@/components/map/marker-style';

/** The three shapes a mixed name comes in, all three taken from the owner's own library. */
const LATIN_FIRST = 'Black store-בלאק סטור תל אביב';
const HEBREW_FIRST = 'בית קפה יפני Kohi';
const HEBREW_TAIL = 'NOLA American Bakery נולה';

const RTL = /[֐-׿؀-ۿ]/u;
const LATIN = /[A-Za-z]/u;

describe('a mixed Hebrew/Latin pin label breaks at the direction boundary', () => {
  it('keeps the Latin head and the Hebrew tail on lines of their own', () => {
    expect(pinLabelText(LATIN_FIRST)).toBe('Black store-\nבלאק סטור תל אביב');
  });

  /** The hyphen is a neutral and belongs to the run before it. Sent to the next line instead it
   *  would be reordered into the Hebrew run and drawn at that line's *right* edge, which is a
   *  second wrong-looking label rather than a fix. */
  it('leaves a trailing hyphen with the Latin half', () => {
    expect(pinLabelText('Black store-בלאק')).toBe('Black store-\nבלאק');
  });

  it('handles a Hebrew-first name', () => {
    expect(pinLabelText(HEBREW_FIRST)).toBe('בית קפה יפני\nKohi');
  });

  it('handles a Hebrew tail after a long Latin head', () => {
    expect(pinLabelText(HEBREW_TAIL)).toBe('NOLA American Bakery\nנולה');
  });

  /** The space at the boundary is consumed by the break rather than becoming a leading space on
   *  the next line — MapLibre trims it per line anyway, but a line that is exactly its own text is
   *  what makes the centring the same for both. */
  it('does not carry the boundary space onto either line', () => {
    for (const line of pinLabelText(HEBREW_TAIL).split('\n')) {
      expect(line).toBe(line.trim());
      expect(line).not.toBe('');
    }
  });
});

describe('a single-script name is untouched', () => {
  it('leaves a Hebrew-only name exactly as it is, so MapLibre still wraps it by width', () => {
    const name = 'מסעדת הדגים של יוסי בתל אביב';
    expect(pinLabelText(name)).toBe(name);
  });

  it('leaves a Latin-only name exactly as it is', () => {
    const name = 'The Great American Bakery';
    expect(pinLabelText(name)).toBe(name);
  });

  /** Digits, punctuation and spaces are neutral, not a third direction: `Cafe 12` is one run and
   *  must not acquire a break it never needed. */
  it('does not treat digits or punctuation as a direction of their own', () => {
    expect(pinLabelText('Cafe 12 (Rothschild)')).toBe('Cafe 12 (Rothschild)');
    expect(pinLabelText('קפה 12')).toBe('קפה 12');
  });

  it('leaves an empty name alone', () => {
    expect(pinLabelText('')).toBe('');
  });
});

describe('the invariant, over every shape of name', () => {
  const NAMES = [
    LATIN_FIRST,
    HEBREW_FIRST,
    HEBREW_TAIL,
    'קפה לוינסקי 41 Levinsky Cafe',
    'Pizza פיצה Roma רומא',
    'מסעדת הדגים',
    'The Great American Bakery',
    'Cafe 12 (Rothschild)',
  ];

  /** The whole point. A line holding both scripts is a line the plugin will reorder into an order
   *  nobody wrote. */
  it('never puts two directions on one line', () => {
    for (const name of NAMES) {
      for (const line of pinLabelText(name).split('\n')) {
        expect([RTL.test(line), LATIN.test(line)].filter(Boolean).length).toBeLessThan(2);
      }
    }
  });

  /** And it is a re-wrapping, not a rewriting: the characters and their order are the name's, less
   *  the whitespace the break replaced. */
  it('preserves the name, in order', () => {
    for (const name of NAMES) {
      expect(pinLabelText(name).replace(/\s+/gu, '')).toBe(name.replace(/\s+/gu, ''));
    }
  });

  it('produces one run per change of direction and no empty ones', () => {
    expect(directionRuns('Pizza פיצה Roma רומא')).toEqual(['Pizza', 'פיצה', 'Roma', 'רומא']);
    expect(directionRuns('   ')).toEqual([]);
  });
});

describe('the layers draw the broken form', () => {
  it('stamps a label onto every feature and leaves the name intact', () => {
    const properties = toPlaceFeatures([
      {
        id: 'p1',
        name: LATIN_FIRST,
        category: 'cafe',
        visited: false,
        lat: 32.07,
        lng: 34.78,
        note: '',
        sourceUrl: undefined,
      },
    ]).features[0]?.properties;

    expect(properties?.name).toBe(LATIN_FIRST);
    expect(properties?.label).toBe('Black store-\nבלאק סטור תל אביב');
  });

  /** Both label-drawing layers, because the hovered pin is drawn by a second one and a fix that
   *  reached only the first would break the row↔pin coupling's promise that the map says the same
   *  name the row does. */
  it('reads `label` from the tiered pin layer and from the hover layer', () => {
    expect(JSON.stringify(pinTextFieldExpression())).toContain('["get","label"]');
    expect(JSON.stringify(pinTextFieldExpression())).not.toContain('["get","name"]');
    expect(pinHighlightLayerLayout(['Open Sans Regular'])['text-field']).toEqual(['get', 'label']);
  });
});
