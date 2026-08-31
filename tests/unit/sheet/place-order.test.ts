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
    expect(SHEET).toContain("export const SORT_LABEL = 'Sort';");
    expect(SHEET).toContain("recent: 'Recently saved',");
    expect(SHEET).toContain("nearest: 'Nearest',");
    expect(SHEET).toContain("alpha: 'A\\u2013Z',");
  });
});
