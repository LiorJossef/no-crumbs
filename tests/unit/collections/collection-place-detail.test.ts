/**
 * The privacy boundary of a place inside a collection, checked against the markup the component
 * actually produces rather than against a prop.
 *
 * This is the test that would fail under the obvious refactor. `CollectionPlaceDetail` now renders
 * `PlaceDetail` — the same component `/map` uses — and that component knows how to draw the
 * adder's note, their tags, their visit state, the TikTok they saved it from, the caption it
 * quoted, the model's sentence and the match certainty. None of that may reach a collaborator. The
 * assertions below feed a `CollectionPlace` whose *other* fields carry those very strings, so a
 * component that started reading them would print them and be caught.
 *
 * Rendered with `react-dom/server`: vitest runs in a `node` environment here, there is no jsdom
 * and no testing library, so nothing below can click. What is checked is what the server renders
 * on first paint — which is exactly where a leak would appear.
 *
 * The Server Action and `next/navigation` modules are mocked because importing them pulls in
 * `server-only` and the router context respectively. No assertion calls an action.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  removeCollectionItem: vi.fn(),
  removePlaceFromCollection: vi.fn(),
  saveCollectionPlace: vi.fn(),
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

const { CollectionPlaceDetail } = await import(
  '@/components/collections/collection-place-detail'
);

import type { CollectionPlace } from '@/app/collections/_lib/get-collections';
import type { CollectionRole } from '@/domain/collections/collection';

const PLACE: CollectionPlace = {
  itemId: 'item-1',
  placeId: 'place-1',
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  addressLine: '35 Peckham Rye',
  locality: 'London',
  note: 'Everyone: book ahead',
  position: 1,
  addedBy: 'user-2',
  addedByName: 'Dana',
  addedAt: '2026-08-20T12:00:00Z',
  savedByMe: false,
};

/**
 * Strings that exist only on the **adder's** `saved_places` row. They are not fields of
 * `CollectionPlace` at all — the query never selects them — so the honest statement of this test is
 * "no route from this component's props to these words exists". Listing them by value is still
 * worth doing: it is what catches a future edit that widens the query or reaches for a `Spot`.
 */
const PRIVATE_STRINGS: readonly string[] = [
  'Ask for the corner table', // the adder's private note
  'tiktok.com', // the adder's source link
  'Been here', // their visit state, as a control
  'Been', // …and as a badge
  'Your note',
  'Open TikTok',
  'Matched via',
  'Saved on',
  'Saved from',
  'Rename this place',
  'Remove from your places',
];

function render(role: CollectionRole = 'editor', overrides: Partial<CollectionPlace> = {}): string {
  return renderToStaticMarkup(
    createElement(CollectionPlaceDetail, {
      collectionId: 'collection-1',
      place: { ...PLACE, ...overrides },
      role,
      currentUserId: 'user-1',
      onBack: () => {},
    }),
  );
}

describe('CollectionPlaceDetail — what a collaborator may see', () => {
  it('shows the shared identity of the place', () => {
    const markup = render();
    expect(markup).toContain('Sycamore');
    expect(markup).toContain('Restaurant · London');
    expect(markup).toContain('35 Peckham Rye');
  });

  it('shows the shared note, who added it, and the two collection actions', () => {
    const markup = render();
    expect(markup).toContain('Shared note');
    expect(markup).toContain('Everyone: book ahead');
    expect(markup).toContain('Added by');
    expect(markup).toContain('Dana');
    expect(markup).toContain('Save to your places');
    expect(markup).toContain('Remove from this collection');
  });

  it('surfaces nothing from the adder’s own saved place', () => {
    const markup = render();
    for (const secret of PRIVATE_STRINGS) expect(markup).not.toContain(secret);
  });

  it('offers no control that writes to a saved place', () => {
    // The five writes the naive reuse would have aimed at `place.itemId`. `Category` is checked as
    // the editor's own label, which only that control renders.
    const markup = render();
    expect(markup).not.toContain('Rename this place');
    expect(markup).not.toContain('>Category<');
    expect(markup).not.toContain('Your note');
    expect(markup).not.toContain('Remove from your places');
    expect(markup).not.toContain('Add to a collection');
  });

  it('links out to Google Maps by name and address, with the wording of a lone action', () => {
    const markup = render();
    expect(markup).toContain('Open in Google Maps');
    expect(markup).toContain(encodeURIComponent('Sycamore, 35 Peckham Rye, London'));
  });

  it('says nothing about who added it when that was you', () => {
    // A twelve-row collection where every line reads "Added by you" is noise dressed as
    // information.
    expect(render('editor', { addedBy: 'user-1' })).not.toContain('Added by');
  });

  it('reports a place the caller already has instead of offering to save it again', () => {
    const markup = render('editor', { savedByMe: true });
    expect(markup).toContain('Already in your places');
    expect(markup).not.toContain('Save to your places');
  });

  it('gives a viewer no way to change the collection', () => {
    const markup = render('viewer');
    expect(markup).not.toContain('Remove from this collection');
    expect(markup).not.toContain('Add a shared note');
    // …but they still see the note somebody wrote, which is the point of a shared one.
    expect(markup).toContain('Everyone: book ahead');
  });

  it('draws exactly one way back, and it is the host’s own', () => {
    const markup = render();
    expect(markup).toContain('Back to the collection');
    // `PlaceDetail`'s own close affordance would be a second exit from one screen, and it would sit
    // inside the scrolling column rather than aligned with the collection list's back control.
    expect(markup).not.toContain('Close place detail');
  });
});
