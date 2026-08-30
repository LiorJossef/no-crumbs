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
