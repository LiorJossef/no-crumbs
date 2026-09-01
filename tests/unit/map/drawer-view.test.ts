/**
 * **The drawer's three views, and the URL that addresses them.**
 *
 * The owner's ask on 2026-08-31 was *"the collection / places navigation should be inside the
 * drawer, dont make the page flicker"*, and the structural half of that is here: places, the
 * collections index and one collection stopped being three route segments. What this file pins is
 * the contract that makes the change safe rather than the change itself —
 *
 *  - a URL still addresses the view, so back, forward and a deep link all work;
 *  - the parse is total, so an address bar somebody typed into cannot produce a half-state;
 *  - the href is built in exactly one place, so the switch, the row, the two redirect shims, the
 *    join flow, the create hook and `/profile`'s list cannot drift apart.
 *
 * `_lib/drawer-view.ts` is React-free and imports nothing `server-only`, which is what lets all of
 * that be checked without a DOM. See `tests/unit/shell/drawer-view-switch.test.ts` for the control
 * that uses these hrefs.
 */

import { describe, expect, it } from 'vitest';

import {
  COLLECTION_PARAM,
  COLLECTIONS_VIEW,
  INDEX_VIEW,
  PLACES_VIEW,
  VIEW_PARAM,
  collectionCanvasName,
  collectionHref,
  drawerHref,
  isCollectionsView,
  swapDirection,
  viewFromSearchParams,
  viewKey,
} from '@/app/map/_lib/drawer-view';

const ID = 'cccccccc-0000-4000-8000-000000000001';
const COLLECTION = { kind: 'collection', id: ID } as const;

describe('which view the URL asks for', () => {
  it('is the places view when neither param is there', () => {
    expect(viewFromSearchParams({})).toEqual(PLACES_VIEW);
  });

  it('is the index when the view param names it', () => {
    expect(viewFromSearchParams({ [VIEW_PARAM]: COLLECTIONS_VIEW })).toEqual(INDEX_VIEW);
  });

  it('is that collection when the collection param names one', () => {
    expect(
      viewFromSearchParams({ [VIEW_PARAM]: COLLECTIONS_VIEW, [COLLECTION_PARAM]: ID }),
    ).toEqual(COLLECTION);
  });

  it('accepts an id without the view param, because an id names a view unambiguously', () => {
    // Tolerant on the way in, canonical on the way out: a URL somebody trimmed by hand still works,
    // and `drawerHref` is what decides the shape the product itself writes.
    expect(viewFromSearchParams({ [COLLECTION_PARAM]: ID })).toEqual(COLLECTION);
  });

  it('falls back to the places view for every shape the product never writes', () => {
    /**
     * A repeated param arrives as an array and an empty one arrives as `''`. Neither is reachable
     * from any link in the product, so the only thing that produces one is somebody editing the
     * address bar — and quietly resolving `?collection=a&collection=b` to `a` is how a surface
     * ends up asserting something the URL did not say.
     */
    const shapes: (string | string[] | undefined)[] = [[ID, 'other'], [], '', '   ', undefined];
    for (const raw of shapes) {
      expect(viewFromSearchParams({ [COLLECTION_PARAM]: raw }), String(raw)).toEqual(PLACES_VIEW);
    }
    // And an unrecognised view value is not a fourth view.
    expect(viewFromSearchParams({ [VIEW_PARAM]: 'trips' })).toEqual(PLACES_VIEW);
  });

  it('ignores the reveal handoff, so a param that is state cannot change the view', () => {
    // `?place=` is consumed once and stripped; it must never be read as "show me collections".
    expect(viewFromSearchParams({ place: 'aaaa' })).toEqual(PLACES_VIEW);
  });

  it('says which side of the switch a view is on', () => {
    expect(isCollectionsView(PLACES_VIEW)).toBe(false);
    expect(isCollectionsView(INDEX_VIEW)).toBe(true);
    expect(isCollectionsView(COLLECTION)).toBe(true);
  });
});

describe('the href', () => {
  it('keeps all three views on one segment', () => {
    // The whole point: these differ only in their search params, so the router re-renders one page
    // in place rather than unmounting a subtree and mounting another. A dynamic *segment* would
    // not do this — `LayoutRouter` keys on its value — which is what `/collections/[id]` was.
    for (const href of [drawerHref(PLACES_VIEW), drawerHref(INDEX_VIEW), collectionHref(ID)]) {
      expect(new URL(href, 'https://example.test').pathname, href).toBe('/map');
    }
  });

  it('writes the canonical shape, with both params on a collection', () => {
    expect(drawerHref(PLACES_VIEW)).toBe('/map');
    expect(drawerHref(INDEX_VIEW)).toBe('/map?view=collections');
    expect(collectionHref(ID)).toBe(`/map?view=collections&collection=${ID}`);
  });

  it('round-trips every view through the URL', () => {
    for (const view of [PLACES_VIEW, INDEX_VIEW, COLLECTION]) {
      const params = new URL(drawerHref(view), 'https://example.test').searchParams;
      expect(viewFromSearchParams(Object.fromEntries(params)), drawerHref(view)).toEqual(view);
    }
  });

  it('encodes the id rather than trusting what a row happened to hold', () => {
    const href = collectionHref('a b&c=d#e');
    expect(href).toBe('/map?view=collections&collection=a%20b%26c%3Dd%23e');
    const value = new URL(href, 'https://example.test').searchParams.get(COLLECTION_PARAM);
    expect(viewFromSearchParams({ [COLLECTION_PARAM]: value ?? undefined })).toEqual({
      kind: 'collection',
      id: 'a b&c=d#e',
    });
  });
});

describe('what the map canvas says it is showing', () => {
  /**
   * `ui-review-2026-08-31.md` §1 finding 3 measured this surface announcing itself as the bare word
   * `Map` — `MapSurface`'s own default, because neither collections route passed a name at all.
   * The canvas is unreachable to a screen reader, so its accessible name is the whole of what that
   * reader gets from it.
   */
  it('names the collection and promises the list is complete', () => {
    expect(collectionCanvasName('Weekend list', 6)).toBe(
      'Map of Weekend list. The list below names all 6.',
    );
  });

  it('does not claim a list over a collection with nothing in it', () => {
    expect(collectionCanvasName('Weekend list', 0)).toBe(
      'Map of Weekend list. It has no places yet.',
    );
  });

  it('leaves the name unwrapped, because a screen reader reads the isolates aloud', () => {
    // `isolate()` is right for a visual string and wrong here. The name leads the sentence, so
    // there is no preceding run for a Hebrew name to reorder into.
    expect(collectionCanvasName('שבת בתל אביב', 3)).toBe(
      'Map of שבת בתל אביב. The list below names all 3.',
    );
    expect(collectionCanvasName('שבת בתל אביב', 3)).not.toContain('⁨');
  });
});

/**
 * **Which way the drawer's swap is going** — `components/ui/view-swap.tsx` renders it, this decides
 * it, and it is here rather than there because it is a fact about the *views* and not about the
 * animation.
 *
 * The three views are laid out left-to-right and the product's own chrome already says so: the
 * switch is a segmented pair with `Places` on the left and `Collections` on the right, and every
 * row in the index carries a right-pointing chevron into the collection it names. Deeper is
 * further right, so `forward` arrives from the right and `back` from the left.
 *
 * What this is guarding against is the defect the drawer actually shipped: `index → collection` and
 * `collection → index` were the *same* 440 ms rise, so two moves that mean opposite things looked
 * identical. Every pair below is asserted in both directions for that reason.
 */
describe('which way a view swap is going', () => {
  it('goes forward into the collections side and back out of it', () => {
    expect(swapDirection(PLACES_VIEW, INDEX_VIEW)).toBe('forward');
    expect(swapDirection(INDEX_VIEW, PLACES_VIEW)).toBe('back');
  });

  it('goes forward into a collection and back to the index', () => {
    expect(swapDirection(INDEX_VIEW, COLLECTION)).toBe('forward');
    expect(swapDirection(COLLECTION, INDEX_VIEW)).toBe('back');
  });

  /** The switch reaches `Places` from inside a collection in one tap, skipping the index. Two steps
   *  out is still out. */
  it('goes back out of a collection all the way to the places view', () => {
    expect(swapDirection(COLLECTION, PLACES_VIEW)).toBe('back');
    expect(swapDirection(PLACES_VIEW, COLLECTION)).toBe('forward');
  });

  /**
   * **A cold entry is an arrival, not a swap.** Landing on `/map?view=collections` from a shared
   * link has nothing before it, and `forward` is the direction the switch's own geometry implies.
   */
  it('treats a first render as forward', () => {
    expect(swapDirection(null, INDEX_VIEW)).toBe('forward');
    expect(swapDirection(null, PLACES_VIEW)).toBe('forward');
  });

  /**
   * Two collections sit at one depth. Nothing in the product links one to another today, and the
   * answer is `forward` rather than a third `lateral` direction — which would put two constants in
   * `lib/interaction.ts` with no call site, the thing that file's own header forbids.
   */
  it('treats two views at the same depth as forward', () => {
    const other = { kind: 'collection', id: 'cccccccc-0000-4000-8000-000000000002' } as const;
    expect(swapDirection(COLLECTION, other)).toBe('forward');
    expect(swapDirection(PLACES_VIEW, PLACES_VIEW)).toBe('forward');
  });
});

/**
 * **The drawer's identity for a view**, and it has two consumers that must never disagree:
 * `map-page-client.tsx` hands it to `ViewSwap` as the key whose change *is* the transition, and
 * `collections-scope.tsx` uses the same string to decide that the scope changed and reset the
 * pushed pane. A view is "the same view" for the animation exactly when it is the same view for the
 * reset. It was a private function in `collections-scope.tsx` until 2026-09-01, when the swap moved
 * above the places/collections branch and the two callers stopped being one file.
 */
describe('one string per view', () => {
  it('separates the three views', () => {
    const keys = [viewKey(PLACES_VIEW), viewKey(INDEX_VIEW), viewKey(COLLECTION)];
    expect(new Set(keys).size).toBe(3);
  });

  it('separates two collections, because entering another one is a swap', () => {
    const other = { kind: 'collection', id: 'cccccccc-0000-4000-8000-000000000002' } as const;
    expect(viewKey(COLLECTION)).not.toBe(viewKey(other));
  });

  /** A collection id could collide with a view name only if the prefix were dropped, which is the
   *  one way this function can be quietly wrong: `places` as a collection id would then read as the
   *  places view and neither the transition nor the scope reset would fire. */
  it('keeps a collection distinguishable from a view of the same name', () => {
    expect(viewKey({ kind: 'collection', id: 'places' })).not.toBe(viewKey(PLACES_VIEW));
    expect(viewKey({ kind: 'collection', id: 'index' })).not.toBe(viewKey(INDEX_VIEW));
  });

  it('is stable for the same view across renders', () => {
    expect(viewKey({ kind: 'collection', id: ID })).toBe(viewKey(COLLECTION));
  });
});
