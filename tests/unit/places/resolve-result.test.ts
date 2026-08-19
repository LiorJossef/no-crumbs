import { describe, expect, it } from 'vitest';

import { regionLoaded, topMatch } from '@/domain/places/resolve-result';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';

const AFURI: ResolvedPlace = {
  provider: 'overture',
  providerPlaceId: '08f2f5a2c1b3d4e5',
  sourceDataset: 'overture-places',
  regionId: 'tyo',
  name: 'AFURI Harajuku',
  altNames: [],
  providerCategory: 'ramen_restaurant',
  addressLine: '1-1-7 Jingumae',
  locality: 'Shibuya',
  lat: 35.6702,
  lng: 139.7027,
  datasetConfidence: 0.5,
};

const ranked = (place: ResolvedPlace, score: number): RankedPlace => ({
  place,
  score,
  nameScore: score,
  tokenCoverage: score,
  categoryScore: 1,
});

const result = (over: Partial<ResolveResult>): ResolveResult => ({
  shortlist: [],
  confidence: { band: 'no_match', score: 0, margin: null },
  regionsSearched: [],
  candidatesPrefiltered: 0,
  ...over,
});

describe('regionLoaded', () => {
  it('is false when nothing was searched — the "we do not have Lisbon yet" case', () => {
    expect(regionLoaded(result({ regionsSearched: [] }))).toBe(false);
  });

  it('is true whenever at least one loaded region was searched, match or no match', () => {
    expect(regionLoaded(result({ regionsSearched: ['tyo'] }))).toBe(true);
    expect(regionLoaded(result({ regionsSearched: ['tlv', 'tyo', 'ldn'] }))).toBe(true);
  });

  it('distinguishes "searched and found nothing" from "searched nowhere"', () => {
    // Both have an empty shortlist. Only one of them is an honest "not found".
    const searched = result({ regionsSearched: ['ldn'], candidatesPrefiltered: 12 });
    const unsearched = result({ regionsSearched: [] });
    expect(searched.shortlist).toEqual(unsearched.shortlist);
    expect(regionLoaded(searched)).not.toBe(regionLoaded(unsearched));
  });
});

describe('topMatch', () => {
  it('is null for an empty shortlist rather than undefined', () => {
    expect(topMatch(result({}))).toBeNull();
  });

  it('is the first, best-ranked entry', () => {
    const r = result({
      shortlist: [ranked(AFURI, 0.94), ranked({ ...AFURI, providerPlaceId: 'b' }, 0.938)],
      confidence: { band: 'confirm', score: 0.94, margin: 0.002 },
      regionsSearched: ['tyo'],
      candidatesPrefiltered: 41,
    });
    expect(topMatch(r)?.score).toBe(0.94);
  });
});
