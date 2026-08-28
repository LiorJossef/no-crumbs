import 'server-only';

/**
 * The provider-response cache — `public.place_lookups` (migration 0007's R6 table), finally wired
 * up, plus the per-provider caching policy that says how long an answer may be kept.
 *
 * ## What is cached, and what is deliberately not
 *
 * **The provider's raw rows, never our ranked `ResolveResult`.** Ranking is `scoreCandidates`, and
 * it changes: weights move, band gates move, the category weight went to 0 this week. A cache of
 * ranked results would either have to be invalidated on every scoring change — a coupling nobody
 * would remember — or would serve rankings produced by a scorer that no longer exists. So this
 * sits **below** the ranker, at the provider gateway, and a scoring change simply re-ranks cached
 * rows on the next request.
 *
 * That seam is not a new invention: `tests/manual/tiktok-recognition.manual.ts` has cached the
 * Google gateway on disk since the corpus runs began, for the same reason ("everything we might
 * want to change stays live, and only the network call is replayed"). This is that seam, moved
 * into the product and given a shared, server-side home so one user's import pays for the next
 * user's.
 *
 * ## The key is the request
 *
 * `lookupHash` hashes the exact provider request, field by field, not a normalised candidate
 * string. Two consequences, both wanted:
 *
 *  - the key is **provably complete** — anything that can change the provider's answer is part of
 *    the request, therefore part of the key. A normalised key is a claim that the provider answers
 *    two different strings identically, and we have never measured that;
 *  - `categoryHint` is **not** in the key, because it is not in the request. It never reaches
 *    Google (`buildTextQuery` sends name + city only), so it cannot change the answer; and with
 *    the scorer's category weight at 0 it no longer changes the ranking either.
 *    `technical-design.md` R6 puts it in the key; measured on the 16 real corpus lookups it
 *    changes nothing (14 distinct keys with it, 14 without), so all it could ever do is fragment.
 *
 * Counted on `docs/evidence/places/tiktok-recognition-run.google.json`: 16 candidate lookups over
 * 14 distinct requests — 2 in-run hits — and a second run of the same corpus is 16/16 hits, i.e.
 * zero Text Search calls against a 100/day project quota. See
 * `docs/evidence/places/resolved-place-reuse-2026-08-28.md`.
 *
 * ## `ttlFor` is a compliance boundary, not a tuning knob
 *
 * `06-map-and-places-decision.md` §3.1 is VERIFIED: Google's Service Specific Terms §5.4 cap
 * caching of Places content at 30 consecutive calendar days, and only the place id is exempt. A
 * cached Text Search row carries `location`, so the entry is inside the cap. `place_lookup_put`
 * (migration 0023) **refuses** a `google` write with no TTL or a TTL over 30 days, so the ceiling
 * holds even if this file is changed carelessly. The number here is 28 days: under the cap with
 * slack, because pruning is opportunistic rather than scheduled.
 *
 * ## The cache never breaks a resolution
 *
 * Every failure — an unreadable entry, a database that is down, an envelope from a future version
 * of this file — degrades to a miss and, on the write side, to nothing at all. A cache that can
 * fail an import is worse than no cache.
 */

import { createHash } from 'node:crypto';

import type { OpCtx } from '@/domain/ports';
import type { PlaceProvider, RegionId } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * Policy: how long each provider's answers may be kept.
 * ------------------------------------------------------------------------------------------- */

/**
 * One provider's caching policy. `cacheable: false` is a real answer and not an omission — a
 * provider with no adapter, or no licence review, must not be cached by default just because
 * somebody added it to `PlaceProvider`.
 */
export type LookupTtl =
  | { readonly cacheable: false; readonly why: string }
  | {
      readonly cacheable: true;
      /** Milliseconds, or `null` for "keep indefinitely" — only legal for open data. */
      readonly ttlMs: number | null;
      readonly why: string;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Google Service Specific Terms §5.4, as a number, so a test can assert we sit under it. */
export const GOOGLE_MAX_CACHE_MS = 30 * DAY_MS;

/**
 * Exhaustive over `PlaceProvider` on purpose: adding a provider will not compile until somebody
 * rules on how long its answers may be kept, which is exactly the decision that is easy to skip.
 */
export const LOOKUP_TTL: Readonly<Record<PlaceProvider, LookupTtl>> = {
  google: {
    cacheable: true,
    ttlMs: 28 * DAY_MS,
    why: 'Google SST §5.4 caps Places content at 30 days; 28 leaves slack for an opportunistic prune',
  },
  overture: {
    cacheable: true,
    ttlMs: null,
    why: 'open data (ODbL) — may be kept indefinitely; unused today, that adapter reads a local table',
  },
  nominatim: {
    cacheable: false,
    why: 'no adapter yet, and 06 §11 Q2 (the ODbL write path) is unsigned — not cached until it is',
  },
  llm_guess: {
    cacheable: false,
    why: 'not a provider we query; an LLM guess has no provider response to replay',
  },
};

/**
 * A negative answer — the provider searched and found nothing — is capped much shorter than a
 * positive one whatever the provider's policy says.
 *
 * Repeated misses are the most wasteful calls we make, so caching them is worth real quota. But a
 * miss is a statement about the *index at a moment*, and a venue that opens next week would sit
 * behind a 28-day "not found" with no way for a user to shake it loose. A day is long enough to
 * absorb the re-imports that happen in one sitting and short enough that the world can change.
 */
export const NEGATIVE_TTL_MS = DAY_MS;

/** The TTL for one answer, or `null` if it must not be cached at all. */
export function ttlFor(
  provider: PlaceProvider,
  isEmptyResult: boolean,
): { readonly ttlMs: number | null } | null {
  const policy = LOOKUP_TTL[provider];
  if (!policy.cacheable) return null;
  if (isEmptyResult) {
    // Never longer than the provider's own ceiling: a provider capped below a day would otherwise
    // have its cap raised by the negative path, which is the one place a shortcut becomes a breach.
    const ttlMs = policy.ttlMs === null ? NEGATIVE_TTL_MS : Math.min(policy.ttlMs, NEGATIVE_TTL_MS);
    return { ttlMs };
  }
  return { ttlMs: policy.ttlMs };
}

/* ------------------------------------------------------------------------------------------- *
 * The key
 * ------------------------------------------------------------------------------------------- */

/**
 * Bumped whenever the hashed payload's *meaning* changes. Old entries then hash to nothing anyone
 * asks for and age out on their own TTL — which is why a version here is cheaper than a migration.
 */
export const LOOKUP_KEY_VERSION = 1;

/** Envelope version for `place_lookups.response`. A mismatch is a miss, never a reinterpretation. */
export const LOOKUP_RESPONSE_VERSION = 1;

/**
 * U+001F UNIT SEPARATOR joins the hashed fields. It cannot occur in a search query, a region code
 * or a language tag, so `['a', 'b']` and `['ab']` can never hash to the same key.
 */
const FIELD_SEPARATOR = '\u001f';

/**
 * sha256 of the provider plus the request, hex — the shape `place_lookups.lookup_hash`'s CHECK
 * demands (`^[0-9a-f]{64}$`).
 *
 * `request` is an ordered list built by the caller from a literal, not from `Object.entries` over
 * a params object: a field added to the request has to be added here deliberately, and a field
 * reordered by a refactor must not silently re-key the whole cache.
 */
export function lookupHash(
  provider: PlaceProvider,
  request: readonly (string | number | null)[],
): string {
  const payload = [`v${String(LOOKUP_KEY_VERSION)}`, provider, ...request.map(String)].join(
    FIELD_SEPARATOR,
  );
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------------------------------- *
 * The store
 * ------------------------------------------------------------------------------------------- */

/**
 * The two RPCs of migration 0023, and nothing else. It is an interface so the caching behaviour
 * below is testable without a database — the same reason `PoiIndexGateway` and
 * `GooglePlacesGateway` exist.
 *
 * **Neither method may throw.** Both report failure by doing nothing (`null`, or a resolved
 * promise). The Supabase implementation converts; the decorator below never has to think about it.
 */
export interface PlaceLookupStore {
  /** The stored envelope, or `null` for absent, expired, or unreadable. */
  get(lookupHash: string, ctx: OpCtx): Promise<unknown>;
  put(
    entry: {
      readonly lookupHash: string;
      readonly provider: PlaceProvider;
      readonly regionId: RegionId | null;
      readonly response: unknown;
      /** Seconds, or `null` for "keep indefinitely". Refused server-side for `google`. */
      readonly ttlSeconds: number | null;
    },
    ctx: OpCtx,
  ): Promise<void>;
}

/** The envelope actually stored in `place_lookups.response`. */
interface LookupEnvelope {
  readonly v: number;
  readonly provider: PlaceProvider;
  readonly rows: readonly unknown[];
}

function readEnvelope(value: unknown, provider: PlaceProvider): readonly unknown[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const envelope = value as Partial<LookupEnvelope>;
  // A version or a provider we do not recognise is a miss. Reinterpreting an unknown shape is how
  // a cache starts returning something that is not what it claims to be.
  if (envelope.v !== LOOKUP_RESPONSE_VERSION) return null;
  if (envelope.provider !== provider) return null;
  return Array.isArray(envelope.rows) ? envelope.rows : null;
}

/**
 * Read-through: serve the stored rows, or call `fetch` and store what it returns.
 *
 * Generic over the row type because the rows are the *provider's* shape and this file must not
 * learn any of them — `GooglePlaceRow` today, whatever a second provider returns tomorrow. The
 * cast on the way out is the deliberate cost of that: the envelope's version and provider are
 * checked, the row shape is not, and the adapter's own mapper (`toResolvedPlace`) is what turns a
 * row into something the domain will look at. A malformed row that survived a round trip through
 * jsonb fails there, exactly as a malformed row from the network does.
 */
export async function cachedProviderRows<Row>(
  args: {
    /** `null` disables the cache for this call — the composition root's off switch, not a fallback. */
    readonly store: PlaceLookupStore | null;
    readonly provider: PlaceProvider;
    readonly regionId: RegionId | null;
    readonly request: readonly (string | number | null)[];
    readonly fetch: () => Promise<readonly Row[]>;
  },
  ctx: OpCtx,
): Promise<readonly Row[]> {
  // No store, or a provider we may not cache: skip the key, the round trip and the write entirely.
  // Explicitly not a store that always misses — that would log a `miss` per call and read as a
  // cache that is failing rather than one that is switched off.
  const store = args.store;
  if (store === null || ttlFor(args.provider, false) === null) return await args.fetch();

  const hash = lookupHash(args.provider, args.request);

  const stored = await store.get(hash, ctx);
  const cachedRows = readEnvelope(stored, args.provider);
  if (cachedRows !== null) {
    ctx.log.event('places.lookup_cache', {
      provider: args.provider,
      outcome: 'hit',
      rows: cachedRows.length,
    });
    return cachedRows as readonly Row[];
  }

  const rows = await args.fetch();

  const writePolicy = ttlFor(args.provider, rows.length === 0);
  if (writePolicy !== null) {
    const envelope: LookupEnvelope = { v: LOOKUP_RESPONSE_VERSION, provider: args.provider, rows };
    await store.put(
      {
        lookupHash: hash,
        provider: args.provider,
        regionId: args.regionId,
        response: envelope,
        ttlSeconds: writePolicy.ttlMs === null ? null : Math.floor(writePolicy.ttlMs / 1000),
      },
      ctx,
    );
  }

  ctx.log.event('places.lookup_cache', {
    provider: args.provider,
    outcome: 'miss',
    rows: rows.length,
  });
  return rows;
}
