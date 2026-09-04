'use client';

/**
 * The one pin the user is pointing at in the list, drawn lifted and named — the canvas half of the
 * row↔pin coupling (`W3-2`, `docs/ux-overnight-specs.md` §2.2, `facelift-plan.md` §3a).
 *
 * The idea it carries is *"these are the same object"*: pointing at a row lifts its pin and quietens
 * the others, so the library and the map stop being two lists of the same places and start being one
 * surface. The dim half lives on the pin layer's own paint expression
 * (`marker-style.ts`, `pinOpacityExpression`); this file is the lift.
 *
 * ## Why it is a second layer rather than an expression on the first
 *
 * Two independent reasons, and either alone would force it.
 *
 * **`icon-translate` is a paint property that MapLibre does not allow to be data-driven.** It takes
 * one value for the whole layer. There is no `case` that lifts one feature and leaves the rest, so a
 * layer holding exactly one feature is the only way to translate exactly one symbol.
 *
 * **And the obvious alternative is unaffordable.** Swapping the pointed-at pin's `icon-image` on the
 * main layer — which is how *selection* works — changes a **layout** property, and that re-lays-out
 * and re-collides every symbol in the layer. Selection pays that once per tap. Hover would pay it
 * per pointer move down a list, and at the 2 000-pin design ceiling (`06` §9.1) that is the frame
 * budget spent on a pointer. One extra symbol costs one quad and no placement pass.
 *
 * ## Why it is its own file
 *
 * `tests/unit/map/no-density-clustering.test.ts` reads `place-marker-layer.tsx` **as text** and
 * asserts it contains exactly one `map.addLayer(`. That guard is what keeps density clustering from
 * coming back under another name, it is correct, and it must not be weakened to make room for a
 * layer that has nothing to do with clustering. `summary-marker-layer.tsx` is in its own file for
 * the same reason and this follows its shape exactly: `useMap`, `useStyleReady`,
 * teardown-before-setup, and one effect that owns the data.
 *
 * ## What it deliberately does not do
 *
 * It answers **no pointer events**. There is no `click`, no `mouseenter`, no cursor change. The pin
 * underneath it in the main layer already answers taps, and a second hit target stacked on the first
 * would make which one responds a question about layer order. It draws, and nothing else.
 *
 * It also does not move the camera, and must not: pointing at a row is not asking to go there.
 */

import { useEffect, useId, useRef } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import { PIN_HIGHLIGHT_LAYER_PREFIX } from './layer-order';
import { pinHighlightLayerLayout, pinHighlightLayerPaint } from './marker-style';
import type { PlaceFeatureCollection } from './place-features';
import { styleTextFont } from './style-text-font';
import { useStyleReady } from './use-style-ready';

/** An empty collection, for "nothing is pointed at". A constant rather than a literal so the effect
 *  below writes the same object identity every time it clears, which costs MapLibre nothing. */
const NOTHING: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Whether the user has asked for less motion.
 *
 * Read at layer creation rather than subscribed to, because the only thing it controls is a
 * transition duration and MapLibre reads that once. A user who changes the setting mid-session gets
 * the new behaviour on the next style load, which is the same latitude every other reduced-motion
 * consumer in the app takes.
 *
 * `matchMedia` is guarded rather than assumed: this component is `'use client'` but the module is
 * imported by a tree that is server-rendered, and a missing implementation is a stale JSDOM or an
 * old WebView rather than a hostile input.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The one feature to draw, or nothing. Exported so the selection rule is testable without a WebGL
 *  context — it is the whole of what this layer's source ever holds. */
export function highlightFeatures(
  data: PlaceFeatureCollection,
  hoveredId: string | null,
): GeoJSON.FeatureCollection {
  if (hoveredId === null) return NOTHING;
  const feature = data.features.find((candidate) => candidate.properties.id === hoveredId);
  // A hovered id that is not in the collection is normal rather than exceptional: a filter can
  // remove a place from the map while the pointer is still over its row for a frame. Drawing
  // nothing is the honest answer, and it is what stops a stale pin hanging over a filtered map.
  return feature === undefined ? NOTHING : { type: 'FeatureCollection', features: [feature] };
}

interface PinHighlightLayerProps {
  /** The same collection the pin layer draws, so the highlight can never disagree with it about a
   *  place's category, name or position. */
  readonly data: PlaceFeatureCollection;
  /** The place the user is pointing at in the list, or `null`. */
  readonly hoveredId: string | null;
  /** The pin layer's own floor, so the highlight appears and disappears with the pins it belongs
   *  to rather than hanging over the summary bands. `null` means the pins have no floor. */
  readonly replacedBelowZoom: number | null;
}

export function PinHighlightLayer({ data, hoveredId, replacedBelowZoom }: PinHighlightLayerProps) {
  const { map } = useMap();
  const styleReady = useStyleReady(map);
  const instanceId = useId().replace(/:/g, '');
  const sourceId = `pin-highlight-${instanceId}`;
  const layerId = `${PIN_HIGHLIGHT_LAYER_PREFIX}${instanceId}`;

  // Read at creation for the same reason `place-marker-layer.tsx` seeds its layout from a ref: the
  // creation effect can re-run (the floor changes), and a hover that is already live must survive
  // the rebuild rather than blinking out until the next pointer move.
  const hoveredIdRef = useRef(hoveredId);
  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!map || !styleReady) return;

    // Teardown on the way in as well as out — see `place-marker-layer.tsx`'s note. A cleanup that
    // throws mid-style-reload otherwise leaves the source behind, and the next `addSource` aborts
    // the whole effect with "there is already a source with this ID".
    const removeOurs = () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Style mid-reload; whatever is left goes with it.
      }
    };

    removeOurs();

    // No images are registered here. The pin bitmaps this layer draws are the *same* ones
    // `place-marker-layer.tsx` registers, by the same ids — registering a second copy would double
    // the atlas for no visual difference, and `map.hasImage` already makes that call idempotent
    // wherever it happens first.
    map.addSource(sourceId, {
      type: 'geojson',
      data: highlightFeatures(dataRef.current, hoveredIdRef.current),
    });

    map.addLayer({
      id: layerId,
      type: 'symbol',
      source: sourceId,
      // The same floor the pins have, so the highlight cannot outlive them into the summary bands
      // where the row it belongs to is not on screen either.
      ...(replacedBelowZoom === null ? {} : { minzoom: replacedBelowZoom }),
      layout: pinHighlightLayerLayout(styleTextFont(map)) as never,
      paint: pinHighlightLayerPaint(prefersReducedMotion()) as never,
    });

    return removeOurs;
  }, [map, styleReady, sourceId, layerId, replacedBelowZoom]);

  // The source's only writer. One feature or none, so this costs a parse of at most one point
  // however large the library is.
  useEffect(() => {
    if (!map || !styleReady) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(highlightFeatures(data, hoveredId));
  }, [map, styleReady, sourceId, data, hoveredId]);

  return null;
}
