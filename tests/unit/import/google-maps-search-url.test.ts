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
    nameVariants: [],
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
    nameVariants: [],
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

/**
 * The defect: the review card titles itself with the shortlist row the save will write
 * (`savedPlaceName`), while this link kept searching the caption's raw string — so picking the
 * Basel branch left the `aria-label` naming Basel and the href searching Tel Aviv, on the one card
 * whose entire purpose is telling two same-named branches apart.
 */
describe('googleMapsSearchUrl — a picked shortlist row', () => {
  const queryOf = (url: string) => decodeURIComponent(new URL(url).searchParams.get('query') ?? '');

  const caption = candidate({
    rawName: 'קפה קפה',
    identifiedName: 'Cafe Cafe',
    addressHint: 'רוטשילד 12',
    cityHint: 'תל אביב',
    countryHint: 'ישראל',
    categoryHint: 'cafe',
  });

  it('searches the picked row rather than the caption', () => {
    const url = googleMapsSearchUrl(caption, { name: 'Cafe Cafe', detail: 'בזל 42, תל אביב-יפו' });

    expect(queryOf(url)).toBe('Cafe Cafe, בזל 42, תל אביב-יפו');
  });

  it('drops the caption address, area and country once a row is picked', () => {
    const url = googleMapsSearchUrl(
      candidate({ ...caption, areaHint: 'Market Row, Brixton' }),
      { name: 'La Nonna', detail: '21 Kingly St, London' },
    );
    const query = queryOf(url);

    // Keeping them would search for the place the user just rejected.
    expect(query).toBe('La Nonna, 21 Kingly St, London');
    expect(query).not.toContain('רוטשילד');
    expect(query).not.toContain('Brixton');
    expect(query).not.toContain('ישראל');
  });

  it('falls back to the caption city when the picked row has no detail at all', () => {
    const url = googleMapsSearchUrl(caption, { name: 'Cafe Cafe', detail: null });

    expect(queryOf(url)).toBe('Cafe Cafe, תל אביב');
  });

  it('does not repeat a city the picked name already carries', () => {
    const url = googleMapsSearchUrl(caption, { name: 'Cafe Cafe תל אביב', detail: null });

    expect(queryOf(url)).toBe('Cafe Cafe תל אביב');
  });

  it('is byte-for-byte the old query when nothing is picked', () => {
    expect(queryOf(googleMapsSearchUrl(caption, null))).toBe(queryOf(googleMapsSearchUrl(caption)));
    expect(queryOf(googleMapsSearchUrl(caption))).toBe('Cafe Cafe, רוטשילד 12, תל אביב, ישראל');
  });
});
