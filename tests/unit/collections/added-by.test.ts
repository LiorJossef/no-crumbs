/**
 * The collection's added-by filter (round 3 §8.1) — the grouping and the ordering, which is all of
 * it that is not React.
 *
 * The point worth guarding is not that a filter filters; it is that an item with **no** recorded
 * adder keeps its own bucket instead of being attributed to somebody. `collection_items.added_by`
 * is nullable in `0024`, so that row is reachable, and folding it into a named person would be the
 * product inventing a fact about who put a place somewhere.
 */

import { describe, expect, it } from 'vitest';

import { NO_ADDER_LABEL, adderFilterIsUseful, addersIn } from '@/components/collections/added-by';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';

const ME = 'user-me';
const MAYA = 'user-maya';

function place(
  overrides: Partial<CollectionDetail['places'][number]> & { itemId: string },
): CollectionDetail['places'][number] {
  return {
    placeId: `place-${overrides.itemId}`,
    name: 'A place',
    category: null,
    lat: 0,
    lng: 0,
    addressLine: null,
    locality: null,
    note: null,
    position: 0,
    addedBy: ME,
    addedByName: null,
    addedAt: '2026-09-01T00:00:00Z',
    savedByMe: false,
    ...overrides,
  };
}

function collection(places: CollectionDetail['places']): CollectionDetail {
  return {
    id: 'c1',
    name: 'Weekend',
    description: null,
    ownerId: ME,
    role: 'owner',
    members: [],
    places,
    invite: null,
  };
}

describe('addersIn', () => {
  it('counts each person once and calls the viewer You', () => {
    const adders = addersIn(
      collection([
        place({ itemId: 'a', addedBy: ME }),
        place({ itemId: 'b', addedBy: MAYA, addedByName: 'Maya' }),
        place({ itemId: 'c', addedBy: MAYA, addedByName: 'Maya' }),
      ]),
      ME,
    );

    expect(adders).toEqual([
      { userId: MAYA, label: 'Maya', count: 2 },
      { userId: ME, label: 'You', count: 1 },
    ]);
  });

  it('puts the viewer first on a tie', () => {
    const adders = addersIn(
      collection([
        place({ itemId: 'a', addedBy: MAYA, addedByName: 'Maya' }),
        place({ itemId: 'b', addedBy: ME }),
      ]),
      ME,
    );

    expect(adders.map((adder) => adder.label)).toEqual(['You', 'Maya']);
  });

  it('keeps items with no recorded adder in their own bucket, never merged into a person', () => {
    const adders = addersIn(
      collection([
        place({ itemId: 'a', addedBy: ME }),
        place({ itemId: 'b', addedBy: null, addedByName: null }),
      ]),
      ME,
    );

    const unattributed = adders.find((adder) => adder.userId === null);
    expect(unattributed).toEqual({ userId: null, label: NO_ADDER_LABEL, count: 1 });
    expect(adders.find((adder) => adder.userId === ME)?.count).toBe(1);
  });

  it('is empty for an empty collection', () => {
    expect(addersIn(collection([]), ME)).toEqual([]);
  });
});

describe('adderFilterIsUseful', () => {
  it('stays off until two people have added something', () => {
    expect(adderFilterIsUseful([])).toBe(false);
    expect(adderFilterIsUseful([{ userId: ME, label: 'You', count: 9 }])).toBe(false);
    expect(
      adderFilterIsUseful([
        { userId: ME, label: 'You', count: 9 },
        { userId: MAYA, label: 'Maya', count: 1 },
      ]),
    ).toBe(true);
  });
});
