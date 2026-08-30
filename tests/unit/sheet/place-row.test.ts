/**
 * `PlaceRow` rendered to static markup with `react-dom/server` — the only rendering this repo's
 * unit setup can do (vitest runs in a `node` environment, no jsdom, no testing library, and
 * `vitest.config.ts` collects `*.test.ts` only, so the component is driven through `createElement`
 * rather than JSX).
 *
 * **What this file is for.** The row is the surface where an approximate pin used to be
 * indistinguishable from a matched one: `locationCertainty` has told the detail view "Approximate
 * location" since it shipped, and twenty-one of the thirty-one live places are that, but a list of
 * them looked uniformly placed until you opened one. These assertions pin the mark's presence, its
 * absence where it would be a false claim, and the accessible name — which is the half that is
 * easiest to lose, because `aria-label` replaces the button's content and a glyph inside it is
 * then announced nowhere at all.
 *
 * What it cannot claim: nothing here is evidence about size, contrast, or whether a 14 px dashed
 * circle reads as "not exact" to a person. There is no layout and no CSS in a static string.
 *
 * The Server Action modules are mocked because `place-sheet.tsx` pulls in `saved-place-edits.tsx`,
 * which imports `@/app/_lib/supabase/server` and therefore `server-only` — a package that throws
 * by design outside a React Server Component. No assertion here calls an action.
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

const { PlaceRow } = await import('@/components/sheet/place-sheet');

import type { MapPlace } from '@/components/map/types';
import type { SourceDataset } from '@/domain/types';

/** A place with the provenance the caller decides, and nothing else that could explain a
 *  difference between two renders. */
function placeWith(sourceDataset: SourceDataset | null): MapPlace {
  return {
    id: 'saved-1',
    name: 'Sycamore',
    category: 'restaurant',
    lat: 51.47,
    lng: -0.07,
    visited: false,
    note: '',
    sourceUrl: undefined,
    detail: {
      id: 'saved-1',
      placeId: 'place-1',
      name: 'Sycamore',
      displayNameOverride: null,
      canonicalName: 'Sycamore',
      category: 'restaurant',
      categoryIsOverridden: false,
      lat: 51.47,
      lng: -0.07,
      locality: 'London',
      visitState: 'want_to_go',
      savedAt: new Date('2026-08-01T10:00:00Z'),
      ...(sourceDataset === null
        ? {}
        : { provenance: { sourceDataset, resolutionScore: null } }),
    },
  };
}

function render(place: MapPlace, interactive = true): string {
  return renderToStaticMarkup(
    createElement(PlaceRow, { place, ...(interactive ? { onSelect: () => {} } : {}) }),
  );
}

/** The mark is a dashed ring on the row's own pin disc — the element the uncertainty is about —
 *  rather than a glyph trailing the category line. Asserted as the class rather than as an icon
 *  name so the assertion survives a change of icon and fails on a change of meaning. */
describe('PlaceRow — an approximate pin says so', () => {
  it('marks a row whose coordinate is the model reading a caption', () => {
    const markup = render(placeWith('llm-guess'));
    expect(markup).toContain('Approximate location');
    expect(markup).toContain('border-dashed');
  });

  it('leaves a matched row unmarked', () => {
    // The mark has to mean something. A resolved pin is the venue's own coordinate — measured
    // 11 m out — so annotating it would be the false half of the same claim.
    const markup = render(placeWith('google-places'));
    expect(markup).not.toContain('Approximate location');
    expect(markup).not.toContain('border-dashed');
  });

  it('leaves a row with no provenance at all unmarked', () => {
    // Five of the thirty-one live rows. "We do not know how this was placed" is not "this is
    // approximate", and inventing the stronger claim is the thing this codebase will not do.
    expect(render(placeWith(null))).not.toContain('border-dashed');
  });

  it('never puts a confidence number on the row', () => {
    // The review screen bans them by rule; `resolution_score` is a diagnostic, not a probability.
    expect(render(placeWith('llm-guess'))).not.toMatch(/\d+\s*%/);
  });
});

describe('PlaceRow — the mark reaches a screen reader', () => {
  it('folds it into the row\'s one accessible name, after the tags', () => {
    // `aria-label` replaces a button's content, so the glyph is announced nowhere unless it is in
    // the name. Last because it qualifies the pin rather than the place.
    const markup = render(placeWith('llm-guess'));
    expect(markup).toMatch(/aria-label="\u2068Open Sycamore\u2069, approximate location"/);
  });

  it('leaves the name alone when the pin was matched', () => {
    expect(render(placeWith('google-places'))).toMatch(/aria-label="Open Sycamore"/);
  });

  it('keeps the glyph out of the accessibility tree, so it is never announced twice', () => {
    const markup = render(placeWith('llm-guess'));
    expect(markup).toMatch(/aria-hidden="true"[^>]*title="Approximate location"/);
  });

  it('draws the mark on the presentational row, but says nothing there', () => {
    // Without `onSelect` the row is a plain `<li>` with no `aria-label`, so the ring's
    // `aria-hidden` means a screen reader gets nothing at all. That is the existing gap `BeenBadge`
    // already has on this variant, recorded rather than fixed here: the fix is one accessible-name
    // helper for both facts, and it lives outside this change.
    const markup = render(placeWith('llm-guess'), false);
    expect(markup).not.toContain('aria-label');
    expect(markup).toContain('border-dashed');
    expect(markup).not.toContain('approximate location');
  });
});
