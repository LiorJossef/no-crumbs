/**
 * `PlaceDetail`'s write boundary, rendered to static markup with `react-dom/server` — the only
 * rendering this repo's unit setup can do (vitest runs in a `node` environment, there is no jsdom
 * and no testing library, and `vitest.config.ts` collects `*.test.ts` only, so components are
 * driven through `createElement` rather than JSX).
 *
 * **What these tests are for.** `PlaceDetail` grew a second host — a place inside a collection —
 * and every one of its six mutation controls used to take the row it writes to from `place.id`.
 * On `/collections/[id]` that id is a *collection item*, so the obvious reuse would have pointed
 * five writes at a row the caller does not own. `savedPlaceId` is now a required, undefaulted prop
 * and each control is gated on it; the first block below is what fails if any of those gates is
 * removed, and it is deliberately written as "none of the six", not "the note is missing".
 *
 * The Server Action modules are mocked because importing them pulls in
 * `@/app/_lib/supabase/server`, which imports `server-only` — a package that throws by design
 * outside a React Server Component. No assertion here calls an action.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  removePlaceFromCollection: vi.fn(),
}));

const { PlaceDetail } = await import('@/components/sheet/place-sheet');
const { CollectionsContext } = await import('@/ui/place/collections-context');

import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { Spot } from '@/domain/places/spot';

/** A real `Spot` — the caller's own save, joined to the place. Declared as its own const so the
 *  fixture is checked against the read path's type rather than against the narrower one
 *  `PlaceDetail` accepts. */
const OVERLAY: Spot = {
  id: 'saved-1',
  placeId: 'place-1',
  name: 'Sycamore',
  displayNameOverride: null,
  canonicalName: 'Sycamore Vino Cucina',
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 51.47,
  lng: -0.07,
  addressLine: '35 Peckham Rye',
  locality: 'London',
  note: 'Ask for the corner table',
  reason: 'the best pasta in Peckham',
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  visitState: 'want_to_go',
  savedAt: new Date('2026-08-01T10:00:00Z'),
};

/** A place with a full private overlay, so an assertion that something is absent is about the gate
 *  and never about the fixture having forgotten the field. */
const SAVED: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: OVERLAY,
};

/** The same saved place with no overlay at all — a `MapPlace` built by a mock surface, and the
 *  fixture that proves the gate is the prop rather than the presence of `detail`. */
const SAVED_WITHOUT_OVERLAY: DetailPlace = {
  name: SAVED.name,
  category: SAVED.category,
  lat: SAVED.lat,
  lng: SAVED.lng,
  sourceUrl: SAVED.sourceUrl,
};

/** The same place seen by somebody with no `saved_places` row for it — the collection's shape. */
const UNSAVED: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: undefined,
  detail: { placeId: 'place-1', addressLine: '35 Peckham Rye', locality: 'London' },
};

/** Every control in `PlaceDetail` that writes, by a string only that control puts on screen. The
 *  sixth (`AddToCollection`) needs a provider, which `render` supplies. */
const MUTATION_CONTROLS: readonly string[] = [
  'Rename this place', // NameEditor's trigger
  'Been here', // BeenToggle
  'Add to a collection', // AddToCollection
  'Category', // CategoryEditor
  'Your note', // NoteEditor
  'Remove from your places', // RemoveSavedPlace
];

function render(
  place: DetailPlace,
  savedPlace: { readonly id: string; readonly visited: boolean; readonly visitedAt?: Date } | null,
  extra: { primaryAction?: string; footer?: string; variant?: 'sheet' | 'hosted' } = {},
): string {
  return renderToStaticMarkup(
    createElement(
      CollectionsContext.Provider,
      { value: { collections: [], byPlaceId: {} } },
      createElement(PlaceDetail, {
        place,
        savedPlace,
        onClose: () => {},
        ...(extra.variant ? { variant: extra.variant } : {}),
        ...(extra.primaryAction
          ? { primaryAction: createElement('p', null, extra.primaryAction) }
          : {}),
        ...(extra.footer ? { footer: createElement('p', null, extra.footer) } : {}),
      }),
    ),
  );
}

describe('PlaceDetail — the write boundary', () => {
  it('renders every mutation control when the caller names its own saved row', () => {
    const markup = render(SAVED, { id: 'saved-1', visited: false });
    for (const control of MUTATION_CONTROLS) expect(markup).toContain(control);
  });

  it('renders none of them when the caller has no saved row', () => {
    // The naive reuse this guards against rendered all six and aimed five of them at `place.id`.
    const markup = render(UNSAVED, null);
    for (const control of MUTATION_CONTROLS) expect(markup).not.toContain(control);
  });

  it('still renders the place itself with no saved row', () => {
    // "No controls" must not have been bought by rendering nothing: the shared facts are the whole
    // point of the read-only screen.
    const markup = render(UNSAVED, null);
    expect(markup).toContain('Sycamore');
    expect(markup).toContain('35 Peckham Rye');
    expect(markup).toContain('London');
  });

  it('gates on the prop alone, not on there being a detail overlay to read', () => {
    // The other half of the pair. Above, a full overlay with `savedPlaceId={null}` renders no
    // control; here, no overlay at all with a row named renders them anyway — so the gate is the
    // prop and nothing else. `Add to a collection` is the one exception and honestly so: it needs
    // the shared `places` id, which only the overlay carries.
    const markup = render(SAVED_WITHOUT_OVERLAY, { id: 'saved-1', visited: false });
    for (const control of MUTATION_CONTROLS) {
      if (control === 'Add to a collection') continue;
      expect(markup).toContain(control);
    }
  });
});

describe('PlaceDetail — the slots', () => {
  it('renders the primary action and the footer a host passes', () => {
    const markup = render(UNSAVED, null, {
      primaryAction: 'Save to your places',
      footer: 'Remove from this collection',
    });
    expect(markup).toContain('Save to your places');
    expect(markup).toContain('Remove from this collection');
    // The footer is last: it is the host's statement about its own container, below everything
    // this view says about the place.
    expect(markup.indexOf('Save to your places')).toBeLessThan(
      markup.indexOf('Remove from this collection'),
    );
  });

  it('draws no close control at `hosted`, and does at `sheet`', () => {
    expect(render(UNSAVED, null, { variant: 'hosted' })).not.toContain('Close place detail');
    expect(render(UNSAVED, null)).toContain('Close place detail');
  });
});

describe('PlaceDetail — the Google Maps link', () => {
  it('is a bare noun beside Open on TikTok, and names the action when it is alone', () => {
    // Beside a second destination the pair reads as a list; alone, a bare noun stops looking like
    // something to press. Same fact drives its target size, which a static string cannot check.
    const paired = render(SAVED, { id: 'saved-1', visited: false });
    expect(paired).toContain('Open on TikTok');
    expect(paired).toContain('>Google Maps<');
    expect(paired).not.toContain('Open in Google Maps');

    const alone = render(UNSAVED, null);
    expect(alone).not.toContain('Open on TikTok');
    expect(alone).toContain('Open in Google Maps');
  });
});

describe('PlaceDetail — when the been mark was made', () => {
  it('says the month beside the toggle once the place is marked been', () => {
    // `visited_at` has been selected, mapped and typed since the mark shipped and rendered
    // nowhere. This is the one surface that says it — a per-row date was declined on purpose
    // (`location-certainty.ts`), and this is the detail, not the row.
    const markup = render(SAVED, {
      id: 'saved-1',
      visited: true,
      visitedAt: new Date('2026-08-24T10:00:00Z'),
    });
    expect(markup).toContain('Marked as been in August');
  });

  it('says nothing when the row is marked but carries no timestamp', () => {
    // Allowed by `0006`'s CHECK, so it is a row that exists rather than a defensive branch.
    const markup = render(SAVED, { id: 'saved-1', visited: true });
    expect(markup).not.toContain('Marked as been');
  });

  it('says nothing on a place that is not marked been', () => {
    // The date and the state cannot disagree in the database; a date under a button reading
    // `Been here` would be the screen contradicting itself.
    const markup = render(SAVED, {
      id: 'saved-1',
      visited: false,
      visitedAt: new Date('2026-08-24T10:00:00Z'),
    });
    expect(markup).toContain('Been here');
    expect(markup).not.toContain('Marked as been');
  });

  it('says nothing to a caller with no saved row of its own', () => {
    // The collection host sees somebody else's place: their visit is not a fact it may show.
    expect(render(UNSAVED, null)).not.toContain('Marked as been');
  });
});
