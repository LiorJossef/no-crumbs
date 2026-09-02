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

/** `NoteEditor` reads as two different controls depending on whether there is a note to read:
 *  `Your note` + `Edit` when there is one, a single compact `Add a note` when there is not (lane
 *  B-T3). It is one control either way, so it is matched as one rather than being left out. */
const NOTE_CONTROL = /Your note|Add a note/;

/** Every control in `PlaceDetail` that writes, by a string only that control puts on screen. The
 *  fifth (`AddToCollection`) needs a provider, which `render` supplies; `NOTE_CONTROL` above is
 *  the sixth. */
const MUTATION_CONTROLS: readonly string[] = [
  // `Rename this place` was the sixth until 2026-09-02, when the pencil left the UI (lane B-T4).
  // `saved_places.display_name` and `updateSavedPlaceName` are untouched, so this list is the
  // record of what the *card* can write, not of what the row can hold.
  'Been here', // BeenToggle
  'Add to a collection', // AddToCollection
  'Category', // CategoryEditor
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
    expect(markup).toMatch(NOTE_CONTROL);
  });

  it('renders none of them when the caller has no saved row', () => {
    // The naive reuse this guards against rendered all six and aimed five of them at `place.id`.
    const markup = render(UNSAVED, null);
    for (const control of MUTATION_CONTROLS) expect(markup).not.toContain(control);
    expect(markup).not.toMatch(NOTE_CONTROL);
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
    expect(markup).toMatch(NOTE_CONTROL);
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

describe('PlaceDetail — the action row', () => {
  it('names both destinations to a screen reader and shows the destination alone on the pill', () => {
    // The pills replaced two text links and a full-width block (lane B-T1). The visible label is
    // the destination — the mark and the arrow already say *this leaves the product* — and the
    // ratified sentence survives where it costs no width, in the accessible name.
    const paired = render(SAVED, { id: 'saved-1', visited: false });
    expect(paired).toContain('aria-label="Open on TikTok"');
    // The TikTok pill is the icon-only one — 288 px of desktop popover does not fit three worded
    // pills — so the ratified sentence has to be on `title` as well, or a hovering pointer gets a
    // glyph and nothing else.
    expect(paired).toContain('title="Open on TikTok"');
    expect(paired).toContain('aria-label="Open in Google Maps"');
    expect(paired).toContain('Google Maps');

    // Never abbreviated to `Maps`: the pill links into Google's product, and the same attribution
    // rule that keeps `Matched on Google Maps` in the provenance line applies to the button.
    const alone = render(UNSAVED, null);
    expect(alone).not.toContain('aria-label="Open on TikTok"');
    expect(alone).toContain('aria-label="Open in Google Maps"');
    expect(alone).toContain('Google Maps');
  });

  it('puts the primary actions above the note and the remove, not below them', () => {
    // The whole of lane B: on a 390x844 phone these three were below the fold, under the quote,
    // the collections row, the category row and the note. Order in the markup is the one part of
    // that a unit test can hold; the measurement itself is a browser at both breakpoints.
    const markup = render(SAVED, { id: 'saved-1', visited: false });
    expect(markup.indexOf('aria-label="Open on TikTok"')).toBeLessThan(markup.indexOf('Your note'));
    expect(markup.indexOf('Been here')).toBeLessThan(markup.indexOf('Remove from your places'));
  });
});

describe('PlaceDetail — how approximate is said', () => {
  it('marks the address rather than explaining the pipeline underneath the card', () => {
    const markup = render(
      { ...SAVED, detail: { ...OVERLAY, provenance: { sourceDataset: 'llm-guess' } } },
      { id: 'saved-1', visited: false },
    );
    expect(markup).toContain('Approximate location');
    // The process sentence is retired from the card (B-T2): it survives only as the `title` a
    // pointer device can reach, and never as `Worked out from the video rather than matched…`.
    expect(markup).not.toContain('Worked out from the video');
    expect(markup).toContain('title="Could be a street or two off."');
    // Said once, not twice: the provenance block no longer repeats the label at the bottom.
    expect(markup.match(/Approximate location/g)).toHaveLength(1);
  });

  it('keeps the Google attribution where a provider was actually used', () => {
    const markup = render(
      { ...SAVED, detail: { ...OVERLAY, provenance: { sourceDataset: 'google-places' } } },
      { id: 'saved-1', visited: false },
    );
    expect(markup).toContain('Matched on Google Maps');
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
