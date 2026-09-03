/**
 * Two rules from `docs/ux-collections-as-scope.md`, held in markup.
 *
 * §3 / §5 item 3, **amended 2026-09-02** — **no back-shaped control at layer 0 at all.** The
 * collection list's header now opens with the collection's name, and the `⋯` options button sits
 * trailing on that same row. There is no kicker row and no `Collections` up-link.
 *
 * **That link was deleted for one commit on 2026-08-31 and restored, and this assertion was one of
 * the three records that got it back — because the spec had not moved.** It has now: §5 item 3
 * carries the amendment and the measurement (44 px, and the difference between 0 and 1 fully
 * visible list rows at 390×844 at `half`). The drawer's `Places / Collections` switch reaches the
 * same index from directly above this header, with the same `/map?view=collections` href, so
 * nothing is trapped. These assertions are inverted rather than deleted: the up-link's absence is
 * now the rule, and a silently reintroduced one would be a regression nobody would catch.
 *
 * §2.2 — **at most one back-shaped control on screen at any moment.** From 2026-09-03 the
 * add-to-a-collection picker opens as an inline panel under its own field row rather than
 * replacing the detail pane, so it navigates nowhere and draws no back control on either host.
 * The rule is held by construction; what is asserted below is that construction.
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
const { CollectionPicker } = await import('@/components/collections/add-to-collection');
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
  it('draws no up-link and no second route to the index', () => {
    const markup = listMarkup();
    // The link and its whole row are gone (§5 item 3, amended 2026-09-02). The drawer's view
    // switch — rendered by `map-shell.tsx`, above this header — is the one control with this href,
    // and it is not part of this component's markup.
    expect(markup).not.toContain('href="/map?view=collections"');
    expect(markup).not.toContain('aria-label="Collections"');
  });

  it('leads with the collection’s own name', () => {
    // The heading is the first thing in the header now, and the scope is what it names.
    expect(listMarkup()).toContain('<bdi>Tel Aviv</bdi>');
  });

  it('names no control "Back"', () => {
    expect(listMarkup()).not.toMatch(/aria-label="[^"]*Back/i);
  });

  it('keeps the options menu, trailing, on the heading’s row', () => {
    const markup = listMarkup();
    expect(markup).toContain('aria-label="Collection options"');
    // The move is the point: on its own row the `size-11` button held 44 px open, so deleting the
    // link alone would have recovered nothing. The heading and the button share one flex row, so
    // the heading's markup opens before the button's and no element separates them.
    const heading = markup.indexOf('<bdi>Tel Aviv</bdi>');
    const options = markup.indexOf('aria-label="Collection options"');
    expect(heading).toBeGreaterThan(-1);
    expect(options).toBeGreaterThan(heading);
    expect(markup.slice(heading, options)).not.toContain('<div');
  });
});

/**
 * The overwhelm audit's §7 item 14, held where it was deleted.
 *
 * The description is a real string the owner wrote and it still ships — on the index row that
 * opens the collection (`collections-index-list.tsx`, `line-clamp-1`), which is where it does its
 * work. Drawing it a second time at `line-clamp-3` directly above the first place put up to three
 * lines of prose between the user and the list, on the one surface that had no fully-visible row to
 * spare. §4d's rule: one place per string.
 */
describe('the collection list header’s text', () => {
  function describedMarkup(): string {
    return renderToStaticMarkup(
      createElement(CollectionContent, {
        collection: { ...COLLECTION, description: 'Everything worth the walk from the beach.' },
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

  it('does not repeat the description the index row already carries', () => {
    expect(describedMarkup()).not.toContain('Everything worth the walk from the beach.');
  });

  it('still lets the description be edited, which is a different surface', () => {
    // The `⋯` menu's edit form owns the string; only the header's read-only copy went.
    expect(describedMarkup()).toContain('aria-label="Collection options"');
  });
});

describe('the add-to-a-collection picker', () => {
  function picker(): string {
    return renderToStaticMarkup(
      createElement(
        CollectionsContext,
        { value: { collections: [], byPlaceId: {} } },
        createElement(CollectionPicker, { placeId: 'p1' }),
      ),
    );
  }

  // §2.2 held by construction from 2026-09-03: the picker opens as an inline panel under its own
  // field row instead of replacing the detail pane, so it navigates nowhere and draws no back
  // control on either host. The rule it was protecting — at most one back-shaped control on
  // screen — can no longer be broken here, and this asserts the mechanism rather than the symptom.
  it('draws no back control on any host, because it navigates nowhere', () => {
    const markup = picker();
    expect(markup).not.toContain('aria-label="Back to the place"');
    expect(markup).not.toMatch(/aria-label="[^"]*Back/i);
  });

  it('draws no heading of its own — the row above the panel is the title', () => {
    expect(picker()).not.toContain('Add to…');
  });
});
