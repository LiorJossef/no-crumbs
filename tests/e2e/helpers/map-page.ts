/**
 * The shared driver for `/map` — sign-in, the two breakpoint compositions, and the one thing the
 * DOM cannot tell you: what the map is actually rendering.
 *
 * Not a spec file (Playwright's default `testMatch` only picks up `*.spec.ts`), and deliberately
 * importing nothing from `src/` — an end-to-end harness that shares a predicate with the code it
 * is checking is not an independent check.
 *
 * ## Why the map has to be read through React's fiber tree
 *
 * `/map` draws its pins with MapLibre into a `<canvas>` (`components/map/place-marker-layer.tsx`
 * adds a GeoJSON source and a symbol layer). There is **no DOM node per pin**, no test hook, and
 * `preserveDrawingBuffer` is `false` on the WebGL context — measured, so the canvas cannot even be
 * read back as pixels. That leaves three options: assert nothing about the pins (which throws away
 * the invariant this file exists for), add a `data-*` attribute to the map surface (product code,
 * owned by another agent), or reach the live `maplibregl.Map` the way the running app holds it.
 *
 * So `readMap` walks up from the `.maplibregl-map` container's fiber, finds the object that
 * quacks like a MapLibre `Map` (it is held in mapcn's map context and in a `useState` above it),
 * and asks *MapLibre itself* two questions: how many features are in the pin source, and how many
 * pins and cluster bubbles are currently painted in the viewport. That is real rendering evidence,
 * not a re-read of a React prop.
 *
 * The cost is a dependency on a React internal, and it is a real one. It is contained here, it is
 * detected structurally (never by component name, which a production build minifies), and when it
 * cannot find the map it **throws**. A harness that quietly degrades to "asserted nothing" is
 * worse than one that breaks loudly.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
export const PASSWORD = process.env.E2E_PASSWORD;

/** The `lg` breakpoint, which is the only thing that decides which composition is on screen. */
const LG = 1024;

/**
 * Sign in and land on `/map`.
 *
 * The retry loop is inherited from `import-happy-path.spec.ts` and is not superstition: against
 * `next dev` the sign-in form can be submitted before hydration, in which case it falls back to a
 * native GET and nothing happens. See `docs/current-state.md` §5.12 for the related `127.0.0.1`
 * trap — run these with `PLAYWRIGHT_BASE_URL=http://localhost:3000` locally.
 */
export async function signIn(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD as string);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      return;
    } catch {
      /* hydration race; try again */
    }
  }
  throw new Error('could not sign in after four attempts');
}

/** What MapLibre is holding and painting, straight from the map instance. */
export interface MapPins {
  /** Every place name in the pin source — i.e. exactly the array `MapSurface` was given. */
  readonly sourceNames: readonly string[];
  /** Individual pins painted in the current viewport. */
  readonly renderedPins: number;
  /** Places swallowed by cluster bubbles painted in the current viewport. */
  readonly renderedInClusters: number;
}

/**
 * Everything a spec needs to drive `/map` at either breakpoint.
 *
 * Locators are role-based on purpose. Both compositions are always mounted — `PlaceSheet` is
 * `lg:hidden` and `PlaceDesktopPanel` is `hidden lg:block` — so a CSS selector matches the control
 * twice and a strict-mode violation is the *best* case. Role queries walk the accessibility tree,
 * which `display: none` is not in, so each of these resolves to the one copy on screen.
 */
export class MapPage {
  readonly isDesktop: boolean;

  constructor(private readonly page: Page) {
    this.isDesktop = (page.viewportSize()?.width ?? 0) >= LG;
  }

  /** The area heading — `13 places in Tel Aviv-Yafo`, `Nothing matches "…"`. `h1` in the desktop
   *  panel, `h2` in the mobile sheet; both are the only visible heading of their level. */
  heading(): Locator {
    return this.page.getByRole('heading', { level: this.isDesktop ? 1 : 2 });
  }

  /**
   * The saved-place rows currently listed.
   *
   * Scoped to list items rather than matched on the name alone: against `next dev` the overlay
   * contributes a `button "Open Next.js Dev Tools"`, which a bare `/^Open /` counts as a
   * fourteenth saved place. Found by this suite, and it would have been invisible in CI — CI
   * builds and runs `next start`, where that button does not exist.
   */
  rows(): Locator {
    return this.page.getByRole('listitem').getByRole('button', { name: /^Open / });
  }

  /** The `Elsewhere` rows — `London, 2 matches, show on map`. */
  elsewhereRows(): Locator {
    return this.page.getByRole('button', { name: /, show on map$/ });
  }

  searchBox(): Locator {
    return this.page.getByRole('searchbox', { name: 'Search your places' });
  }

  /** The `×` inside the search field. Distinguished from the empty-state escape below by having no
   *  visible text of its own — both carry the accessible name `Clear search`, and both are on
   *  screen at once whenever a search matches nothing. */
  clearSearch(): Locator {
    return this.page
      .getByRole('button', { name: 'Clear search' })
      .filter({ hasNotText: 'Clear search' });
  }

  /** The `Clear search` button rendered *inside* the list when nothing matches anywhere. */
  clearSearchEscape(): Locator {
    return this.page
      .getByRole('button', { name: 'Clear search' })
      .filter({ hasText: 'Clear search' });
  }

  /** The `Tagged · <tag> ×` dismiss pill. */
  activeTagPill(): Locator {
    return this.page.getByRole('button', { name: /^Clear the .+ tag filter$/ });
  }

  /** The pressable chips in whichever detail view is on screen. */
  tagChips(): Locator {
    return this.page.getByRole('list', { name: 'Filter by tag' }).getByRole('button');
  }

  /** One chip by its printed label. `exact`, so `Gelato` never also selects `Gelato Bar`. */
  tagChip(label: string): Locator {
    return this.page
      .getByRole('list', { name: 'Filter by tag' })
      .getByRole('button', { name: label, exact: true });
  }

  /** The `role="status"` live region `map-page-client.tsx` announces filter results through. */
  liveRegion(): Locator {
    return this.page.locator('p[role="status"]');
  }

  /**
   * Make the list visible. On mobile the sheet opens at `peek`, where the list and the search
   * field are both off screen behind a single tap target; on desktop the panel is always open.
   */
  async openList(): Promise<void> {
    if (this.isDesktop) return;
    const peek = this.page.getByRole('button', { name: 'Show your places' });
    if (await peek.isVisible()) await peek.click();
    await expect(this.searchBox()).toBeVisible();
  }

  /** The place names in the list, in order, parsed out of the row's accessible name. */
  async listedNames(): Promise<string[]> {
    const labels = await this.rows().evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? ''),
    );
    return labels.map((label) => label.replace(/^Open /, '').replace(/, tagged .*$/, ''));
  }

  /** The counts on the `Elsewhere` rows — `London, 2 matches, show on map` → `2`. */
  async elsewhereCounts(): Promise<number[]> {
    const labels = await this.elsewhereRows().evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? ''),
    );
    return labels.map((label) => Number(/, (\d+) (?:place|match)/.exec(label)?.[1] ?? '0'));
  }

  /** Ask MapLibre what it is holding and painting. See this file's header for why. */
  async pins(): Promise<MapPins> {
    return readMap(this.page);
  }

  /** How many places the map surface currently holds — the whole library minus the filters, never
   *  narrowed by the viewport. The number to poll on, because the GeoJSON source is written in an
   *  effect one commit after the click. */
  async pinCount(): Promise<number> {
    return (await this.pins()).sourceNames.length;
  }

  /** Pins actually painted right now, individually or inside a cluster bubble. */
  async paintedCount(): Promise<number> {
    const pins = await this.pins();
    return pins.renderedPins + pins.renderedInClusters;
  }

  /**
   * Wait until the library has arrived and the map is holding it. Deliberately not
   * `waitForLoadState`: the pins are written into the GeoJSON source by an effect that runs after
   * the style loads, which no navigation event corresponds to.
   */
  async ready(): Promise<void> {
    await expect(this.page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => this.pins().then((pins) => pins.sourceNames.length).catch(() => -1), {
        timeout: 30_000,
        message: 'the map never received the saved-place library',
      })
      .toBeGreaterThan(0);
    // And wait until it has actually *painted* them. The GeoJSON source is written well before the
    // symbol layer has anything on screen, so a "before" reading taken between the two records
    // zero pins painted and quietly turns every later comparison into a tautology.
    await expect
      .poll(async () => this.paintedCount().catch(() => -1), {
        timeout: 30_000,
        message: 'the map never painted a pin',
      })
      .toBeGreaterThan(0);
  }
}

/**
 * Open the detail view of a listed place that carries tags, and report what its chips say.
 *
 * The fixture is **discovered from the running library**, not hard-coded. The demo database is the
 * owner's working data: rows get imported and deleted, and the enrichment on `Anat Bakery` and
 * friends was hand-seeded rather than written by `supabase/seed.sql`, so a spec pinned to one
 * place name would start failing for a reason that has nothing to do with filtering. What the spec
 * needs is *a* place with *a* tag, and asserting on the tag the product itself printed on the chip
 * is stronger than asserting on one this file believes should be there.
 */
export async function openTaggedPlace(
  map: MapPage,
  page: Page,
  labelMatches?: RegExp,
): Promise<{ name: string; chipLabels: string[] }> {
  const labels = await map
    .rows()
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const candidate = labels.find(
    (label) => label.includes(', tagged ') && (labelMatches ? labelMatches.test(label) : true),
  );
  expect(
    candidate,
    `no listed place carries a tag${labelMatches ? ` matching ${labelMatches}` : ''} — ` +
      `the demo library no longer covers this case. Rows: ${JSON.stringify(labels)}`,
  ).toBeDefined();

  await page.getByRole('button', { name: candidate as string, exact: true }).first().click();
  await expect(map.tagChips().first()).toBeVisible({ timeout: 15_000 });

  const chipLabels = (await map.tagChips().allInnerTexts()).map((text) => text.trim());
  return {
    name: (candidate as string).replace(/^Open /, '').replace(/, tagged .*$/, ''),
    chipLabels,
  };
}

/* --------------------------------------------------------------------------------------------- *
 * The fiber walk. Structural, never name-based: a production build minifies component names but
 * cannot minify the shape of a MapLibre `Map`.
 * --------------------------------------------------------------------------------------------- */

interface Hook {
  readonly memoizedState: unknown;
  readonly next: Hook | null;
}

interface Fiber {
  readonly return: Fiber | null;
  readonly memoizedProps: unknown;
  readonly memoizedState: unknown;
}

async function readMap(page: Page): Promise<MapPins> {
  return page.evaluate(async () => {
    interface StyleLayer {
      readonly id: string;
    }
    interface RenderedFeature {
      readonly properties: Record<string, unknown>;
    }
    interface MaplibreMap {
      getStyle(): { layers?: readonly StyleLayer[] };
      getSource(id: string): { getData(): Promise<{ features: readonly RenderedFeature[] }> } | undefined;
      queryRenderedFeatures(options: { layers: string[] }): readonly RenderedFeature[];
    }

    const isMap = (value: unknown): value is MaplibreMap => {
      if (typeof value !== 'object' || value === null) return false;
      const candidate = value as Record<string, unknown>;
      return (
        typeof candidate['queryRenderedFeatures'] === 'function' &&
        typeof candidate['getStyle'] === 'function' &&
        typeof candidate['getSource'] === 'function'
      );
    };

    const container = document.querySelector('.maplibregl-map');
    if (!container) throw new Error('map harness: no .maplibregl-map container on the page');
    const fiberKey = Object.keys(container).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) {
      throw new Error('map harness: no React fiber on the map container (did the page hydrate?)');
    }

    let node = (container as unknown as Record<string, unknown>)[fiberKey] as unknown;
    let map: unknown = null;
    for (let depth = 0; depth < 40 && node && !map; depth += 1) {
      const fiber = node as Fiber;

      // Function components keep their hooks as a linked list on `memoizedState`; the map is held
      // in one of them, either directly (`useState`) or behind a ref.
      let hook = fiber.memoizedState as Hook | null;
      for (let index = 0; hook && typeof hook === 'object' && index < 60 && !map; index += 1) {
        if (isMap(hook.memoizedState)) map = hook.memoizedState;
        else if (typeof hook.memoizedState === 'object' && hook.memoizedState !== null) {
          const maybeRef = (hook.memoizedState as Record<string, unknown>)['current'];
          if (isMap(maybeRef)) map = maybeRef;
        }
        hook = hook.next;
      }

      // Context providers carry it as `props.value.map`.
      if (!map && typeof fiber.memoizedProps === 'object' && fiber.memoizedProps !== null) {
        for (const value of Object.values(fiber.memoizedProps as Record<string, unknown>)) {
          if (isMap(value)) {
            map = value;
            break;
          }
          if (typeof value === 'object' && value !== null) {
            for (const nested of Object.values(value as Record<string, unknown>)) {
              if (isMap(nested)) {
                map = nested;
                break;
              }
            }
          }
          if (map) break;
        }
      }

      node = fiber.return;
    }

    if (!isMap(map)) {
      throw new Error(
        'map harness: could not reach the MapLibre instance through the React fiber tree. ' +
          'React internals or the map composition changed — fix tests/e2e/helpers/map-page.ts ' +
          'rather than deleting the assertion it feeds.',
      );
    }

    const layerIds = (map.getStyle().layers ?? []).map((layer) => layer.id);
    const pinLayers = layerIds.filter((id) => id.startsWith('places-pins-'));
    const clusterLayers = layerIds.filter((id) => id.startsWith('places-clusters-'));
    if (pinLayers.length !== 1) {
      throw new Error(`map harness: expected one places-pins-* layer, found ${pinLayers.length}`);
    }
    const sourceId = (pinLayers[0] as string).replace('places-pins-', 'places-');
    const source = map.getSource(sourceId);
    if (!source) throw new Error(`map harness: no GeoJSON source ${sourceId}`);

    const data = await source.getData();
    const clusters = map.queryRenderedFeatures({ layers: clusterLayers });

    return {
      sourceNames: data.features.map((feature) => String(feature.properties['name'] ?? '')),
      renderedPins: map.queryRenderedFeatures({ layers: pinLayers }).length,
      renderedInClusters: clusters.reduce(
        (total, feature) => total + Number(feature.properties['point_count'] ?? 0),
        0,
      ),
    };
  });
}
