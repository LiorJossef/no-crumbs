import { describe, expect, it } from 'vitest';

import { googleMapsSearchUrl } from '@/app/import/import-page-client';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'Paradiso',
    cityHint: 'Prague',
    countryHint: null,
    categoryHint: null,
    evidence: null,
    modelConfidence: null,
    ...overrides,
  };
}

describe('googleMapsSearchUrl', () => {
  it('includes the category hint when present, to disambiguate same-name venues', () => {
    const url = googleMapsSearchUrl(candidate({ categoryHint: 'cafe' }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    // The bug: "Paradiso, Prague" surfaces an unrelated "Swingers Club Paradiso" as the top
    // match. Including the category steers Maps toward the right kind of venue.
    expect(query).toBe('Paradiso, cafe, Prague');
  });

  it('omits the category cleanly when absent, no doubled or trailing separators', () => {
    const url = googleMapsSearchUrl(candidate({ categoryHint: null }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, Prague');
  });

  it('still produces a sane query with only rawName present', () => {
    const url = googleMapsSearchUrl(candidate({ cityHint: null, countryHint: null, categoryHint: null }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso');
  });
});
