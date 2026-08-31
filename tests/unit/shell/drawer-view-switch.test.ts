/**
 * **The drawer's Places / Collections switch, rendered.**
 *
 * Owner, 2026-08-31: *"the collection / places navigation should be inside the drawer, dont make
 * the page flicker."* The control that answers the first half is `DrawerViewSwitch` in
 * `map-shell.tsx`, and the two properties that make it safe are not visible in a diff:
 *
 * 1. **It is two real `<a href>`s.** The dispatch's rule 2 — *nothing may depend on JavaScript to
 *    become visible* — has been broken twice in this product by withholding a mount, and a switch
 *    built out of `onClick` would break it a third time in the quieter way: present, focusable and
 *    inert with hydration killed. Rendering with `react-dom/server` is exactly the state a browser
 *    is in before hydration, so what this file asserts is what a person gets in that window.
 * 2. **The on state is the attribute, not a second variable.** Same rule 6a `BottomNav` is held to:
 *    a class string chosen by a ternary can render a tab looking selected while telling a screen
 *    reader it is not. The variant is `aria-[current]:`, over an attribute that is already there.
 *
 * The **panel** is what is rendered here rather than the sheet, and that is a fact about the
 * server rather than a choice: vaul portals `Drawer.Content` to `document.body`, and a portal
 * emits nothing during `renderToStaticMarkup`. The switch is one component rendered from two
 * places, so the panel is a faithful witness for both — and `sheet-geometry.test.ts` holds the
 * *sheet's* call site, including the stop it is withheld at, from the source.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/map',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { MapShell } = await import('@/components/shell/map-shell');
const { useMapShell } = await import('@/components/shell/use-map-shell');

/**
 * The shell, rendered around a stub. `useMapShell` is a hook, so it needs a component to live in;
 * this is the smallest one that gives the shell a real state object rather than a hand-built
 * imitation of it.
 */
function shellMarkup(current: 'places' | 'collections'): string {
  function Host() {
    const shell = useMapShell({ restingStop: 'half' });
    return createElement(MapShell, {
      shell,
      places: [],
      restingStop: 'half',
      views: {
        current,
        placesHref: '/map',
        collectionsHref: '/collections',
      },
      sheetContent: () => null,
      panelContent: null,
    });
  }
  return renderToStaticMarkup(createElement(Host));
}

/** The switch's own `<nav>`, as raw markup. Found by its label, so a second `<nav>` in the
 *  document — `BottomNav`'s `Main` — cannot be mistaken for it. */
function switchMarkup(markup: string): string {
  const match = /<nav aria-label="Places and collections"[\s\S]*?<\/nav>/.exec(markup);
  return match?.[0] ?? '';
}

/** The `<a>` inside the switch whose visible text is `label`. */
function segment(markup: string, label: string): string {
  const links = switchMarkup(markup).match(/<a[^>]*>[\s\S]*?<\/a>/g) ?? [];
  return links.find((candidate) => candidate.includes(`>${label}<`)) ?? '';
}

describe('the switch exists before any JavaScript runs', () => {
  it('renders two links, to the two views, in the server payload', () => {
    const markup = shellMarkup('places');
    expect(switchMarkup(markup)).not.toBe('');
    expect(segment(markup, 'Places')).toContain('href="/map"');
    expect(segment(markup, 'Collections')).toContain('href="/collections"');
  });

  it('has no other control in it — a switch is two destinations and nothing else', () => {
    const inside = switchMarkup(shellMarkup('places'));
    expect(inside.match(/<a[^>]/g) ?? []).toHaveLength(2);
    expect(inside).not.toContain('<button');
  });

  it('reserves exactly the height sheet-geometry subtracts for it', () => {
    // The two are one number read by two files. A switch that grew a row would leave every list
    // under it short by the difference, with nothing failing anywhere.
    expect(switchMarkup(shellMarkup('places'))).toContain('height:56px');
  });
});

describe('which view you are on', () => {
  it('marks the current segment and only the current segment', () => {
    const onPlaces = shellMarkup('places');
    expect(segment(onPlaces, 'Places')).toContain('aria-current="page"');
    expect(segment(onPlaces, 'Collections')).not.toContain('aria-current');

    const onCollections = shellMarkup('collections');
    expect(segment(onCollections, 'Collections')).toContain('aria-current="page"');
    expect(segment(onCollections, 'Places')).not.toContain('aria-current');
  });

  it('renders the identical class string either way, so nothing is chosen by a ternary', () => {
    const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1];
    expect(classOf(segment(shellMarkup('places'), 'Places'))).toBe(
      classOf(segment(shellMarkup('collections'), 'Places')),
    );
  });

  it('paints the on state from the attribute that is already on the element', () => {
    const places = segment(shellMarkup('places'), 'Places');
    expect(places).toContain('aria-[current]:bg-card');
    expect(places).toContain('aria-[current]:text-foreground');
    // The resting arm is unconditional, so it ships on the current segment too.
    expect(places).toContain('text-muted-foreground');
  });
});

describe('what it does under prefers-reduced-motion', () => {
  /**
   * Rule 3 of the dispatch: a view transition collapses to an opacity change and stays usable —
   * not to nothing, and never to a pulse. The switch's own answer is that **every moving part of
   * it is behind `motion-safe:`** and none of them is the thing that makes it usable: the label,
   * the href, the focus ring and the `aria-current` fill are all unconditional.
   *
   * The *transition between the views* is the other half, and it is an opacity ramp with no
   * displacement at all — see `collections-drawer-client.tsx`, which is why there is nothing here
   * to branch on.
   */
  it('puts every animation behind motion-safe', () => {
    const inside = switchMarkup(shellMarkup('places'));
    for (const match of inside.match(/[\w:[\]-]*(?:transition|animate-|duration-)[\w[\]-]*/g) ?? []) {
      expect(match, `${match} runs regardless of prefers-reduced-motion`).toContain('motion-safe:');
    }
  });

  it('keeps the label, the href and the focus ring outside it', () => {
    const places = segment(shellMarkup('places'), 'Places');
    expect(places).toContain('>Places<');
    expect(places).toContain('href=');
    expect(places).toContain('focus-visible:ring-3');
  });
});

describe('the hrefs each surface passes', () => {
  /**
   * The switch is a dumb control: it renders what it is given. These are the two call sites, read
   * from source, because a switch pointing at the view you are already on in both segments would
   * pass every assertion above and navigate nowhere.
   */
  const read = async (path: string) =>
    (await import('node:fs')).readFileSync(
      (await import('node:url')).fileURLToPath(new URL(`../../../${path}`, import.meta.url)),
      'utf8',
    );

  it('are the two views, from both of the two surfaces that render the shell', async () => {
    const map = await read('src/app/map/map-page-client.tsx');
    expect(map).toContain("current: 'places'");
    expect(map).toContain("collectionsHref: '/collections'");

    const collections = await read('src/app/collections/collections-drawer-client.tsx');
    expect(collections).toContain("current: 'collections'");
    expect(collections).toContain("placesHref: '/map'");
    // Inside a collection this is also the way up: the segment you are on links to the index.
    expect(collections).toContain('collectionsHref: collectionsHref(INDEX_VIEW)');
  });
});
