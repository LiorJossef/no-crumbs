/**
 * `domain/import/saved-place-enrichment.ts` — what reaches `saved_places.tags` / `.why_go` /
 * `.dishes`, and what deliberately does not.
 */
import { describe, expect, it } from 'vitest';

import { deriveSavedPlaceEnrichment } from '@/domain/import/saved-place-enrichment';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'La Nonna',
    cityHint: 'London',
    countryHint: 'United Kingdom',
    areaHint: 'Market Row',
    categoryHint: 'restaurant',
    addressHint: null,
    evidence: 'La Nonna in Market Row, Brixton',
    modelConfidence: 0.95,
    identifiedName: 'La Nonna',
    nameVariants: [],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: { lat: 51.4619, lng: -0.1145 },
    ...overrides,
  };
}

describe('deriveSavedPlaceEnrichment', () => {
  it('carries tags, dishes and the model sentence', () => {
    const result = deriveSavedPlaceEnrichment(
      candidate({
        tags: ['italian', 'hidden gem'],
        dishes: ['cacio e pepe'],
        whyGo: { text: 'Tiny Italian counter tucked inside a Brixton market row.', groundedIn: 'in Market Row' },
      }),
    );

    expect(result).toEqual({
      tags: ['italian', 'hidden gem'],
      dishes: ['cacio e pepe'],
      whyGo: 'Tiny Italian counter tucked inside a Brixton market row.',
    });
  });

  it('does not persist whyGo.groundedIn anywhere', () => {
    // Owner ruling, 2026-08-27, after security review: `groundedIn` is a **gate**, not a column.
    // `extraction/grounding.ts` has already used it to null any unlicensed `whyGo` before storage is
    // reached. It is deliberately not remapped onto `saved_places.extracted_reason`, which stays
    // browser-writable (`current-state.md` §3.4) — putting a verbatim third-party quote in a
    // forgeable column, rendered beside a real creator handle, would be strictly worse than the
    // paraphrase that sits there now. See `candidate-place.ts`'s `extractedReason`.
    const groundedIn = 'a verbatim caption fragment nobody may forge';
    const result = deriveSavedPlaceEnrichment(
      candidate({ whyGo: { text: 'The model wrote this sentence.', groundedIn } }),
    );

    expect(JSON.stringify(result)).not.toContain(groundedIn);
    expect(result?.whyGo).toBe('The model wrote this sentence.');
  });

  it('returns null when the caption supported nothing — a normal outcome, not a failure', () => {
    // The commonest v2 result on a bare caption. `null` is what tells the store not to call the
    // writer at all: three null arguments would be a no-op UPDATE.
    expect(deriveSavedPlaceEnrichment(candidate())).toBeNull();
  });

  it('converts an empty list to null, because the column has exactly one empty state', () => {
    // `0019`'s normalising trigger collapses `'{}'` to NULL and its header names two spellings of
    // "no labels" as the bug it is avoiding. The conversion happens here, once.
    const result = deriveSavedPlaceEnrichment(candidate({ tags: ['matcha'] }));
    expect(result).toEqual({ tags: ['matcha'], dishes: null, whyGo: null });
  });

  it('is derived from the candidate alone — there is no parameter a request could reach', () => {
    // Structural, not behavioural, and that is the point: `deriveSavedPlaceEnrichment` takes one
    // argument, the candidate the server read out of its own `extractions` row. The same invariant
    // `candidate-place.ts` restored for `places`, applied to the columns `0019` added.
    expect(deriveSavedPlaceEnrichment).toHaveLength(1);
  });
});
