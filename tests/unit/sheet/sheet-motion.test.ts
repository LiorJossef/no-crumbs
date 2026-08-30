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
      activeTag: null,
      onClearTag: () => {},
      notBeenOnly: false,
      onToggleNotBeen: () => {},
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
 * The visible result count (W5-5). The sheet has announced how much of the library is in play since
 * `filterSentence` shipped and announced it only to a screen reader; this is the same fact for the
 * people who cannot hear it.
 */
describe('the result count beside the search field', () => {
  it('says how many of how many while something is narrowing', () => {
    expect(render({ query: 'momos', unfilteredCount: 32 })).toContain('2 of 32');
  });

  it('stays away when nothing is narrowing', () => {
    // `2 of 32` with an empty field is a number about nothing, competing with a heading that
    // already carries a count.
    expect(render({ unfilteredCount: 32 })).not.toContain('of 32');
  });

  it('renders nothing at all rather than guessing a denominator', () => {
    // `places` and `otherPlaces` both arrive already narrowed, so their sum is the numerator. A
    // denominator derived from them would be a confident wrong answer beside a control the user is
    // actively driving. Absent `unfilteredCount`, the count does not render.
    const markup = render({ query: 'momos' });
    expect(markup).not.toMatch(/\d+ of \d+/);
  });

  it('is hidden from the accessibility tree, because the live region already says it', () => {
    // The sheet has exactly one live region and `filterSentence` feeds it the same fact as a
    // sentence. Two announcements of one change is a defect, not redundancy.
    const markup = render({ query: 'momos', unfilteredCount: 32 });
    expect(markup).toMatch(/<p aria-hidden="true"[^>]*>2 of 32<\/p>/);
  });

  it('appears for a tag and for the visit filter, not only for typed text', () => {
    expect(render({ activeTag: 'wine', unfilteredCount: 32 })).toContain('2 of 32');
    expect(render({ notBeenOnly: true, unfilteredCount: 32 })).toContain('2 of 32');
  });
});
