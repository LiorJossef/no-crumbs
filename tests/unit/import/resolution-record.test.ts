/**
 * `chooseResolvedPlace` — the band policy, and the one place it lives.
 *
 * The route tests exercise this through HTTP; these pin the decision itself, because it is the rule
 * that decides whether a saved coordinate is an Overture row (measured 11 m from the venue for
 * "HaKosem") or the model's own guess (555 m and 483 m out on two runs of the same caption). Getting
 * it wrong in the permissive direction is worse than not resolving at all: a confidently wrong pin
 * is indistinguishable from a right one on a map.
 */
import { describe, expect, it } from 'vitest';

import { chooseResolvedPlace, type StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';

function place(name: string, lat: number): ResolvedPlace {
  return {
    provider: 'overture',
    providerPlaceId: `gers-${name}`,
    sourceDataset: 'overture-places',
    regionId: 'tlv',
    name,
    altNames: [],
    providerCategory: 'falafel_shop',
    addressLine: null,
    locality: 'Tel Aviv',
    lat,
    lng: 34.77,
    datasetConfidence: 0.87,
  };
}

function ranked(name: string, lat: number, score: number): RankedPlace {
  return { place: place(name, lat), score, nameScore: 0.9, tokenCoverage: 1, categoryScore: 1 };
}

function answered(
  band: ResolveResult['confidence']['band'],
  shortlist: readonly RankedPlace[],
): StoredResolution {
  return {
    kind: 'answered',
    result: {
      shortlist,
      confidence: { band, score: shortlist[0]?.score ?? 0, margin: band === 'preselect' ? 0.4 : 0.01 },
      regionsSearched: ['tlv'],
      candidatesPrefiltered: 20,
    },
  };
}

const TOP = ranked('HaKosem Falafel', 32.07515, 0.93);
const SECOND = ranked('HaKosem Jaffa', 32.05, 0.9);

describe('chooseResolvedPlace', () => {
  it('auto-accepts the top entry of a preselect band', () => {
    // Measured on 14 adjudicated Tel Aviv cases: every `preselect` result was correct, zero false
    // auto-accepts. Refusing to use the band would leave the product on model guesses.
    expect(chooseResolvedPlace(answered('preselect', [TOP, SECOND]), null)).toEqual({
      kind: 'use',
      ranked: TOP,
    });
  });

  it('refuses to auto-accept a confirm band, and offers the options instead', () => {
    const choice = chooseResolvedPlace(answered('confirm', [TOP, SECOND]), null);

    expect(choice.kind).toBe('choose');
    // The shortlist is real information; it is just not permission to pick for the user.
    expect(choice.kind === 'choose' && choice.options).toHaveLength(2);
  });

  it('honours an explicit pick under either band', () => {
    expect(chooseResolvedPlace(answered('confirm', [TOP, SECOND]), 1)).toEqual({
      kind: 'use',
      ranked: SECOND,
    });
    // A pick under `preselect` too: the top entry is a default, not a verdict, and a user who read
    // the shortlist is better evidence than the scorer.
    expect(chooseResolvedPlace(answered('preselect', [TOP, SECOND]), 1)).toEqual({
      kind: 'use',
      ranked: SECOND,
    });
  });

  it('reports an out-of-range pick rather than clamping to the top entry', () => {
    // A clamp would turn "the client asked for the wrong thing" into "the server saved a different
    // place than the user picked", which is the failure mode with no visible symptom.
    expect(chooseResolvedPlace(answered('preselect', [TOP]), 3)).toEqual({ kind: 'out_of_range' });
    expect(chooseResolvedPlace(answered('preselect', [TOP]), 1)).toEqual({ kind: 'out_of_range' });
  });

  it('chooses nothing for a no_match, a failed lookup, a capped candidate or an absent record', () => {
    expect(chooseResolvedPlace(answered('no_match', []), null)).toEqual({ kind: 'none' });
    expect(chooseResolvedPlace({ kind: 'failed', reason: 'timed_out' }, null)).toEqual({ kind: 'none' });
    expect(chooseResolvedPlace({ kind: 'capped' }, null)).toEqual({ kind: 'none' });
    // `null` = never asked. Same save outcome as "asked and found nothing", different meaning, and
    // the two are kept apart in the record even though they converge here.
    expect(chooseResolvedPlace(null, null)).toEqual({ kind: 'none' });
  });

  it('rejects a pick against a record that has no options', () => {
    // Not a silent no-op: the client asked for option 0 of something with no options, which means
    // it is reading a different row than the server is.
    expect(chooseResolvedPlace(null, 0)).toEqual({ kind: 'out_of_range' });
    expect(chooseResolvedPlace({ kind: 'capped' }, 0)).toEqual({ kind: 'out_of_range' });
    expect(chooseResolvedPlace(answered('no_match', []), 0)).toEqual({ kind: 'out_of_range' });
  });

  it('does not preselect an empty shortlist even if the band says so', () => {
    // A real resolver cannot produce this (there is nothing to preselect), but a corrupted row or a
    // fake port can, and "band says preselect" must never be enough on its own.
    expect(chooseResolvedPlace(answered('preselect', []), null)).toEqual({ kind: 'none' });
  });
});
