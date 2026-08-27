import { describe, expect, it } from 'vitest';

import { filterByTag, filterPlaces, toSearchablePlace } from '@/components/map/filter-places';
import type { MapPlace } from '@/components/map/types';
import type { Spot } from '@/domain/places/spot';

/**
 * The tag chip filter (`filterByTag`) and its composition with the search box.
 *
 * Every tag string here is one this database actually holds — `psql`, 2026-08-28: `hidden gem` on
 * three saved places, `pan asian` on two, and the Hebrew `בורקס` / `מאפייה` on Anat Bakery. A
 * fabricated Hebrew tag would prove the code handles Hebrew *we* wrote; these prove it handles the
 * Hebrew the extractor wrote.
 */

/** A `MapPlace` carrying the enrichment fields `getSpots` populates but `Spot` does not declare —
 *  the same shape `enrichmentOf` reads, and the same cast it documents. */
function place(id: string, name: string, tags: readonly string[]): MapPlace {
  return {
    id,
    name,
    category: 'restaurant',
    lat: 32.07,
    lng: 34.77,
    note: '',
    sourceUrl: undefined,
    detail: { id, name, category: 'restaurant', lat: 32.07, lng: 34.77, tags } as unknown as Spot,
  };
}

const anat = place('anat', 'Anat Bakery', ['בורקס', 'מאפייה', 'hidden gem']);
const kiaans = place('kiaans', 'Kiaans Tooting', [
  'pan asian',
  'market stall',
  'hidden gem',
  'street food',
  'late night',
]);
const jones = place('jones', 'Jones Family Kitchen', ['hidden gem']);
const mber = place('mber', 'MBER London', ['pan asian', 'sharing plates', 'underground']);
/** Every place saved before extraction v2 — no backfill ran, so this is most of the library. */
const untagged = place('hakosem', 'HaKosem', []);
/** A pin with no `Spot` at all: a mock surface, or a test. It must simply never match. */
const bare: MapPlace = {
  id: 'bare',
  name: 'Bare Pin',
  category: 'restaurant',
  lat: 0,
  lng: 0,
  note: '',
  sourceUrl: undefined,
};

const library = [anat, kiaans, jones, mber, untagged, bare];

describe('filterByTag', () => {
  it('returns the library untouched when no chip is active', () => {
    // Identity, not equality: an untouched filter must not churn React memoisation upstream.
    expect(filterByTag(library, null)).toBe(library);
  });

  it('narrows to the places carrying the tag', () => {
    expect(filterByTag(library, 'hidden gem').map((p) => p.id)).toEqual([
      'anat',
      'kiaans',
      'jones',
    ]);
  });

  it('filters on a Hebrew tag the extractor actually wrote', () => {
    expect(filterByTag(library, 'בורקס').map((p) => p.id)).toEqual(['anat']);
    expect(filterByTag(library, 'מאפייה').map((p) => p.id)).toEqual(['anat']);
  });

  it('matches the whole tag, never a substring of one', () => {
    // `pan asian` is a tag; `asian` is not. A chip means the label printed on it — widening to a
    // substring would make the chip quietly do the search box's job and say so nowhere.
    expect(filterByTag(library, 'asian')).toEqual([]);
    expect(filterByTag(library, 'gem')).toEqual([]);
    expect(filterByTag(library, 'pan asian').map((p) => p.id)).toEqual(['kiaans', 'mber']);
  });

  it('is insensitive to case, accents and punctuation, because tag identity is', () => {
    // The database's own `normalize_tag()` lowercases but folds neither accents nor punctuation,
    // so a row can hold `Pan-Asian` where the application would have written `pan asian`. Both must
    // be the same tag or the vocabulary fragments.
    expect(filterByTag(library, 'Pan-Asian').map((p) => p.id)).toEqual(['kiaans', 'mber']);
    expect(filterByTag(library, 'HIDDEN GEM').map((p) => p.id)).toEqual(['anat', 'kiaans', 'jones']);
  });

  it('drops places with no tags rather than keeping them as "unfiltered"', () => {
    const ids = filterByTag(library, 'hidden gem').map((p) => p.id);
    expect(ids).not.toContain('hakosem');
    expect(ids).not.toContain('bare');
  });

  it('returns nothing for a tag no place carries', () => {
    expect(filterByTag(library, 'natural wine')).toEqual([]);
  });

  it('treats a blank tag as no filter at all', () => {
    expect(filterByTag(library, '   ')).toBe(library);
  });
});

describe('filterByTag composed with filterPlaces', () => {
  it('applies as AND — the tag narrows the library, the search narrows within it', () => {
    const tagged = filterByTag(library, 'hidden gem');
    expect(filterPlaces(tagged, 'anat').map((p) => p.id)).toEqual(['anat']);
    expect(filterPlaces(tagged, 'kiaans').map((p) => p.id)).toEqual(['kiaans']);
  });

  it('can compose down to nothing, which is a real state and not a bug', () => {
    // The empty state the sheet renders for this offers `Show all matches` and `Clear search`.
    expect(filterPlaces(filterByTag(library, 'hidden gem'), 'mber')).toEqual([]);
  });

  it('composes in either order, so the page client is free to memoise the tag pass first', () => {
    const tagThenSearch = filterPlaces(filterByTag(library, 'pan asian'), 'london');
    const searchThenTag = filterByTag(filterPlaces(library, 'london'), 'pan asian');
    expect(tagThenSearch.map((p) => p.id)).toEqual(searchThenTag.map((p) => p.id));
    expect(tagThenSearch.map((p) => p.id)).toEqual(['mber']);
  });
});

describe('toSearchablePlace', () => {
  it('is the projection the tag filter reads too, so the two can never disagree', () => {
    expect(toSearchablePlace(anat).tags).toEqual(['בורקס', 'מאפייה', 'hidden gem']);
    expect(toSearchablePlace(bare).tags).toEqual([]);
  });
});
