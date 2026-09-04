/**
 * **The row↔pin coupling, canvas half** — `W3-2`, `ux-overnight-specs.md` §2.2,
 * `facelift-plan.md` §3a: pointing at a row *"lifts its pin and dims its neighbours, because these
 * are the same object"*. It is the only row in the state matrix that crosses a rendering boundary:
 * pins are painted into a WebGL canvas and have no nodes, so `group-hover:` cannot reach them and
 * the DOM half and the canvas half are two mechanisms carrying one idea.
 *
 * This file covers the canvas half. The DOM half lives in `place-sheet.tsx`, which is another
 * lane's file tonight and is not wired here yet.
 *
 * **What matters as much as the effect is what it costs.** Hover changes at pointer rate, so every
 * assertion below about *which property* is being written is a performance assertion wearing a
 * correctness one: a paint property re-evaluates on the compositor, a layout property re-lays-out
 * and re-collides every symbol in the layer, and at the 2 000-pin ceiling the second is the frame
 * budget spent on a mouse move.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  LINK_TRANSITION_MS,
  LINKED_DIM_OPACITY,
  pinHighlightLayerLayout,
  pinHighlightLayerPaint,
  pinLayerPaint,
  pinOpacityExpression,
  VISITED_LABEL_OPACITY,
  VISITED_PIN_OPACITY,
} from '@/components/map/marker-style';
import { highlightFeatures } from '@/components/map/pin-highlight-layer';
import { toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

const LAYER_SOURCE = readFileSync('src/components/map/place-marker-layer.tsx', 'utf8');
const HIGHLIGHT_SOURCE = readFileSync('src/components/map/pin-highlight-layer.tsx', 'utf8');

function place(id: string, visited = false): MapPlace {
  return {
    id,
    name: `place ${id}`,
    lat: 32.08 + Number(id.slice(1)) / 1000,
    lng: 34.78,
    category: 'cafe',
    visited,
  } as MapPlace;
}

const LIBRARY = [place('p1'), place('p2', true), place('p3')];

describe('the neighbours quieten', () => {
  /** With nothing pointed at, the expression is exactly what it has always been — a place you have
   *  been to is the same pin, quieter, and everything else is at full strength. The coupling adds
   *  no cost and no behaviour to the resting map. */
  it('is unchanged when nothing is pointed at', () => {
    expect(pinOpacityExpression()).toEqual([
      'case',
      ['to-boolean', ['get', 'visited']],
      VISITED_PIN_OPACITY,
      1,
    ]);
    expect(pinOpacityExpression(VISITED_LABEL_OPACITY, null)).toEqual([
      'case',
      ['to-boolean', ['get', 'visited']],
      VISITED_LABEL_OPACITY,
      1,
    ]);
  });

  /**
   * The pointed-at pin goes to **zero** on this layer, because `pin-highlight-layer.tsx` draws it
   * instead. Drawing both would double the ring and the shadow — the highlight is a larger bitmap
   * at an offset, so the two would not even coincide.
   */
  it('hides the pointed-at pin here, because the highlight layer draws it', () => {
    expect(pinOpacityExpression(VISITED_PIN_OPACITY, 'p2')).toEqual([
      'case',
      ['==', ['get', 'id'], 'p2'],
      0,
      VISITED_PIN_OPACITY,
    ]);
  });

  /**
   * **A neighbour you have already been to does not move at all**, which is the property that makes
   * the dim read as *"the others got quieter"* rather than as a flicker across the whole map. It
   * holds because the dim level **is** the visited level — one number, two meanings, on purpose.
   *
   * Per *property*, not per value: an icon rests at 0.45 and a label at 0.55. The spec named a
   * single `LINKED_DIM_OPACITY` for both, which would have dimmed a visited label from 0.55 to 0.45
   * and made the one mark it says must not move the only one that does. Deliberate deviation.
   */
  it('leaves a visited neighbour exactly where it was, on both properties', () => {
    const icons = pinOpacityExpression(VISITED_PIN_OPACITY, 'p1');
    const labels = pinOpacityExpression(VISITED_LABEL_OPACITY, 'p1');
    expect(icons[3]).toBe(VISITED_PIN_OPACITY);
    expect(labels[3]).toBe(VISITED_LABEL_OPACITY);
    expect(LINKED_DIM_OPACITY).toBe(VISITED_PIN_OPACITY);
  });

  /** It stays a `case` on a feature property, which is what makes it evaluable on the compositor.
   *  A zoom expression, an `interpolate` over time, or anything reading outside the feature would
   *  take it off the paint path. */
  it('stays a per-feature expression, at pointer rate', () => {
    const expression = pinOpacityExpression(VISITED_PIN_OPACITY, 'p2');
    expect(expression[0]).toBe('case');
    expect(JSON.stringify(expression)).not.toContain('zoom');
  });

  /**
   * **Written as paint, in its own effect.** The selection effect beside it writes `icon-image` and
   * `symbol-sort-key`, which are *layout* — a full relayout and re-collision of the layer, paid
   * once per tap. Folding hover into it would charge that per pointer move. This is the assertion
   * that keeps the two apart.
   */
  it('is applied with setPaintProperty and never with setLayoutProperty', () => {
    expect(LAYER_SOURCE).toContain("map.setPaintProperty(pinLayerId, 'icon-opacity'");
    expect(LAYER_SOURCE).toContain("map.setPaintProperty(pinLayerId, 'text-opacity'");
    const hoverEffect = LAYER_SOURCE.slice(LAYER_SOURCE.indexOf("'icon-opacity', pinOpacityExpression"));
    expect(hoverEffect).not.toContain('setLayoutProperty');
  });

  /** The ramp between the two states, declared once on the layer rather than per update, because a
   *  MapLibre transition is read by the GL renderer and cannot resolve a CSS custom property. */
  it('ramps rather than snaps, at the shared link duration', () => {
    const paint = pinLayerPaint();
    expect(paint['icon-opacity-transition']).toEqual({ duration: LINK_TRANSITION_MS, delay: 0 });
    expect(paint['text-opacity-transition']).toEqual({ duration: LINK_TRANSITION_MS, delay: 0 });
    expect(LINK_TRANSITION_MS).toBe(160);
  });
});

describe('the pointed-at pin lifts, and is named', () => {
  /** One feature or none — never the library. Whatever the source holds is what MapLibre parses on
   *  every pointer move, so this is the whole cost of the mechanism. */
  it('draws exactly one feature, or none', () => {
    const data = toPlaceFeatures(LIBRARY);
    expect(highlightFeatures(data, null).features).toHaveLength(0);
    expect(highlightFeatures(data, 'p2').features).toHaveLength(1);
    expect(highlightFeatures(data, 'p2').features[0]?.properties?.id).toBe('p2');
  });

  /** A filter can remove a place while the pointer is still over its row for a frame. Drawing
   *  nothing is the honest answer and is what stops a stale pin hanging over a filtered map. */
  it('draws nothing for an id the map no longer holds', () => {
    expect(highlightFeatures(toPlaceFeatures(LIBRARY), 'gone').features).toHaveLength(0);
  });

  /**
   * **`text-field` carries no zoom gate at all** — not `W2-3`'s ladder, not a `step`. The pointed-at
   * pin is named at every zoom, which is the entire point of the coupling: the row says a name and
   * the map has to say the same name back. One glyph run, so the ladder's budget argument does not
   * reach it.
   */
  it('names the pointed-at pin at every zoom', () => {
    const layout = pinHighlightLayerLayout(['Open Sans Regular']);
    // `label` rather than `name` since MAP-01: the same string for a single-script name, and the
    // direction-broken form for a mixed one (`label-lines.ts`). The property that matters here is
    // unchanged — one `get`, no gate.
    expect(layout['text-field']).toEqual(['get', 'label']);
    expect(JSON.stringify(layout['text-field'])).not.toContain('step');
    expect(JSON.stringify(layout['text-field'])).not.toContain('zoom');
  });

  /** The lift is `icon-translate`, and its transition is the only thing reduced motion removes.
   *  §3a's rule is that the nine animations collapse **to the opacity change**, not to nothing —
   *  so the dim stays in both arms and the pin is still findable without the movement. */
  it('lifts with a transition, and lands instantly under reduced motion', () => {
    expect(pinHighlightLayerPaint(false)['icon-translate']).toEqual([0, -3]);
    expect(pinHighlightLayerPaint(false)['icon-translate-transition']).toEqual({
      duration: LINK_TRANSITION_MS,
      delay: 0,
    });
    expect(pinHighlightLayerPaint(true)['icon-translate-transition']).toEqual({
      duration: 0,
      delay: 0,
    });
    // The lift, not the dim: reduced motion must not remove the opacity change.
    expect(pinHighlightLayerPaint(true)['icon-translate']).toEqual([0, -3]);
  });

  /**
   * **Why a second layer at all**, asserted so the reasoning cannot be lost to a refactor that
   * "simplifies" it back onto the pin layer. `icon-translate` is a paint property MapLibre does not
   * allow to be data-driven, so it takes one value for the whole layer — a layer of one feature is
   * the only way to translate one symbol. And the alternative, swapping the hovered pin's
   * `icon-image` on the main layer, is a layout change per pointer move.
   */
  it('is a layer of its own, and adds exactly one', () => {
    const code = HIGHLIGHT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code.match(/map\.addLayer\(/g) ?? []).toHaveLength(1);
    expect(code).toContain("type: 'symbol'");
    // And the guard on the pin layer — exactly one `addLayer` there — is untouched by this
    // package, which is the reason this file exists rather than a second layer next door.
    const pinCode = LAYER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(pinCode.match(/map\.addLayer\(/g) ?? []).toHaveLength(1);
  });

  /**
   * **It answers no pointer events.** The pin underneath it already owns taps; a second hit target
   * stacked on the first would make which one responds a question about layer order. And it moves
   * no camera: pointing at a row is not asking to go there.
   */
  it('is not a tap target and not a camera mover', () => {
    const code = HIGHLIGHT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const forbidden of ['map.on(', 'easeTo', 'flyTo', 'fitBounds', 'cursor']) {
      expect(code).not.toContain(forbidden);
    }
  });

  /** It appears and disappears with the pins it belongs to, rather than hanging over the summary
   *  bands where the row it names is not on screen either. */
  it("takes the pin layer's own floor", () => {
    expect(HIGHLIGHT_SOURCE).toContain('replacedBelowZoom === null ? {} : { minzoom: replacedBelowZoom }');
  });
});
