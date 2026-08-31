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
  viewFromSearchParams,
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
