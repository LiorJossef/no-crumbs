/**
 * **The app's own layers and sources have to survive a theme change.**
 *
 * The gap this file closes, stated plainly: `basemap-tint-round-trip.test.ts` proved that
 * light↔dark restores CARTO's paint, pixel for pixel, and **nothing checked that the product's own
 * pins were still on the map afterwards**. They were not. Verification of the basemap was mistaken
 * for verification of the surface.
 *
 * ## What was measured, before any of this was written
 *
 * Base commit `123fdb0`, a signed-in session on `http://localhost:59420`, Playwright driving a real
 * MapLibre context, `page.emulateMedia({ colorScheme })` for the toggle:
 *
 * | | `places-pins` source features | pins drawn |
 * |---|---|---|
 * | on arrival, light | 87 | 28 (390×844) / 33 (1440×900) |
 * | after light → dark | **0** | **0** |
 * | after dark → light | **0** | **0** |
 * | after two more toggles | **0** | **0** |
 *
 * So it was the **fourth** of the four candidate shapes: the layer was still in
 * `map.getStyle().layers`, `map.getLayer` and `map.getSource` both answered, the paint was intact
 * and the `icon-image` expression was unchanged — **the source was empty**. That distinction is why
 * this test asserts about the source's *seed*, not about opacity or images.
 *
 * ## The mechanism, and therefore the rule
 *
 * `PlaceMarkerLayer`'s setup effect lists `theme` (a pin is a rasterised bitmap and cannot follow a
 * theme after it is drawn — `63cffa5`, W7-3) and `replacedBelowZoom`. It tears the source down and
 * recreates it. The effect that *writes* the source depends on `labelled` alone, so on a theme
 * change it does not re-run, and a source created empty stays empty for the rest of the session.
 *
 * The rule that follows generalises past this one bug, so that is what is asserted here:
 *
 * > A layer file may create its source empty **only** if its creation effect cannot re-run more
 * > often than the effect that fills it. Otherwise it must seed the source with live data.
 *
 * `summary-marker-layer.tsx` satisfies the first arm — `theme` is in both dependency lists.
 * `pin-highlight-layer.tsx` and now `place-marker-layer.tsx` satisfy the second, seeding from a ref
 * written by an effect declared above the creation effect.
 *
 * ## What this test is not
 *
 * It is a **structural** check, read off the source text, because vitest runs in a `node`
 * environment here — there is no jsdom, no testing library and no WebGL, so nothing in this tier
 * can mount a component and run an effect. It cannot see a bug that lives in MapLibre's behaviour
 * rather than in the wiring. The browser measurement above is the evidence that the map works; this
 * is the guard that stops the wiring regressing back to it.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { highlightLayerAbove, PIN_HIGHLIGHT_LAYER_PREFIX } from '@/components/map/layer-order';

const LAYER_FILES = [
  'src/components/map/place-marker-layer.tsx',
  'src/components/map/pin-highlight-layer.tsx',
  'src/components/map/summary-marker-layer.tsx',
] as const;

function read(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

/**
 * Every `useEffect` in a file, as `{ body, deps }`.
 *
 * Split on the dependency array's own closing line, which every effect in these three files writes
 * at two-space indentation. The body of effect *n* is everything since effect *n−1*'s close — more
 * than the effect itself, but the only thing read from it is whether it contains a given call, and
 * a call outside an effect would be a bug of its own.
 */
function effectsOf(source: string): { body: string; deps: string[] }[] {
  const closer = /\n {2}\}, \[([^\]]*)\]\);/g;
  const effects: { body: string; deps: string[] }[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = closer.exec(source)) !== null) {
    effects.push({
      body: source.slice(cursor, match.index),
      deps: (match[1] ?? '')
        .split(',')
        .map((dep) => dep.trim())
        .filter((dep) => dep.length > 0),
    });
    cursor = closer.lastIndex;
  }
  return effects;
}

/**
 * Dependencies that can actually change while the component is mounted.
 *
 * Source and layer ids are derived from `useId`, so they are constant for the life of a mount and
 * their presence in one list and absence from another says nothing. Dropping them is what keeps the
 * subset check below from failing on a difference that cannot happen.
 */
function volatileDeps(deps: string[]): string[] {
  return deps.filter((dep) => !/(sourceid|layerid)$/i.test(dep));
}

describe('a theme change cannot empty an app layer’s source', () => {
  it.each(LAYER_FILES)('%s creates its source safely', (path) => {
    const source = read(path);
    const effects = effectsOf(source);

    const creator = effects.find((effect) => effect.body.includes('map.addSource('));
    expect(creator, `no effect in ${path} calls map.addSource`).toBeDefined();

    // Every `addSource` call's `data:` argument in the creating effect.
    const seeds = [...(creator?.body.matchAll(/map\.addSource\([\s\S]*?data:\s*([^\n]+?),?\n/g) ?? [])]
      .map((seed) => (seed[1] ?? '').trim());
    expect(seeds.length, `no data: argument found in ${path}`).toBeGreaterThan(0);

    const seededFromLiveData = seeds.every(
      (seed) => !/features:\s*\[\s*\]/.test(seed) && !/^emptyCollection\(\)$/.test(seed),
    );
    if (seededFromLiveData) return;

    // Otherwise the writer must re-run every time the creator does, or the empty source is what the
    // user is left looking at.
    const writerDeps = effects
      .filter((effect) => effect !== creator && /\.setData\(/.test(effect.body))
      .flatMap((effect) => effect.deps);
    const missing = volatileDeps(creator?.deps ?? []).filter((dep) => !writerDeps.includes(dep));

    expect(
      missing,
      `${path} creates its source empty, but recreates it on [${missing.join(', ')}] — ` +
        'dependencies the effect that fills the source does not have. Either seed the source with ' +
        'the current features, or give the writer the same dependencies.',
    ).toEqual([]);
  });

  it('place-marker-layer does not seed its source with an empty feature list', () => {
    // The narrow, literal form of the regression, so a future reader sees the exact line that broke
    // rather than only the general rule.
    const source = read('src/components/map/place-marker-layer.tsx');
    const addSource = source.slice(source.indexOf('map.addSource('));
    expect(addSource.slice(0, 200)).not.toMatch(/features:\s*\[\s*\]/);
  });
});

describe('the hover lift stays above the pins across a rebuild', () => {
  const style = (ids: string[]) => ({ getStyle: () => ({ layers: ids.map((id) => ({ id })) }) });

  it('names the highlight layer when one is already in the style', () => {
    expect(
      highlightLayerAbove(style(['background', 'places-pins-r1', `${PIN_HIGHLIGHT_LAYER_PREFIX}r2`])),
    ).toBe(`${PIN_HIGHLIGHT_LAYER_PREFIX}r2`);
  });

  it('answers undefined at first mount, when the pins are added before the lift exists', () => {
    // `addLayer(spec, undefined)` appends, which is what put the lift above the pins originally.
    expect(highlightLayerAbove(style(['background', 'places-pins-r1']))).toBeUndefined();
  });

  it('survives a style with no layers at all', () => {
    expect(highlightLayerAbove({ getStyle: () => undefined })).toBeUndefined();
    expect(highlightLayerAbove({ getStyle: () => ({}) })).toBeUndefined();
  });

  it('is the id the pin layer is inserted before', () => {
    // The wiring, not just the helper: the pin layer must actually pass it to `addLayer`.
    const source = read('src/components/map/place-marker-layer.tsx');
    expect(source).toMatch(/map\.addLayer\([\s\S]*highlightLayerAbove\(map\)\)/);
  });
});
