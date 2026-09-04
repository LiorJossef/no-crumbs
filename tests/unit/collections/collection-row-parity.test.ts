/**
 * A collection's rows carry the same facts as the library's — for the caller's own places, and
 * deliberately not for anybody else's.
 *
 * `PlaceRow` is already shared between `/map`'s list and a collection's, so nothing about the
 * *component* diverged. What diverged was its input: a collection pin is built from a `places` row
 * alone (`collections-scope.tsx`'s `toMapPlace`) and carries no `detail`, which is where the row
 * reads the photo, the tags, the locality and the saved-ago line from. `withMySavedDetail` folds
 * the caller's own saved row back in, and these are the two halves of what it may and may not do.
 *
 * The privacy half is the load-bearing one. Migration `0024` opens exactly one read path into a
 * shared collection and it returns `places`; another member's tags, note, photo and `visit_state`
 * have no policy that would return them. So a row for a place the caller has not saved must stay
 * exactly as poor as it is — that is the correct rendering, not a gap.
 */

import { describe, expect, it, vi } from 'vitest';

import type { MapPlace } from '@/components/map/map-surface';
import type { EnrichedSpot } from '@/ui/place/enrichment';

// `collection-content.tsx` reaches its Server Actions module, which is `server-only`; importing it
// under vitest's `node` environment throws before a single assertion runs. Nothing below calls one.
vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  removeCollectionItem: vi.fn(),
  removeCollectionItems: vi.fn(),
  removePlaceFromCollection: vi.fn(),
  saveCollectionPlace: vi.fn(),
  updateCollection: vi.fn(),
  updateCollectionItemNote: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  updateDisplayName: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { savedByPlaceId, withMySavedDetail } = await import(
  '@/components/collections/collection-content'
);

const MY_SPOT: EnrichedSpot = {
  id: 'saved-9',
  placeId: 'place-1',
  name: 'Sycamore',
  displayNameOverride: null,
  canonicalName: 'Sycamore',
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 51.47,
  lng: -0.07,
  addressLine: '35 Peckham Rye',
  locality: 'London',
  note: 'Ask for the corner table',
  visitState: 'visited',
  visitedAt: new Date('2026-08-01T00:00:00Z'),
  savedAt: new Date('2026-08-20T12:00:00Z'),
  tags: ['italian'],
  whyGo: null,
  dishes: [],
};

/** The caller's own library row, as `toMapPlace` builds it. */
const MINE: MapPlace = {
  id: 'saved-9',
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  note: 'Ask for the corner table',
  sourceUrl: 'https://www.tiktok.com/@a/video/1',
  visited: true,
  savedPlaceId: 'saved-9',
  detail: MY_SPOT,
};

/** A collection pin: the item id as `id`, the shared note, and no `detail` at all. */
const PIN: MapPlace = {
  id: 'item-1',
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  note: 'Everyone: book ahead',
  sourceUrl: undefined,
  visited: false,
};

/** The same row with its `Spot` removed — a `MapPlace` not built from one, which is what every
 *  collection pin is. */
function withoutDetail(place: MapPlace): MapPlace {
  const copy: { detail?: unknown } = { ...place };
  delete copy.detail;
  return copy as MapPlace;
}

describe('savedByPlaceId', () => {
  it('addresses the caller’s library by the place identity a collection item points at', () => {
    expect(savedByPlaceId([MINE]).get('place-1')).toBe(MINE);
  });

  it('skips a row with no place identity behind it', () => {
    expect(savedByPlaceId([withoutDetail(MINE)]).size).toBe(0);
  });
});

describe('withMySavedDetail', () => {
  it('gives the row the caller’s own detail and visit state', () => {
    const row = withMySavedDetail(PIN, MINE);

    // The photo, the tags, the locality and the saved-ago line all hang off `detail`.
    expect(row.detail).toBe(MY_SPOT);
    expect(row.visited).toBe(true);
  });

  it('keeps the collection’s own identity and shared facts', () => {
    const row = withMySavedDetail(PIN, MINE);

    // The item id is what every control on the screen addresses a row by.
    expect(row.id).toBe('item-1');
    expect(row.note).toBe('Everyone: book ahead');
    expect(row.name).toBe('Sycamore');
    // Not a write target: the detail view reached from this row finds its own saved row.
    expect(row.savedPlaceId).toBeUndefined();
  });

  it('leaves another member’s place exactly as poor as it was', () => {
    expect(withMySavedDetail(PIN, undefined)).toBe(PIN);
  });

  it('folds in nothing from a library row that carries no detail', () => {
    expect(withMySavedDetail(PIN, withoutDetail(MINE))).toBe(PIN);
  });
});
