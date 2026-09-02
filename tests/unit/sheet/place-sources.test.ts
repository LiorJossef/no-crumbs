/**
 * **Every TikTok link behind one place reaches the card** — round 3 §5.1's render half.
 *
 * The data half shipped and nothing consumed it: `get-spots.ts` returned `sources` (every linked
 * `sources` row, earliest first) and `grep` for a consumer under `src/components` returned nothing,
 * so saving the same place from a second TikTok link still showed the first one alone. These are
 * the assertions that fail if the card goes back to dropping them, and the ones that fail if it
 * starts drawing chrome around a single source.
 *
 * The rendering half follows `place-detail.test.ts`: `react-dom/server` into static markup, the
 * Server Action modules mocked because importing them pulls in `server-only`.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  deleteSavedPlaces: vi.fn(),
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

import {
  extraSources,
  moreSourcesLine,
  openSourceLabel,
  sourceCreatorLabel,
} from '@/components/sheet/place-sources';
import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { Spot, SpotSource } from '@/domain/places/spot';

/** `exactOptionalPropertyTypes` is on, so an absent credit is an **omitted key**, never a key set
 *  to `undefined` — which is exactly the distinction `SpotSource`'s optional fields carry. */
function source(
  n: number,
  over: { authorHandle?: string | null; authorName?: string | null } = {},
): SpotSource {
  const handle = 'authorHandle' in over ? over.authorHandle : `creator${n}`;
  const name = 'authorName' in over ? over.authorName : null;
  return {
    id: `source-${n}`,
    platform: 'tiktok',
    canonicalUrl: `https://www.tiktok.com/@_/video/${n}`,
    ...(handle ? { authorHandle: handle } : {}),
    ...(name ? { authorName: name } : {}),
  };
}

/** The shape the local database actually holds: `רדיו גליל ים`, two links, two different creators
 *  (`saved_place_sources` for `e4581ba9-…`). Hebrew on purpose — half this library is. */
function spot(sources: readonly SpotSource[]): Spot {
  const [first] = sources;
  return {
    id: 'saved-1',
    placeId: 'place-1',
    name: 'רדיו גליל ים',
    displayNameOverride: null,
    canonicalName: 'רדיו גליל ים',
    category: 'restaurant',
    categoryIsOverridden: false,
    lat: 32.08,
    lng: 34.78,
    locality: 'תל אביב-יפו',
    visitState: 'want_to_go',
    savedAt: new Date('2026-09-02T06:37:00Z'),
    sources,
    ...(first ? { source: first, sourceUrl: first.canonicalUrl } : {}),
  };
}

function render(sources: readonly SpotSource[]): string {
  const detail = spot(sources);
  const place: DetailPlace = {
    name: detail.name,
    category: detail.category,
    lat: detail.lat,
    lng: detail.lng,
    sourceUrl: detail.sourceUrl,
    detail,
  };
  return renderToStaticMarkup(
    createElement(PlaceDetail, {
      place,
      savedPlace: { id: 'saved-1', visited: false },
      onClose: () => {},
    }),
  );
}

describe('the tail of `sources`, which nothing rendered', () => {
  it('drops the head, because the card is already built from it', () => {
    const all = [source(1), source(2), source(3)];
    expect(extraSources(all).map((s) => s.id)).toEqual(['source-2', 'source-3']);
  });

  it('answers nothing for one source, for none, and for a caller that has no array', () => {
    expect(extraSources([source(1)])).toEqual([]);
    expect(extraSources([])).toEqual([]);
    // A collection peer: `0024` refused the read policy, so the array never arrives at all.
    expect(extraSources(undefined)).toEqual([]);
  });

  it('keeps `sources` own order rather than reversing it', () => {
    // Earliest-linked first is a fact about `added_at`; the head the card draws is `sources[0]`,
    // and reversing the tail would put the list out of step with the thing it continues.
    const all = [source(1), source(2), source(3)];
    expect(extraSources(all)).toEqual([all[1], all[2]]);
  });
});

describe('the words', () => {
  it('counts in digits and never writes `place(s)` or a bare plural', () => {
    expect(moreSourcesLine(1)).toBe('Also saved from 1 more TikTok video');
    expect(moreSourcesLine(2)).toBe('Also saved from 2 more TikTok videos');
  });

  it('keeps TikTok an adjective, never a noun', () => {
    // `voice-and-vocabulary.md` §3.1 and evidence `09` §10.5: `1 more TikTok` and `TikToks` are
    // both the count-noun form the guideline names.
    for (const line of [moreSourcesLine(1), moreSourcesLine(4)]) {
      expect(line).not.toMatch(/TikToks/);
      expect(line).not.toMatch(/TikTok\b(?! video)/);
    }
  });

  it('prefers the handle, falls back to the display name, and invents no credit', () => {
    expect(sourceCreatorLabel(source(1))).toBe('@creator1');
    expect(
      sourceCreatorLabel(source(1, { authorHandle: null, authorName: 'Paz Farchi' })),
    ).toBe('Paz Farchi');
    // Both null is the theoretical path `SpotSource` documents. No credit, never a fake one.
    const anonymous = source(1, { authorHandle: null, authorName: null });
    expect(sourceCreatorLabel(anonymous)).toBe('TikTok video');
    expect(openSourceLabel(anonymous)).toBe('Open on TikTok');
  });

  it('names the destination when three links would otherwise announce the same sentence', () => {
    expect(openSourceLabel(source(2))).toBe('Open @creator2 on TikTok');
  });
});

describe('the card', () => {
  it('draws no list at all for the common single-source place', () => {
    const markup = render([source(1)]);
    expect(markup).not.toContain('Also saved from');
  });

  it('draws nothing for a place saved by hand, which has no source', () => {
    expect(render([])).not.toContain('Also saved from');
  });

  it('shows every later source once there is more than one', () => {
    const markup = render([
      source(1, { authorHandle: 'karin_ziri' }),
      source(2, { authorHandle: 'paz_farchi1' }),
    ]);
    expect(markup).toContain('Also saved from 1 more TikTok video');
    expect(markup).toContain('@paz_farchi1');
    expect(markup).toContain('https://www.tiktok.com/@_/video/2');
  });

  it('carries the creator AND the link back on every row, which III.3(n) makes an obligation', () => {
    const markup = render([source(1), source(2), source(3)]);
    for (const n of [2, 3]) {
      expect(markup).toContain(`@creator${n}`);
      expect(markup).toContain(`https://www.tiktok.com/@_/video/${n}`);
      expect(markup).toContain(`Open @creator${n} on TikTok`);
    }
  });

  it('does not regress the headline attribution it sits under', () => {
    // The head source keeps the credit and the `Open on TikTok` pill it always had; the list is
    // beside that, never instead of it.
    const markup = render([source(1, { authorHandle: 'karin_ziri' }), source(2)]);
    expect(markup).toContain('@karin_ziri');
    expect(markup).toContain('Open on TikTok');
  });

  it('draws our own neutral glyph and no TikTok mark', () => {
    const markup = render([source(1), source(2)]);
    // `platform-mark.tsx` is the one module allowed to draw a platform glyph, and what it draws is
    // a portrait video frame of our own. Evidence `09` §7.1: no TikTok logo, icon or redraw in src/.
    expect(markup).toContain('data-platform-mark="neutral"');
  });

  it('isolates a handle for bidi and lays the trailing glyph out logically', () => {
    const markup = render([source(1), source(2)]);
    expect(markup).toContain('<bdi>@creator2</bdi>');
    // `ms-auto`, never `ml-auto`: this list renders inside an RTL column, so the trailing glyph
    // has to move to the other edge with it.
    expect(markup).toContain('ms-auto size-3.5 shrink-0 opacity-70');
    expect(markup).not.toContain('ml-auto size-3.5');
  });
});
