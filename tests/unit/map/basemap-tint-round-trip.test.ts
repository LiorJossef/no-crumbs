/**
 * **The theme toggle has to be reversible, and it was not.**
 *
 * The owner's report: dark → light does not restore the light map, while light → dark works. The
 * mechanism is in `basemap-tint-pass.ts`'s header — the pass read live paint, `tintColor` only ever
 * clamps a colour's own lightness, and the light table (`BASEMAP_TINTS`) states no floor at all, so
 * once the night table had pulled the land down to L 0.135 nothing in the day table could lift it.
 *
 * What is pinned here is the *property*, not the palette: the paint after any sequence of toggles
 * depends only on the theme currently asked for. Retuning either table leaves these passing; going
 * back to tinting the live style does not.
 *
 * The paint values below are CARTO Positron's own, read off
 * `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` on 2026-09-02 — plain strings, a
 * legacy `{ stops }` function and an `rgba()` among them, because those three shapes are exactly
 * what `tintPaintValue` has to walk.
 */

import { describe, expect, it } from 'vitest';

import {
  applyBasemapTint,
  BasemapPaintSnapshot,
  paintSnapshotFor,
  type TintTarget,
} from '@/components/map/basemap-tint-pass';

type Paint = Record<string, unknown>;

/** Positron layers spanning every role the tint recognises, plus one it must leave alone. */
function cartoLayers(): { id: string; paint: Paint }[] {
  return [
    { id: 'background', paint: { 'background-color': '#fafaf8', 'background-opacity': 1 } },
    { id: 'water', paint: { 'fill-color': '#d4dadc', 'fill-opacity': 1 } },
    {
      id: 'landcover',
      paint: {
        'fill-color': { stops: [[8, 'rgba(234, 241, 233, 0.5)'], [15, 'rgba(234, 241, 233, 0.5)']] },
        'fill-opacity': 1,
      },
    },
    { id: 'tunnel_minor_fill', paint: { 'line-color': 'rgba(238, 238, 238, 1)', 'line-width': 3 } },
    { id: 'boundary_country_outline', paint: { 'line-color': '#f3efed', 'line-opacity': 0.5 } },
    { id: 'building', paint: { 'fill-color': { base: 1, stops: [[15.5, '#dfdfdf'], [16, '#dfdfdf']] } } },
    {
      id: 'place_city_r5',
      paint: {
        'text-color': '#697b89',
        'icon-color': '#697b89',
        'text-halo-color': 'rgba(255,255,255,0.5)',
      },
    },
    { id: 'roadname_major', paint: { 'text-color': '#838383', 'text-halo-color': '#fff' } },
    // Matches no role pattern, so it must come out of every pass byte-identical to CARTO's own.
    { id: 'watername_ocean_gone_missing', paint: {} },
    { id: 'tunnel_steps', paint: { 'line-color': '#fff' } },
  ];
}

/**
 * A map whose `getStyle()` serialises whatever was last painted — which is MapLibre's actual
 * behaviour and the whole reason the defect existed. A fake that replayed the original style would
 * pass the broken code.
 */
function fakeMap(): TintTarget & { paintOf: () => Record<string, Paint> } {
  const layers = cartoLayers();
  return {
    getStyle: () => ({ layers }),
    setPaintProperty(layerId: string, property: string, value: never) {
      const layer = layers.find((candidate) => candidate.id === layerId);
      if (layer) layer.paint[property] = value;
      return undefined;
    },
    paintOf: () =>
      Object.fromEntries(layers.map((layer) => [layer.id, structuredClone(layer.paint)])),
  };
}

describe('the basemap tint survives a theme toggle', () => {
  it('returns the same light paint after light → dark → light → dark → light', () => {
    const map = fakeMap();
    const snapshot = new BasemapPaintSnapshot();

    applyBasemapTint(map, 'light', snapshot);
    const firstLight = map.paintOf();
    applyBasemapTint(map, 'dark', snapshot);
    const firstDark = map.paintOf();

    for (let round = 0; round < 3; round += 1) {
      applyBasemapTint(map, 'light', snapshot);
      expect(map.paintOf(), `light after round ${round + 1}`).toEqual(firstLight);
      applyBasemapTint(map, 'dark', snapshot);
      expect(map.paintOf(), `dark after round ${round + 1}`).toEqual(firstDark);
    }

    // And the two themes are genuinely different maps — a pass that did nothing would also be
    // stable. The land is the value the owner was looking at.
    expect(firstDark['background']).not.toEqual(firstLight['background']);
  });

  it('lands on the same paint whichever theme the map opened in', () => {
    // A user whose device is dark at load and who then chooses light must get the same map as a
    // user who was light all along. This is the assertion the old pass could not satisfy.
    const fromLight = fakeMap();
    applyBasemapTint(fromLight, 'light', new BasemapPaintSnapshot());

    const fromDark = fakeMap();
    const snapshot = new BasemapPaintSnapshot();
    applyBasemapTint(fromDark, 'dark', snapshot);
    applyBasemapTint(fromDark, 'light', snapshot);

    expect(fromDark.paintOf()).toEqual(fromLight.paintOf());
  });

  it('leaves a layer it has no role for exactly as CARTO drew it', () => {
    const map = fakeMap();
    const snapshot = new BasemapPaintSnapshot();
    applyBasemapTint(map, 'dark', snapshot);
    applyBasemapTint(map, 'light', snapshot);
    expect(map.paintOf()['tunnel_steps']).toEqual({ 'line-color': '#fff' });
  });

  it('shows why the snapshot is the fix: without it, dark → light does not come back', () => {
    // The old behaviour, reproduced exactly — a pass that reads live paint is a pass with a fresh
    // snapshot every time. Kept as a test so the regression cannot return silently.
    const map = fakeMap();
    applyBasemapTint(map, 'light', new BasemapPaintSnapshot());
    const light = map.paintOf();
    applyBasemapTint(map, 'dark', new BasemapPaintSnapshot());
    applyBasemapTint(map, 'light', new BasemapPaintSnapshot());

    expect(map.paintOf()).not.toEqual(light);
    // Specifically: the land stays at the night table's ceiling instead of returning to paper.
    expect(map.paintOf()['background']?.['background-color']).not.toEqual(
      light['background']?.['background-color'],
    );
  });
});

describe('the snapshot', () => {
  it('records a value once and never lets a later write overwrite it', () => {
    const snapshot = new BasemapPaintSnapshot();
    expect(snapshot.original('water', 'fill-color', '#d4dadc')).toBe('#d4dadc');
    expect(snapshot.original('water', 'fill-color', 'rgb(2, 8, 27)')).toBe('#d4dadc');
    expect(snapshot.has('water', 'fill-color')).toBe(true);
    expect(snapshot.has('water', 'line-color')).toBe(false);
    expect(snapshot.size).toBe(1);
  });

  it('is one per map instance and outlives a remount of the layer component', () => {
    const map = {};
    expect(paintSnapshotFor(map)).toBe(paintSnapshotFor(map));
    expect(paintSnapshotFor({})).not.toBe(paintSnapshotFor(map));
  });
});
