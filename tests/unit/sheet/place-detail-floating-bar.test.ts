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
 * holds that half; this file holds the clearance — which was padding until round-3 feedback §7.1
 * showed padding only ever fixed the last line, and is a margin from 2026-09-02.
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
  it('reaches the scroll column as a custom property', () => {
    const markup = render({ floatingBarPx: floatingBarClearancePx('half') });
    expect(markup).toContain(`--floating-bar:${BOTTOM_NAV_HEIGHT_PX}px`);
  });

  it('is spent as a margin, so the box ends where the bar begins', () => {
    // **Round-3 feedback §7.1, and the reason this file changed on 2026-09-02.** The bar used to
    // be paid for with `padding-bottom`, which buys exactly one thing: that the *last* control
    // clears the bar once you have scrolled to the end. The column's box still ran to the bottom
    // of the screen, so every line between the fold and the end of the card slid under a
    // `bg-card/90 backdrop-blur-md` pill and was painted blurred rather than clipped — the owner's
    // *"text continues behind/under the navigation"*. Measured at 390×844, `half`, mid-scroll: the
    // `CATEGORY` kicker and the `Change` link rendered over the nav.
    //
    // A margin ends the box at the bar's top edge and the overflow clip does the work at every
    // scroll position. It costs no readable pixels — the 68 px comes off the box and stops being
    // spent on padding, so the last line rests at the same y (measured 758 both ways).
    const markup = render({ floatingBarPx: BOTTOM_NAV_HEIGHT_PX });
    expect(markup).toContain('var(--floating-bar,0px)');
    // Tailwind escapes the arbitrary value into the class name, so this is the class the element
    // actually gets. `mb-`, not `pb-`, is the whole fix.
    expect(markup).toMatch(/class="[^"]*mb-\[calc\(env\(safe-area-inset-bottom\)\+var\(--floating-bar,0px\)\)\]/);
  });

  it('no longer declares scroll-padding-bottom, because there is no covered edge left', () => {
    // It existed so a `scrollIntoView` — the note editor opening, a focus move — did not park its
    // target flush against the edge the bar was painted over. With the box ending above the bar
    // that edge is gone, and a scroll padding equal to the bar would now over-scroll by 68 px.
    const markup = render({ floatingBarPx: BOTTOM_NAV_HEIGHT_PX });
    expect(markup).not.toContain('scroll-padding-bottom');
  });

  it('is zero for a host that has not been taught to ask, and changes nothing there', () => {
    // `0` rather than a thrown error or a default of 68: the `lg+` map popover genuinely has no bar
    // over it, and the `hosted` column is mounted at both breakpoints at once. A component that
    // guessed would be wrong on one of them. The margin then resolves to the safe-area inset
    // alone, which is 0 on a desktop — no phantom padding on the popover, measured at 1440×900.
    const markup = render({});
    expect(markup).toContain('--floating-bar:0px');
  });

  it('never hard-codes the bar’s height into a class name', () => {
    // The rule this whole change exists to state: the number is `BottomNav`'s, imported. A literal
    // `68px` in the padding would pass every other assertion here and drift the day the bar
    // changes — which `bottom-nav.tsx`'s own docblock says is a real possibility it declined.
    const markup = render({ floatingBarPx: BOTTOM_NAV_HEIGHT_PX });
    expect(markup).not.toContain(`+${BOTTOM_NAV_HEIGHT_PX}px+`);
  });
});
