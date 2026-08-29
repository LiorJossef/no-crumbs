/**
 * `ui/place/list-scope.ts` — what the sidebar is a list *of*, and the rules allowed to change it.
 *
 * The module shipped unwired and untested (`0ce9512`), so `npm run verify` was green because
 * nothing reached it. These tests are the reachability: every row of `scopeAfterCameraSettled`'s
 * transition table, both preconditions the module says it cannot enforce, and every copy rule in
 * `scopeLabel`.
 *
 * The fixtures are the shape of the real library plus a third country, because the defect the
 * module exists to fix only appears above one country: at world zoom the map draws
 * `United Kingdom 18` and `Israel 9` and the list underneath went on saying `12 places in London`.
 * London and Bristol are two areas of one country so that the "two areas of one country on screen
 * means the country is the scope" rule has something to promote, and a countryless area exists so
 * that the rule's one exclusion has something to refuse.
 *
 * Zooms are named through `zoom-bands.ts`, never as bare numbers: the bands are the thing §2.1
 * expects to be tuned on a device, and a test that hard-coded 4.5 would pin the tuning rather than
 * the behaviour.
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity } from '@/domain/places/clusters';
import {
  AREA_BAND_MIN,
  COUNTRY_BAND_MAX,
  PIN_BAND_MIN,
  bandForZoom,
} from '@/components/map/zoom-bands';
import { buildAreas, UNNAMED_OTHER_AREA_LABEL, type Area } from '@/ui/place/active-area';
import { NO_COUNTRY_KEY, summariseByCountry, type CountrySummary } from '@/ui/place/library-summary';
import {
  GLOBAL_SCOPE,
  activeCountryKey,
  fallbackScope,
  resolveScope,
  resolveScopeOrFallback,
  sameScope,
  scopeAfterCameraSettled,
  scopeAreaId,
  scopeForAreaTap,
  scopeForCountryTap,
  scopeHeading,
  scopeLabel,
  type ListScope,
} from '@/ui/place/list-scope';
import type { ViewportBounds } from '@/ui/place/viewport';

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

/** A run of places spread over a few hundred metres, so they cluster but do not coincide. */
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
const TEL_AVIV = { lat: 32.0704, lng: 34.7796 };
/** Nowhere in particular, and deliberately unnamed: the countryless bucket of §2.5. */
const NOWHERE = { lat: 10.0, lng: 20.0 };

const londonPlaces = city('ldn', 12, LONDON, 'London', 'GB');
const bristolPlaces = city('bri', 6, BRISTOL, 'Bristol', 'GB');
const telAvivPlaces = city('tlv', 9, TEL_AVIV, 'Tel Aviv-Yafo', 'IL');
const orphanPlaces = city('orp', 2, NOWHERE, null, null);

/** The library as the page holds it: `created_at desc`. */
const library: readonly TestPlace[] = [
  ...telAvivPlaces,
  ...londonPlaces,
  ...bristolPlaces,
  ...orphanPlaces,
];

function areasOf(places: readonly TestPlace[] = library): readonly Area<TestPlace>[] {
  return buildAreas(clusterByProximity(places, projections.toPoint), projections);
}

function countriesOf(areas: readonly Area<TestPlace>[]): readonly CountrySummary<TestPlace>[] {
  return summariseByCountry(areas, toCountryCode, projections.toPoint);
}

const areas = areasOf();
const countries = countriesOf(areas);

function areaNamed(label: string | null, from: readonly Area<TestPlace>[] = areas): Area<TestPlace> {
  const found = from.find((area) => area.label === label);
  if (!found) throw new Error(`no area labelled ${String(label)}`);
  return found;
}

function countryKeyed(
  key: string,
  from: readonly CountrySummary<TestPlace>[] = countries,
): CountrySummary<TestPlace> {
  const found = from.find((country) => country.key === key);
  if (!found) throw new Error(`no country keyed ${key}`);
  return found;
}

const london = areaNamed('London');
const bristol = areaNamed('Bristol');
const telAviv = areaNamed('Tel Aviv-Yafo');
const orphan = areaNamed(null);

/** A rect around a point, in degrees — `withinBounds` takes north/south/east/west. */
function rectAround(point: { lat: number; lng: number }, spanDeg = 0.1): ViewportBounds {
  return {
    north: point.lat + spanDeg,
    south: point.lat - spanDeg,
    east: point.lng + spanDeg,
    west: point.lng - spanDeg,
  };
}

/** A rect wide enough to hold both English areas and neither of the others. */
const ENGLAND_RECT: ViewportBounds = { north: 52.4, south: 50.6, east: -0.02, west: -3.2 };

/** Zooms named by the band they belong to, resolved through the one definition of where a band
 *  starts — so tuning §2.1's numbers moves these with it. */
const ZOOM = {
  country: COUNTRY_BAND_MAX - 1,
  area: AREA_BAND_MIN + 1,
  pin: PIN_BAND_MIN + 1,
} as const;

describe('the fixtures are the shape the module is written against', () => {
  it('has four areas across two countries and a countryless bucket', () => {
    expect(areas).toHaveLength(4);
    expect(countries.map((country) => country.key)).toEqual(['GB', 'IL', NO_COUNTRY_KEY]);
    expect(countryKeyed('GB').areas.map((area) => area.label).sort()).toEqual([
      'Bristol',
      'London',
    ]);
  });

  it('names each band by `bandForZoom`, never by a literal', () => {
    expect(bandForZoom(ZOOM.country)).toBe('country');
    expect(bandForZoom(ZOOM.area)).toBe('area');
    expect(bandForZoom(ZOOM.pin)).toBe('pin');
  });
});

describe('the scope constructors and value equality', () => {
  it('freezes the one global scope, so "nothing changed" is object identity', () => {
    expect(GLOBAL_SCOPE).toEqual({ kind: 'global' });
    expect(Object.isFrozen(GLOBAL_SCOPE)).toBe(true);
  });

  it('compares by value across all three kinds', () => {
    expect(sameScope(GLOBAL_SCOPE, { kind: 'global' })).toBe(true);
    expect(sameScope(scopeForCountryTap('GB'), scopeForCountryTap('GB'))).toBe(true);
    expect(sameScope(scopeForCountryTap('GB'), scopeForCountryTap('IL'))).toBe(false);
    expect(sameScope(scopeForAreaTap(london.id), scopeForAreaTap(london.id))).toBe(true);
    expect(sameScope(scopeForAreaTap(london.id), scopeForAreaTap(bristol.id))).toBe(false);
    // Different kinds are never the same scope, whatever their payloads.
    expect(sameScope(GLOBAL_SCOPE, scopeForCountryTap('GB'))).toBe(false);
    expect(sameScope(scopeForCountryTap(london.id), scopeForAreaTap(london.id))).toBe(false);
  });
});

describe('resolveScope', () => {
  it('resolves global over the whole library, countries included', () => {
    const resolved = resolveScope(areas, countries, GLOBAL_SCOPE);
    expect(resolved?.kind).toBe('global');
    expect(resolved?.count).toBe(library.length);
    expect(resolved?.memberIds.size).toBe(library.length);
    expect(resolved?.areas).toHaveLength(4);
  });

  it('resolves global over an empty library rather than returning null', () => {
    // "Everything you saved" is a well-formed answer when the answer is nothing; the empty-library
    // screen is a different surface's job.
    const resolved = resolveScope([], [], GLOBAL_SCOPE);
    expect(resolved?.kind).toBe('global');
    expect(resolved?.count).toBe(0);
  });

  it('resolves a country to its own areas and their places', () => {
    const resolved = resolveScope(areas, countries, scopeForCountryTap('GB'));
    expect(resolved?.kind).toBe('country');
    expect(resolved?.count).toBe(18);
    expect(resolved?.areas.map((area) => area.label).sort()).toEqual(['Bristol', 'London']);
  });

  it('resolves an area by any member id and hands back its canonical scope', () => {
    const member = london.members[7];
    const resolved = resolveScope(areas, countries, scopeForAreaTap(member?.id ?? ''));
    expect(resolved?.kind).toBe('area');
    expect(resolved?.count).toBe(12);
    // Canonical form: the stored anchor was some other member, the returned scope is the area id.
    // This is what makes writing it back after a fallback converge in one render.
    expect(resolved?.scope).toEqual(scopeForAreaTap(london.id));
  });

  it('returns null for an area whose last place was deleted', () => {
    expect(resolveScope(areas, countries, scopeForAreaTap('deleted-id'))).toBeNull();
  });

  it('returns null for a country emptied by the same deletion', () => {
    const withoutIsrael = areasOf(library.filter((place) => place.countryCode !== 'IL'));
    expect(
      resolveScope(withoutIsrael, countriesOf(withoutIsrael), scopeForCountryTap('IL')),
    ).toBeNull();
  });
});

describe('fallbackScope', () => {
  it('prefers the page anchor area when it still exists', () => {
    expect(fallbackScope(areas, london.id)).toEqual(scopeForAreaTap(london.id));
  });

  it('falls back to global rather than to some other city when the anchor is gone', () => {
    // A deletion must not turn into a teleport: answering with a city the user did not ask for is
    // worse than answering with the whole library.
    expect(fallbackScope(areas, 'deleted-id')).toBe(GLOBAL_SCOPE);
    expect(fallbackScope(areas, null)).toBe(GLOBAL_SCOPE);
  });
});

describe('resolveScopeOrFallback', () => {
  it('returns the stored scope when it still resolves', () => {
    const resolved = resolveScopeOrFallback(areas, countries, scopeForCountryTap('IL'), london.id);
    expect(resolved.kind).toBe('country');
  });

  it('falls back to the preferred area when the stored scope died', () => {
    const resolved = resolveScopeOrFallback(areas, countries, scopeForAreaTap('gone'), london.id);
    expect(resolved.kind).toBe('area');
    expect(resolved.scope).toEqual(scopeForAreaTap(london.id));
  });

  it('falls back to global when the preferred area died too', () => {
    const resolved = resolveScopeOrFallback(areas, countries, scopeForAreaTap('gone'), 'also-gone');
    expect(resolved.kind).toBe('global');
    expect(resolved.count).toBe(library.length);
  });

  it('is total over an empty library', () => {
    expect(resolveScopeOrFallback([], [], scopeForAreaTap('gone'), 'gone').kind).toBe('global');
  });
});

describe('scopeAfterCameraSettled — the whole transition table', () => {
  const base = { areas, countries };

  describe('the guard row: any band, any scope, unchanged', () => {
    it('changes nothing at all when the camera moved itself', () => {
      // The precondition the module names and cannot enforce. A country tap flies the camera *and*
      // writes a country scope, so the flight that follows must not overwrite what the tap wrote —
      // and it cannot, because that flight is programmatic.
      const scope = scopeForCountryTap('GB');
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: ZOOM.country,
          userInitiated: false,
          rect: rectAround(TEL_AVIV),
        }),
      ).toBe(scope);
    });

    it('changes nothing when there is no rect yet', () => {
      const scope = scopeForAreaTap(london.id);
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: ZOOM.country,
          userInitiated: true,
          rect: null,
        }),
      ).toBe(scope);
    });

    it('changes nothing when the surface cannot report a zoom', () => {
      const scope = scopeForAreaTap(london.id);
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: null,
          userInitiated: true,
          rect: rectAround(TEL_AVIV),
        }),
      ).toBe(scope);
    });
  });

  describe('the country band', () => {
    it('leaves a global scope alone, by identity', () => {
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: GLOBAL_SCOPE,
          zoom: ZOOM.country,
          userInitiated: true,
          rect: rectAround(LONDON, 40),
        }),
      ).toBe(GLOBAL_SCOPE);
    });

    it('takes a country scope back to global — the map is drawing countries, so the list is too', () => {
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: scopeForCountryTap('GB'),
          zoom: ZOOM.country,
          userInitiated: true,
          rect: rectAround(LONDON, 40),
        }),
      ).toBe(GLOBAL_SCOPE);
    });

    it('takes an area scope back to global — this is the reported defect', () => {
      // `18 places in London` under a map showing `United Kingdom 18` and `Israel 9`.
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: scopeForAreaTap(london.id),
          zoom: ZOOM.country,
          userInitiated: true,
          rect: rectAround(LONDON, 40),
        }),
      ).toBe(GLOBAL_SCOPE);
    });
  });

  describe('leaving the country band, from global', () => {
    it('picks the area under the camera', () => {
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: GLOBAL_SCOPE,
          zoom: ZOOM.area,
          userInitiated: true,
          rect: rectAround(TEL_AVIV),
        }),
      ).toEqual(scopeForAreaTap(telAviv.id));
    });

    it('does the same in the pin band', () => {
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: GLOBAL_SCOPE,
          zoom: ZOOM.pin,
          userInitiated: true,
          rect: rectAround(LONDON),
        }),
      ).toEqual(scopeForAreaTap(london.id));
    });

    it('promotes to the country when two of its areas are on screen', () => {
      // The rule that makes the two routes to one view agree: a country tap lands inside the area
      // band by construction, so zooming manually to the same camera must produce the same heading.
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: GLOBAL_SCOPE,
          zoom: ZOOM.area,
          userInitiated: true,
          rect: ENGLAND_RECT,
        }),
      ).toEqual(scopeForCountryTap('GB'));
    });

    it('never promotes the countryless bucket, however many of its areas are on screen', () => {
      // Its areas are grouped by an admission rather than by a country, so "you are looking at two
      // of them" is not a fact about anywhere.
      const orphans = [
        ...city('o1', 2, NOWHERE, null, null),
        ...city('o2', 2, { lat: NOWHERE.lat + 1.2, lng: NOWHERE.lng }, null, null),
      ];
      const orphanAreas = areasOf(orphans);
      const orphanCountries = countriesOf(orphanAreas);
      expect(orphanAreas).toHaveLength(2);
      const both: ViewportBounds = {
        north: NOWHERE.lat + 2,
        south: NOWHERE.lat - 1,
        east: NOWHERE.lng + 2,
        west: NOWHERE.lng - 2,
      };
      const next = scopeAfterCameraSettled({
        areas: orphanAreas,
        countries: orphanCountries,
        scope: GLOBAL_SCOPE,
        zoom: ZOOM.area,
        userInitiated: true,
        rect: both,
      });
      expect(next.kind).toBe('area');
    });

    it('stays global when there are no areas at all', () => {
      expect(
        scopeAfterCameraSettled({
          areas: [],
          countries: [],
          scope: GLOBAL_SCOPE,
          zoom: ZOOM.area,
          userInitiated: true,
          rect: rectAround(LONDON),
        }),
      ).toBe(GLOBAL_SCOPE);
    });
  });

  describe('inside the area and pin bands', () => {
    it('holds a country scope across a pan, because a country is chosen and not drifted into', () => {
      const scope = scopeForCountryTap('GB');
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: ZOOM.area,
          userInitiated: true,
          rect: rectAround(TEL_AVIV),
        }),
      ).toBe(scope);
    });

    it('holds an area scope through a pan inside it, by object identity', () => {
      const scope = scopeForAreaTap(london.id);
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: ZOOM.pin,
          userInitiated: true,
          rect: rectAround(LONDON, 0.04),
        }),
      ).toBe(scope);
    });

    it('follows the user across a 50 km cluster boundary', () => {
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope: scopeForAreaTap(london.id),
          zoom: ZOOM.area,
          userInitiated: true,
          rect: rectAround(TEL_AVIV),
        }),
      ).toEqual(scopeForAreaTap(telAviv.id));
    });

    it('holds by identity when the stored anchor is a member rather than the area id', () => {
      // The anchor a finished import writes is a place id, not an area id. A settled pan inside
      // that area must not churn it into a fresh object and re-render every surface.
      const member = london.members[3];
      const scope = scopeForAreaTap(member?.id ?? '');
      expect(
        scopeAfterCameraSettled({
          ...base,
          scope,
          zoom: ZOOM.pin,
          userInitiated: true,
          rect: rectAround(LONDON, 0.04),
        }),
      ).toBe(scope);
    });
  });
});

describe('scopeLabel', () => {
  function labelOf(scope: ListScope, from = areas, within = countries): string | null {
    return scopeLabel(resolveScopeOrFallback(from, within, scope, null));
  }

  it('names an area by its own label', () => {
    expect(labelOf(scopeForAreaTap(london.id))).toBe('London');
  });

  it('leaves an unnamed area to `areaHeading`s `this area`', () => {
    expect(labelOf(scopeForAreaTap(orphan.id))).toBeNull();
  });

  it('gives `United` names the definite article', () => {
    expect(labelOf(scopeForCountryTap('GB'))).toBe('the United Kingdom');
  });

  it('leaves a name that does not need one alone', () => {
    expect(labelOf(scopeForCountryTap('IL'))).toBe('Israel');
  });

  it('articles the plurals ICU renders without one', () => {
    const dutch = areasOf(city('nl', 3, { lat: 52.37, lng: 4.9 }, 'Amsterdam', 'NL'));
    expect(labelOf(scopeForCountryTap('NL'), dutch, countriesOf(dutch))).toBe('the Netherlands');
  });

  it('articles an `Islands` name', () => {
    const cayman = areasOf(city('ky', 2, { lat: 19.3, lng: -81.4 }, 'George Town', 'KY'));
    expect(labelOf(scopeForCountryTap('KY'), cayman, countriesOf(cayman))).toBe(
      'the Cayman Islands',
    );
  });

  it('articles a `Republic` name', () => {
    const dominican = areasOf(city('do', 2, { lat: 18.48, lng: -69.9 }, 'Santo Domingo', 'DO'));
    expect(labelOf(scopeForCountryTap('DO'), dominican, countriesOf(dominican))).toBe(
      'the Dominican Republic',
    );
  });

  it('lowercases the countryless `Another area` fallback mid-sentence', () => {
    // `9 places in Another area` reads like a proper noun for a place that does not exist.
    expect(countryKeyed(NO_COUNTRY_KEY).label).toBe(UNNAMED_OTHER_AREA_LABEL);
    expect(labelOf(scopeForCountryTap(NO_COUNTRY_KEY))).toBe(
      UNNAMED_OTHER_AREA_LABEL.toLowerCase(),
    );
  });

  it('keeps the countryless label when the bucket has a real one', () => {
    // The bucket takes the first area's own name where the areas can be named at all, and that is
    // a place — so it is not lowercased.
    const named = areasOf(city('nc', 3, NOWHERE, 'Kowloon', null));
    expect(labelOf(scopeForCountryTap(NO_COUNTRY_KEY), named, countriesOf(named))).toBe('Kowloon');
  });

  it('counts the countries under a global scope', () => {
    expect(labelOf(GLOBAL_SCOPE)).toBe('3 countries');
  });

  it('names the single country instead of saying `1 country`', () => {
    const onlyUk = areasOf([...londonPlaces, ...bristolPlaces]);
    expect(labelOf(GLOBAL_SCOPE, onlyUk, countriesOf(onlyUk))).toBe('the United Kingdom');
  });

  it('says `your library` when there is nothing in it', () => {
    expect(labelOf(GLOBAL_SCOPE, [], [])).toBe('your library');
  });

  it('does not name the whole library after one countryless area', () => {
    // Found by this test, fixed in `scopeLabel`: the countryless bucket is labelled after its
    // *first* area, so the single-country shortcut read `5 places in Kowloon` over a list that
    // plainly held Osaka too.
    const unplaced = areasOf([
      ...city('kwn', 3, { lat: 22.31, lng: 114.17 }, 'Kowloon', null),
      ...city('osa', 2, { lat: 34.69, lng: 135.5 }, 'Osaka', null),
    ]);
    const buckets = countriesOf(unplaced);
    expect(unplaced).toHaveLength(2);
    expect(buckets).toHaveLength(1);
    expect(labelOf(GLOBAL_SCOPE, unplaced, buckets)).toBe('your library');
  });

  it('still names a countryless bucket that is one area, because then it speaks for all of it', () => {
    const single = areasOf(city('kwn', 3, { lat: 22.31, lng: 114.17 }, 'Kowloon', null));
    expect(labelOf(GLOBAL_SCOPE, single, countriesOf(single))).toBe('Kowloon');
  });
});

describe('scopeHeading', () => {
  const base = { searchQuery: '', tagLabel: null, matchesAnywhere: library.length };

  function headingFor(scope: ListScope, countInScope: number, extra: object = {}) {
    return scopeHeading({
      ...base,
      ...extra,
      scope: resolveScopeOrFallback(areas, countries, scope, null),
      countInScope,
    });
  }

  it('is `areaHeading` with a different `where`, not a second copy table', () => {
    expect(headingFor(scopeForCountryTap('GB'), 18).text).toBe('18 places in the United Kingdom');
    expect(headingFor(GLOBAL_SCOPE, library.length).text).toBe('29 places in 3 countries');
    expect(headingFor(scopeForAreaTap(london.id), 12).text).toBe('12 places in London');
  });

  it('keeps every harder state `areaHeading` already owns', () => {
    const nowhere = headingFor(GLOBAL_SCOPE, 0, { searchQuery: 'momos', matchesAnywhere: 0 });
    expect(nowhere.text).toBe('Nothing matches "momos"');
    expect(nowhere.escape).toBe('clear-search');

    const notHere = headingFor(scopeForCountryTap('IL'), 0, {
      searchQuery: 'momos',
      matchesAnywhere: 3,
    });
    expect(notHere.text).toBe('No matches in Israel');

    expect(headingFor(scopeForCountryTap('GB'), 7, { notBeenOnly: true }).text).toBe(
      '7 to go in the United Kingdom',
    );
  });

  it('carries the short form the peek row renders', () => {
    expect(headingFor(scopeForCountryTap('GB'), 18).shortRest).toBe('in the United Kingdom');
  });
});

describe('activeCountryKey', () => {
  function keyFor(scope: ListScope): string | null {
    return activeCountryKey(resolveScopeOrFallback(areas, countries, scope, null), countries);
  }

  it('rings nothing under a global scope', () => {
    // At world zoom with the whole library listed, no single country is the one you are in, and
    // ringing one would contradict the list directly under it.
    expect(keyFor(GLOBAL_SCOPE)).toBeNull();
  });

  it('rings the country you chose', () => {
    expect(keyFor(scopeForCountryTap('IL'))).toBe('IL');
  });

  it('rings the country the active area sits in', () => {
    expect(keyFor(scopeForAreaTap(bristol.id))).toBe('GB');
  });

  it('rings the countryless bucket for an area inside it, which is the marker that is drawn', () => {
    expect(keyFor(scopeForAreaTap(orphan.id))).toBe(NO_COUNTRY_KEY);
  });

  it('rings nothing for an area that is in no summary at all', () => {
    expect(activeCountryKey(resolveScopeOrFallback(areas, [], scopeForAreaTap(london.id), null), []))
      .toBeNull();
  });
});

describe('scopeAreaId', () => {
  function idFor(scope: ListScope): string | null {
    return scopeAreaId(resolveScopeOrFallback(areas, countries, scope, null));
  }

  it('is the area under an area scope', () => {
    expect(idFor(scopeForAreaTap(london.id))).toBe(london.id);
  });

  it('is null under a country or global scope, because several areas are listed above', () => {
    expect(idFor(scopeForCountryTap('GB'))).toBeNull();
    expect(idFor(GLOBAL_SCOPE)).toBeNull();
  });
});
