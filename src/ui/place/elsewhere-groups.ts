/**
 * The `Elsewhere` section, grouped by country (`docs/ux-library-at-scale.md` §2.6).
 *
 * This replaces the flat run of area rows that shipped with `ux-stable-area-list.md`. At 25 places
 * in two cities a flat list is right; at 100 across many countries it is twenty undifferentiated
 * rows appended to the bottom of a scroll, and the country level is what makes it navigable
 * without making it deeper than it has to be.
 *
 * It is also the accessible half of the country band. The map's country and area markers are
 * painted into a canvas and are unreachable by a screen reader, so §6 makes it a hard requirement
 * that **every country and every area in the library is reachable from here without touching the
 * map** — which is why nothing below ever drops an area for being hard to render.
 *
 * ## Two rulings this file makes, because §2.6 states rules 1 and 3 without reconciling them
 *
 * **The active area is excluded before grouping, not after.** `Elsewhere` means elsewhere: a
 * country total that included the twelve rows already on screen above it would be a count of
 * something other than what the section offers. So the active area leaves first, and rules 1–7
 * then apply to what is left.
 *
 * That makes rule 3 — the active area's own country is expanded by default — bite exactly when it
 * should. In London with only Bristol besides, the UK has one remaining area and rule 1 turns it
 * into a single `Bristol` row, because making someone open a group to reach one thing is the cost
 * rule 1 exists to refuse. In London with Bristol *and* Manchester, the UK is a group and it opens
 * already expanded, which is the case rule 3 was written for.
 *
 * **The countryless bucket is never a group.** Rule 6 asks for its areas as top-level rows, plural,
 * and that is right for a reason the other rules do not need: a group heading has to be named, and
 * the only honest name for this one is an admission. Its areas are the things we *can* name, so
 * they stand on their own, unflagged, sorted last however many there are.
 */

import { UNNAMED_OTHER_AREA_LABEL, type Area, type AreaRow } from './active-area';
import { countryKey, type CountrySummary } from './library-summary';

/**
 * One top-level thing in `Elsewhere`: either an area you tap to go there, or a country you open to
 * see its areas.
 *
 * A discriminated union rather than a country row with an optional single child, because the two
 * are different controls — one moves the camera and the list, the other expands in place and moves
 * nothing — and a renderer that had to infer which from `areas.length === 1` is a renderer that
 * will eventually infer it wrong.
 */
export type ElsewhereEntry =
  | {
      readonly kind: 'area';
      readonly key: string;
      /** For the flag on the row. `null` renders unflagged — see the header's second ruling. */
      readonly countryCode: string | null;
      readonly row: AreaRow;
    }
  | {
      readonly kind: 'country';
      readonly key: string;
      readonly countryCode: string;
      readonly label: string;
      /** Matches across the country's areas, excluding the active one. */
      readonly count: number;
      readonly areas: readonly AreaRow[];
      /** Rule 3. Open on arrival when this is the country you are already in. */
      readonly expandedByDefault: boolean;
    };

/**
 * Build the section.
 *
 * `matchIds` is the library after the search box and the chips, so every count below is a **match**
 * count under a filter and a place count otherwise — and anything a filter has emptied is dropped
 * outright rather than shown as `0`, groups included (rule 5). A row that leads to an empty list is
 * a broken promise with a tap target on it, and that rule is the one thing `elsewhereRows` and this
 * function must never disagree about.
 *
 * Sorted by count descending, then label, then key — deterministic, so nothing reorders between two
 * renders of the same library (rule 4). Countryless areas sort after everything else whatever their
 * count (rule 6), the same way `bucketAreasByCountry` sorts their bucket last.
 */
export function elsewhereGroups<T>(
  countries: readonly CountrySummary<T>[],
  activeAreaId: string | null,
  matchIds: ReadonlySet<string>,
): readonly ElsewhereEntry[] {
  const activeCountryKey = countryKeyOfActiveArea(countries, activeAreaId);
  const entries: ElsewhereEntry[] = [];

  for (const country of countries) {
    const rows = country.areas
      .filter((area) => area.id !== activeAreaId)
      .map((area) => toRow(area, matchIds))
      .filter((row): row is AreaRow => row !== null)
      .sort(compareRows);

    if (rows.length === 0) continue;

    // Rule 6: no country, no group. Each area stands as its own top-level row.
    if (country.countryCode === null) {
      for (const row of rows) {
        entries.push({ kind: 'area', key: `area:${row.id}`, countryCode: null, row });
      }
      continue;
    }

    // Rule 1: one area is one row, named for the *area* and flagged for the country. The country's
    // name is not shown at all here — it is the flag's job, and the area is the destination.
    const only = rows[0];
    if (rows.length === 1 && only !== undefined) {
      entries.push({
        kind: 'area',
        key: `area:${only.id}`,
        countryCode: country.countryCode,
        row: only,
      });
      continue;
    }

    entries.push({
      kind: 'country',
      key: country.key,
      countryCode: country.countryCode,
      label: country.label,
      count: rows.reduce((total, row) => total + row.count, 0),
      areas: rows,
      expandedByDefault: country.key === activeCountryKey,
    });
  }

  return entries.sort(compareEntries);
}

/** The area's row, or `null` when the filters left nothing in it (rule 5). */
function toRow<T>(area: Area<T>, matchIds: ReadonlySet<string>): AreaRow | null {
  let count = 0;
  for (const id of area.memberIds) if (matchIds.has(id)) count += 1;
  if (count === 0) return null;
  return { id: area.id, label: area.label ?? UNNAMED_OTHER_AREA_LABEL, count };
}

/** Which country the user is currently standing in, for rule 3. `null` when the active area is
 *  countryless, or when there is no active area at all — neither can match a real country's key. */
function countryKeyOfActiveArea<T>(
  countries: readonly CountrySummary<T>[],
  activeAreaId: string | null,
): string | null {
  if (activeAreaId === null) return null;
  for (const country of countries) {
    if (country.countryCode === null) continue;
    if (country.areas.some((area) => area.id === activeAreaId)) return countryKey(country.countryCode);
  }
  return null;
}

function compareRows(a: AreaRow, b: AreaRow): number {
  return b.count - a.count || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

function compareEntries(a: ElsewhereEntry, b: ElsewhereEntry): number {
  const aLast = a.countryCode === null;
  const bLast = b.countryCode === null;
  if (aLast !== bLast) return aLast ? 1 : -1;
  return entryCount(b) - entryCount(a) || entryLabel(a).localeCompare(entryLabel(b)) ||
    a.key.localeCompare(b.key);
}

function entryCount(entry: ElsewhereEntry): number {
  return entry.kind === 'area' ? entry.row.count : entry.count;
}

function entryLabel(entry: ElsewhereEntry): string {
  return entry.kind === 'area' ? entry.row.label : entry.label;
}

/** What a screen reader hears on a country group (§2.7). The state verb is last, so the name and
 *  the number are heard before the control's affordance — the same order the area row uses. */
export function countryGroupAccessibleName(
  entry: Extract<ElsewhereEntry, { kind: 'country' }>,
  filtering: boolean,
  expanded: boolean,
): string {
  const noun = filtering
    ? entry.count === 1
      ? 'match'
      : 'matches'
    : entry.count === 1
      ? 'place'
      : 'places';
  const areas = entry.areas.length === 1 ? '1 area' : `${entry.areas.length} areas`;
  return `${entry.label}, ${entry.count} ${noun} in ${areas}, ${expanded ? 'collapse' : 'expand'}`;
}
