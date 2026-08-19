/**
 * The ports. An external service is reachable from `domain/` only through an interface declared
 * here, and exactly one adapter in `integrations/` implements each (charter §5, `07` §10).
 *
 * `07` §10 declares six: `SourceAdapter`, `ContentExtractor`, `PlaceExtractor`, `PlaceResolver`,
 * `ImportStore`, `Clock`. **MS5 task 2 declares one** — `PlaceResolver`, plus the `OpCtx`/`Logger`
 * that every port takes — because tasks 3, 4 and 7 write against it now and MS7's adapters
 * implement it. The other five land in MS6 with the pipeline that calls them. No barrel file, no
 * DI container: a port is a function parameter.
 */

import type { ImportId, ResolveQuery, ResolveResult, PlaceProvider } from './types';

/**
 * Structured logging only — event name plus scalar fields. **Never a caption, never a
 * coordinate** (charter R9, `04` §8 Q8): video ids, region ids and codes only.
 */
export interface Logger {
  event(name: string, fields: Record<string, string | number | boolean>): void;
}

/**
 * Per-operation context: the cancellation signal, what to correlate logs by, and where to log.
 * It is not a separate `signal` parameter, and it is not a request object.
 *
 * `importId` is **nullable**, which is a change to `07` §10's `importId: ImportId`. Manual place
 * addition (capability 13) resolves without an import; forcing a synthetic id there would put a
 * lie in the log line that `07` §7.1 groups by.
 */
export interface OpCtx {
  readonly signal: AbortSignal;
  readonly importId: ImportId | null;
  readonly log: Logger;
}

/**
 * Candidate string in, ranked shortlist out. The only seam between the domain and a places
 * provider, and the replacement for the three incompatible `PlaceResolver` declarations in
 * `06` §8, `07` §10 and `technical-design.md` §6.3.
 *
 * **One method, not two.** `06` and `07` both declared `resolve(...)` and `search(...)`; with one
 * input type and one output type those two signatures become identical, and MS7's adapter would
 * implement both by delegating to the same query. A distinction with no type-level content is
 * not a seam. The import path and the manual-search sheet differ in the `ResolveQuery` they
 * build (`categoryHint` vs `near`, `maxResults`) and in the rate limiter in front of them, which
 * lives in `app/` either way. If MS11 measures that autocomplete needs different ranking, it adds
 * a field to `ResolveQuery` — not a second method.
 *
 * **Never throws for "no match".** No match is `shortlist: []` with band `no_match`, and "that
 * city is not loaded" is `regionsSearched: []`. A transport or parse failure throws a
 * `DomainError` (`07` §9, `domain/errors.ts`, MS6) — no provider error object, message, status
 * code or stack ever leaves the adapter.
 */
export interface PlaceResolver {
  /**
   * Which alias namespace this resolver's `providerPlaceId`s belong to. `06` §8's
   * `readonly id: 'overture-local' | 'nominatim'` is renamed and re-valued: the field is
   * `provider` (it is what `resolve_place(p_provider)` receives) and `'overture-local'` violates
   * `place_provider_refs.provider`'s CHECK.
   */
  readonly provider: PlaceProvider;
  resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult>;
}
