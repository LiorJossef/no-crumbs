/**
 * A text font stack the loaded basemap style already ships glyphs for.
 *
 * Hardcoding a stack is the usual advice and it is a guess about someone else's style: if CARTO's
 * glyph endpoint has no such stack, the labels render nothing, silently. Borrowing a stack the
 * style is already drawing with cannot be wrong about the style it came from — but it has to be the
 * right *kind* of stack, and that is the measured half. Positron's first symbol layer is a water
 * label in Montserrat Italic, so "first one found" put every place name on the map in italics.
 *
 * Shared rather than copied because it encodes that measurement. A second copy would be a second
 * chance to lose it, and the two would be discovered to have drifted by someone reading italic
 * labels on one layer and upright ones on another.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

const LAST_RESORT = ['Open Sans Regular'];

export function styleTextFont(map: MapLibreMap): string[] {
  let fallback: string[] | null = null;
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const font = layer.layout?.['text-font'];
    if (!Array.isArray(font) || !font.every((f) => typeof f === 'string')) continue;
    const stack = font as string[];
    if (stack.every((f) => !/italic|bold/i.test(f))) return stack;
    fallback ??= stack;
  }
  return fallback ?? LAST_RESORT;
}
