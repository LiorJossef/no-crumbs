/**
 * **The desktop map popover's height budget, and the two things that spend it.**
 *
 * Round 4 finding 2, measured 2026-09-01 against the running app at 1440x900: clicking a pin on a
 * laptop gave a card with *none* of its controls on screen and no sign that any existed. The
 * column's `clientHeight` was **416** at every place while its `scrollHeight` was **844 / 879 /
 * 988**, `Been here` sat at `y 448–492` against a card bottom edge of `y 461`, and the clip landed
 * mid-word with no fade and no scrollbar.
 *
 * The fix that this file guards is **not** the one the review costed at two lines, and the
 * difference is the reason the file exists.
 *
 * ## Why the cap is `50vh` and not `70vh`
 *
 * `MapPopup` is a MapLibre `Popup` anchored to the selected place's coordinates, and the camera
 * parks that pin at ~53 % of the window height. Measured at 1440x900: the popup resolves
 * `maplibregl-popup-anchor-bottom` and grows **upward** from an anchor at `y 478`, so its bottom
 * edge is nailed at `y 462` and every extra pixel of height comes off the *top of the window*.
 * Forcing the column taller at that same camera: `440px` → card top `y 20`; `470px` → `y -10`;
 * **`630px`, which is exactly what `70vh` resolves to at a 900 px window and exactly what dropping
 * the `26rem` arm would have let bind, → `y -170`** — the name, the picture and 170 px of card off
 * the top of the screen, with no page scroll anywhere on `/map` that could reach them.
 *
 * So `70vh` is not a bigger budget, it is an off-screen card, and the room this surface actually
 * has is half the window rather than 70 % of it. Measured after the change, `Café Florentin` at
 * four window heights, `offTop`/`offBottom` **0 at every one**: 900 → 448, 800 → 400, 768 → 384,
 * 720 → 360. The old constant at 1366x768 put the card's top at **`y -22`**; this one puts it at
 * `y 10`. That second half is a defect nobody had filed.
 *
 * ## Why the still shrinks
 *
 * The recoverable *height* was ~32 px, not the ~210 px a viewport-reading of the cap suggests, so
 * height was never the lever — content was. The map-popover thumbnail landed two days before the
 * review and put 160 px, 38 % of a 416 px card, above every control on it. `compact` is the
 * ruling: the still keeps its position (a place saved from a video is recognised by its frame
 * faster than by its name) and gives up its size. Measured with 112 px and the new cap, `Been
 * here` is **fully on screen with the card unscrolled** on all three of the longest cards in this
 * database — `435 / 437 / 399` against a 448 px card, `0 / 5` hit points blocked, where before it
 * was `483 / 501 / 447` against 416 and `5 / 5`, `5 / 5`, `3 / 5` blocked.
 *
 * ## What this file cannot claim
 *
 * There is no layout engine in `environment: 'node'`, so none of these assertions is evidence that
 * anything *fits*. That is the measurement log and the screenshots. These are the class strings
 * that carry the ruling, asserted so the next content change to this card cannot silently walk it
 * back the way the thumbnail walked back round 3's `D3`.
 *
 * The Server Action modules are mocked exactly as `place-media-band.test.ts` mocks them.
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

import type { DetailPlace } from '@/components/sheet/place-sheet';

const STILL = 'https://cdn.example/still.jpg?x-expires=1791000000';

const PLACE: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: {
    placeId: 'place-1',
    source: {
      id: 'src-1',
      platform: 'tiktok',
      canonicalUrl: 'https://www.tiktok.com/@someone/video/1',
      media: { kind: 'image', url: STILL, expiresAt: null },
    },
  },
};

function detail(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(PlaceDetail, { place: PLACE, savedPlace: null, onClose: () => {}, ...props }),
  );
}

/** The scrolling column — `PlaceDetail`'s own root, matched by the class that makes it a scroller
 *  rather than by position, so a wrapper appearing above it does not silently pass. */
function columnOf(markup: string): string {
  return markup.match(/<div[^>]*\boverflow-y-auto\b[^>]*>/)?.[0] ?? '';
}

/** The source still. `place-media-band.test.ts` owns everything else about this element. */
function imageOf(markup: string): string {
  return markup.match(/<img\b[^>]*>/)?.[0] ?? '';
}

describe('the popover asks for the height the pin leaves it, not the height the window has', () => {
  it('caps the column at half the window', () => {
    // `50vh` is the anchor geometry, not a taste: the card grows upward from a pin parked near the
    // vertical middle, so half the window *is* the room, and this tracks a 768 px laptop where a
    // fixed `26rem` overflowed the top edge by 22 px.
    expect(columnOf(detail({ variant: 'popover' }))).toContain('max-h-[min(50vh,28rem)]');
  });

  it('never asks for 70vh, which is measurably off the top of the screen', () => {
    // 630 px at a 900 px window → card top at `y -170`. This is the assertion that stops the
    // "just drop the `26rem` arm" fix from being reintroduced as an obvious two-line improvement.
    const column = columnOf(detail({ variant: 'popover' }));
    expect(column).not.toContain('70vh');
    expect(column).not.toContain('26rem');
  });

  it('leaves every other host uncapped, because every other host is scrolled by a thumb', () => {
    // The sheet at 390x844 measured `clientHeight 394 / scrollHeight 921` before and after this
    // change, with `Been here` at `y 593–637` and 0/5 hit points blocked. Nothing here may reach it.
    for (const variant of [undefined, 'panel', 'hosted']) {
      const column = columnOf(detail(variant === undefined ? {} : { variant }));
      expect(column).not.toContain('max-h-[min(50vh,28rem)]');
    }
  });
});

describe('the popover says that it scrolls', () => {
  it('carries the bottom scroll fade', () => {
    // The review's complaint was "no fade, no shadow and no scrollbar" against a clip that landed
    // mid-word. `scroll-fade-b` is the repo's own utility (`library-filter-bar.tsx` uses
    // `scroll-fade-x` for the same job on the phone) and it is scroll-driven: measured
    // `--scroll-fade-b` is `24px` at `scrollTop 0` and `0px` at the end, so it never dims a last
    // line the reader has already reached.
    const column = columnOf(detail({ variant: 'popover' }));
    expect(column).toContain('scroll-fade-b');
    expect(column).toContain('scroll-fade-6');
  });

  it('does not chain its wheel into the map underneath it', () => {
    // Measured: a 200 px wheel over the card scrolls the card by 200 and leaves the camera alone.
    // Without this, reaching the end of a floating card zooms the map it is anchored to.
    expect(columnOf(detail({ variant: 'popover' }))).toContain('overscroll-contain');
  });

  it('draws no fade on a surface that has no cap to overflow', () => {
    for (const variant of [undefined, 'panel', 'hosted']) {
      const column = columnOf(detail(variant === undefined ? {} : { variant }));
      expect(column).not.toContain('scroll-fade');
    }
  });
});

describe('the source still spends the budget it is given, and only in the popover', () => {
  it('draws a 112 px band inside the popover', () => {
    // 160 px was 38 % of a 416 px card, above every control on it, and it is what pushed `Been
    // here` off the screen between round 3 and round 4. The picture stays first; it stops being
    // this big.
    expect(imageOf(detail({ variant: 'popover' }))).toContain('h-28');
  });

  it('keeps the 160 px band everywhere else', () => {
    for (const variant of [undefined, 'panel', 'hosted']) {
      const image = imageOf(detail(variant === undefined ? {} : { variant }));
      expect(image).toContain('h-40');
      expect(image).not.toContain('h-28');
    }
  });

  it('keeps the referrer policy on every host', () => {
    // Not this task's subject, and exactly why it is asserted beside a change to the same element:
    // without it the browser tells TikTok's CDN which of our users asked for which signed URL.
    for (const props of [{}, { variant: 'popover' }, { variant: 'panel' }, { variant: 'hosted' }]) {
      expect(imageOf(detail(props))).toContain('referrerPolicy="no-referrer"');
    }
  });
});
