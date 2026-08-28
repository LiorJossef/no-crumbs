/**
 * Provenance through the confirm path — the invariant that a saved row says where its coordinate
 * actually came from.
 *
 * This file exists because of a real defect, found by importing a real TikTok and reading the row
 * back rather than by any test that was green at the time (2026-08-28). `Oscar's` resolved
 * correctly through Google, the review screen showed `Oscar's @ נחלת בנימין 68`, and `places` got
 * a `llm-guess` row at the model's own coordinate. Two independent causes, both silent:
 *
 *  1. `StoredResolvedPlaceSchema` listed three providers and `'google'` was not among them, so the
 *     stored resolution failed to parse, `chooseResolvedPlace` saw `null`, and the save fell
 *     through to the model-guess path with no error raised anywhere.
 *  2. `derivePlaceSave` hardcoded `provider: 'overture'` for *any* resolved place. Correct while
 *     Overture was the only resolver; a provenance lie the moment a second one existed — it would
 *     have filed a Google coordinate under Overture's licence, which is precisely what
 *     `source_dataset` exists to prevent (`06` §11 Q2), and what the 30-day cache rule on Google
 *     coordinates (§5.4) makes load-bearing rather than cosmetic.
 *
 * Both failure modes are silent by construction, so they need assertions rather than vigilance.
 */

import { describe, expect, it } from 'vitest';

import { derivePlaceSave } from '@/domain/import/candidate-place';
import { StoredResolutionSchema } from '@/domain/import/resolution-record';
import type { PlaceCandidate, RankedPlace, ResolvedPlace } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: "Oscar's",
    identifiedName: null,
    cityHint: 'תל אביב',
    countryHint: 'Israel',
    categoryHint: 'restaurant',
    addressHint: 'נחלת בנימין 68',
    coordinates: { lat: 32.0645, lng: 34.7735 },
    modelConfidence: 0.9,
    evidence: null,
    ...overrides,
  } as PlaceCandidate;
}

function resolved(place: Partial<ResolvedPlace>): RankedPlace {
  return {
    place: {
      provider: 'google',
      providerPlaceId: 'ChIJoscars',
      sourceDataset: 'google-places',
      regionId: null,
      name: "Oscar's",
      altNames: [],
      providerCategory: 'restaurant',
      addressLine: 'נחלת בנימין 68',
      locality: 'תל אביב-יפו',
      lat: 32.06588,
      lng: 34.77137,
      datasetConfidence: 0.5,
      ...place,
    },
    score: 0.96,
    nameScore: 1,
    tokenCoverage: 1,
    categoryScore: 1,
  };
}

describe('derivePlaceSave — a saved row states its real provenance', () => {
  it('carries the provider that actually resolved it, not a constant', () => {
    const outcome = derivePlaceSave(candidate(), resolved({}));

    expect(outcome.kind).toBe('save');
    if (outcome.kind !== 'save') return;
    expect(outcome.place.provider).toBe('google');
    expect(outcome.place.sourceDataset).toBe('google-places');
    // The resolver's coordinate, never the model's — that is what resolving is for.
    expect(outcome.place.lat).toBeCloseTo(32.06588, 5);
    expect(outcome.place.lng).toBeCloseTo(34.77137, 5);
  });

  it('still writes Overture provenance for an Overture resolution', () => {
    const outcome = derivePlaceSave(
      candidate(),
      resolved({
        provider: 'overture',
        sourceDataset: 'overture-places',
        providerPlaceId: 'gers-123',
        regionId: 'tlv',
        datasetConfidence: 0.91,
      }),
    );

    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.provider).toBe('overture');
    expect(outcome.place.sourceDataset).toBe('overture-places');
    expect(outcome.place.regionId).toBe('tlv');
  });

  it('marks an unresolved save as the guess it is', () => {
    const outcome = derivePlaceSave(candidate(), null);

    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.provider).toBe('llm_guess');
    expect(outcome.place.sourceDataset).toBe('llm-guess');
    expect(outcome.place.resolutionScore).toBeNull();
    expect(outcome.place.lat).toBeCloseTo(32.0645, 5);
  });
});

describe('the stored-resolution schema admits every provider the resolver can return', () => {
  // The regression is silent: an unparsed resolution is indistinguishable from no resolution, and
  // the confirm step saves the model's guess without complaining. So this asserts the union
  // directly rather than trusting that whoever adds the next provider remembers this file.
  const providers = [
    ['overture', 'overture-places'],
    ['nominatim', 'osm-nominatim'],
    ['google', 'google-places'],
  ] as const;

  for (const [provider, sourceDataset] of providers) {
    it(`parses a stored ${provider} resolution`, () => {
      const stored = {
        kind: 'answered',
        result: {
          shortlist: [
            {
              place: {
                provider,
                providerPlaceId: 'id-1',
                sourceDataset,
                regionId: null,
                name: "Oscar's",
                altNames: [],
                providerCategory: 'restaurant',
                addressLine: 'נחלת בנימין 68',
                locality: 'תל אביב-יפו',
                lat: 32.06588,
                lng: 34.77137,
                datasetConfidence: 0.5,
              },
              score: 0.96,
              nameScore: 1,
              tokenCoverage: 1,
              categoryScore: 1,
            },
          ],
          confidence: { band: 'preselect', score: 0.96, margin: null },
          regionsSearched: ['global'],
          candidatesPrefiltered: 1,
        },
      };

      const parsed = StoredResolutionSchema.safeParse(stored);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    });
  }
});
