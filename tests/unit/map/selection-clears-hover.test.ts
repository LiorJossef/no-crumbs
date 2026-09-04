/**
 * **Selecting a place must clear the highlight channel** — the owner's report: choose A from the
 * list, tap B on the map, and A is still marked.
 *
 * `selectedId` is single-valued, so this was never two selections. The map marks a place through
 * *two* independent channels — `selectedId`, and `hoveredId`, which `PinHighlightLayer` draws
 * lifted and named — and only the first is exclusive. A list row sets `hoveredId` on focus, a click
 * focuses it, and nothing on the map's side takes it back.
 *
 * The first test states the mechanism (a stale hover really does draw a second marked pin, whatever
 * is selected). The second states the fix as an invariant over the page: **no path may set the
 * selection without clearing the hover**, which is a claim about every call site rather than about
 * the one the report happened to find. Reading the source is the honest way to assert that here —
 * the state lives in a client component with a MapLibre canvas under it, so a unit test cannot
 * drive the real handlers, and an assertion about one handler would leave the other seven.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { highlightFeatures } from '@/components/map/pin-highlight-layer';
import { toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');

function place(id: string): MapPlace {
  return { id, name: `place ${id}`, lat: 32.08, lng: 34.78, category: 'cafe', visited: false } as MapPlace;
}

describe('the highlight channel is the residual', () => {
  it('draws whatever is hovered, with no idea what is selected', () => {
    const features = toPlaceFeatures([place('a'), place('b')]);

    // Selection is not an input here at all — which is exactly why a stale `hoveredId` survives a
    // new selection and marks the old place beside the new one.
    const hovered = highlightFeatures(features, 'a').features;
    expect(hovered).toHaveLength(1);
    expect(hovered[0]?.properties?.id).toBe('a');
    expect(highlightFeatures(features, null).features).toHaveLength(0);
  });
});

describe('every selection clears the hover', () => {
  it('routes every write to the selection through one function that clears it', () => {
    // `setSelectedId` is destructured from `useMapShell` and may be called in exactly one place:
    // inside `selectId`, which clears `hoveredId` in the same update.
    const calls = PAGE.match(/setSelectedId\(/g) ?? [];
    expect(calls, 'a second caller of setSelectedId bypasses the hover clear').toHaveLength(1);

    const wrapper = /const selectId = useCallback\(\s*\(id: string \| null\) => \{\s*setSelectedId\(id\);\s*setHoveredId\(null\);/;
    expect(PAGE).toMatch(wrapper);
  });

  it('clears it when a place is deselected too, not only when another one opens', () => {
    // `selectId(null)` is the deselect path — closing the popover or the detail must not leave the
    // pin it belonged to lifted and named.
    expect(PAGE).toMatch(/selectId\(null\)/);
  });

  it('leaves the hover setter itself reachable only from the list', () => {
    // The row half of the coupling still writes it directly (`onHover={setHoveredId}`); that is the
    // channel working as designed. What must not exist is a *second* clearing rule competing with
    // `selectId`'s.
    expect((PAGE.match(/setHoveredId\(null\)/g) ?? [])).toHaveLength(1);
  });
});
