/**
 * **What order the list is in** — `W5-2`, the sort control.
 *
 * ## Why the default order needed a control at all
 *
 * `growth-plan.md` §3: *"the list does not arrive as a trickle, it arrives in bursts."* Seven rows
 * written in one transaction share a `created_at` to the millisecond, so `created_at desc` puts one
 * post's worth of places at the top in an order Postgres never promised — and which can differ
 * between two reads of the same table. **Date ordering does not survive batch writes**, which is
 * why `sortPlaces` breaks that tie explicitly rather than leaving it to the query.
 *
 * ## What was already happening, invisibly
 *
 * `/map` has sorted the list nearest-first whenever a location fix was held, since `L1-F11-T2`. It
 * was correct and it was unexplained: pressing the locate control silently reordered the library and
 * nothing on screen said so or offered a way back. So the control does not *introduce* an order —
 * it makes the one the product already chose visible and changeable. `effectiveOrder` is where that
 * is written down: with no explicit choice, a held fix still means `nearest`, exactly as today.
 *
 * ## Pure, and in its own file
 *
 * No React, no DOM, no `server-only`. `place-sheet.tsx` cannot be imported from a unit test at all
 * (measured: it throws *"This module cannot be imported from a Client Component module"*), so a
 * rule that lives inside it can only ever be asserted as source text. `components/shell/
 * sheet-geometry.ts` exists for exactly this reason and this follows it.
 */

import type { MapPlace } from '@/components/map/types';

/** The three orders. `nearest` is only ever *offered* when a fix is held — see `availableOrders`. */
export type PlaceOrder = 'recent' | 'nearest' | 'alpha';

/**
 * The order with nothing chosen and no fix held: what the library has always arrived in.
 * `getSpots` returns `created_at desc`, so this is a re-statement of the query rather than a
 * re-sort of it — plus the tie-break the query cannot give (see `sortPlaces`).
 */
export const DEFAULT_PLACE_ORDER: PlaceOrder = 'recent';

/** Where an explicit choice is remembered. Namespaced, because `localStorage` is one flat map
 *  shared with everything else this origin ever stores. */
export const PLACE_ORDER_STORAGE_KEY = 'no-crumbs.place-order';

const ORDERS: readonly PlaceOrder[] = ['recent', 'nearest', 'alpha'];

/** Whether a value off the wire — `localStorage`, a future URL param — is one of the three. */
export function isPlaceOrder(value: unknown): value is PlaceOrder {
  return typeof value === 'string' && (ORDERS as readonly string[]).includes(value);
}

/**
 * **Which orders the control may offer.**
 *
 * `Nearest` is **absent** without a usable fix — not disabled, not greyed out, absent. It is the
 * same rule `near-me.ts` already follows when it hides distances rather than showing one measured
 * from a rough fix, and the same rule `import-error-copy.ts` states as *"a recovery only ever points
 * somewhere that works"*. A greyed-out `Nearest` is a promise the screen cannot keep, and it invites
 * exactly the question the product has no answer to: nearest to what?
 *
 * The consequence for anyone verifying this: **two orders always work, three work when located.**
 * Finding two options with location off is correct behaviour, not a missing feature.
 */
export function availableOrders(hasFix: boolean): readonly PlaceOrder[] {
  return hasFix ? ORDERS : ORDERS.filter((order) => order !== 'nearest');
}

/**
 * The order actually in force: the user's explicit choice, else the product's own default.
 *
 * `null` means *nobody has chosen*, and it is a third state rather than a missing value. With no
 * choice and a fix held the answer is `nearest`, which is precisely what `/map` does today — so
 * turning the behaviour into a control changes nothing for a user who never opens it.
 *
 * An explicit choice of `nearest` that outlives the fix falls back rather than sticking: the order
 * cannot be computed without an origin, and silently keeping the old positions would be a list
 * claiming a distance ranking it can no longer justify.
 */
export function effectiveOrder(chosen: PlaceOrder | null, hasFix: boolean): PlaceOrder {
  if (chosen === 'nearest' && !hasFix) return DEFAULT_PLACE_ORDER;
  if (chosen !== null) return chosen;
  return hasFix ? 'nearest' : DEFAULT_PLACE_ORDER;
}

/**
 * Compare two names the way a reader would, not the way a byte comparison would.
 *
 * `localeCompare` with no locale argument uses the runtime's, which is what a person reading this
 * list has. It matters here rather than being pedantry: this library holds Hebrew and English names
 * side by side, and a code-point sort puts every Hebrew name after every English one — an `A–Z`
 * that silently means "English first, then the rest". `numeric` so `No. 2` sorts before `No. 10`,
 * which is the one place these names carry a number that means an amount.
 */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * **The list, in the order asked for.** Returns a new array; never mutates the input, which is a
 * memoised value shared with the map.
 *
 * `distanceKm` returns `null` for a place there is no measurement for, and those places sort
 * **last** rather than first or in place. A place with no distance is not near, and it is not far
 * either — it is unknown, and the honest position for unknown in a ranking by that fact is after
 * everything the fact is known for. They keep a stable order among themselves by name, so the tail
 * of the list is not itself arbitrary.
 */
export function sortPlaces(
  places: readonly MapPlace[],
  order: PlaceOrder,
  distanceKm: (place: MapPlace) => number | null,
): readonly MapPlace[] {
  const sorted = [...places];
  switch (order) {
    case 'alpha':
      sorted.sort((a, b) => byName.compare(a.name, b.name));
      return sorted;
    case 'nearest':
      sorted.sort((a, b) => {
        const da = distanceKm(a);
        const db = distanceKm(b);
        if (da === null && db === null) return byName.compare(a.name, b.name);
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db || byName.compare(a.name, b.name);
      });
      return sorted;
    case 'recent':
      // **The tie-break is the whole point of sorting here at all.** The rows arrive
      // `created_at desc` already, so on its own this would be a no-op — but a batch import writes
      // seven rows with the same timestamp, and their relative order is then whatever the planner
      // returned. Breaking by name makes one post's worth of places land in an order that is the
      // same on every read, which is what "recently saved" has to mean before it means anything.
      sorted.sort((a, b) => {
        const ta = a.detail?.savedAt ?? null;
        const tb = b.detail?.savedAt ?? null;
        if (ta !== null && tb !== null && ta !== tb) return ta < tb ? 1 : -1;
        // A place with no `savedAt` is a collection's shared row: it carries the place's facts and
        // none of this viewer's, so there is no date to rank it by. Last, then by name — the same
        // rule the unknown distance follows above.
        if (ta === null && tb !== null) return 1;
        if (tb === null && ta !== null) return -1;
        return byName.compare(a.name, b.name);
      });
      return sorted;
  }
}

/* ---------------------------------------------------------------------------
 * Remembering the choice.
 *
 * A three-function store rather than a `useState` seeded in an effect, and that is not a style
 * preference: setting state synchronously inside an effect triggers a cascading render and the
 * lint rule that forbids it is correct. `useSyncExternalStore` is React's own answer to *"read a
 * value the server cannot know"* — it renders `getServerSnapshot` on the server and during
 * hydration, then re-renders with the client value, which is exactly the sequence this needs.
 *
 * The list's DOM order is markup, so a server render that **guessed** the stored choice and got it
 * wrong would be a hydration mismatch. The honest cost is that a user who chose `A–Z` sees the
 * default order for one frame. A cookie would remove even that, and it needs the server component.
 * ------------------------------------------------------------------------ */

let cached: PlaceOrder | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): PlaceOrder | null {
  if (loaded) return cached;
  loaded = true;
  try {
    const stored = globalThis.localStorage?.getItem(PLACE_ORDER_STORAGE_KEY);
    cached = isPlaceOrder(stored) ? stored : null;
  } catch {
    // Private mode, a full quota, storage disabled by policy. The default order is a complete
    // answer, so there is nothing to recover from and nothing to tell the user about.
    cached = null;
  }
  return cached;
}

/** `useSyncExternalStore`'s subscribe. Only this app writes the value, so there is no `storage`
 *  event to listen for — a second tab changing its own sort is not news this one has to act on. */
export function subscribeStoredOrder(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cached, because `getSnapshot` is called on every render and must return a stable value — an
 *  uncached `localStorage.getItem` would be a synchronous disk read per render. */
export function getStoredOrder(): PlaceOrder | null {
  return read();
}

/** The server cannot know a browser's storage, and must not guess: see the note above on why a
 *  wrong guess is a hydration mismatch rather than a wrong colour. */
export function getServerOrder(): PlaceOrder | null {
  return null;
}

/** Write it, and tell every reader. Storage failing does not fail the choice — it applies for this
 *  session and only its memory is lost, which is the right degradation for a preference. */
export function setStoredOrder(order: PlaceOrder): void {
  cached = order;
  loaded = true;
  try {
    globalThis.localStorage?.setItem(PLACE_ORDER_STORAGE_KEY, order);
  } catch {
    // Applied for this session; not remembered for the next one.
  }
  for (const listener of listeners) listener();
}
