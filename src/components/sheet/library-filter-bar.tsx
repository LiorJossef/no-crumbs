'use client';

/**
 * **One wrapping row of controls above the library, and one anchored menu per axis.**
 *
 * This file replaces `category-filter-bar.tsx`, which drew the visit chip and the category chips as
 * one horizontally scrolling row. Measured in a browser at 375x812 against the owner's own library
 * (58 places), the header drew **three** rows of pills before the first place — the visit chip and
 * three categories at y190, two sort chips at y248, ten tag chips at y306 — and the first row of the
 * list began at y370, 46 % of the viewport. The owner's instruction was that the UI must not feel
 * overwhelming "by a lot of tags or buttons or texts", and no arrangement of sixteen resting pills
 * is not a wall.
 *
 * What replaces it:
 *
 *     [ Been ▾ ]  [ Category ▾ ]  [ Tags ▾ ]  [ Clear ]   [ Sort: Recently saved ▾ ]
 *
 * ## One trigger per axis, not one `Filter`
 *
 * Owner, 2026-09-02: *"maybe we should have a dropdown for each of the filters instead of having it
 * in one place / cause they are not related"*. A single collapsed `Filter` was measurably calmer
 * than sixteen pills and it also hid which axes existed at all — one generic word cannot say "you
 * can narrow by been, by kind and by tag", and reaching the tags cost two taps. Four named triggers
 * say what the axes are, and **each says what it is currently set to without being pressed**, which
 * is the requirement the old visit chip failed (defect D2 in
 * `ux-visit-filter-and-chip-density-2026-09-02.md`).
 *
 * ## A menu is a list you pick from, not a second control surface
 *
 * Owner, again: *"I don't like the interaction pattern of opening a dropdown and then showing
 * another group of large buttons inside it."* Collapsing three rows of 44 px pills behind a trigger
 * and then revealing 44 px pills moves the wall rather than removing it. So `Been`, `Category` and
 * `Sort` are `Menu.RadioGroup`s of plain rows — no fill, no border, no elevation at rest, a
 * full-width highlight, and an indicator plus a weight for "this one". `Tags` is the shadcn/Base UI
 * `Combobox`, which is a list of rows with a search, chips for what is chosen and its own `Clear`.
 *
 * ## Anchored, floating, and from the library
 *
 * Every menu is `Portal` → `Positioner` (`side="bottom"`, `align="start"`, `sideOffset={6}`)
 * anchored to **its own trigger**. The version before this rendered the open panel as an inline
 * block after the whole row: press `Category` at x97 and the options appeared at x30, 90 px lower,
 * under two unrelated controls — the owner's "something just off about it", measured. Flip near the
 * bottom edge and shift near the inline-end edge come from the positioner; none of it is
 * hand-rolled, and nothing below the row moves when a menu opens.
 *
 * **The portal is what makes correct anchoring possible, and it was the open risk.** `add-sheet.tsx`
 * records that vaul drawers do not nest cleanly, so a second *drawer* inside the sheet was never an
 * option — but a menu is not a drawer, and a portalled popup lives outside the drawer's DOM
 * entirely, so the drawer cannot read a press inside it as a drag.
 *
 * ## Quiet at rest, loud only when it is doing something
 *
 * Owner: *"the current Filter + Sort controls feel too large, heavy, and visually awkward"*. A
 * header control used to be four heavy signals at once — 44 px tall, `px-3`, `font-bold`, filled
 * with house mint. **The paint drops to 32 px and the target stays at 44 px**: `TRIGGER_TARGET` is a
 * transparent 44 px pressable and `TRIGGER_PAINT` is the 32 px pill inside it, so the 6 px above and
 * below are hit area rather than ink. The 44 px floor is argued, not decorative, and shrinking the
 * *target* was never what was asked for.
 *
 * ## Four controls, one system
 *
 * `ux-overwhelm-audit-2026-09-02.md` §6's finding is that this product draws one 44 px pill for six
 * unrelated meanings, and *that* is the overwhelm. The answer here is not four different mechanisms
 * but one: every trigger is the same button family at the same height with the same radius and the
 * same hover, every menu row is the same 40-in-44 row with the label at the same inline offset and
 * the count in the same end-aligned column, and every popup wears one elevation. What tells a
 * narrowing from a reorder is the `Sort:` label and the ghost fill, not a different component.
 *
 * **Category is provisional** ("for category im not sure yet", 2026-09-02) and is deliberately the
 * zero-change option; it is a plain sibling with the same prop shape, so swapping it is one
 * component rather than a rewrite.
 */

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown, X } from 'lucide-react';

import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { cn } from '@/lib/utils';
import { PRESS_CHIP } from '@/lib/interaction';
import { categoryColorVar, categoryDisplay } from '@/ui/place/category-display';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { isTagActive, type TagFacet } from '@/ui/place/tag-filter';
import {
  VISIT_FILTERS,
  VISIT_FILTER_GROUP_LABEL,
  VISIT_FILTER_LABEL,
  type VisitFilter,
} from '@/ui/place/visit-state';

/**
 * **The 44 px hit area, painted at 32.** `min-h-11` is the documented touch floor and it stays on
 * the pressable element; the visible pill is the `TRIGGER_PAINT` child inside it, and `py-1.5` is
 * the 6 px of transparent band above and below — hit area, not ink. Verified with
 * `elementFromPoint` at the top edge, the middle and the bottom edge of every trigger, because a
 * class name cannot say anything about hit testing.
 */
export const TRIGGER_TARGET =
  'group/trigger inline-flex min-h-11 max-w-full shrink-0 cursor-pointer items-center py-1.5 outline-none';

/**
 * The painted pill: 32 px, neutral surface, hairline, medium weight.
 *
 * **The hover is `border-brand` plus a 5 % mint wash, and that pairing is evidence-backed rather
 * than chosen from the token table.** `button.tsx`'s outline variant records the measurement:
 * `--primary` is `--mint-400` and a 1 px band of it on a `#FAF9F6` surface is invisible at panel
 * width, so the border warms to `--brand` (`--mint-700`) while the wash stays at 5 %. A grey surface
 * shift at this size was the thing the owner could not see. The whole hover column is unreachable
 * below `lg` — Tailwind wraps every `hover:` in `@media (hover: hover)` — so a phone screenshot
 * proves nothing about it either way.
 */
export const TRIGGER_PAINT =
  'flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground ' +
  'group-hover/trigger:border-brand group-hover/trigger:bg-primary/5 group-focus-visible/trigger:ring-3 group-focus-visible/trigger:ring-ring/50 ' +
  'motion-safe:transition-colors motion-safe:duration-press';

/** The active pill. Still obviously *on* — filled, a step bolder — and it is the only state that
 *  spends the accent. When a category is active `--tag-selected` is overridden to that category's
 *  own colour, which is the thread `facelift-plan.md` :81 and :144 make load-bearing. */
export const TRIGGER_PAINT_ACTIVE =
  'border-transparent bg-tag-selected font-semibold text-tag-selected-foreground group-hover/trigger:bg-tag-selected ' +
  // **The active pill needs its own hover and did not have one.** Owner, 2026-09-02: *"hover
  // problem after you select catagory and wants to change it"* — the resting hover warms the
  // border and washes the ground, and neither is visible on a pill already filled with a category
  // colour, so going back to change your choice got no feedback at all. A ring in the pill's own
  // own colour, offset outward, is the one signal that works on *any* fill — the four category
  // colours and both themes — without inventing a colour for each. Measured on the live page: the
  // pill is `rgb(108, 67, 11)` at rest and gains a 2 px halo of the same brown at 45 % on hover.
  'group-hover/trigger:ring-2 group-hover/trigger:ring-tag-selected/45 group-hover/trigger:border-transparent';

/**
 * The sort trigger's ghost: the same button family, the same 32-in-44 target, the same radius, the
 * same chevron — and no border and no fill at rest, so one glance tells a reorder from a narrowing.
 * Consistency of mechanism, difference of label.
 *
 * Its hover is the wash on its own at 15 % rather than the bordered pill's 5 %, because that pill
 * spends half its signal on the edge and this one has only the ground. `hover:text-brand` — a *link*
 * hover on something that is not a link — is what the owner read as "not noticeable": the label
 * flicked to mint and nothing else moved.
 */
export const SORT_PAINT =
  'flex h-8 max-w-full items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium text-foreground ' +
  'group-hover/trigger:border-brand group-hover/trigger:bg-primary/15 group-focus-visible/trigger:ring-3 group-focus-visible/trigger:ring-ring/50 ' +
  'motion-safe:transition-colors motion-safe:duration-press';

/**
 * The floating surface every menu here paints on, and there is exactly one of it.
 *
 * `w-max` — **the width is the content's**, not the row's and not the panel's. A two-row menu
 * stretched to a 500 px panel is what "goofy" meant: it reads as a dialog that lost its content
 * rather than as a small list. `p-1` for the same reason; a chunk of vertical padding around three
 * rows is the other half of it.
 *
 * `--available-height` and `--transform-origin` come from the positioner, so a menu near the bottom
 * of a phone flips above its trigger and scrolls inside what is left rather than running off the
 * screen. One scroll container, always: nothing inside a popup carries its own `overflow-y`, because
 * two stacked tracks on a phone means the user cannot tell which one their thumb will grab.
 *
 * Motion is a fade and a 4 px rise over `duration-enter` — no scale, no bounce, no height animation.
 * An overshoot on a menu is the single most "goofy"-reading thing available, and a height animation
 * inside a scrolling sheet is layout thrash for no information. Reduced motion keeps the fade, per
 * `facelift-plan.md` §3a.
 */
const MENU_POPUP =
  'z-50 max-h-[min(20rem,var(--available-height))] w-max min-w-40 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card p-1 shadow-raised outline-none ' +
  'data-open:animate-in data-open:fade-in-0 data-open:motion-safe:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 duration-enter';

/**
 * **One row of a menu.** No fill, no border and no elevation at rest; the highlight is a full-width
 * ground, and what says "this one" is the indicator and a weight rather than a filled pill.
 *
 * **40 px of paint inside a 44 px target**, the same technique the triggers use. The indicator
 * column is always present (`keepMounted`) so the label sits at the same inline offset in every row
 * of every menu, and the count is in an end-aligned column that cannot jitter. Logical properties
 * throughout — both swap edges under RTL, and half this library is Hebrew.
 */
const MENU_ROW = 'group/row flex min-h-11 cursor-pointer select-none items-center outline-none';
const MENU_ROW_PAINT =
  'flex h-10 w-full items-center gap-2 rounded-lg px-2 text-xs font-medium text-foreground ' +
  'group-data-highlighted/row:bg-muted/60 motion-safe:transition-colors motion-safe:duration-press';

/** The word, never an `x` — defect D3's fix. A real control with a real accessible name rather than
 *  a decorative glyph carrying a dismissal's affordance with no dismissal behind it. */
const CLEAR_LABEL = 'Clear';
const CLEAR_ALL_ACCESSIBLE_NAME = 'Clear all filters';

/** The row that says "no category is narrowing this", rather than the press-the-pressed-one rule the
 *  chips used to hide. It also makes `Category` and `Been` read identically. */
const ALL_CATEGORIES_LABEL = 'All categories';

/** The tag field's placeholder, and its accessible name. */
const TAG_SEARCH_PLACEHOLDER = 'Search tags';

/** What the combobox says when the typed text matches no tag. One clause, no apology. */
const NO_TAGS_MATCH_LINE = 'No tags match.';

/** `Combobox.Clear` is the tag axis's own clear, so it names the filter it clears. */
const CLEAR_TAGS_ACCESSIBLE_NAME = 'Clear the tag filter';

export interface LibraryFilterBarProps {
  /** Present categories with counts, already ordered — `categoryFacets` from the domain. */
  readonly facets: readonly CategoryFacet[];
  readonly activeCategory: ProductCategory | null;
  readonly onToggleCategory: (category: ProductCategory) => void;
  /** The visit filter, as one of three named states. */
  readonly visitFilter: VisitFilter;
  readonly onChangeVisitFilter: (filter: VisitFilter) => void;
  /** Whether anything in the **whole library** is marked been. Nothing marked means two of the
   *  three states return the same rows, so the axis is a target that does nothing — the same
   *  objection the one-category case answers. A non-`all` filter keeps it on screen regardless, or
   *  marking your last outstanding place as been would delete the control that undoes the filter
   *  now hiding the rest of your library. */
  readonly anyVisited: boolean;
  /** The tag vocabulary of everything currently matching, already counted and ordered. */
  readonly tagFacets: readonly TagFacet[];
  /** The tags narrowing the library — several at once, composing as AND. The pills that undo them
   *  individually live above the list, so the way out is never only behind a closed menu. */
  readonly activeTags: readonly string[];
  readonly onToggleTag: (tag: string) => void;
  readonly onClearTags: () => void;
  /** Rendered in the same wrapping row — the sort control, on both hosts. A slot rather than a
   *  prop, so this file never learns what sorting is. */
  readonly trailing?: ReactNode;
  className?: string;
}

export function LibraryFilterBar({
  facets,
  activeCategory,
  onToggleCategory,
  visitFilter,
  onChangeVisitFilter,
  anyVisited,
  tagFacets,
  activeTags,
  onToggleTag,
  onClearTags,
  trailing,
  className,
}: LibraryFilterBarProps) {
  // One category is not a choice: every place is a restaurant, so a `Restaurant 12` row is a
  // control whose selected and unselected states show the same twelve places.
  const showCategories = facets.length > 1;
  const showVisit = anyVisited || visitFilter !== 'all';
  const showTags = tagFacets.length > 0 || activeTags.length > 0;
  const anythingActive = activeCategory !== null || visitFilter !== 'all' || activeTags.length > 0;

  // Nothing to offer means nothing to draw — an empty flex row is invisible but not free: it is a
  // `gap` child in the sheet's column, so it opens a hole under the search field. The gate is per
  // axis, deliberately not on `facets.length`: a library of one kind of place can still have tags
  // and been marks, and an earlier version of this line hid the tag list of exactly that library.
  if (!showCategories && !showVisit && !showTags && trailing === undefined) return null;

  const categoryLabel = activeCategory === null ? null : categoryDisplay(activeCategory).label;
  const categoryCount =
    activeCategory === null
      ? 0
      : (facets.find((facet) => facet.category === activeCategory)?.count ?? 0);

  return (
    // **Wraps, never scrolls.** Four triggers plus `Clear` is about 310 px before a single value is
    // shown, against ~358 px of content width at 375 — so an active value, a Hebrew category name or
    // a three-digit count will exceed it. A container whose job is to hide overflow cannot hold
    // controls whose whole job is to be legible at rest; that is defect D1, and a second line is the
    // honest cost of not reintroducing it. `gap-x-1.5` and no `gap-y`: the 44 px targets already
    // carry 6 px of transparent band each, so a vertical gap would double-space the second line
    // against a first line that looks single-spaced.
    <div className={cn('flex flex-wrap items-center gap-x-1.5', className)}>
      {showVisit && (
        <MenuAxis
          axis={VISIT_FILTER_GROUP_LABEL}
          value={visitFilter === 'all' ? null : VISIT_FILTER_LABEL[visitFilter]}
          active={visitFilter !== 'all'}
        >
          <Menu.RadioGroup
            value={visitFilter}
            onValueChange={(next) => onChangeVisitFilter(next as VisitFilter)}
          >
            {VISIT_FILTERS.map((filter) => (
              <MenuRadioRow
                key={filter}
                value={filter}
                label={VISIT_FILTER_LABEL[filter]}
                selected={filter === visitFilter}
              />
            ))}
          </Menu.RadioGroup>
        </MenuAxis>
      )}

      {showCategories && (
        <MenuAxis
          axis="Category"
          value={categoryLabel}
          count={activeCategory === null ? null : categoryCount}
          active={activeCategory !== null}
          dot={activeCategory !== null}
          {...(activeCategory === null
            ? {}
            : {
                // A token reference, never a hex: an inline literal themes nothing, which is
                // exactly how a rebuilt dark palette left every disc and dot light.
                style: {
                  '--tag-selected': categoryColorVar(activeCategory),
                  '--tag-selected-foreground': 'var(--on-category)',
                } as CSSProperties,
              })}
        >
          <Menu.RadioGroup
            value={activeCategory ?? 'all'}
            onValueChange={(next) => {
              if (next === 'all') {
                if (activeCategory !== null) onToggleCategory(activeCategory);
                return;
              }
              if (next !== activeCategory) onToggleCategory(next as ProductCategory);
            }}
          >
            <MenuRadioRow
              value="all"
              label={ALL_CATEGORIES_LABEL}
              selected={activeCategory === null}
            />
            {facets.map(({ category, count }) => (
              <MenuRadioRow
                key={category}
                value={category}
                label={categoryDisplay(category).label ?? category}
                count={count}
                selected={category === activeCategory}
                // The chip was only ever the container; the colour is the load-bearing part, and it
                // survives the move to a list as this dot.
                dotVar={categoryColorVar(category)}
              />
            ))}
          </Menu.RadioGroup>
        </MenuAxis>
      )}

      {showTags && <TagsAxis facets={tagFacets} activeTags={activeTags} onToggle={onToggleTag} />}

      {/* **Only while something is on.** A permanently visible `Clear` is a dead control eating the
          width this row exists to save. It clears all three filter axes and deliberately does not
          touch the sort — a sort is not a filter and has no cleared state. */}
      {anythingActive && (
        <button
          type="button"
          data-vaul-no-drag
          aria-label={CLEAR_ALL_ACCESSIBLE_NAME}
          onClick={() => {
            if (activeCategory !== null) onToggleCategory(activeCategory);
            if (visitFilter !== 'all') onChangeVisitFilter('all');
            if (activeTags.length > 0) onClearTags();
          }}
          className={cn(TRIGGER_TARGET, PRESS_CHIP)}
        >
          <span className="flex h-8 items-center rounded-full px-2 text-xs font-medium text-muted-foreground underline-offset-4 group-hover/trigger:text-foreground group-hover/trigger:underline group-focus-visible/trigger:ring-3 group-focus-visible/trigger:ring-ring/50">
            {CLEAR_LABEL}
          </span>
        </button>
      )}

      {trailing}
    </div>
  );
}

/**
 * **One axis: a trigger that states its own value, and the anchored menu it opens.**
 *
 * `Menu.Root` owns open/close, the anchoring, Escape, focus return to its own trigger and closing on
 * an outside press — including a press on another axis's trigger, which is what keeps two menus from
 * ever being open at once. None of that is re-derived here.
 *
 * Exported because the sort control is one of these: same trigger family, same rows, same popup, and
 * `tone="sort"` is the only difference — a ghost fill and a printed `Sort:` label.
 */
export function MenuAxis({
  axis,
  accessibleAxis,
  value = null,
  count = null,
  active = false,
  dot = false,
  tone = 'filter',
  style,
  children,
}: {
  /** The axis word, shown when nothing on this axis is narrowing: `Been`, `Category`, `Tags`. */
  axis: string;
  /** The axis as it is *read out*, when the two differ. The sort control prints `Sort:` and is
   *  named `Sort by` — "Sort" alone before a value announces as a command. The visible word is
   *  contained in the spoken one, which is what label-in-name asks for. */
  accessibleAxis?: string;
  /** What this axis is set to, shown instead of the axis word when there is one. */
  value?: string | null;
  count?: number | null;
  active?: boolean;
  dot?: boolean;
  /** `filter` narrows the library and wears the bordered pill; `sort` reorders it and wears a
   *  ghost with the axis printed. Same component, same target, same rows. */
  tone?: 'filter' | 'sort';
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        // Inside the mobile sheet a press that begins here would otherwise be read as the start of
        // a sheet drag and the tap swallowed — the same reason every row and the field carry it.
        data-vaul-no-drag
        // `aria-pressed` on the filter axes because they are also a state; the sort has no "off",
        // so a pressed bit there would announce something it does not have.
        {...(tone === 'filter' ? { 'aria-pressed': active } : {})}
        aria-label={
          tone === 'sort'
            ? `${accessibleAxis ?? axis}, ${value ?? ''}`
            : value === null
              ? `${axis}, showing all`
              : `${axis}, ${value}`
        }
        style={style}
        className={cn(TRIGGER_TARGET, PRESS_CHIP)}
      >
        <TriggerFace axis={axis} value={value} count={count} active={active} dot={dot} tone={tone} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 outline-none">
          <Menu.Popup data-vaul-no-drag aria-label={accessibleAxis ?? axis} className={MENU_POPUP}>
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** What a trigger looks like — shared by the menu axes and the combobox axis, so four controls
 *  cannot drift into four materials. */
function TriggerFace({
  axis,
  value,
  count,
  active,
  dot,
  tone = 'filter',
}: {
  axis: string;
  value: string | null;
  count: number | null;
  active: boolean;
  dot: boolean;
  tone?: 'filter' | 'sort';
}) {
  return (
    <span className={cn(tone === 'sort' ? SORT_PAINT : TRIGGER_PAINT, active && tone === 'filter' && TRIGGER_PAINT_ACTIVE)}>
      {tone === 'sort' && (
        // The axis word, on screen at rest. The control used to be two bare values with nothing
        // naming what they did — and `A–Z` reads as a filter for names beginning with A as easily
        // as it reads as an ordering. `aria-hidden` because the button's own name carries it.
        <span aria-hidden className="shrink-0 text-muted-foreground">
          {axis}:
        </span>
      )}
      {dot && (
        /* The pin's own colour; on the filled pill it becomes the foreground, because a dot in the
           fill's own colour is an invisible dot. */
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
      )}
      <span className="truncate whitespace-nowrap">{value ?? axis}</span>
      {count !== null && <span className="shrink-0 tabular-nums font-normal">{count}</span>}
      {/* `size-3`, not `size-3.5`: at 12 px text a 14 px chevron is the largest thing in the pill
          and reads as a caret pointing at nothing. */}
      <ChevronDown
        aria-hidden
        className="size-3 shrink-0 opacity-70 motion-safe:transition-transform group-data-popup-open/trigger:rotate-180"
      />
    </span>
  );
}

/** A row of a radio menu: the indicator, an optional colour dot, the label, and the count on the
 *  far edge. Exported so the sort menu is built from the same row as the filter menus. */
export function MenuRadioRow({
  value,
  label,
  count = null,
  selected,
  dotVar = null,
}: {
  value: string;
  label: string;
  count?: number | null;
  selected: boolean;
  dotVar?: string | null;
}) {
  return (
    <Menu.RadioItem value={value} className={MENU_ROW}>
      <span className={MENU_ROW_PAINT}>
        {/* `keepMounted` so the column exists in every row and the labels line up at one inline
            offset across all four menus. */}
        <Menu.RadioItemIndicator
          keepMounted
          className="flex size-3.5 shrink-0 items-center justify-center data-[unchecked]:invisible"
        >
          <Check aria-hidden className="size-3.5 text-brand" />
        </Menu.RadioItemIndicator>
        {dotVar !== null && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dotVar }}
          />
        )}
        <span
          dir="auto"
          className={cn('min-w-0 flex-1 truncate text-start', selected && 'font-bold')}
        >
          {label}
        </span>
        {count !== null && (
          <span className="shrink-0 ps-3 tabular-nums font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </span>
    </Menu.RadioItem>
  );
}

/**
 * **Tags — pick any number, out of a vocabulary nobody can enumerate.** The shadcn/Base UI
 * `Combobox` in `multiple` mode: a field that filters the list as you type, chips for what is
 * chosen with a remove each, and `Combobox.Clear`, which **is** this axis's clear — there is no
 * second clear button beside it.
 *
 * Owner, twice: *"tags from a multi select list with a serch"* and *"i want you to use the shdcn for
 * the tags please"*. The standing ruling is to reuse what is installed rather than hand-roll it, and
 * this brings the filtering, the empty state, the chips and the clear for free.
 *
 * The chip row it replaced was the larger half of the header overwhelm: measured at 58 places it
 * drew ten chips in a horizontally scrolling row, bounded by a cap that hid tags the user then had
 * no way to reach. **There is no cap here** — `useLibraryTagFacets` asks for every tag — because a
 * tag that is not on screen is one word away in the field.
 *
 * The **input-inside-popup** pattern from the library's own docs: the trigger is the form control
 * and the search field lives in the popup, which is what lets this trigger look like the other three
 * instead of being a text field parked in the header.
 */
function TagsAxis({
  facets,
  activeTags,
  onToggle,
}: {
  facets: readonly TagFacet[];
  activeTags: readonly string[];
  onToggle: (tag: string) => void;
}) {
  const byTag = useMemo(() => new Map(facets.map((facet) => [facet.tag, facet])), [facets]);
  const items = useMemo(() => facets.map((facet) => facet.tag), [facets]);
  const labelOf = useCallback(
    (tag: string) => byTag.get(tag)?.label ?? tagDisplayLabel(tag),
    [byTag],
  );

  /** The page owns the tags, one toggle at a time, so a whole-array change from the combobox is
   *  applied as the difference. Both directions matter: picking an item adds one; a chip's remove,
   *  or `Clear`, takes one or all of them away. */
  const apply = useCallback(
    (next: readonly string[]) => {
      for (const tag of next) if (!isTagActive(activeTags, tag)) onToggle(tag);
      for (const tag of activeTags) if (!isTagActive(next, tag)) onToggle(tag);
    },
    [activeTags, onToggle],
  );

  const [query, setQuery] = useState('');
  const value = activeTags.length === 1 ? labelOf(activeTags[0] ?? '') : null;

  return (
    <ComboboxPrimitive.Root
      multiple
      items={items}
      value={[...activeTags]}
      onValueChange={apply}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={labelOf}
    >
      <ComboboxPrimitive.Trigger
        data-vaul-no-drag
        aria-pressed={activeTags.length > 0}
        aria-label={
          activeTags.length === 0
            ? 'Tags, showing all'
            : `Tags, ${activeTags.map((tag) => labelOf(tag)).join(', ')}`
        }
        className={cn(TRIGGER_TARGET, PRESS_CHIP)}
      >
        <TriggerFace
          axis="Tags"
          value={value}
          count={activeTags.length > 1 ? activeTags.length : null}
          active={activeTags.length > 0}
          dot={false}
        />
      </ComboboxPrimitive.Trigger>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <ComboboxPrimitive.Popup
            data-vaul-no-drag
            className={cn(MENU_POPUP, 'w-64 max-w-[calc(100vw-2rem)]')}
          >
            <ComboboxPrimitive.Chips className="mb-1 flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-background px-1.5 py-1">
              {activeTags.map((tag) => (
                <ComboboxPrimitive.Chip
                  key={tag}
                  className="flex h-6 min-w-0 items-center gap-0.5 rounded-full bg-tag-selected ps-2 pe-1 text-xs font-medium text-tag-selected-foreground"
                >
                  {/* `dir="auto"` on the label rather than the chip: these are model output from
                      arbitrary captions and half this library is Hebrew, so the isolate has to wrap
                      exactly the untrusted string and not the control's own box. */}
                  <span dir="auto" className="truncate">
                    {labelOf(tag)}
                  </span>
                  <ComboboxPrimitive.ChipRemove
                    aria-label={`Remove the ${labelOf(tag)} tag filter`}
                    className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full opacity-70 outline-none hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <X aria-hidden className="size-3" />
                  </ComboboxPrimitive.ChipRemove>
                </ComboboxPrimitive.Chip>
              ))}
              <ComboboxPrimitive.Input
                placeholder={activeTags.length === 0 ? TAG_SEARCH_PLACEHOLDER : ''}
                aria-label={TAG_SEARCH_PLACEHOLDER}
                className="min-h-7 min-w-16 flex-1 bg-transparent px-1 text-xs font-medium outline-none placeholder:text-muted-foreground"
              />
              {activeTags.length > 0 && (
                <ComboboxPrimitive.Clear
                  aria-label={CLEAR_TAGS_ACCESSIBLE_NAME}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {CLEAR_LABEL}
                </ComboboxPrimitive.Clear>
              )}
            </ComboboxPrimitive.Chips>

            {/* One short line, no apology, and it names nothing it cannot stand behind. */}
            <ComboboxPrimitive.Empty className="px-2 py-3 text-xs font-medium text-muted-foreground empty:m-0 empty:p-0">
              {NO_TAGS_MATCH_LINE}
            </ComboboxPrimitive.Empty>

            <ComboboxPrimitive.List>
              <ComboboxPrimitive.Collection>
                {(tag: string) => (
                  <ComboboxPrimitive.Item key={tag} value={tag} className={MENU_ROW}>
                    <span className={MENU_ROW_PAINT}>
                      <ComboboxPrimitive.ItemIndicator
                        keepMounted
                        className="flex size-3.5 shrink-0 items-center justify-center data-[unchecked]:invisible"
                      >
                        <Check aria-hidden className="size-3.5 text-brand" />
                      </ComboboxPrimitive.ItemIndicator>
                      <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                        {labelOf(tag)}
                      </span>
                      <span className="shrink-0 ps-3 tabular-nums font-normal text-muted-foreground">
                        {byTag.get(tag)?.count ?? 0}
                      </span>
                    </span>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.Collection>
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
