/**
 * The Overture `PlaceResolver` adapter, exercised through its one injected seam.
 *
 * What is being tested is everything *except* scoring: region scoping, the norm-version gate, the
 * prefilter patterns, the caches, the row mapping, the error contract. Scoring itself has
 * `score.test.ts` and the 44-case golden file, and re-asserting a score here would only create a
 * second place for the numbers to drift.
 *
 * `place-resolver.ts` opens with `import 'server-only'`, which throws outside a server bundle — the
 * same mock `tests/unit/app/api/imports/confirm.test.ts` uses, for the same reason: what
 * `server-only` protects is the bundler boundary, not this test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MAX_PREFILTER_ROWS,
  MAX_PREFILTER_TOKENS,
  REGION_CACHE_TTL_MS,
  RESOLUTION_CACHE_TTL_MS,
  namePrefilterFilter,
  namePrefilterPatterns,
  overturePlaceResolver,
  type PoiIndexGateway,
  type PoiIndexRow,
  type PoiRegionRow,
} from '@/integrations/supabase/place-resolver';
import { DomainError } from '@/domain/errors';
import { NORM_VERSION } from '@/domain/places/normalise';
import { queryTokens } from '@/domain/places/score';
import type { OpCtx } from '@/domain/ports';
import type { ResolveQuery } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- */

interface Logged {
  readonly name: string;
  readonly fields: Record<string, string | number | boolean>;
}

function ctxWith(): { ctx: OpCtx; logs: Logged[] } {
  const logs: Logged[] = [];
  return {
    logs,
    ctx: {
      signal: new AbortController().signal,
      importId: null,
      log: { event: (name, fields) => void logs.push({ name, fields }) },
    },
  };
}

function query(overrides: Partial<ResolveQuery> & { text: string }): ResolveQuery {
  return {
    cityHint: 'Tel Aviv',
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: null,
    ...overrides,
  };
}

/** Defaults to `0010`'s seeded `tlv` bbox — Tel Aviv proper, no Hasharon. Tests that care about
 *  the widened `0020` launch area pass it explicitly, so both shapes stay covered. */
function region(overrides: Partial<PoiRegionRow> & { id: string }): PoiRegionRow {
  return {
    country_code: 'IL',
    norm_version: NORM_VERSION,
    min_lat: 32.03,
    max_lat: 32.12,
    min_lng: 34.74,
    max_lng: 34.86,
    ...overrides,
  };
}

/** `0020`'s Tel Aviv + Hasharon launch area. */
const LAUNCH_AREA = { min_lat: 31.95, max_lat: 32.4, min_lng: 34.7, max_lng: 35.0 } as const;

/** `0010`'s seeded Tokyo bbox. */
const TYO_BBOX = { min_lat: 35.58, max_lat: 35.8, min_lng: 139.6, max_lng: 139.9 } as const;

function row(overrides: Partial<PoiIndexRow> & { name: string }): PoiIndexRow {
  return {
    dataset_place_id: `gers-${overrides.name}`,
    region_id: 'tlv',
    alt_names: [],
    provider_category: 'restaurant',
    address_line: 'Some street 1',
    locality: 'Tel Aviv-Yafo',
    lat: 32.07,
    lng: 34.78,
    dataset_confidence: 0.9,
    ...overrides,
  };
}

interface FakeGateway extends PoiIndexGateway {
  readonly regionCalls: number[];
  readonly prefilterCalls: {
    regionIds: readonly string[];
    likePatterns: readonly string[];
    limit: number;
  }[];
}

function fakeGateway(regions: readonly PoiRegionRow[], rows: readonly PoiIndexRow[]): FakeGateway {
  const regionCalls: number[] = [];
  const prefilterCalls: FakeGateway['prefilterCalls'] = [];
  return {
    regionCalls,
    prefilterCalls,
    async loadedRegions() {
      regionCalls.push(1);
      return regions;
    },
    async prefilter(input) {
      prefilterCalls.push({ ...input });
      return rows;
    },
  };
}

/* ------------------------------------------------------------------------------------------- */

describe('namePrefilterPatterns', () => {
  it('is built from exactly queryTokens, so both sides of the prefilter ask one question', () => {
    const text = 'Falafel HaKosem';
    const tokens = queryTokens(text);
    const patterns = namePrefilterPatterns(text);
    expect(patterns).toHaveLength(tokens.length);
    for (const token of tokens) {
      expect(patterns.some((pattern) => pattern.includes(token))).toBe(true);
    }
  });

  it('wraps each token as an unquoted PostgREST like value', () => {
    expect(namePrefilterPatterns('Falafel HaKosem')).toEqual(['*falafel*', '*hakosem*']);
  });

  it('keeps Hebrew tokens intact', () => {
    expect(namePrefilterPatterns('פלאפל הקוסם')).toEqual(['*הקוסם*', '*פלאפל*']);
  });

  it('widens the LIKE wildcard normalise() lets through instead of escaping it', () => {
    // `_` survives normalise() (Python's \w includes it) and is LIKE's single-character wildcard.
    // Escaping it would need a quoted value, and PostgREST does not document whether `*` is still
    // read as `%` inside quotes. Widening to `*` is a superset, so it cannot lose the true row.
    expect(namePrefilterPatterns('cafe_bar')).toEqual(['*cafe*bar*']);
  });

  it('never emits a character that is reserved in a PostgREST filter', () => {
    // This is the property that lets the filter go unquoted. `normalise()` emits letters, digits,
    // `_` and the Hebrew/CJK punctuation ranges, none of which are reserved; `_` is gone by the
    // time it gets here. If normalise() ever widens, this test is the thing that notices.
    const samples = [
      'Falafel HaKosem',
      'פלאפל הקוסם',
      '東京 ラーメン',
      'cafe_bar',
      'A.B, C:D (E) "F" \\G/ H%I',
      "Ra'anana café — Bar & Grill",
    ];
    for (const sample of samples) {
      for (const pattern of namePrefilterPatterns(sample)) {
        expect(pattern, sample).not.toMatch(/[,.:()"\\%]/u);
      }
    }
  });

  it('orders longest first and caps the disjunction', () => {
    const text = Array.from({ length: 30 }, (_, i) => `token${'x'.repeat(i)}`).join(' ');
    const patterns = namePrefilterPatterns(text);
    expect(patterns).toHaveLength(MAX_PREFILTER_TOKENS);
    const lengths = patterns.map((pattern) => pattern.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });

  it('is empty for text with no tokens at all', () => {
    expect(namePrefilterPatterns('   ')).toEqual([]);
    expect(namePrefilterPatterns('!!!')).toEqual([]);
  });

  it('joins into an or= filter', () => {
    expect(namePrefilterFilter(namePrefilterPatterns('Falafel HaKosem'))).toBe(
      'name_norm.like.*falafel*,name_norm.like.*hakosem*',
    );
  });
});

describe('overturePlaceResolver — region scoping', () => {
  it('declares the overture provider', () => {
    expect(overturePlaceResolver(fakeGateway([], [])).provider).toBe('overture');
  });

  it('searches the region a known city hint names', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' }), region({ id: 'tyo', country_code: 'JP', ...TYO_BBOX })],
      [row({ name: 'HaKosem' })],
    );
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'HaKosem', cityHint: 'Tel Aviv' }),
      ctx,
    );

    expect(result.regionsSearched).toEqual(['tlv']);
    expect(gateway.prefilterCalls[0]?.regionIds).toEqual(['tlv']);
    expect(gateway.prefilterCalls[0]?.limit).toBe(MAX_PREFILTER_ROWS);
  });

  it('returns an empty, no_match result with regionsSearched [] when nothing is loaded', async () => {
    const gateway = fakeGateway([], [row({ name: 'HaKosem' })]);
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(query({ text: 'HaKosem' }), ctx);

    expect(result.regionsSearched).toEqual([]);
    expect(result.shortlist).toEqual([]);
    expect(result.candidatesPrefiltered).toBe(0);
    expect(result.confidence).toEqual({ band: 'no_match', score: 0, margin: null });
    // The honest "we don't have that city" costs no prefilter at all.
    expect(gateway.prefilterCalls).toHaveLength(0);
  });

  it('never claims to have searched tlv for a town outside the LOADED bbox', async () => {
    // 0010's `tlv` stops at 32.12; Herzliya is at 32.166. Returning `regionsSearched: ['tlv']`
    // here would claim we looked in the right place and hand back a Tel Aviv namesake.
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'Cafe Nona' })]);
    const { ctx, logs } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'Cafe Nona', cityHint: 'Herzliya', countryHint: 'Israel' }),
      ctx,
    );

    expect(result.regionsSearched).toEqual([]);
    expect(result.shortlist).toEqual([]);
    expect(gateway.prefilterCalls).toHaveLength(0);
    expect(logs.find((entry) => entry.name === 'poi.resolve')?.fields.scope).toBe('outside_extent');
  });

  it('DOES search the same town once the extract widens to the launch area (0020)', async () => {
    // Same alias table, same code, different bbox row — which is the point of testing the point
    // against the region rather than flagging each town in a table that goes stale.
    const gateway = fakeGateway(
      [region({ id: 'tlv', ...LAUNCH_AREA })],
      [row({ name: 'Cafe Nona' })],
    );
    const { ctx } = ctxWith();

    for (const city of ['Herzliya', 'Ra\'anana', 'Kfar Saba', 'Netanya', 'Holon', 'Petah Tikva']) {
      const result = await overturePlaceResolver(gateway).resolve(
        query({ text: 'Cafe Nona', cityHint: city }),
        ctx,
      );
      expect(result.regionsSearched, city).toEqual(['tlv']);
    }
  });

  it('does not search a region whose bbox covers the point but whose id the alias does not name', async () => {
    // Guards the id check: a London alias must not fall into a Tel Aviv extract just because some
    // other region happens to be loaded.
    const gateway = fakeGateway([region({ id: 'tlv', ...LAUNCH_AREA })], [row({ name: 'Dishoom' })]);
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'Dishoom', cityHint: 'Shoreditch' }),
      ctx,
    );

    expect(result.regionsSearched).toEqual([]);
  });

  it('falls back to every loaded region in the hinted country when there is no city', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' }), region({ id: 'tyo', country_code: 'JP', ...TYO_BBOX })],
      [row({ name: 'HaKosem' })],
    );
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'HaKosem', cityHint: null, countryHint: 'Israel' }),
      ctx,
    );

    expect(result.regionsSearched).toEqual(['tlv']);
  });

  it('searches nothing when neither hint is usable', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem' })]);
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'HaKosem', cityHint: 'Lisbon', countryHint: null }),
      ctx,
    );

    expect(result.regionsSearched).toEqual([]);
    expect(gateway.prefilterCalls).toHaveLength(0);
  });

  it('refuses a region loaded under a different normaliser rather than serving it degraded', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv', norm_version: NORM_VERSION + 1 })],
      [row({ name: 'HaKosem' })],
    );
    const { ctx, logs } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(query({ text: 'HaKosem' }), ctx);

    expect(result.regionsSearched).toEqual([]);
    expect(gateway.prefilterCalls).toHaveLength(0);
    expect(logs.map((entry) => entry.name)).toContain('poi.region_norm_version_mismatch');
  });

  it('does not prefilter when the query has no tokens', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem' })]);
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(query({ text: '???' }), ctx);

    expect(gateway.prefilterCalls).toHaveLength(0);
    expect(result.confidence.band).toBe('no_match');
    // The region WAS resolvable — reporting it is the truthful answer here, and it is what tells
    // "we have no Tel Aviv data" apart from "we searched Tel Aviv and this name matched nothing".
    expect(result.regionsSearched).toEqual(['tlv']);
  });
});

describe('overturePlaceResolver — rows, scoring hand-off and aliases', () => {
  it('maps every column onto ResolvedPlace and scores what it mapped', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' })],
      [
        row({
          name: 'Falafel HaKosem',
          dataset_place_id: 'gers-1',
          alt_names: ['פלאפל הקוסם'],
          provider_category: 'falafel_restaurant',
          address_line: 'Shlomo HaMelech 1',
          locality: 'Tel Aviv-Yafo',
          lat: 32.0731,
          lng: 34.7749,
          dataset_confidence: 0.83,
        }),
      ],
    );
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'Falafel HaKosem' }),
      ctx,
    );

    expect(result.candidatesPrefiltered).toBe(1);
    expect(result.shortlist[0]?.place).toEqual({
      provider: 'overture',
      providerPlaceId: 'gers-1',
      sourceDataset: 'overture-places',
      regionId: 'tlv',
      name: 'Falafel HaKosem',
      altNames: ['פלאפל הקוסם'],
      providerCategory: 'falafel_restaurant',
      addressLine: 'Shlomo HaMelech 1',
      locality: 'Tel Aviv-Yafo',
      lat: 32.0731,
      lng: 34.7749,
      datasetConfidence: 0.83,
    });
  });

  it('tolerates a null alt_names without handing undefined to the scorer', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem', alt_names: null })]);
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(query({ text: 'HaKosem' }), ctx);

    expect(result.shortlist[0]?.place.altNames).toEqual([]);
  });

  it('reaches a Hebrew-named row through its English alias, which is why divergence 5 changed', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' })],
      [
        row({ name: 'פלאפל הקוסם', dataset_place_id: 'a', alt_names: ['Falafel HaKosem'] }),
        row({ name: 'Falafel Ravid', dataset_place_id: 'b', alt_names: [] }),
      ],
    );
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'Falafel HaKosem' }),
      ctx,
    );

    expect(result.shortlist[0]?.place.providerPlaceId).toBe('a');
  });

  it('honours maxResults on the shortlist while banding on the full ranking', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' })],
      [
        row({ name: 'HaKosem', dataset_place_id: 'a' }),
        row({ name: 'HaKosem Bar', dataset_place_id: 'b' }),
        row({ name: 'HaKosem Cafe', dataset_place_id: 'c' }),
      ],
    );
    const { ctx } = ctxWith();

    const result = await overturePlaceResolver(gateway).resolve(
      query({ text: 'HaKosem', maxResults: 1 }),
      ctx,
    );

    expect(result.shortlist).toHaveLength(1);
    expect(result.candidatesPrefiltered).toBe(3);
    // Three candidates, so the margin is measured even though the shortlist was cut to one.
    expect(result.confidence.margin).not.toBeNull();
  });
});

describe('overturePlaceResolver — caching', () => {
  it('reads the region list once across many candidates', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem' })]);
    const resolver = overturePlaceResolver(gateway, { now: () => 1_000 });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'HaKosem' }), ctx);
    await resolver.resolve(query({ text: 'Miznon' }), ctx);
    await resolver.resolve(query({ text: 'Port Said' }), ctx);

    expect(gateway.regionCalls).toHaveLength(1);
    expect(gateway.prefilterCalls).toHaveLength(3);
  });

  it('re-reads the region list once the TTL has passed', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem' })]);
    let clock = 1_000;
    const resolver = overturePlaceResolver(gateway, { now: () => clock });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'HaKosem' }), ctx);
    clock += REGION_CACHE_TTL_MS + 1;
    await resolver.resolve(query({ text: 'HaKosem' }), ctx);

    expect(gateway.regionCalls).toHaveLength(2);
  });

  it('serves a repeated candidate from the row cache, and re-queries after its TTL', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'HaKosem' })]);
    let clock = 1_000;
    const resolver = overturePlaceResolver(gateway, { now: () => clock });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'HaKosem' }), ctx);
    await resolver.resolve(query({ text: '  HaKosem!! ' }), ctx); // same tokens after normalise()
    expect(gateway.prefilterCalls).toHaveLength(1);

    clock += RESOLUTION_CACHE_TTL_MS + 1;
    await resolver.resolve(query({ text: 'HaKosem' }), ctx);
    expect(gateway.prefilterCalls).toHaveLength(2);
  });

  it('does not share a cache entry across different region sets', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' }), region({ id: 'tyo', country_code: 'JP', ...TYO_BBOX })],
      [row({ name: 'Coffee' })],
    );
    const resolver = overturePlaceResolver(gateway, { now: () => 1_000 });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'Coffee', cityHint: 'Tel Aviv' }), ctx);
    await resolver.resolve(query({ text: 'Coffee', cityHint: 'Tokyo' }), ctx);

    expect(gateway.prefilterCalls.map((call) => call.regionIds)).toEqual([['tlv'], ['tyo']]);
  });
});

describe('overturePlaceResolver — the error contract', () => {
  let ctx: OpCtx;
  beforeEach(() => {
    ctx = ctxWith().ctx;
  });

  it('never throws for no match', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const result = await overturePlaceResolver(gateway).resolve(query({ text: 'Nowhere' }), ctx);

    expect(result.shortlist).toEqual([]);
    expect(result.confidence.band).toBe('no_match');
    expect(result.regionsSearched).toEqual(['tlv']);
  });

  it('converts a prefilter failure into a DomainError that leaks nothing', async () => {
    const leaky = {
      code: '42501',
      message: 'permission denied for table poi_index',
      details: 'name_norm like %secret caption%',
    };
    const gateway: PoiIndexGateway = {
      async loadedRegions() {
        return [region({ id: 'tlv' })];
      },
      async prefilter() {
        throw leaky;
      },
    };

    const error = await overturePlaceResolver(gateway)
      .resolve(query({ text: 'HaKosem' }), ctx)
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(DomainError);
    const view = (error as DomainError).toView();
    expect(view).toEqual({ code: 'INTERNAL', retryable: true });
    expect(JSON.stringify(view)).not.toContain('poi_index');
    expect(JSON.stringify(view)).not.toContain('caption');
  });

  it('converts a region-list failure the same way', async () => {
    const gateway: PoiIndexGateway = {
      async loadedRegions() {
        throw new Error('ECONNRESET');
      },
      async prefilter() {
        return [];
      },
    };

    const error = await overturePlaceResolver(gateway)
      .resolve(query({ text: 'HaKosem' }), ctx)
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INTERNAL');
  });

  it('does not cache a failed region read as "nothing is loaded"', async () => {
    let attempt = 0;
    const gateway: PoiIndexGateway = {
      async loadedRegions() {
        attempt += 1;
        if (attempt === 1) throw new Error('ECONNRESET');
        return [region({ id: 'tlv' })];
      },
      async prefilter() {
        return [row({ name: 'HaKosem' })];
      },
    };
    const resolver = overturePlaceResolver(gateway, { now: () => 1_000 });

    await expect(resolver.resolve(query({ text: 'HaKosem' }), ctx)).rejects.toBeInstanceOf(
      DomainError,
    );
    const result = await resolver.resolve(query({ text: 'HaKosem' }), ctx);
    expect(result.regionsSearched).toEqual(['tlv']);
  });
});

describe('overturePlaceResolver — logging', () => {
  it('logs region ids, counts and codes, and no caption or coordinate', async () => {
    const gateway = fakeGateway(
      [region({ id: 'tlv' })],
      [row({ name: 'Falafel HaKosem', lat: 32.0731, lng: 34.7749 })],
    );
    const { ctx, logs } = ctxWith();

    await ctxWith();
    await overturePlaceResolver(gateway).resolve(
      query({ text: 'Falafel HaKosem', cityHint: 'Tel Aviv' }),
      ctx,
    );

    const resolveLog = logs.find((entry) => entry.name === 'poi.resolve');
    expect(resolveLog).toBeDefined();
    expect(resolveLog?.fields).toMatchObject({
      hint: 'city',
      scope: 'city',
      regions: 'tlv',
      prefiltered: 1,
    });

    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain('Falafel');
    expect(serialised).not.toContain('32.07');
    expect(serialised).not.toContain('34.77');
  });
});
