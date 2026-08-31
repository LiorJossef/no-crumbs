/**
 * The bar's `aria-current`, which is the one thing about it a screen reader user hears and a
 * sighted user does not.
 *
 * `/collections/[id]` is an *ancestor-section* match: the Collections tab is lit because the
 * document lives under it, not because it is that document. `aria-current="page"` there is a claim
 * that is simply false, and the fix is `"true"` — the weaker, accurate one
 * (`docs/ux-collections-as-scope.md` §3, §5 item 5).
 *
 * Rendered with `react-dom/server`: vitest runs in a `node` environment here, so what is asserted
 * is the markup of the first paint, which is where this attribute lives.
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

/** The `<a>` whose label is `label`, as raw markup. */
function tab(markup: string, label: string): string {
  const tabs = markup.match(/<a[^>]*>.*?<\/a>/g) ?? [];
  return tabs.find((candidate) => candidate.includes(`>${label}</span>`)) ?? '';
}

describe('BottomNav aria-current', () => {
  it('marks the collections index as the current page', () => {
    expect(tab(markupAt('/collections'), 'Collections')).toContain('aria-current="page"');
  });

  it('marks a collection as under the tab, not as the tab', () => {
    const collections = tab(markupAt('/collections/abc-123'), 'Collections');
    expect(collections).toContain('aria-current="true"');
    expect(collections).not.toContain('aria-current="page"');
  });

  it('leaves the tabs you are not on unmarked', () => {
    const markup = markupAt('/collections/abc-123');
    expect(tab(markup, 'Map')).not.toContain('aria-current');
    expect(tab(markup, 'Profile')).not.toContain('aria-current');
  });

  it('still marks the map and the profile exactly', () => {
    expect(tab(markupAt('/map'), 'Map')).toContain('aria-current="page"');
    expect(tab(markupAt('/profile'), 'Profile')).toContain('aria-current="page"');
  });
});

describe('the ＋ means one thing on every tab', () => {
  it('is a button that opens the create menu, never a link to /import', () => {
    const markup = markupAt('/collections/abc-123');
    expect(markup).toContain('aria-label="Create"');
    expect(markup).not.toContain('href="/import"');
    expect(markup).not.toContain('Add a TikTok');
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
    // This component passes `'page'` for the route you are on and `'true'` for a section within
    // it. Both mean on, so an `aria-[current=page]` variant would leave the collections *detail*
    // tab looking unselected while announcing itself as current.
    const detail = tab(markupAt('/collections/abc'), 'Collections');
    expect(detail).toContain('aria-current="true"');
    expect(detail).toContain('aria-[current]:bg-muted');
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
