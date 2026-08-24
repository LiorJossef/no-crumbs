/**
 * Unit coverage for `poiIndexPlaceResolver` (`src/integrations/places/poi-index-resolver.ts`).
 * The fake `db` below implements only the two calls the adapter actually makes —
 * `.from('poi_regions').select(...).eq('is_loaded', true)` and
 * `.rpc('search_poi_index', {...})` — mirroring how `oembed-source-adapter.test.ts` fakes just
 * enough of `SupabaseClient` to exercise the adapter faithfully, never a real Postgres connection.
 */
import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { NORM_VERSION } from '@/domain/places/normalise';
import type { ResolveQuery } from '@/domain/types';
import { poiIndexPlaceResolver, regionIdsForCityHint } from '@/integrations/places/poi-index-resolver';

interface PoiRegionRow {
  id: string;
  display_name: string;
  norm_version: number | null;
  is_loaded: boolean;
}

interface PoiIndexRow {
  dataset_place_id: string;
  region_id: string;
  name: string;
  name_norm: string;
  alt_names: string[];
  provider_category: string | null;
  address_line: string | null;
  locality: string | null;
  lat: number;
  lng: number;
  dataset_confidence: number;
}

/** A trigram-similarity stand-in good enough for these fixtures: fraction of the query's tokens
 *  that appear (as a substring) in the candidate's normalised name. Not the real `pg_trgm`
 *  operator — this fake only needs to return "did this row match the query at all", the same
 *  contract `search_poi_index` promises (prefiltered rows, unranked-by-score); the real ranking is
 *  the scorer's job and is exercised by `score.test.ts`/`benchmark-golden.test.ts`, not here. */
function fakeSearchPoiIndex(
  rows: readonly PoiIndexRow[],
  args: { p_region_ids: string[]; p_query_norm: string; p_like_patterns: string[]; p_limit: number },
): PoiIndexRow[] {
  return rows.filter((row) => {
    if (!args.p_region_ids.includes(row.region_id)) return false;
    if (args.p_query_norm !== '' && row.name_norm.includes(args.p_query_norm)) return true;
    return args.p_like_patterns.some((pattern) => {
      const token = pattern.slice(1, -1); // strip the '%...%' wrapper this adapter always sends
      return token !== '' && row.name_norm.includes(token);
    });
  });
}

function makeFakeDb(regions: readonly PoiRegionRow[], poiRows: readonly PoiIndexRow[]) {
  const rpcCalls: unknown[] = [];
  return {
    rpcCalls,
    from(table: string) {
      if (table !== 'poi_regions') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              if (col !== 'is_loaded') throw new Error(`unexpected column ${col}`);
              const filtered = regions.filter((r) => r.is_loaded === val);
              return Promise.resolve({ data: filtered, error: null });
            },
          };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== 'search_poi_index') throw new Error(`unexpected rpc ${fn}`);
      rpcCalls.push(args);
      const data = fakeSearchPoiIndex(poiRows, args as never);
      return Promise.resolve({ data, error: null });
    },
  };
}

function ctx(): OpCtx {
  return { signal: new AbortController().signal, importId: null, log: { event: () => {} } };
}

function query(overrides: Partial<ResolveQuery> & { text: string }): ResolveQuery {
  return {
    cityHint: null,
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: null,
    ...overrides,
  };
}

const TLV_LOADED: PoiRegionRow = {
  id: 'tlv',
  display_name: 'Tel Aviv',
  norm_version: NORM_VERSION,
  is_loaded: true,
};

/** A real-shaped Tel Aviv row: name/name_norm as the loader would have written them
 *  (`scripts/load-poi-region.ts` calls the same `normalise()`). */
const CAFE_LEVINSKY: PoiIndexRow = {
  dataset_place_id: 'gers-cafe-levinsky-1',
  region_id: 'tlv',
  name: 'Cafe Levinsky',
  name_norm: 'cafe levinsky',
  alt_names: [],
  provider_category: 'coffee_shop',
  address_line: 'Levinsky St 41',
  locality: 'Tel Aviv',
  lat: 32.0599,
  lng: 34.7719,
  dataset_confidence: 0.8,
};

const UNRELATED_TOKYO_ROW: PoiIndexRow = {
  dataset_place_id: 'gers-tokyo-1',
  region_id: 'tyo',
  name: 'Onibus Coffee',
  name_norm: 'onibus coffee',
  alt_names: [],
  provider_category: 'coffee_shop',
  address_line: null,
  locality: 'Tokyo',
  lat: 35.66,
  lng: 139.7,
  dataset_confidence: 0.5,
};

describe('regionIdsForCityHint', () => {
  const loaded = [{ id: 'tlv', displayName: 'Tel Aviv', normVersion: NORM_VERSION }];

  it('matches a city hint against the loaded region display name, case/diacritic-insensitively', () => {
    expect(regionIdsForCityHint('Tel Aviv', loaded)).toEqual(['tlv']);
    expect(regionIdsForCityHint('tel aviv', loaded)).toEqual(['tlv']);
  });

  it('defaults a null/empty hint to the single loaded region', () => {
    expect(regionIdsForCityHint(null, loaded)).toEqual(['tlv']);
    expect(regionIdsForCityHint('', loaded)).toEqual(['tlv']);
  });

  it('does not default a null hint when more than one region is loaded', () => {
    const twoLoaded = [...loaded, { id: 'tyo', displayName: 'Tokyo', normVersion: NORM_VERSION }];
    expect(regionIdsForCityHint(null, twoLoaded)).toEqual([]);
  });

  it('returns nothing for a city hint that names no loaded region', () => {
    expect(regionIdsForCityHint('Tokyo', loaded)).toEqual([]);
  });

  it('returns nothing when no region is loaded at all', () => {
    expect(regionIdsForCityHint('Tel Aviv', [])).toEqual([]);
  });
});

describe('poiIndexPlaceResolver', () => {
  it('resolves a real Tel Aviv row for a matching candidate string', async () => {
    const db = makeFakeDb([TLV_LOADED], [CAFE_LEVINSKY, UNRELATED_TOKYO_ROW]);
    const resolver = poiIndexPlaceResolver(db as never);

    const result = await resolver.resolve(query({ text: 'Cafe Levinsky', cityHint: 'Tel Aviv' }), ctx());

    expect(result.regionsSearched).toEqual(['tlv']);
    expect(result.shortlist).toHaveLength(1);
    expect(result.shortlist[0]?.place.providerPlaceId).toBe('gers-cafe-levinsky-1');
    expect(result.shortlist[0]?.place.provider).toBe('overture');
    expect(result.shortlist[0]?.place.sourceDataset).toBe('overture-places');
    // A single prefiltered row has no second candidate to measure a margin against, so `06` §6.2's
    // rule (`10` §12 Q3, `score.ts`'s file header divergence 1) puts it in `confirm`, never
    // `preselect` — "unmeasured margin is not perfect margin". `confirm` is still a real database
    // match: it is what the caption-preview screen's own "Done" review step already asks for, and
    // is exactly what makes this a "real match" rather than a guess (see the route/UI wiring's
    // comment on why `confirm` and `preselect` are both treated as a database hit).
    expect(result.confidence.band).toBe('confirm');
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.8);
  });

  it('reaches `preselect` when a second, clearly worse candidate gives the top match a real margin', async () => {
    const decoy: PoiIndexRow = {
      dataset_place_id: 'gers-cafe-levinsky-junior-1',
      region_id: 'tlv',
      name: 'Cafe Levinsky Junior Branch',
      name_norm: 'cafe levinsky junior branch',
      alt_names: [],
      provider_category: 'bar',
      address_line: null,
      locality: 'Tel Aviv',
      lat: 32.06,
      lng: 34.77,
      dataset_confidence: 0.5,
    };
    const confident: PoiIndexRow = { ...CAFE_LEVINSKY, dataset_confidence: 1 };
    const db = makeFakeDb([TLV_LOADED], [confident, decoy]);
    const resolver = poiIndexPlaceResolver(db as never);

    const result = await resolver.resolve(
      query({ text: 'Cafe Levinsky', cityHint: 'Tel Aviv', categoryHint: 'cafe' }),
      ctx(),
    );

    expect(result.shortlist).toHaveLength(2);
    expect(result.shortlist[0]?.place.providerPlaceId).toBe('gers-cafe-levinsky-1');
    expect(result.confidence.band).toBe('preselect');
    expect(result.confidence.margin).not.toBeNull();
    expect(result.confidence.margin as number).toBeGreaterThanOrEqual(0.05);
  });

  it('scopes the prefilter to the region the city hint names, not every loaded region', async () => {
    const db = makeFakeDb([TLV_LOADED], [CAFE_LEVINSKY, UNRELATED_TOKYO_ROW]);
    const resolver = poiIndexPlaceResolver(db as never);

    // Tokyo is not a loaded region here, so a Tokyo-hinted query searches nothing — never falls
    // back to scanning Tel Aviv's rows instead.
    const result = await resolver.resolve(query({ text: 'Onibus Coffee', cityHint: 'Tokyo' }), ctx());

    expect(result.regionsSearched).toEqual([]);
    expect(result.shortlist).toEqual([]);
    expect(result.confidence.band).toBe('no_match');
  });

  it('returns cleanly, with no exception, when nothing in the database matches the candidate', async () => {
    const db = makeFakeDb([TLV_LOADED], [CAFE_LEVINSKY]);
    const resolver = poiIndexPlaceResolver(db as never);

    const result = await resolver.resolve(
      query({ text: 'Xyzzy Nonexistent Venue Zzqx', cityHint: 'Tel Aviv' }),
      ctx(),
    );

    expect(result.regionsSearched).toEqual(['tlv']);
    expect(result.shortlist).toEqual([]);
    expect(result.confidence).toEqual({ band: 'no_match', score: 0, margin: null });
    expect(result.candidatesPrefiltered).toBe(0);
  });

  it('treats an unloaded region as "not loaded", not "no match"', async () => {
    const db = makeFakeDb(
      [{ id: 'tlv', display_name: 'Tel Aviv', norm_version: NORM_VERSION, is_loaded: false }],
      [CAFE_LEVINSKY],
    );
    const resolver = poiIndexPlaceResolver(db as never);

    const result = await resolver.resolve(query({ text: 'Cafe Levinsky', cityHint: 'Tel Aviv' }), ctx());

    expect(result.regionsSearched).toEqual([]);
    expect(result.shortlist).toEqual([]);
  });

  it('drops a loaded region whose norm_version does not match this build, rather than serving it', async () => {
    const stale: PoiRegionRow = { ...TLV_LOADED, norm_version: NORM_VERSION + 1 };
    const db = makeFakeDb([stale], [CAFE_LEVINSKY]);
    const resolver = poiIndexPlaceResolver(db as never);
    const events: { name: string; fields: Record<string, unknown> }[] = [];

    const result = await resolver.resolve(query({ text: 'Cafe Levinsky', cityHint: 'Tel Aviv' }), {
      signal: new AbortController().signal,
      importId: null,
      log: { event: (name, fields) => events.push({ name, fields }) },
    });

    expect(result.regionsSearched).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('poi_index_region_norm_version_mismatch');
  });

  it('never queries the database for an empty query string', async () => {
    const db = makeFakeDb([TLV_LOADED], [CAFE_LEVINSKY]);
    const resolver = poiIndexPlaceResolver(db as never);

    const result = await resolver.resolve(query({ text: '   ', cityHint: 'Tel Aviv' }), ctx());

    expect(result.shortlist).toEqual([]);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('exposes its own provider marker for Ports composition', () => {
    const db = makeFakeDb([TLV_LOADED], []);
    const resolver = poiIndexPlaceResolver(db as never);
    expect(resolver.provider).toBe('overture');
  });
});
