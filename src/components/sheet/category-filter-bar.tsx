'use client';

/**
 * The library's filter bar: one horizontally scrolling row of chips that narrows the places by what
 * kind of thing they are.
 *
 * `ux-library-at-scale.md` §1.3 specifies the surface and `ux-navigation-structure-2026-08-29.md`
 * §3 is the ruling behind it — **categories are not a destination, they are this bar**. Until it
 * existed the only way to narrow the library by kind was to open a place, find a tag chip and tap
 * it, which is a retrieval control hidden inside a detail view.
 *
 * Presentational and self-contained: it holds no state, fetches nothing, and knows nothing about
 * the map. `domain/places/category-filter.ts` decides which chips there are and what they count;
 * the page owns the selection and applies the predicate to the pins as well as the list.
 *
 * ## `Not been yet` is the first chip in this row, not a row of its own
 *
 * The nav ruling §3 merges it here rather than stacking a second bar, and the merge buys something
 * concrete: the standalone chip this replaced stated its own 36 px height as a compromise under the
 * 44 px touch floor, taken because it sat alone under the search field with no competing target. In
 * a row of chips that argument is gone — there are now neighbours 8 px away — so every chip in this
 * bar is 44 px. That is the ruling's stated reason for the merge and it is the one hard number here.
 *
 * It is rebuilt from the same tokens and the same string rather than composed from the old
 * component, which brought its own `Showing` kicker and its own `min-h-9`, neither of which
 * survives the move into a scroll row. The state model is copied exactly: `aria-pressed`, and
 * pressing the pressed one clears — one control that is also its own dismissal, because a visit
 * filter has no "somewhere else" that could have set it (unlike `ActiveTagFilter`, whose filter is
 * set on a chip inside a place's detail) and a second target just to remove it would be two
 * controls for one boolean.
 *
 * **It renders only when something is actually marked been** (`anyVisited`). It used to render on
 * every library, so on a library where nobody has marked anything it was a filter that returned
 * everything — the same "target that does nothing" this file already refuses to draw for a
 * single-category library.
 *
 * ## No `All` chip, and this is a deviation worth reading
 *
 * §1.3 rule 5 says "`All` is a chip, first, selected by default". It is not built, for two reasons.
 * The nav ruling gives the first slot to `Not been yet`, so `All` could not be first anyway; and in
 * this product a pressed chip means *this is narrowing your library* — `ActiveTagFilter`, the visit
 * chip and the detail tag chips all say so — while an `All` chip would sit pressed in the state
 * where nothing is narrowed, inverting that meaning at the head of a row that otherwise obeys it.
 * Nothing pressed *is* everything, and pressing the pressed chip clears.
 *
 * The residual cost is real and stated rather than hidden: with no `All`, clearing a category means
 * finding the pressed chip, which can be scrolled out of view in a library with many categories.
 * If that proves wrong in use the fix is scrolling the pressed chip into view on mount, not an
 * `All` chip that lies about what pressed means.
 *
 * ## Two things about the gestures
 *
 * `data-vaul-no-drag` is on the scroll container, matching the list's own container
 * (`place-sheet.tsx`): without it a horizontal drag inside the sheet is ambiguous, and vaul only
 * forgives drag-from-content when the content is scrolled to its own top. `overscroll-x-contain`
 * then stops a swipe that runs off the end of the row from chaining into the browser's back
 * gesture.
 *
 * The container carries `-m-1 p-1` so the 3 px `focus-visible` ring is inside the scroll box rather
 * than clipped by it, while the chips still line up with whatever padding the parent has.
 *
 * No motion. The bar is state, not an event; the only animation is `CHIP_PRESSABLE`'s own
 * `transition-colors`, which triggers no layout.
 */

import type { CSSProperties } from 'react';
import { X } from 'lucide-react';

import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { cn } from '@/lib/utils';
import { categoryDisplay } from '@/ui/place/category-display';
import { NOT_BEEN_FILTER_LABEL } from '@/ui/place/visit-state';
import { CHIP_PRESSABLE } from './place-enrichment';

/** The 44 px floor the merge exists to reach, plus the internal rhythm shared by every chip in the
 *  row. `min-h-11` overrides `CHIP_PRESSABLE`'s `min-h-8` through `cn`'s class merge.
 *
 *  `group/chip` is what lets the dot inside a category chip see its own button's `aria-pressed`
 *  without either of them being told about the other — named rather than bare, because these chips
 *  sit inside a sheet that has other grouped containers and an unnamed group leaks upwards. */
const BAR_CHIP = 'group/chip min-h-11 shrink-0 gap-2';

/** The group's accessible name. A row of five bare toggle buttons in the middle of a sheet is five
 *  loose words unless something says what they are — the same reason `TagChipList` names itself. */
const BAR_LABEL = 'Filter your places';

export interface CategoryFilterBarProps {
  /** Present categories with counts, already ordered — `categoryFacets` from the domain. Empty
   *  means an empty library and the whole bar disappears; one entry draws no category chips, and
   *  the row survives only if the visit chip has something to do. */
  readonly facets: readonly CategoryFacet[];
  /** The category currently narrowing the library, or `null` for none. */
  readonly activeCategory: ProductCategory | null;
  /** Toggle: the active category clears it, any other replaces it. `toggleCategory` in the domain
   *  is the rule; the page holds the state. */
  readonly onToggleCategory: (category: ProductCategory) => void;
  /** `Not been yet`, whose state and handler stay owned by the page exactly as they are today. */
  readonly notBeenOnly: boolean;
  readonly onToggleNotBeen: () => void;
  /** Whether anything in the list this bar sits over is marked been. Nothing marked means the chip
   *  removes nothing, which is the same objection the one-category case answers below: a target
   *  whose pressed and unpressed states show the same rows. The caller passes the plain fact; the
   *  "and it must not vanish while pressed" rule is applied here so there is one of it. */
  readonly anyVisited: boolean;
  className?: string;
}

export function CategoryFilterBar({
  facets,
  activeCategory,
  onToggleCategory,
  notBeenOnly,
  onToggleNotBeen,
  anyVisited,
  className,
}: CategoryFilterBarProps) {
  // No facets means no places, and the parent already hides the whole filter block in that state;
  // this is the belt to its braces rather than a second policy.
  if (facets.length === 0) return null;

  // One category is not a choice. Every place in the library is a restaurant, so a `Restaurant 12`
  // chip is a control whose pressed and unpressed states show the same twelve rows — not a broken
  // promise in §1.3 rule 2's sense, but a target that does nothing, which is worse than absent.
  // **The row itself may still render**, because `Not been yet` is in it and that filter is
  // unrelated to how many categories the library happens to hold; hiding it here would delete a
  // shipped control for anyone whose library is all one kind of place.
  const showCategories = facets.length > 1;

  // Nothing marked been, nothing for this chip to take away. Until now it rendered on every
  // library, so on the common one — nobody has marked anything — pressing it returned exactly the
  // list already on screen: an affordance offering a narrowing that does not exist.
  //
  // `notBeenOnly ||` is the same rule `activeCategory` gets in the facets upstream: a *pressed*
  // chip must survive, or marking your last outstanding place as been would delete the only
  // control that can undo the filter hiding the rest of your library.
  const showNotBeen = notBeenOnly || anyVisited;

  // Both halves gone leaves an empty flex row, which is invisible but not free — it is a `gap-3.5`
  // child in the sheet's column, so it opens a hole under the search field.
  if (!showNotBeen && !showCategories) return null;

  return (
    <div
      data-vaul-no-drag
      role="group"
      aria-label={BAR_LABEL}
      className={cn(
        // The scrollbar is hidden, not the overflow: on a phone it never paints anyway, and on a
        // pointer device it drew a grey track straight across the hairline between this row and
        // the first place. What says "there is more" is the chip clipped at the trailing edge,
        // which is the affordance a horizontal chip row carries everywhere else.
        '-m-1 flex gap-2 overflow-x-auto overscroll-x-contain p-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {showNotBeen && (
        <button
          type="button"
          aria-pressed={notBeenOnly}
          onClick={onToggleNotBeen}
          // House mint when pressed, unlike the category chips below: `Not been yet` is a question
          // about your own visits rather than about a kind of place, so there is no category whose
          // colour it could honestly borrow.
          className={cn(CHIP_PRESSABLE, BAR_CHIP)}
        >
          <span className="whitespace-nowrap">{NOT_BEEN_FILTER_LABEL}</span>
          {notBeenOnly && <X className="size-3.5 shrink-0" aria-hidden />}
        </button>
      )}

      {showCategories && facets.map(({ category, count }) => (
        <CategoryChip
          key={category}
          category={category}
          count={count}
          active={category === activeCategory}
          onToggle={onToggleCategory}
        />
      ))}
    </div>
  );
}

function CategoryChip({
  category,
  count,
  active,
  onToggle,
}: {
  category: ProductCategory;
  count: number;
  active: boolean;
  onToggle: (category: ProductCategory) => void;
}) {
  const display = categoryDisplay(category);

  return (
    <button
      type="button"
      aria-pressed={active}
      // The visible text is `Café 4`, which read aloud is two loose numbers away from a sentence.
      // The label names the same two facts in words and contains the visible label, so it satisfies
      // label-in-name rather than replacing what the chip says.
      aria-label={`${display.label}, ${countPhrase(count)}`}
      onClick={() => onToggle(category)}
      /**
       * **The one place in this file where a colour comes from data rather than from a variant,
       * and it is a knowing exception** (`ux-overnight-specs.md` OQ-8, accepted by the
       * orchestrator). Run rule 6a says state comes from variants; four category colours would
       * therefore be four hard-coded variants, which is a palette by another name and a fifth
       * category could not be added without editing this component.
       *
       * So the *rule* stays a variant — `aria-pressed:bg-tag-selected` in `CHIP_PRESSABLE` — and
       * only the value is data. `bg-tag-selected` compiles to `background-color:
       * var(--tag-selected)`, so overriding that variable on this button alone is what makes a
       * pressed Café chip café-brown instead of house mint. No literal: the value comes from
       * `categoryDisplay`, which reads `ui/place/palette.ts` — the same module the map's own pin
       * expressions read, which is why the chip, the row's disc and the pin cannot disagree.
       */
      style={{ '--tag-selected': display.color, '--chip-dot': display.color } as CSSProperties}
      className={cn(CHIP_PRESSABLE, BAR_CHIP)}
    >
      {/* The pin's own colour, so a café is the same brown here, on the map and on the row. On the
          pressed chip it becomes the chip's foreground instead — now that the fill *is* the
          category's colour, a dot in that same colour would be invisible against it, which is the
          stronger form of the reason this line already existed (mint dot on a mint fill). Same box
          either way, so pressing a chip never shifts the ones beside it. */}
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-(--chip-dot) group-aria-pressed/chip:bg-current"
      />
      <span className="whitespace-nowrap">{display.label}</span>
      <span className="shrink-0 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/** `4 places` / `1 place`, for the accessible name only. Mirrors `placeCountLabel` on the
 *  collections screens; there is no zero case here that reads as "none yet" — a pinned active
 *  category at 0 is saying "this combination is empty", which "0 places" states exactly. */
function countPhrase(count: number): string {
  return `${count} place${count === 1 ? '' : 's'}`;
}
