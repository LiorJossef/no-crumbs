import type { LatLngBoundsHint } from './types';

/**
 * The box that contains every one of these points, or `undefined` for none.
 *
 * A mount-time hint for `MapSurfaceProps.initialBounds`, used by the two scopes that frame a whole
 * set at once — a collection and the collections index. `/map` does not use it: it picks an anchor
 * area first, because framing 113 places across three countries opens on an ocean.
 */
export function boundsOfPoints(
  points: readonly { readonly lat: number; readonly lng: number }[],
): LatLngBoundsHint | undefined {
  if (points.length === 0) return undefined;

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}
