/**
 * The category filter: which categories the library actually contains, how many places each holds,
 * and the predicate that narrows a list to one of them.
 *
 * `ux-library-at-scale.md` §1.3 is the surface this serves — a horizontally scrolling bar of chips
 * pinned under the search field, one category at a time, each chip carrying its count — and
 * `ux-navigation-structure-2026-08-29.md` §3 is the ruling that categories are *this* and not a
 * destination. `components/sheet/library-filter-bar.tsx` decides how it looks; this file decides
 * what there is to look at.
 *
 * ## Why the facets are derived from the places and never from the vocabulary
 *
 * `PRODUCT_CATEGORY_ORDER` now lists exactly the three categories the extractor can emit, so the
 * gap this originally guarded against — a bar offering chips no library could fill, because the
 * display vocabulary carried eight values against the extractor's seven — is closed at the source.
 * The guard stays anyway, and deliberately: §1.3 rule 2 is that a filter leading to an empty list
 * is "a broken promise with a tap target on it", and counting first makes that impossible *by
 * construction* rather than by a vocabulary invariant somebody has to keep true. A library of only
 * restaurants gets one chip.
 *
 * ## What the facets should be counted over — the seam this is designed for
 *
 * The same lifting `filterPlaces` gets. The search filter lives on the page rather than in the
 * sheet because it narrows **the pins as well as the list** (`components/map/filter-places.ts`),
 * and a category filter that narrowed the list while the map kept every pin would be worse than no
 * filter at all — the user would be looking at a list of four cafés on a map of thirty-one
 * everything.
 *
 * So the recommended wiring is: apply the category filter in the same `useMemo` chain as the tag,
 * visit and search filters, and compute the facets over **the library narrowed by the other three
 * but not by the category itself**. That is what makes each count a true statement of what pressing
 * the chip produces. It is also why `keepCategory` exists: with live counts, the chip you are
 * currently standing on can drop to zero as you type, and a pressed chip that vanishes is a filter
 * with no way out. Pinning it keeps the escape on screen at a count of 0, which is honest — it says
 * "this combination has nothing in it" rather than hiding the reason.
 *
 * Scoping the counts to the *active area* instead was considered and rejected: the map is not
 * area-scoped, so an area-scoped count would disagree with the pins the same tap produces.
 *
 * ## Ordering
 *
 * Count descending, ties broken by `PRODUCT_CATEGORY_ORDER`. The tie-break is deliberately **not**
 * alphabetical on the label: `Café` versus `Bakery` makes alphabetical a collation question, and
 * `Array.prototype.sort` with `localeCompare` would order the bar differently depending on the
 * runtime's locale data — a genuinely non-deterministic bar. `PRODUCT_CATEGORY_ORDER` is a total
 * order the product already declares, and declares for exactly this purpose ("render order wherever
 * the whole set is listed (a filter row, a legend)"). Between the two, one library renders one bar,
 * always, everywhere.
 */

import {
  PRODUCT_CATEGORY_ORDER,
  isProductCategory,
  type ProductCategory,
} from './product-category';

/** One chip's worth of fact: a category the library contains, and how much of it there is. */
export interface CategoryFacet {
  readonly category: ProductCategory;
  /** Places in the counted set. `0` only ever for a pinned active category — see `keepCategory`. */
  readonly count: number;
}

/**
 * The caller's projection from its own place type onto a category string, so `domain/` never learns
 * about `MapPlace` (a UI port) — the same shape `filterBySearch` takes its `SearchablePlace` by.
 */
export type CategoryOf<T> = (place: T) => string | null | undefined;

/** Position in the product's declared render order; used only to break count ties. */
const ORDER_INDEX: ReadonlyMap<ProductCategory, number> = new Map(
  PRODUCT_CATEGORY_ORDER.map((category, index) => [category, index]),
);

/**
 * A stored category string as the product's vocabulary, or `null` when it is not one of the three.
 *
 * The fallback used to be `other`, and removing it is the point rather than a tidying: a place we
 * cannot categorise is not *in* a category called "we cannot categorise it". It has no chip, it is
 * in no chip's results, and its row prints its locality alone. `null` in, `null` out — including
 * for the values the eight-value vocabulary used to produce, which are still in the database on
 * rows written before 2026-08-29.
 */
export function toProductCategory(value: string | null | undefined): ProductCategory | null {
  return isProductCategory(value) ? value : null;
}

/** Whether a category selection narrows anything. `null` is "no filter", which is the resting
 *  state — the bar has no `All` chip, so nothing pressed *is* everything. */
export function isCategoryFilterActive(category: ProductCategory | null): boolean {
  return category !== null;
}

/**
 * The categories present in `places`, with counts, in render order.
 *
 * Only categories that are actually there. An empty input produces an empty array, which is the
 * signal to render no bar at all rather than an empty one.
 */
export function categoryFacets<T>(
  places: readonly T[],
  categoryOf: CategoryOf<T>,
  /** The currently filtered category, if any. Included at a count of 0 when the narrowed set no
   *  longer contains it, so the control that clears the filter cannot disappear underneath it. */
  keepCategory: ProductCategory | null = null,
): readonly CategoryFacet[] {
  const counts = new Map<ProductCategory, number>();
  if (keepCategory !== null) counts.set(keepCategory, 0);

  for (const place of places) {
    const category = toProductCategory(categoryOf(place));
    // An uncategorised place is counted under nothing. It is still in the library and still on the
    // map; it is simply not a fact any of the three chips can claim.
    if (category === null) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts]
    .map(([category, count]): CategoryFacet => ({ category, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (ORDER_INDEX.get(a.category) ?? 0) - (ORDER_INDEX.get(b.category) ?? 0),
    );
}

/** Whether one place's stored category is the filtered one. Never a substring or a prefix match:
 *  the chip means the category printed on it, the way `isSameTag` makes a tag chip mean its tag. */
export function matchesCategory(
  value: string | null | undefined,
  category: ProductCategory,
): boolean {
  return toProductCategory(value) === category;
}

/**
 * The places narrowed to one category.
 *
 * Returns the input array itself for a `null` category, so an untouched bar costs nothing
 * downstream — the identity guarantee `filterBySearch`, `filterByTag` and `filterByVisit` all give,
 * and for the same reason: React memoisation upstream must not churn on a filter nobody set.
 */
export function filterByCategory<T>(
  places: readonly T[],
  category: ProductCategory | null,
  categoryOf: CategoryOf<T>,
): readonly T[] {
  if (category === null) return places;
  return places.filter((place) => matchesCategory(categoryOf(place), category));
}

/**
 * Toggle semantics for the bar: pressing the pressed chip clears, pressing any other replaces.
 * One tap either way, exactly as `TagFilter.onToggleTag` behaves, so the two chip families in the
 * product do not have two different state models.
 */
export function toggleCategory(
  active: ProductCategory | null,
  pressed: ProductCategory,
): ProductCategory | null {
  return active === pressed ? null : pressed;
}
