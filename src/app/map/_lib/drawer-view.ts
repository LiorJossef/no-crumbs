/**
 * **Which of the drawer's three views is on screen, as a value the URL can hold.**
 *
 * Places, the collections index, and one collection. They were **three route segments** — `/map`,
 * `/collections`, `/collections/[id]` — and the App Router has exactly one behaviour for a segment
 * change: it unmounts the outgoing subtree and mounts the incoming one. All three rendered
 * `MapShell`, so every switch between them destroyed the drawer, the vaul `Drawer.Root` inside it
 * and every piece of state either held, then built a new one and let vaul play its 0.5 s rise from
 * the bottom of the screen.
 *
 * Measured at `c585ce7`, 390×844: the element carrying `data-testid="place-sheet"` changes identity
 * (1 → 2 distinct nodes) and the new one's top edge travels 844 → 703 → 458 → 248 → 129 → 77 → 25 →
 * 0 px over the next ~400 ms. That is the flicker, and no amount of speed removes it, because the
 * sheet genuinely is a different sheet.
 *
 * ## One segment, and it is `/map`
 *
 * The three views are `/map`, `/map?view=collections` and
 * `/map?view=collections&collection=<id>`. Same segment, so the router re-renders the page in
 * place: the client tree below it reconciles, `MapShell` is never unmounted, and the drawer does
 * not move. **Search params are not part of the segment cache key; a dynamic segment's value is** —
 * `LayoutRouter` keys on it — which is why `/collections/[id]` remounted and this does not.
 *
 * `/map` is the segment rather than `/collections` because the map is the shell
 * (`ux-architecture.md` §1.1) and `/map` is where post-login lands, where the create menu reveals a
 * saved place, and what `MAP_ROUTES` already names.
 *
 * **The cost is the URL, and it is stated rather than hidden:** a collection is addressed as
 * `/map?view=collections&collection=<id>` and no longer as `/collections/<id>`.
 * `collections/page.tsx` and `collections/[id]/page.tsx` are redirects, kept forever, so every
 * shared link, the join flow's landing, browser history and anybody's bookmarks still resolve. The
 * one thing a URL may not do is stop working.
 *
 * ## Why not the alternatives
 *
 * **A shared layout** keeps the drawer mounted across two child segments, but a layout only
 * receives the params of *its own* segment and above — so a layout over `[id]` cannot know which
 * collection is open, and the pins, the camera and the accessible name all depend on that.
 * Publishing them upward from the page needs an effect, which is a frame of the wrong pins on the
 * map. It also could not span `/map` without a route group that moves the whole `/map` tree.
 *
 * **Cross-route `window.history.pushState`** — the shallow-routing surface Next 16 documents —
 * keeps the URL and the mounted tree in *disagreement*. `collection-content.tsx` calls
 * `router.refresh()` in four places and `router.push('/collections')` in two; those would act on
 * the router's tree, which is not the one the URL names. That is a corruption rather than a rough
 * edge, and it would work in every manual test and fail on somebody's back button.
 *
 * React-free and free of any `server-only` import, so the parsing and the href construction are
 * unit-testable without a DOM — the same reason `sheet-geometry.ts` is shaped that way.
 */

import type { SwapDirection } from '@/components/ui/view-swap';

/** The param that selects the collections side of the drawer. */
export const VIEW_PARAM = 'view';
/** Its one value. A second value would be a fourth view, which is a different drawer. */
export const COLLECTIONS_VIEW = 'collections';
/** The param that carries the open collection. Spelled out rather than `c`: it appears in shared
 *  links, and a URL a person reads should say what it addresses. */
export const COLLECTION_PARAM = 'collection';

/** What the drawer is showing. Three arms, because there are three; a fourth would be a new view
 *  rather than a new flag on one of these. */
export type DrawerView =
  | { readonly kind: 'places' }
  | { readonly kind: 'index' }
  | { readonly kind: 'collection'; readonly id: string };

export const PLACES_VIEW: DrawerView = { kind: 'places' };
export const INDEX_VIEW: DrawerView = { kind: 'index' };

/** Whether this view is on the collections side of the switch — the one thing most callers need. */
export function isCollectionsView(view: DrawerView): boolean {
  return view.kind !== 'places';
}

/**
 * **One string per distinct view — the drawer's identity for it.**
 *
 * Two consumers, and keeping them on one function is the point: `map-page-client.tsx` hands it to
 * `ViewSwap` as the key whose change *is* the transition, and `collections-scope.tsx` uses the same
 * string to reset the per-collection state during render. A view is "the same view" for the
 * animation exactly when it is the same view for the reset, and two encodings of that would drift.
 *
 * It lives here rather than in either caller because it is a fact about a `DrawerView`, and this is
 * the file that owns what a `DrawerView` is. React-free, like everything else here.
 */
export function viewKey(view: DrawerView): string {
  return view.kind === 'collection' ? `collection:${view.id}` : view.kind;
}

/**
 * The view a request's `searchParams` asks for.
 *
 * **Tolerant on the way in, canonical on the way out.** `?collection=<id>` alone resolves to that
 * collection even without `view=collections`, because an id names a view unambiguously and a URL
 * somebody trimmed by hand should still work. `drawerHref` always writes both, so the product
 * itself only ever produces one shape.
 *
 * A repeated param (`?collection=a&collection=b`) arrives as an array and is **rejected to the
 * places view** rather than resolved to its first entry: it is not a URL this product writes, so
 * the only thing that produces one is somebody editing the address bar, and quietly picking one arm
 * of an ambiguous request is how a surface ends up asserting something the URL did not say. An
 * empty or whitespace-only value is the same case.
 */
export function viewFromSearchParams(
  params: Readonly<Record<string, string | string[] | undefined>>,
): DrawerView {
  const raw = params[COLLECTION_PARAM];
  if (typeof raw === 'string' && raw.trim() !== '') {
    return { kind: 'collection', id: raw.trim() };
  }
  return params[VIEW_PARAM] === COLLECTIONS_VIEW ? INDEX_VIEW : PLACES_VIEW;
}

/**
 * The href for a view — the one place that knows the URL shape, and therefore the one place a
 * change to it has to be made.
 *
 * `encodeURIComponent` on the id even though every id this product writes is a UUID: the value
 * reaching here comes from a row, and a function that builds a URL out of data is the wrong place
 * to assume what the data looks like.
 */
export function drawerHref(view: DrawerView): string {
  if (view.kind === 'places') return '/map';
  if (view.kind === 'index') return `/map?${VIEW_PARAM}=${COLLECTIONS_VIEW}`;
  return `/map?${VIEW_PARAM}=${COLLECTIONS_VIEW}&${COLLECTION_PARAM}=${encodeURIComponent(view.id)}`;
}

/** One collection's href, which is what almost every caller wants. */
export function collectionHref(id: string): string {
  return drawerHref({ kind: 'collection', id });
}

/**
 * What the map canvas says it is showing, inside a collection.
 *
 * The canvas is unreachable to a screen reader, so its accessible name is the whole of what that
 * reader gets from it — and until 2026-08-31 this surface passed none, so `MapSurface` left its
 * default and the map on every collection announced itself as the bare word `Map`
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

/**
 * **How deep in the drawer a view sits**, which is the whole of what the swap animation needs to
 * know.
 *
 * The three views are laid out left-to-right and the product's own chrome already says so: the
 * switch is a segmented pair with `Places` on the left and `Collections` on the right
 * (`components/shell/map-shell.tsx`), and every row in the index carries a right-pointing chevron
 * into the collection it names. So *deeper* is *further right*, and a number per view is enough to
 * derive both directions without a table of nine transitions.
 *
 * **`places` is depth 0 and always was**, which is the part worth naming after 2026-09-01. This
 * file has modelled all three views as peers since it was written; what did not match it was where
 * `ViewSwap` was mounted — inside the collections branch, so the one switch a person presses every
 * session, `places ↔ collections`, had no host in the document to hold the outgoing list. The swap
 * now sits above the branch in `map-page-client.tsx` and this function finally answers for every
 * pair it can already describe.
 *
 * Not exported as a general fact about a view — it means nothing outside a transition, and a
 * caller reaching for "how deep is this view" for any other reason is asking the wrong question.
 */
function viewDepth(view: DrawerView): number {
  if (view.kind === 'places') return 0;
  if (view.kind === 'index') return 1;
  return 2;
}

/**
 * Which way a swap between two views is going, for `components/ui/view-swap.tsx`.
 *
 * **Equal depth is `forward`**, and that is a decision rather than a fallthrough. The only pair at
 * one depth is collection A → collection B, which nothing in the product currently links; if
 * something ever does, a fresh collection arriving from the right is the right sentence for it, and
 * the alternative — a third `lateral` direction — would put two constants in the motion vocabulary
 * with no call site. `view-swap.tsx`'s `SwapDirection` records that argument at the type.
 *
 * `from` is nullable because the first render of a page has nothing before it. A cold entry on
 * `/map?view=collections` is an arrival rather than a swap, and it takes `forward` for the same
 * reason: it is the direction the switch's own geometry implies. That sentence is now load-bearing
 * rather than decorative: `ViewSwap` plays **no view-tier entrance on its first render**, because
 * an arrival already has the page's own entrance and a hand-off with nothing to hand off from is a
 * slide for its own sake. So on a cold entry this value seeds the state and animates nothing.
 */
export function swapDirection(from: DrawerView | null, to: DrawerView): SwapDirection {
  if (from === null) return 'forward';
  return viewDepth(to) < viewDepth(from) ? 'back' : 'forward';
}
