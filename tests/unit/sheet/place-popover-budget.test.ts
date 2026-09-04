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
 * ## Why the still shrinks — and why it shrinks everywhere, not just here
 *
 * The recoverable *height* was ~32 px, not the ~210 px a viewport-reading of the cap suggests, so
 * height was never the lever — content was. The map-popover thumbnail landed two days before the
 * review and put 160 px, 38 % of a 416 px card, above every control on it. The still keeps its
 * position (a place saved from a video is recognised by its frame faster than by its name) and
 * gives up its size. Measured with 112 px and the new cap, `Been here` is **fully on screen with
 * the card unscrolled** on all three of the longest cards in this database — `435 / 437 / 399`
 * against a 448 px card, `0 / 5` hit points blocked, where before it was `483 / 501 / 447` against
 * 416 and `5 / 5`, `5 / 5`, `3 / 5` blocked.
 *
 * That was a `compact` prop only the popover passed, because a phone "is scrolled by a thumb that
 * already knows there is more below". **Measured 2026-09-04 across all 60 of the demo library's
 * saved places, sheet at `half`, that was false**: at 160 px, 41 of 60 rows clipped `Been here` at
 * 390x812 and the worst hid all 48 px of it. At 112 px, one row does. The prop is gone and 112 is
 * every host's number.
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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = readFileSync(`${repoRoot}src/components/sheet/place-sheet.tsx`, 'utf8');
const GLOBALS = readFileSync(`${repoRoot}src/app/globals.css`, 'utf8');

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

describe('the source still is 112 px in every host, not only in the popover', () => {
  it('draws a 112 px band on all four variants', () => {
    // 160 px was 38 % of a 416 px popover, above every control on it. It was `compact` — a
    // popover-only prop — until 2026-09-04, on the reasoning that a sheet "is scrolled by a thumb
    // that already knows there is more below". Measured across all 60 of the demo library's saved
    // places at 390x812 with the sheet at `half`, that reasoning was wrong: **41 of 60 rows clipped
    // `Been here`**, the worst hiding all 48 px of it. At 112 px one row still clips. So the band
    // is one number with no host arm, and there is no `compact` prop to pass.
    for (const props of [{}, { variant: 'popover' }, { variant: 'panel' }, { variant: 'hosted' }]) {
      const image = imageOf(detail(props));
      expect(image).toContain('h-28');
      expect(image).not.toContain('h-40');
    }
  });

  it('has no host arm left to pass', () => {
    // The regression this guards is the prop coming back under another name for a fourth host.
    // `compact` may still appear in prose above; it may not appear as a prop or a class arm.
    expect(SOURCE).not.toMatch(/compact[=:?]/);
    expect(SOURCE).not.toContain('h-40');
  });
});

describe('the card is set in the product\'s own face, in every host', () => {
  it('resets the popup\'s font-family, which MapLibre sets on the map container', () => {
    // `maplibre-gl.css` line 1: `.maplibregl-map{font:12px/20px Helvetica Neue,Arial,...}`. The
    // popup is a child of that container, so the whole `lg+` card inherited it. Measured at
    // 1280x900 before this rule: 36 of 37 text nodes Helvetica Neue (only the `<h2>`, which
    // carries `font-heading`); after: 38 of 38 Manrope.
    //
    // `font-sans`, not `font: inherit` — measured, inherit resolves to `.maplibregl-map`'s own
    // Helvetica and changes nothing. That is the mistake this assertion exists to catch.
    const rule = GLOBALS.slice(GLOBALS.indexOf('.maplibregl-popup-content'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('font-sans!');
    expect(body).not.toContain('inherit');
  });

  it('leaves the map\'s own attribution alone', () => {
    // The CARTO/OSM credit is a licence condition, not our typography. It is a sibling of the
    // popup, not a child, so it keeps MapLibre's font — verified at 1280x900, still Helvetica
    // Neue 12px after the rule above. The reset must stay scoped to `-popup-content`.
    const popupRule = GLOBALS.slice(GLOBALS.indexOf('.maplibregl-popup-content {'));
    expect(popupRule.slice(0, popupRule.indexOf('}'))).not.toContain('maplibregl-map');
    expect(GLOBALS).not.toContain('.maplibregl-map {');
  });
});

describe('one vertical vocabulary, with no host-conditional numbers in it', () => {
  const BAND = 'mt-4 flex flex-col gap-3 border-t border-border/60 pt-4';

  it('gives both bands the same 16 px step, with no popover arm', () => {
    // This was `mt-5 pt-5` with an `isPopover && "mt-4 pt-4"` override — one rule carried by two
    // hand-tuned numbers and no token, and the phone got the larger half. Band 2 and band 3 are
    // the only two, so the count is the assertion: a third band, or one of these two drifting,
    // both fail here.
    expect(SOURCE.split(BAND).length - 1).toBe(2);
    expect(SOURCE).not.toContain('mt-5 flex flex-col gap-3 border-t');
    expect(SOURCE).not.toMatch(/isPopover && ['"]mt-4 pt-4/);
  });

  it('keeps the card column on the 4 px grid', () => {
    // `pt-3.5` (14) was the card's only off-grid spacing value. Scoped to the detail column's own
    // class string: the *list* header above uses `pt-3.5` for its own reasons and is not this card.
    const column = SOURCE.slice(SOURCE.indexOf('flex min-h-0 flex-1 flex-col overflow-y-auto'));
    expect(column.slice(0, 120)).toContain('pt-3');
    expect(column.slice(0, 120)).not.toContain('pt-3.5');
  });

  it('sets the name at display leading, not body leading', () => {
    // `text-2xl`'s own line-height is 32 px on 24 px type. `leading-tight` is 30 — 4 px on a
    // one-line name, 9 on a two-line one, all of it above the fold.
    const heading = SOURCE.slice(SOURCE.indexOf('break-words font-heading text-2xl'));
    expect(heading.slice(0, 160)).toContain('leading-tight');
  });
});

describe('the source still, and the referrer policy that rides on it', () => {
  it('keeps the referrer policy on every host', () => {
    // Not this task's subject, and exactly why it is asserted beside a change to the same element:
    // without it the browser tells TikTok's CDN which of our users asked for which signed URL.
    for (const props of [{}, { variant: 'popover' }, { variant: 'panel' }, { variant: 'hosted' }]) {
      expect(imageOf(detail(props))).toContain('referrerPolicy="no-referrer"');
    }
  });
});
