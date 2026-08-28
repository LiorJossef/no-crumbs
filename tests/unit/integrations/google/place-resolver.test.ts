/**
 * The Google adapter's own decisions — mapping, query building, and the two places where its
 * semantics deliberately differ from the Overture adapter's.
 *
 * Scoring is **not** tested here. This adapter hands `scoreCandidates` its candidates and returns
 * what it gets back, so re-asserting band arithmetic would be testing `score.ts` through a second
 * door and would let the two drift into disagreeing about what a band means.
 */

import { describe, expect, it, vi } from 'vitest';

// The module opens with `import 'server-only'`, which throws outside a server bundle. What that
// package protects is the bundler boundary, not this test — same mock, same reason, as
// `integrations/supabase/place-resolver.test.ts`.
vi.mock('server-only', () => ({}));

import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { ResolveQuery } from '@/domain/types';
import {
  buildTextQuery,
  GLOBAL_REGION,
  GOOGLE_TIMEOUT_MS,
  languageCodeFor,
  GOOGLE_DATASET_CONFIDENCE,
  googlePlaceResolver,
  MAX_GOOGLE_RESULTS,
  toResolvedPlace,
  type GooglePlaceRow,
  type GooglePlacesGateway,
  type GoogleTextSearchParams,
} from '@/integrations/google/place-resolver';
import type { PlaceLookupStore } from '@/integrations/places/lookup-cache';

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
    cityHint: 'תל אביב',
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: null,
    ...overrides,
  };
}

/** Shaped from a real `places:searchText` response (Palette Bistro, Tel Aviv). */
function row(overrides: Partial<GooglePlaceRow> = {}): GooglePlaceRow {
  return {
    id: 'ChIJ_aFvsI5NHRUR02K8oJ8b4c8',
    displayName: { text: 'Palette Bistro' },
    addressComponents: [
      { longText: '22', shortText: '22', types: ['street_number'] },
      { longText: 'Jerusalem Boulevard', shortText: 'Jerusalem Blvd', types: ['route'] },
      { longText: 'Tel Aviv-Yafo', shortText: 'Tel Aviv-Yafo', types: ['locality', 'political'] },
      { longText: 'Israel', shortText: 'IL', types: ['country', 'political'] },
      { longText: '6802203', shortText: '6802203', types: ['postal_code'] },
    ],
    location: { latitude: 32.054024, longitude: 34.7592769 },
    primaryType: 'restaurant',
    ...overrides,
  };
}

function gatewayReturning(
  rows: readonly GooglePlaceRow[],
  seen?: GoogleTextSearchParams[],
): GooglePlacesGateway {
  return {
    searchText: (params) => {
      seen?.push(params);
      return Promise.resolve(rows);
    },
  };
}

/* ------------------------------------------------------------------------------------------- */

describe('toResolvedPlace', () => {
  it('maps a Text Search result onto the shared ResolvedPlace shape', () => {
    const place = toResolvedPlace(row());

    expect(place).not.toBeNull();
    expect(place?.provider).toBe('google');
    expect(place?.sourceDataset).toBe('google-places');
    expect(place?.providerPlaceId).toBe('ChIJ_aFvsI5NHRUR02K8oJ8b4c8');
    expect(place?.name).toBe('Palette Bistro');
    expect(place?.locality).toBe('Tel Aviv-Yafo');
    expect(place?.providerCategory).toBe('restaurant');
    expect(place?.lat).toBeCloseTo(32.054024, 6);
  });

  it('builds addressLine from components as street-then-number, never from a formatted string', () => {
    // The postcode is the reason. `parseAddress` reads a bare number as a house number, and
    // `addressScore` treats a house-number mismatch as conclusive — so comparing on `6802203`
    // instead of `22` would not weaken a row, it would zero it.
    const place = toResolvedPlace(row());
    expect(place?.addressLine).toBe('Jerusalem Boulevard 22');
    expect(place?.addressLine).not.toContain('6802203');
  });

  it('falls back to the route alone when there is no street number', () => {
    const place = toResolvedPlace(
      row({ addressComponents: [{ longText: 'Rothschild Boulevard', types: ['route'] }] }),
    );
    expect(place?.addressLine).toBe('Rothschild Boulevard');
  });

  it('has no address line at all when Google returned no route', () => {
    const place = toResolvedPlace(row({ addressComponents: [] }));
    // null, not '' — `addressScore` reads null as "no comparison possible" and leaves the score
    // untouched, which is the honest outcome for a row we cannot place.
    expect(place?.addressLine).toBeNull();
  });

  it('reports the neutral dataset confidence rather than inventing one', () => {
    expect(toResolvedPlace(row())?.datasetConfidence).toBe(GOOGLE_DATASET_CONFIDENCE);
    expect(GOOGLE_DATASET_CONFIDENCE).toBe(0.5);
  });

  it('carries no alternate names, because Text Search returns none', () => {
    expect(toResolvedPlace(row())?.altNames).toEqual([]);
  });

  it('has a null regionId — this provider is not region-scoped', () => {
    expect(toResolvedPlace(row())?.regionId).toBeNull();
  });

  it('drops a result with no name or no point instead of scoring a placeholder', () => {
    // Built literally rather than through `row()`: under `exactOptionalPropertyTypes` an absent
    // key and a key set to `undefined` are different types, and absent is what Google sends.
    const point = { latitude: 32.05, longitude: 34.77 };
    expect(toResolvedPlace({ id: 'a', location: point })).toBeNull();
    expect(toResolvedPlace({ id: 'b', displayName: { text: '' }, location: point })).toBeNull();
    expect(toResolvedPlace({ id: 'c', displayName: { text: 'Somewhere' } })).toBeNull();
    expect(
      toResolvedPlace({ id: 'd', displayName: { text: 'Somewhere' }, location: { latitude: 32.05 } }),
    ).toBeNull();
  });
});

describe('buildTextQuery', () => {
  it('appends the city hint, which is what disambiguates a chain name', () => {
    expect(buildTextQuery(query({ text: 'רוסטיקו' }))).toBe('רוסטיקו, תל אביב');
  });

  it('sends the bare name when there is no usable city hint', () => {
    expect(buildTextQuery(query({ text: 'Rustico', cityHint: null }))).toBe('Rustico');
    expect(buildTextQuery(query({ text: 'Rustico', cityHint: '   ' }))).toBe('Rustico');
  });

  it('never folds the address hint into the query — recall must not depend on it', () => {
    const built = buildTextQuery(query({ text: 'בראסרי 18', addressHint: 'לבונטין 19' }));
    expect(built).toBe('בראסרי 18, תל אביב');
    expect(built).not.toContain('לבונטין');
  });
});

describe('GOOGLE_TIMEOUT_MS', () => {
  it('bounds a single lookup well inside a tolerable import', () => {
    // `resolveCandidates` is sequential and `MAX_CANDIDATES` is 7, so an untimed provider bounds
    // the whole import at "however long seven hung requests take". Measured for real: with the
    // project's Text Search quota exhausted, a 5-candidate import sat on a spinner for 47 s.
    expect(GOOGLE_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
    expect(GOOGLE_TIMEOUT_MS * 7).toBeLessThan(45_000);
  });
});

describe('languageCodeFor', () => {
  it('asks for Hebrew when the caption wrote in Hebrew', () => {
    // Not cosmetic: unset, Google answered `האחים` with `Haachim @ Shlomo Ibn Gabirol Street 26` —
    // the right venue under a name it does not use, and an address `addressScore` cannot compare
    // against a Hebrew hint at all (it returns null across writing systems).
    expect(languageCodeFor(query({ text: 'האחים' }))).toBe('he');
    expect(languageCodeFor(query({ text: 'Rustico', cityHint: 'תל אביב' }))).toBe('he');
  });

  it('leaves the language to Google when nothing in the query is Hebrew', () => {
    // Hebrew↔English is the language scope; this stays global rather than pinned to one market.
    expect(languageCodeFor(query({ text: 'Ha Kosem', cityHint: 'Tel Aviv' }))).toBeNull();
    expect(languageCodeFor(query({ text: 'Glitch Coffee', cityHint: 'Tokyo' }))).toBeNull();
  });
});

describe('googlePlaceResolver', () => {
  it('declares the provider it writes into place_provider_refs', () => {
    expect(googlePlaceResolver(gatewayReturning([])).provider).toBe('google');
  });

  it('reports a searched region even with no results, so a miss is "not found" not "not loaded"', async () => {
    const { ctx } = ctxWith();
    const result = await googlePlaceResolver(gatewayReturning([])).resolve(
      query({ text: 'nowhere at all' }),
      ctx,
    );

    // The distinction this asserts is the whole reason GLOBAL_REGION exists: an empty
    // `regionsSearched` is the UI's "we don't have that city yet", which would be a lie for a
    // global provider.
    expect(result.regionsSearched).toEqual([GLOBAL_REGION]);
    expect(result.shortlist).toEqual([]);
    expect(result.confidence.band).toBe('no_match');
    expect(result.confidence.margin).toBeNull();
  });

  it('ranks through the shared scorer and reports what the prefilter returned', async () => {
    const { ctx } = ctxWith();
    const result = await googlePlaceResolver(
      gatewayReturning([
        row({ id: 'a', displayName: { text: 'Palette Bistro' } }),
        row({ id: 'b', displayName: { text: 'Paulette' } }),
      ]),
    ).resolve(query({ text: 'Palette Bistro' }), ctx);

    expect(result.candidatesPrefiltered).toBe(2);
    expect(result.shortlist[0]?.place.name).toBe('Palette Bistro');
    expect(result.shortlist[0]?.score).toBeGreaterThan(result.shortlist[1]?.score ?? 1);
  });

  it('does not count an unmappable result as a candidate', async () => {
    const { ctx } = ctxWith();
    const result = await googlePlaceResolver(
      gatewayReturning([row(), { id: 'x', displayName: { text: 'No point' } }]),
    ).resolve(query({ text: 'Palette Bistro' }), ctx);

    expect(result.candidatesPrefiltered).toBe(1);
  });

  it('passes a two-letter country hint through as a region code, upper-cased', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const { ctx } = ctxWith();
    await googlePlaceResolver(gatewayReturning([], seen)).resolve(
      query({ text: 'Rustico', countryHint: 'il' }),
      ctx,
    );

    expect(seen[0]?.regionCode).toBe('IL');
    expect(seen[0]?.maxResultCount).toBe(MAX_GOOGLE_RESULTS);
    expect(seen[0]?.languageCode).toBe('he');
  });

  it('sends no region code for a hint that is not an alpha-2 code', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const { ctx } = ctxWith();
    await googlePlaceResolver(gatewayReturning([], seen)).resolve(
      query({ text: 'Rustico', countryHint: 'Israel' }),
      ctx,
    );

    expect(seen[0]?.regionCode).toBeNull();
  });

  it('converts a gateway failure into a DomainError and keeps the vendor shape out of the view', async () => {
    const { ctx } = ctxWith();
    const resolver = googlePlaceResolver({
      searchText: () => Promise.reject(new Error('PERMISSION_DENIED: key ABC123 is invalid')),
    });

    const error = await resolver.resolve(query({ text: 'Rustico' }), ctx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect(JSON.stringify((error as DomainError).toView())).not.toContain('ABC123');
  });

  it('logs the resolve without putting a name or a coordinate in the log line', async () => {
    const { ctx, logs } = ctxWith();
    await googlePlaceResolver(gatewayReturning([row()])).resolve(
      query({ text: 'Palette Bistro' }),
      ctx,
    );

    const line = logs.find((l) => l.name === 'places.resolve');
    expect(line?.fields).toEqual({ provider: 'google', results: 1, scored: 1 });
    // Charter R9: structured fields only, never a caption, a name or a point.
    const serialised = JSON.stringify(line);
    expect(serialised).not.toContain('Palette');
    expect(serialised).not.toContain('32.05');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The lookup cache, as this adapter wires it. The cache's own behaviour is
 * `tests/unit/integrations/places/lookup-cache.test.ts`; what is asserted here is the wiring —
 * which key, and that a hit really does skip the network.
 * ------------------------------------------------------------------------------------------- */

describe('googlePlaceResolver with a lookup store', () => {
  function recordingStore(): { store: PlaceLookupStore; rows: Map<string, unknown>; gets: string[] } {
    const rows = new Map<string, unknown>();
    const gets: string[] = [];
    return {
      rows,
      gets,
      store: {
        get: (hash) => {
          gets.push(hash);
          return Promise.resolve(rows.get(hash) ?? null);
        },
        put: (entry) => {
          rows.set(entry.lookupHash, entry.response);
          return Promise.resolve();
        },
      },
    };
  }

  it('spends one Text Search request for two identical resolves', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const { store } = recordingStore();
    const resolver = googlePlaceResolver(gatewayReturning([row()], seen), { lookupStore: store });
    const { ctx } = ctxWith();

    const first = await resolver.resolve(query({ text: 'Palette Bistro' }), ctx);
    const second = await resolver.resolve(query({ text: 'Palette Bistro' }), ctx);

    expect(seen).toHaveLength(1);
    // Identical shortlists, because the ranker ran twice over the same provider rows — which is
    // the consistency half of why this cache exists, not only the quota half.
    expect(second.shortlist).toEqual(first.shortlist);
    expect(second.confidence).toEqual(first.confidence);
  });

  it('keys on the request, so a different city hint is a different lookup', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const { store } = recordingStore();
    const resolver = googlePlaceResolver(gatewayReturning([row()], seen), { lookupStore: store });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'Rustico', cityHint: 'תל אביב' }), ctx);
    await resolver.resolve(query({ text: 'Rustico', cityHint: 'London' }), ctx);

    expect(seen).toHaveLength(2);
  });

  it('does not key on categoryHint, which never reaches Google and so cannot change its answer', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const { store } = recordingStore();
    const resolver = googlePlaceResolver(gatewayReturning([row()], seen), { lookupStore: store });
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'Rustico', categoryHint: 'cafe' }), ctx);
    await resolver.resolve(query({ text: 'Rustico', categoryHint: 'restaurant' }), ctx);

    expect(seen).toHaveLength(1);
  });

  it('stores the raw provider rows, not a ranked result', async () => {
    const { store, rows } = recordingStore();
    const { ctx } = ctxWith();
    await googlePlaceResolver(gatewayReturning([row()]), { lookupStore: store }).resolve(
      query({ text: 'Palette Bistro' }),
      ctx,
    );

    const stored = [...rows.values()][0] as { rows: readonly GooglePlaceRow[] };
    // Google's own shape, verbatim. A `score` or a `band` in here would mean a scoring change
    // silently serves a ranking the current scorer would not produce.
    expect(stored.rows[0]).toEqual(row());
    expect(JSON.stringify(stored)).not.toContain('score');
  });

  it('goes to the network on every resolve when no store is configured', async () => {
    const seen: GoogleTextSearchParams[] = [];
    const resolver = googlePlaceResolver(gatewayReturning([row()], seen));
    const { ctx } = ctxWith();

    await resolver.resolve(query({ text: 'Palette Bistro' }), ctx);
    await resolver.resolve(query({ text: 'Palette Bistro' }), ctx);

    expect(seen).toHaveLength(2);
  });
});
