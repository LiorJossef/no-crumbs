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

  it('never lets a city stand in for a country', () => {
    // Changed 2026-09-02, and it is the owner-reported defect. This row used to be labelled with
    // the *area's* name, so the one Haifa save — `country_code` NULL — printed `חיפה` directly
    // beneath `Israel` under `Where you save`, as if a city were a country. The countryless group
    // is a gap: it says so, it carries no flag, and it is not counted in `N Countries`.
    const rows = countryBreakdown([
      place(LONDON.lat, LONDON.lng, { countryCode: null, locality: 'London' }),
    ]);
    expect(rows).toEqual([{ countryCode: null, label: 'Another area', count: 1 }]);
  });

  it('cannot contradict the numbers printed above it', () => {
    // The two headline figures and this list come from one pass, so `N Cities` is the number of
    // areas the list accounts for and `N Countries` is the number of *named* rows in it. Asserted
    // on a library that deliberately holds a countryless area, because that is where they used to
    // disagree: `4 Cities / 3 Countries` over four rows, one of which was a city.
    const library = [
      place(LONDON.lat, LONDON.lng, { countryCode: 'GB', locality: 'London' }),
      place(TEL_AVIV.lat, TEL_AVIV.lng, { countryCode: 'IL', locality: 'Tel Aviv-Yafo' }),
      place(32.8156, 34.9892, { countryCode: null, locality: 'חיפה' }),
    ];
    const breakdown = deriveProfileBreakdown(library);

    expect(breakdown.stats.countries).toBe(
      breakdown.countries.filter((row) => row.countryCode !== null).length,
    );
    expect(breakdown.countries).toHaveLength(3);
    expect(breakdown.stats.countries).toBe(2);
    // Every saved place is accounted for by exactly one listed row, and every area by one city.
    expect(breakdown.countries.reduce((sum, row) => sum + row.count, 0)).toBe(library.length);
    expect(breakdown.stats.cities).toBe(3);
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

/**
 * These assertions were rewritten on 2026-09-01, and the ones they replaced were not weakened —
 * they were the specification of a reported bug.
 *
 * The old suite asserted `accountIdentity({ displayName: null, email: 'demo@example.com' })` →
 * `{ title: 'demo@example.com' }`, and `title` is rendered beside the avatar at `text-lg font-bold`:
 * the slot a name goes in. Since `profiles.display_name` is null for every account this product has
 * created, that branch was the *only* branch, and it is the owner's standing report that the profile
 * screen shows a demo email. The tests below pin the opposite rule — **the email never enters the
 * name slot** — plus the three-tier name source `0035` introduced.
 */
describe('accountIdentity', () => {
  it('addresses you by the private first name, with the email beneath it', () => {
    // `profile_names.first_name` (`0035`) is what the product calls you. This screen is the only
    // place it is rendered, and it is rendered to its owner.
    expect(
      accountIdentity({ firstName: 'מאיה', displayName: null, email: 'demo@example.com' }),
    ).toEqual({ name: 'מאיה', account: 'demo@example.com' });
  });

  it('prefers the first name over the display name when it has both', () => {
    // They answer different questions — *what should the product call me* and *what should other
    // people call me* — and on your own screen the first one wins.
    expect(
      accountIdentity({ firstName: 'Maya', displayName: 'M.', email: 'demo@example.com' }),
    ).toEqual({ name: 'Maya', account: 'demo@example.com' });
  });

  it('falls back to the display name, which is the only name a pre-0035 account can acquire', () => {
    expect(
      accountIdentity({ firstName: null, displayName: 'Maya', email: 'demo@example.com' }),
    ).toEqual({ name: 'Maya', account: 'demo@example.com' });
  });

  it('never promotes the email into the name slot', () => {
    // The regression this file exists to hold. Eight local accounts are in exactly this state and
    // the schema permits it forever, so this is the common case rather than the edge one.
    const identity = accountIdentity({
      firstName: null,
      displayName: null,
      email: 'demo@example.com',
    });
    expect(identity.name).toBeNull();
    expect(identity.account).toBe('demo@example.com');
  });

  it('treats blank names as no name at all', () => {
    // `profile_names` normalises `''` to null on write (`normalise_profile_names`), but whitespace
    // can still arrive from `display_name`, which has no such trigger.
    expect(
      accountIdentity({ firstName: '  ', displayName: '   ', email: 'demo@example.com' }).name,
    ).toBeNull();
  });

  it('trims a name rather than rendering the padding', () => {
    expect(accountIdentity({ firstName: '  Maya  ', email: 'demo@example.com' }).name).toBe('Maya');
  });

  it('drops the second line when a named account has no email', () => {
    // The name has already said whose account this is; `Your account` under it would be noise.
    expect(accountIdentity({ firstName: 'Maya', email: null })).toEqual({
      name: 'Maya',
      account: null,
    });
  });

  it('falls back to a claim-free line when there is neither a name nor an email', () => {
    expect(accountIdentity({ firstName: null, displayName: null, email: null })).toEqual({
      name: null,
      account: 'Your account',
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
