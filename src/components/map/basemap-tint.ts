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
  /**
   * A *floor*, and it exists for the night table (W7-3).
   *
   * Keeping each colour's own lightness is what makes the daytime re-tint safe, and a cap is enough
   * to turn near-white into paper. Night needs the other direction as well: Positron's label ink is
   * dark slate (L ≈ 0.25) and on a dark ground it has to become near-white, which no cap can do.
   *
   * Applied after `maxLightness`, so a role may state a band. Unset everywhere in the light table,
   * where the behaviour is unchanged by construction.
   */
  readonly minLightness?: number;
}

import type { Theme } from '@/lib/theme';
import { POI_TIER_FLOOR } from './poi-style';

export type BasemapRole =
  | 'land'
  | 'water'
  | 'green'
  | 'roadFill'
  | 'roadCase'
  | 'building'
  | 'label'
  | 'labelHalo'
  | 'houseNumber';

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
  /**
   * **A no-op in light, on purpose.** `housenumber` was the one symbol layer `roleFor` matched
   * nothing for, so it kept CARTO's own `#d2b17d` — which is `hsl(36.7, 0.486, 0.657)`. These are
   * its own numbers, so the light map is unchanged to within rounding (`#d4b17b`), and the role
   * exists only so that **night** has something to override. Changing the daytime tan is a
   * separate decision from fixing the night, and this is the night's fix.
   */
  houseNumber: { hue: 36.7, saturation: 0.486 },
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
  // Before the general `label` rule, which `housenumber` does not match anyway — it is first
  // because it is the more specific statement and the ordering rule above says so.
  [/^housenumber/, 'houseNumber'],
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

/**
 * **The night table. `chrome is brand, basemap is geography` — so the map stays cool.**
 *
 * The daytime table pushes everything warm because the product's paper is warm. Night does the
 * opposite on purpose: the chrome around the map is a warm near-black (`--background` is `#131312`)
 * and the map inside it is cool slate. That contrast is the rule, not an accident of taste — a
 * night map tinted with the brand's mint would make the whole screen one material, and the thing a
 * basemap has to stay is *geography under the product* rather than more product.
 *
 * Two structural differences from the light table, both forced by the ground moving:
 *
 * 1. **Roads are lighter than the land**, which is the inversion the whole table turns on. In
 *    daylight the land is paper and roads are near-white lines *on* it, separated by a casing. At
 *    night the land is nearly black and the roads have to be the light thing, or the street grid —
 *    the part of a basemap a person actually navigates by — disappears entirely.
 * 2. **`label` states a floor rather than a cap.** Positron's place labels are dark slate ink; a
 *    cap cannot lighten them and on this ground they would be invisible. `labelHalo` is the mirror
 *    image: on paper the halo is the paper showing through, at night it is the ground, so it caps
 *    hard instead.
 *
 * Water is darker than the land rather than lighter, which is the convention every night basemap
 * follows and the opposite of the daytime table's vivid sky blue: at night the sea is the quiet
 * part of the frame and the coastline reads as land ending, not as water beginning.
 *
 * **That sentence was written before the value delivered it (I2-9).** The sea shipped at L\* 16.8
 * against an L\* 13.1 land — *lighter*, not darker — and the whole coastline was being carried by
 * colour instead. It is true now; see the `water` row.
 */
export const BASEMAP_TINTS_NIGHT: Record<BasemapRole, Tint> = {
  land: { hue: 220, saturation: 0.08, maxLightness: 0.135 },
  // **Measured, and the first draft of this was wrong.** At `L ≤ 0.10` the sea came out `#0f1924`
  // against a `#202225` land: a coastline you cannot see. Contrast ratio hides this — it reported
  // 1.11:1 and would report roughly that for any two near-blacks — so the number that decides this
  // row is perceptual distance, not luminance. This product's very first screen is a coastline; a
  // night map whose sea reads as more land is not a map. All of that still stands.
  //
  // **The ΔE figures it was tuned by did not (I2-9).** They were CIE76: 8.2 for that first draft
  // and 20.3 for the fix. In CIEDE2000 — the metric `basemap-night.test.ts` argues for by name,
  // *because CIE76 mis-ranks differences that are mostly lightness and anything in the blues*,
  // which is this comparison exactly — they are **6.1** and **13.1**. So the fix was never the 2.5×
  // overcorrection it looked like. It was 1.1 above the test's own floor of 12.
  //
  // **What the owner was actually looking at, measured off a rendered 1440×900 dark frame:** the
  // sea was not the brightest thing (L\* 16.8, under buildings 20.7, road casings 21.7, parks 24.2
  // and road fills 30.9). It was the *only coloured* thing. **27.3% of the map carried chroma > 18
  // and 26.3 of those points were the sea** — 96% of the colour on a surface whose subject is the
  // user's pins, spent on the one region with nothing in it.
  //
  // **And it could not be fixed by taking colour out of the sea.** Swept over hue × saturation ×
  // lightness at the shipped land value, ΔE 13.1 is the *most* this parameterisation can buy;
  // every point of chroma removed costs the coastline one for one. Raising the land instead makes
  // it worse, not better, and the land cannot rise anyway — `roadFill` is pinned at 0.29 by the
  // pin-on-a-motorway measurement below, and the land has to stay under it.
  //
  // So the separation is paid for in **lightness** instead, and the sea finally goes under the land
  // the way the block comment above has always claimed. L\* 16.8 → **7.3**, and:
  //
  //   - coastline against the bare land polygon **13.1 → 13.3** (floor 12)
  //   - coastline area-weighted across the *real* shoreline **14.8 → 15.1**, sampled 12 px inland
  //     from every water pixel in a rendered frame. That measurement is also why this row is tuned
  //     against the bare land polygon at all: **72% of the shoreline is that polygon**, the rest
  //     parks and built-up mass, which score higher.
  //   - perceived colourfulness **9.11 → 5.81**, a 36% drop. Lab C\* alone overstates a near-black,
  //     so that figure is C\* scaled by √(L\*/100); raw C\* moves only 22.2 → 21.5.
  //
  // `saturation` at 0.95 is near its ceiling and that is the model, not a hack: at L = 0.10 the
  // most chroma HSL can hold is `0.2 × S` (see `Tint.maxLightness`). **There is no headroom left in
  // this row** — dropping `maxLightness` further collapses the coastline rather than deepening it.
  water: { hue: 214, saturation: 0.95, maxLightness: 0.10 },
  /**
   * **Parks are ground, and get exactly the distinctness the sea gets — no more (I2-9).**
   *
   * They shipped as the second most colourful region on the map and the *lightest* large one after
   * the roads: composited L\* 24.2 by the raw tint, C\* 13.1, brighter than the built fabric they
   * sit among. A park at night is unlit ground; it should not out-shine the buildings.
   *
   * **The number this row was tuned by was measuring the wrong colour.** Positron draws its park
   * fills at ~⅔ opacity, so what reaches the frame is the tint composited over the land — measured
   * `#213629`, not the `#21402b` the tint returns. The shipped ΔE from land was therefore **14.8**,
   * not the 19.4 the raw value scores, and a change judged on the raw value overshoots badly: the
   * first attempt at this row landed the composited park at ΔE 9.6, below the floor and nearly
   * invisible, while the raw value still read as passing.
   *
   * Composited: L\* 20.5 → **15.6**, C\* 13.1 → **11.9**, colourfulness 5.93 → **4.69**, ΔE from
   * land 14.8 → **13.2** — within a tenth of the coastline's own 13.3, which is the bar. Both are
   * regions of the ground that have to be identifiable and nothing more.
   */
  green: { hue: 140, saturation: 0.41, maxLightness: 0.13 },
  // The one role that must end up *above* the land, and by enough to read at a glance — but not so
  // far above it that a pin cannot sit on one.
  //
  // **`0.29` rather than `0.32`, and the number was chosen by the pin rather than by the road.** A
  // night pin body is a light colour and a major road is the lightest thing on the basemap, so the
  // worst case on this whole map is a pin sitting on a motorway. Measured across the three
  // category bodies: at `0.32` the weakest is **2.70:1**, under the 3:1 that a meaningful graphical
  // boundary needs; at `0.29` it is **3.03:1**. The cost is the street grid's own separation from
  // the land, 1.98:1 → 1.76:1, which is still an unmistakable difference in value.
  //
  // Going further keeps helping the pin (3.42 at `0.26`) and keeps costing the grid (1.56), so this
  // is the least the pin needs rather than the most the road can give — the saved places are the
  // subject of this surface and the basemap is what they sit on, but a night map whose streets have
  // faded into the ground is not a map either.
  roadFill: { hue: 220, saturation: 0.05, maxLightness: 0.29 },
  roadCase: { hue: 220, saturation: 0.07, maxLightness: 0.21 },
  building: { hue: 220, saturation: 0.08, maxLightness: 0.20 },
  // A floor, not a cap: see `Tint.minLightness`.
  label: { hue: 220, saturation: 0.05, minLightness: 0.86 },
  labelHalo: { hue: 220, saturation: 0.10, maxLightness: 0.085 },
  /**
   * **The defect this role was added for, and it is a bigger one than it sounds.**
   *
   * `housenumber` is CARTO's `#d2b17d`, a warm tan. On near-white paper that is a whisper — which
   * is why nobody noticed it was never being tinted. On a near-black ground it is the **brightest
   * warm thing on the map**, there are dozens of them in a single frame, and they are within a few
   * degrees of hue of the café pins. The user's own saved places stop being the subject of the
   * surface, which is the one thing `poi-style.ts` says this basemap must never do.
   *
   * Cool, and deliberately dimmer than `label`'s 0.86: a house number is an annotation you read
   * when you are already looking, not a name you navigate by. Above `building` (0.20) so it is
   * legible against the block it sits on, well below the street names so the hierarchy CARTO
   * designed survives the inversion.
   */
  houseNumber: { hue: 220, saturation: 0.05, minLightness: 0.46 },
};

/** The table for one theme. The light one is the default so that every existing caller — including
 *  `basemap-tint-layer.tsx`, which belongs to another lane — keeps its exact behaviour until it
 *  chooses to pass a theme. */
export function basemapTints(theme: Theme = 'light'): Record<BasemapRole, Tint> {
  return theme === 'dark' ? BASEMAP_TINTS_NIGHT : BASEMAP_TINTS;
}

/**
 * A halo is the paper showing through, not ink, so it takes the halo tint whatever the layer —
 * and at night "the paper" is the ground, which is why the night table caps it near black.
 *
 * `theme` is optional and defaults to light for the reason `basemapTints` gives: the application
 * site is in another lane's file and must not change behaviour until it opts in.
 */
export function tintFor(
  role: BasemapRole,
  property: TintedPaintProperty,
  theme: Theme = 'light',
): Tint {
  const tints = basemapTints(theme);
  if (property === 'text-halo-color') return tints.labelHalo;
  return tints[role];
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
  const capped = Math.min(lightnessOf(parsed), tint.maxLightness ?? 1);
  const lightness = Math.max(capped, tint.minLightness ?? 0);
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
