/**
 * `PlaceDetail`'s bottom clearance for a **floating overlay** — `BottomNav`, on every host that is
 * a sheet on a phone.
 *
 * ## The defect, measured rather than reasoned about
 *
 * Product review 2026-08-31 round 3, finding 1. At 390×844, signed in, with a place open in the
 * `/map` sheet: the `Been here` button occupied `y 790–834` and the nav container occupied
 * `776–844`. Hit-testing five points across the button's width returned an element the button did
 * not contain **five times out of five**, and a real touch event at its visual centre — not a
 * synthetic `click()`, which fires on a covered element and is exactly why nobody noticed — took
 * the browser from `/map` to `/profile`. Marking a place *been* was impossible on the primary
 * platform, and the profile screen read `0 been · 7 not been yet` for a five-day-old library.
 *
 * The second half compounded it: the column is `min-h-0 flex-1 overflow-y-auto` and `PlaceSheet`
 * rendered it bare into a `h-full` `Drawer.Content` that vaul *translates* down the screen, so
 * `clientHeight` and `scrollHeight` were both 772 and the scroller was inert. 380 px of the card
 * sat below the viewport with no way to scroll to it. `tests/unit/shell/sheet-geometry.test.ts`
 * holds that half; this file holds the padding.
 *
 * ## Why these are string assertions on markup
 *
 * `vitest.config.ts` sets `environment: 'node'` — there is no jsdom, no layout and no
 * `getBoundingClientRect`, so a test here can only assert what the component *declares*. The
 * browser evidence that the declaration produces a tappable button lives in the task's report, not
 * here. What this file protects is the seam: that the number reaches the element at all, and that
 * it is `BOTTOM_NAV_HEIGHT_PX` rather than a `68` typed into a class name.
 *
 * The Server Action modules are mocked for the same reason `place-detail.test.ts` mocks them —
 * importing them reaches `server-only`, which throws by design outside a Server Component.
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
const { floatingBarClearancePx } = await import('@/components/shell/sheet-geometry');
const { BOTTOM_NAV_HEIGHT_PX } = await import('@/components/nav/bottom-nav-metrics');

import type { DetailPlace } from '@/components/sheet/place-sheet';

const PLACE: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: { placeId: 'place-1', addressLine: '35 Peckham Rye', locality: 'London' },
};

function render(props: { floatingBarPx?: number; variant?: 'sheet' | 'popover' | 'hosted' }): string {
  return renderToStaticMarkup(
    createElement(
      CollectionsContext.Provider,
      { value: { collections: [], byPlaceId: {} } },
      createElement(PlaceDetail, {
        place: PLACE,
        savedPlace: { id: 'saved-1', visited: false },
        onClose: () => {},
        ...props,
      }),
    ),
  );
}

describe('the floating bar’s share of the place detail’s bottom', () => {
  it('reaches the scroll column as a custom property and as scroll-padding', () => {
    const markup = render({ floatingBarPx: floatingBarClearancePx('half') });
    // The variable the padding below consumes, and the scroll padding that keeps a
    // `scrollIntoView` — the note editor opening, a focus move — from parking its target flush
    // against the edge the bar is painted over.
    expect(markup).toContain(`--floating-bar:${BOTTOM_NAV_HEIGHT_PX}px`);
    expect(markup).toContain(`scroll-padding-bottom:${BOTTOM_NAV_HEIGHT_PX}px`);
  });

  it('is spent by the padding rather than sitting in the style unread', () => {
    // The assertion that would have failed if the variable were declared and the class still
    // carried the old `calc(env(safe-area-inset-bottom)+1.25rem)`. Tailwind escapes the arbitrary
    // value into the class name, so this is the class the element actually gets.
    const markup = render({ floatingBarPx: BOTTOM_NAV_HEIGHT_PX });
    expect(markup).toContain('var(--floating-bar,0px)');
  });

  it('is zero for a host that has not been taught to ask, and changes nothing there', () => {
    // `0` rather than a thrown error or a default of 68: the `lg+` map popover genuinely has no bar
    // over it, and the `hosted` column is mounted at both breakpoints at once. A component that
    // guessed would be wrong on one of them.
    const markup = render({});
    expect(markup).toContain('--floating-bar:0px');
    expect(markup).toContain('scroll-padding-bottom:0px');
  });

  it('never hard-codes the bar’s height into a class name', () => {
    // The rule this whole change exists to state: the number is `BottomNav`'s, imported. A literal
    // `68px` in the padding would pass every other assertion here and drift the day the bar
    // changes — which `bottom-nav.tsx`'s own docblock says is a real possibility it declined.
    const markup = render({ floatingBarPx: BOTTOM_NAV_HEIGHT_PX });
    expect(markup).not.toContain(`+${BOTTOM_NAV_HEIGHT_PX}px+`);
  });
});
