/**
 * `buildResolveQuery` is the single seam where a `PlaceCandidate` becomes a `ResolveQuery`, and it
 * is exported precisely so the streamed pipeline and `/api/imports/probe` cannot drift apart. The
 * bilingual terms (TLV-BILING-1) are composed there for the same reason, so this is where that
 * composition is pinned.
 */
import { describe, expect, it } from 'vitest';

import { buildResolveQuery } from '@/domain/import/pipeline';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'קוהי',
    cityHint: 'תל אביב',
    countryHint: null,
    areaHint: null,
    categoryHint: 'cafe',
    addressHint: 'בן יהודה 155',
    evidence: 'קוהי',
    modelConfidence: 0.9,
    identifiedName: 'קוהי',
    nameVariants: ['Kohi'],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
    ...overrides,
  };
}

describe('buildResolveQuery — bilingual terms', () => {
  it('carries the Latin variant through so a Hebrew caption can reach a Latin-named row', () => {
    expect(buildResolveQuery(candidate(), null).textVariants).toEqual(['Kohi']);
  });

  it('never repeats `text` as a variant', () => {
    // The common real shape: the model echoes the caption into `identifiedName`. Re-querying the
    // string the scorer already scores would spend a prefilter arm to re-fetch the same rows.
    const q = buildResolveQuery(candidate({ identifiedName: 'קוהי', nameVariants: ['קוהי', 'Kohi'] }), null);
    expect(q.textVariants).toEqual(['Kohi']);
  });

  it('includes `identifiedName` when it genuinely differs, ahead of the model variants', () => {
    const q = buildResolveQuery(
      candidate({ rawName: 'WOW', identifiedName: 'WOW Cookie Dough', nameVariants: ['וואו'] }),
      null,
    );
    expect(q.textVariants).toEqual(['WOW Cookie Dough', 'וואו']);
  });

  it('drops blanks and nulls rather than querying an empty string', () => {
    const q = buildResolveQuery(candidate({ identifiedName: null, nameVariants: ['   ', 'Kohi'] }), null);
    expect(q.textVariants).toEqual(['Kohi']);
  });

  it('de-duplicates case-insensitively but keeps punctuation-only differences', () => {
    // `normalise()` would fold these together. It is the resolver's function and it strips
    // punctuation; two spellings that differ by an apostrophe are still worth two retrieval terms,
    // because over-keeping costs one prefilter arm and over-dropping costs a venue we cannot reach.
    const q = buildResolveQuery(
      candidate({ rawName: 'Oscar', identifiedName: "Oscar's", nameVariants: ['OSCARS', 'Oscars'] }),
      null,
    );
    expect(q.textVariants).toEqual(["Oscar's", 'OSCARS']);
  });

  it('is an empty list, not undefined, when the model offered nothing', () => {
    const q = buildResolveQuery(candidate({ identifiedName: null, nameVariants: [] }), null);
    expect(q.textVariants).toEqual([]);
  });

  it('leaves the rest of the query untouched', () => {
    const q = buildResolveQuery(candidate(), 'תל אביב');
    expect(q.text).toBe('קוהי');
    expect(q.addressHint).toBe('בן יהודה 155');
    expect(q.categoryHint).toBe('cafe');
  });
});
