/**
 * The seam the persistent map opens, and the two things that go wrong silently if it drifts.
 *
 * `components/shell/persistent-map.tsx` moves `MapSurface` out of the route tree and into the root
 * layout, so that tapping a tab in `BottomNav` stops destroying the MapLibre instance. Measured at
 * commit `9a95444`, 390x844: every `/map` <-> `/collections` hop created **one new WebGL context**
 * and re-requested 13-16 basemap tiles and 3 `style.json`s, which is what the owner was seeing as
 * *"a page refresh"*.
 *
 * The runner is `environment: 'node'`, so nothing here mounts anything. What is checkable without a
 * DOM is the part that fails quietly:
 *
 * 1. **The context bridge.** React resolves context by where an element *renders*. A context a
 *    route provides above `MapShell` now has to be carried across the seam by hand, and a consumer
 *    that loses one does not throw — `use(SomeContext)` returns `null` and the feature just stops
 *    being there. So this asserts the bridge covers every context any route provides, which turns
 *    "someone added a fifth" from an invisible regression into a failing test.
 * 2. **The release rule**, which is a privacy rule: a parked map still holds the signed-in user's
 *    pins in the document, so it has to be released on the routes a signed-out person lands on.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAP_ROUTES, holdsMap, sameIds } from '@/components/shell/persistent-map';

const SRC = join(process.cwd(), 'src');
const PERSISTENT_MAP = readFileSync(join(SRC, 'components/shell/persistent-map.tsx'), 'utf8');
const MAP_SHELL = readFileSync(join(SRC, 'components/shell/map-shell.tsx'), 'utf8');

function walk(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Every `SomethingContext` a route renders as a provider — i.e. every context whose value is
 *  established *above* `MapShell` and therefore above the seam. */
function contextsProvidedByRoutes(): ReadonlySet<string> {
  const found = new Set<string>();
  for (const file of walk(join(SRC, 'app'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<([A-Z][A-Za-z]*Context)\s+value=/g)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
  }
  return found;
}

/**
 * **The one context a route provides that the seam deliberately does not carry.**
 *
 * **There are no exemptions, deliberately.** `AreaFilterContext` (2026-09-04) is read only inside
 * the route subtree today, and it was proposed as an allow-listed exception policed by a second
 * test. An allow-list inside the one gate that exists to catch this seam is a weaker gate, and the
 * bridge is four lines — so the rule stayed absolute and the context is carried like the rest.
 */

describe('the context bridge across the persistent map seam', () => {
  it('carries every context a route provides above the shell', () => {
    const provided = contextsProvidedByRoutes();

    // Fails loudly if the greps stop finding anything, which would make the assertion below vacuous.
    expect(provided.size).toBeGreaterThan(0);

    for (const name of provided) {
      expect(
        PERSISTENT_MAP.includes(`<${name} value=`),
        `${name} is provided by a route but not re-provided in persistent-map.tsx — the map's ` +
          `lg+ popover renders outside that provider and will silently read null`,
      ).toBe(true);
    }
  });

  it('names the five a route provides, so a deletion is as visible as an addition', () => {
    // The list is spelled out rather than derived, because the test above only catches contexts
    // being *added*. Dropping one from the bridge while the route still provides it would pass it.
    expect([...contextsProvidedByRoutes()].sort()).toEqual([
      'AnnounceContext',
      'AreaFilterContext',
      'CollectionsContext',
      'NearMeDistancesContext',
      'TagFilterContext',
    ]);
  });

});

describe('the shell no longer owns the map', () => {
  it('renders the slot rather than the surface', () => {
    // The whole point: if `MapShell` renders `MapSurface` itself again, the surface is back inside
    // the route subtree and a tab change destroys it again — with every symptom this change fixed
    // and no test failing anywhere else.
    expect(MAP_SHELL).toContain('<PersistentMapSlot');
    expect(MAP_SHELL).not.toMatch(/<MapSurface\b/);
  });

  it('imports the surface only as a type', () => {
    expect(MAP_SHELL).toContain("import type { MapPlace } from '@/components/map/map-surface'");
  });

  it('loads the surface dynamically, so maplibre stays out of every route that has no map', () => {
    // A static import from a component the root layout renders puts `maplibre-gl` in the shared
    // client chunk — i.e. on `/` and `/sign-in`, which have no map at all.
    expect(PERSISTENT_MAP).toMatch(/dynamic\(\s*\(\) => import\('@\/components\/map\/map-surface'\)/);
    expect(PERSISTENT_MAP).toContain('{ ssr: false }');
  });
});

describe('which routes may hold the map alive', () => {
  it('holds it across the three tabs and the import takeover', () => {
    expect(holdsMap('/map')).toBe(true);
    expect(holdsMap('/collections')).toBe(true);
    expect(holdsMap('/collections/abc-123')).toBe(true);
    expect(holdsMap('/import')).toBe(true);
  });

  it('releases it wherever a signed-out person can land', () => {
    // Not a memory optimisation. A parked map holds the previous session's pins in the document,
    // and sign-out lands on one of these two.
    expect(holdsMap('/sign-in')).toBe(false);
    expect(holdsMap('/')).toBe(false);
  });

  it('does not match a route that merely starts with the same letters', () => {
    expect(holdsMap('/mapping')).toBe(false);
    expect(holdsMap('/collections-archive')).toBe(false);
  });

  it('lists /profile nowhere, so the map is released on the way to the account screen', () => {
    // Stated as a test because it is the one hop this change deliberately does **not** make
    // seamless: `/profile` has no map, and holding a signed-in user's pins alive behind the screen
    // that offers to delete their data is the wrong trade.
    expect(MAP_ROUTES).not.toContain('/profile');
    expect(holdsMap('/profile')).toBe(false);
  });
});

describe('when a new scope re-frames the camera', () => {
  it('reads the pin set as a set, not as an ordered list', () => {
    expect(sameIds(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    expect(sameIds(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('re-frames when the scope genuinely shows a different set', () => {
    // A collection. The surface frames once per mount and no longer remounts here, so the framing
    // it used to get for free has to be asked for.
    expect(sameIds(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(sameIds(['a', 'b'], ['a', 'd'])).toBe(false);
  });

  it('treats an empty library and an empty collection as the same set', () => {
    expect(sameIds([], [])).toBe(true);
  });

  it('keys the refit on the fit budget as well as the pins', () => {
    // The half that was missing in the first version and that a filmstrip caught: `/map` and
    // `/collections` show the *same* thirty places and frame them completely differently, one
    // behind a 128px peek strip and one behind a full-height sheet. Comparing pins alone let the
    // collections framing — computed behind a sheet nobody can see past — follow the user back to
    // the map, which came to rest two towns further out.
    expect(MAP_SHELL).toContain(
      "const framingBudget = `${restingStop}|${floatingTopChromePx ?? 'default'}`;",
    );
    expect(MAP_SHELL).toContain('framingBudget={framingBudget}');
    expect(PERSISTENT_MAP).toContain(
      'if (previous.framingBudget === framingBudget && sameIds(previous.placeIds, placeIds)) return;',
    );
  });
});
