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
    areaHint: null,
    tags: [],
    dishes: [],
    whyGo: null,
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

  it('does not duplicate the city when addressHint already ends with it', () => {
    // Regression: caption "📍חצר השוק 6, רעננה" produced addressHint "חצר השוק 6, רעננה" and
    // cityHint "רעננה", which previously yielded "..., חצר השוק 6, רעננה, רעננה, ...".
    const url = googleMapsSearchUrl(
      candidate({
        rawName: 'Deli Kazan',
        addressHint: 'חצר השוק 6, רעננה',
        cityHint: 'רעננה',
        countryHint: 'ישראל',
      }),
    );
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Deli Kazan, חצר השוק 6, רעננה, ישראל');
  });

  it('still appends cityHint when addressHint does not already contain it', () => {
    const url = googleMapsSearchUrl(
      candidate({ addressHint: '12 Rothschild Blvd', cityHint: 'Prague' }),
    );
    const query = decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

    expect(query).toBe('Paradiso, 12 Rothschild Blvd, Prague');
  });
});

/**
 * Extraction v2 moved locational detail **out of the venue name on purpose** — v1 emitted
 * `identifiedName: "La Nonna Brixton"` and this query inherited the area for free. Measured on the
 * real stored v2 extraction: `addressHint` is null on all eight London candidates and every
 * locational detail lives in `areaHint`. Without `areaHint` in the query, the field-discipline fix
 * would have made this link strictly worse than before — and it is currently the product's only
 * mitigation for a model-guessed coordinate.
 */
describe('googleMapsSearchUrl — areaHint (schema v2)', () => {
  const base = {
    rawName: 'La Nonna',
    identifiedName: 'La Nonna',
    cityHint: 'London',
    countryHint: 'GB',
    categoryHint: 'restaurant',
    addressHint: null,
    areaHint: 'Market Row, Brixton',
    evidence: null,
    coordinates: null,
    modelConfidence: 0,
    tags: [],
    dishes: [],
    whyGo: null,
  } as unknown as PlaceCandidate;

  const queryOf = (c: PlaceCandidate) =>
    decodeURIComponent(googleMapsSearchUrl(c).split('query=')[1] as string);

  it('carries the area the caption named, which v1 got via the welded name', () => {
    expect(queryOf(base)).toBe('La Nonna, restaurant, Market Row, Brixton, London, GB');
  });

  it('does not repeat an area the name already contains', () => {
    const c = { ...base, rawName: 'Kiaans Tooting', identifiedName: 'Kiaans Tooting', areaHint: 'Tooting' };
    expect(queryOf(c as PlaceCandidate)).not.toContain('Tooting, Tooting');
  });

  it('prefers a street address and does not stack a redundant area behind it', () => {
    const c = { ...base, addressHint: '12 Market Row, Brixton', areaHint: 'Market Row, Brixton' };
    expect(queryOf(c as PlaceCandidate)).toBe('La Nonna, 12 Market Row, Brixton, London, GB');
  });

  it('drops the city when the area already names it', () => {
    const c = { ...base, areaHint: 'Soho, London' };
    expect(queryOf(c as PlaceCandidate)).toBe('La Nonna, restaurant, Soho, London, GB');
  });

  it('is unchanged for a candidate with no area', () => {
    const c = { ...base, areaHint: null };
    expect(queryOf(c as PlaceCandidate)).toBe('La Nonna, restaurant, London, GB');
  });
});
