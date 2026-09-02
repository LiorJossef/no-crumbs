/**
 * The card's three bands and the two hairlines between them — task **H-3** of
 * `docs/ux-place-card-unification-2026-09-02.md` §2.
 *
 * The rule the spec cares about is not "there is a divider"; it is that **a band that renders
 * nothing takes its hairline with it**. A rule with no content under it is the floating fragment
 * the whole change exists to remove, and it is what a manual add — no post, no quote, no dishes —
 * would draw if the divider were a sibling element rather than the band's own top border.
 *
 * Driven through `react-dom/server`: vitest runs in a `node` environment here, no jsdom.
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

const OVERLAY = {
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
  reason: 'the cacio e pepe here sells out by eight',
  whyGo: 'Cash only, and the queue moves fast.',
  dishes: ['cacio e pepe'],
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  visitState: 'want_to_go',
  savedAt: new Date('2026-08-01T10:00:00Z'),
} as Spot;

const FROM_A_POST: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: OVERLAY,
};

/** Added by hand: no TikTok, no caption to quote, nothing the model wrote. Band 2 has no content
 *  at all, so the card must draw exactly one hairline. */
const MANUAL: DetailPlace = {
  name: 'The corner bakery',
  category: 'cafe',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: undefined,
  detail: {
    ...OVERLAY,
    reason: undefined,
    whyGo: undefined,
    dishes: [],
    sourceUrl: undefined,
  } as unknown as Spot,
};

function render(place: DetailPlace, savedPlace: { id: string; visited: boolean } | null): string {
  return renderToStaticMarkup(
    createElement(
      CollectionsContext.Provider,
      { value: { collections: [], byPlaceId: {} } },
      createElement(PlaceDetail, { place, savedPlace, onClose: () => {} }),
    ),
  );
}

function hairlines(markup: string): number {
  return (markup.match(/border-t border-border\/60/g) ?? []).length;
}

describe('the card is three bands and two hairlines', () => {
  it('draws two on a place saved from a post', () => {
    expect(hairlines(render(FROM_A_POST, { id: 'saved-1', visited: false }))).toBe(2);
  });

  it('draws one on a manual add — band 2 leaves and takes its rule with it', () => {
    expect(hairlines(render(MANUAL, { id: 'saved-1', visited: false }))).toBe(1);
  });

  it('draws none when neither band has anything in it', () => {
    // A place seen inside a collection that the viewer has not saved: no post, and no record of
    // their own to edit. Band 1 alone, and no rule under it pointing at nothing.
    const seenOnly: DetailPlace = {
      ...MANUAL,
      detail: {
        ...MANUAL.detail!,
        note: undefined,
        savedAt: undefined,
      } as unknown as Spot,
    };
    expect(hairlines(render(seenOnly, null))).toBe(0);
  });

  it("keeps the model's sentence inside the quote's own block, not alone in the column", () => {
    const markup = render(FROM_A_POST, { id: 'saved-1', visited: false });
    const figure = markup.match(/<figure[\s\S]*?<\/figure>/)?.[0] ?? '';
    expect(figure).toContain('the queue moves fast');
    // …behind the quote's own rule, rather than floating alone in the column.
    expect(figure).toContain('border-l-2');
  });
});
