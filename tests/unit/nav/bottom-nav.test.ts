/**
 * The bar's shape and its `aria-current` — the one thing about it a screen reader user hears and a
 * sighted user does not.
 *
 * **The bar holds one destination and one account control since 2026-08-31.** It held three tabs
 * until that morning (`Collections` moved into the drawer as `map-shell.tsx`'s `DrawerViewSwitch`),
 * then two, and now `Profile` is not a tab at all: it is the button that opens the account menu,
 * on the owner's instruction — *"convert the profile page, into a profile popover menu when
 * clicking the profile avatar"*.
 *
 * **These assertions were rewritten rather than relaxed, and the distinction is the point.** The
 * two that failed were asserting the *old shape* — that `Profile` is an `<a>` and that it carries
 * `aria-current="page"` — not a rule that still holds. A menu button is not a link and does not
 * point at a page. So each is replaced by the stronger claim underneath it:
 *
 *  - the bar offers **exactly one** destination link, and it is `Map`;
 *  - the account control is a `<button>` and carries **no `href`** in the live tree;
 *  - it is still marked while you are on its two pages, as `aria-current="true"` — *the current
 *    item in this set* — and **never** as `"page"`, which would be a claim that it links there;
 *  - and the surface it replaces stays reachable with scripting off, through a `<noscript>` anchor,
 *    because a popover cannot open without JavaScript and a control that cannot work is worse than
 *    no control.
 *
 * The claim the old file was mostly about survives untouched and is worth more than the ones that
 * went: **every collections URL lights `Map`**, because the collections views *are* the map screen
 * with different rows in the drawer. A bar that lit nothing there would tell a screen reader user
 * they are on none of the product's destinations while looking at one.
 *
 * Rendered with `react-dom/server`: vitest runs in a `node` environment here, so what is asserted
 * is the markup of the first paint, which is where these attributes live. The account menu is
 * `React.lazy` and is mounted only by a press, so it is correctly absent from every string below.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ value: '/map' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { BottomNav } = await import('@/components/nav/bottom-nav');

function markupAt(route: string): string {
  pathname.value = route;
  return renderToStaticMarkup(createElement(BottomNav));
}

/** The destination `<a>` whose label is `label`, as raw markup. */
function tab(markup: string, label: string): string {
  const tabs = markup.match(/<a[^>]*>.*?<\/a>/g) ?? [];
  return tabs.find((candidate) => candidate.includes(`>${label}</span>`)) ?? '';
}

/** The account control: the `<button>` that opens the menu, found by the attribute the no-JS
 *  stylesheet targets rather than by its label, so a copy change cannot make this silently match
 *  nothing. */
function accountControl(markup: string): string {
  return /<button[^>]*data-profile-trigger[^>]*>[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';
}

/** Everything inside the `<noscript>` blocks — the scripting-off fallback, which is markup React
 *  emits as text and which no browser with JavaScript ever parses. */
function noscript(markup: string): string {
  return (markup.match(/<noscript>[\s\S]*?<\/noscript>/g) ?? []).join('');
}

describe('BottomNav — one destination, one account control', () => {
  it('offers exactly one destination link, and Collections is not one of them', () => {
    const markup = markupAt('/map');
    expect(tab(markup, 'Map')).not.toBe('');
    // The switch that replaced `Collections` lives in the drawer and is asserted in
    // `tests/unit/shell/drawer-view-switch.test.ts`. Here the only claim is that the bar does not
    // offer a second way to the same view.
    expect(markup).not.toContain('href="/collections"');
    expect(tab(markup, 'Collections')).toBe('');
    // One `<a>` in the live tree, full stop. The `<noscript>` fallback carries a second one and is
    // excluded, because no browser running this code ever parses it.
    const live = markup.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    expect(live.match(/<a[^>]*href=/g) ?? []).toHaveLength(1);
  });

  it('makes the account control a button rather than a link, because it opens a menu', () => {
    const control = accountControl(markupAt('/map'));
    expect(control).not.toBe('');
    expect(control).toContain('type="button"');
    expect(control).not.toContain('href');
    // The visible label is the constant `Profile` on every account. Chrome is learned by position
    // and label; a label that differs per account is not a label, and a name here would be the
    // "product that says your name constantly" failure the brief names.
    expect(control).toContain('>Profile</span>');
  });

  it('keeps a scripting-off door to the page the menu replaces', () => {
    // A popover cannot open with JavaScript disabled, so the button is hidden by a `<noscript>`
    // stylesheet and a plain link takes its place. `/profile` still exists and still holds
    // everything the menu holds, which is what makes this a fallback rather than a dead end.
    const fallback = noscript(markupAt('/map'));
    expect(fallback).toContain('[data-profile-trigger]{display:none}');
    expect(fallback).toContain('href="/profile"');
  });

  it('lights Map on every collections URL, because that is the screen you are on', () => {
    for (const route of ['/collections', '/collections?collection=abc-123', '/collections/abc-123']) {
      expect(tab(markupAt(route), 'Map'), route).toContain('aria-current="page"');
    }
  });

  it('marks Map as the page you are on, and only there', () => {
    expect(tab(markupAt('/map'), 'Map')).toContain('aria-current="page"');
    expect(tab(markupAt('/profile'), 'Map')).not.toContain('aria-current');
    expect(tab(markupAt('/account'), 'Map')).not.toContain('aria-current');
  });

  it('marks the account control on its two pages, as "true" and never as "page"', () => {
    // `aria-current="page"` means *this link points at the document you are reading*. This is not a
    // link. `"true"` is the generic member of the same attribute — *the current item within this
    // set of related elements* — which is exactly what the account control is while you are on
    // `/profile` or `/account`. Both pages count: `/account` is reached only from this control's
    // menu, so a bar that marked nothing there would put a screen reader user on none of the
    // product's destinations while looking at one.
    for (const route of ['/profile', '/account']) {
      const control = accountControl(markupAt(route));
      expect(control, route).toContain('aria-current="true"');
      expect(control, route).not.toContain('aria-current="page"');
    }
  });

  it('leaves the control you are not on unmarked', () => {
    expect(accountControl(markupAt('/collections'))).not.toContain('aria-current');
    expect(accountControl(markupAt('/map'))).not.toContain('aria-current');
  });
});

describe('the ＋ means one thing on every tab', () => {
  it('is a button that opens the create menu, never a link to /import', () => {
    const markup = markupAt('/collections?collection=abc-123');
    expect(markup).toContain('aria-label="Create"');
    expect(markup).not.toContain('href="/import"');
    expect(markup).not.toContain('Add a TikTok link');
  });
});

/**
 * The tab's *appearance* now comes from the same attribute the assertions above check, rather than
 * from a class string picked by a ternary beside it (`facelift-plan.md` §3a rule 2, run rule 6a).
 *
 * That is worth its own block because the two used to be independent: `active` decided the classes
 * and `current` decided the attribute, and nothing made them agree. A tab could render selected
 * while telling a screen reader it was not — the defect this file exists to catch, arriving through
 * the one door it was not watching.
 */
describe('BottomNav — the on state is the attribute, not a second variable', () => {
  it('carries both arms as variants rather than a chosen string', () => {
    const map = tab(markupAt('/map'), 'Map');
    expect(map).toContain('aria-[current]:bg-muted');
    expect(map).toContain('aria-[current]:text-foreground');
    // The resting arm is unconditional, so it ships on every tab including the current one.
    expect(map).toContain('text-muted-foreground');
  });

  it('renders the identical class string whether or not the tab is current', () => {
    // The proof that no ternary survives: only the attribute differs between the two.
    const onMap = tab(markupAt('/map'), 'Map');
    const offMap = tab(markupAt('/profile'), 'Map');
    const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1];
    expect(classOf(onMap)).toBe(classOf(offMap));
  });

  it('matches on the attribute rather than on one of its values', () => {
    // The variant is `aria-[current]:`, which matches on the attribute's *presence*. That is what
    // let the third tab carry `'true'` for a section while still looking selected, and it is what
    // will let a future value do the same — an `aria-[current=page]` variant would be a class
    // string that has to be revisited every time the value changes, which is the coupling this
    // block exists to forbid.
    const onCollections = tab(markupAt('/collections?collection=abc'), 'Map');
    expect(onCollections).toContain('aria-current="page"');
    expect(onCollections).toContain('aria-[current]:bg-muted');
  });

  it('acknowledges a press, behind motion-safe', () => {
    expect(tab(markupAt('/map'), 'Map')).toContain('motion-safe:active:scale-95');
  });
});

/**
 * The ＋ FAB's press — W3-1's one miss, found by an independent verifier forcing `:active` across
 * every visible pressable rather than by reading the diff.
 *
 * It is the single most-pressed control in the product and the entry point to the create flow, and
 * it had `hover:` and `focus-visible:` and nothing else. On a phone neither of those fires, so the
 * only confirmation a tap had landed was the sheet arriving a beat later — exactly the gap W3-1
 * exists to close.
 */
describe('BottomNav — the ＋ acknowledges a press', () => {
  const fab = (markup: string) =>
    /<button[^>]*aria-label="[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*?lucide-plus[\s\S]*?<\/button>/.exec(
      markup,
    )?.[0] ?? '';

  it('takes the primary button\'s press, not the chip\'s', () => {
    // It is `bg-primary text-primary-foreground` rendered round — the `default` variant's own fill.
    // The size argument agrees: the matrix gives icon buttons 5% because at 24–36px 1.5% is under
    // half a pixel, and at 56px 1.5% is 1.1px on every edge.
    const button = fab(markupAt('/map'));
    expect(button).toContain('motion-safe:active:scale-98');
    expect(button).not.toContain('motion-safe:active:scale-95');
  });

  it('drops its shadow one level rather than to nothing', () => {
    // It floats over the map. A floating action button that lands flat on press reads as having
    // been switched off rather than pushed — which is why this differs from `default`'s
    // `active:shadow-none`.
    const button = fab(markupAt('/map'));
    expect(button).toContain('shadow-sheet');
    expect(button).toContain('active:shadow-raised');
    expect(button).not.toContain('active:shadow-none');
  });

  it('carries no un-prefixed transition, so reduced motion is not the only branch left', () => {
    // `transition-colors` was superseded by `PRESS_BUTTON`'s `motion-safe:transition` for every
    // pointer user, so it survived *only* in the reduced-motion branch — the same shape as the
    // `transition-all` deleted from the button base, reached from the other direction.
    const button = fab(markupAt('/map'));
    expect(button).not.toMatch(/(?<!motion-safe:)transition-colors/);
    expect(button).toContain('motion-safe:transition');
  });
});
