/**
 * `/profile`'s counting rules (`NIGHT-PROFILE-1`).
 *
 * The headline assertions run against `REAL_LIBRARY` — the demo user's actual 32 saved places, read
 * off the local database — so the numbers here are the numbers the page prints for that account.
 * The small literal fixtures underneath exist to pin the *rules* the real library happens to
 * exercise only once, or not at all.
 *
 * The one worth defending is `cities: 2`. That library holds six distinct `locality` strings
 * (`London`, `Tel Aviv-Yafo`, `Tel Aviv`, `תל אביב - יפו`, `תל אביב-יפו`, `ת״א`) for two cities, so
 * counting the string would tell a user with places in two cities that they have six.
 */

import { describe, expect, it } from 'vitest';

import {
  accountIdentity,
  categoryBreakdown,
  countryBreakdown,
  creatorBreakdown,
  deriveProfileBreakdown,
  deriveProfileStats,
  joinedLabel,
  type ProfilePlace,
} from '@/app/profile/_lib/profile-stats';
import { REAL_LIBRARY } from './real-library';

let seq = 0;
function place(
  lat: number,
  lng: number,
  overrides: Partial<Omit<ProfilePlace, 'lat' | 'lng'>> = {},
): ProfilePlace {
  seq += 1;
  return {
    id: `place-${seq}`,
    lat,
    lng,
    locality: null,
    countryCode: null,
    category: null,
    visitState: 'want_to_go',
    creator: null,
    ...overrides,
  };
}

const LONDON = { lat: 51.5147, lng: -0.1219 };
const LONDON_NEARBY = { lat: 51.4616, lng: -0.1147 };
const TEL_AVIV = { lat: 32.0725, lng: 34.782 };

describe('deriveProfileStats', () => {
  it('is all zeros for an empty library', () => {
    expect(deriveProfileStats([])).toEqual({
      saved: 0,
      cities: 0,
      countries: 0,
      been: 0,
      notBeenYet: 0,
    });
  });

  it('counts the real local library the way the page prints it', () => {
    expect(deriveProfileStats(REAL_LIBRARY)).toEqual({
      saved: 32,
      cities: 2,
      countries: 2,
      been: 1,
      notBeenYet: 31,
    });
  });

  it('counts cities geographically, not by locality string', () => {
    // Two points 1.1 km apart in one city, spelled two ways — which is the real library's defect in
    // miniature. A string count would say 2; geometry says 1.
    const stats = deriveProfileStats([
      place(32.0725, 34.782, { locality: 'Tel Aviv' }),
      place(32.0645, 34.7735, { locality: 'תל אביב-יפו' }),
    ]);
    expect(stats.cities).toBe(1);
  });

  it('splits two cities 3,500 km apart', () => {
    const stats = deriveProfileStats([place(LONDON.lat, LONDON.lng), place(TEL_AVIV.lat, TEL_AVIV.lng)]);
    expect(stats.cities).toBe(2);
  });

  it('keeps a place with no usable coordinate out of the city count but inside the library', () => {
    const stats = deriveProfileStats([
      place(LONDON.lat, LONDON.lng, { countryCode: 'GB' }),
      place(Number.NaN, Number.NaN, { countryCode: 'GB' }),
    ]);
    expect(stats).toEqual({ saved: 2, cities: 1, countries: 1, been: 0, notBeenYet: 2 });
  });

  it('splits been from not been yet, and never as a fraction of the whole', () => {
    const stats = deriveProfileStats([
      place(LONDON.lat, LONDON.lng, { visitState: 'visited' }),
      place(LONDON_NEARBY.lat, LONDON_NEARBY.lng, { visitState: 'visited' }),
      place(51.5113, -0.0858),
    ]);
    expect(stats.been).toBe(2);
    expect(stats.notBeenYet).toBe(1);
  });
});

describe('countryBreakdown', () => {
  it('matches what the map band shows for the real library', () => {
    // Both totals sum to 32, which is the point: the two places whose own `country_code` is null
    // are carried by their area's plurality rather than dropped, exactly as the world-zoom band
    // carries them.
    expect(countryBreakdown(REAL_LIBRARY)).toEqual([
      { countryCode: 'GB', label: 'United Kingdom', count: 18 },
      { countryCode: 'IL', label: 'Israel', count: 14 },
    ]);
  });

  it('names a country rather than printing its code', () => {
    expect(countryBreakdown([place(LONDON.lat, LONDON.lng, { countryCode: 'GB' })])[0]?.label).toBe(
      'United Kingdom',
    );
  });

  it('gives an area nothing can name its own label, and no flag', () => {
    const rows = countryBreakdown([
      place(LONDON.lat, LONDON.lng, { countryCode: null, locality: 'London' }),
    ]);
    expect(rows).toEqual([{ countryCode: null, label: 'London', count: 1 }]);
  });

  it('sorts by count and puts the unnamed group last however big it is', () => {
    const rows = countryBreakdown([
      place(LONDON.lat, LONDON.lng, { countryCode: 'GB' }),
      // Three places in one area with no country at all, so the group outnumbers the UK one.
      place(TEL_AVIV.lat, TEL_AVIV.lng, { locality: 'Tel Aviv' }),
      place(32.0645, 34.7735, { locality: 'Tel Aviv' }),
      place(32.0587, 34.7625, { locality: 'Tel Aviv' }),
    ]);
    expect(rows.map((row) => row.countryCode)).toEqual(['GB', null]);
  });
});

describe('categoryBreakdown', () => {
  it('counts the real library by the product vocabulary', () => {
    expect(categoryBreakdown(REAL_LIBRARY)).toEqual([
      { category: 'restaurant', count: 23 },
      { category: 'cafe', count: 8 },
      { category: 'bar', count: 1 },
    ]);
  });

  it('counts an uncategorised place under nothing, and offers no row for it', () => {
    const rows = categoryBreakdown([
      place(LONDON.lat, LONDON.lng, { category: 'cafe' }),
      place(LONDON_NEARBY.lat, LONDON_NEARBY.lng, { category: null }),
    ]);
    expect(rows).toEqual([{ category: 'cafe', count: 1 }]);
  });
});

describe('creatorBreakdown', () => {
  it('ranks the real library by how much came from each account', () => {
    expect(creatorBreakdown(REAL_LIBRARY)).toEqual([
      { handle: 'exploringlondon', name: null, label: '@exploringlondon', count: 18 },
      { handle: 'tlv.eats', name: null, label: '@tlv.eats', count: 6 },
      { handle: 'joelleuzyel', name: null, label: '@joelleuzyel', count: 3 },
      { handle: 'paz_farchi1', name: null, label: '@paz_farchi1', count: 2 },
      { handle: 'nadavbornstein', name: null, label: '@nadavbornstein', count: 1 },
    ]);
  });

  it('holds to its limit rather than listing everyone', () => {
    // Seven creators in the real library, five rows.
    expect(creatorBreakdown(REAL_LIBRARY)).toHaveLength(5);
    expect(creatorBreakdown(REAL_LIBRARY, 2).map((row) => row.label)).toEqual([
      '@exploringlondon',
      '@tlv.eats',
    ]);
  });

  it('counts a manual save for nobody rather than for an "Unknown" creator', () => {
    expect(creatorBreakdown([place(LONDON.lat, LONDON.lng)])).toEqual([]);
  });

  it('treats one handle under two display names as one creator', () => {
    // The account renamed itself between two saves. Keying on the display name would show it twice.
    const rows = creatorBreakdown([
      place(LONDON.lat, LONDON.lng, { creator: { handle: 'tlv.eats', name: 'TLV Eats' } }),
      place(LONDON_NEARBY.lat, LONDON_NEARBY.lng, {
        creator: { handle: 'TLV.Eats', name: 'Tel Aviv Eats' },
      }),
    ]);
    expect(rows).toEqual([{ handle: 'tlv.eats', name: 'TLV Eats', label: '@tlv.eats', count: 2 }]);
  });

  it('falls back to the display name when there is no handle', () => {
    const rows = creatorBreakdown([
      place(LONDON.lat, LONDON.lng, { creator: { handle: null, name: 'TLV Eats' } }),
    ]);
    expect(rows).toEqual([{ handle: null, name: 'TLV Eats', label: 'TLV Eats', count: 1 }]);
  });

  it('skips a source that carries neither a handle nor a name', () => {
    expect(creatorBreakdown([place(LONDON.lat, LONDON.lng, { creator: { handle: null, name: null } })])).toEqual(
      [],
    );
  });
});

describe('deriveProfileBreakdown', () => {
  it('is the four derivations over one library', () => {
    const breakdown = deriveProfileBreakdown(REAL_LIBRARY);
    expect(breakdown.stats).toEqual(deriveProfileStats(REAL_LIBRARY));
    expect(breakdown.countries).toEqual(countryBreakdown(REAL_LIBRARY));
    expect(breakdown.categories).toEqual(categoryBreakdown(REAL_LIBRARY));
    expect(breakdown.creators).toEqual(creatorBreakdown(REAL_LIBRARY));
  });

  it('returns empty lists for an empty library, so every section can be omitted', () => {
    expect(deriveProfileBreakdown([])).toEqual({
      stats: { saved: 0, cities: 0, countries: 0, been: 0, notBeenYet: 0 },
      countries: [],
      categories: [],
      creators: [],
    });
  });
});

describe('accountIdentity', () => {
  it('prefers the display name and keeps the email beneath it', () => {
    expect(accountIdentity({ displayName: 'מאיה', email: 'demo@example.com' })).toEqual({
      title: 'מאיה',
      subtitle: 'demo@example.com',
    });
  });

  it('shows the email itself when no display name was ever given', () => {
    // `profiles.display_name` is nullable and only ever populated from signup metadata, so this is
    // the common case, not the edge one. Nothing is derived from the email to stand in for a name.
    expect(accountIdentity({ displayName: null, email: 'demo@example.com' })).toEqual({
      title: 'demo@example.com',
      subtitle: null,
    });
  });

  it('treats a blank display name as no display name', () => {
    expect(accountIdentity({ displayName: '   ', email: 'demo@example.com' }).title).toBe(
      'demo@example.com',
    );
  });

  it('falls back to a claim-free title when there is neither', () => {
    expect(accountIdentity({ displayName: null, email: null })).toEqual({
      title: 'Your account',
      subtitle: null,
    });
  });
});

describe('joinedLabel', () => {
  it('renders the month the account was created', () => {
    expect(joinedLabel(new Date('2026-08-24T13:22:51.127Z'))).toBe('Joined August 2026');
  });

  it('says nothing when there is no profile row to read a date from', () => {
    expect(joinedLabel(null)).toBeNull();
  });

  it('says nothing for an unparseable date rather than printing "Invalid Date"', () => {
    expect(joinedLabel(new Date('not a date'))).toBeNull();
  });
});
