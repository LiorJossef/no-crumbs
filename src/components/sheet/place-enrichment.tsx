/**
 * How extraction v2's three per-save fields look: `tags` as chips, `dishes` as a named line, and
 * `why_go` as a quiet summary under the caption's own words. Shared by every surface that renders a
 * saved place — the mobile sheet's list and detail, the desktop panel's list, and the map's
 * pin-anchored popover — so there is one visual language for a tag rather than three.
 *
 * `src/ui/place/enrichment.ts` decides *what* is shown (which tags fit a row, whether the model's
 * sentence has earned its place). This file only decides how. Nothing here is interactive: tag
 * filtering is a separate change, and until it exists a chip must not look pressable — no hover
 * state, no focus ring, no border, no elevation, no pointer cursor. It is a label.
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

import { tagDisplayLabel } from '@/domain/extraction/tags';
import { splitRowTags } from '@/ui/place/enrichment';
import { cn } from '@/lib/utils';

/**
 * The chip. One shape, two sizes, and no state — `--tag`/`--tag-foreground` are semantic tokens
 * (`globals.css`) rather than a reach into the mint ramp, so re-theming a label never means editing
 * a component.
 *
 * `rounded-full` is safe here precisely because nothing else in this product is: every button is
 * `rounded-lg` on solid `mint-400`. A pale, fully-rounded, borderless chip is visually the furthest
 * thing on screen from an action.
 */
const CHIP_BASE =
  'inline-block max-w-full truncate rounded-full bg-[var(--tag)] font-bold text-[var(--tag-foreground)]';
const CHIP_DETAIL = 'px-2.5 py-1 text-xs leading-4';
const CHIP_ROW = 'px-2 py-0.5 text-[11px] leading-4';

/**
 * The full tag set, for a detail view. Wraps freely — five tags on a 390 px phone is two lines, and
 * the detail container already scrolls, so there is nothing to truncate away.
 *
 * A real `<ul>` with an accessible name: five sibling labels with no grouping are announced as five
 * loose words in the middle of a place's detail, with nothing saying what they are.
 */
export function TagChipList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;

  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag} className="flex min-w-0">
          <span dir="auto" className={cn(CHIP_BASE, CHIP_DETAIL)}>
            {tagDisplayLabel(tag)}
          </span>
        </li>
      ))}
    </ul>
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
        <span className="shrink-0 text-[11px] font-bold leading-4 text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * The kicker above a detail block — the same uppercase micro-label `PlaceDetail` already uses for
 * "From the post", lifted here so a new block cannot invent a fourth variant of it.
 */
function Kicker({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p
      className={cn(
        'text-[11px] font-bold tracking-[0.1em] uppercase',
        muted ? 'text-muted-foreground/70' : 'text-muted-foreground',
      )}
    >
      {children}
    </p>
  );
}

/**
 * The dishes the post named, as a text line rather than chips — and that difference is the point.
 *
 * A tag is an index entry: it is the vocabulary the library is organised by, it is what the filter
 * chips will read, and a chip is the right shape for something you will one day tap. A dish is a
 * quote — a thing this creator called out in this video. Giving them the same shape would say they
 * are the same kind of object and invite a user to tap one, which will never do anything.
 *
 * Stored normalised and lowercase like tags (`0019`), so it renders through the same
 * `tagDisplayLabel`. Each item is its own `dir="auto"` span so a Hebrew dish beside a Latin one
 * cannot drag the separators around it.
 */
export function DishLine({ dishes }: { dishes: readonly string[] }) {
  if (dishes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <Kicker>Named in the post</Kicker>
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
 * The model's one-sentence summary — rendered *below* the verbatim caption quote and in muted ink,
 * never above it and never at the same weight.
 *
 * That ordering is the extracted-versus-inferred invariant expressed as hierarchy. `extracted_reason`
 * is what the creator actually wrote; this is the model's paraphrase of it. When both are on screen
 * the user must be able to tell which is which without reading a legend, and the cheapest honest
 * signal is that the source's own words are `text-foreground` and come first, while the machine's
 * are `text-muted-foreground` and come second.
 *
 * Whether it renders at all is `whyGoEarnsItsPlace`'s decision, made by the caller.
 */
export function WhyGoLine({ whyGo }: { whyGo: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Kicker muted>In short</Kicker>
      <p dir="auto" className="text-sm leading-relaxed text-muted-foreground">
        {whyGo}
      </p>
    </div>
  );
}
