/**
 * Two rules from `docs/ux-collections-as-scope.md`, held in markup.
 *
 * §3 / §5 item 3 — **no unlabelled back-shaped arrow at layer 0.** The collection list's header
 * leads with the product's kicker, and the kicker *is* the up-link: it says where it goes
 * (`Collections`), it is not called "Back", and it stands in the slot the arrow used to hold.
 *
 * §2.2 — **at most one back-shaped control on screen at any moment.** Inside a collection the
 * place detail already draws one in its header, so the add-to-a-collection picker must not draw a
 * second; on `/map`, where the host affordance is an `×`, it keeps its own.
 *
 * Rendered with `react-dom/server` — vitest is a `node` environment here, with no DOM to press.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/collections/c1',
}));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  removeCollectionItem: vi.fn(),
  removeMember: vi.fn(),
  removePlaceFromCollection: vi.fn(),
  saveCollectionPlace: vi.fn(),
  updateCollection: vi.fn(),
  updateCollectionItemNote: vi.fn(),
}));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));

const { CollectionContent } = await import('@/components/collections/collection-content');
const { CollectionPicker, HostedPaneBackContext } = await import(
  '@/components/collections/add-to-collection'
);
const { CollectionsContext } = await import('@/ui/place/collections-context');

import type { CollectionDetail } from '@/app/collections/_lib/get-collections';

const COLLECTION: CollectionDetail = {
  id: 'c1',
  name: 'Tel Aviv',
  description: null,
  ownerId: 'u1',
  role: 'owner',
  members: [{ userId: 'u1', displayName: 'You', role: 'owner', joinedAt: '2026-01-01' }],
  places: [],
  invite: null,
};

function listMarkup(): string {
  return renderToStaticMarkup(
    createElement(CollectionContent, {
      collection: COLLECTION,
      currentUserId: 'u1',
      library: [],
      pins: [],
      view: 'list' as const,
      onViewChange: () => {},
      selectedItemId: null,
      onSelectItem: () => {},
    }),
  );
}

describe('the collection list header', () => {
  it('leads with a labelled up-link to the index, not a back arrow', () => {
    const markup = listMarkup();
    expect(markup).toContain('href="/collections"');
    expect(markup).toContain('aria-label="Collections"');
    expect(markup).toContain('Collection');
  });

  it('names no control "Back"', () => {
    expect(listMarkup()).not.toMatch(/aria-label="[^"]*Back/i);
  });

  it('keeps the options menu in the same row, trailing', () => {
    expect(listMarkup()).toContain('aria-label="Collection options"');
  });
});

describe('the add-to-a-collection picker', () => {
  function picker(hosted: boolean): string {
    const tree = createElement(
      CollectionsContext,
      { value: { collections: [], byPlaceId: {} } },
      createElement(CollectionPicker, { placeId: 'p1', onBack: () => {} }),
    );
    return renderToStaticMarkup(
      hosted
        ? createElement(HostedPaneBackContext, { value: { setBack: () => {} } }, tree)
        : tree,
    );
  }

  it('draws its own back control when nothing else does', () => {
    expect(picker(false)).toContain('aria-label="Back to the place"');
  });

  it('draws none when the host already has one on screen', () => {
    expect(picker(true)).not.toContain('aria-label="Back to the place"');
  });
});
