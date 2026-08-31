'use client';

/**
 * How extraction v2's three per-save fields look: `tags` as chips, `dishes` as a named line, and
 * `why_go` as a quiet summary under the caption's own words. Shared by every surface that renders a
 * saved place — the mobile sheet's list and detail, the desktop panel's list, and the map's
 * pin-anchored popover — so there is one visual language for a tag rather than three.
 *
 * `src/ui/place/enrichment.ts` decides *what* is shown (which tags fit a row, whether the model's
 * sentence has earned its place). This file only decides how.
 *
 * **The chips in a detail view are now the library's filter control** (`src/ui/place/tag-filter.ts`
 * holds the state seam and the reasoning). Tapping one narrows the list *and* the pins to the
 * places carrying that tag; tapping it again clears. So the detail chip has every affordance it was
 * previously forbidden — a hover border, a focus ring, a pointer cursor, a filled `aria-pressed`
 * state — and it has them only when a `TagFilterContext` is actually present. With no provider it
 * renders as the inert `<span>` it always was, which is what keeps every other call site, test and
 * mock unchanged.
 *
 * **The chips on a *list row* are deliberately still labels**, and that is a judgement rather than
 * an omission. Two costs, both paid on the phone, which is the surface that matters most:
 *
 *  - A row chip is 20 px tall (`CHIP_ROW`: 16 px line + 4 px padding) with 4 px between chips. That
 *    is under half the 44 px touch floor, and it would sit *inside* the row's own 64 px target for
 *    "open this place". Every near-miss either filters the library when the user meant to open a
 *    place, or opens a place when they meant to filter. Making it big enough to hit means giving
 *    the chip line its own 44 px row, which is a redesign of the list row's density — L1-F1-T2's
 *    work, not this change's.
 *  - The row's whole body is inside a `<button>`, so a chip button there is a nested interactive
 *    element. The only way out is the stretched-target pattern (an absolutely positioned row button
 *    beneath a `pointer-events-none` content layer), which moves the row's text back into the
 *    accessibility tree and makes `rowAccessibleName`'s tag suffix a duplicate announcement of
 *    chips that are now buttons in their own right. That is a real change to how twenty rows are
 *    announced, made to serve a target nobody can reliably hit.
 *
 * The gesture is therefore one tap on a chip, from a place's detail — which is itself one tap from
 * any row. If the list needs a one-tap path later, the honest version is a taller row, not a
 * smaller target.
 *
 * Three things about untrusted text, because every string here is model output derived from an
 * arbitrary creator's caption:
 *
 *  - **`dir="auto"`** on every rendered value. Tel Aviv is a target city, so Hebrew tags will land
 *    beside Latin ones; `dir="auto"` picks each chip's direction from its own first strong
 *    character *and* makes it a bidi isolate (the HTML5 UA rule `[dir] { unicode-bidi: isolate }`),
 *    so a right-to-left label cannot reorder the punctuation or the labels around it.
 *  - **Clipping, not trust.** Chips are `truncate` with a fixed line height and `overflow-hidden`.
 *    Measured on this database: `normalize_tag()` strips controls, zero-width and bidi marks, but
 *    it does *not* strip combining marks, and the application-side `normalise()` that does strip
 *    them is not on the only write path. A stack of combining marks therefore has to be contained
 *    by the box rather than assumed away.
 *  - **`tagDisplayLabel`, always.** Stored tags are lowercase keys (`pan asian`); casing is a
 *    render concern and `domain/extraction/tags.ts` owns it. Nothing here re-implements it.
 */

import { isolate } from '@/ui/place/active-area';
import { X } from 'lucide-react';

import { tagDisplayLabel } from '@/domain/extraction/tags';
import { splitRowTags } from '@/ui/place/enrichment';
import { isTagActive, useTagFilter, type TagFacet } from '@/ui/place/tag-filter';
import { PRESS_CHIP } from '@/lib/interaction';
import { cn } from '@/lib/utils';

/**
 * The chip. One shape, two sizes — `--tag`/`--tag-foreground` (and, for the active filter,
 * `--tag-selected`/`--tag-selected-foreground`) are semantic tokens in `globals.css` rather than a
 * reach into the mint ramp, so re-theming a chip never means editing a component.
 *
 * `rounded-full` still separates a chip from every button in the product, all of which are
 * `rounded-lg`. That difference now carries a different meaning: a pill is a *tag*, not that a tag
 * is inert. What says "you can press this" is the hover border, the focus ring and the cursor added
 * by `CHIP_PRESSABLE`, which only a chip inside a `TagFilterContext` ever gets.
 */
const CHIP_BASE =
  'inline-block max-w-full truncate rounded-full bg-tag font-bold text-tag-foreground';
const CHIP_DETAIL = 'px-2.5 py-1 text-xs leading-4';
const CHIP_ROW = 'px-2 py-0.5 text-micro leading-4';

/**
 * A detail chip that is a control. `min-h-8` (32 px) rather than the label's 24 px: still short of
 * the 44 px touch floor, and deliberately so — a detail view's chips have no competing target
 * beside them, they are 60–120 px wide, and a 44 px pill would dominate a block that sits directly
 * under the place's name. 32 px is the height at which it stops being a mis-tap magnet without
 * becoming the loudest thing on the screen. Stated as a trade rather than a rule met.
 *
 * It carries a **faint border at rest**, not only on hover, and that is the touch decision in this
 * component. Hover does not exist on a phone: a chip whose only affordance appears on `:hover` is
 * an inert label to every user this product is designed for first. 15% of the chip's own ink is
 * enough to read as an edge — the thing labels do not have — without turning a block of five tags
 * into a grid of outlines. Hover then deepens it to 45%, which is the pointer user's confirmation
 * that they are over a target rather than the first news of it.
 *
 * The border width never changes between states, so nothing reflows; the whole thing animates on
 * `border-color`/`background-color`, neither of which triggers layout.
 *
 * `PRESS_CHIP` is the sixth column the state matrix says every interactive element owes and this
 * one did not have: on a phone, hover does not exist and focus-visible does not fire, so until now
 * the only confirmation that a tap had landed was the list underneath changing. The 5% squeeze is
 * the acknowledgement, and it is `motion-safe:` — under reduced motion the fill change is the whole
 * of it, which is what the chip already had.
 *
 * ## One string, and the pressed state is a variant rather than a second string
 *
 * This used to be three constants — the shape, `CHIP_PRESSABLE_REST` and `CHIP_PRESSABLE_ACTIVE` —
 * chosen between by a ternary at each of the three call sites. The DOM already carried
 * `aria-pressed` on every one of them, so the state was being computed in JavaScript, written into
 * an attribute, and then computed *again* to pick a class string. `aria-pressed:` reads the
 * attribute that is already there (run rule 6a: state comes from variants, never from a class
 * string assembled in a ternary), which means a chip cannot render pressed-looking while telling a
 * screen reader it is not.
 *
 * **The fill is deliberately a token reference and not a fixed colour.** `bg-tag-selected` compiles
 * to `background-color: var(--tag-selected)`, so a call site that sets `--tag-selected` on the
 * button itself changes what "pressed" looks like for that chip alone — which is how the category
 * filter bar fills a pressed chip with *that category's* colour instead of house mint. Every other
 * chip inherits the mint from `:root` and nothing about them changes.
 */
export const CHIP_PRESSABLE =
  'inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-full border px-3 text-xs font-bold outline-none motion-safe:transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ' +
  'border-tag-foreground/15 bg-tag text-tag-foreground hover:border-tag-foreground/45 ' +
  'aria-pressed:border-transparent aria-pressed:bg-tag-selected aria-pressed:text-tag-selected-foreground ' +
  PRESS_CHIP;

/** The kicker above a filter pill — `TAGGED`, `SHOWING`. Exported so a second filter cannot invent
 *  a slightly different micro-label beside the first. */
export const FILTER_KICKER =
  'shrink-0 text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase';

/**
 * The full tag set, for a detail view. Wraps freely — five tags on a 390 px phone is two lines, and
 * the detail container already scrolls, so there is nothing to truncate away.
 *
 * A real `<ul>` with an accessible name: five sibling labels with no grouping are announced as five
 * loose words in the middle of a place's detail, with nothing saying what they are.
 */
export function TagChipList({ tags }: { tags: readonly string[] }) {
  const filter = useTagFilter();
  if (tags.length === 0) return null;

  return (
    // `Tags` when they are labels, `Filter by tag` when they are controls: the group's accessible
    // name is the only thing that tells a screen-reader user which of the two this list is, and it
    // has to be true in both cases rather than convenient in one.
    <ul
      aria-label={filter ? 'Filter by tag' : 'Tags'}
      className={cn('flex flex-wrap', filter ? 'gap-2' : 'gap-1.5')}
    >
      {tags.map((tag) => (
        <li key={tag} className="flex min-w-0">
          {filter ? (
            <button
              type="button"
              // Inside the mobile sheet a press that begins here would otherwise be read as the
              // start of a sheet drag and the tap would be swallowed — the same reason every row
              // and the search field carry it.
              data-vaul-no-drag
              // `aria-pressed` is the whole state model for this control: the chip is a toggle, so
              // an assistive technology says "pressed"/"not pressed" without any extra live region,
              // and tapping the pressed one clears the filter.
              aria-pressed={isTagActive(filter.activeTag, tag)}
              onClick={() => filter.onToggleTag(tag)}
              // No ternary: `aria-pressed` above is the state, and `CHIP_PRESSABLE` carries both
              // arms of it as variants.
              className={CHIP_PRESSABLE}
            >
              {/* `dir="auto"` sits on the text rather than the button so the bidi isolate wraps
                  exactly the untrusted string, not the control's own box. */}
              <span dir="auto" className="truncate">
                {tagDisplayLabel(tag)}
              </span>
            </button>
          ) : (
            <span dir="auto" className={cn(CHIP_BASE, CHIP_DETAIL)}>
              {tagDisplayLabel(tag)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * **The tag facet: the library's own vocabulary, with counts, as a row of chips.**
 *
 * Tags are the only field that actually separates one saved place from another — `places.category`
 * holds four values across the twenty live rows, fourteen of them `restaurant` — and until now the
 * only way to filter by one was to already know it existed, open a place that happened to carry it,
 * and tap the chip inside its detail view. `growth-plan.md` §4 names that as the pattern: *"you can
 * filter by a tag only if you already happened to see it on a place"*. This is the aggregate read
 * the product had no surface for.
 *
 * ## Three rules, all of them `overnight-copy-deck.md` §9.1's and none of them negotiable
 *
 *  1. **Every chip yields at least one place.** The facets are counted over the user's own rows, so
 *     a tag no place carries cannot appear. `tagFacets` is where that is guaranteed.
 *  2. **No tags at all means nothing renders** — not a disabled row, not a "no tags yet" line, not
 *     a placeholder. The caller passes an empty array and this returns `null`. It is also the
 *     common case: nothing was backfilled, so every place saved before extraction v2 has none.
 *  3. **A control must not remove itself when you use it.** That is why this row is absent while a
 *     tag is filtering: `ActiveTagFilter` is on screen instead, holding the pressed tag and one tap
 *     to clear. The deck's own recommendation was to keep the pressed chip inside this row; the
 *     shape here satisfies the rule it exists for — the way out is always visible — and it avoids
 *     showing counts this surface cannot compute honestly. **The reason is a data seam, stated
 *     rather than dressed up:** the sheet is handed a list already narrowed by the active tag, so
 *     with a tag on, every other tag's count here would be its co-occurrence with that tag rather
 *     than its own. A wrong number in a chip is worse than a chip that steps aside for the pill.
 *     Wiring the un-narrowed set through the page — the seam `categoryFacets` already has — is what
 *     would let both live on screen together, and that is a change in a file this lane does not own.
 *
 * ## Why a second row rather than more chips in the category bar
 *
 * `category-filter-bar.tsx` argues against stacking bars, and it is right about the chip it was
 * written for: `Not been yet` and `Café 4` are the same kind of control asking the same kind of
 * question. A tag is a different question — *what is this place like* rather than *what kind of
 * thing is it* — and merging them would put two vocabularies in one row where a `Café 13` chip and
 * a `Late Night 5` chip look identical and mean different dimensions. What tells them apart on
 * screen is the category chip's coloured dot, which a tag chip does not have.
 */
export function TagFacetBar({
  facets,
  className,
}: {
  /** Already counted and ordered by `tagFacets`. Empty renders nothing at all. */
  readonly facets: readonly TagFacet[];
  className?: string;
}) {
  const filter = useTagFilter();
  // No provider means no way to act on a tap, and a row of chips that cannot filter is the false
  // affordance this whole file refuses elsewhere.
  if (filter === null || facets.length === 0) return null;

  return (
    <div
      // The same gestures the category bar takes, and for the same reasons: without
      // `data-vaul-no-drag` a horizontal drag inside the sheet is read as a sheet drag, and
      // `overscroll-x-contain` stops a swipe running off the end from chaining into the browser's
      // back gesture. `-m-1 p-1` keeps the 3px focus ring inside the scroll box.
      data-vaul-no-drag
      role="group"
      aria-label={TAG_BAR_LABEL}
      className={cn(
        // **Scrolls on a phone, wraps on a desktop**, and the split is a Q1 finding rather than a
        // preference. Measured at 1440x900 with 300 places: this row overflowed the panel and cut
        // `Restaurant 10` off mid-count with no affordance — and a clipped count is not a smaller
        // truth, it is a false one (W2-4's exit criterion is that counts render). At 3 places
        // everything fitted, which is why every small fixture passed: the defect only exists in the
        // case the product is actually for.
        //
        // A horizontal scroll is right on a phone — it is the pattern, the gesture exists, and
        // vertical space in a sheet is the scarcest thing there is. It is wrong in a 500px panel on
        // a desktop, where vertical space is free and the gesture mostly is not: a mouse wheel
        // scrolls a horizontal container in no browser by default, so the clipped chips were not
        // merely unlabelled, they were unreachable.
        //
        // One `lg:` variant does both, because the two hosts are already breakpoint-exclusive —
        // `PlaceSheet` is `lg:hidden` and `PlaceDesktopPanel` is `hidden lg:flex`, so each only
        // ever renders on the side of the breakpoint it belongs to.
        // On the phone the row genuinely scrolls, and `scroll-fade-x` is what says so. Measured at
        // 390x844 with 300 places: the row's own docblock claims "what says there is more is the
        // chip clipped at the trailing edge", and that turns out to be **incidental** — whether a
        // partial chip shows depends on where the chip boundaries happen to fall, and at 300 places
        // the tag row ends very nearly flush with two more chips off-screen and nothing saying so.
        //
        // `scroll-fade-x` comes from the pinned `shadcn/tailwind.css` already imported by
        // `globals.css` — no new dependency — and it is **scroll-driven**
        // (`animation-timeline: scroll(self inline)`), which is the property that makes it honest
        // rather than decorative: the trailing edge fades only while there is actually more to
        // reach, and a row that fits shows no fade at all. Browsers without scroll-driven
        // animations fall back to a static edge fade, which over-promises slightly rather than
        // under-promising, and that is the right direction to fail in.
        //
        // `lg:scroll-fade-none` because above `lg` the row wraps and there is nothing to scroll —
        // a mask there would fade the last chip of a complete row for no reason.
        '-m-1 flex gap-2 overflow-x-auto overscroll-x-contain p-1 scroll-fade-x lg:flex-wrap lg:scroll-fade-none',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {facets.map(({ tag, label, count }) => (
        <button
          key={tag}
          type="button"
          data-vaul-no-drag
          aria-pressed={isTagActive(filter.activeTag, tag)}
          // The visible text is `Late Night 5`, which read aloud is a loose number away from a
          // sentence. The label names the same two facts in words and contains the visible label,
          // so it satisfies label-in-name rather than replacing what the chip says. `isolate` on
          // the tag: it is model output derived from an arbitrary caption, and a Hebrew tag would
          // otherwise reorder the count and the noun around it.
          aria-label={`${isolate(label)}, ${count} place${count === 1 ? '' : 's'}`}
          onClick={() => filter.onToggleTag(tag)}
          className={cn(CHIP_PRESSABLE, 'min-h-11 shrink-0 gap-2')}
        >
          <span dir="auto" className="max-w-40 truncate">
            {label}
          </span>
          <span className="shrink-0 tabular-nums opacity-70">{count}</span>
        </button>
      ))}
    </div>
  );
}

/** The group's accessible name. A row of toggle buttons with no grouping is a handful of loose
 *  words — the same reason `TagChipList` and the category bar each name themselves. */
const TAG_BAR_LABEL = 'Filter by tag';

/**
 * The active filter, said out loud above the list: which tag is narrowing the library, and one tap
 * to stop it.
 *
 * Deliberately **not** a filter bar. It renders only while a filter is on, it holds exactly the one
 * tag the user chose, and it offers no vocabulary to browse — a row of category chips to pick from
 * is L2 scope and was rejected. This is the dismiss affordance for a state the user is already in.
 *
 * The whole pill is the clear button, so there is no 20 px `×` to hit beside a label that does
 * something else: one target, 36 px tall, and its accessible name says what pressing it does rather
 * than naming the tag a second time.
 */
export function ActiveTagFilter({
  tag,
  onClear,
  className,
}: {
  tag: string;
  onClear: () => void;
  className?: string;
}) {
  const label = tagDisplayLabel(tag);

  return (
    <div data-vaul-no-drag className={cn('flex min-w-0 items-center gap-2', className)}>
      {/* The same uppercase micro-label the rest of the sheet uses for a kicker. Without it a lone
          filled pill under the heading is just a word — the user has to infer that it is the reason
          the list got shorter. */}
      <span className={FILTER_KICKER}>Tagged</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the ${isolate(label)} tag filter`}
        className={cn(
          'inline-flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-tag-selected px-3 text-xs font-bold text-tag-selected-foreground outline-none motion-safe:transition-colors hover:bg-tag-selected-hover focus-visible:ring-3 focus-visible:ring-ring/50',
          // It is chip-shaped, so it presses like one — and it is the only way out of a filter
          // that has emptied the list, which is the state where a tap that looks ignored is worst.
          PRESS_CHIP,
        )}
      >
        <span dir="auto" className="truncate">
          {label}
        </span>
        <X className="size-3.5 shrink-0" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The row's tags: at most three on one line, the rest as a count.
 *
 * `<span>`s, not a list, because the row's whole body sits inside a `<button>` and a `<ul>` is not
 * phrasing content — an invalid nesting the browser silently repairs by moving the list out of the
 * button, which is a real layout bug rather than a validator complaint. The row's `aria-label`
 * carries the same tags for assistive technology (see `PlaceRow`), so nothing is lost by these
 * being plain spans.
 *
 * Each chip shrinks (`min-w-0` + the default `flex-shrink: 1`) only when the line would otherwise
 * overflow, and truncates rather than clipping mid-glyph, so one 28-character tag ellipses itself
 * instead of pushing the count off the row.
 */
export function TagChipRow({ tags }: { tags: readonly string[] }) {
  const { shown, overflow } = splitRowTags(tags);
  if (shown.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {shown.map((tag) => (
        <span key={tag} dir="auto" className={cn(CHIP_BASE, CHIP_ROW, 'min-w-0 shrink')}>
          {tagDisplayLabel(tag)}
        </span>
      ))}
      {overflow > 0 && (
        // Deliberately not a chip: a filled `+2` would read as a fourth tag called "+2".
        <span className="shrink-0 text-micro font-bold leading-4 text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * The one small label left on the detail screen.
 *
 * There used to be three of these stacked — FROM THE POST, NAMED IN THE POST, IN SHORT — over a
 * card that often held three lines of content between them, and the labels were the loudest thing
 * on it. The caption quote now says what it is by being a quotation, and the model's sentence says
 * what it is by being quiet and unquoted, which leaves exactly one block that genuinely needs
 * naming.
 */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * The dishes the post named, as a text line rather than chips — and that difference is the point.
 *
 * A tag is an index entry: it is the vocabulary the library is organised by, and since tag chips
 * became the filter control it is literally what you tap to retrieve. A dish is a quote — a thing
 * this creator called out in this video. Giving them the same shape would say they are the same
 * kind of object and invite a user to tap one, which does nothing. That was a prediction when this
 * was written; it is now the difference between the two blocks on the same screen.
 *
 * Stored normalised and lowercase like tags (`0019`), so it renders through the same
 * `tagDisplayLabel`. Each item is its own `dir="auto"` span so a Hebrew dish beside a Latin one
 * cannot drag the separators around it.
 */
export function DishLine({ dishes }: { dishes: readonly string[] }) {
  if (dishes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <Kicker>Dishes mentioned</Kicker>
      <p className="text-sm leading-relaxed text-foreground">
        {dishes.map((dish, index) => (
          <span key={dish}>
            {index > 0 && <span className="text-muted-foreground/70"> · </span>}
            <span dir="auto">{tagDisplayLabel(dish)}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The model's one-sentence summary — below the verbatim caption quote, in muted ink, and with no
 * label of its own.
 *
 * That is the extracted-versus-inferred invariant expressed as shape rather than as a caption.
 * `extracted_reason` is what the creator actually wrote and renders as a quotation, between quote
 * marks against a rule; this is the model's reading of it and renders as plain quiet prose. A user
 * can tell the two apart at a glance without either being labelled, which is what lets the labels
 * go — and the old `IN SHORT` kicker was doing nothing except making a one-line summary look like
 * a section.
 *
 * Whether it renders at all is `whyGoEarnsItsPlace`'s decision, made by the caller.
 */
export function WhyGoLine({ whyGo }: { whyGo: string }) {
  return (
    <p dir="auto" className="text-sm leading-relaxed text-muted-foreground">
      {whyGo}
    </p>
  );
}
