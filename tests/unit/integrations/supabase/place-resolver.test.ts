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
  prefilterTokens,
  overturePlaceResolver,
  supabasePoiIndexGateway,
  type PoiIndexGateway,
  type PoiIndexRow,
  type PoiRegionRow,
} from '@/integrations/supabase/place-resolver';
import { DomainError } from '@/domain/errors';
import { NORM_VERSION } from '@/domain/places/normalise';
import { MAX_QUERY_VARIANTS, matchedTextOf, queryTokens } from '@/domain/places/score';
import type { SupabaseClient } from '@supabase/supabase-js';

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
    tokens: readonly string[];
    queryNorm: string;
    addressHint: string | null;
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

describe('prefilterTokens', () => {
  it('is exactly queryTokens, so both arms of the prefilter ask one question', () => {
    // The property `10` §5's recall gate rests on, and the reason this is not its own tokeniser:
    // the substring arm, the trigram arm and score.ts's tokenCoverage must all be looking at the
    // same list. Asserted as set equality, not as a hand-written expectation, so it keeps holding
    // when SCORING.generic changes underneath it.
    const text = 'Falafel HaKosem';
    expect([...prefilterTokens(text)].sort()).toEqual([...queryTokens(text)].sort());
  });

  it('sends the tokens themselves, not LIKE patterns', () => {
    // Migration 0021 builds both arms from these, so a wildcard here would be a second, quietly
    // different answer to "what does this token match" — the exact drift `10` §4 is about.
    expect(prefilterTokens('Falafel HaKosem')).toEqual(['falafel', 'hakosem']);
  });

  it('keeps Hebrew tokens intact', () => {
    expect(prefilterTokens('פלאפל הקוסם')).toEqual(['הקוסם', 'פלאפל']);
  });

  it('leaves the LIKE wildcard normalise() lets through for SQL to handle', () => {
    // `_` survives normalise() (Python's \w includes it) and is LIKE's single-character wildcard.
    // It used to be rewritten to `*` here because the pattern was a URL fragment. It is not one any
    // more: `0021` widens `_` to `%` and escapes the backslash, in SQL, once.
    expect(prefilterTokens('cafe_bar')).toEqual(['cafe_bar']);
  });

  it('orders longest first and caps the token list', () => {
    const text = Array.from({ length: 30 }, (_, i) => `token${'x'.repeat(i)}`).join(' ');
    const tokens = prefilterTokens(text);
    expect(tokens).toHaveLength(MAX_PREFILTER_TOKENS);
    const lengths = tokens.map((token) => token.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });

  it('is empty for text with no tokens at all', () => {
    expect(prefilterTokens('   ')).toEqual([]);
    expect(prefilterTokens('!!!')).toEqual([]);
  });

  /* --- TLV-BILING-B: the variants ride into the same call ----------------------------------- */

  it('is unchanged by an absent, null or empty variant list', () => {
    expect(prefilterTokens('Falafel HaKosem', null)).toEqual(prefilterTokens('Falafel HaKosem'));
    expect(prefilterTokens('Falafel HaKosem', [])).toEqual(prefilterTokens('Falafel HaKosem'));
  });

  it('asks about the variants too, so a Latin-named row is reachable from a Hebrew caption', () => {
    // The whole retrieval half of the change. Neither name arm of `poi_prefilter` can reach
    // `Kohi Coffee Shop` from `קוהי` — they share no substring and no trigram — so the token has
    // to be in the list.
    const tokens = prefilterTokens('קוהי', ['Kohi']);
    expect(tokens).toContain('קוהי');
    expect(tokens).toContain('kohi');
  });

  it('does not send a token twice when two forms share one', () => {
    // `coffee` would be the obvious second word and it is in `SCORING.generic`, so it never
    // reaches the prefilter at all — hence a real second identity word.
    expect(prefilterTokens('Kohi Basel', ['Kohi'])).toEqual(['basel', 'kohi']);
  });

  it('splits the token budget round-robin rather than longest-first across the forms', () => {
    // A wordy first form must not be able to starve a variant out of the prefilter entirely —
    // that would reintroduce the exact unreachability the variant exists to fix, via a sort order.
    const wordy = Array.from({ length: 20 }, (_, i) => `verylongtoken${'x'.repeat(i)}`).join(' ');
    const tokens = prefilterTokens(wordy, ['kohi']);
    expect(tokens).toHaveLength(MAX_PREFILTER_TOKENS);
    expect(tokens).toContain('kohi');
  });

  it('never asks about more tokens than the cap, however many variants arrive', () => {
    const variants = ['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota', 'kappa lambda'];
    const tokens = prefilterTokens('one two three four five', variants);
    expect(tokens.length).toBeLessThanOrEqual(MAX_PREFILTER_TOKENS);
    // ...and past MAX_QUERY_VARIANTS the extra forms are simply not asked about.
    expect(tokens).not.toContain('kappa');
    expect(MAX_QUERY_VARIANTS).toBe(3);
  });

  it('ignores a variant with no distinctive token, so the prefilter is not widened by a category', () => {
    expect(prefilterTokens('קוהי', ['Coffee Shop'])).toEqual(prefilterTokens('קוהי'));
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

describe('overturePlaceResolver — the address hint (0022, the third prefilter arm)', () => {
  it('passes ResolveQuery.addressHint through verbatim, unparsed and unnormalised', async () => {
    // The one property that matters here. `score.ts` parses the address and compares it against the
    // `address_line` the same call returns; if this file normalised, split or trimmed it, there
    // would be two parsers and `0022` §1's "precision is the scorer's job" would stop being true.
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'Rustico' })]);
    const { ctx } = ctxWith();

    await overturePlaceResolver(gateway).resolve(
      query({ text: 'מסעדת רוסטיקו', addressHint: 'בזל 42, תל אביב' }),
      ctx,
    );

    expect(gateway.prefilterCalls[0]?.addressHint).toBe('בזל 42, תל אביב');
  });

  it('collapses an absent hint to null, so absent and null cannot diverge', async () => {
    // `addressHint` is the one optional field on `ResolveQuery`. `rankPlaces` collapses it with
    // `?? null`; this does the same, so the RPC argument and the cache key agree with the scorer.
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const { ctx } = ctxWith();

    await overturePlaceResolver(gateway).resolve(query({ text: 'HaKosem' }), ctx);
    await overturePlaceResolver(gateway).resolve(
      query({ text: 'HaKosem', addressHint: null }),
      ctx,
    );

    expect(gateway.prefilterCalls.map((call) => call.addressHint)).toEqual([null, null]);
  });

  it('does not let two candidates with the same tokens share a cache entry across addresses', async () => {
    // The defect this is here to prevent, and it is not hypothetical: two candidates in one caption
    // very often share a name token and carry different addresses. Keyed on tokens alone, the
    // second would silently be served the FIRST one's address arm — the wrong rows, from a cache,
    // with nothing in the logs to show it.
    const gateway = fakeGateway([region({ id: 'tlv' })], [row({ name: 'האחים' })]);
    const resolver = overturePlaceResolver(gateway);
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'האחים', addressHint: 'אבן גבירול 26' }), ctx);
    await resolver.resolve(query({ text: 'האחים', addressHint: 'לבונטין 19' }), ctx);
    // ...and the same address really does still hit the cache, or the key would be useless.
    await resolver.resolve(query({ text: 'האחים', addressHint: 'אבן גבירול 26' }), ctx);

    expect(gateway.prefilterCalls.map((call) => call.addressHint)).toEqual([
      'אבן גבירול 26',
      'לבונטין 19',
    ]);
  });

  it('keeps a null-address query out of an addressed query\'s cache entry', async () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const resolver = overturePlaceResolver(gateway);
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'WOW', addressHint: null }), ctx);
    await resolver.resolve(query({ text: 'WOW', addressHint: 'בית אשל 15' }), ctx);

    expect(gateway.prefilterCalls).toHaveLength(2);
  });
});

describe('overturePlaceResolver — textVariants (TLV-BILING-B)', () => {
  it('sends the variants tokens in the SAME prefilter call, not a second one', () => {
    // One round trip per candidate, unchanged. Both name arms of `poi_prefilter` are per-token
    // disjunctions, so the union of the forms tokens returns the union of the rows.
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const { ctx } = ctxWith();
    return overturePlaceResolver(gateway)
      .resolve(query({ text: 'קוהי', textVariants: ['Kohi'] }), ctx)
      .then(() => {
        expect(gateway.prefilterCalls).toHaveLength(1);
        expect(gateway.prefilterCalls[0]!.tokens).toContain('kohi');
        expect(gateway.prefilterCalls[0]!.tokens).toContain('קוהי');
      });
  });

  it('collapses an absent variant list to the same call an explicit empty one makes', async () => {
    const absent = fakeGateway([region({ id: 'tlv' })], []);
    const empty = fakeGateway([region({ id: 'tlv' })], []);
    const { ctx } = ctxWith();
    await overturePlaceResolver(absent).resolve(query({ text: 'Kohi' }), ctx);
    await overturePlaceResolver(empty).resolve(query({ text: 'Kohi', textVariants: [] }), ctx);
    expect(empty.prefilterCalls).toEqual(absent.prefilterCalls);
  });

  it('keeps queryNorm as the primary text, because it only orders rows below the cap', () => {
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const { ctx } = ctxWith();
    return overturePlaceResolver(gateway)
      .resolve(query({ text: 'קוהי', textVariants: ['Kohi'] }), ctx)
      .then(() => {
        expect(gateway.prefilterCalls[0]!.queryNorm).toBe('קוהי');
      });
  });

  it('retrieves a Latin-named row from a Hebrew caption and scores it through the variant', async () => {
    // The end-to-end shape of the fix, at the adapter: the row comes back from the prefilter and
    // the scorer can finally see it, with provenance saying which form matched.
    const gateway = fakeGateway(
      [region({ id: 'tlv' })],
      [row({ name: 'Kohi Coffee Shop', address_line: 'בן יהודה 155', provider_category: 'coffee_shop' })],
    );
    const { ctx } = ctxWith();
    const result = await overturePlaceResolver(gateway).resolve(
      query({
        text: 'קוהי',
        categoryHint: 'cafe',
        addressHint: 'בן יהודה 155',
        textVariants: ['Kohi'],
      }),
      ctx,
    );
    expect(result.shortlist[0]!.place.name).toBe('Kohi Coffee Shop');
    expect(matchedTextOf(result.shortlist[0]!)).toBe('Kohi');
    // A lone candidate still has an unmeasured margin, so it is `confirm`, not an auto-accept.
    expect(result.confidence.band).toBe('confirm');
  });

  it('does not let two candidates with different variants share a cache entry', async () => {
    // The variants enter the cache key through `tokens`, which is the whole of what the name arms
    // select on — so different variants genuinely are different queries.
    const gateway = fakeGateway([region({ id: 'tlv' })], []);
    const resolver = overturePlaceResolver(gateway);
    const { ctx } = ctxWith();
    await resolver.resolve(query({ text: 'קוהי', textVariants: ['Kohi'] }), ctx);
    await resolver.resolve(query({ text: 'קוהי', textVariants: ['Kohee'] }), ctx);
    expect(gateway.prefilterCalls).toHaveLength(2);
    await resolver.resolve(query({ text: 'קוהי', textVariants: ['Kohi'] }), ctx);
    expect(gateway.prefilterCalls).toHaveLength(2);
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

/* ------------------------------------------------------------------------------------------- *
 * The Supabase gateway — the only part of this file that knows an RPC name and four argument
 * names. None of it is type-checked against the database, so a rename lands as an empty prefilter
 * that reads exactly like bad data. That is what these two tests are for.
 * ------------------------------------------------------------------------------------------- */

describe('supabasePoiIndexGateway', () => {
  interface RpcCall {
    readonly fn: string;
    readonly args: Record<string, unknown>;
  }

  function stubClient(rows: readonly PoiIndexRow[], calls: RpcCall[]): SupabaseClient {
    const builder = {
      abortSignal: () => Promise.resolve({ data: rows, error: null }),
    };
    return {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return builder;
      },
    } as unknown as SupabaseClient;
  }

  it('calls poi_prefilter with the five argument names migration 0022 declares', async () => {
    const calls: RpcCall[] = [];
    const gateway = supabasePoiIndexGateway(stubClient([row({ name: 'Bellboy' })], calls));

    const out = await gateway.prefilter(
      {
        regionIds: ['tlv'],
        tokens: ['belboy'],
        queryNorm: 'belboy tel aviv',
        addressHint: null,
        limit: 500,
      },
      new AbortController().signal,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe('poi_prefilter');
    // Named exactly, not `toMatchObject`: a SURPLUS argument is a 404 from PostgREST, because it
    // resolves an RPC by its full named-argument set. Both directions have to be right.
    expect(Object.keys(calls[0]?.args ?? {}).sort()).toEqual([
      'p_address_hint',
      'p_limit',
      'p_query_norm',
      'p_region_ids',
      'p_tokens',
    ]);
    expect(calls[0]?.args).toEqual({
      p_region_ids: ['tlv'],
      p_tokens: ['belboy'],
      p_query_norm: 'belboy tel aviv',
      p_address_hint: null,
      p_limit: 500,
    });
    expect(out).toHaveLength(1);
  });

  it('sends a plain array, not a readonly view the driver would serialise oddly', async () => {
    const calls: RpcCall[] = [];
    const gateway = supabasePoiIndexGateway(stubClient([], calls));
    const regionIds: readonly string[] = ['tlv', 'tyo'];

    await gateway.prefilter(
      { regionIds, tokens: ['a'], queryNorm: 'a', addressHint: null, limit: 1 },
      new AbortController().signal,
    );

    expect(Array.isArray(calls[0]?.args.p_region_ids)).toBe(true);
    expect(calls[0]?.args.p_region_ids).not.toBe(regionIds);
  });

  it('caps at the number migration 0021 also enforces server-side', () => {
    // Two ceilings, one number. `0021` clamps `p_limit` into [1, 500] itself — the cap is what
    // stands between eight candidates per import and a timeout, so it does not live only here.
    // If this constant ever moves, the migration has to move with it.
    expect(MAX_PREFILTER_ROWS).toBe(500);
    expect(MAX_PREFILTER_TOKENS).toBe(12);
  });
});
