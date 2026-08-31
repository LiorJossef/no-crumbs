/**
 * **Which view the collections drawer is showing, as a value the URL can hold.**
 *
 * The index and one collection used to be two *route segments* — `/collections` and
 * `/collections/[id]` — and the App Router has exactly one behaviour for a segment change: it
 * unmounts the outgoing subtree and mounts the incoming one. Both of those segments rendered
 * `MapShell`, so tapping a collection destroyed the drawer, the vaul `Drawer.Root` inside it and
 * every piece of state either held, then built a new one and let vaul play its 0.5 s rise from the
 * bottom of the screen. Measured at `c585ce7`, 390×844: the sheet element's identity changes
 * (1 → 2 distinct nodes carrying `data-testid="place-sheet"`) and the new one's top edge travels
 * 844 → 703 → 458 → 248 → 129 → 77 → 25 → 0 px over the next ~400 ms. That is the flicker, and no
 * amount of speed removes it, because the sheet genuinely is a different sheet.
 *
 * The two views are therefore **one segment and one search param**. `/collections` and
 * `/collections?collection=<id>` differ only in `searchParams`, which the router resolves by
 * re-rendering the same page in place: the client tree below it reconciles, `MapShell` is never
 * unmounted, and the drawer does not move.
 *
 * ## Why a search param and not a parallel route or a shared layout
 *
 * A shared layout does keep the drawer mounted across the two, but a layout only receives the
 * params of *its own* segment and above — so a layout over `[id]` cannot know which collection is
 * open, and the pins, the camera and the accessible name all depend on that. Publishing them
 * upward from the page needs an effect, which is a frame of the wrong pins on the map. A parallel
 * route has the same shape with more machinery.
 *
 * ## What `/collections/[id]` is now
 *
 * A redirect, kept forever. That path is in shared links, in the join flow's landing and in
 * anybody's history, and the one thing a URL may not do is stop working.
 *
 * React-free and free of any `server-only` import, so the parsing and the href construction are
 * unit-testable without a DOM — the same reason `sheet-geometry.ts` is shaped that way.
 */

/** The search param that carries the open collection. Spelled out rather than `c`: it appears in
 *  shared links, and a URL a person reads should say what it addresses. */
export const COLLECTION_PARAM = 'collection';

/** What the drawer is showing. Two arms, because there are two, and a third would be a new view
 *  rather than a new flag on this one. */
export type DrawerView =
  | { readonly kind: 'index' }
  | { readonly kind: 'collection'; readonly id: string };

export const INDEX_VIEW: DrawerView = { kind: 'index' };

/**
 * The view a request's `searchParams` asks for.
 *
 * A repeated param (`?collection=a&collection=b`) arrives as an array and is **rejected to the
 * index** rather than resolved to its first entry: it is not a URL this product ever writes, so
 * the only thing that produces one is somebody editing the address bar, and quietly picking one
 * arm of an ambiguous request is how a surface ends up asserting something the URL did not say.
 * An empty string is the same case.
 */
export function viewFromSearchParams(
  params: Readonly<Record<string, string | string[] | undefined>>,
): DrawerView {
  const raw = params[COLLECTION_PARAM];
  if (typeof raw !== 'string') return INDEX_VIEW;
  const id = raw.trim();
  if (id === '') return INDEX_VIEW;
  return { kind: 'collection', id };
}

/**
 * The href for a view — the one place that knows the URL shape.
 *
 * `encodeURIComponent` on the id even though every id this product writes is a UUID: the value
 * reaching here comes from a row, and a function that builds a URL out of data is the wrong place
 * to assume what the data looks like.
 */
export function collectionsHref(view: DrawerView): string {
  return view.kind === 'index'
    ? '/collections'
    : `/collections?${COLLECTION_PARAM}=${encodeURIComponent(view.id)}`;
}

/**
 * What the map canvas says it is showing, inside a collection.
 *
 * The canvas is unreachable to a screen reader, so its accessible name is the whole of what that
 * reader gets from it — and until now this surface passed none, so `MapSurface` left its default
 * and the map on every collection announced itself as the bare word `Map`
 * (`ui-review-2026-08-31.md` §1 finding 3's shape). This is the same sentence `/map` builds in
 * `mapAccessibleName`, with the collection's name where that one has an area: what is on the map,
 * and the promise that the list beside it is complete.
 *
 * The name is **not** isolated here and must not be: `isolate` wraps it in U+2068/U+2069, which is
 * correct for a visual string and is read out by some screen readers as stray characters. The name
 * leads the sentence, so there is no preceding run for a Hebrew name to reorder into.
 */
export function collectionCanvasName(name: string, placeCount: number): string {
  if (placeCount === 0) return `Map of ${name}. It has no places yet.`;
  return `Map of ${name}. The list below names all ${placeCount}.`;
}
