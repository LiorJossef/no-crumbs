/**
 * **The action band sits above the source quote, and the category line names a place rather than a
 * process.** Both are lane B2 (2026-09-02), and both are one edit away from being walked back by a
 * future content change to the same column — which is exactly how the map-popover thumbnail walked
 * back round 3's `D3`.
 *
 * ## Why the order moved
 *
 * Round 3's ask is a *zero-scroll* place card: the things a person opens a saved place to do —
 * open it on TikTok, get directions, mark that they have been — must be reachable without
 * scrolling. Lane B put the three of them in one 44 px band and measured it met at 1440x900 and at
 * the phone sheet's `full` stop, and **not** met at the sheet's `half` stop, which is where a
 * tapped pin actually opens the card.
 *
 * The owner's §2.2 suggested the band sit "directly below the source quote". The requirement in
 * that item is that primary actions are not buried, and the suggestion was about the *shape* of
 * the control (compact pills, not full-width blocks). Serving the requirement while deviating from
 * the suggested position is the trade this file pins. Measured at 390x844 on `The Laughing Yak` —
 * quote, approximate location, real note — the band's bottom edge moved from **933 to 846** against
 * a scroll column ending at 846: 87 px below the fold, to flush with it. At 1440x900 the desktop
 * popover's slack under the band went from **39 px to 122 px**, still one unwrapped 44 px band, and
 * the quote is still fully on screen at 355–423 inside a card ending at 461.
 *
 * **What this reorder did not achieve, and it is written here because a green file must not imply
 * it did.** The phone sheet's `half` stop has a *fixed* `BottomNav` (`aria-label="Main"`, `z-50`)
 * covering `y 776–844`, so the honest fold is 776 and not the column's own 846. Measured across
 * eight saved places after the reorder, the band clears that fold on exactly one of them
 * (`Café Florentin`, no quote, +128 px); the rest sit 53–92 px under the nav. Zero-scroll at `half`
 * is not reachable by reordering, and it is not reachable by also shrinking the still to 112 px —
 * that buys 48 px against a 53–92 px deficit. The remaining levers all delete something.
 *
 * ## Why the category line changed
 *
 * `Restaurant · worked out from the video` narrated our machinery at the user, which
 * `voice-and-vocabulary.md` §4 bans and which lane B-T2 had already retired from the *location*
 * line one block above. The two were siblings; only one was fixed.
 *
 * Rendered with `react-dom/server` for the same reason `place-detail.test.ts` is: vitest runs in a
 * `node` environment here, with no jsdom and no testing library. There is no layout engine, so
 * **nothing in this file is evidence that anything fits** — the pixel numbers above are the
 * measurement log. These assertions hold the decisions that produced them.
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

/** `The Laughing Yak`'s shape: a quote worth showing, a note, and a guessed pin. The quote is
 *  deliberately one the caption really carries rather than a paraphrase of the name — otherwise
 *  `quoteAddsSomething` suppresses it and the ordering assertion would pass on an empty figure. */
const OVERLAY: Spot = {
  id: 'saved-1',
  placeId: 'place-1',
  name: 'The Laughing Yak',
  displayNameOverride: null,
  canonicalName: 'The Laughing Yak',
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 51.47,
  lng: -0.07,
  addressLine: '35 Peckham Rye',
  locality: 'London',
  note: 'Go for the momos, they sell out by 8.',
  reason: 'go early, the momos sell out by eight',
  sourceUrl: 'https://www.tiktok.com/@exploringlondon/video/1',
  source: {
    id: 'source-1',
    platform: 'tiktok',
    canonicalUrl: 'https://www.tiktok.com/@exploringlondon/video/1',
    authorHandle: 'exploringlondon',
  },
  visitState: 'want_to_go',
  savedAt: new Date('2026-08-01T10:00:00Z'),
};

const PLACE: DetailPlace = {
  name: 'The Laughing Yak',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@exploringlondon/video/1',
  detail: OVERLAY,
};

function render(place: DetailPlace = PLACE, variant?: 'popover' | 'panel' | 'hosted'): string {
  return renderToStaticMarkup(
    createElement(
      CollectionsContext.Provider,
      { value: { collections: [], byPlaceId: {} } },
      createElement(PlaceDetail, {
        place,
        savedPlace: { id: 'saved-1', visited: false },
        onClose: () => {},
        ...(variant ? { variant } : {}),
      }),
    ),
  );
}

describe('the primary actions come before the words that explain them', () => {
  it('puts the action band above the source quote', () => {
    const markup = render();
    const band = markup.indexOf('Open in Google Maps');
    const quote = markup.indexOf('<blockquote');
    expect(band).toBeGreaterThan(-1);
    expect(quote).toBeGreaterThan(-1);
    // Source order is the whole assertion: this column is a plain flex column with no `order`
    // rules anywhere, so the markup order *is* the paint order at every one of the four hosts.
    expect(band).toBeLessThan(quote);
  });

  it('keeps the band above the quote at every host, not only on the phone', () => {
    // The `half` stop is where the fold bites, but a variant-conditional order would be two cards
    // wearing one name — and the desktop popover is the host that gained the most from the move.
    for (const variant of [undefined, 'popover', 'panel', 'hosted'] as const) {
      const markup = render(PLACE, variant);
      expect(markup.indexOf('Open in Google Maps')).toBeLessThan(markup.indexOf('<blockquote'));
    }
  });

  it('still shows the quote — the reorder demotes it, it does not delete it', () => {
    // The quote is *why the place is in the library*. Moving controls above it is a fold decision;
    // dropping it would be a product one, and this card would stop being worth opening.
    expect(render()).toContain('go early, the momos sell out by eight');
  });

  it('keeps the creator attribution with the words it attributes', () => {
    const markup = render();
    // `>@exploringlondon<`, not the bare handle: the handle is also a substring of both link
    // `href`s at the top of the band, so a bare `indexOf` finds the URL and measures nothing.
    const caption = markup.indexOf('>@exploringlondon<');
    expect(caption).toBeGreaterThan(-1);
    // The `<figcaption>` renders inside the `<figure>`, below the quote — so it must land *after*
    // the band now, not before it. If this ever inverts, the card is crediting a handle to a row
    // of buttons.
    expect(markup.indexOf('Open in Google Maps')).toBeLessThan(caption);
  });
});

describe('the category line names where the value came from, not what we did to get it', () => {
  it('never says `worked out from`', () => {
    const markup = render();
    // RETIRED 2026-09-03 (spec §R5): this test used to also require `from the TikTok video` on the
    // category line. The whole ` · from the TikTok video` / ` · from the map listing` suffix was
    // deleted on purpose — `src/components/sheet/saved-place-edits.tsx` l. 433 records why: it was
    // the fourth statement on one card that the place came from a video, and the card's complaint
    // was repetition. The pin's provenance still lives on the record line at the bottom.
    // The banned half below is the half that was worth having, and it still holds.
    // `worked out from` is process language on a user-facing surface
    // (`voice-and-vocabulary.md` §4), and it survived B-T2's pass on the location line only
    // because that task was deliberately not widened.
    expect(markup).not.toContain('worked out from');
  });

  it('writes TikTok out rather than leaning on a bare `the video`', () => {
    // §3.1 allows the bare noun only as an anaphor — a reference back to a TikTok video already
    // named in words on the same surface. This card names it nowhere else: its link pill is
    // icon-only, with `Open on TikTok` on `aria-label` and `title` and no visible word.
    expect(render()).not.toContain('· from the video');
  });

  it('names no source on the category line, for a video place or a manual one', () => {
    // RETIRED 2026-09-03 (spec §R5): this test used to require `from the map listing` here. The
    // suffix is gone from both arms, so what is left to protect is that it stays gone — putting a
    // source back on the category line is the repetition §R5 removed.
    // Both copies of the URL: `tiktokUrl` reads `detail.sourceUrl` first and falls back to the
    // flat prop, so clearing one alone would leave the card believing there is a video.
    // The overlay's two source keys are *removed* rather than set to `undefined`:
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not assignable to an
    // optional field. `DetailPlace.sourceUrl` is a required key and takes it directly.
    const { sourceUrl: _droppedUrl, source: _droppedSource, ...overlayWithoutAVideo } = OVERLAY;
    void _droppedUrl;
    void _droppedSource;
    const manual: DetailPlace = { ...PLACE, sourceUrl: undefined, detail: overlayWithoutAVideo };
    for (const markup of [render(), render(manual)]) {
      expect(markup).not.toContain('from the map listing');
      expect(markup).not.toContain('from the TikTok video');
    }
  });
});
