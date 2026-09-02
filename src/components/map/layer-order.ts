/**
 * Where the product's own layers sit relative to each other, as values rather than as an accident
 * of which component mounted first.
 *
 * Extracted for the same reason `basemap-tint-pass.ts` was: the rule can then be called by a test
 * that has no WebGL context, where `map.addLayer(spec, beforeId)` is a statement that cannot be
 * asserted on. Kept free of React and of `maplibre-gl` so it imports cleanly in a node test.
 *
 * **The defect it exists for.** `place-marker-layer.tsx` tears its layer down and re-adds it when
 * the theme moves — a pin is a rasterised bitmap and cannot follow a theme after it is drawn — and
 * `addLayer` with no `beforeId` appends to the top. Measured at 123fdb0: a single theme toggle moved
 * the pins from layer index 99 to 100 and the hover lift from 100 to 97, so the one pin the user was
 * pointing at was drawn *beneath* the ordinary pins it exists to stand out from.
 */

/**
 * The prefix every instance of the hover-lift layer's id carries.
 *
 * A prefix rather than an id because the suffix comes from `useId`, so two surfaces on one page
 * each have their own. Owned here rather than in `pin-highlight-layer.tsx` so the pin layer can
 * read it without importing a client component.
 */
export const PIN_HIGHLIGHT_LAYER_PREFIX = "pin-highlight-layer-";

/** The least of MapLibre's `Map` this module needs, so a test can hand it a style it wrote. */
export interface LayerOrderTarget {
  getStyle(): { layers?: readonly { id: string }[] } | undefined;
}

/**
 * The id of the hover-lift layer currently in the style, or `undefined` when there is none.
 *
 * Passed as `addLayer`'s `beforeId` by the pin layer, so "the lift draws above the pins" holds
 * after a rebuild as well as at mount. `undefined` is the honest answer during the first mount —
 * the pin layer's effect runs before the lift's — and `addLayer` reads it as "append", which is
 * what put the lift on top to begin with.
 */
export function highlightLayerAbove(map: LayerOrderTarget): string | undefined {
  return map
    .getStyle()
    ?.layers?.find((layer) => layer.id.startsWith(PIN_HIGHLIGHT_LAYER_PREFIX))
    ?.id;
}
