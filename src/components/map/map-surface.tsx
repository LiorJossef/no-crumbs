/**
 * The public `MapSurface` component and the swap point for its implementation.
 *
 * Callers depend only on `MapSurfaceProps` (`./types.ts`) — never on a vendor map-library type.
 *
 * Three implementations exist, all satisfying the same port:
 *   - `./map-surface.mock.tsx` — plain CSS/DOM visual, no MapLibre.
 *   - `./map-surface.live.tsx` — hand-rolled MapLibre GL + Protomaps (raw layers/paint objects).
 *     Protomaps has been ruled out by the product owner (2026-08-21); this file is stale and kept
 *     only for its raw-MapLibre reference value. Do not wire it in.
 *   - `./map-surface.mapcn.tsx` — the `mapcn` shadcn-registry components (`src/components/ui/map.tsx`)
 *     over MapLibre + CARTO's keyless free vector basemap. **Active today.**
 *
 * D2 was reopened 2026-08-21 (`docs/06-map-and-places-decision.md` §2): Protomaps out, CARTO
 * evaluated in `docs/evidence/licensing/carto-basemap-terms-2026-08-21.md` and found suitable —
 * no API key, a 5M-tile/month free ceiling, one dischargeable attribution line. `map-surface.mapcn`
 * needs no `NEXT_PUBLIC_*` env var at all, so it replaces the mock as the live default.
 */

// import { MapSurfaceLive as MapSurface } from './map-surface.live';
export { MapSurfaceMapcn as MapSurface } from './map-surface.mapcn';
export type { MapPlace, MapSurfaceProps, LatLngBoundsHint } from './types';
