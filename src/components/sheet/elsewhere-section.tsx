'use client';

/**
 * `Elsewhere` — your other areas, grouped by country (`docs/ux-library-at-scale.md` §2.6, and the
 * rulings in `docs/ux-library-audit-2026-08-29.md` §2).
 *
 * ## Why this is the scroll fix, and not a decoration
 *
 * At 25 places in two cities the flat run of area rows this replaces was right. At 100 across many
 * countries it is twenty undifferentiated rows appended to the bottom of a 3 000 px scroll, and the
 * options that shorten that scroll are all worse: virtualisation does not shorten a *distance*,
 * moving the section above the rows is a positional mode with an invisible rule, and a floating
 * "jump to areas" control is new permanent chrome over the map. Grouping is the fix — six countries
 * is six rows where six countries' worth of areas is twenty.
 *
 * ## The two things it fixes about the boundary itself
 *
 * The old section opened with `mt-2` and a hairline in the same token as every row divider above
 * it, under a 12 px muted heading — the same size and colour as the category line inside every
 * place row. The loudest thing at the boundary was quieter than the body text above it, and this is
 * the one place in the scroll where the *kind* of thing changes: above it a tap opens a place,
 * below it a tap changes the list's whole scope and moves the camera.
 *
 * And every row in the scroll container now shares **one text column**. A place row's category
 * glyph, a country group's flag disc and an area row's empty slot are all the same 32 px leading
 * box, so all text starts at the same x. Hierarchy is carried by what is *in* the column rather
 * than by ragged indentation — the old area rows started their text 40 px left of every place row,
 * which read as a layout accident.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';

import { areaRowAccessibleName, areaRowCountText, type AreaRow } from '@/ui/place/active-area';
import {
  countryGroupAccessibleName,
  isCountryExpanded,
  type ElsewhereEntry,
  type ExpansionDefault,
} from '@/ui/place/elsewhere-groups';
import { flagEmoji, normaliseCountryCode } from '@/components/map/country-flag-image';

/** The leading column every row in the list reserves, place rows included. */
const LEADING_SLOT = 'flex size-8 shrink-0 items-center justify-center';

/** The one focus treatment in the list, matching `PlaceRow` and `CollectionsNavRow`. */
const ROW_BASE =
  'flex w-full items-center gap-3 rounded-lg py-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50';

export interface ElsewhereSectionProps {
  readonly entries: readonly ElsewhereEntry[];
  readonly filtering: boolean;
  /** Explicit user toggles only, keyed by country. Defaults live in `isCountryExpanded`. */
  readonly expansion: ReadonlyMap<string, boolean>;
  readonly expansionDefault: ExpansionDefault;
  /** The **resolved** next state, not a flip — the default a group falls back to differs by
   *  surface and rises under any filter, so only the renderer knows what "the other one" is. */
  readonly onToggleCountry: (key: string, expanded: boolean) => void;
  readonly onSelectArea: (areaId: string) => void;
}

export function ElsewhereSection({
  entries,
  filtering,
  expansion,
  expansionDefault,
  onToggleCountry,
  onSelectArea,
}: ElsewhereSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-5 border-t border-border/70 pt-4">
      {/* At the row's own weight and in `text-foreground`, not muted 12 px: this is the only place
          in the scroll where the kind of thing changes, so it is the only place that looks like a
          change. It is a heading, not a control — nothing here is focusable. */}
      <h3 className="px-1 pb-1.5 font-heading text-sm font-extrabold tracking-tight text-foreground">
        Elsewhere
      </h3>
      <ul>
        {entries.map((entry) =>
          entry.kind === 'area' ? (
            <li key={entry.key}>
              <AreaRowButton
                row={entry.row}
                countryCode={entry.countryCode}
                filtering={filtering}
                onSelect={onSelectArea}
              />
            </li>
          ) : (
            <CountryGroup
              key={entry.key}
              entry={entry}
              filtering={filtering}
              expanded={isCountryExpanded(entry, expansion, expansionDefault, filtering)}
              onToggle={onToggleCountry}
              onSelectArea={onSelectArea}
            />
          ),
        )}
      </ul>
    </section>
  );
}

function CountryGroup({
  entry,
  filtering,
  expanded,
  onToggle,
  onSelectArea,
}: {
  entry: Extract<ElsewhereEntry, { kind: 'country' }>;
  filtering: boolean;
  expanded: boolean;
  onToggle: (key: string, expanded: boolean) => void;
  onSelectArea: (areaId: string) => void;
}) {
  const listId = `elsewhere-${entry.key}`;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    // The children live in a `<ul>` inside this same `<li>`, which is what `aria-controls` needs
    // and what keeps DOM order equal to focus order without a single `tabindex`.
    <li>
      <button
        type="button"
        onClick={() => onToggle(entry.key, !expanded)}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={countryGroupAccessibleName(entry, filtering, expanded)}
        data-vaul-no-drag
        className={`${ROW_BASE} min-h-11`}
      >
        <span className={LEADING_SLOT} aria-hidden>
          <CountryFlag countryCode={entry.countryCode} />
        </span>
        <span className="flex-1 font-heading text-sm font-bold text-foreground">
          <bdi>{entry.label}</bdi>
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {areaRowCountText(entry.count, filtering)}
        </span>
        <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {/* **Collapsed is `inert`, not unrendered**, and that is a departure from the audit's ruling
          taken on purpose. Its reason for "do not render" was that there is then nothing to remove
          from the tab order and nothing to get wrong — a simplicity argument, and a fair one. But
          unrendered children cannot animate: the wrapper would mount already at `1fr`, so no
          transition would ever run in either direction, and §7's one piece of motion here ("this
          came from the row you pressed") would silently not exist.

          `inert` is the standards mechanism for exactly this state. It takes the subtree out of the
          tab order *and* out of the accessibility tree, which is the whole of what "not rendered"
          was buying, and it leaves the nodes in the box so `grid-template-rows: 0fr → 1fr` has
          something to animate — one property, no measurement pass, no `ResizeObserver`.

          `ease-in-out` is the `spatial` character of `ux-architecture.md` §10 written out; there is
          no easing token to reference yet and inventing one here would be a design-system decision
          taken inside a list component. `motion-reduce` drops the transition entirely rather than to
          a faster version of itself (§7).

          Expanding does not move focus (§6). The first revealed child becomes the next tab stop,
          which is the right affordance, and `aria-expanded` has already announced the change. */}
      <div
        inert={!expanded}
        className={`grid transition-[grid-template-rows] duration-[180ms] ease-in-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <ul id={listId} className="overflow-hidden">
          {entry.areas.map((row) => (
            <li key={row.id}>
              <AreaRowButton
                row={row}
                countryCode={null}
                filtering={filtering}
                onSelect={onSelectArea}
              />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/**
 * One area you can go to.
 *
 * `countryCode` fills the leading slot with a flag when this row *is* its country (§2.6 rule 1 —
 * a country with one area is one row, named for the area and flagged for the country). Inside a
 * group the slot is left empty: the flag is already on the group heading above, and repeating it on
 * every child would say the same thing three times.
 */
function AreaRowButton({
  row,
  countryCode,
  filtering,
  onSelect,
}: {
  row: AreaRow;
  countryCode: string | null;
  filtering: boolean;
  onSelect: (areaId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      aria-label={areaRowAccessibleName(row, filtering)}
      data-vaul-no-drag
      className={`${ROW_BASE} min-h-11`}
    >
      <span className={LEADING_SLOT} aria-hidden>
        {countryCode !== null && <CountryFlag countryCode={countryCode} />}
      </span>
      <span className="flex-1 font-heading text-sm font-bold text-foreground">
        <bdi>{row.label}</bdi>
      </span>
      <span className="text-sm font-medium text-muted-foreground">
        {areaRowCountText(row.count, filtering)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * The flag, as text.
 *
 * On the **map** a flag has to be a canvas-drawn image: MapLibre's glyph atlas is single-channel
 * alpha, so colour is impossible, and a regional-indicator pair needs a ligature per-codepoint
 * shaping cannot form (`country-flag-image.ts`). In the DOM none of that applies — the browser
 * shapes the pair and paints it in colour — so the list uses the emoji directly rather than
 * rasterising a second copy of something HTML already renders.
 *
 * The fallback differs from the map's for the same reason and it is deliberate: a platform with no
 * flag glyphs draws nothing here, because the row's own text already carries the country's full
 * name beside it. The map's disc has no such text, which is why it falls back to the two-letter
 * code and this does not.
 */
function CountryFlag({ countryCode }: { countryCode: string }) {
  const code = normaliseCountryCode(countryCode);
  if (code === null) return null;
  return <span className="text-lg leading-none">{flagEmoji(code)}</span>;
}
