/**
 * `region-hint.ts` — the pure city-hint → region decision.
 *
 * The tests that matter here are not "Tel Aviv maps to tlv". They are the ways this table can lie:
 * an unrecognised city falling through to a country scope that quietly searches somewhere else, an
 * ambiguous name picking a continent on a coin flip, and a mistyped centre that would silently
 * exclude a whole town once the adapter tests it against a bbox.
 */

import { describe, expect, it } from 'vitest';

import { REGION_ALIASES, regionHintFor } from '@/domain/places/region-hint';
import { normalise } from '@/domain/places/normalise';

describe('regionHintFor — cities we have a region for', () => {
  it.each([
    ['Tel Aviv', 'tlv'],
    ['tel aviv', 'tlv'],
    ['TEL AVIV', 'tlv'],
    ['Tel Aviv-Yafo', 'tlv'],
    ['Tel-Aviv', 'tlv'],
    ['  Tel   Aviv  ', 'tlv'],
    ['תל אביב', 'tlv'],
    ['תל אביב יפו', 'tlv'],
    ['יפו', 'tlv'],
    ['Jaffa', 'tlv'],
    ['Ramat Gan', 'tlv'],
    ['רמת גן', 'tlv'],
    ['Bnei Brak', 'tlv'],
    ['Tokyo', 'tyo'],
    ['東京', 'tyo'],
    ['טוקיו', 'tyo'],
    ['Shibuya', 'tyo'],
    ['London', 'ldn'],
    ['לונדון', 'ldn'],
    ['Shoreditch', 'ldn'],
  ])('%s -> %s', (city, regionId) => {
    expect(regionHintFor(city, null)).toMatchObject({ kind: 'city', regionId });
  });

  it('matches through nikud, because normalise strips non-spacing marks', () => {
    // U+05B5 / U+05B8 etc. — a caption with vowel points must not miss the table.
    expect(regionHintFor('תֵּל אָבִיב', null)).toMatchObject({ kind: 'city', regionId: 'tlv' });
  });

  it('lets a city hint win over a country hint that disagrees', () => {
    expect(regionHintFor('Tokyo', 'Israel')).toMatchObject({ kind: 'city', regionId: 'tyo' });
  });

  it('carries a point, and it is the caller who decides whether a bbox covers it', () => {
    const hint = regionHintFor('Herzliya', null);
    // Deliberately still `city`: whether the loaded `tlv` extract reaches 32.166 is a fact about
    // `poi_regions`, not about the word "Herzliya", so this file does not pretend to know it.
    expect(hint).toEqual({
      kind: 'city',
      regionId: 'tlv',
      point: { lat: 32.166, lng: 34.843 },
      via: 'hint',
    });
  });
});

describe('regionHintFor — the Hasharon, which moved when 0020 widened tlv', () => {
  // Every one of these is outside 0010's `tlv` bbox (32.03–32.12 / 34.74–34.86) and inside 0020's
  // launch area (31.95–32.40 / 34.70–35.00). They resolve to `tlv` with a point, and the adapter's
  // bbox test is what decides whether they are actually searchable — so this table needs no edit
  // when the extract changes, and cannot go stale against a migration it does not know about.
  const LAUNCH_AREA = { minLat: 31.95, maxLat: 32.4, minLng: 34.7, maxLng: 35.0 };
  const SEED_2010 = { minLat: 32.03, maxLat: 32.12, minLng: 34.74, maxLng: 34.86 };

  const inside = (
    box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    point: { lat: number; lng: number },
  ): boolean =>
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng;

  it.each([
    'Herzliya',
    'הרצליה',
    'Ramat Hasharon',
    'רמת השרון',
    'Raanana',
    'רעננה',
    'Kfar Saba',
    'כפר סבא',
    'Netanya',
    'נתניה',
    'Hod Hasharon',
    'הוד השרון',
    'Holon',
    'Bat Yam',
    'Petah Tikva',
    'Rishon LeZion',
  ])('%s is tlv, outside the 0010 seed bbox and inside the 0020 launch area', (city) => {
    const hint = regionHintFor(city, null);
    expect(hint.kind).toBe('city');
    if (hint.kind !== 'city') return;
    expect(hint.regionId).toBe('tlv');
    expect(inside(SEED_2010, hint.point)).toBe(false);
    expect(inside(LAUNCH_AREA, hint.point)).toBe(true);
  });

  it('keeps Tel Aviv proper inside both boxes', () => {
    for (const city of ['Tel Aviv', 'Jaffa', 'Ramat Gan', 'Givatayim', 'Bnei Brak']) {
      const hint = regionHintFor(city, null);
      expect(hint.kind).toBe('city');
      if (hint.kind !== 'city') return;
      expect(inside(SEED_2010, hint.point), city).toBe(true);
      expect(inside(LAUNCH_AREA, hint.point), city).toBe(true);
    }
  });
});

describe('regionHintFor — country fallback', () => {
  it('uses the country when there is no city hint at all', () => {
    expect(regionHintFor(null, 'Israel')).toEqual({ kind: 'country', countryCode: 'IL' });
  });

  it('uses the country when the city is not one we know', () => {
    expect(regionHintFor('Eilat', 'Israel')).toEqual({ kind: 'country', countryCode: 'IL' });
  });

  it('accepts an alpha-2 country code as well as a name', () => {
    expect(regionHintFor(null, 'JP')).toEqual({ kind: 'country', countryCode: 'JP' });
  });

  it('is unknown when neither hint is usable', () => {
    expect(regionHintFor(null, null)).toEqual({ kind: 'unknown' });
    expect(regionHintFor('', '')).toEqual({ kind: 'unknown' });
    expect(regionHintFor('Lisbon', null)).toEqual({ kind: 'unknown' });
    expect(regionHintFor('Lisbon', 'Narnia')).toEqual({ kind: 'unknown' });
  });

  it('is unknown for whitespace and punctuation that normalise to nothing', () => {
    expect(regionHintFor('   ', null)).toEqual({ kind: 'unknown' });
    expect(regionHintFor('!!!', null)).toEqual({ kind: 'unknown' });
  });
});

describe('the alias table itself', () => {
  it('has no two aliases that normalise to the same key', () => {
    // A duplicate is not a runtime bug — the later entry silently wins — which is exactly why it
    // needs a test: two rows disagreeing about the region or the point would be invisible.
    const keys = REGION_ALIASES.map((alias) => normalise(alias));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no alias that normalises to the empty string', () => {
    expect(REGION_ALIASES.filter((alias) => normalise(alias) === '')).toEqual([]);
  });

  it('names only the three seeded regions, and gives every alias a plausible point', () => {
    const TYO = { minLat: 35.58, maxLat: 35.8, minLng: 139.6, maxLng: 139.9 };
    const LDN = { minLat: 51.42, maxLat: 51.6, minLng: -0.3, maxLng: 0.05 };
    const regions = new Set<string>();

    for (const alias of REGION_ALIASES) {
      const hint = regionHintFor(alias, null);
      expect(hint.kind, alias).toBe('city');
      if (hint.kind !== 'city') continue;
      regions.add(hint.regionId);
      // A typo in a coordinate is invisible until it silently excludes a city, so each region's
      // aliases are checked against that region's own seeded bbox.
      if (hint.regionId === 'tyo') {
        expect(hint.point.lat, alias).toBeGreaterThanOrEqual(TYO.minLat);
        expect(hint.point.lat, alias).toBeLessThanOrEqual(TYO.maxLat);
        expect(hint.point.lng, alias).toBeGreaterThanOrEqual(TYO.minLng);
        expect(hint.point.lng, alias).toBeLessThanOrEqual(TYO.maxLng);
      }
      if (hint.regionId === 'ldn') {
        expect(hint.point.lat, alias).toBeGreaterThanOrEqual(LDN.minLat);
        expect(hint.point.lat, alias).toBeLessThanOrEqual(LDN.maxLat);
        expect(hint.point.lng, alias).toBeGreaterThanOrEqual(LDN.minLng);
        expect(hint.point.lng, alias).toBeLessThanOrEqual(LDN.maxLng);
      }
    }

    expect([...regions].sort()).toEqual(['ldn', 'tlv', 'tyo']);
  });

  it('omits city names that need a country to disambiguate', () => {
    // Soho is London, Manhattan and Hong Kong; Camden is London and New Jersey. Present in the
    // table they would beat the country rule and pick a region on a coin flip.
    for (const ambiguous of ['Soho', 'Camden']) {
      expect(regionHintFor(ambiguous, null)).toEqual({ kind: 'unknown' });
    }
  });
});

describe('regionHintFor — the city inside the candidate string (TLV-12)', () => {
  // The failure this fixes is not a bad answer, it is no question: `'Belboy tel aviv'` arrived with
  // a null `cityHint`, scoped to no region, and the index was never read. The venue was in it.
  it('finds the city TLV-12 carried in its query text', () => {
    expect(regionHintFor(null, null, 'Belboy tel aviv')).toMatchObject({
      kind: 'city',
      regionId: 'tlv',
      via: 'text',
    });
  });

  it('marks a text-derived scope as such, so a log can tell the two apart', () => {
    expect(regionHintFor('Tel Aviv', null)).toMatchObject({ via: 'hint' });
    expect(regionHintFor(null, null, 'cafe in Tel Aviv')).toMatchObject({ via: 'text' });
  });

  it('matches the longest alias, so a multi-word city is one city', () => {
    const hint = regionHintFor(null, null, 'brunch at Kfar Saba');
    expect(hint).toMatchObject({ kind: 'city', regionId: 'tlv', via: 'text' });
  });

  it('reads Hebrew city names out of the text, which is most of our captions', () => {
    expect(regionHintFor(null, null, 'הסביח של עובד גבעתיים')).toMatchObject({
      kind: 'city',
      regionId: 'tlv',
      via: 'text',
    });
  });

  it('an explicit city hint still wins — the text is a fallback, not a competitor', () => {
    expect(regionHintFor('London', null, 'Dishoom tel aviv')).toMatchObject({
      kind: 'city',
      regionId: 'ldn',
      via: 'hint',
    });
  });

  it('beats the country rule, because a city is the more specific answer', () => {
    expect(regionHintFor(null, 'Israel', 'Bellboy tel aviv')).toMatchObject({
      kind: 'city',
      regionId: 'tlv',
      via: 'text',
    });
  });

  it('refuses to choose when the text names two different regions', () => {
    // Picking either would report `regionsSearched: ['tlv']` for a query that said no such thing.
    expect(regionHintFor(null, null, 'best coffee in tel aviv and tokyo')).toEqual({
      kind: 'unknown',
    });
    // ...but it still falls back to the country, which is not in conflict with itself.
    expect(regionHintFor(null, 'Israel', 'tel aviv vs tokyo')).toEqual({
      kind: 'country',
      countryCode: 'IL',
    });
  });

  it('treats two aliases of the same region as one city, not as a conflict', () => {
    expect(regionHintFor(null, null, 'sabich in jaffa, tel aviv')).toMatchObject({
      kind: 'city',
      regionId: 'tlv',
      via: 'text',
    });
  });

  it('is unchanged when the text names no city we hold', () => {
    expect(regionHintFor(null, null, 'best croissant in Lisbon')).toEqual({ kind: 'unknown' });
    expect(regionHintFor(null, null, '')).toEqual({ kind: 'unknown' });
    expect(regionHintFor(null, null, null)).toEqual({ kind: 'unknown' });
  });
});
