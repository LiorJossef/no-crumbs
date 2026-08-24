import { describe, expect, it } from 'vitest';

import { googleMapsSearchUrl } from '@/domain/places/google-maps-search-url';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'Paradiso',
    cityHint: 'Prague',
    countryHint: null,
    categoryHint: null,
    evidence: null,
    modelConfidence: null,
    addressHint: null,
    identifiedName: null,
    coordinates: null,
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

  it('prefers identifiedName over rawName when the model identified a real venue', () => {
    const url = googleMapsSearchUrl(
      candidate({ identifiedName: 'Paradiso Matcha Bar', categoryHint: 'cafe' }),
    );
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso Matcha Bar, cafe, Prague');
  });

  it('falls back to rawName when identifiedName is null', () => {
    const url = googleMapsSearchUrl(candidate({ identifiedName: null }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, Prague');
  });

  it('includes countryHint alongside cityHint when both are present', () => {
    const url = googleMapsSearchUrl(candidate({ countryHint: 'Czech Republic' }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, Prague, Czech Republic');
  });

  it('prefers addressHint over categoryHint when both are present', () => {
    const url = googleMapsSearchUrl(
      candidate({ addressHint: '12 Rothschild Blvd', categoryHint: 'restaurant' }),
    );
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    // The bug this guards against: "Ragazzi, restaurant, Tel Aviv" can surface an unrelated
    // same-named pizzeria also in Tel Aviv. The explicit street address is the stronger signal.
    expect(query).toBe('Paradiso, 12 Rothschild Blvd, Prague');
  });

  it('falls back to categoryHint when addressHint is null', () => {
    const url = googleMapsSearchUrl(candidate({ addressHint: null, categoryHint: 'cafe' }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, cafe, Prague');
  });

  it('falls back to categoryHint when addressHint is blank', () => {
    const url = googleMapsSearchUrl(candidate({ addressHint: '   ', categoryHint: 'cafe' }));
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, cafe, Prague');
  });
});
