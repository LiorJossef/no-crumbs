import { describe, expect, it } from 'vitest';

import { keywordCountryCode, resolveCountry, type CountryRow } from '@/domain/search/country-match';

/**
 * **Stage 2's country slice, against `nls-plan.md` §5.6.**
 *
 * The fixture mirrors the live local library measured on 2026-09-04 — 36 rows in `IL`, 18 in `GB`,
 * 5 in `CZ`, 1 in `HU` — shortened, plus the case the live library does **not** currently have: a
 * row carrying no country code at all. §5.6 requires those to be reported rather than silently
 * dropped, and a criterion that is vacuous on today's data is exactly the one that needs a test.
 */
const LIBRARY: readonly CountryRow[] = [
  { id: 'il-1', countryCode: 'IL' },
  { id: 'il-2', countryCode: 'IL' },
  { id: 'il-3', countryCode: 'il' },
  { id: 'gb-1', countryCode: 'GB' },
  { id: 'gb-2', countryCode: 'GB' },
  { id: 'cz-1', countryCode: 'CZ' },
  { id: 'hu-1', countryCode: 'HU' },
  { id: 'none-1', countryCode: null },
  { id: 'none-2', countryCode: '' },
];

describe('§5.6 — `in Italy` and `באיטליה` agree', () => {
  /** Italy is the plan's example and this library has nothing in it, so the two agree by both
   *  producing **no filter** — which is also §5.6's "a country the user has nothing in produces no
   *  filter and no flight". */
  it('both resolve to IT and both then decline, because nothing is saved there', () => {
    expect(keywordCountryCode('Italy')).toBe('IT');
    expect(keywordCountryCode('באיטליה')).toBe('IT');
    expect(resolveCountry('Italy', LIBRARY)).toBeNull();
    expect(resolveCountry('באיטליה', LIBRARY)).toBeNull();
  });

  /** The same pair over a country the library *does* hold, so the agreement is shown on a match
   *  and not only on two nulls. */
  it('`Israel` and `בישראל` return the identical set', () => {
    const english = resolveCountry('Israel', LIBRARY);
    const hebrew = resolveCountry('בישראל', LIBRARY);
    expect(english?.memberIds).toEqual(['il-1', 'il-2', 'il-3']);
    expect(hebrew?.memberIds).toEqual(english?.memberIds);
    expect(hebrew?.code).toBe('IL');
  });

  it('spans the spellings `toCountryCode` already knows, in both languages', () => {
    const gb = ['United Kingdom', 'England', 'Britain', 'uk', 'בריטניה', 'אנגליה'];
    for (const query of gb) {
      expect(resolveCountry(query, LIBRARY)?.memberIds, query).toEqual(['gb-1', 'gb-2']);
    }
    expect(resolveCountry('Czechia', LIBRARY)?.code).toBe('CZ');
    expect(resolveCountry('צ׳כיה', LIBRARY)?.code).toBe('CZ');
    expect(resolveCountry('Hungary', LIBRARY)?.code).toBe('HU');
    expect(resolveCountry('הונגריה', LIBRARY)?.code).toBe('HU');
  });

  it('folds a stored lower-case code onto the same country', () => {
    expect(resolveCountry('Israel', LIBRARY)?.memberIds).toContain('il-3');
  });
});

describe('§5.6 — rows with no country code are reported, not dropped', () => {
  it('counts them, and the count is the same whichever country resolved', () => {
    expect(resolveCountry('Israel', LIBRARY)?.unplaceable).toBe(2);
    expect(resolveCountry('England', LIBRARY)?.unplaceable).toBe(2);
  });

  it('never puts them in a country’s answer', () => {
    const israel = resolveCountry('Israel', LIBRARY);
    expect(israel?.memberIds).not.toContain('none-1');
    expect(israel?.memberIds).not.toContain('none-2');
  });

  it('is 0 on a library where every row is placed', () => {
    expect(resolveCountry('Israel', LIBRARY.slice(0, 3))?.unplaceable).toBe(0);
  });
});

describe('a country the user has nothing in produces no filter and no flight', () => {
  it.each(['Italy', 'Japan', 'יפן', 'Kenya', 'איטליה'])('“%s” is null', (query) => {
    expect(resolveCountry(query, LIBRARY)).toBeNull();
  });

  it('and an empty library resolves nothing at all', () => {
    expect(resolveCountry('Israel', [])).toBeNull();
  });
});

describe('what is deliberately not a country', () => {
  /**
   * `toCountryCode` accepts a bare alpha-2 code because its own caller is a model asked for a
   * country. Here the input is a fragment of a sentence, and essentially every two-letter English
   * word is somebody's ISO code. Accepting them would turn the commonest words in the language
   * into a geography filter on any library holding a row there.
   */
  it.each(['it', 'in', 'at', 'no', 'is', 'be', 'to', 'me', 'IT', 'IL', 'GB'])(
    '“%s” is a word, not a country',
    (query) => {
      expect(keywordCountryCode(query)).toBeNull();
    },
  );

  it('keeps the two short forms a person actually writes', () => {
    expect(keywordCountryCode('uk')).toBe('GB');
    expect(keywordCountryCode('US')).toBe('US');
  });

  it.each(['pizza', 'שניצל', 'Kyoto', 'Tel Aviv', 'London', '', '   ', '🍕'])(
    '“%s” resolves to nothing',
    (query) => {
      expect(keywordCountryCode(query)).toBeNull();
    },
  );

  it('takes null and undefined', () => {
    expect(keywordCountryCode(null)).toBeNull();
    expect(keywordCountryCode(undefined)).toBeNull();
    expect(resolveCountry(null, LIBRARY)).toBeNull();
  });
});

describe('the Hebrew preposition fused onto a country name', () => {
  it('strips a single ב / ל / מ when the whole word does not resolve', () => {
    expect(keywordCountryCode('באיטליה')).toBe('IT');
    expect(keywordCountryCode('לאיטליה')).toBe('IT');
    expect(keywordCountryCode('מאיטליה')).toBe('IT');
    expect(keywordCountryCode('בישראל')).toBe('IL');
    expect(keywordCountryCode('ביפן')).toBe('JP');
  });

  it('tries the full word first, so a country whose own name starts with one is itself', () => {
    // `בהוטן` is Bhutan; stripping first would look for `הוטן`.
    expect(keywordCountryCode('בהוטן')).toBe('BT');
  });

  it('does not invent a country out of an ordinary word starting with one', () => {
    for (const word of ['בורקס', 'בוקר', 'לחם', 'מסעדה', 'בירה']) {
      expect(keywordCountryCode(word), word).toBeNull();
    }
  });

  it('strips exactly one letter, never two', () => {
    expect(keywordCountryCode('בבאיטליה')).toBeNull();
  });
});

describe('the label is the product’s own name for the country', () => {
  it('is `toCountryName`, the same string the flag disc and the Elsewhere row use', () => {
    expect(resolveCountry('בישראל', LIBRARY)?.label).toBe('Israel');
    expect(resolveCountry('אנגליה', LIBRARY)?.label).toBe('United Kingdom');
  });
});
