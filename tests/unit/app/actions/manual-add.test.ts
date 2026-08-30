/**
 * `addPlaceManually` — the call sequence, and the three absences that make it correct.
 *
 * The two Supabase clients and the resolver factory are mocked; **`supabasePlaceStore` is not**.
 * That is the point of the file: the settled sequence (`resolve_place` on the service client → an
 * RLS-scoped duplicate read on the *user's* client → `save_place` on the user's session) lives
 * inside that adapter, so mocking it would leave nothing here worth asserting. With the real
 * adapter running, every RPC and every table read is recorded against the client it was made on,
 * and so is which of them never happened.
 *
 * What this cannot prove, stated so nobody reads more into it: RLS. Whether `save_place` writes
 * only the caller's row is a property of Postgres, and asserting it against a mock would be
 * asserting it against this file's own beliefs. `supabase/tests/0008_policy_tests.sql` is where
 * that lives, and the 2026-08-29 probe against the local container — a user with zero `imports`
 * rows landing `origin='manual'` — is why this path needs no migration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RankedPlace, ResolveQuery, ResolveResult, ResolvedPlace } from '@/domain/types';

// `place-store.ts` opens with `import 'server-only'`, a module that throws unless it is resolved
// under a server condition. Stubbing it is not weakening the boundary it guards: what it protects
// is the bundler boundary, and `npm run check:layers` is what asserts that — the same stub, for the
// same reason, as `tests/unit/app/api/imports/confirm.test.ts`.
vi.mock('server-only', () => ({}));

/** Which client a call was made on, so "the service role did the dedup read" would fail here. */
type Client = 'service' | 'user';

interface RecordedRpc {
  readonly client: Client;
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

interface RecordedSelect {
  readonly client: Client;
  readonly table: string;
  readonly filter: { readonly column: string; readonly value: unknown };
}

const rpcs: RecordedRpc[] = [];
const selects: RecordedSelect[] = [];
const revalidated: string[] = [];
const queries: ResolveQuery[] = [];

let currentUser: { id: string } | null = { id: 'user-1' };
/** What the fake resolver does when asked. A function so a test can make it throw. */
let resolveWith: () => ResolveResult = () => answered([TOP]);
/** The row the duplicate read finds, or `null` for "not saved yet". */
let existingSave: { id: string } | null = null;

function place(name: string): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: `places/${name}`,
    sourceDataset: 'google-places',
    regionId: null,
    name,
    altNames: [],
    providerCategory: 'coffee_shop',
    addressLine: '4 Levinsky St',
    locality: 'Tel Aviv-Yafo',
    lat: 32.0567,
    lng: 34.7745,
    datasetConfidence: 0.5,
  };
}

const TOP: RankedPlace = {
  place: place('Cafe Levinsky 41'),
  score: 0.94,
  nameScore: 0.94,
  tokenCoverage: 1,
  categoryScore: 1,
};

function answered(shortlist: readonly RankedPlace[]): ResolveResult {
  return {
    shortlist,
    confidence: { band: 'preselect', score: shortlist[0]?.score ?? 0, margin: null },
    regionsSearched: [],
    candidatesPrefiltered: shortlist.length,
  };
}

/** One fake PostgREST client, tagged with which of the two roles it is. */
function client(tag: Client) {
  return {
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ client: tag, fn, args });
      if (fn === 'resolve_place') return Promise.resolve({ data: 'place-1', error: null });
      if (fn === 'save_place') return Promise.resolve({ data: 'saved-1', error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle() {
                  selects.push({ client: tag, table, filter: { column, value } });
                  return Promise.resolve({ data: existingSave, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => client('user'),
}));

vi.mock('@/integrations/supabase/service-role-client', () => ({
  serviceRoleClient: () => client('service'),
}));

vi.mock('@/integrations/places/place-resolver-factory', () => ({
  placeResolverEnv: () => ({}),
  createPlaceResolver: () => ({
    provider: 'google' as const,
    resolve: async (query: ResolveQuery) => {
      queries.push(query);
      return resolveWith();
    },
  }),
}));

const { addPlaceManually } = await import('@/app/actions/manual-add');

beforeEach(() => {
  rpcs.length = 0;
  selects.length = 0;
  revalidated.length = 0;
  queries.length = 0;
  currentUser = { id: 'user-1' };
  existingSave = null;
  resolveWith = () => answered([TOP]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('addPlaceManually', () => {
  it('resolves once, checks for a duplicate as the user, then saves as the user', async () => {
    await expect(addPlaceManually('Cafe Levinsky')).resolves.toEqual({
      ok: true,
      placeId: 'place-1',
      savedPlaceId: 'saved-1',
      // The provider's name for the row that was written, not the string that was typed.
      name: 'Cafe Levinsky 41',
      alreadySaved: false,
    });

    expect(rpcs.map((call) => [call.client, call.fn])).toEqual([
      ['service', 'resolve_place'],
      ['user', 'save_place'],
    ]);
    expect(selects).toEqual([
      { client: 'user', table: 'saved_places', filter: { column: 'place_id', value: 'place-1' } },
    ]);
    expect(revalidated).toEqual(['/map']);
  });

  it('never calls apply_saved_place_extraction — there is no caption to have earned tags', async () => {
    // The whole reason `enrichment: null` is passed. Inventing tags, dishes or a `why_go` for a
    // place someone typed is the uncertainty-into-certainty failure the working agreement forbids,
    // and this is the assertion that would fail if a later edit "filled them in".
    await addPlaceManually('Cafe Levinsky');
    expect(rpcs.map((call) => call.fn)).not.toContain('apply_saved_place_extraction');
  });

  it('saves with no source, no note and no extracted reason', async () => {
    await addPlaceManually('Cafe Levinsky');
    const save = rpcs.find((call) => call.fn === 'save_place');
    expect(save?.args).toEqual({
      p_place_id: 'place-1',
      // Null is what `save_place` reads as `origin='manual'`; it is also what keeps the call out of
      // `saved_place_sources` and therefore out of `sps_insert_own`'s reach entirely.
      p_source_id: null,
      p_note: null,
      // `saved_places.extracted_reason` holds a verbatim caption quote. There is no caption.
      p_extracted_reason: null,
    });
  });

  it('writes the resolver score and the provider identity, and no country or category it did not have', async () => {
    await addPlaceManually('Cafe Levinsky');
    const resolve = rpcs.find((call) => call.fn === 'resolve_place');
    expect(resolve?.args).toMatchObject({
      p_provider: 'google',
      p_provider_place_id: 'places/Cafe Levinsky 41',
      p_name: 'Cafe Levinsky 41',
      p_lat: 32.0567,
      p_lng: 34.7745,
      p_resolution_score: 0.94,
      // No extraction, so no category of ours; the read path derives what is shown from
      // `provider_category`, which is the provider's own word and is passed through.
      p_category: null,
      p_provider_category: 'coffee_shop',
      // `ResolvedPlace` carries no country and no caption named one. Guessing it from the locality
      // is the fabrication `candidate-place.ts` refuses for the same field.
      p_country_code: null,
    });
  });

  it('reports a place the user already had rather than claiming a fresh save', async () => {
    existingSave = { id: 'saved-1' };
    await expect(addPlaceManually('Cafe Levinsky')).resolves.toMatchObject({
      ok: true,
      alreadySaved: true,
    });
  });

  it('spends no lookup on an empty field', async () => {
    // The manual-add row is offered under an empty field, so this press is reachable. At 100
    // lookups a day, a stray tap must not cost one.
    const result = await addPlaceManually('   ');
    expect(result).toEqual({ ok: false, message: 'Type the place’s name first.' });
    expect(queries).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('spends no lookup when there is no session', async () => {
    currentUser = null;
    await expect(addPlaceManually('Cafe Levinsky')).resolves.toEqual({
      ok: false,
      message: 'You are signed out. Sign in and try again.',
    });
    expect(queries).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('makes exactly one provider lookup per call, carrying the typed name verbatim', async () => {
    await addPlaceManually('  Cafe   Levinsky  ');
    expect(queries).toHaveLength(1);
    expect(queries[0]?.text).toBe('Cafe Levinsky');
    expect(queries[0]?.cityHint).toBeNull();
  });

  it('writes nothing at all when the provider found nothing', async () => {
    // The honest dead-end. No city centroid, no map centre, no "close enough" pin — those would be
    // indistinguishable from a real coordinate on the map.
    resolveWith = () => answered([]);
    await expect(addPlaceManually('a place that does not exist')).resolves.toEqual({
      ok: false,
      message: 'We couldn’t find that place. Try its full name, and the city.',
    });
    expect(rpcs).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  it('lets no provider error text reach the caller', async () => {
    resolveWith = () => {
      throw new Error('Google Places 429: quota exceeded for project 12345');
    };
    const result = await addPlaceManually('Cafe Levinsky');
    expect(result).toEqual({ ok: false, message: 'Couldn’t search for places just now. Try again.' });
    if (!result.ok) {
      expect(result.message).not.toContain('Google');
      expect(result.message).not.toContain('429');
    }
    expect(rpcs).toEqual([]);
  });
});
