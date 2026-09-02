/**
 * The provider's own country, read back off a resolved place.
 *
 * The accessor is total and validating rather than a cast, because the value survives the trip
 * through `RankedPlace` at runtime but not in the type, and because whatever it returns is written
 * straight into `places.country_code`, whose CHECK is `^[A-Z]{2}$`.
 */

import { describe, expect, it } from 'vitest';
import { resolvedCountryCode, type ResolvedPlaceInCountry } from '@/domain/places/resolved-country';
import type { ResolvedPlace } from '@/domain/types';

function place(overrides: Partial<ResolvedPlaceInCountry> = {}): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: 'ChIJBUwxBxCVC0cRKQyDcBxzWJk',
    sourceDataset: 'google-places',
    regionId: null,
    name: 'Kus Koláče',
    altNames: [],
    providerCategory: 'bakery',
    addressLine: 'Korunní 90',
    locality: 'Praha',
    lat: 50.0752,
    lng: 14.4531,
    datasetConfidence: 0.5,
    ...overrides,
  } as ResolvedPlace;
}

describe('resolvedCountryCode', () => {
  it('reads the code a provider reported', () => {
    expect(resolvedCountryCode(place({ countryCode: 'CZ' }))).toBe('CZ');
  });

  it('is null for a provider that carries no country, rather than throwing', () => {
    // Overture and the `llm_guess` fallback both take this branch: `poi_index` has no country
    // column, so those saves keep getting the caption's country and nothing here changes that.
    expect(resolvedCountryCode(place())).toBeNull();
    expect(resolvedCountryCode(place({ countryCode: null }))).toBeNull();
  });

  it('normalises case and whitespace', () => {
    expect(resolvedCountryCode(place({ countryCode: ' il ' }))).toBe('IL');
  });

  it('refuses anything the database would refuse', () => {
    for (const bad of ['', 'Israel', 'ISR', 'I', '12']) {
      expect(resolvedCountryCode(place({ countryCode: bad }))).toBeNull();
    }
  });
});
