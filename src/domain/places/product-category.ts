/**
 * The category vocabulary the **product** speaks, and how the two vocabularies we are handed
 * translate into it.
 *
 * Three different taxonomies meet on a saved place and none of them is ours:
 *
 *  - `places.category` — the model's seven-value guess from the caption (`ExtractedCategoryHint`).
 *  - `places.provider_category` — the resolver's raw string, Overture's or Google's, in their own
 *    snake_case (`ice_cream_shop`, `mediterranean_restaurant`, `smoothie_juice_bar`).
 *  - `saved_places.category_override` — the user's, and therefore final.
 *
 * Until this file existed we rendered the first of those and ignored the second, which produced
 * the bug that motivated it: Gelalucci, a gelateria, sat in the user's library labelled **"Shop"**
 * — because the caption made the model say `shop` — while the same row carried the provider's
 * `ice_cream_shop` and nothing read it.
 *
 * ## Why a separate type rather than widening `ExtractedCategoryHint`
 *
 * They answer different questions. `ExtractedCategoryHint` is *what the model may emit*: it is
 * pinned to the extraction schema and the prompt, and changing it means a prompt version and a
 * re-measurement. `ProductCategory` is *what we show a person*, and it must be able to say things
 * the model was never offered — starting with `dessert`. Keeping them apart means the display
 * vocabulary can grow at product speed without touching the extractor, and `ProductCategory` being
 * a strict superset keeps every existing hint valid without a mapping table.
 *
 * ## Why `dessert` and nothing else, for now
 *
 * One value was added, on evidence rather than taste. In the Tel Aviv Overture extract
 * `ice_cream_shop` (288 rows), `desserts` (109) and `smoothie_juice_bar` (82) are all sizeable and
 * all land, today, on either `shop` (wrong and unappetising) or `bar` (wrong and misleading). No
 * other missing value has that combination of volume and wrongness. `street food` was considered
 * and left out: `food_stand`/`food_truck` are a rounding error next to `*_restaurant`, and the
 * line between a falafel counter and a small restaurant is one the source data does not draw.
 *
 * Discriminating power beyond this level is **not** this vocabulary's job — `saved_places.tags`
 * already carries *italian*, *specialty coffee*, *natural wine*, *japanese*. A coarse category the
 * user can filter and colour by, plus specific tags, is the right shape. Adding
 * `italian_restaurant` here would just move the provider's taxonomy behind a nicer label.
 */

import type { ExtractedCategoryHint } from './category-hint';

/**
 * `ExtractedCategoryHint`'s seven values plus `dessert`. The superset relation is checked below
 * rather than asserted here, so widening the extraction vocabulary later fails this file's
 * typecheck instead of silently rendering the new value as "Place".
 */
export type ProductCategory =
  | 'restaurant'
  | 'cafe'
  | 'bakery'
  | 'bar'
  | 'dessert'
  | 'attraction'
  | 'shop'
  | 'other';

/** Render order wherever the whole set is listed (a filter row, a legend): the things people save
 *  most, first, then the two we would rather not have to show. */
export const PRODUCT_CATEGORY_ORDER = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'dessert',
  'attraction',
  'shop',
  'other',
] as const satisfies readonly ProductCategory[];

/**
 * What each value is called in a sentence. `other` becomes "Place" rather than "Other" because it
 * appears in the line *under a place's name*, where "Other · Tel Aviv" reads like a database null
 * and "Place · Tel Aviv" reads like a sentence.
 */
export const PRODUCT_CATEGORY_LABEL = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bakery: 'Bakery',
  bar: 'Bar',
  dessert: 'Dessert',
  attraction: 'Attraction',
  shop: 'Shop',
  other: 'Place',
  // The second `satisfies` is the compile-time proof of the superset claim in this file's header:
  // add a value to `ExtractedCategoryHint` without adding it here and this line stops compiling,
  // rather than the new value silently rendering as "Place".
} satisfies Record<ProductCategory, string> & Record<ExtractedCategoryHint, string>;

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === 'string' && value in PRODUCT_CATEGORY_LABEL;
}

/**
 * The exceptions table. Deliberately **not** an exhaustive transcription of either provider's
 * enum — Overture's Tel Aviv extract alone carries 130+ distinct values and Google's list moves
 * without telling us, so an exhaustive table would be stale on arrival and impossible to review.
 *
 * The suffix rules in `productCategoryFromProvider` carry the long tail (every `*_restaurant`,
 * every `*_bar`). This table holds exactly two kinds of entry:
 *
 *  1. values with no suffix a rule can read (`bar`, `bakery`, `diner`, `desserts`);
 *  2. values a suffix rule would get **wrong** — and each of those is a real row we have seen:
 *     `coffee_shop` and `ice_cream_shop` are not shops, `bagel_shop` is a bakery,
 *     `smoothie_juice_bar` and `salad_bar` are not bars.
 */
const PROVIDER_CATEGORY_EXCEPTIONS: Readonly<Record<string, ProductCategory>> = {
  // — cafés —
  cafe: 'cafe',
  coffee_shop: 'cafe',
  tea_room: 'cafe',
  tea_house: 'cafe',
  bubble_tea: 'cafe',
  internet_cafe: 'cafe',
  cat_cafe: 'cafe',

  // — bakeries —
  bakery: 'bakery',
  bagel_shop: 'bakery',
  patisserie: 'bakery',

  // — dessert — the reason this file exists
  desserts: 'dessert',
  dessert_shop: 'dessert',
  ice_cream_shop: 'dessert',
  frozen_yogurt_shop: 'dessert',
  gelato_shop: 'dessert',
  chocolate_shop: 'dessert',
  candy_store: 'dessert',
  confectionery: 'dessert',
  donut_shop: 'dessert',
  juice_shop: 'dessert',
  smoothie_juice_bar: 'dessert',
  acai_shop: 'dessert',

  // — bars — `pub` and `*pub` have no `_bar` to match on
  bar: 'bar',
  pub: 'bar',
  gastropub: 'bar',
  irish_pub: 'bar',
  brewery: 'bar',
  winery: 'bar',
  night_club: 'bar',

  // — restaurants with no `_restaurant` suffix —
  restaurant: 'restaurant',
  diner: 'restaurant',
  bistro: 'restaurant',
  steakhouse: 'restaurant',
  soul_food: 'restaurant',
  food_stand: 'restaurant',
  food_truck: 'restaurant',
  food_court: 'restaurant',
  meal_takeaway: 'restaurant',
  meal_delivery: 'restaurant',
  sandwich_shop: 'restaurant',
  // A salad bar serves lunch; matching `_bar` would file it next to the cocktail bars.
  salad_bar: 'restaurant',
  bar_and_grill: 'restaurant',

  // — shops —
  deli: 'shop',
  delicatessen: 'shop',
  butcher_shop: 'shop',
  liquor_store: 'shop',
  wine_shop: 'shop',

  // — attractions —
  tourist_attraction: 'attraction',
  museum: 'attraction',
  art_gallery: 'attraction',
  park: 'attraction',
  national_park: 'attraction',
  zoo: 'attraction',
  aquarium: 'attraction',
  historical_landmark: 'attraction',
  observation_deck: 'attraction',
  public_plaza: 'attraction',
};

/** Checked in order. First match wins, so `_shop` never gets a chance at `coffee_shop` — the
 *  exceptions table above is consulted before any of these run. */
const PROVIDER_CATEGORY_SUFFIXES: readonly (readonly [string, ProductCategory])[] = [
  ['_restaurant', 'restaurant'],
  ['_cafe', 'cafe'],
  ['_bakery', 'bakery'],
  ['_bar', 'bar'],
  ['_pub', 'bar'],
  ['_shop', 'shop'],
  ['_store', 'shop'],
  ['_market', 'shop'],
];

/**
 * The provider's category, translated — or `null` when we genuinely cannot read it.
 *
 * `null` is a real answer and it matters: `poi_index` carries `barber`, `notary_public`,
 * `topic_publisher` and other rows that are not places to eat at all, and a resolver can hand us
 * any of them. Guessing `shop` for those would be inventing a fact. `null` means "defer to the
 * model", which is what `productCategoryFor` does with it.
 */
export function productCategoryFromProvider(raw: string | null | undefined): ProductCategory | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key.length === 0) return null;

  const exact = PROVIDER_CATEGORY_EXCEPTIONS[key];
  if (exact) return exact;

  for (const [suffix, category] of PROVIDER_CATEGORY_SUFFIXES) {
    if (key.endsWith(suffix)) return category;
  }
  return null;
}

/** What a saved place is called, in the product's own words. */
export interface CategorySources {
  /** `saved_places.category_override`. The user has spoken; nothing outranks it. */
  readonly override?: string | null | undefined;
  /** `places.provider_category` — Overture's or Google's raw string. */
  readonly providerCategory?: string | null | undefined;
  /** `places.category` — the model's guess from the caption. */
  readonly extractedHint?: string | null | undefined;
}

/**
 * Resolve the three claims into the one a person sees.
 *
 * The order is an epistemic ranking, not a preference. The user's override is a statement about
 * their own place. The provider's category is the venue's own registration — what the business
 * says it is. The model's hint is an inference from a caption someone wrote about a video, which
 * is the weakest of the three and the only one that can be confused by the *subject* of a post
 * ("the gelato at this place" → `shop`).
 *
 * An unreadable provider string does not consume the slot: it falls through to the model rather
 * than to `other`, so we never lose a category we do have.
 */
export function productCategoryFor(sources: CategorySources): ProductCategory {
  const { override, providerCategory, extractedHint } = sources;

  if (isProductCategory(override)) return override;
  // A free-text override we cannot parse is still the user's word and still outranks everything
  // below, but there is nothing to render it as; `other` at least does not contradict them.
  if (typeof override === 'string' && override.trim().length > 0) return 'other';

  return productCategoryFromProvider(providerCategory)
    ?? (isProductCategory(extractedHint) ? extractedHint : 'other');
}
