/**
 * A pin's `id` is not a saved-place id on every surface, and a detail view that assumes it is
 * writes to a row its viewer does not own.
 *
 * `/collections/[id]`'s `toMapPlace` sets `id` to the **collection item** id. That was harmless
 * only while the collection route never handed `selected` to the map surface; merging the two
 * surfaces into one shell (`docs/ux-collections-as-scope.md`) removes that accident, so the
 * saved-place identity is now explicit on the port and this file is what holds it there.
 *
 * Two kinds of assertion, the split `pin-band-floor.test.ts` uses. `savedPlaceRef` is a value and
 * is called directly. Which object the surface passes to `PlaceDetail` is a statement inside JSX
 * that needs a WebGL context to execute, so that half is asserted against the source text —
 * coarse, and honest about being coarse.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { savedPlaceRef } from '@/components/map/saved-place-ref';
import type { MapPlace } from '@/components/map/types';

const SURFACE_SOURCE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');

/** Code, not prose: the file deliberately *explains* the defect in a comment, so a whole-file grep
 *  would match the explanation rather than the behaviour. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** A pin as `/map` builds it: these rows are the viewer's own. */
const savedPin: MapPlace = {
  id: 'saved-1',
  savedPlaceId: 'saved-1',
  name: 'Fugazi',
  category: 'restaurant',
  lat: 32.06,
  lng: 34.77,
  note: '',
  sourceUrl: undefined,
  visited: true,
};

/** A pin as `/collections/[id]` builds it: `id` is a `collection_items` id and there is no saved
 *  row behind it at all. */
const collectionPin: MapPlace = {
  id: 'collection-item-9',
  name: 'Fugazi',
  category: 'restaurant',
  lat: 32.06,
  lng: 34.77,
  note: '',
  sourceUrl: undefined,
  visited: false,
};

describe('savedPlaceRef', () => {
  it('names the saved row when the pin carries one', () => {
    expect(savedPlaceRef(savedPin)).toEqual({ id: 'saved-1', visited: true });
  });

  /** The defect this exists to make impossible. */
  it('never falls back to the pin id, which is a collection item id here', () => {
    expect(savedPlaceRef(collectionPin)).toBeNull();
  });

  it('is null for a pin whose saved id is an empty string rather than absent', () => {
    expect(savedPlaceRef({ ...collectionPin, savedPlaceId: '' })).toBeNull();
  });

  it('carries the been timestamp off the joined Spot when there is one', () => {
    const visitedAt = new Date('2026-08-30T10:00:00Z');
    const ref = savedPlaceRef({
      savedPlaceId: 'saved-1',
      visited: true,
      // Only the one field is read here, so the rest of `Spot` is not fabricated.
      detail: { visitedAt } as unknown as NonNullable<MapPlace['detail']>,
    });

    expect(ref).toEqual({ id: 'saved-1', visited: true, visitedAt });
  });

  /** `exactOptionalPropertyTypes` is on and `0006`'s CHECK allows a marked row with no timestamp:
   *  absent is the honest shape, not `undefined`. */
  it('omits the timestamp key rather than writing undefined', () => {
    const ref = savedPlaceRef(savedPin);

    expect(ref && Object.hasOwn(ref, 'visitedAt')).toBe(false);
  });
});

describe('the map popup never derives a write target from the pin id again', () => {
  /** `card` is the selection once MAP-02's opening gate has cleared it — the same object as
   *  `selected`, held back until the camera is at rest. The assertion is about where the write
   *  target comes from, and it still comes from the rendered place's `savedPlaceRef`. */
  it('passes savedPlaceRef(card) to PlaceDetail', () => {
    expect(code(SURFACE_SOURCE)).toContain('savedPlace={savedPlaceRef(card)}');
  });

  it('constructs no savedPlace object from the pin id', () => {
    expect(code(SURFACE_SOURCE)).not.toMatch(/savedPlace=\{\{/);
    expect(code(SURFACE_SOURCE)).not.toContain('id: selected.id');
    expect(code(SURFACE_SOURCE)).not.toContain('id: card.id');
  });
});
