/**
 * Re-tints CARTO Positron into this product's palette, layer by layer, after the style loads.
 *
 * Positron was chosen to keep the map quiet, and it does — but it is cold neutral grey with blue
 * water, which is every default web map, and the owner's verdict on it was "generic". The fix is
 * not a different vendor style: Voyager is louder in the wrong direction and a hand-authored style
 * is a project. It is that Positron's *structure* is good and only its colours are off-brand.
 *
 * So each layer is assigned a **role** by its id, and every colour in that layer's paint is pushed
 * to the role's hue and saturation **while keeping its own lightness**. Keeping lightness is what
 * makes this safe: Positron's careful contrast between a road and its casing, and every zoom-stop
 * ramp it uses to fade features in, survives untouched — only the temperature moves. A near-white
 * road stays near-white; `#ddd` becomes a warm sand of exactly the same value.
 *
 * Pure and free of MapLibre so the palette can be unit-tested. The application lives in
 * `./basemap-tint-layer.tsx`.
 */

/**
 * Hue in degrees, saturation 0–1. Lightness comes from the colour being replaced, optionally
 * capped.
 *
 * The cap exists because HSL chroma collapses at the ends of the lightness range: the most colour
 * a value at L = 0.98 can hold is `(1 - |2L - 1|) × S ≈ 0.04 × S`, so Positron's near-white land
 * came out of the first version of this indistinguishable from the grey it started as. Capping
 * land at 0.93 is what turns it into paper — and roads, left uncapped at their own L ≈ 1, then
 * read as white lines *on* that paper rather than as the same colour with a casing.
 */
export interface Tint {
  readonly hue: number;
  readonly saturation: number;
  readonly maxLightness?: number;
}

export type BasemapRole =
  | 'land'
  | 'water'
  | 'green'
  | 'roadFill'
  | 'roadCase'
  | 'building'
  | 'label'
  | 'labelHalo';

/**
 * Warm paper, mint water, sage parks. The whole basemap's temperature lives in this one table —
 * changing the map's mood later is editing eight pairs of numbers, not a style file.
 */
export const BASEMAP_TINTS: Record<BasemapRole, Tint> = {
  land: { hue: 40, saturation: 0.46, maxLightness: 0.93 },
  water: { hue: 174, saturation: 0.32, maxLightness: 0.84 },
  green: { hue: 104, saturation: 0.34, maxLightness: 0.89 },
  // Uncapped on purpose: roads keep their own near-white and stand off the land.
  roadFill: { hue: 42, saturation: 0.5 },
  roadCase: { hue: 38, saturation: 0.3, maxLightness: 0.88 },
  building: { hue: 36, saturation: 0.26, maxLightness: 0.9 },
  label: { hue: 32, saturation: 0.16 },
  labelHalo: { hue: 42, saturation: 0.5 },
};

/**
 * Which role a layer belongs to, from its id. Ordered — the first match wins, so the specific
 * patterns (`waterway_label`, `poi_park`) have to precede the general ones (`water`, `park`).
 *
 * A layer that matches nothing is left exactly as CARTO drew it. That is the safe default and the
 * one that matters: CARTO can add or rename layers at any time, and an unrecognised layer should
 * look untouched rather than wrong.
 */
const ROLE_PATTERNS: readonly (readonly [RegExp, BasemapRole])[] = [
  [/label$|^watername|^place_|^roadname|^poi_/, 'label'],
  [/^background$|^landuse_residential$|^aeroway/, 'land'],
  [/^water|^waterway/, 'water'],
  [/^landcover|^park|^landuse$/, 'green'],
  [/_fill|_fill_/, 'roadFill'],
  [/_case|_dash$|^road_path$|^bridge_path$|^tunnel_path$|^rail$|^tunnel_rail$/, 'roadCase'],
  [/^building/, 'building'],
  [/^boundary/, 'roadCase'],
];

export function roleFor(layerId: string): BasemapRole | null {
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(layerId)) return role;
  }
  return null;
}

/** Paint properties worth re-tinting, and which role's tint each one takes. */
export const TINTED_PAINT_PROPERTIES = [
  'background-color',
  'fill-color',
  'fill-outline-color',
  'line-color',
  'text-color',
  'text-halo-color',
  'icon-color',
] as const;

export type TintedPaintProperty = (typeof TINTED_PAINT_PROPERTIES)[number];

/** A halo is the paper showing through, not ink, so it takes the land's tint whatever the layer. */
export function tintFor(role: BasemapRole, property: TintedPaintProperty): Tint {
  if (property === 'text-halo-color') return BASEMAP_TINTS.labelHalo;
  return BASEMAP_TINTS[role];
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return null;

  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1] ?? '';
    const expand = (part: string) => parseInt(part.length === 1 ? part + part : part, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits.slice(0, 1)),
        g: expand(digits.slice(1, 2)),
        b: expand(digits.slice(2, 3)),
        a: digits.length === 4 ? expand(digits.slice(3, 4)) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: expand(digits.slice(0, 2)),
        g: expand(digits.slice(2, 4)),
        b: expand(digits.slice(4, 6)),
        a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const parts = (rgb[1] ?? '').split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts.length > 3 ? parts[3]! : 1 };
  }

  return null;
}

/** Perceived lightness, 0–1. The HSL definition, which is what pairs with the HSL rebuild below. */
function lightnessOf({ r, g, b }: Rgba): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return (max + min) / 2;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 1 ? [c, x, 0]
    : h < 2 ? [x, c, 0]
    : h < 3 ? [0, c, x]
    : h < 4 ? [0, x, c]
    : h < 5 ? [x, 0, c]
    : [c, 0, x];
  return [r, g, b].map((v) => Math.round(((v ?? 0) + m) * 255)) as [number, number, number];
}

/**
 * One colour, moved to the role's temperature and left at its own lightness.
 *
 * Returns the input unchanged for anything it cannot parse — `transparent`, a colour function, a
 * format CARTO has not used here yet. Silently passing through is right: the alternative is
 * painting a layer a colour nobody chose.
 */
export function tintColor(value: string, tint: Tint): string {
  const parsed = parseColor(value);
  if (!parsed) return value;
  const lightness = Math.min(lightnessOf(parsed), tint.maxLightness ?? 1);
  const [r, g, b] = hslToRgb(tint.hue, tint.saturation, lightness);
  return parsed.a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}

/**
 * The same treatment applied through a paint value of any shape.
 *
 * Positron writes colours as plain strings, as legacy `{ stops: [[zoom, colour], ...] }` functions
 * and inside expression arrays. Walking the value and tinting every string that parses as a colour
 * handles all three without this module having to know which is which — and leaves an expression's
 * operator names (`interpolate`, `linear`, `zoom`) alone, because none of them parses as a colour.
 */
export function tintPaintValue(value: unknown, tint: Tint): unknown {
  if (typeof value === 'string') return tintColor(value, tint);
  if (Array.isArray(value)) return value.map((item) => tintPaintValue(item, tint));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        tintPaintValue(item, tint),
      ])
    );
  }
  return value;
}
