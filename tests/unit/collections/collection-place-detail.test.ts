/**
 * A place inside a collection, in both of its cases, checked against the markup the component
 * actually produces rather than against a prop.
 *
 * `CollectionPlaceDetail` renders `PlaceDetail` — the same component `/map` uses — which knows how
 * to draw a private note, tags, visit state, the TikTok a place was saved from, the caption it
 * quoted, the model's sentence and the match certainty. Whether any of that appears turns on one
 * thing: **whose `saved_places` row is in hand.**
 *
 *  - **Not the viewer's** (`library` holds no row for this place): none of it may appear, and no
 *    control that writes to a saved place may render. The assertions feed a `CollectionPlace`
 *    whose *other* fields carry those very strings, so a component that started reading them would
 *    print them and be caught.
 *  - **The viewer's own**: all of it must appear, and every write must be aimed at that row's id —
 *    never at `itemId` (a collection item) or `placeId` (a shared place). `PlaceDetail`'s
 *    `savedPlace` prop is captured on the way through so the id is asserted directly, because a
 *    saved-place id reaches the markup only through controls that are not rendered on first paint.
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

/**
 * `PlaceDetail`, wrapped rather than replaced: the real component still renders (every markup
 * assertion below is against its real output), and the `savedPlace` object it was handed is
 * recorded on the way past. That object is the one thing this screen can get catastrophically
 * wrong and still look right — an `itemId` in it aims five writes at a row nobody owns — and it
 * never reaches the DOM, so there is nothing in the markup to assert on.
 */
const captured = vi.hoisted(() => ({ savedPlace: [] as unknown[] }));

vi.mock('@/components/sheet/place-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/sheet/place-sheet')>();
  return {
    ...actual,
    PlaceDetail: (props: Parameters<typeof actual.PlaceDetail>[0]) => {
      captured.savedPlace.push(props.savedPlace);
      return createElement(actual.PlaceDetail, props);
    },
  };
});

const { CollectionPlaceDetail } = await import(
  '@/components/collections/collection-place-detail'
);
const { BOTTOM_NAV_HEIGHT_PX } = await import('@/components/nav/bottom-nav-metrics');

import type { CollectionPlace } from '@/app/collections/_lib/get-collections';
import type { CollectionRole } from '@/domain/collections/collection';
import type { MapPlace } from '@/components/map/map-surface';
import type { Spot } from '@/domain/places/spot';

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
  'Open on TikTok',
  'Matched via',
  'Saved on',
  'Saved from',
  'Rename this place',
  'Remove from your places',
];

/**
 * The viewer's **own** save of the same place — `saved_places` id `saved-9`, deliberately unlike
 * both `item-1` and `place-1` so a regression to either is visible in one assertion.
 *
 * Its note is the viewer's own words, not the adder's: reusing the adder's string here would make
 * the two cases indistinguishable in the markup, which is the only thing these tests can read.
 */
const MY_SPOT: Spot = {
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
  note: 'Sit at the counter',
  sourceUrl: 'https://www.tiktok.com/@someone/video/900',
  visitState: 'visited',
  visitedAt: new Date('2026-08-01T09:00:00Z'),
  savedAt: new Date('2026-07-01T09:00:00Z'),
};

const MINE: MapPlace = {
  id: MY_SPOT.id,
  name: MY_SPOT.name,
  category: MY_SPOT.category,
  lat: MY_SPOT.lat,
  lng: MY_SPOT.lng,
  note: MY_SPOT.note ?? '',
  sourceUrl: MY_SPOT.sourceUrl,
  visited: true,
  detail: MY_SPOT,
};

/** Somebody else's place, in the viewer's library — a non-empty library that still holds no row
 *  for `place-1`, so "not mine" is tested against a real library rather than against `[]`. */
const SOMEWHERE_ELSE: MapPlace = {
  ...MINE,
  id: 'saved-other',
  name: 'Kudu',
  sourceUrl: undefined,
  visited: false,
  detail: { ...MY_SPOT, id: 'saved-other', placeId: 'place-2', name: 'Kudu' },
};

function render(
  role: CollectionRole = 'editor',
  overrides: Partial<CollectionPlace> = {},
  library: readonly MapPlace[] = [SOMEWHERE_ELSE],
): string {
  captured.savedPlace.length = 0;
  return renderToStaticMarkup(
    createElement(CollectionPlaceDetail, {
      collectionId: 'collection-1',
      place: { ...PLACE, ...overrides },
      role,
      currentUserId: 'user-1',
      library,
      onBack: () => {},
      // The sheet's answer, which is the mount this file is about. Required and undefaulted for the
      // same reason `savedPlace` is: this component is in the document twice at once — the sheet,
      // where `BottomNav` floats over the last 68 px, and the `lg+` panel, where it does not render
      // — and a component that guessed would be wrong on one of them.
      floatingBarPx: BOTTOM_NAV_HEIGHT_PX,
    }),
  );
}

/** The same screen, for a place the viewer has in their own library. `savedByMe` is set because
 *  that is what the real query returns when the row exists — the two must agree. */
function renderMine(overrides: Partial<CollectionPlace> = {}, own: MapPlace = MINE): string {
  return render('editor', { savedByMe: true, ...overrides }, [SOMEWHERE_ELSE, own]);
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

  it('surfaces nothing from the adder’s own saved place, for a place the viewer does not have', () => {
    // Scoped to that case on purpose. When the row *is* the viewer's own, several of these strings
    // must appear — see the sibling below. The boundary is "not your row", never "not this screen".
    const markup = render();
    for (const secret of PRIVATE_STRINGS) expect(markup).not.toContain(secret);
  });

  it('offers no control that writes to a saved place, for a place the viewer does not have', () => {
    // The five writes the naive reuse would have aimed at `place.itemId`. `Category` is checked as
    // the editor's own label, which only that control renders.
    const markup = render();
    expect(markup).not.toContain('Rename this place');
    expect(markup).not.toContain('>Category<');
    expect(markup).not.toContain('Your note');
    expect(markup).not.toContain('Remove from your places');
    expect(markup).not.toContain('Add to a collection');
  });

  it('hands `PlaceDetail` no saved-place row when the viewer has none', () => {
    render();
    expect(captured.savedPlace.at(-1)).toBeNull();
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
    // `savedByMe` with no matching library row — the row exists but was not handed to this screen.
    // The inert line is still the honest thing to say, because nothing here can act on that row.
    const markup = render('editor', { savedByMe: true });
    expect(markup).toContain('Already in your places');
    expect(markup).not.toContain('Save to your places');
  });

  /**
   * **The empty shared note is the same one control the standard card wears** (lane B2-T3,
   * 2026-09-02).
   *
   * It used to be a bordered panel holding a `SHARED NOTE` kicker, a pencil link and a line of
   * prose reading `Nothing yet — everyone here will see what you write.`, while the private note
   * on `PlaceDetail` answered the identical state with one dashed `Add a note` pill. Round 3's
   * §1.6/§11.1 is exactly that: one object rendered as two, on two screens a user moves between.
   *
   * The *shared* qualifier stays in the words — a shared note and a private one have different
   * audiences, and flattening that would be a lie rather than a unification. Only the shape is
   * shared, through `ADD_NOTE_PILL`.
   */
  it('answers an empty shared note with one offer, not a panel about nothing', () => {
    const markup = render('editor', { note: null });
    expect(markup).toContain('Add a shared note');
    // The three things the panel used to spend on saying a field is empty.
    expect(markup).not.toContain('Nothing yet');
    expect(markup).not.toContain('Shared note<');
    expect(markup).toContain('border-dashed');
  });

  it('still draws the full section once there is a note to read', () => {
    // The offer replaces the *empty* state only. A written shared note keeps its kicker and its
    // `Edit`, because then there is something for a heading to name.
    const markup = render();
    expect(markup).toContain('Shared note');
    expect(markup).toContain('Everyone: book ahead');
    expect(markup).not.toContain('Add a shared note');
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

/**
 * The other half of R1: a place the viewer saved themselves is *their* place, wherever they opened
 * it from. Everything asserted here was previously suppressed unconditionally, which is the defect
 * the ruling names — the viewer's own note, been mark, category and TikTok hidden from the viewer.
 */
describe('CollectionPlaceDetail — a place the viewer saved themselves', () => {
  it('shows their own note, been mark, category control and TikTok', () => {
    const markup = renderMine();
    // The toggle's accessible name, which names the place as well as the state.
    expect(markup).toContain('Been, Sycamore');
    expect(markup).toContain('Your note');
    expect(markup).toContain('Sit at the counter');
    expect(markup).toContain('>Category<');
    expect(markup).toContain('Open on TikTok');
    expect(markup).toContain('tiktok.com/@someone/video/900');
  });

  it('aims every write at the saved-place id, never at the collection item or the place', () => {
    renderMine();
    const savedPlace = captured.savedPlace.at(-1) as { id: string; visited: boolean; visitedAt?: Date };
    expect(savedPlace).toEqual({
      id: 'saved-9',
      visited: true,
      visitedAt: MY_SPOT.visitedAt,
    });
    // Said twice, and deliberately: these are the two ids on this screen that would look plausible
    // and destroy somebody else's row.
    expect(savedPlace.id).not.toBe('item-1');
    expect(savedPlace.id).not.toBe('place-1');
  });

  it('omits `visitedAt` rather than passing it undefined when the row carries no timestamp', () => {
    // `0006`'s CHECK allows a visited row with no timestamp, and `exactOptionalPropertyTypes` makes
    // "absent" the only honest shape for it.
    const withoutTimestamp: Spot = Object.fromEntries(
      Object.entries(MY_SPOT).filter(([field]) => field !== 'visitedAt'),
    ) as Spot;
    renderMine({}, { ...MINE, detail: withoutTimestamp });
    expect(captured.savedPlace.at(-1)).toEqual({ id: 'saved-9', visited: true });
  });

  it('drops the save control, because the been toggle now holds that position', () => {
    const markup = renderMine();
    expect(markup).not.toContain('Already in your places');
    expect(markup).not.toContain('Save to your places');
  });

  /**
   * The bar's height reaches the card it is about, and not by way of a constant typed here.
   *
   * Measured before it was wired, at 390×844 and at maximum scroll: `Remove from this collection`
   * — the assertion two tests below is about the same control — came to rest at y 770–814 against
   * a `BottomNav` occupying 776–844, with five of five hit-test points across its width returning
   * an element the button did not contain. This is a rendering rather than a source read because
   * the failure was a *value not arriving*, and only the markup can say that it does.
   */
  it('spends the floating bar’s height on its scroll column', () => {
    const markup = renderMine();
    expect(markup).toContain(`--floating-bar:${BOTTOM_NAV_HEIGHT_PX}px`);
    // And the height is actually consumed, rather than the variable sitting in the style unread.
    expect(markup).toContain('var(--floating-bar,0px)');
    // `scroll-padding-bottom` is deliberately gone. It parked a scrollIntoView above a covered
    // edge; the column's box now ends ABOVE the bar, so there is no covered edge left and 68px of
    // scroll padding would over-scroll by its own height inside a 326px column.
    expect(markup).not.toContain('scroll-padding-bottom');
  });

  it('still adds what the collection contributes, and nothing is reordered away', () => {
    const markup = renderMine();
    expect(markup).toContain('Added by');
    expect(markup).toContain('Dana');
    expect(markup).toContain('Shared note');
    expect(markup).toContain('Everyone: book ahead');
    expect(markup).toContain('Remove from this collection');
    // Still the host's own back control, and still only one way out.
    expect(markup).toContain('Back to the collection');
    expect(markup).not.toContain('Close place detail');
  });
});
