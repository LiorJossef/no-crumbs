/**
 * Loads MapLibre's right-to-left text plugin, without which every Hebrew and Arabic label on the
 * basemap renders backwards.
 *
 * This is not cosmetic and it is not a niche locale. MapLibre lays glyphs out in logical order and
 * has no bidirectional algorithm of its own; the plugin is where Unicode BiDi and Arabic shaping
 * live. Without it, CARTO's Hebrew street names came through the renderer character-reversed —
 * observed in the running app on 2026-08-28, where פרישמן rendered as "ומשירפ" and
 * שדרות דוד בן גוריון as "ויירוג'ב דוד תורדש". Every Hebrew label on the map was wrong, on a
 * product whose primary market reads Hebrew (`p002-hebrew-english-is-the-language-scope`).
 *
 * ## Why the file is vendored rather than fetched from a CDN
 *
 * `setRTLTextPlugin` takes a URL because the plugin runs inside MapLibre's web worker. The
 * upstream example points at unpkg. We serve our own copy from `public/vendor/` instead:
 *
 *  - a third-party script executing in our origin's worker is a supply-chain surface, and a CDN we
 *    do not control can change what it serves at that URL;
 *  - the map is the product's main surface, so a CDN outage would silently un-fix this;
 *  - no cross-origin request means nothing about our users leaks to a third party on map load.
 *
 * The copy is `@mapbox/mapbox-gl-rtl-text@0.4.0`, BSD-2-Clause, redistributed with its licence
 * alongside it at `public/vendor/mapbox-gl-rtl-text/LICENSE.md` as that licence requires.
 *
 * ## Why `lazy: false`
 *
 * Lazy loading defers the fetch until RTL text is *encountered*, which means the first frame of a
 * Tel Aviv map paints reversed labels and then reflows. Our default region is Hebrew-speaking, so
 * the lazy path is the common path and its flash of wrong text is the thing we are fixing.
 */

import { getRTLTextPluginStatus, setRTLTextPlugin } from 'maplibre-gl';

const PLUGIN_URL = '/vendor/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js';

/**
 * Idempotent. `setRTLTextPlugin` throws if called a second time, and in dev this module is
 * evaluated again on every hot reload, so the status check is load-bearing rather than defensive:
 * `'unavailable'` is MapLibre's word for "no plugin has been set yet".
 */
export function ensureRtlTextPlugin(): void {
  if (typeof window === 'undefined') return;
  if (getRTLTextPluginStatus() !== 'unavailable') return;

  // The returned promise rejects on a failed fetch. A missing RTL plugin degrades to the behaviour
  // we had before this file existed — reversed labels — so it must never take the map down with it.
  void setRTLTextPlugin(PLUGIN_URL, false).catch((error: unknown) => {
    console.error('[map] RTL text plugin failed to load; Hebrew labels will render reversed', error);
  });
}
