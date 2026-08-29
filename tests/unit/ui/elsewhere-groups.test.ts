/**
 * `ui/place/library-summary.ts` and `ui/place/elsewhere-groups.ts` — the country level of the
 * library, as the `Elsewhere` section renders it (`docs/ux-library-at-scale.md` §2.6).
 *
 * The fixture extends the real local library — twelve places in London, nine around Tel Aviv with
 * three spellings of one city — with the two cases §2 was written for and the local data does not
 * yet contain: a country holding more than one area (so a *group* exists at all), and an area whose
 * members carry no country code (§2.5's two NULL rows, generalised).
 *
 * The invariant every case here exists to protect is §2.5's: **no saved place ever disappears.**
 */

import { describe, expect, it } from 'vitest';

import { clusterByProximity } from '@/domain/places/clusters';
import { buildAreas, type Area } from '@/ui/place/active-area';
import {
  countryGroupAccessibleName,
  elsewhereGroups,
  isCountryExpanded,
} from '@/ui/place/elsewhere-groups';
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

const allIds = (places: readonly TestPlace[] = library) => new Set(places.map((p) => p.id));

const areaIdNamed = (label: string, places: readonly TestPlace[] = library): string => {
  const found = areasOf(places).find((area) => area.label === label);
  if (!found) throw new Error(`no area labelled ${label}`);
  return found.id;
};

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

describe('elsewhereGroups', () => {
  it('makes a country with two or more remaining areas a group, and one with a single area a row', () => {
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds());

    const uk = entries.find((e) => e.kind === 'country');
    expect(uk?.kind === 'country' && uk.label).toBe('United Kingdom');
    // London is the active area, so the group counts Bristol and Manchester only.
    expect(uk?.kind === 'country' && uk.count).toBe(5);
    expect(uk?.kind === 'country' && uk.areas.map((a) => a.label)).toEqual([
      'Manchester',
      'Bristol',
    ]);

    // Israel has exactly one area, so it is one row named for the area — never a group of one.
    const israel = entries.find((e) => e.kind === 'area' && e.countryCode === 'IL');
    expect(israel?.kind === 'area' && israel.row.label).toBe('Tel Aviv-Yafo');
  });

  it('collapses a country to a single row once the active area leaves it with one (rule 1)', () => {
    const withoutManchester = library.filter((place) => !place.id.startsWith('man'));
    const entries = elsewhereGroups(
      countriesOf(withoutManchester),
      { activeAreaId: areaIdNamed('London', withoutManchester) },
      allIds(withoutManchester),
    );

    expect(entries.some((e) => e.kind === 'country')).toBe(false);
    const bristol = entries.find((e) => e.kind === 'area' && e.countryCode === 'GB');
    expect(bristol?.kind === 'area' && bristol.row.label).toBe('Bristol');
    expect(bristol?.kind === 'area' && bristol.row.count).toBe(2);
  });

  it('expands the active area’s own country by default, and nothing else', () => {
    const inLondon = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds());
    const uk = inLondon.find((e) => e.kind === 'country');
    expect(uk?.kind === 'country' && uk.expandedByDefault).toBe(true);

    const inTelAviv = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('Tel Aviv-Yafo') }, allIds());
    const ukFromAbroad = inTelAviv.find((e) => e.kind === 'country');
    expect(ukFromAbroad?.kind === 'country' && ukFromAbroad.expandedByDefault).toBe(false);
  });

  it('also expands the country you came from, so the way back is one tap', () => {
    // Standing in Tel Aviv, having arrived from London: the UK opens, unasked.
    const entries = elsewhereGroups(
      countriesOf(),
      { activeAreaId: areaIdNamed('Tel Aviv-Yafo'), previousAreaId: areaIdNamed('London') },
      allIds(),
    );
    const uk = entries.find((e) => e.kind === 'country');

    expect(uk?.kind === 'country' && uk.expandedByDefault).toBe(true);
    expect(uk?.kind === 'country' && uk.areas.map((a) => a.label)).toContain('London');
  });

  it('renders countryless areas as top-level rows, unflagged and last (rule 6)', () => {
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds());
    const last = entries[entries.length - 1];

    expect(last?.kind).toBe('area');
    expect(last?.countryCode).toBeNull();
    expect(last?.kind === 'area' && last.row.count).toBe(4);
  });

  it('counts matches under a filter and drops anything the filter emptied, groups included', () => {
    // Only Bristol survives the filter. The UK therefore has one remaining area and becomes a row.
    const bristolOnly = new Set(bristolPlaces.map((p) => p.id));
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, bristolOnly);

    expect(entries).toHaveLength(1);
    const only = entries[0];
    expect(only?.kind === 'area' && only.row.label).toBe('Bristol');
    expect(only?.kind === 'area' && only.row.count).toBe(2);
  });

  it('never renders the active area as a row of its own', () => {
    const london = areaIdNamed('London');
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: london }, allIds());
    const everyAreaId = entries.flatMap((entry) =>
      entry.kind === 'area' ? [entry.row.id] : entry.areas.map((a) => a.id),
    );

    expect(everyAreaId).not.toContain(london);
  });

  it('reaches every non-active area from the section — the §6 accessibility requirement', () => {
    const london = areaIdNamed('London');
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: london }, allIds());
    const reachable = new Set(
      entries.flatMap((entry) =>
        entry.kind === 'area' ? [entry.row.id] : entry.areas.map((a) => a.id),
      ),
    );

    const expected = areasOf()
      .map((area) => area.id)
      .filter((id) => id !== london);
    expect([...reachable].sort()).toEqual([...expected].sort());
  });

  it('names an area it cannot label honestly, and never “this area”', () => {
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds());
    const unnamed = entries.find((e) => e.kind === 'area' && e.countryCode === null);

    // `this area` is only ever true of the one you are in; a row you can travel to is `Another area`.
    expect(unnamed?.kind === 'area' && unnamed.row.label).toBe('Another area');
  });

  it('is deterministic: the same library twice produces the same order', () => {
    const once = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds()).map((e) => e.key);
    const twice = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds()).map((e) => e.key);

    expect(once).toEqual(twice);
  });
});

describe('countryGroupAccessibleName', () => {
  it('says the name, the count and the state, in that order', () => {
    const entries = elsewhereGroups(countriesOf(), { activeAreaId: areaIdNamed('London') }, allIds());
    const uk = entries.find((e) => e.kind === 'country');
    if (uk?.kind !== 'country') throw new Error('expected a country group');

    expect(countryGroupAccessibleName(uk, false, false)).toBe(
      'United Kingdom, 5 places in 2 areas, expand',
    );
    expect(countryGroupAccessibleName(uk, true, true)).toBe(
      'United Kingdom, 5 matches in 2 areas, collapse',
    );
  });
});

describe('isCountryExpanded', () => {
  const ukGroup = () => {
    const entry = elsewhereGroups(
      countriesOf(),
      { activeAreaId: areaIdNamed('Tel Aviv-Yafo') },
      allIds(),
    ).find((e) => e.kind === 'country');
    if (entry?.kind !== 'country') throw new Error('expected a country group');
    return entry;
  };

  const none: ReadonlyMap<string, boolean> = new Map();

  it('follows the surface default when the user has said nothing', () => {
    // Not the active country, so the sheet keeps it closed and the desktop panel opens it (§9).
    expect(isCountryExpanded(ukGroup(), none, 'active-and-previous', false)).toBe(false);
    expect(isCountryExpanded(ukGroup(), none, 'all', false)).toBe(true);
  });

  it('opens every group while a filter is active, so a search never hides its own answer', () => {
    expect(isCountryExpanded(ukGroup(), none, 'active-and-previous', true)).toBe(true);
  });

  it('lets an explicit toggle win over both, in both directions', () => {
    const closed = new Map([[ukGroup().key, false]]);
    const open = new Map([[ukGroup().key, true]]);

    // Even under a filter, a group the user closed stays closed — the expander still works.
    expect(isCountryExpanded(ukGroup(), closed, 'active-and-previous', true)).toBe(false);
    expect(isCountryExpanded(ukGroup(), open, 'active-and-previous', false)).toBe(true);
  });
});
