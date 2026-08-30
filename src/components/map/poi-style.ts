/**
 * EXPERIMENT (exp/richer-basemap): what the basemap's own POIs look like.
 *
 * The reference screenshots' "populated and useful" quality is not POI *count* — CARTO's tiles
 * already carry 2 545 POI features in a single Tel Aviv z14 tile, measured 2026-08-30 against
 * `carto.streets/v1`, with ~90 distinct `class` values. It is POI *editing*: a curated set, and
 * colour that says what kind of thing each one is before you read the word.
 *
 * So this file is two decisions and no rendering:
 *
 * 1. **Which classes earn a label.** The tile's top classes by count include `waste_basket` (295),
 *    `bicycle_parking` (469), `gate` (223), `bollard`, `drinking_water` and `toilets`. Drawing
 *    everything with a name is what made the first pass read as clutter rather than detail — street
 *    furniture is data, not orientation. The allow-list below is the things a person navigates by.
 *
 * 2. **What colour it takes.** Grouped, not per-class: six families, each with one colour, so the
 *    map reads as a legend the user never has to be shown.
 *
 * Kept free of React and MapLibre so the grouping can be unit-tested in node, following
 * `marker-style.ts`'s split.
 */

/** The families a basemap POI can belong to. One colour each. */
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
 * product's own category palette (`ui/place/category-display.ts`) — a saved café and a basemap café
 * must not look like the same kind of thing, or the user's own library stops being the subject.
 */
export const POI_GROUP_COLORS: Readonly<Record<PoiGroup, string>> = {
  food: '#b8632c',
  shopping: '#8c5bb8',
  culture: '#c2417e',
  transit: '#3d6fb5',
  outdoors: '#3f7d44',
  civic: '#5a6b7d',
};

/** Every class that draws, in group order. */
export function poiLabelClasses(): string[] {
  return Object.values(POI_GROUPS).flat();
}

/**
 * The `text-color` expression: a `match` on the feature's own `class`, falling through to the
 * neutral. Written here rather than inline in the layer so the grouping and the colour cannot
 * drift apart, and so a test can call it.
 */
export function poiColorExpression(): unknown[] {
  const cases: unknown[] = [];
  for (const [group, classes] of Object.entries(POI_GROUPS) as [PoiGroup, readonly string[]][]) {
    cases.push([...classes], POI_GROUP_COLORS[group]);
  }
  return ['match', ['get', 'class'], ...cases, POI_GROUP_COLORS.civic];
}
