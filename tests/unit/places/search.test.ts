/**
 * `domain/places/search.ts` — text search over saved places (`L1-F6-T2`).
 *
 * The fixtures below are the **real local library**, names and all: `Café Florentin` and
 * `Nordoy Café` are why this file exists at all (the field was reported as not finding accented
 * places), and `Tel Aviv` / `Tel Aviv-Yafo` are two spellings of one city that genuinely coexist in
 * the database because they came from different resolutions.
 */

import { describe, expect, it } from 'vitest';

import {
  filterBySearch,
  isSearchActive,
  matchesSearchTokens,
  toSearchHaystack,
  toSearchTokens,
  type SearchablePlace,
} from '@/domain/places/search';

interface Row extends SearchablePlace {
  readonly name: string;
}

const LIBRARY: readonly Row[] = [
  { name: 'Café Florentin', category: 'cafe', locality: 'Tel Aviv-Yafo', note: null },
  { name: 'Nordoy Café', category: 'cafe', locality: 'Tel Aviv-Yafo', note: 'roof terrace' },
  { name: 'HaKosem', category: 'restaurant', locality: 'Tel Aviv', note: null },
  { name: 'Anat Bakery', category: 'bakery', locality: 'Tel Aviv-Yafo', note: null },
  { name: 'Container', category: 'bar', locality: 'Tel Aviv-Yafo', note: null },
  { name: 'La Nonna Brixton', category: 'restaurant', locality: 'London', note: null },
  { name: 'Sycamore Vino Cucina', category: 'restaurant', locality: 'London', note: null },
  { name: 'The Laughing Yak', category: 'restaurant', locality: 'London', note: 'go with Dana' },
  { name: 'MBER London', category: 'restaurant', locality: 'London', note: null },
];

const namesMatching = (query: string): readonly string[] =>
  filterBySearch(LIBRARY, query, (row) => row).map((row) => row.name);

describe('isSearchActive', () => {
  it('treats an empty or whitespace-only field as no filter at all', () => {
    expect(isSearchActive('')).toBe(false);
    expect(isSearchActive('   ')).toBe(false);
    expect(isSearchActive('\n\t')).toBe(false);
  });

  it('treats anything the user actually typed as a filter', () => {
    expect(isSearchActive('c')).toBe(true);
    // Even a query that will normalise away to nothing is *active* — the user typed something, and
    // the "Nothing matches …" copy is the honest response. See `filterBySearch` below.
    expect(isSearchActive('...')).toBe(true);
  });
});

describe('accents — the reason this exists', () => {
  it('finds an accented name from an unaccented query', () => {
    expect(namesMatching('cafe florentin')).toEqual(['Café Florentin']);
  });

  it('finds an accented name from the accented query too', () => {
    expect(namesMatching('café florentin')).toEqual(['Café Florentin']);
  });

  it('does not care where the accent sits in the word', () => {
    expect(namesMatching('nordoy cafe')).toEqual(['Nordoy Café']);
  });
});

describe('what it searches', () => {
  it('searches the category, so a plain "cafe" is a category filter', () => {
    expect(namesMatching('cafe')).toEqual(['Café Florentin', 'Nordoy Café']);
  });

  it('searches the city', () => {
    expect(namesMatching('london')).toEqual([
      'La Nonna Brixton',
      'Sycamore Vino Cucina',
      'The Laughing Yak',
      'MBER London',
    ]);
  });

  it('matches both spellings of one city, because the database holds both', () => {
    expect(namesMatching('tel aviv')).toEqual([
      'Café Florentin',
      'Nordoy Café',
      'HaKosem',
      'Anat Bakery',
      'Container',
    ]);
  });

  it('searches the user’s own note', () => {
    expect(namesMatching('dana')).toEqual(['The Laughing Yak']);
  });

  it('does not search anything the row does not display', () => {
    // `reason` (the model's sentence about the post) is carried on the read model but is not in the
    // searchable projection, on purpose: a row that matched on it would look like a bug on screen.
    const withReason = { name: 'Somewhere', reason: 'the best hummus in the city' };
    expect(toSearchHaystack(withReason)).toBe('somewhere');
  });
});

describe('the matching rule', () => {
  it('requires every token, so typing more only ever narrows', () => {
    expect(namesMatching('london')).toHaveLength(4);
    expect(namesMatching('london restaurant')).toHaveLength(4);
    expect(namesMatching('london nonna')).toEqual(['La Nonna Brixton']);
    expect(namesMatching('london cafe')).toEqual([]);
  });

  it('does not care about token order', () => {
    expect(namesMatching('aviv tel')).toEqual(namesMatching('tel aviv'));
    expect(namesMatching('nonna london')).toEqual(namesMatching('london nonna'));
  });

  it('matches inside a word, not only at its start', () => {
    expect(namesMatching('nonna')).toEqual(['La Nonna Brixton']);
    expect(namesMatching('kosem')).toEqual(['HaKosem']);
  });

  it('ignores case', () => {
    expect(namesMatching('HAKOSEM')).toEqual(['HaKosem']);
  });

  it('treats punctuation as a separator, so a hyphenated city still matches', () => {
    expect(namesMatching('aviv-yafo')).toEqual(namesMatching('aviv yafo'));
    expect(namesMatching('aviv-yafo')).toHaveLength(4);
  });

  it('collapses runs of whitespace rather than producing empty tokens', () => {
    expect(toSearchTokens('  tel    aviv  ')).toEqual(['tel', 'aviv']);
  });

  it('never matches a token across a field boundary', () => {
    // "anat" + "bakery" join as "anat bakery"; a single token can never span the join, because a
    // token is what splitting on whitespace produced and the separator is whitespace.
    // "bakery" appears twice here and that is correct — it is both half the name and the category.
    const row = LIBRARY[3]!;
    expect(toSearchHaystack(row)).toBe('anat bakery bakery tel aviv yafo');
    expect(matchesSearchTokens(row, ['anatbakery'])).toBe(false);
    expect(matchesSearchTokens(row, ['anat', 'bakery'])).toBe(true);
    // ...and the join between the last name token and the first city token is not crossable either.
    expect(matchesSearchTokens(row, ['bakerytel'])).toBe(false);
  });
});

describe('the edges', () => {
  it('returns the input array itself for a blank query, so nothing downstream churns', () => {
    expect(filterBySearch(LIBRARY, '', (row) => row)).toBe(LIBRARY);
    expect(filterBySearch(LIBRARY, '   ', (row) => row)).toBe(LIBRARY);
  });

  it('matches nothing for a query that is entirely punctuation', () => {
    // The alternative — showing the whole library — reads on screen as a broken search box.
    expect(namesMatching('...')).toEqual([]);
    expect(namesMatching('&&&')).toEqual([]);
  });

  it('handles a place with no category, city or note', () => {
    const bare: readonly SearchablePlace[] = [{ name: 'Somewhere' }];
    expect(filterBySearch(bare, 'somewhere', (row) => row)).toHaveLength(1);
    expect(filterBySearch(bare, 'cafe', (row) => row)).toHaveLength(0);
    expect(toSearchHaystack(bare[0]!)).toBe('somewhere');
  });

  it('handles nulls without inventing an empty token', () => {
    expect(toSearchHaystack({ name: 'X', category: null, locality: null, note: null })).toBe('x');
  });

  it('searches an empty library without complaint', () => {
    expect(filterBySearch([], 'anything', (row: SearchablePlace) => row)).toEqual([]);
  });

  it('matches everything when asked with no tokens, which is the caller’s decision to avoid', () => {
    expect(matchesSearchTokens(LIBRARY[0]!, [])).toBe(true);
  });
});
