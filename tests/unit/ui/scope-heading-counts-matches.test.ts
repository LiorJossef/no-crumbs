/**
 * **`15 matches in 4 countries` over matches that lie in two** (`ui/place/list-scope.ts`,
 * 2026-09-04).
 *
 * The owner's report, one surface over from the one `bc7d1ea` fixed: with the `brunch` chip on, the
 * sidebar heading counted the countries of the whole **library** while its number came from the
 * **filtered** list — and the map beside it, since `bc7d1ea`, was correctly drawing two country
 * pills. One sentence answering two questions.
 *
 * The fixture is the shape of the real local library, measured 2026-09-04: London (GB), Tel Aviv
 * and Rishon LeZion (IL), Prague (CZ) and Budapest (HU), with the brunch matches falling in Israel
 * and Hungary only. Every country here is named, because the countryless bucket already has its own
 * rule in `scopeLabel` and this test must not accidentally exercise it instead.
 *
 * `matchIds` is asserted through `scopeHeading`, the way the page reads it: the heading is the
 * sentence that was wrong, and a `scopeLabel` unit alone would pass for a rule that fixed the label
 * and left the noun or the count disagreeing with it.
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity } from '@/domain/places/clusters';
import { buildAreas, type Area } from '@/ui/place/active-area';
import { summariseByCountry, type CountrySummary } from '@/ui/place/library-summary';
import {
  GLOBAL_SCOPE,
  resolveScopeOrFallback,
  scopeForCountryTap,
  scopeHeading,
  scopeLabel,
  type ListScope,
} from '@/ui/place/list-scope';

interface TestPlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string;
  readonly countryCode: string;
  readonly brunch: boolean;
}

const projections = {
  toId: (place: TestPlace) => place.id,
  toPoint: (place: TestPlace) => ({ lat: place.lat, lng: place.lng }),
  toLocality: (place: TestPlace) => place.locality,
};

function city(
  prefix: string,
  count: number,
  centre: { lat: number; lng: number },
  locality: string,
  countryCode: string,
  brunch: number,
): TestPlace[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    lat: centre.lat + index * 0.004,
    lng: centre.lng + index * 0.004,
    locality,
    countryCode,
    brunch: index < brunch,
  }));
}

const library: readonly TestPlace[] = [
  ...city('ldn', 18, { lat: 51.4851, lng: -0.1239 }, 'London', 'GB', 0),
  ...city('tlv', 11, { lat: 32.0723, lng: 34.7712 }, 'תל אביב-יפו', 'IL', 6),
  ...city('rsn', 5, { lat: 31.9721, lng: 34.793 }, 'ראשון לציון', 'IL', 2),
  ...city('prg', 5, { lat: 50.074, lng: 14.444 }, 'Praha', 'CZ', 0),
  ...city('bud', 1, { lat: 47.4979, lng: 19.0402 }, 'Budapest', 'HU', 1),
];

const areas: readonly Area<TestPlace>[] = buildAreas(
  clusterByProximity(library, projections.toPoint),
  projections,
);
const countries: readonly CountrySummary<TestPlace>[] = summariseByCountry(
  areas,
  (place) => place.countryCode,
  projections.toPoint,
);

const brunch = library.filter((place) => place.brunch);
const brunchIds: ReadonlySet<string> = new Set(brunch.map((place) => place.id));

function headingFor(scope: ListScope, extra: object = {}): string {
  const resolved = resolveScopeOrFallback(areas, countries, scope, null);
  return scopeHeading({
    scope: resolved,
    countInScope: resolved.count,
    searchQuery: '',
    tagLabel: null,
    matchesAnywhere: library.length,
    ...extra,
  }).text;
}

describe('the heading counts the countries the filters left', () => {
  it('is the library the owner reported it over: four countries, two of them with brunch', () => {
    expect(countries).toHaveLength(4);
    expect(brunch).toHaveLength(9);
    expect(new Set(brunch.map((place) => place.countryCode))).toEqual(new Set(['IL', 'HU']));
  });

  it('says four countries when nothing is filtered', () => {
    expect(headingFor(GLOBAL_SCOPE)).toBe('40 places in 4 countries');
  });

  it("is the owner's sentence: a tag filter no longer names countries the map has dropped", () => {
    expect(
      headingFor(GLOBAL_SCOPE, {
        countInScope: brunch.length,
        tagLabel: 'brunch',
        matchesAnywhere: brunch.length,
        matchIds: brunchIds,
      }),
    ).toBe('9 matches in 2 countries');
  });

  it('names the country outright when the filters leave matches in only one', () => {
    // The single-country shortcut is not a special case for filters: `40 places in 1 country` is
    // not English anyone writes, and it is not English under a filter either.
    const israel = new Set(
      library.filter((place) => place.countryCode === 'IL').map((place) => place.id),
    );
    expect(
      headingFor(GLOBAL_SCOPE, {
        countInScope: israel.size,
        tagLabel: 'brunch',
        matchesAnywhere: israel.size,
        matchIds: israel,
      }),
    ).toBe('16 matches in Israel');
  });

  it('is unchanged for a country or an area scope, which name themselves', () => {
    // The narrowing only ever replaces the *global* label. A country scope's heading already names
    // the country it is, filtered or not.
    expect(
      headingFor(scopeForCountryTap('IL'), {
        countInScope: 8,
        tagLabel: 'brunch',
        matchesAnywhere: brunch.length,
        matchIds: brunchIds,
      }),
    ).toBe('8 matches in Israel');
  });

  it('leaves every caller that passes no ids exactly where it was', () => {
    // The default is "no narrowing", so the unfiltered library and every other surface are
    // unchanged by construction rather than by a flag.
    const resolved = resolveScopeOrFallback(areas, countries, GLOBAL_SCOPE, null);
    expect(scopeLabel(resolved)).toBe('4 countries');
    expect(scopeLabel(resolved, null)).toBe('4 countries');
    expect(scopeLabel(resolved, brunchIds)).toBe('2 countries');
  });

  it('does not let a filter reach the scope itself — narrowing may not navigate', () => {
    // The boundary `summary-matches.ts` draws for the bands, restated here because this module is
    // the one that resolves `preferredAreaId`, `defaultScope` and `initialBounds`. A heading that
    // narrowed those would let a keystroke move the camera.
    const resolved = resolveScopeOrFallback(areas, countries, GLOBAL_SCOPE, null);
    scopeHeading({
      scope: resolved,
      countInScope: brunch.length,
      searchQuery: '',
      tagLabel: 'brunch',
      matchesAnywhere: brunch.length,
      matchIds: brunchIds,
    });
    // Narrowed rather than asserted-through: `countries` lives only on the global arm, and the
    // point of this test is that the *global* resolution is untouched by the filter.
    if (resolved.kind !== 'global') throw new Error(`expected a global scope, got ${resolved.kind}`);
    expect(resolved.countries).toHaveLength(4);
    expect(resolved.areas).toHaveLength(areas.length);
    expect(resolved.count).toBe(library.length);
  });
});
