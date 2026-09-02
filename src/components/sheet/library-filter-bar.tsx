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

import {
  createContext,
  useCallback,
  useRef,
  useContext,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Menu } from '@base-ui/react/menu';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Check, ChevronDown } from 'lucide-react';

import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { cn } from '@/lib/utils';
import { PRESS_CHIP } from '@/lib/interaction';
import { categoryColorVar, categoryDisplay } from '@/ui/place/category-display';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { isTagActive, type TagFacet } from '@/ui/place/tag-filter';
import {
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { FILTER_KICKER } from './place-enrichment';
import {
  VISIT_FILTERS,
  VISIT_FILTER_GROUP_LABEL,
  VISIT_FILTER_LABEL,
  type VisitFilter,
} from '@/ui/place/visit-state';

/**
 * **Where a menu is drawn, and it is a host prop rather than a media query.**
 *
 * Owner, 2026-09-02: *"i think that on mobile the pop up doesnt feel good."* A floating layer
 * inside a vaul drawer is a popup inside a popup, it competes with the sheet's drag listener, and
 * it strands a narrow menu mid-screen. So the phone gets an **inline disclosure under the row that
 * holds the pressed trigger**, pushing the list down, and the desktop keeps the **anchored
 * popover**. A deliberate breakpoint split.
 *
 * **It must never be read from `matchMedia` at render time.** Both hosts are mounted in the DOM at
 * once behind CSS gates — `place-sheet.tsx` inside `lg:hidden`, `place-desktop-panel.tsx` inside
 * `hidden lg:block` — so the surface is constant per host and identical on the server and the
 * client. `add-sheet.tsx:276-281` records what the alternative costs: a render-time `matchMedia`
 * returns `false` on the server, the two renders emit different markup, and that hydration mismatch
 * shipped on `/sign-in` once already.
 */
export type FilterSurface = 'inline' | 'popover';

/**
 * **Which panel is open, across every axis in the header including the sort.**
 *
 * Only one at a time, and it has to be one register rather than one per control: measured at
 * 390×844 with the tag panel open and the sort pressed, both panels stood at once and the first
 * place row went from y308 to y824 — 30 px of list left on the screen. On the popover surface Base
 * UI's outside-press already does this, so the context is consulted only when the surface is
 * inline.
 */
const InlineMenuGroup = createContext<{
  readonly open: string | null;
  readonly setOpen: (key: string | null) => void;
} | null>(null);

/** How a row tells the axis it was chosen. Single-choice axes close on choose — RULED — and the
 *  row should not have to know which surface it is on to do it. */
const AxisCloseContext = createContext<() => void>(() => {});

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

/** **The resting pill while its own inline panel is open.** On the phone the panel is full width
 *  under the row, so the rotated chevron alone leaves the origin to be inferred — the measured
 *  failure of the earlier inline attempt, where pressing `Category` at x97 made options appear at
 *  x30. `--card-2` paints the origin instead. It is not applied to an active trigger, which already
 *  carries a fill. */
const TRIGGER_PAINT_OPEN = 'bg-card-2';

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
 * **The surface a menu paints on, and there is exactly one of it** — the desktop popup and the
 * phone's inline panel wear the same border, radius, padding and elevation, so the split is where
 * the list is drawn and not what it is.
 *
 * `--popover` rather than `--card`: both resolve to `#FFFFFF` / `#201F1C` today, but `--popover` is
 * the role that exists for this, and it is what lets a future menu ground move without moving every
 * card. Over a live map canvas the hairline border does more work than the shadow — and there is no
 * `backdrop-blur`, which is banned over the canvas, and no glow, which Charter §6 bans outright.
 */
const PANEL_SURFACE =
  'rounded-lg border border-border/60 bg-popover p-1 shadow-raised outline-none';

/**
 * The floating half, on desktop. `w-max` — **the width is the content's**, not the row's and not
 * the panel's: a two-row menu stretched to a 500 px panel reads as a dialog that lost its content.
 *
 * `--available-height` and `--transform-origin` come from the positioner, so a menu near the bottom
 * of the viewport flips above its trigger and scrolls inside what is left. One scroll container,
 * always: nothing inside a popup carries its own `overflow-y`, because two stacked tracks means the
 * user cannot tell which one their thumb will grab.
 *
 * 16 px of radius, not 24: with 4 px of padding around 12 px rows the corners nest exactly
 * (16 − 4 = 12 = `--radius-sm`), where 24 around 16 did not. Motion is a fade and a 4 px rise over
 * `duration-enter` — no scale, because an overshoot on a menu is the single most goofy-reading
 * thing available.
 */
const MENU_POPUP =
  cn(
    PANEL_SURFACE,
    'z-50 max-h-[min(20rem,var(--available-height))] w-max min-w-40 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto overscroll-contain ' +
      'data-open:animate-in data-open:fade-in-0 data-open:motion-safe:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 duration-enter',
  );

/**
 * **The inline half, on the phone.** Normal flow, full content width, no portal, no scrim, no fixed
 * positioning — it pushes the list down rather than covering it, which is the whole point of the
 * split.
 *
 * `order-last` with `w-full` is what puts it under **its own row** rather than under the whole
 * header: flex lays wrapped items out by `order` first, so the panel takes the line below the
 * triggers while `Clear` and the triggers after it stay where they were.
 *
 * The height cap is `dvh`, not `vh`, because the sheet already reasons in `100dvh` and the iOS URL
 * bar moves `vh` under it. 45 % leaves the first list row visible with the tag panel open. No
 * height animation, ever: layout thrash inside a scrolling sheet for no information.
 */
const INLINE_PANEL =
  cn(
    PANEL_SURFACE,
    'order-last mt-1.5 w-full max-h-[45dvh] overflow-y-auto overscroll-contain ' +
      'animate-in fade-in-0 motion-safe:slide-in-from-top-1 duration-enter',
  );

/**
 * **One row of a menu.** No fill, no border and no elevation at rest; the highlight is a full-width
 * ground, and what says "this one" is the indicator and a weight rather than a filled pill.
 *
 * **40 px of paint inside a 44 px target**, the same technique the triggers use. 12 px of radius,
 * which is the panel's 16 minus its 4 px of padding, so the corners nest. The indicator
 * column is always present (`keepMounted`) so the label sits at the same inline offset in every row
 * of every menu, and the count is in an end-aligned column that cannot jitter. Logical properties
 * throughout — both swap edges under RTL, and half this library is Hebrew.
 */
const MENU_ROW = 'group/row flex min-h-11 cursor-pointer select-none items-center outline-none';
/**
 * **The highlight is `bg-card-2`, and `bg-muted/60` was a real accessibility defect.** Base UI's
 * `data-highlighted` is the pointer hover *and* the keyboard-active row. `--muted` is `#FAF9F6`
 * light and `#201F1C` dark; the popup is painted `--card`, `#FFFFFF` / `#201F1C`. So the composite
 * was `#FCFBFA` on white — about 1 %, effectively invisible — and in dark it was **identical to the
 * ground**: a keyboard user arrowed through the menu with no visible position at all.
 *
 * `--card-2` is `#F3F1EB` / `#2A2825`, a real step on both, and it is the product's own documented
 * neutral hover (`facelift-plan.md` §3a, row "Icon button": *surface → `card-2`*). It also keeps
 * the count legible without a second ink — `globals.css:235-240` measures `--muted-foreground`
 * at 4.76 on `--card-2` in light and 5.81 in dark. Not `bg-accent`: `--accent` is `--mint-100`,
 * a 2 % step on white, which is the same defect wearing mint.
 */
const MENU_ROW_PAINT =
  'flex h-10 w-full items-center gap-2 rounded-sm px-2 text-xs font-medium text-foreground ' +
  // `data-highlighted` is Base UI's, on the menu rows; `group-hover` is what the inline radio rows
  // have instead, and both land on the same ground so one list cannot feel different from the other.
  'group-data-highlighted/row:bg-card-2 group-hover/row:bg-card-2 ' +
  'group-focus-visible/row:ring-3 group-focus-visible/row:ring-ring/50 ' +
  'motion-safe:transition-colors motion-safe:duration-press';

/** One header row: wraps, never scrolls, and carries no vertical gap of its own. */
const HEADER_ROW = 'flex flex-wrap items-center gap-x-1.5';

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
  /**
   * **The second row: the sort control, on both hosts.** A slot rather than a prop, so this file
   * never learns what sorting is.
   *
   * It rides on a row of its own because the two rows mean two different things — row 1 narrows the
   * library, row 2 reorders it — and that separation is what the whole redesign is about. Owner,
   * 2026-09-02: *"leave the sort below the filters."* It used to ride inside row 1 as `trailing`,
   * where four triggers plus `Clear` came to ~310 px against ~358 px of content width at 375, so an
   * active value, a Hebrew category name or a three-digit count pushed it to wrap anyway.
   */
  readonly belowRow?: ReactNode;
  /** Where this host's menus are drawn. Constant per host — never read from `matchMedia`. */
  readonly surface?: FilterSurface;
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
  belowRow,
  surface = 'popover',
  className,
}: LibraryFilterBarProps) {
  // **Only one inline panel at a time**, and the bar is where that has to live: two open panels
  // would push the list off a phone screen entirely. On the popover surface this is unused — Base
  // UI's outside-press already closes one menu when another trigger is pressed.
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const group = useMemo(() => ({ open: openPanel, setOpen: setOpenPanel }), [openPanel]);
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
  if (!showCategories && !showVisit && !showTags && belowRow === undefined) return null;

  const categoryLabel = activeCategory === null ? null : categoryDisplay(activeCategory).label;
  const categoryCount =
    activeCategory === null
      ? 0
      : (facets.find((facet) => facet.category === activeCategory)?.count ?? 0);

  return (
    // **Two rows, and they mean two different things.** Row 1 narrows the library; row 2 reorders
    // it. Owner, 2026-09-02: *"leave the sort below the filters."*  No divider and no spacer
    // between them — a border between two rows of a four-control header is card soup, and each 44 px
    // target already carries 6 px of transparent band, which is the gap.
    <InlineMenuGroup.Provider value={group}>
     <div className={cn('flex flex-col', className)}>
      {/* **Wraps, never scrolls.** Three triggers plus `Clear` is about 240 px before a single
          value is shown, against ~358 px of content width at 375 — so an active value, a Hebrew
          category name or a three-digit count will exceed it. A container whose job is to hide
          overflow cannot hold controls whose whole job is to be legible at rest; that is defect D1.
          `gap-x-1.5` and no `gap-y`: the transparent bands already space the wrapped line. */}
      <div className={HEADER_ROW}>
        {showVisit && (
          <MenuAxis
            axis={VISIT_FILTER_GROUP_LABEL}
            value={visitFilter === 'all' ? null : VISIT_FILTER_LABEL[visitFilter]}
            active={visitFilter !== 'all'}
            surface={surface}
            axisClear={visitFilter === 'all' ? null : () => onChangeVisitFilter('all')}
          >
            <AxisRows
              surface={surface}
              groupLabel={VISIT_FILTER_GROUP_LABEL}
              value={visitFilter}
              options={VISIT_FILTERS.map((filter) => ({
                value: filter,
                label: VISIT_FILTER_LABEL[filter],
              }))}
              onChange={(next) => onChangeVisitFilter(next as VisitFilter)}
            />
          </MenuAxis>
        )}

        {showCategories && (
          <MenuAxis
            axis="Category"
            value={categoryLabel}
            count={activeCategory === null ? null : categoryCount}
            active={activeCategory !== null}
            dot={activeCategory !== null}
            surface={surface}
            axisClear={activeCategory === null ? null : () => onToggleCategory(activeCategory)}
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
            <AxisRows
              surface={surface}
              groupLabel="Category"
              value={activeCategory ?? 'all'}
              options={[
                { value: 'all', label: ALL_CATEGORIES_LABEL },
                ...facets.map(({ category, count }) => ({
                  value: category,
                  label: categoryDisplay(category).label ?? category,
                  count,
                  // The chip was only ever the container; the colour is the load-bearing part, and
                  // it survives the move to a list as this dot.
                  dotVar: categoryColorVar(category),
                })),
              ]}
              onChange={(next) => {
                if (next === 'all') {
                  if (activeCategory !== null) onToggleCategory(activeCategory);
                  return;
                }
                if (next !== activeCategory) onToggleCategory(next as ProductCategory);
              }}
            />
          </MenuAxis>
        )}

        {showTags && (
          <TagsAxis
            facets={tagFacets}
            activeTags={activeTags}
            onToggle={onToggleTag}
            surface={surface}
          />
        )}

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
      </div>

      {/* Row 2. `SortControl` decides for itself whether it renders at all — below eight places, or
          below two available orders, there is nothing here and the row collapses to nothing. */}
      {belowRow !== undefined && <div className={HEADER_ROW}>{belowRow}</div>}
     </div>
    </InlineMenuGroup.Provider>
  );
}

/**
 * **One panel open at a time, for whichever control asks.** Inline, the answer comes from the
 * header's own register so that opening the sort closes the tags; on the popover surface Base UI's
 * outside-press already does that and this is plain local state.
 */
function usePanelOpen(panelId: string, surface: FilterSurface): [boolean, (next: boolean) => void] {
  const group = useContext(InlineMenuGroup);
  const [local, setLocal] = useState(false);
  if (surface === 'inline' && group !== null) {
    return [group.open === panelId, (next) => group.setOpen(next ? panelId : null)];
  }
  return [local, setLocal];
}

/**
 * **One axis: a trigger that states its own value, and the list it opens.**
 *
 * Two surfaces, one object. On `popover`, `Menu.Root` owns open/close, the anchoring, Escape, focus
 * return to its own trigger and closing on an outside press — including a press on another axis's
 * trigger, which is what keeps two menus from being open at once. On `inline` the panel is a
 * sibling in normal flow and the *bar* owns which axis is open, because two inline panels at once
 * would push the list off a phone.
 *
 * **`aria-expanded` and `aria-controls` are written here rather than left to the library.** Base UI
 * puts `aria-haspopup` on a closed `Menu.Trigger` and nothing else, and it only wires
 * `aria-controls` while the popup is mounted — so at rest a screen reader was told there is a menu
 * but not that it is closed. The id comes from `useId()`: both hosts are mounted in the DOM at once
 * behind CSS gates, so a hard-coded one is a duplicate-id bug in every single render.
 *
 * Exported because the sort control is one of these: same trigger family, same rows, same panel, and
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
  surface = 'popover',
  open: controlledOpen,
  onOpenChange,
  axisClear,
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
  surface?: FilterSurface;
  /** Inline only: the bar holds the open axis, so opening one panel closes the other. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Inline only: this axis's own clear, on the kicker line, when the axis is narrowing something. */
  axisClear?: (() => void) | null;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const panelId = useId();
  const [grouped, setGrouped] = usePanelOpen(panelId, surface);
  const open = controlledOpen ?? grouped;
  const setOpen = onOpenChange ?? setGrouped;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // **Focus goes back to the trigger, which has just changed to show what was picked.** Base UI
  // returns it for the popover; the inline panel is plain DOM that unmounts under the user's focus,
  // and measured at 390×844 that left `document.activeElement` on `<body>` — a keyboard user's
  // next Tab restarted from the top of the sheet.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  const label =
    tone === 'sort'
      ? `${accessibleAxis ?? axis}, ${value ?? ''}`
      : value === null
        ? `${axis}, showing all`
        : `${axis}, ${value}`;

  const face = (
    <TriggerFace
      axis={axis}
      value={value}
      count={count}
      active={active}
      dot={dot}
      tone={tone}
      open={open}
    />
  );

  if (surface === 'inline') {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          data-vaul-no-drag
          {...(tone === 'filter' ? { 'aria-pressed': active } : {})}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          onClick={() => setOpen(!open)}
          // **Escape closes from the trigger as well as from inside the panel.** Measured at
          // 390×844: opening by pointer leaves focus on the trigger, so a handler only on the panel
          // never fires and Escape was a no-op on this surface. `product-review-2026-09-01-r5.md`
          // G1 is the same defect on the profile popover; it is not optional on a second one.
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !open) return;
            event.stopPropagation();
            setOpen(false);
          }}
          style={style}
          className={cn(TRIGGER_TARGET, PRESS_CHIP)}
        >
          {face}
        </button>
        {open && (
          <InlinePanel id={panelId} axis={axis} axisClear={axisClear ?? null} onEscape={close}>
            <AxisCloseContext.Provider value={close}>{children}</AxisCloseContext.Provider>
          </InlinePanel>
        )}
      </>
    );
  }

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        // Inside the mobile sheet a press that begins here would otherwise be read as the start of
        // a sheet drag and the tap swallowed — the same reason every row and the field carry it.
        data-vaul-no-drag
        // `aria-pressed` on the filter axes because they are also a state; the sort has no "off",
        // so a pressed bit there would announce something it does not have.
        {...(tone === 'filter' ? { 'aria-pressed': active } : {})}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        style={style}
        className={cn(TRIGGER_TARGET, PRESS_CHIP)}
      >
        {face}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-50 outline-none">
          <Menu.Popup
            id={panelId}
            data-vaul-no-drag
            aria-label={accessibleAxis ?? axis}
            className={MENU_POPUP}
          >
            <AxisCloseContext.Provider value={close}>{children}</AxisCloseContext.Provider>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * **The phone's panel: the same list, in normal flow, under its own row.**
 *
 * Not a modal. No portal, no scrim, nothing trapped — `Tab` leaves it normally and it stays open,
 * because it makes no modal claim. Escape closes it and returns to the trigger, which is not
 * optional: `product-review-2026-09-01-r5.md` G1 found the profile popover shipped without either,
 * and this must not be the second surface to do it.
 *
 * **The kicker is what says where the panel came from.** Full width under the row means the panel
 * cannot sit beneath the exact pill that was pressed, so the axis word is printed on its first line
 * and the pressed trigger stays painted open. That, together with the panel being under *its own*
 * row rather than under the whole header, is the answer to the earlier inline attempt's measured
 * failure — press `Category` at x97, options appear at x30 under two unrelated controls.
 */
function InlinePanel({
  id,
  axis,
  axisClear,
  onEscape,
  children,
}: {
  id: string;
  axis: string;
  axisClear: (() => void) | null;
  onEscape: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      data-vaul-no-drag
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onEscape();
      }}
      className={INLINE_PANEL}
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5">
        <span className={FILTER_KICKER}>{axis}</span>
        {axisClear !== null && (
          <button
            type="button"
            data-vaul-no-drag
            onClick={axisClear}
            className="shrink-0 cursor-pointer rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CLEAR_LABEL}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * **The rows of a single-choice axis, on whichever surface is asking.**
 *
 * One options list, two primitives, because neither can do the other's job: `Menu.RadioGroup` is
 * the right thing inside a floating menu and cannot be rendered in flow, and Base UI's `RadioGroup`
 * is a real `role="radiogroup"` with roving focus and arrow keys that needs no popup at all. Both
 * paint the identical row, so the two surfaces cannot drift apart, and neither hand-rolls a roving
 * tabindex or an outside-click listener.
 */
export interface AxisOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | null;
  readonly dotVar?: string | null;
}

export function AxisRows({
  surface,
  value,
  options,
  onChange,
  groupLabel,
}: {
  surface: FilterSurface;
  value: string;
  options: readonly AxisOption[];
  onChange: (next: string) => void;
  groupLabel: string;
}) {
  const close = useContext(AxisCloseContext);
  // **Single-select closes on choose and hands focus back to the trigger** — RULED, owner
  // 2026-09-02. On the popover surface `closeOnClick` on the row does the focus return; the call
  // here is what makes the inline panel behave the same way, and it is idempotent on both.
  const choose = (next: string) => {
    onChange(next);
    close();
  };
  if (surface === 'popover') {
    return (
      <Menu.RadioGroup value={value} onValueChange={(next) => choose(String(next))}>
        {options.map((option) => (
          <MenuRadioRow key={option.value} {...option} selected={option.value === value} />
        ))}
      </Menu.RadioGroup>
    );
  }
  return (
    <RadioGroup
      aria-label={groupLabel}
      value={value}
      onValueChange={(next) => choose(String(next))}
      className="flex flex-col"
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          data-vaul-no-drag
          className={MENU_ROW}
          // The panel stays open for `Tags` and closes for the single-choice axes; the bar decides,
          // via `onChange`, so this component never learns which axis it is drawing.
        >
          <RowFace {...option} selected={option.value === value}>
            <Radio.Indicator
              keepMounted
              className="flex size-3.5 shrink-0 items-center justify-center data-[unchecked]:invisible"
            >
              <Check aria-hidden className="size-3.5 text-brand" />
            </Radio.Indicator>
          </RowFace>
        </Radio.Root>
      ))}
    </RadioGroup>
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
  open = false,
}: {
  axis: string;
  value: string | null;
  count: number | null;
  active: boolean;
  dot: boolean;
  tone?: 'filter' | 'sort';
  open?: boolean;
}) {
  return (
    <span
      className={cn(
        tone === 'sort' ? SORT_PAINT : TRIGGER_PAINT,
        active && tone === 'filter' && TRIGGER_PAINT_ACTIVE,
        open && !active && TRIGGER_PAINT_OPEN,
      )}
    >
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
      {/* Rotated from the state rather than from `data-popup-open`, because the inline surface has
          no popup to carry that attribute. Under reduced motion it still *ends* rotated: the
          transition is dropped, never the state — it is the open indicator. */}
      <ChevronDown
        aria-hidden
        className={cn(
          'size-3 shrink-0 opacity-70 motion-safe:transition-transform motion-safe:duration-cross',
          open && 'rotate-180',
        )}
      />
    </span>
  );
}

/**
 * **What a row looks like, on either surface.** The indicator column, an optional colour dot, the
 * label, and the count on the far edge. The indicator is passed in, because the menu's and the
 * radio group's indicators are different components saying the same thing.
 *
 * Logical properties throughout: the indicator column, the count column and the truncation all swap
 * edges under RTL, and half this library is Hebrew. `dir="auto"` wraps the untrusted label and
 * nothing else — on the row's own box it would flip the count relative to its own label.
 */
function RowFace({
  label,
  count = null,
  selected,
  dotVar = null,
  children,
}: {
  label: string;
  count?: number | null;
  selected: boolean;
  dotVar?: string | null;
  children: ReactNode;
}) {
  return (
    <span className={MENU_ROW_PAINT}>
      {children}
      {dotVar !== null && (
        /* The chip was only ever the container; the colour is the load-bearing part, and it
           survives the move to a list as this dot. A token reference, never a hex. */
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotVar }}
        />
      )}
      <span dir="auto" className={cn('min-w-0 flex-1 truncate text-start', selected && 'font-bold')}>
        {label}
      </span>
      {count !== null && (
        <span className="shrink-0 ps-3 tabular-nums font-normal text-muted-foreground">{count}</span>
      )}
    </span>
  );
}

/** A row of a floating radio menu. Exported so the sort menu is built from the same row as the
 *  filter menus.
 *
 *  **`closeOnClick` is set, and its default is `false`.** Owner, 2026-09-02: *"maybe we should do
 *  that for one option select it will close the menu"* — they checked and reported that the menus
 *  did not close, and this is why: Base UI keeps a radio menu open on choose unless told otherwise.
 *  Closing returns focus to the trigger, which has just changed to show the pick. */
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
    <Menu.RadioItem value={value} closeOnClick className={MENU_ROW}>
      <RowFace label={label} count={count} selected={selected} dotVar={dotVar}>
        {/* `keepMounted` so the column exists in every row and the labels line up at one inline
            offset across all four menus. `visibility: hidden` paints nothing — it is reserved
            space, not a drawn empty box, which is what the owner rejected on the tag rows. */}
        <Menu.RadioItemIndicator
          keepMounted
          className="flex size-3.5 shrink-0 items-center justify-center data-[unchecked]:invisible"
        >
          <Check aria-hidden className="size-3.5 text-brand" />
        </Menu.RadioItemIndicator>
      </RowFace>
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
  surface,
}: {
  facets: readonly TagFacet[];
  activeTags: readonly string[];
  onToggle: (tag: string) => void;
  surface: FilterSurface;
}) {
  const panelId = useId();
  const [open, onOpenChange] = usePanelOpen(panelId, surface);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeToTrigger = useCallback(() => {
    onOpenChange(false);
    triggerRef.current?.focus();
  }, [onOpenChange]);
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
  const label =
    activeTags.length === 0
      ? 'Tags, showing all'
      : `Tags, ${activeTags.map((tag) => labelOf(tag)).join(', ')}`;

  const face = (
    <TriggerFace
      axis="Tags"
      value={value}
      count={activeTags.length > 1 ? activeTags.length : null}
      active={activeTags.length > 0}
      dot={false}
      open={open}
    />
  );

  /** The chip rail, the field and the list — identical on both surfaces, because the split is
   *  where the list is drawn and not what it is. */
  const body = (
    <>
      <ComboboxChips className="mb-1 min-h-9 rounded-sm border-border/70 bg-background px-1.5 py-1 text-xs">
        {activeTags.map((tag) => (
          <ComboboxChip
            key={tag}
            className="h-6 gap-0.5 rounded-full bg-tag-selected ps-2 pe-1 text-tag-selected-foreground"
            removeLabel={`Remove the ${labelOf(tag)} tag filter`}
          >
            {/* `dir="auto"` on the label rather than the chip: these are model output from
                arbitrary captions and half this library is Hebrew, so the isolate has to wrap
                exactly the untrusted string and not the control's own box. */}
            <span dir="auto" className="truncate">
              {labelOf(tag)}
            </span>
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={activeTags.length === 0 ? TAG_SEARCH_PLACEHOLDER : ''}
          aria-label={TAG_SEARCH_PLACEHOLDER}
          data-vaul-no-drag
          // Tags are lowercase normalised strings and half this library is Hebrew, so autocorrect
          // is actively wrong here.
          inputMode="search"
          enterKeyHint="done"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-7 px-1 text-xs font-medium placeholder:text-muted-foreground"
        />
        {activeTags.length > 0 && (
          <ComboboxPrimitive.Clear
            aria-label={CLEAR_TAGS_ACCESSIBLE_NAME}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CLEAR_LABEL}
          </ComboboxPrimitive.Clear>
        )}
      </ComboboxChips>

      {/* One short line, no apology, and it names nothing it cannot stand behind. */}
      <ComboboxEmpty>{NO_TAGS_MATCH_LINE}</ComboboxEmpty>

      <ComboboxList>
        <ComboboxCollection>
          {(tag: string) => (
            <ComboboxItem key={tag} value={tag} className={MENU_ROW}>
              <RowFace
                label={labelOf(tag)}
                count={byTag.get(tag)?.count ?? 0}
                selected={isTagActive(activeTags, tag)}
              >
                {/* **A check only when checked** — owner, 2026-09-02. The column is kept mounted so
                    the labels do not shift sideways the moment one is ticked, but nothing is drawn
                    in an unchecked row: reserved space, not an empty box. */}
                {/* **A check only when checked**, which is the one thing the owner asked for by
                    name. `keepMounted` with `data-[unchecked]:invisible` — the menu's idiom — put a
                    check on *every* tag row: the combobox's attribute is `data-selected`
                    (`ComboboxItemDataAttributes`), and there is no unchecked one to hang the hide
                    on. So the indicator is left unmounted until the row is selected, and this
                    wrapper reserves its 14 px so the labels do not shift sideways when one is. */}
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  <ComboboxPrimitive.ItemIndicator>
                    <Check aria-hidden className="size-3.5 text-brand" />
                  </ComboboxPrimitive.ItemIndicator>
                </span>
              </RowFace>
            </ComboboxItem>
          )}
        </ComboboxCollection>
      </ComboboxList>
    </>
  );

  if (surface === 'inline') {
    return (
      // `inline` renders the list in normal flow instead of in the component's own popup, and the
      // library's own note says to pass `open` unconditionally with it. What the trigger toggles is
      // whether the panel is mounted at all, which is why the open state lives in the bar.
      <ComboboxPrimitive.Root
        multiple
        inline
        open
        items={items}
        value={[...activeTags]}
        onValueChange={apply}
        inputValue={query}
        onInputValueChange={setQuery}
        itemToStringLabel={labelOf}
      >
        <button
          ref={triggerRef}
          type="button"
          data-vaul-no-drag
          aria-pressed={activeTags.length > 0}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          onClick={() => onOpenChange(!open)}
          // Escape from the trigger, exactly as the other three axes: opening by pointer leaves
          // focus here, so a handler only on the panel never fires.
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !open) return;
            event.stopPropagation();
            closeToTrigger();
          }}
          className={cn(TRIGGER_TARGET, PRESS_CHIP)}
        >
          {face}
        </button>
        {open && (
          <InlinePanel
            id={panelId}
            axis="Tags"
            // The axis's own clear is `Combobox.Clear` inside the chip rail; a second one on the
            // kicker line would be two controls for one action.
            axisClear={null}
            onEscape={closeToTrigger}
          >
            {body}
          </InlinePanel>
        )}
      </ComboboxPrimitive.Root>
    );
  }

  return (
    <ComboboxPrimitive.Root
      multiple
      items={items}
      value={[...activeTags]}
      onValueChange={apply}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={labelOf}
      open={open}
      onOpenChange={onOpenChange}
    >
      <ComboboxPrimitive.Trigger
        data-vaul-no-drag
        aria-pressed={activeTags.length > 0}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        className={cn(TRIGGER_TARGET, PRESS_CHIP)}
      >
        {face}
      </ComboboxPrimitive.Trigger>

      <ComboboxContent id={panelId} data-vaul-no-drag className={cn(MENU_POPUP, 'w-64')}>
        {body}
      </ComboboxContent>
    </ComboboxPrimitive.Root>
  );
}
