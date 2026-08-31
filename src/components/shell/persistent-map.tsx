'use client';

/**
 * **One MapLibre instance for the whole session, instead of one per route.**
 *
 * ## What this exists to fix, measured before it was written
 *
 * `/map`, `/collections` and `/collections/[id]` all render `MapShell`, and `MapShell` renders
 * `MapSurface`. They are **sibling route segments with no shared layout**, so the App Router's only
 * common ancestor for them is the root layout: tapping a tab in `BottomNav` unmounts one route's
 * whole subtree and mounts the next one's. The map goes with it.
 *
 * Measured at commit `9a95444`, 390x844, stub-backed, two runs, per tab-to-tab hop:
 *
 * | | `/map` -> `/collections` | `/collections` -> `/map` |
 * |---|---|---|
 * | full document load | **no** — the router soft-navigates | **no** |
 * | new WebGL contexts | **1** | **1** |
 * | basemap tile requests | 16 | 13 |
 * | `style.json` fetches | 3 | 3 |
 *
 * So the owner's *"should be self contained seamless no page refresh"* is not a missing `<Link>` and
 * not a hard navigation — it is a **new `maplibregl.Map` on every hop**, with its style re-parsed,
 * its tiles re-requested and its camera re-fitted from scratch. The thing that reads as a refresh is
 * `components/ui/map.tsx`'s `DefaultLoader`: a `bg-background/50 backdrop-blur-xs` scrim with three
 * pulsing dots, which is what the server sends for the map area and what comes back over a blurred,
 * half-drawn basemap for ~1.1 s every single time you tap **Map**.
 *
 * ## Why the map is hoisted rather than cached
 *
 * MapLibre 6.4.1 has **no `setContainer`** — checked, `maplibre-gl.d.ts` contains the string zero
 * times — so there is no supported way to hand a live `Map` to a freshly mounted React component.
 * What survives a route change is what React never unmounts, and the only place above all three
 * routes is `app/layout.tsx`. So `MapSurface` is rendered **once**, from the root layout, into a
 * detached container this module owns; each route's `MapShell` then *borrows* that container by
 * `appendChild`-ing it into its own anchor.
 *
 * React is unaware of the move, and that is sound rather than lucky: the surface is rendered through
 * `createPortal`, and a portal's container is an opaque handle React writes into — it never reads
 * the container's own position in the document. Moving the container moves everything React put in
 * it, including the canvas and its WebGL context, which a DOM move does not disturb.
 *
 * ## What hoisting costs, stated rather than assumed
 *
 * **It costs nothing in the server payload.** That was the objection worth checking, because this
 * repo has shipped a blank sign-in screen and a 2.4 s invisible place list by making content
 * conditional on JavaScript. So it was measured, at `9a95444`, by reading the document response for
 * `/map` before hydration: the map contributes **the loading scrim and nothing else** — no
 * `maplibregl`, no `Zoom in`, no `CARTO` attribution, no control column. `components/ui/map.tsx`
 * mounts its map in an effect, so every pixel of the map was already client-only. What a no-JS
 * visitor loses here is three pulsing dots.
 *
 * Everything that *is* server-rendered stays in the route and is untouched: `BottomNav`
 * (`aria-label="Main"`, confirmed present in that same document), the `lg+` place panel and its
 * rows, and the account chip. The sheet was never in the server payload either — `Drawer.Portal`
 * does not render on the server — so this changes nothing about it.
 *
 * **It costs one dynamic chunk.** `MapSurface` is loaded with `next/dynamic` rather than imported
 * statically, because a static import from a component the root layout renders would put
 * `maplibre-gl` in the shared client chunk of *every* route, including `/` and `/sign-in`.
 *
 * ## Known defect: the camera comes back a zoom band wider — cause found, fix not applied here
 *
 * **After a round trip through `/collections`, `/map` rests further out than it does on first
 * load.** Traced at `d77a1c6`, 390x844, with `fitToBounds` and `frameBounds` instrumented in a
 * throwaway build: first load rests at **z11.60**; tapping Collections and then Map re-frames the
 * library twice and rests at **z10.46**. Two towns wider, every hop.
 *
 * It is not this file's design and it is not the borrowing itself. It is a callback-ref chain in
 * `components/map/map-surface.mapcn.tsx`. `floatingTopChromePx` is `paddingFor`'s only dependency,
 * and `paddingFor` reaches `frameBounds` -> `fitTo` -> `fitToBounds` -> `refitFramed` ->
 * `attachMapRef`; React detaches and re-attaches a callback ref whose identity changes, and that
 * re-attach re-runs the home framing, `hasFramedOnce` notwithstanding. `/map` omits the prop and
 * `/collections` passes `0`, so every hop trips it. And the re-frame reads a **mixed** budget: the
 * arriving route's chrome with the departing route's `sheetFractionRef`, because that ref is
 * written from a passive effect that has not run yet — which is why the wide one is `/map` framed
 * with `/collections`' 0.55 full-sheet fraction.
 *
 * That chain was harmless while a surface belonged to one route for its whole life. Persisting the
 * map is what made two of its props change under a live instance, so this file is the *occasion*
 * for the defect and `map-surface.mapcn.tsx` is the *location* of it.
 *
 * **The fix is nine lines and is verified.** Make `floatingTopChromePx` a ref — the pattern that
 * file already uses five times, for this exact reason, on `latestBounds`, `latestAllowance`,
 * `latestPlaceCount`, `sheetFractionRef` and `accessibleNameRef` — which empties `paddingFor`'s
 * dependency array and makes the whole chain stable; and give the attach-time `fitToBounds` the
 * same `hasFramedOnce` guard its sibling effect already carries. With both applied in a throwaway
 * build, **no camera mover fires on either hop at all** and `/map` after a round trip is
 * byte-identical to `/map` on first load (SHA-256 `aac92098...`, 390x844).
 *
 * It is not applied because `components/map/**` was not this lane's to write. The patch is ready.
 * Whoever picks it up: delete this section, do not summarise it — a note describing a defect that
 * no longer exists is worse than no note.
 *
 * ## What is deliberately not abstracted
 *
 * There is no generic "persistent component" mechanism here, no registry, no keying by name. One
 * surface in this product is expensive enough to be worth keeping alive, and the moment a second
 * one appears the right move is to write it out again rather than to generalise this.
 */

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import type { MapSurfaceProps } from '@/components/map/types';
import { NearMeDistancesContext, type NearMeDistances } from '@/components/map/near-me-context';
import { AnnounceContext, type Announcer } from '@/ui/place/announce';
import { CollectionsContext, type CollectionsForPlace } from '@/ui/place/collections-context';
import { TagFilterContext, type TagFilter } from '@/ui/place/tag-filter';

/**
 * `ssr: false` is not a preference — see the header. The chunk is fetched the first time a slot
 * publishes, which is the first render of the first map-bearing route, so it is in flight while
 * that route's own data is still resolving.
 */
const MapSurface = dynamic(
  () => import('@/components/map/map-surface').then((m) => m.MapSurface),
  { ssr: false },
);

/**
 * **The four contexts `MapSurface` reads from the route that rendered it, carried across the seam.**
 *
 * At `lg+` the surface draws the selected place's detail itself, in `MapPopup` -> `PlaceDetail`
 * (`map-surface.mapcn.tsx` imports it from `components/sheet/place-sheet.tsx`). That subtree
 * consumes four contexts, and all four are provided *above* `MapShell` by the route:
 * `CollectionsContext`, `TagFilterContext` and `AnnounceContext` from `map-page-client.tsx`,
 * `NearMeDistancesContext` from the same file.
 *
 * React resolves context by **where an element renders, not where it was created**, so hoisting the
 * surface out of the route would silently drop all four: the popover would lose its collections
 * row, its tag chips would stop toggling, its announcements would go nowhere and the *"1.2 km
 * away"* line would vanish. Nothing would throw — every one of those consumers falls back to `null`
 * by design. So the slot reads them on the route side and the host re-provides them on the other,
 * and `persistent-map.test.ts` pins this list against every context the surface's subtree can
 * reach, so a fifth one is a failing test rather than an invisible regression.
 */
export interface SurfaceContexts {
  readonly collections: CollectionsForPlace | null;
  readonly tagFilter: TagFilter | null;
  readonly announcer: Announcer | null;
  readonly nearMeDistances: NearMeDistances | null;
}

interface SurfaceState {
  readonly props: MapSurfaceProps;
  readonly contexts: SurfaceContexts;
  /** The pin identities this scope published, so the next scope can tell whether it is looking at
   *  the same library or at a different one. See `useAdoptionRefit`. */
  readonly placeIds: readonly string[];
  /** How much of the container this scope's chrome covers, as a string — `restingStop` and
   *  `floatingTopChromePx`, the two inputs to the surface's fit padding. See `useAdoptionRefit`. */
  readonly framingBudget: string;
}

/**
 * `useLayoutEffect` warns when it runs on the server, and the slot is server-rendered as part of the
 * route. `useEffect` on the server is a no-op with no warning, and neither runs there — so this is
 * the warning suppressed rather than the behaviour changed.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// ---------------------------------------------------------------------------
// The store. A module-level external store rather than a context, because the writer (`MapShell`,
// inside the route) is *below* the reader (`MapCanvasHost`, in the root layout) in the tree — the
// one direction React's own data flow cannot express.
// ---------------------------------------------------------------------------

let state: SurfaceState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns the stored object itself, never a fresh one — `useSyncExternalStore` compares snapshots
 *  by identity and a new object per call is an infinite render loop. */
function getSnapshot(): SurfaceState | null {
  return state;
}

/** Nothing is published during a server render, so the surface is absent from the server payload.
 *  That is the whole of the SSR change this module makes; the header measures what it costs. */
function getServerSnapshot(): SurfaceState | null {
  return null;
}

function publish(next: SurfaceState | null): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// The container that outlives every route.
// ---------------------------------------------------------------------------

let mapNode: HTMLDivElement | null = null;

/**
 * The portal container, and the hidden box it rests in between routes.
 *
 * **The parking box keeps the map's size.** A container that goes to 0x0 fires the surface's own
 * `ResizeObserver`, and that observer re-frames the camera — so parking the map in a detached node,
 * or in a `display: none` one, would throw the camera away at exactly the moment this module exists
 * to preserve it. `visibility: hidden` keeps layout, so the map measures the same viewport parked as
 * it does adopted and the observer never fires.
 */
function ensureMapNode(): HTMLDivElement {
  if (mapNode) return mapNode;
  const parking = document.createElement('div');
  parking.setAttribute('data-persistent-map-parking', '');
  parking.style.cssText =
    'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1';
  document.body.appendChild(parking);

  const node = document.createElement('div');
  // `h-full w-full` and **not** `absolute inset-0`: the surface is a static, full-size first child
  // of `MapShell`'s `relative h-full w-full` box today, and positioning this wrapper would promote
  // the map into the positioned-element paint group, above every unpositioned sibling. Two static
  // full-size wrappers change nothing about paint order.
  node.className = 'h-full w-full';
  parking.appendChild(node);
  mapNode = node;
  return node;
}

function parkMapNode(): void {
  const node = mapNode;
  if (!node) return;
  const parking = document.querySelector('[data-persistent-map-parking]');
  if (parking && node.parentElement !== parking) parking.appendChild(node);
}

// ---------------------------------------------------------------------------
// The host — rendered once, from the root layout.
// ---------------------------------------------------------------------------

/**
 * Routes that may hold the map alive.
 *
 * **Anywhere else releases it, and that is a privacy rule rather than a memory one.** A parked map
 * still holds the signed-in user's pins in the document; keeping it after a sign-out would leave one
 * account's saved places in the DOM of the next screen. Sign-out lands on `/sign-in` or `/`, neither
 * of which is here, so the release is the same event.
 *
 * `/import` is on the list because the import overlay is a takeover *over* the map — `MapShell`
 * unmounts the sheet and the bar for it and leaves the surface mounted — and because the route the
 * user returns to is `/map`.
 */
export const MAP_ROUTES = ['/map', '/collections', '/import'] as const;

export function holdsMap(pathname: string): boolean {
  return MAP_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function MapCanvasHost() {
  const surface = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();
  const release = !holdsMap(pathname);

  useEffect(() => {
    if (release) publish(null);
  }, [release]);

  if (surface === null || release) return null;

  const { collections, tagFilter, announcer, nearMeDistances } = surface.contexts;
  return createPortal(
    <CollectionsContext value={collections}>
      <TagFilterContext value={tagFilter}>
        <AnnounceContext value={announcer}>
          <NearMeDistancesContext value={nearMeDistances}>
            <MapSurface {...surface.props} />
          </NearMeDistancesContext>
        </AnnounceContext>
      </TagFilterContext>
    </CollectionsContext>,
    ensureMapNode(),
  );
}

// ---------------------------------------------------------------------------
// The slot — rendered by `MapShell`, once per route.
// ---------------------------------------------------------------------------

/**
 * Where the map goes on this route, and the publication of what it should be showing.
 *
 * **`useLayoutEffect`, not `useEffect`, and it is the whole reason this is seamless.** React's
 * commit runs mutation (the old route's DOM is detached, the new route's is inserted), then layout
 * effects, then paint, then passive effects. Adopting in a passive effect would let the browser
 * paint a frame in which the map node is inside a detached subtree — a flash of exactly the empty
 * chrome this change exists to remove, and a 0x0 measurement for the surface's `ResizeObserver`.
 * In a layout effect the cleanup of the outgoing slot and the setup of the incoming one both run
 * inside the same commit, before any paint, so the node's only observed position is its new one.
 */
export function PersistentMapSlot({
  surface,
  framingBudget,
}: {
  surface: MapSurfaceProps;
  /** See `SurfaceState.framingBudget`. Built by `MapShell`, which is the only thing that knows
   *  both numbers. */
  framingBudget: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);

  // Read on the route side; re-provided on the host side. See `SurfaceContexts`.
  const collections = use(CollectionsContext);
  const tagFilter = use(TagFilterContext);
  const announcer = use(AnnounceContext);
  const nearMeDistances = use(NearMeDistancesContext);

  const placeIds = useMemo(() => surface.places.map((place) => place.id), [surface.places]);

  useIsomorphicLayoutEffect(() => {
    publish({
      props: surface,
      contexts: { collections, tagFilter, announcer, nearMeDistances },
      placeIds,
      framingBudget,
    });
  });

  useIsomorphicLayoutEffect(() => {
    anchor.current?.appendChild(ensureMapNode());
    return parkMapNode;
  }, []);

  return <div ref={anchor} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// Framing across a scope change.
// ---------------------------------------------------------------------------

/**
 * **Re-frame when the arriving scope would have framed differently, and only then.**
 *
 * The surface frames the whole library exactly once per mount — `hasFramedOnce` in
 * `map-surface.mapcn.tsx`, guarding the automatic fit *"so it happens once, on arrival, and never
 * again as a side effect of data changing"*. With the map no longer remounting, "on arrival" stops
 * happening at a route boundary, so the framing a route used to get for free has to be asked for.
 *
 * Two things decide whether the arriving scope wants a different picture, and **it took a
 * measurement to learn that the second one exists.** The first is the pins. The second is the
 * *fit budget* — `restingStop` and `floatingTopChromePx`, which are what the surface's
 * `paddingFor` turns into occlusion insets.
 *
 * The first version of this compared pins alone, on the reasoning that `/map` and `/collections`
 * show the same library and so should keep the camera the user left. That is true of the pins and
 * false of the picture: `/collections` rests its sheet at `full`, so the surface re-fits the same
 * thirty pins into the strip a full-height sheet leaves and comes to rest **much further out**.
 * Nobody sees that happen — it is behind the sheet — and with the map persisting, `/map` then
 * inherited it. Filmstripped at 390x844: the returning map framed Rehovot and Ness Ziona where it
 * had framed Bat Yam, with the library a small cluster in the top third.
 *
 * So the condition is *"would this scope have framed differently"*, and it answers correctly on
 * both sides. Two scopes with the same pins and the same budget — which is what a `/map` -> `/map`
 * re-entry would be — keep the camera. Anything else re-fits, which is exactly what a remount used
 * to do and no more often. `framePlaces` is the same mover `/collections/[id]`'s `useRefitOnChange`
 * already uses for a membership change, so this is the framing that route asks for anyway, one
 * commit earlier.
 *
 * Nothing happens on the first map-bearing route of a session: the surface is mounting there, and
 * it frames itself.
 */
export function useAdoptionRefit(
  placeIds: readonly string[],
  framingBudget: string,
  framePlaces: (ids: readonly string[]) => void,
): void {
  useIsomorphicLayoutEffect(() => {
    const previous = state;
    if (previous === null) return;
    if (previous.framingBudget === framingBudget && sameIds(previous.placeIds, placeIds)) return;
    framePlaces(placeIds);
    // Mount only: this answers "did a new scope adopt a live map", which is a question about
    // arrival. A `places` change *within* a scope is the route's own business and every route that
    // has one already handles it.
  }, []);
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((id) => seen.has(id));
}

/** Test seam. Never called from the product; `persistent-map.test.ts` needs a clean module. */
export function __resetPersistentMapForTest(): void {
  state = null;
  listeners.clear();
  mapNode = null;
}

/** Test seam — the published state, so a test can assert what crossed the boundary. */
export function __persistentMapState(): SurfaceState | null {
  return state;
}

export type { SurfaceState as PersistentMapState };
