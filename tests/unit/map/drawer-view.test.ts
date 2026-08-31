/**
 * **The collections drawer's two views, and the URL that addresses them.**
 *
 * The owner's ask on 2026-08-31 was *"the collection / places navigation should be inside the
 * drawer, dont make the page flicker"*, and the structural half of that is here: the index and one
 * collection stopped being two route segments. What this file pins is the contract that makes the
 * change safe rather than the change itself —
 *
 *  - a URL still addresses the view, so back, forward and a deep link all work;
 *  - the parse is total, so an address bar somebody typed into cannot produce a half-state;
 *  - the href is built in exactly one place, so the row, the redirect and the switch cannot drift.
 *
 * `_lib/drawer-view.ts` is React-free and imports nothing `server-only`, which is what lets all of
 * that be checked without a DOM. See `tests/unit/shell/drawer-view-switch.test.ts` for the control
 * that uses these hrefs.
 */

import { describe, expect, it } from 'vitest';

import {
  COLLECTION_PARAM,
  INDEX_VIEW,
  collectionCanvasName,
  collectionsHref,
  viewFromSearchParams,
} from '@/app/collections/_lib/drawer-view';

const ID = 'cccccccc-0000-4000-8000-000000000001';

describe('which view the URL asks for', () => {
  it('is the index when the param is absent', () => {
    expect(viewFromSearchParams({})).toEqual(INDEX_VIEW);
  });

  it('is that collection when the param names one', () => {
    expect(viewFromSearchParams({ [COLLECTION_PARAM]: ID })).toEqual({
      kind: 'collection',
      id: ID,
    });
  });

  it('falls back to the index for every shape the product never writes', () => {
    /**
     * A repeated param arrives as an array and an empty one arrives as `''`. Neither is reachable
     * from any link in the product, so the only thing that produces one is somebody editing the
     * address bar — and quietly resolving `?collection=a&collection=b` to `a` is how a surface
     * ends up asserting something the URL did not say. The index is the honest answer: it is what
     * `/collections` means, and it is the view that needs no id.
     */
    const shapes: (string | string[] | undefined)[] = [[ID, 'other'], [], '', '   ', undefined];
    for (const raw of shapes) {
      expect(viewFromSearchParams({ [COLLECTION_PARAM]: raw }), String(raw)).toEqual(INDEX_VIEW);
    }
  });

  it('ignores every other param, so a handoff on the URL cannot change the view', () => {
    expect(viewFromSearchParams({ place: 'x', c: ID, id: ID })).toEqual(INDEX_VIEW);
  });
});

describe('the href', () => {
  it('is the bare segment for the index — the same segment a collection is on', () => {
    // The whole point: these two differ only in their search params, so the router re-renders one
    // page in place rather than unmounting a subtree and mounting another.
    expect(collectionsHref(INDEX_VIEW)).toBe('/collections');
    expect(collectionsHref({ kind: 'collection', id: ID }).startsWith('/collections?')).toBe(true);
  });

  it('names the param it is carrying', () => {
    expect(collectionsHref({ kind: 'collection', id: ID })).toBe(`/collections?collection=${ID}`);
  });

  it('encodes the id rather than trusting what a row happened to hold', () => {
    const href = collectionsHref({ kind: 'collection', id: 'a b&c=d#e' });
    expect(href).toBe('/collections?collection=a%20b%26c%3Dd%23e');
    // And it round-trips, which is the claim that matters — an id that survives the URL is an id
    // the page can look up.
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
    expect(collectionCanvasName('Weekend list', 0)).toBe('Map of Weekend list. It has no places yet.');
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
