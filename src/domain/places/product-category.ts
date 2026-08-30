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
 * The provider-category table. Deliberately **not** an exhaustive transcription of Google's enum —
 * it moves without telling us, so an exhaustive table would be stale on arrival and impossible to
 * review. The suffix rules below carry the long tail.
 *
 * Three kinds of entry, and the third is new:
 *
 *  1. values with no suffix a rule can read (`bar`, `bakery`, `diner`);
 *  2. values a suffix rule would get **wrong**, each of them a real row we have seen:
 *     `coffee_shop` and `ice_cream_shop` are not shops, `bagel_shop` is a bakery,
 *     `smoothie_juice_bar` and `salad_bar` are not bars;
 *  3. values that are **read perfectly well and are outside the vocabulary** — a museum, a
 *     butcher, a liquor store. They map to `null`, explicitly rather than by falling off the end,
 *     which is what stops `_shop`/`_store` filing a butcher under something and what keeps the
 *     knowledge that we *did* understand the string. "Read and outside the three" and "unreadable"
 *     resolve the same way today; they are not the same fact, and this is where they would part.
 *
 * The `dessert`, `bakery`, `shop` and `attraction` groups this table used to produce are gone with
 * the eight-value vocabulary. A gelateria, a patisserie and a bagel counter are all `cafe` now —
 * the specification's own line is that `cafe` covers "bakeries, patisseries, ice cream and
 * desserts".
 */
const PROVIDER_CATEGORY_EXCEPTIONS: Readonly<Record<string, ProductCategory | null>> = {
  // — cafés —
  cafe: 'cafe',
  coffee_shop: 'cafe',
  tea_room: 'cafe',
  tea_house: 'cafe',
  bubble_tea: 'cafe',
  internet_cafe: 'cafe',
  cat_cafe: 'cafe',

  // — bakeries, which are cafés —
  bakery: 'cafe',
  bagel_shop: 'cafe',
  patisserie: 'cafe',
  // Google's own string for a patisserie. Measured on the first day of real use: a Ra'anana
  // patisserie came back as `pastry_shop`, which `_shop` then filed under `shop`.
  pastry_shop: 'cafe',

  // — desserts, which are also cafés. This group is why the eight-value vocabulary existed —
  desserts: 'cafe',
  dessert_shop: 'cafe',
  ice_cream_shop: 'cafe',
  frozen_yogurt_shop: 'cafe',
  gelato_shop: 'cafe',
  chocolate_shop: 'cafe',
  candy_store: 'cafe',
  confectionery: 'cafe',
  donut_shop: 'cafe',
  juice_shop: 'cafe',
  smoothie_juice_bar: 'cafe',
  acai_shop: 'cafe',

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

  // — read, and outside the three. A shop sells you food to take away and a museum is not a meal;
  //   calling either of them `restaurant` because a caption was vague would be worse than saying
  //   nothing, which is what `null` says.
  deli: null,
  delicatessen: null,
  butcher_shop: null,
  liquor_store: null,
  wine_shop: null,
  grocery_store: null,
  supermarket: null,
  tourist_attraction: null,
  museum: null,
  art_gallery: null,
  park: null,
  national_park: null,
  zoo: null,
  aquarium: null,
  historical_landmark: null,
  observation_deck: null,
  public_plaza: null,
};

/** Checked in order. First match wins, and only for a string the table above has no opinion on —
 *  so `_shop` never gets a chance at `coffee_shop` or at `museum`. */
const PROVIDER_CATEGORY_SUFFIXES: readonly (readonly [string, ProductCategory])[] = [
  ['_restaurant', 'restaurant'],
  ['_cafe', 'cafe'],
  ['_bakery', 'cafe'],
  ['_bar', 'bar'],
  ['_pub', 'bar'],
];

/**
 * The provider's category, translated — or `null` when there is nothing here we can say.
 *
 * `null` is a real answer and it covers two cases the caller treats alike: a string we cannot read
 * at all (`poi_index` carries `barber`, `notary_public`, `topic_publisher` — rows that are not
 * places to eat), and a string we read perfectly well that names something outside the three. In
 * both, guessing would be inventing a fact. `productCategoryFor` falls through to the model, and if
 * the model has nothing either the place ends up with no category, which is allowed and correct.
 *
 * The `_shop`/`_store`/`_market` suffix rules are gone with the `shop` value they produced. A
 * suffix that can only conclude "outside the vocabulary" earns nothing over falling through, and
 * keeping it would have quietly re-created `other` under a new name.
 */
export function productCategoryFromProvider(raw: string | null | undefined): ProductCategory | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key.length === 0) return null;

  // `hasOwn`, not truthiness: an entry whose value is `null` is a *decision* that this string has
  // no category, and it must stop the suffix rules rather than fall through to them.
  if (Object.hasOwn(PROVIDER_CATEGORY_EXCEPTIONS, key)) {
    return PROVIDER_CATEGORY_EXCEPTIONS[key] ?? null;
  }

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
 * Resolve the three claims into the one a person sees, **or into no claim at all**.
 *
 * The order is an epistemic ranking, not a preference. The user's override is a statement about
 * their own place. The provider's category is the venue's own registration — what the business
 * says it is. The model's hint is an inference from a caption someone wrote about a video, which
 * is the weakest of the three and the only one that can be confused by the *subject* of a post
 * ("the gelato at this place" used to produce `shop`).
 *
 * An unreadable provider string does not consume the slot: it falls through to the model, so we
 * never lose a category we do have.
 *
 * **The return type is nullable and that is the change.** This used to end in `?? 'other'`, and
 * `other` was a fifth vocabulary hiding in a default — it rendered as "Place", counted under a chip
 * that said "Place", and meant only that we had declined to say. `null` says the same thing
 * without dressing it as a category: the row prints its locality alone, the pin keeps the house
 * mint, and the filter bar offers no chip for it.
 */
export function productCategoryFor(sources: CategorySources): ProductCategory | null {
  const { override, providerCategory, extractedHint } = sources;

  if (isProductCategory(override)) return override;
  // A free-text override we cannot parse is still the user's word and still outranks everything
  // below — including a provider category that would contradict it. There is nothing to render it
  // as, so the place shows no category rather than one the user has already disagreed with.
  if (typeof override === 'string' && override.trim().length > 0) return null;

  return productCategoryFromProvider(providerCategory)
    ?? (isProductCategory(extractedHint) ? extractedHint : null);
}
