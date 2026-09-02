/**
 * The provider's country reaches the database, on both save paths.
 *
 * Lane A (`7e27ad9`) made the Google adapter read the `country` address component — whose
 * `shortText` **is** the ISO-3166-1 alpha-2 code — and carried it on the `ResolvedPlaceInCountry`
 * seam. It left the two consumers, because both are lane H's files. Without them the value was
 * carried and never read, and `places.country_code` stayed NULL exactly as before.
 *
 * That NULL is not cosmetic. Round-3 feedback §3.1 is a countryless `חיפה` rendering as a peer of
 * `Israel` in the map's area list, and `/profile` counting countries off the same column.
 *
 * Two call sites, and they are deliberately different:
 *
 *  - `derivePlaceSave` has a caption to fall back to, so the provider wins and the caption's guess
 *    survives underneath it;
 *  - `POST /api/imports/place-search` has no extraction at all, so it hard-coded `null` on **every**
 *    search-then-save. There is nothing to fall back to and nothing to lose.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { derivePlaceSave } from '@/domain/import/candidate-place';
import { resolvedCountryCode } from '@/domain/places/resolved-country';
import type { PlaceCandidate, RankedPlace, ResolvedPlace } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'Kro Kafe',
    identifiedName: null,
    cityHint: 'Prague',
    countryHint: 'Israel', // deliberately wrong, so "the provider wins" is provable
    categoryHint: 'cafe',
    addressHint: null,
    coordinates: { lat: 50.087, lng: 14.42 },
    modelConfidence: 0.9,
    evidence: null,
    ...overrides,
  } as PlaceCandidate;
}

function resolved(place: Partial<ResolvedPlace> & { countryCode?: string | null }): RankedPlace {
  return {
    place: {
      provider: 'google',
      providerPlaceId: 'ChIJkro',
      sourceDataset: 'google-places',
      regionId: null,
      name: 'Kro Kafe',
      altNames: [],
      providerCategory: 'cafe',
      addressLine: 'Husitská 66',
      locality: null,
      lat: 50.0874,
      lng: 14.4203,
      datasetConfidence: 0.5,
      ...place,
    } as ResolvedPlace,
    score: 0.91,
    nameScore: 1,
    tokenCoverage: 1,
    categoryScore: 1,
  };
}

describe('derivePlaceSave — the provider’s country beats the caption’s', () => {
  it('writes what the provider said, not what the caption guessed', () => {
    const outcome = derivePlaceSave(candidate(), resolved({ countryCode: 'CZ' }));
    expect(outcome.kind).toBe('save');
    if (outcome.kind !== 'save') return;
    expect(outcome.place.countryCode).toBe('CZ');
  });

  it('normalises a lowercase provider code rather than rejecting it', () => {
    const outcome = derivePlaceSave(candidate(), resolved({ countryCode: 'cz' }));
    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.countryCode).toBe('CZ');
  });

  it('falls back to the caption when the provider states no country', () => {
    const outcome = derivePlaceSave(candidate(), resolved({ countryCode: null }));
    if (outcome.kind !== 'save') throw new Error('expected a save');
    // `toCountryCode('Israel')` — the pre-existing caption path, untouched by this change.
    expect(outcome.place.countryCode).toBe('IL');
  });

  it('falls back rather than sending a value the database would reject', () => {
    // `places_country_code_check` is `^[A-Z]{2}$`. A country *name*, a three-letter code or an
    // empty string must never reach it: `resolvedCountryCode` is total and validating precisely so
    // no call site has to remember that.
    for (const bad of ['Czechia', 'CZE', '', '  ', 'C']) {
      const outcome = derivePlaceSave(candidate(), resolved({ countryCode: bad }));
      if (outcome.kind !== 'save') throw new Error('expected a save');
      expect(outcome.place.countryCode).toBe('IL');
    }
    // And with nothing in the caption either, it is null — never a guess.
    const outcome = derivePlaceSave(
      candidate({ countryHint: null }),
      resolved({ countryCode: 'CZE' }),
    );
    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.countryCode).toBeNull();
  });

  it('leaves the llm_guess path on the caption, which is all it has', () => {
    const outcome = derivePlaceSave(candidate(), null);
    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.provider).toBe('llm_guess');
    expect(outcome.place.countryCode).toBe('IL');
  });

  it('reads the country through the one validated accessor, never a cast of its own', () => {
    const SRC = readFileSync('src/domain/import/candidate-place.ts', 'utf8');
    expect(SRC).toContain('resolvedCountryCode(place) ?? countryCode');
    expect(SRC).not.toMatch(/as Partial<ProviderCountry>/);
  });
});

describe('the place-search route no longer hard-codes a null country', () => {
  const SRC = readFileSync('src/app/api/imports/place-search/route.ts', 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('passes the provider’s country to confirmPlace', () => {
    expect(CODE).toContain('countryCode: resolvedCountryCode(chosen.place)');
    expect(CODE).not.toContain('countryCode: null');
  });

  it('and that accessor still returns null for a provider that states nothing', () => {
    // The behaviour the route inherits: the old hard-coded `null` is still what a countryless
    // provider produces, reached honestly rather than asserted.
    expect(resolvedCountryCode({ name: 'x' } as unknown as ResolvedPlace)).toBeNull();
  });
});
