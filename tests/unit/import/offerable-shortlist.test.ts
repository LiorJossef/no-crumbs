/**
 * E-T1 — the review screen stops offering unrelated venues as equally likely answers.
 *
 * The scenario these tests are cut from is the reported one: a weak name plus a city hint returns
 * five bakeries in that city, the top row clears `confirmScore` (0.80) on the strength of the city
 * alone, and the band is decided on that top row only. Rows 2..5 had no floor whatsoever and were
 * handed to the picker as five equal choices.
 */

import { describe, expect, it } from 'vitest';

import { offerableOf, offerableShortlist } from '@/domain/import/offerable-shortlist';
import { deriveResolution } from '@/domain/import/pipeline';
import { chooseResolvedPlace, type StoredResolution } from '@/domain/import/resolution-record';
import { SCORING } from '@/domain/places/scoring-constants';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';
import { resolutionOptions, resolutionView } from '@/ui/import/candidate-resolution-view';

function ranked(name: string, score: number): RankedPlace {
  const place: ResolvedPlace = {
    provider: 'google',
    providerPlaceId: `g-${name}`,
    sourceDataset: 'google-places',
    regionId: null,
    name,
    altNames: [],
    providerCategory: 'bakery',
    addressLine: `${name} street`,
    locality: 'Jerusalem',
    lat: 31.78,
    lng: 35.21,
    datasetConfidence: 0.5,
  };
  return { place, score, nameScore: score, tokenCoverage: 1, categoryScore: 1 };
}

/** The reported shape: one row over the confirm gate, four unrelated rows trailing it. */
const FIVE_BAKERIES: readonly RankedPlace[] = [
  ranked('Teller Bakery', 0.84),
  ranked('Marzipan', 0.66),
  ranked('Pe er Bakery', 0.61),
  ranked('Kadosh', 0.58),
  ranked('Bread Story', 0.52),
];

function result(band: ResolveResult['confidence']['band'], shortlist: readonly RankedPlace[]): ResolveResult {
  return {
    shortlist,
    confidence: { band, score: shortlist[0]?.score ?? 0, margin: null },
    regionsSearched: [],
    candidatesPrefiltered: shortlist.length,
  };
}

const answered = (
  band: ResolveResult['confidence']['band'],
  shortlist: readonly RankedPlace[],
): StoredResolution => ({ kind: 'answered', result: result(band, shortlist) });

describe('offerableShortlist', () => {
  it('keeps only the rows within `branchGuard.rivalScoreBand` of the top', () => {
    const band = SCORING.branchGuard.rivalScoreBand;
    const kept = offerableShortlist([
      ranked('a', 0.9),
      ranked('b', 0.9 - band), // exactly on the line: kept
      ranked('c', 0.9 - band - 0.0001), // a hair past it: dropped
    ]);
    expect(kept.map((r) => r.place.name)).toEqual(['a', 'b']);
  });

  it('cuts the five Jerusalem bakeries down to the one row that scored', () => {
    expect(offerableShortlist(FIVE_BAKERIES).map((r) => r.place.name)).toEqual(['Teller Bakery']);
  });

  it('keeps the whole shortlist when the rows really are rivals', () => {
    const rivals = [ranked('Padella', 0.88), ranked('Padella Shoreditch', 0.8)];
    expect(offerableShortlist(rivals)).toHaveLength(2);
  });

  it('never empties a non-empty shortlist, and never reorders or renumbers it', () => {
    const kept = offerableShortlist(FIVE_BAKERIES);
    expect(kept.length).toBeGreaterThanOrEqual(1);
    expect(kept).toEqual(FIVE_BAKERIES.slice(0, kept.length));
  });

  it('is empty for an empty shortlist', () => {
    expect(offerableShortlist([])).toEqual([]);
    expect(offerableOf(result('no_match', []))).toEqual([]);
  });
});

describe('deriveResolution', () => {
  it('offers one option, not five, when the band is `confirm`', () => {
    const derived = deriveResolution(result('confirm', FIVE_BAKERIES));
    expect(derived.status).toBe('ambiguous');
    if (derived.status !== 'ambiguous') return;
    expect(derived.options.map((p) => p.name)).toEqual(['Teller Bakery']);
  });

  it('cuts the alternates under `preselect` the same way', () => {
    const derived = deriveResolution(result('preselect', FIVE_BAKERIES));
    expect(derived.status).toBe('resolved');
    if (derived.status !== 'resolved') return;
    expect(derived.place.name).toBe('Teller Bakery');
    expect(derived.alternates).toEqual([]);
  });

  it('still bands on the top row alone — the cut is not a second band gate', () => {
    // Only the top row survives the cut, and the band stays `confirm`: this function does not
    // promote a lone survivor to `resolved`. Deciding the band is the scorer's job.
    expect(deriveResolution(result('confirm', FIVE_BAKERIES)).status).toBe('ambiguous');
  });
});

describe('the screen and the confirm route see the same options', () => {
  it('renders one option for the five-bakery shortlist', () => {
    const view = resolutionView(answered('confirm', FIVE_BAKERIES));
    expect(view.kind).toBe('ambiguous');
    expect(resolutionOptions(view).map((o) => o.name)).toEqual(['Teller Bakery']);
  });

  it('offers the same cut list to a caller that sends no pick', () => {
    const choice = chooseResolvedPlace(answered('confirm', FIVE_BAKERIES), null);
    expect(choice.kind).toBe('choose');
    if (choice.kind !== 'choose') return;
    expect(choice.options).toHaveLength(1);
  });

  it('still honours an explicit index into the full stored shortlist', () => {
    // A pick made before the cut existed, or by a caller reading the stored record directly, is
    // the user's own evidence and is not turned into `out_of_range` by a presentation rule.
    const choice = chooseResolvedPlace(answered('confirm', FIVE_BAKERIES), 3);
    expect(choice.kind).toBe('use');
    if (choice.kind !== 'use') return;
    expect(choice.ranked.place.name).toBe('Kadosh');
  });

  it('indexes the offered options exactly as the stored shortlist does', () => {
    const rivals = [ranked('Padella', 0.88), ranked('Padella Shoreditch', 0.8), ranked('Padel Club', 0.4)];
    const view = resolutionView(answered('confirm', rivals));
    const options = resolutionOptions(view);
    expect(options.map((o) => o.index)).toEqual([0, 1]);
    for (const option of options) {
      const choice = chooseResolvedPlace(answered('confirm', rivals), option.index);
      expect(choice.kind === 'use' && choice.ranked.place.name).toBe(option.name);
    }
  });
});
