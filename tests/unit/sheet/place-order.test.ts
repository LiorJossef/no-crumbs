/**
 * **The sort control's rules** — `W5-2`.
 *
 * The reason it exists is `growth-plan.md` §3: *"the list does not arrive as a trickle, it arrives
 * in bursts."* Seven rows written in one transaction share a `created_at` to the millisecond, so
 * `created_at desc` puts one post's worth of places at the top in an order Postgres never promised.
 * **Date ordering does not survive batch writes**, and the default order is the one that had to be
 * fixed before any alternative was worth offering.
 *
 * `place-order.ts` is a module of its own precisely so these are assertions about behaviour rather
 * than about source text: `place-sheet.tsx` cannot be imported from a unit test at all.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  availableOrders,
  DEFAULT_PLACE_ORDER,
  effectiveOrder,
  getServerOrder,
  isPlaceOrder,
  sortPlaces,
  type PlaceOrder,
} from '@/components/sheet/place-order';
import type { MapPlace } from '@/components/map/types';

function place(name: string, savedAt: string | null = null): MapPlace {
  return {
    id: name,
    name,
    lat: 32,
    lng: 34,
    category: 'cafe',
    visited: false,
    ...(savedAt === null ? {} : { detail: { savedAt } }),
  } as unknown as MapPlace;
}

const names = (places: readonly MapPlace[]) => places.map((p) => p.name);

describe('which orders exist', () => {
  /**
   * **`Nearest` is absent without a fix — not disabled, not greyed.** The same rule `near-me.ts`
   * follows when it hides a distance it cannot stand behind, and the same one
   * `import-error-copy.ts` states as *"a recovery only ever points somewhere that works"*. A greyed
   * `Nearest` invites the question the screen has no answer to: nearest to what?
   */
  it('offers nearest only while a fix is held', () => {
    expect(availableOrders(true)).toEqual(['recent', 'nearest', 'alpha']);
    expect(availableOrders(false)).toEqual(['recent', 'alpha']);
  });

  /** So the exit criterion reads: **two orders always work, three work when located.** A verifier
   *  finding two options with location off has found correct behaviour. */
  it('always leaves at least two, so the control is always a choice', () => {
    expect(availableOrders(false).length).toBeGreaterThanOrEqual(2);
  });

  it('recognises a stored value and rejects anything else', () => {
    for (const order of ['recent', 'nearest', 'alpha']) expect(isPlaceOrder(order)).toBe(true);
    for (const junk of ['', 'newest', null, undefined, 3, {}]) expect(isPlaceOrder(junk)).toBe(false);
  });
});

describe('which order is in force', () => {
  /**
   * **With no choice and a fix held, the answer is `nearest` — which is exactly what ships today.**
   * `/map` has sorted nearest-first whenever a fix was held since `L1-F11-T2`, silently and with no
   * way back. The control does not introduce an order; it makes that one visible and changeable,
   * and a user who never opens it sees no change at all.
   */
  it('keeps the behaviour the product already had', () => {
    expect(effectiveOrder(null, true)).toBe('nearest');
    expect(effectiveOrder(null, false)).toBe(DEFAULT_PLACE_ORDER);
    expect(DEFAULT_PLACE_ORDER).toBe('recent');
  });

  it('respects an explicit choice over the default', () => {
    expect(effectiveOrder('alpha', true)).toBe('alpha');
    expect(effectiveOrder('recent', true)).toBe('recent');
  });

  /** A chosen `nearest` that outlives the fix falls back rather than sticking: the order cannot be
   *  computed without an origin, and keeping the old positions would be a list claiming a distance
   *  ranking it can no longer justify. */
  it('falls back when a chosen nearest loses its fix', () => {
    expect(effectiveOrder('nearest', false)).toBe(DEFAULT_PLACE_ORDER);
  });
});

describe('the orders themselves', () => {
  /**
   * **The defect the package exists for.** Seven places written in one import share a timestamp;
   * without an explicit tie-break their order is whatever the planner returned and can differ
   * between two reads of the same table.
   */
  it('orders a batch deterministically, where the query cannot', () => {
    const burst = [place('Zaatar', '2026-08-30T10:00:00Z'), place('Aleph', '2026-08-30T10:00:00Z'), place('Mim', '2026-08-30T10:00:00Z')];
    const once = names(sortPlaces(burst, 'recent', () => null));
    const twice = names(sortPlaces([...burst].reverse(), 'recent', () => null));
    expect(once).toEqual(twice);
    expect(once).toEqual(['Aleph', 'Mim', 'Zaatar']);
  });

  it('still puts the most recent burst above an older one', () => {
    const mixed = [place('old', '2026-08-01T10:00:00Z'), place('new', '2026-08-30T10:00:00Z')];
    expect(names(sortPlaces(mixed, 'recent', () => null))).toEqual(['new', 'old']);
  });

  /** A place with no `savedAt` is a collection's shared row — it carries the place's facts and none
   *  of this viewer's, so there is no date to rank it by. Last, then by name. */
  it('puts a place with no saved date last rather than first', () => {
    const mixed = [place('shared'), place('mine', '2026-08-01T10:00:00Z')];
    expect(names(sortPlaces(mixed, 'recent', () => null))).toEqual(['mine', 'shared']);
  });

  /**
   * **`A–Z` has to mean A–Z for this library, which holds Hebrew and English side by side.** A
   * code-point sort puts every Hebrew name after every English one — an alphabetical order that
   * silently means "English first, then the rest".
   */
  it('sorts by name the way a reader reads, not by code point', () => {
    const mixed = [place('Zaatar'), place('אבו חסן'), place('Aleph')];
    const sorted = names(sortPlaces(mixed, 'alpha', () => null));
    expect(sorted.indexOf('Aleph')).toBeLessThan(sorted.indexOf('Zaatar'));
    // The Hebrew name is ordered rather than swept to one end by byte value.
    expect(sorted).toHaveLength(3);
    expect(new Set(sorted).size).toBe(3);
  });

  /** `No. 2` before `No. 10` — the one place these names carry a number that means an amount. */
  it('reads a number in a name as a number', () => {
    const numbered = [place('Cafe No. 10'), place('Cafe No. 2')];
    expect(names(sortPlaces(numbered, 'alpha', () => null))).toEqual(['Cafe No. 2', 'Cafe No. 10']);
  });

  /**
   * A place with no distance sorts **last**. It is not near and it is not far — it is unknown, and
   * the honest position for unknown in a ranking by that fact is after everything the fact is known
   * for. Stable among themselves by name, so the tail is not itself arbitrary.
   */
  it('ranks by distance and puts the unmeasured at the end', () => {
    const far = place('far');
    const near = place('near');
    const unknown = place('unknown');
    const km = new Map([[far.id, 9], [near.id, 1]]);
    const sorted = sortPlaces([unknown, far, near], 'nearest', (p) => km.get(p.id) ?? null);
    expect(names(sorted)).toEqual(['near', 'far', 'unknown']);
  });

  /** Never mutates: the input is a memoised value shared with the map, and a sort in place would
   *  reorder the pins' own source as a side effect. */
  it('returns a new array and leaves the input alone', () => {
    const input = [place('b'), place('a')];
    const copy = [...input];
    const sorted = sortPlaces(input, 'alpha', () => null);
    expect(input).toEqual(copy);
    expect(sorted).not.toBe(input);
  });

  it('handles an empty library and a library of one', () => {
    for (const order of ['recent', 'nearest', 'alpha'] as PlaceOrder[]) {
      expect(sortPlaces([], order, () => null)).toEqual([]);
      expect(names(sortPlaces([place('only')], order, () => null))).toEqual(['only']);
    }
  });
});

describe('the choice survives a reload', () => {
  /**
   * **The server must not guess.** The list's DOM order is markup, so a server render that guessed
   * the stored choice and got it wrong is a hydration mismatch — not a wrong colour, a wrong tree.
   * `useSyncExternalStore` renders the server snapshot during hydration and re-renders with the
   * client value afterwards, which is why the page reads it that way and not from an effect.
   */
  it('renders no stored choice on the server', () => {
    expect(getServerOrder()).toBeNull();
  });

  it('is read through useSyncExternalStore, not seeded in an effect', () => {
    const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
    expect(PAGE).toContain(
      'useSyncExternalStore(subscribeStoredOrder, getStoredOrder, getServerOrder)',
    );
  });

  /** Every string is the copy deck's. `A–Z` takes an **en dash** and must not be normalised to a
   *  hyphen — `overnight-copy-deck.md` §4.2 calls that out by name. */
  it('uses the copy deck strings, en dash included', () => {
    const SHEET = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
    // Quote-agnostic on purpose. Every one of these read a single-quoted literal against a
    // double-quoted file, so the guard matched nothing and was dead for as long as it existed
    // (found 2026-09-03). The claim is unchanged: these exact strings, from these exact names.
    const q = (literal: string) => `["']${literal}["']`;
    expect(SHEET).toMatch(new RegExp(`export const SORT_LABEL = ${q('Sort')};`));
    expect(SHEET).toMatch(new RegExp(`export const SORT_BY_LABEL = ${q('Sort by')};`));
    expect(SHEET).toMatch(new RegExp(`recent: ${q('Recently saved')},`));
    expect(SHEET).toMatch(new RegExp(`nearest: ${q('Nearest')},`));
    // The en dash, still as the escape and still not a hyphen — `\\u2013` is one backslash in the
    // source being matched, so it needs escaping twice over: once for the string, once for the regex.
    expect(SHEET).toMatch(new RegExp(`alpha: ${q('A\\\\u2013Z')},`));
  });
});

/**
 * **The control says what it is, and it does not look like a filter** — owner feedback of
 * 2026-09-02: *"the look of sorting doesnt look good, it doesnt even tells you its a sort by"*,
 * and `ux-overwhelm-audit-2026-09-02.md` §6.
 *
 * Two defects in one control. It was two `CHIP_PRESSABLE` chips at `min-h-11`, byte-identical to
 * the category chips beside them, **one of which is always pressed** — because a sort always has a
 * current value. So the header showed two filled pills meaning two unrelated things, while a
 * pressed chip in this product means *this is narrowing your library*. And nothing on screen said
 * the word "sort" at all: the axis lived only in an `aria-label`.
 *
 * Asserted as source text because `place-sheet.tsx` cannot be imported from a unit test at all —
 * it throws *"This module cannot be imported from a Client Component module"* — which is the same
 * reason `place-order.ts` exists as a separate file.
 */
describe('the sort control is not a filter chip', () => {
  const SHEET = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
  const CONTROL = SHEET.slice(
    SHEET.indexOf('export function SortControl('),
    SHEET.indexOf('export const SORT_MIN_PLACES'),
  );

  it('prints the axis word on screen, before the current value', () => {
    // `Sort: Recently saved`. The word lived only in an `aria-label` until 2026-09-02, so on
    // screen the control was two unexplained values — and `A–Z` reads as a filter for names
    // beginning with A as easily as it reads as an ordering.
    expect(CONTROL).toContain('axis={SORT_LABEL}');
    const BAR = readFileSync('src/components/sheet/library-filter-bar.tsx', 'utf8');
    expect(BAR).toContain('{axis}:');
  });

  it('is named `Sort by` for a screen reader, which contains the visible word', () => {
    expect(CONTROL).toContain('accessibleAxis={SORT_BY_LABEL}');
  });

  it('is the same component as the filter triggers, told apart by label and fill', () => {
    // Consistency of mechanism, difference of label: one trigger family, so the sort control
    // cannot drift away from the 32-in-44 target, the pill radius or the surface hover. `tone`
    // is the only difference, and it swaps a bordered pill for a ghost.
    //
    // **The name changed and the assertion followed it.** This read `<Dropdown` when it was
    // written; the component is `MenuAxis` and always was — `place-sheet.tsx` carried a comment
    // naming a `Dropdown` that never existed, which `ux-menus-and-dropdowns.md` §14 item 9 rules
    // on ("pick `MenuAxis`; a comment naming a component that does not exist is how the next
    // agent loses an hour"). Same assertion, real name.
    expect(CONTROL).toContain('<MenuAxis');
    expect(CONTROL).toContain('tone="sort"');
  });

  it('is not a native <select>, and this is the defect that made it look broken', () => {
    // `appearance-none` does not stop a native select taking the platform's own focus chrome, and
    // on macOS and iOS it opens the *operating system's* menu rather than the app's — so it could
    // never match the control 8 px to its left, however it was restyled.
    expect(CONTROL).not.toContain('<select');
    expect(CONTROL).not.toContain('appearance-none');
  });

  it('borrows none of the chip vocabulary', () => {
    expect(CONTROL).not.toContain('CHIP_PRESSABLE');
    expect(CONTROL).not.toContain('aria-pressed');
  });

  it('hovers on a surface, never on the text colour', () => {
    // `hover:text-brand` is a *link* hover on something that is not a link: the label flicked to
    // mint and nothing else moved, which is why it read as broken rather than as pressable.
    //
    // **The class is `bg-primary/15`, not `bg-muted`,** and that is a correction to this assertion
    // rather than a weakening of it. `--muted` is `#FAF9F6` in light — the sheet's own ground — so
    // a `bg-muted` hover is a zero-contrast change on exactly the surface this control sits on,
    // which is the defect `ux-menus-and-dropdowns.md` §5.2 measures for the menu rows. The ghost
    // has only a ground to spend, so it washes at 15 % where the bordered pill washes at 5 % and
    // spends the rest of its signal on the border.
    const BAR = readFileSync('src/components/sheet/library-filter-bar.tsx', 'utf8');
    expect(BAR).toContain('group-hover/trigger:bg-primary/15');
    expect(SHEET).not.toContain('hover:text-brand');
  });

  it('keeps the 32-in-44 target, which it lost as a select and must not lose again', () => {
    // The regression: `h-8` on the select itself made it 32 px flat — the smallest touch target in
    // the product — while every control beside it painted 32 inside a 44 px band. Measured with
    // `elementFromPoint` at the top edge, the middle and the bottom edge of all four triggers.
    const BAR = readFileSync('src/components/sheet/library-filter-bar.tsx', 'utf8');
    expect(BAR).toContain('min-h-11');
    expect(BAR).toContain('py-1.5');
    expect(BAR).toMatch(/SORT_PAINT[\s\S]{0,200}h-8/);
    expect(BAR).toMatch(/SORT_PAINT[\s\S]{0,200}rounded-full/);
  });

  it('offers its orders as menu rows rather than a second set of buttons', () => {
    // Owner, 2026-09-02: "I don't like the interaction pattern of opening a dropdown and then
    // showing another group of large buttons inside it."
    expect(CONTROL).toContain('<SortOptions');
    // **`type="radio"` is not what this asserts any more.** It was written expecting native radio
    // inputs in this file; the rows come from `AxisRows`, the one row component the three filter
    // axes also use, which is a stronger version of the same claim — the sort *cannot* be a second
    // set of buttons, because it is not drawing its own rows at all. (Base UI's radio group does
    // render a real `<input type="radio">`, in the library, not here.)
    expect(CONTROL).toContain('<AxisRows');
    expect(CONTROL).not.toContain('<button');
    expect(CONTROL).not.toContain('<Button');
  });

  it('is absent from a list short enough to read at a glance', () => {
    expect(SHEET).toContain('if (listLength < SORT_MIN_PLACES) return null;');
    expect(SHEET).toContain('export const SORT_MIN_PLACES = 8;');
  });
});
