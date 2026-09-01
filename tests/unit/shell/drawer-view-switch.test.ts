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

  /**
   * **The view change wears the scale's `view` tier, and every transform in it is prefixed.**
   *
   * This assertion started life asserting the opposite — opacity and nothing else — because the
   * view change was built before `lib/interaction.ts` grew a motion vocabulary. It then asserted
   * that `collections-scope.tsx` contained the string `ENTER_SCREEN`, and **that assertion was
   * hollow for a week**: the view change stopped using `ENTER_SCREEN` the day `ViewSwap` landed,
   * and this test went on passing because the constant's name survived in a docblock explaining
   * what the code used to be. A guard that a comment can satisfy is the *"asserting a proxy
   * instead of an invariant"* species `iteration-2-record.md` §8.1 names, and it was found by
   * moving the code the proxy was pointed at.
   *
   * What replaces it is two claims that a comment cannot satisfy:
   *
   *  1. **the swap host is above the places/collections branch.** `map-page-client.tsx` is the one
   *     component that renders all three views, and mounting the transition anywhere below it is
   *     the defect of 2026-09-01: `collections-scope.tsx` held it and returns `null` on the places
   *     view, so `places ↔ collections` — the drawer's most-pressed control — had no host in the
   *     document to hold the outgoing list and cut instead of handing off;
   *  2. **the beats are the scale's**, in `view-swap.tsx`, with no duration invented beside them.
   *
   * Rule 3 is satisfied the way the whole scale satisfies it: the fade carries no prefix and every
   * transform does, so a reduced-motion user gets a full-length cross-fade between two still
   * compositions rather than a cut. Measured in the browser at both settings on 2026-09-01 — under
   * `reduce`, both layers hold `translateX 0.00 px` for every frame while opacity ramps `1 → 0` and
   * `0 → 1`. What this test forbids is a transform that escapes the prefix, the failure
   * `ENTER_POPOVER`'s docblock records finding in three shipped surfaces at once.
   *
   * Read from source rather than from a rendered animation, because a browser reports this
   * misleadingly: `tw-animate-css`'s `enter` keyframe is a single `from` block that *always* names
   * `opacity`, `transform` and `filter`, so `getKeyframes()` lists all three even when the
   * `--tw-enter-*` custom properties leave two of them at identity. Measured at `022a18c`, at both
   * motion settings.
   */
  it('changes view at the view tier, with every transform behind motion-safe', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const at = (path: string) =>
      readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');

    // Claim 1. Both slots, because the sheet and the `lg+` panel are two hosts and a swap that
    // covers one of them is a swap that covers one breakpoint.
    const page = at('src/app/map/map-page-client.tsx');
    expect(page, 'the swap host is mounted above the places/collections branch').toMatch(
      /sheetContent=\{\(stop\) => \(\s*<ViewSwap/,
    );
    expect(page, 'and over the desktop panel too').toMatch(/panelContent=\{\s*<ViewSwap/);
    expect(
      at('src/app/map/collections-scope.tsx'),
      'and not back inside the branch, where it cannot see the places list',
    ).not.toContain('<ViewSwap');

    // Claim 2. The component that owns the transition reaches for the shared scale.
    const swap = at('src/components/ui/view-swap.tsx');
    for (const name of [
      'ENTER_VIEW_FORWARD',
      'ENTER_VIEW_BACK',
      'LEAVE_VIEW_FORWARD',
      'LEAVE_VIEW_BACK',
    ]) {
      expect(swap, `the view change reaches for ${name}`).toContain(name);
    }
    expect(swap, 'and does not invent a duration beside them').not.toMatch(/duration-\[/);

    const interaction = at('src/lib/interaction.ts');
    for (const name of [
      'ENTER_VIEW_FORWARD',
      'ENTER_VIEW_BACK',
      'LEAVE_VIEW_FORWARD',
      'LEAVE_VIEW_BACK',
    ]) {
      const tier = new RegExp(`export const ${name} =\\s*\\n?\\s*'([^']*)'`).exec(interaction)?.[1];
      expect(tier, `${name} is still a single class string`).toBeDefined();
      // The fade is what a reduced-motion user is left with, so it must not be prefixed...
      expect(tier, `${name} still fades`).toMatch(/(?:^|\s)fade-(?:in|out)-0(?:\s|$)/);
      expect(tier).not.toMatch(/motion-safe:fade-/);
      // ...and every transform must be, or that user gets the motion they asked not to have.
      for (const utility of (tier ?? '').split(/\s+/)) {
        if (/(?:^|:)(?:slide-in|slide-out|zoom-in|zoom-out|spin-in|blur-in)/.test(utility)) {
          expect(utility, `${utility} runs regardless of prefers-reduced-motion`).toContain(
            'motion-safe:',
          );
        }
      }
    }
  });
});

describe('the hrefs the one surface passes', () => {
  /**
   * The switch is a dumb control: it renders what it is given. This is its only call site, read
   * from source, because a switch pointing at the view you are already on would pass every
   * assertion above and navigate nowhere.
   *
   * **There is one call site rather than two, and that is the change.** Places and collections were
   * two route clients each mounting a `MapShell`, which is why switching between them was a
   * remount; they are one component and three search-param views now
   * (`app/map/_lib/drawer-view.ts`).
   */
  const read = async (path: string) =>
    (await import('node:fs')).readFileSync(
      (await import('node:url')).fileURLToPath(new URL(`../../../${path}`, import.meta.url)),
      'utf8',
    );

  it('are the two views, built by the module that owns the URL shape', async () => {
    const map = await read('src/app/map/map-page-client.tsx');
    // The `current` arm follows the URL rather than being hard-coded, which is what makes one call
    // site able to serve three views.
    expect(map).toContain("current: view.kind === 'places' ? 'places' : 'collections'");
    expect(map).toContain("placesHref: drawerHref({ kind: 'places' })");
    // Inside a collection this is also the way up: the segment you are on links to the index.
    expect(map).toContain("collectionsHref: drawerHref({ kind: 'index' })");
    // And no literal URL, so the two hrefs cannot drift from the parser that reads them back.
    expect(map).not.toContain("collectionsHref: '/collections'");
  });

  it('is the only place in src that mounts the shell', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = fileURLToPath(new URL('../../../src/', import.meta.url));
    const mounts = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
      (entry) =>
        /\.tsx$/.test(entry) &&
        !entry.endsWith('shell/map-shell.tsx') &&
        readFileSync(`${src}${entry}`, 'utf8').includes('<MapShell'),
    );
    expect(mounts).toEqual(['app/map/map-page-client.tsx']);
  });
});
