import 'server-only';

/**
 * Selects the `PlaceResolver` adapter by config — Google Places or the Overture `poi_index` — at
 * the composition root, never a code fork and never an `if (stage === ...)` scattered through
 * resolution logic. Same shape as `llm/place-extractor-factory.ts`.
 *
 * ## Why this file has a gate in it and the extractor factory does not
 *
 * The owner ruled on 2026-08-28 that **Google Places is the primary direction** for place
 * resolution, and in the same breath that **the map renderer stays MapLibre for now**, with a
 * Google Maps renderer prototype as the next thing to build so both can be compared.
 *
 * Those two facts do not compose for a production end user. `06-map-and-places-decision.md` §3.1
 * is VERIFIED: Google Places content may not be used in conjunction with a non-Google map
 * (Service Specific Terms §5.3). So the ruling is honoured as a *sequencing* answer:
 *
 *  - Google is the default everywhere we develop and measure — local, preview, staging.
 *  - Production falls back to Overture until the renderer moves, or until someone sets
 *    `PLACE_RESOLVER=google` deliberately, having read this.
 *
 * The gate is code rather than prose because a documented-only gate is one refactor from gone, and
 * this one is a terms-of-service boundary, not a preference.
 *
 * **When the Google renderer prototype ships, this gate is what to delete.** It has no other job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlaceResolver } from '@/domain/ports';
import { googlePlaceResolver, googlePlacesGateway } from '@/integrations/google/place-resolver';
import { supabasePlaceLookupStore } from '@/integrations/supabase/place-lookup-store';
import { overturePlaceResolver, supabasePoiIndexGateway } from '@/integrations/supabase/place-resolver';

export type ResolverProvider = 'google' | 'overture';

export interface PlaceResolverEnv {
  readonly PLACE_RESOLVER?: string;
  /**
   * `off` disables the shared provider-response cache (`place_lookups`). Anything else, including
   * unset, leaves it on.
   *
   * It exists because a cache you cannot switch off is a debugging hazard: "is this a stale answer
   * or a bad one" is otherwise unanswerable without a psql session. It is not a fallback — a cache
   * failure already degrades to a miss on its own (`supabase/place-lookup-store.ts`).
   */
  readonly PLACE_LOOKUP_CACHE?: string;
  /**
   * Server-only key, and the one that should be used. Preferred over the `NEXT_PUBLIC_` key below
   * because that one is compiled into the browser bundle: anyone can read it and spend our quota.
   */
  readonly GOOGLE_PLACES_API_KEY?: string;
  /** The key that already exists in `.env.local`. Browser-exposed — acceptable for local work,
   *  never for a deploy. See `apiKeyFor` for why it is still read. */
  readonly NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  readonly NEXT_PUBLIC_STAGE?: string;
}

/**
 * Stages where serving Google-resolved coordinates is fine because no end user is being served a
 * Google-content-on-MapLibre pairing — we are.
 *
 * An **unknown or unset stage counts as production**, deliberately. Failing safe toward the
 * compliant pairing costs a measurement; failing open costs a terms breach.
 */
const NON_PRODUCTION_STAGES: ReadonlySet<string> = new Set(['local', 'preview', 'staging', 'test']);

function apiKeyFor(env: PlaceResolverEnv): string | null {
  const serverKey = env.GOOGLE_PLACES_API_KEY;
  if (serverKey !== undefined && serverKey !== '') return serverKey;
  const publicKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return publicKey !== undefined && publicKey !== '' ? publicKey : null;
}

/**
 * Which provider this environment resolves with, and why — exported separately from
 * `createPlaceResolver` so a route can report it, a test can assert it, and the harness can print
 * it, without any of them building a resolver or reaching for a Supabase client.
 */
export function resolverProviderFor(env: PlaceResolverEnv): {
  readonly provider: ResolverProvider;
  readonly reason: string;
} {
  const explicit = env.PLACE_RESOLVER;
  if (explicit === 'google' || explicit === 'overture') {
    return { provider: explicit, reason: `PLACE_RESOLVER=${explicit}` };
  }
  if (explicit !== undefined && explicit !== '') {
    throw new Error(`Unknown PLACE_RESOLVER "${explicit}". Expected "google" or "overture".`);
  }

  const stage = env.NEXT_PUBLIC_STAGE ?? '';
  if (!NON_PRODUCTION_STAGES.has(stage)) {
    return {
      provider: 'overture',
      reason: `stage "${stage === '' ? '(unset)' : stage}" is treated as production; Google Places may not be paired with a non-Google map (06 §3.1)`,
    };
  }

  if (apiKeyFor(env) === null) {
    return { provider: 'overture', reason: 'no Google Places API key configured' };
  }
  return { provider: 'google', reason: `stage "${stage}" with a Google key` };
}

/**
 * `process.env` narrowed to this factory's four keys. `ProcessEnv` has no index signature under
 * this tsconfig, so the spread has to be explicit; doing it here rather than at each call site
 * keeps the route thin and means the key list has one home.
 */
export function placeResolverEnv(): PlaceResolverEnv {
  return {
    ...(process.env.PLACE_RESOLVER !== undefined ? { PLACE_RESOLVER: process.env.PLACE_RESOLVER } : {}),
    ...(process.env.PLACE_LOOKUP_CACHE !== undefined
      ? { PLACE_LOOKUP_CACHE: process.env.PLACE_LOOKUP_CACHE }
      : {}),
    ...(process.env.GOOGLE_PLACES_API_KEY !== undefined
      ? { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY }
      : {}),
    ...(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY !== undefined
      ? { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY }
      : {}),
    ...(process.env.NEXT_PUBLIC_STAGE !== undefined
      ? { NEXT_PUBLIC_STAGE: process.env.NEXT_PUBLIC_STAGE }
      : {}),
  };
}

/** Whether the shared provider-response cache is wired in. Off only when explicitly switched off. */
export function lookupCacheEnabled(env: PlaceResolverEnv): boolean {
  return env.PLACE_LOOKUP_CACHE !== 'off';
}

/**
 * `env` is passed explicitly rather than read from `process.env` in here, so a test can compose a
 * resolver deterministically. `db` is used on both paths now: the Overture resolver reads
 * `poi_index` through it, and the Google resolver reads and writes `place_lookups` through it.
 *
 * The Overture path takes no lookup cache. It has nothing to buy: it is a query against a table in
 * the same database, so a cache entry would be a round trip saving a round trip, and its adapter
 * already holds a bounded in-process cache of prefiltered rows for the within-import case.
 */
export function createPlaceResolver(env: PlaceResolverEnv, db: SupabaseClient): PlaceResolver {
  const { provider } = resolverProviderFor(env);

  if (provider === 'google') {
    const apiKey = apiKeyFor(env);
    if (apiKey === null) {
      throw new Error('A Google Places API key is required when PLACE_RESOLVER=google.');
    }
    return googlePlaceResolver(googlePlacesGateway(apiKey), {
      lookupStore: lookupCacheEnabled(env) ? supabasePlaceLookupStore(db) : null,
    });
  }

  return overturePlaceResolver(supabasePoiIndexGateway(db));
}
