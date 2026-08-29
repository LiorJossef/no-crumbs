/**
 * The category vocabulary the **product** speaks, and how the two vocabularies we are handed
 * translate into it.
 *
 * Three claims meet on a saved place and none of them is ours:
 *
 *  - `places.category` — the model's guess from the caption (`ExtractedCategoryHint`).
 *  - `places.provider_category` — the resolver's raw string, Google's, in its own snake_case
 *    (`ice_cream_shop`, `mediterranean_restaurant`, `smoothie_juice_bar`).
 *  - `saved_places.category_override` — the user's, and therefore final.
 *
 * ## One vocabulary now, where there were two
 *
 * This file used to carry **eight** values against the extractor's seven, on the argument that the
 * display vocabulary should be free to say things the model was never offered — `dessert` above
 * all, because a gelateria was rendering as "Shop". That argument was right about the symptom and
 * wrong about the cure: it fixed one word by adding a second vocabulary, and the two then
 * disagreed in a way a user could see. A gelateria read `Shop` on the review card and `Dessert` on
 * the saved row **one tap later** — a place changing what it *is* by being saved.
 *
 * The owner's taxonomy of 2026-08-29 closes it from the other end. `ProductCategory` is now an
 * alias of `places/taxonomy.ts`'s `PrimaryCategory`: three values, the same three the extractor may
 * emit and the same three the scorer scores. There is one vocabulary in this product and this is
 * it. What used to be a fourth, fifth or eighth value is now either folded into one of the three
 * (a bakery and a gelateria are both `cafe` — you go for a drink or something sweet, not a meal) or
 * is **`null`**, which is a real answer and the point of the next section.
 *
 * ## `null` is a category, and refusing to fake one is the whole design
 *
 * `productCategoryFor` returns `ProductCategory | null`, where it used to fall back to `other`.
 * `other` was a fifth vocabulary hiding in a default: it rendered as "Place", counted under a chip
 * that said "Place", and told the user nothing except that we had something and would not say what.
 * A museum, a butcher and a caption too vague to read are not one category, and the honest rendering
 * of all three is no category at all — the row prints its locality, the pin keeps the house mint,
 * and the filter bar does not offer a chip for the absence of a fact.
 */

import type { ExtractedCategoryHint } from './category-hint';
import { PRIMARY_CATEGORIES, type PrimaryCategory } from './taxonomy';

/**
 * The product's category vocabulary — an **alias** of the taxonomy's primary categories, not a
 * second list of the same three strings.
 *
 * An alias rather than a parallel type because the reason the two used to differ has gone. The old
 * header argued they answer different questions: what a model may emit versus what we show a
 * person. They do, and the answer to both is now the same three values by the owner's ruling, so a
 * second declaration would only be a place for them to drift apart again.
 */
export type ProductCategory = PrimaryCategory;

/** Render order wherever the whole set is listed (a filter row, a legend). The taxonomy's own
 *  order — restaurant, cafe, bar — which is roughly how often people save each. */
export const PRODUCT_CATEGORY_ORDER = PRIMARY_CATEGORIES;

/**
 * What each value is called in a sentence.
 *
 * `other: 'Place'` used to live here, and its removal is the point rather than a tidy-up: a place
 * we cannot categorise now has **no** label, not a label meaning "we would rather not say". See
 * `ui/place/category-display.ts` for what that renders as.
 */
export const PRODUCT_CATEGORY_LABEL = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  // The compile-time proof that the display vocabulary covers everything the extractor can emit.
  // Widen `ExtractedCategoryHint` without widening this and the line stops compiling, rather than
  // the new value silently rendering as nothing.
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
  // Google's own string for a patisserie. Measured on the first day of real use: a Ra'anana
  // patisserie came back as `pastry_shop`, which `_shop` then filed under `shop`.
  pastry_shop: 'bakery',

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
