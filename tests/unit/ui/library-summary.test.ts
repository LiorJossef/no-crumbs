/**
 * `ui/place/library-summary.ts` — the country level of the library
 * (`docs/ux-library-at-scale.md` §2).
 *
 * The list no longer renders countries at all: the `Elsewhere` section that grouped the user's
 * other areas under country rows was deleted on 2026-08-30 (owner ruling; see `EverywhereElse` in
 * `place-sheet.tsx`). This computation survives it because the **map's** world-zoom band still
 * draws one marker per country, and because a country is still a scope the list can be put into by
 * tapping one. These cases moved here from `elsewhere-groups.test.ts` when that module went.
 *
 * The fixture extends the real local library — twelve places in London, nine around Tel Aviv with
 * three spellings of one city — with the two cases §2 was written for and the local data does not
 * yet contain: a country holding more than one area, and an area whose members carry no country
 * code (§2.5's two NULL rows, generalised).
 *
 * The invariant every case here exists to protect is §2.5's: **no saved place ever disappears.**
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity } from '@/domain/places/clusters';
import { buildAreas, type Area } from '@/ui/place/active-area';
import { NO_COUNTRY_KEY, summariseByCountry } from '@/ui/place/library-summary';

interface TestPlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
  readonly countryCode: string | null;
}

const projections = {
  toId: (place: TestPlace) => place.id,
  toPoint: (place: TestPlace) => ({ lat: place.lat, lng: place.lng }),
  toLocality: (place: TestPlace) => place.locality,
};

const toCountryCode = (place: TestPlace) => place.countryCode;
const toPoint = projections.toPoint;

function city(
  prefix: string,
  count: number,
  centre: { lat: number; lng: number },
  locality: string | null,
  countryCode: string | null,
): TestPlace[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    lat: centre.lat + index * 0.004,
    lng: centre.lng + index * 0.004,
    locality,
    countryCode,
  }));
}

const LONDON = { lat: 51.5119, lng: -0.1276 };
const BRISTOL = { lat: 51.4545, lng: -2.5879 };
const MANCHESTER = { lat: 53.4808, lng: -2.2426 };
const TEL_AVIV = { lat: 32.0704, lng: 34.7796 };
const NOWHERE = { lat: -22.9068, lng: -43.1729 };

const londonPlaces = city('ldn', 12, LONDON, 'London', 'GB');
const bristolPlaces = city('bri', 2, BRISTOL, 'Bristol', 'GB');
const manchesterPlaces = city('man', 3, MANCHESTER, 'Manchester', 'GB');
const telAvivPlaces = city('tlv', 9, TEL_AVIV, 'Tel Aviv-Yafo', 'IL');
/** An area whose every member lacks a country — §2.5's unflagged case, and no locality either. */
const nowherePlaces = city('nowhere', 4, NOWHERE, null, null);

const library: readonly TestPlace[] = [
  ...telAvivPlaces,
  ...londonPlaces,
  ...bristolPlaces,
  ...manchesterPlaces,
  ...nowherePlaces,
];

function areasOf(places: readonly TestPlace[] = library): readonly Area<TestPlace>[] {
  return buildAreas(clusterByProximity(places, toPoint), projections);
}

function countriesOf(places: readonly TestPlace[] = library) {
  return summariseByCountry(areasOf(places), toCountryCode, toPoint);
}

describe('summariseByCountry', () => {
  it('names countries in English from their code, and keeps the areas it was handed', () => {
    const countries = countriesOf();
    const gb = countries.find((c) => c.countryCode === 'GB');

    expect(gb?.label).toBe('United Kingdom');
    expect(gb?.count).toBe(17);
    expect(gb?.areas.map((a) => a.label).sort()).toEqual(['Bristol', 'London', 'Manchester']);
  });

  it('never loses a place: every country total sums to the library', () => {
    const total = countriesOf().reduce((sum, country) => sum + country.count, 0);
    expect(total).toBe(library.length);
  });

  it('gives the countryless bucket its own key and its area label, never an invented country', () => {
    const unflagged = countriesOf().find((c) => c.countryCode === null);

    expect(unflagged?.key).toBe(NO_COUNTRY_KEY);
    // The area has no locality either, so the honest label is the shipped "we cannot name it" one.
    expect(unflagged?.label).toBe('Another area');
    expect(unflagged?.count).toBe(4);
  });

  it('sorts the countryless bucket last however big it is', () => {
    // Ten countryless places outnumber Israel's nine, and still sort behind it.
    const heavy = [...library, ...city('void', 6, NOWHERE, null, null)];
    const codes = summariseByCountry(areasOf(heavy), toCountryCode, toPoint).map(
      (c) => c.countryCode,
    );

    expect(codes[codes.length - 1]).toBeNull();
  });
});
