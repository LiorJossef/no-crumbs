/**
 * The `＋` sheet's library matches.
 *
 * The first test is the one with a cost attached: **a blank query returns nothing**. `filterBySearch`
 * returns everything for a blank query, because it narrows a list already on screen; this function
 * builds one, and `AddPlacePane` renders whatever it is handed — so inheriting that rule would drop
 * the user's entire library under an empty field.
 *
 * Everything else here is really an assertion that no second matching rule was invented: the same
 * accent folding, the same token-AND, the same `Category · City` line the list rows print.
 */

import { describe, expect, it } from 'vitest';

import { libraryResults, LIBRARY_RESULT_LIMIT } from '@/components/add/library-results';
import type { MapPlace } from '@/components/map/types';
import type { Spot } from '@/domain/places/spot';

function spot(locality: string | null): Spot {
  return { locality } as unknown as Spot;
}

function mapPlace(
  id: string,
  name: string,
  overrides: Partial<MapPlace> & { locality?: string | null } = {},
): MapPlace {
  const { locality = 'Tel Aviv-Yafo', ...rest } = overrides;
  return {
    id,
    name,
    category: 'cafe',
    lat: 32.06,
    lng: 34.77,
    note: '',
    sourceUrl: undefined,
    visited: false,
    detail: spot(locality),
    ...rest,
  };
}

const LIBRARY: readonly MapPlace[] = [
  mapPlace('a', 'Café Florentin'),
  mapPlace('b', 'Nordoy Café'),
  mapPlace('c', 'The Laughing Yak', { category: 'restaurant', locality: 'London' }),
  mapPlace('d', 'Uncategorised somewhere', { category: null, locality: null }),
];

describe('libraryResults', () => {
  it('returns nothing for a blank field', () => {
    expect(libraryResults(LIBRARY, '')).toEqual([]);
    expect(libraryResults(LIBRARY, '   ')).toEqual([]);
  });

  it('matches without the accent the user did not type', () => {
    // `Café`/`cafe` is the defect `domain/places/search.ts` was created to fix, and this asserts the
    // sheet inherited the fix rather than growing its own `includes()`.
    expect(libraryResults(LIBRARY, 'cafe').map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('matches every token, in any order and anywhere in the row', () => {
    expect(libraryResults(LIBRARY, 'london yak').map((row) => row.id)).toEqual(['c']);
  });

  it('prints the same Category · City line the list rows print', () => {
    expect(libraryResults(LIBRARY, 'florentin')[0]).toEqual({
      id: 'a',
      name: 'Café Florentin',
      secondary: 'Café · Tel Aviv-Yafo',
    });
  });

  it('gives a place with neither a category nor a city a single-line row', () => {
    // `null`, not `''`: the pane renders the second line only when there is one, so an empty string
    // would hold space open under the name for a fact we do not have.
    expect(libraryResults(LIBRARY, 'somewhere')[0]?.secondary).toBeNull();
  });

  it('caps the shortlist so the manual-add row underneath stays reachable', () => {
    const many = Array.from({ length: LIBRARY_RESULT_LIMIT + 5 }, (_unused, index) =>
      mapPlace(`x${index}`, `Bistro ${index}`),
    );
    expect(libraryResults(many, 'bistro')).toHaveLength(LIBRARY_RESULT_LIMIT);
  });

  it('finds nothing when nothing matches, rather than falling back to everything', () => {
    expect(libraryResults(LIBRARY, 'zzzz nothing')).toEqual([]);
  });
});
