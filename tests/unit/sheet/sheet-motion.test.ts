/**
 * **The sheet's list chrome: what it animates, and what it counts.**
 *
 * Two subjects, one harness — `PlaceSheet` is expensive to stand up (three Server Action modules
 * mocked, a full prop surface) and both blocks below are assertions about the chrome *above* the
 * rows rather than about the rows themselves. The file is named for the first because that is what
 * it was written for; the result count arrived with W5-5 and belongs to the same render.
 *
 * ## 1. The reduced-motion arm, asserted where it is easiest to lose
 *
 * `facelift-plan.md` §3a rule 4 inverts `motion-reduce:` into `motion-safe:`, and the reason is
 * mechanical rather than stylistic: with `motion-reduce:` the accessible path is a second thing the
 * author has to remember to write, and eight of the ten sites in this codebase were written by
 * someone remembering. With `motion-safe:` the un-prefixed state *is* the reduced case, so
 * forgetting produces a still screen rather than a moving one.
 *
 * The rule the sheet's heading has to obey, and the one this file exists to pin: under
 * `prefers-reduced-motion` the nine animations collapse **to the opacity change alone — not to
 * nothing**, because the thing that just changed still has to be findable. So the fade is
 * unconditional and only the 4 px rise is `motion-safe:`.
 *
 * `environment: 'node'`, so this is `react-dom/server` markup — evidence about which classes are
 * emitted, and about nothing else. Whether the fade reads as a change of scope is a browser.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// `place-sheet.tsx` reaches `saved-place-edits.tsx`, which imports the server-only Supabase client;
// the same mocks `place-row.test.ts` installs, and for the same reason.
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

const { PlaceSheet } = await import('@/components/sheet/place-sheet');

import { areaHeading } from '@/ui/place/active-area';
import type { MapPlace } from '@/components/map/types';

function place(id: string, name: string): MapPlace {
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
      locality: 'תל אביב-יפו',
      visitState: 'want_to_go',
      savedAt: new Date('2026-08-01T10:00:00Z'),
    },
  };
}

const places = [place('tlv-1', 'Miznon'), place('tlv-2', 'קפה לוינסקי')];

function render(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(PlaceSheet, {
      places,
      heading: areaHeading({
        countInArea: places.length,
        area: 'תל אביב-יפו',
        searchQuery: '',
        tagLabel: null,
        matchesAnywhere: places.length,
      }),
      otherPlaces: [],
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
      selected: null,
      onDeselect: () => {},
      onAddTikTok: () => {},
      onSelect: () => {},
      stop: 'half' as const,
      onExpand: () => {},
      ...overrides,
    }),
  );
}

describe('the area heading enters the way the design system says it enters', () => {
  it('fades for everyone and rises only for a pointer user', () => {
    const markup = render();
    // Opacity is unconditional — this is the reduced-motion arm, and it is not "nothing".
    expect(markup).toContain('animate-in');
    expect(markup).toContain('fade-in-0');
    // The 4 px rise is the part that is motion.
    expect(markup).toContain('motion-safe:slide-in-from-bottom-1');
  });

  it('takes its duration from the token rather than from a number', () => {
    // `duration-140` compiled and was not a bracket, which is exactly what made it easy to keep:
    // it is a second way of saying `duration-enter`, and two ways of saying one value is how a
    // token layer stops being one.
    const markup = render();
    expect(markup).toContain('duration-enter');
    expect(markup).not.toContain('duration-140');
  });

  it('no longer suppresses the whole entrance under reduced motion', () => {
    // `motion-reduce:animate-none` made the change of scope a swap with no transition at all,
    // during a frame that also resets the scroll and moves focus — the change a reduced-motion
    // user is most likely to miss entirely.
    expect(render()).not.toContain('motion-reduce:');
  });
});

/**
 * **The visible result count (W5-5) was deleted on 2026-09-02** —
 * `ux-overwhelm-audit-2026-09-02.md` §7, on the owner's instruction that the UI must not feel
 * overwhelming. It was `aria-hidden`, so it existed for sighted users only, and it restated what
 * the heading above it and the list below it already say — in exactly the band the owner asked us
 * to empty. This block replaces its six assertions with the one that matters now: the fact is
 * still spoken, by the live region in `map-shell.tsx`, which is a different mechanism in a
 * different file and was not touched.
 */
describe('the result count is gone from the header band', () => {
  it('draws no `N of M` anywhere, narrowing or not', () => {
    expect(render({ query: 'momos' })).not.toMatch(/\d+ of \d+/);
    expect(render({ activeTags: ['wine'] })).not.toMatch(/\d+ of \d+/);
    expect(render({ visitFilter: 'not-been' as const })).not.toMatch(/\d+ of \d+/);
  });

  it('leaves the sheet with no aria-hidden paragraph standing in for an announcement', () => {
    expect(render({ query: 'momos' })).not.toMatch(/<p aria-hidden="true"/);
  });
});
