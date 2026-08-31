/**
 * EXPERIMENT (exp/richer-basemap): what the basemap's own POIs look like.
 *
 * The reference screenshots' "populated and useful" quality is not POI *count* — CARTO's tiles
 * already carry 2 545 POI features in a single Tel Aviv z14 tile, measured 2026-08-30 against
 * `carto.streets/v1`, with ~90 distinct `class` values. It is POI *editing*: a curated set, and
 * colour that says what kind of thing each one is before you read the word.
 *
 * So this file is three decisions and no rendering:
 *
 * 1. **Which classes earn a label.** The tile's top classes by count include `waste_basket` (295),
 *    `bicycle_parking` (469), `gate` (223), `bollard`, `drinking_water` and `toilets`. Drawing
 *    everything with a name is what made the first pass read as clutter rather than detail — street
 *    furniture is data, not orientation. The allow-list below is the things a person navigates by.
 *
 * 2. **At what zoom each one earns it.** See `POI_TIERS`.
 *
 * 3. **What colour it takes.** Grouped, not per-class: six families, each with one colour, so the
 *    map reads as a legend the user never has to be shown.
 *
 * Kept free of React and MapLibre so the grouping can be unit-tested in node, following
 * `marker-style.ts`'s split.
 */

/** The families a basemap POI can belong to. One colour each. */
import type { Theme } from '@/lib/theme';

export type PoiGroup = 'food' | 'shopping' | 'culture' | 'transit' | 'outdoors' | 'civic';

/**
 * `class` values worth a label, by family.
 *
 * Every value here was observed in a real tile — none are guessed from the OpenMapTiles schema.
 * A class that is not listed simply does not draw, which is the safe default: CARTO can add
 * classes at any time and an unrecognised one should be absent rather than uncoloured.
 */
export const POI_GROUPS: Readonly<Record<PoiGroup, readonly string[]>> = {
  food: ['restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'ice_cream', 'beer', 'pub'],
  shopping: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'butcher', 'music', 'bookshop'],
  culture: ['museum', 'art_gallery', 'theatre', 'cinema', 'attraction', 'monument', 'castle',
    'aquarium', 'theme_park', 'artwork'],
  transit: ['railway', 'bus', 'harbor', 'ferry_terminal', 'airport', 'bicycle_rental'],
  outdoors: ['park', 'garden', 'stadium', 'pitch', 'sports_centre', 'playground', 'dog_park',
    'swimming_pool', 'cemetery', 'picnic_site', 'golf'],
  civic: ['hospital', 'pharmacy', 'doctors', 'school', 'college', 'university', 'library',
    'place_of_worship', 'town_hall', 'police', 'fire_station', 'post', 'bank'],
};

/**
 * The label colour per family, read off the reference screenshots.
 *
 * Saturated enough to be legible as a category at 11 px against near-white paper, dark enough to
 * pass as text rather than decoration. These are basemap colours and are deliberately *not* the
 * product's own category palette (`ui/place/palette.ts`) — a saved café and a basemap café must not
 * look like the same kind of thing, or the user's own library stops being the subject.
 *
 * Which is also why they did **not** move into `palette.ts` when the category colours did (W0-2).
 * That module is the product's own place palette and has a `--category-*` token twin in
 * `globals.css` for the DOM to paint from; these six never reach the DOM at all — they exist only
 * inside a MapLibre `match` expression — so they have nothing to be a token of, and filing them
 * beside the product palette would invite exactly the merge this comment exists to prevent.
 */
export const POI_GROUP_COLORS: Readonly<Record<PoiGroup, string>> = {
  food: '#b8632c',
  shopping: '#8c5bb8',
  culture: '#c2417e',
  transit: '#3d6fb5',
  outdoors: '#3f7d44',
  civic: '#5a6b7d',
};

/**
 * The same six, for a night basemap (W7-3).
 *
 * These are ink on the ground, so they invert for the same reason the label role does: measured
 * against the night land (`#202225`), the light six land at **2.91–3.69:1** — every one of them
 * below AA, on small text, which is the worst combination there is. Lifted, they sit at
 * **5.78–6.77:1**.
 *
 * **Hue is preserved and only lightness moves**, which keeps the one thing these colours are for:
 * `food` is still the warm one, `transit` still the blue one. Someone who has learned the map does
 * not have to learn it again at night.
 *
 * The bar for keeping them apart from each other is deliberately *the light set's own worst pair*
 * rather than a number invented here: the light six have `transit`/`civic` at ΔE 10.7 and ship that
 * way, so a night set is honest if it is no worse. It is slightly better — the same pair at **11.7**
 * — and every other pair is above 14.
 */
export const POI_GROUP_COLORS_NIGHT: Readonly<Record<PoiGroup, string>> = {
  food: '#E0925A',
  shopping: '#B98EE0',
  culture: '#E677AE',
  transit: '#7BA6E8',
  outdoors: '#71B978',
  civic: '#9AA8B8',
};

/** The six for one theme. Light by default so every existing caller is unchanged until it opts in
 *  — `basemap-tint-layer.tsx` belongs to another lane. */
export function poiGroupColors(theme: Theme = 'light'): Readonly<Record<PoiGroup, string>> {
  return theme === 'dark' ? POI_GROUP_COLORS_NIGHT : POI_GROUP_COLORS;
}

/**
 * The zoom at which each class earns its label.
 *
 * The owner's verdict on drawing every curated class from z12: "sometimes you can see a lot of
 * places and it's really confusing." At z14 that put every cafe, bank and clothes shop on the map
 * at once, all at equal weight, and the user's own saved places — the entire subject of this
 * product — were competing with a hundred labels they did not choose.
 *
 * The ordering principle is **"would you use this to say roughly where something is?"** A station
 * or a museum orients you from far out. A bakery only matters once you are on the street it is on.
 * So the map reveals detail as the user leans in, instead of showing everything immediately.
 *
 * **These are `minzoom` on four separate layers, not a filter, and that is the load-bearing part.**
 * It copies `zoom-bands.ts`: MapLibre owns the swap, so there is no zoom listener, no React state
 * that changes on zoom, and no re-render as the user pinches. A filter cannot express this at all —
 * `["zoom"]` is only legal as the input to a top-level `step`/`interpolate` in a *paint or layout*
 * property, never inside `filter`, so "this class from z16" has to be a layer boundary.
 *
 * Every class in `POI_GROUPS` appears in exactly one tier. A test asserts that both ways: a class
 * in no tier would silently stop drawing, and a class in two would draw twice and fight itself in
 * the collision index.
 */
export interface PoiTier {
  /** Appended to `POI_LABEL_LAYER_ID` to form the layer id. */
  readonly id: string;
  /** The zoom at which this tier starts drawing. */
  readonly minzoom: number;
  readonly classes: readonly string[];
}

export const POI_TIERS: readonly PoiTier[] = [
  {
    // Things you navigate a city by. These are the only POIs on screen at the zoom the camera
    // rests at, so the saved pins compete with a handful of names rather than a hundred.
    id: 'landmark',
    minzoom: 13,
    classes: ['museum', 'attraction', 'monument', 'castle', 'aquarium', 'theme_park', 'stadium',
      'university', 'hospital', 'railway', 'ferry_terminal', 'harbor', 'airport'],
  },
  {
    id: 'culture',
    minzoom: 15,
    classes: ['art_gallery', 'theatre', 'cinema', 'library', 'place_of_worship', 'college',
      'town_hall', 'park', 'cemetery', 'artwork', 'police', 'fire_station'],
  },
  {
    // Food arrives only once you are looking at a neighbourhood rather than a city. This is the
    // tier the owner's own saved places mostly live in, so it is deliberately the last thing that
    // could crowd them.
    id: 'food',
    minzoom: 16,
    classes: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'bakery', 'ice_cream', 'beer'],
  },
  {
    // Everyday errands, plus `bus` — 898 features in one Tel Aviv z14 tile, the single noisiest
    // class in the whole allow-list, and useless for orientation until you are on the street.
    id: 'retail',
    minzoom: 17,
    classes: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'butcher', 'music', 'bookshop',
      'pharmacy', 'bank', 'post', 'garden', 'playground', 'pitch', 'sports_centre', 'dog_park',
      'swimming_pool', 'bicycle_rental', 'school', 'doctors', 'golf', 'picnic_site', 'bus'],
  },
];

/** The lowest zoom at which any POI label draws. */
export const POI_TIER_FLOOR = Math.min(...POI_TIERS.map((tier) => tier.minzoom));

/** Every class that draws, in group order. */
export function poiLabelClasses(): string[] {
  return Object.values(POI_GROUPS).flat();
}

/**
 * The `text-color` expression: a `match` on the feature's own `class`, falling through to the
 * neutral. Written here rather than inline in the layer so the grouping and the colour cannot
 * drift apart, and so a test can call it.
 */
export function poiColorExpression(theme: Theme = 'light'): unknown[] {
  const colors = poiGroupColors(theme);
  const cases: unknown[] = [];
  for (const [group, classes] of Object.entries(POI_GROUPS) as [PoiGroup, readonly string[]][]) {
    cases.push([...classes], colors[group]);
  }
  return ['match', ['get', 'class'], ...cases, colors.civic];
}
