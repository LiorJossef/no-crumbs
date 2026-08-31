/**
 * Two rules from `docs/ux-collections-as-scope.md`, held in markup.
 *
 * §3 / §5 item 3 — **no unlabelled back-shaped arrow at layer 0.** That rule was written when the
 * only way out of a collection was inside its own header, and §5 item 3's answer was a kicker that
 * *was* the up-link — `‹ COLLECTION`, saying where it went rather than saying "Back".
 *
 * **The up-link is gone, and the rule it served is stronger for it** (owner, 2026-08-31). The
 * drawer's `Places / Collections` switch sits directly above this header and its `Collections`
 * segment reaches the same index, so the kicker had become a second control for one destination
 * ~44 px above itself. Layer 0 now carries **no** back-shaped control at all, which is what §3 was
 * reaching for; the assertion below is therefore an absence rather than a shape.
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
  it("carries no way out of its own, because the drawer's switch is the way out", () => {
    const markup = listMarkup();
    // No link to the index from inside the header, by either URL — the search-param one or the
    // redirect shim. `map-shell.tsx`'s `DrawerViewSwitch` is the only control that leaves.
    expect(markup).not.toContain('href="/map?view=collections"');
    expect(markup).not.toContain('href="/collections"');
    expect(markup).not.toContain('aria-label="Collections"');
  });

  it('names no control "Back", and draws no arrow where one used to be', () => {
    const markup = listMarkup();
    expect(markup).not.toMatch(/aria-label="[^"]*Back/i);
    // `lucide-chevron-left` was the class on the deleted up-link's glyph. §3's original complaint
    // was an unlabelled arrow at layer 0; this is that complaint, checked directly.
    expect(markup).not.toContain('lucide-chevron-left');
  });

  it("keeps the options menu, now on the heading's own row", () => {
    const markup = listMarkup();
    expect(markup).toContain('aria-label="Collection options"');
    // The 44px target survives the move. Deleting the link alone would have recovered no height at
    // all — this button is `size-11`, so the row it used to share kept its height either way.
    expect(markup).toContain('size-11');
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
