import { describe, expect, it } from 'vitest';

import { MAX_TAG_FACETS, isSameTag, isTagActive, tagFacets } from '@/ui/place/tag-filter';

/**
 * Tag identity as the chips use it. This is the predicate that decides whether the chip you are
 * looking at is the one currently filtering — i.e. whether it renders pressed and whether tapping
 * it clears rather than re-applies. Getting it wrong shows up as a chip you cannot switch off.
 */
describe('isSameTag', () => {
  it('is true for the same stored tag', () => {
    expect(isSameTag('hidden gem', 'hidden gem')).toBe(true);
  });

  it('folds case, punctuation and accents, exactly as the rest of the codebase does', () => {
    // `tagKey` is `normalise()` + NFKC — the project's single answer to "are these the same tag?"
    // (`domain/extraction/tags.ts`). A second, quietly different rule here is how a chip ends up
    // unable to clear itself on a row written by an older code path.
    expect(isSameTag('Pan-Asian', 'pan asian')).toBe(true);
    expect(isSameTag('CAFÉ', 'cafe')).toBe(true);
  });

  it('keeps different tags apart, including one that is a prefix of another', () => {
    expect(isSameTag('pan asian', 'asian')).toBe(false);
    expect(isSameTag('hidden gem', 'hidden')).toBe(false);
  });

  it('holds for the Hebrew tags this library actually carries', () => {
    expect(isSameTag('בורקס', 'בורקס')).toBe(true);
    expect(isSameTag('בורקס', 'מאפייה')).toBe(false);
  });
});

describe('isTagActive', () => {
  it('is false when nothing is filtering', () => {
    expect(isTagActive(null, 'hidden gem')).toBe(false);
  });

  it('marks only the chip that is filtering', () => {
    expect(isTagActive('hidden gem', 'hidden gem')).toBe(true);
    expect(isTagActive('hidden gem', 'market stall')).toBe(false);
  });

  it('marks a Hebrew chip the same way', () => {
    expect(isTagActive('מאפייה', 'מאפייה')).toBe(true);
    expect(isTagActive('מאפייה', 'בורקס')).toBe(false);
  });
});

/**
 * The facet: which tags the library actually holds and how many places each one has.
 *
 * The load-bearing property is `overnight-copy-deck.md` §9.1's, and it is a property of this
 * function rather than of the component that draws it: **for every facet returned, tapping its chip
 * yields at least one place.** A chip that filters to nothing is a control that does nothing, and
 * that is worse than no control at all.
 */
describe('tagFacets', () => {
  interface Row { readonly tags: readonly string[] }
  const tagsOf = (row: Row) => row.tags;
  const rows = (...tagLists: readonly string[][]): readonly Row[] =>
    tagLists.map((tags) => ({ tags }));

  it('counts places, most-used first', () => {
    const facets = tagFacets(
      rows(['late night'], ['late night', 'wine'], ['late night'], ['wine']),
      tagsOf,
    );
    expect(facets.map((f) => [f.tag, f.count])).toEqual([
      ['late night', 3],
      ['wine', 2],
    ]);
  });

  it('never returns a tag no place carries', () => {
    // The whole rule. There is no vocabulary input — the only source is the rows themselves.
    for (const facet of tagFacets(rows(['wine'], ['brunch']), tagsOf)) {
      expect(facet.count).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a library with no tags, so the caller draws no row', () => {
    // Not a disabled row, not a placeholder: the common case, because nothing was backfilled.
    expect(tagFacets(rows([], [], []), tagsOf)).toEqual([]);
    expect(tagFacets([], tagsOf)).toEqual([]);
  });

  it('counts a place once however many times it carries one tag', () => {
    // `normalize_tag()` lowercases and trims but folds nothing else, so one row can hold two
    // spellings of one tag. `tagKey` is this codebase's single answer to "same tag?".
    const facets = tagFacets(rows(['pan asian', 'pan-asian']), tagsOf);
    expect(facets).toHaveLength(1);
    expect(facets[0]?.count).toBe(1);
  });

  it('renders the label through tagDisplayLabel rather than the stored key', () => {
    // Stored tags are lowercase keys; casing is a render concern owned by `domain/extraction/tags`.
    expect(tagFacets(rows(['late night']), tagsOf)[0]?.label).toBe('Late Night');
    // …and the stored form survives, because that is what `onToggleTag` takes.
    expect(tagFacets(rows(['late night']), tagsOf)[0]?.tag).toBe('late night');
  });

  it('breaks count ties deterministically, without asking the runtime about collation', () => {
    // This library mixes Hebrew and Latin tags. `localeCompare` would order the row differently
    // depending on the runtime's collation data — a bar that is genuinely non-deterministic.
    const facets = tagFacets(rows(['wine'], ['brunch'], ['ארוחת בוקר']), tagsOf);
    expect(facets.map((f) => f.tag)).toEqual(['brunch', 'wine', 'ארוחת בוקר']);
  });

  it('caps the row, and keeps the pressed chip inside the cap', () => {
    // A tag vocabulary is open-ended and its tail is one place per tag. The active tag is pinned
    // in wherever it ranks: a control that scrolls out of existence when you use it is the same
    // defect as one that disappears.
    const many = rows(...Array.from({ length: 20 }, (_, i) => [`tag ${String(i).padStart(2, '0')}`]));
    const capped = tagFacets(many, tagsOf);
    expect(capped).toHaveLength(MAX_TAG_FACETS);
    const rare = 'tag 19';
    expect(capped.some((f) => f.tag === rare)).toBe(false);
    const pinned = tagFacets(many, tagsOf, rare);
    expect(pinned).toHaveLength(MAX_TAG_FACETS);
    expect(pinned.some((f) => f.tag === rare)).toBe(true);
  });

  it('does not pin a tag the counted set does not contain', () => {
    // A pinned chip at a count of 0 would be a second way out of the tag filter saying nothing
    // true; `ActiveTagFilter` above the list is the one that exists for that.
    const facets = tagFacets(rows(['wine']), tagsOf, 'brunch');
    expect(facets.map((f) => f.tag)).toEqual(['wine']);
  });
});
