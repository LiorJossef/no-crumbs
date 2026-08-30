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

import { POI_TIER_FLOOR } from './poi-style';

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
 * EXPERIMENT (exp/richer-basemap): the Mapbox Standard "Day" palette, read off the reference
 * screenshot, replacing the warm-paper/mint/sage table.
 *
 * The mechanism is unchanged and so is the reason it exists — the whole basemap's temperature is
 * eight pairs of numbers, not a style file. What changed is the direction: land drops almost all
 * its warmth so it reads as neutral near-white paper rather than beige; water goes vivid sky blue
 * instead of pale mint; parks go a fuller leaf green. The lightness caps are raised across the
 * board, and that is the specific fix for "washed out" — the old caps (land 0.93, water 0.84,
 * green 0.89) pulled every colour toward the same flat value and removed Voyager's contrast.
 *
 * Revert = restore the warm-paper table in git history.
 */
export const BASEMAP_TINTS: Record<BasemapRole, Tint> = {
  land: { hue: 36, saturation: 0.09, maxLightness: 0.97 },
  water: { hue: 202, saturation: 0.72, maxLightness: 0.82 },
  green: { hue: 100, saturation: 0.44, maxLightness: 0.86 },
  // Uncapped on purpose: roads keep their own near-white and stand off the land.
  roadFill: { hue: 40, saturation: 0.06 },
  roadCase: { hue: 38, saturation: 0.12, maxLightness: 0.88 },
  building: { hue: 36, saturation: 0.11, maxLightness: 0.93 },
  // Cooler and near-neutral: Mapbox's place labels are dark slate, not brown ink.
  label: { hue: 250, saturation: 0.12 },
  labelHalo: { hue: 40, saturation: 0.08 },
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

/**
 * Zoom ranges we impose on CARTO's own label layers, replacing the style's.
 *
 * The ceiling is the defect, and it is the one that answers the owner's complaint. CARTO stops
 * drawing settlement names at exactly the zoom someone leans in to inspect a place — hamlets and
 * suburbs at 16, cities at 15, towns at 14 — so the closer you look, the less the map says about
 * where you are. `FIT_BOUNDS_MAX_ZOOM` is 15 and a user zooms past it, which lands them on street
 * geometry with no area name anywhere on screen.
 *
 * The floors matter less but are not free: `roadname_major` starts at 13 while the anchor-cluster
 * camera rests around 12–13, so a settled map routinely carries no street name at all.
 *
 * The three road layers are named by CARTO's own class filters, so lowering them is not a blanket
 * "show streets": `roadname_major` is motorway and trunk only, `roadname_pri` primary, and
 * `roadname_sec` secondary and tertiary — between them the roads a person names when they say where
 * something is. `roadname_minor` (16) is deliberately absent: residential street names are the
 * noise that makes a map read as a generic maps app, and they do not answer "roughly where is
 * this". A layer CARTO renames simply keeps its own range — see the application site.
 */
export const LABEL_ZOOM_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  place_town: [8, 24],
  place_city_r5: [8, 24],
  place_city_r6: [8, 24],
  place_villages: [10, 24],
  place_suburbs: [11, 24],
  place_hamlet: [12, 24],
  roadname_major: [11, 24],
  roadname_pri: [11.5, 24],
  roadname_sec: [13, 24],
  // EXPERIMENT (exp/richer-basemap): residential street names, from z15.
  //
  // This layer was deliberately absent, on the reasoning quoted above: residential names are "the
  // noise that makes a map read as a generic maps app". The owner's reference screenshots show
  // them densely (BAY ST, GREEN ST, HYDE ST, POLK ST at z14), and named a populated map as the
  // thing they want, so the trade is being re-tested rather than assumed. z15 rather than CARTO's
  // 16 keeps them out of the z13 resting view and lets them in once the user has leaned in.
  roadname_minor: [15, 24],
};

/**
 * The exact stack every other label layer in the style declares. Matching it is not tidiness: a
 * different stack is a different glyph URL, and a stack CARTO does not serve renders the layer
 * blank with no error.
 */
export const BASEMAP_LABEL_FONT = [
  'Montserrat Regular',
  'Open Sans Regular',
  'Noto Sans Regular',
  'HanWangHeiLight Regular',
  'NanumBarunGothic Regular',
] as const;

/**
 * The POI names layer Positron does not ship.
 *
 * Positron draws no POI text beyond parks and stadiums, so nothing on the map ever says what a
 * saved place is *near* — which is the orientation question. The `poi` source-layer is already in
 * every tile we load, so this adds a layer, not a source, a key or a request.
 *
 * Text only, and there is no icon to suppress: both CARTO styles ship a single sprite image
 * (`circle-11`, used by the city dots), so the "cartoon POI glyphs" this was once rejected over do
 * not exist. `{name}` is the local-script name, so this renders Hebrew in Israel rather than a
 * transliteration.
 *
 * The id starts `poi_`, which `ROLE_PATTERNS` already resolves to `label` — so the tint colours it
 * on the same pass with no change to the role map.
 */
export const POI_LABEL_LAYER_ID = 'poi_label';

/**
 * The POI classes worth naming: the things a person uses to orient themselves. Everyday retail is
 * deliberately absent — a map dense with shops and pharmacies is the "generic maps app" texture,
 * and those labels would compete with the user's own saved places, which are the subject here.
 */
export const POI_LABEL_CLASSES = [
  'park',
  'stadium',
  'attraction',
  'museum',
  'university',
  'college',
  'school',
  'hospital',
  'railway',
  'bus',
  'harbor',
  'airport',
  'cemetery',
  'place_of_worship',
  'library',
  'theatre',
] as const;
/**
 * The lowest zoom at which any POI label draws.
 *
 * Derived from `POI_TIERS` rather than written down again: since `exp/richer-basemap` the classes
 * are tiered, so this is the landmark tier's floor and moves with it. A second literal here is a
 * second thing to forget when a tier is retuned.
 */
export const POI_LABEL_MIN_ZOOM = POI_TIER_FLOOR;
