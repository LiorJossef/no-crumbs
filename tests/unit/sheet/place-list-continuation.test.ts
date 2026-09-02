/**
 * The list below the header: the scope's own places, then the rest of the library as ordinary rows.
 *
 * **What this file is guarding.** Until 2026-08-30 the places outside the active area were reached
 * through an `Elsewhere` section — a country row you expanded to get a city row you tapped to
 * replace the whole list. On the owner's real library that rendered as five Israeli cities filed
 * under `Israel 4 places`, beneath a header reading `3 places in תל אביב-יפו`, and he ruled it out;
 * `docs/ux-stable-area-list.md`:114 had already written the fallback ("render other areas' places
 * as a plain ungrouped continuation") and that is now what ships.
 *
 * So the assertions here are as much about what is *absent* as about what is present. A tree that
 * comes back — a country group, an area row, an expandable anything — fails this file, and that
 * matters because this repo has twice shipped a complete component that nothing rendered while the
 * suite stayed green.
 *
 * Rendered with `react-dom/server`, which is all this repo's unit setup can do (vitest runs in
 * `node`, no jsdom, no testing library). `PlaceDesktopPanel` rather than `PlaceSheet` because the
 * sheet's body lives inside a vaul portal that a static render will not enter; the two surfaces
 * render the same `EverywhereElse` from the same array, which is the point of it being shared.
 *
 * What it cannot claim: nothing here is evidence about spacing, contrast or how the boundary reads
 * on a 390 px phone. There is no layout and no CSS in a static string.
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

const { PlaceDesktopPanel } = await import('@/components/sheet/place-desktop-panel');

import { areaHeading, type AreaHeading } from '@/ui/place/active-area';
import { TagFilterContext } from '@/ui/place/tag-filter';
import type { EnrichedSpot } from '@/ui/place/enrichment';
import type { MapPlace } from '@/components/map/types';

function place(id: string, name: string, locality: string): MapPlace {
  return {
    id,
    name,
    category: 'restaurant',
    lat: 32.07,
    lng: 34.78,
    visited: false,
    note: '',
    sourceUrl: undefined,
    detail: {
      id,
      placeId: `place-${id}`,
      name,
      displayNameOverride: null,
      canonicalName: name,
      category: 'restaurant',
      categoryIsOverridden: false,
      lat: 32.07,
      lng: 34.78,
      locality,
      visitState: 'want_to_go',
      savedAt: new Date('2026-08-01T10:00:00Z'),
    },
  };
}

/** The owner's own shape of library: a few places in Tel Aviv, the rest scattered across Israel. */
const inScope = [place('tlv-1', 'קפה לוינסקי', 'תל אביב-יפו'), place('tlv-2', 'Miznon', 'תל אביב-יפו')];
const elsewhere = [
  place('jlm-1', 'מחניודה', 'ירושלים'),
  place('rnn-1', 'Cafe Landwer', 'Raanana'),
  place('hrz-1', 'ארומה', 'הרצליה'),
];

function render(options: {
  places?: readonly MapPlace[];
  otherPlaces?: readonly MapPlace[];
  heading?: AreaHeading;
  query?: string;
}): string {
  return renderToStaticMarkup(
    createElement(PlaceDesktopPanel, {
      places: options.places ?? inScope,
      otherPlaces: options.otherPlaces ?? elsewhere,
      heading:
        options.heading ??
        areaHeading({
          countInArea: (options.places ?? inScope).length,
          area: 'תל אביב-יפו',
          searchQuery: '',
          tagLabel: null,
          matchesAnywhere: 5,
        }),
      activeAreaId: 'tlv-1',
      libraryIsEmpty: false,
      libraryHasVisited: false,
      query: options.query ?? '',
      onQueryChange: () => {},
      activeTags: [],
      onClearTag: () => {},
      onToggleTag: () => {},
      onClearTags: () => {},
      visitFilter: 'all' as const,
      onChangeVisitFilter: () => {},
      categoryFacets: [],
      activeCategory: null,
      onToggleCategory: () => {},
      onAddTikTok: () => {},
      onSelect: () => {},
    }),
  );
}

/** Where each name first appears in the markup, so order can be asserted without a DOM. */
function order(markup: string, ...needles: string[]): number[] {
  return needles.map((needle) => {
    const at = markup.indexOf(needle);
    expect(at, `${needle} is not in the markup`).toBeGreaterThan(-1);
    return at;
  });
}

describe('the list continues into the rest of the library', () => {
  it('renders the scope’s places, then the boundary, then everything else, in that order', () => {
    const markup = render({});
    const [first, second, boundary, third] = order(
      markup,
      'קפה לוינסקי',
      'Miznon',
      'Everywhere else',
      'מחניודה',
    );

    expect(first).toBeLessThan(second as number);
    expect(second).toBeLessThan(boundary as number);
    expect(boundary).toBeLessThan(third as number);
  });

  it('gives every place outside the scope a row of its own — nothing is behind a tap', () => {
    // The §6 requirement the `Elsewhere` section carried: the map's markers are painted into a
    // canvas and are unreachable by a screen reader, so every saved place has to be reachable from
    // the list. It used to be reachable in three taps through a country group; now it is a row.
    const markup = render({});
    for (const other of elsewhere) expect(markup).toContain(other.name);
  });

  it('opens a place from a continuation row, exactly as an in-scope row does', () => {
    // One kind of tap in the whole scroll. The rows the section replaced changed the list's entire
    // scope and moved the camera, which is the thing that made the boundary a mode rather than a
    // heading.
    const markup = render({});
    expect(markup).toContain('aria-label="Open מחניודה"');
    expect(markup).toContain('aria-label="Open קפה לוינסקי"');
  });

  it('keeps a Hebrew name isolated in its own row, wherever in the list it sits', () => {
    // `<bdi>` lives in `PlaceRow`, so a continuation row cannot lose it without every row losing
    // it. Asserted anyway, because the rows this replaced carried their own isolation and a
    // regression here would put mixed-direction city names back into the LTR run.
    const markup = render({});
    expect(markup).toContain('<bdi>מחניודה</bdi>');
    expect(markup).toContain('<bdi>Restaurant · ירושלים</bdi>');
  });

  it('says nothing at all when the library fits in one area', () => {
    const markup = render({ otherPlaces: [] });
    expect(markup).not.toContain('Everywhere else');
  });
});

describe('the country → city tree is gone, and stays gone', () => {
  const markup = render({});

  it('renders no expandable group', () => {
    expect(markup).not.toContain('aria-expanded');
    expect(markup).not.toContain('aria-controls');
  });

  it('renders no row that changes the scope', () => {
    // The area row's accessible name, verbatim. It is the one string that only that control had.
    expect(markup).not.toContain('open this area');
  });

  it('names no country and counts no country', () => {
    expect(markup).not.toContain('Israel');
    expect(markup).not.toMatch(/\d+ places<\//);
  });
});

describe('an empty scope escapes through the rows below it', () => {
  /** `No matches in תל אביב-יפו` — the state the spec deliberately gave no escape button, because
   *  the rows underneath already showed where the matches were. They still do; they are places
   *  now rather than cities. */
  const heading = areaHeading({
    countInArea: 0,
    area: 'תל אביב-יפו',
    searchQuery: 'aroma',
    tagLabel: null,
    matchesAnywhere: 3,
  });

  it('still lists the matches, under a heading that says they are not here', () => {
    const markup = render({ places: [], otherPlaces: elsewhere, heading });

    expect(heading.empty).toBe(true);
    expect(markup).toContain('No matches in תל אביב-יפו');
    expect(markup).toContain('ארומה');
  });

  it('drops the rule above them, because there is nothing above them to divide', () => {
    const withRows = render({});
    const withoutRows = render({ places: [], otherPlaces: elsewhere, heading });

    expect(withRows).toContain('border-t border-border/70');
    expect(withoutRows).not.toContain('border-t border-border/70');
  });
});

describe('the desktop heading enters the way the design system says it enters', () => {
  it('fades for everyone and rises only for a pointer user', () => {
    // W3-3, and the panel is the reason it matters twice: this heading and the sheet's are one
    // change of scope on two surfaces, so a reduced-motion arm that differs between them is the
    // phone and the desktop disagreeing about what the product does.
    const markup = render({});
    expect(markup).toContain('animate-in');
    expect(markup).toContain('fade-in-0');
    expect(markup).toContain('motion-safe:slide-in-from-bottom-1');
    expect(markup).toContain('duration-enter');
    expect(markup).not.toContain('duration-140');
    expect(markup).not.toContain('motion-reduce:');
  });
});

/**
 * Desktop parity for the tag facet (W5-3). 1440x900 is one of the two quality-gate viewports, and
 * a retrieval control that exists on the phone and not on the desktop is a half-finished surface —
 * the same argument that makes `PlaceRow` shared between the two.
 */
describe('the tag facet reaches the desktop panel too', () => {
  /** `tags` lives on `EnrichedSpot`, not on `Spot` — `enrichmentOf`'s own docblock says the cast
   *  is the single place that assumes `getSpots` populated columns `Spot` does not yet declare, so
   *  a fixture standing in for a read row has to say the same thing. */
  function tagged(place: MapPlace, tags: readonly string[]): MapPlace {
    const detail: EnrichedSpot = { ...place.detail!, tags: [...tags], whyGo: null, dishes: [] };
    return { ...place, detail };
  }

  /** The panel inside a live filter context, which is the only state the facet row draws in. */
  function renderWithTags(tagLists: readonly string[][]): string {
    const places = tagLists.map((tags, index) =>
      tagged(place(`p-${index}`, `Place ${index}`, 'תל אביב-יפו'), tags),
    );
    return renderToStaticMarkup(
      createElement(
        TagFilterContext,
        { value: { activeTags: [], onToggleTag: () => {} } },
        createElement(PlaceDesktopPanel, {
          places,
          otherPlaces: [],
          heading: areaHeading({
            countInArea: places.length,
            area: 'תל אביב-יפו',
            searchQuery: '',
            tagLabel: null,
            matchesAnywhere: places.length,
          }),
          activeAreaId: 'tlv-1',
          libraryIsEmpty: false,
          libraryHasVisited: false,
          query: '',
          onQueryChange: () => {},
          activeTags: [],
          onClearTag: () => {},
          onToggleTag: () => {},
          onClearTags: () => {},
          visitFilter: 'all' as const,
          onChangeVisitFilter: () => {},
          categoryFacets: [],
          activeCategory: null,
          onToggleCategory: () => {},
          onAddTikTok: () => {},
          onSelect: () => {},
        }),
      ),
    );
  }

  it('offers the tags behind the same one trigger the sheet uses', () => {
    // **Changed by the header collapse of 2026-09-02.** The tag chips are no longer a row at rest
    // on either surface: they live inside `LibraryFilterBar`'s panel, which is closed until the
    // user opens it. What desktop parity means now is that the panel is *reachable* here — the
    // chips themselves are asserted against the panel directly in `library-filter-bar.test.ts`,
    // because this repo's `react-dom/server` setup cannot press anything.
    const markup = renderWithTags([['late night'], ['late night', 'wine'], ['wine'], ['wine']]);
    expect(markup).toContain('aria-label="Filter, showing all"');
    expect(markup).toContain('aria-expanded="false"');
    // And the row it replaces is genuinely gone rather than merely restyled.
    expect(markup).not.toContain('aria-label="Filter by tag"');
    expect(markup).not.toContain('aria-label="⁨Wine⁩, 3 places"');
  });

  it('draws no facet row for a library with no tags', () => {
    // The default fixture carries none, which is also the majority of real libraries.
    expect(renderWithTags([[], []])).not.toContain('Filter by tag');
    expect(render({})).not.toContain('Filter by tag');
  });
});

/**
 * **The visible result count was deleted on 2026-09-02**, on both surfaces at once
 * (`ux-overwhelm-audit-2026-09-02.md` §7). It was `aria-hidden`, so it spoke to sighted users
 * only, and it restated the heading and the list in the one band the owner asked us to empty.
 * Desktop parity is now parity in its absence.
 */
describe('the result count is gone from the desktop panel too', () => {
  it('draws no `N of M` anywhere', () => {
    expect(render({ query: 'momos' })).not.toMatch(/\d+ of \d+/);
    expect(render({})).not.toMatch(/\d+ of \d+/);
  });
});
