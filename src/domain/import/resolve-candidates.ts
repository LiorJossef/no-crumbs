/**
 * Stage C for the request/response probe path: run every in-budget candidate through the
 * `PlaceResolver` port and hand back one `StoredResolution` per candidate, index-aligned with the
 * input.
 *
 * This is `pipeline.ts`'s stage C with the event stream removed, and it is a separate function
 * rather than a copy: it calls the *same* `buildResolveQuery`, obeys the *same* `MAX_CANDIDATES`,
 * and produces records `chooseResolvedPlace` reads back through the *same* `deriveResolution`. The
 * two entry points into resolution — the streamed pipeline (L0-F6) and the probe route — must not
 * be able to disagree about what a caption resolves to; the only thing that differs here is that
 * nothing yields.
 *
 * Three rules carried over verbatim from `07` §7/§8, because they are the ones that are easy to
 * lose when the events go away:
 *
 *  1. **Resolution never fails the import.** A lookup that throws degrades exactly one candidate to
 *     `failed`; it does not propagate. A caption with one dead lookup and six good ones is six
 *     resolved places, not an error screen.
 *  2. **Over-budget candidates are kept, marked `capped`, never dropped.** The user still sees the
 *     eighth place the caption named; we simply did not spend a lookup on it.
 *  3. **"Every attempted lookup failed in transport" is the only degraded signal**, and it is
 *     vacuously false when nothing was attempted — hence the `attempted > 0` guard rather than a
 *     bare `allFailed`.
 *
 * Pure with respect to everything except the port: no clock, no logging of its own (the resolver
 * adapter already emits `poi.resolve` through `ctx.log`), no database.
 */

import type { OpCtx, PlaceResolver } from '../ports';
import { DomainError } from '../errors';
import { buildResolveQuery, MAX_CANDIDATES } from './pipeline';
import { providerFailureOf } from './provider-failure';
import { answered, failed, type StoredFailureReason, type StoredResolution } from './resolution-record';
import type { PlaceCandidate } from '../types';

/**
 * Why one lookup produced nothing, in the vocabulary the record stores.
 *
 * Three sources, most specific first, and the order is the point:
 *
 *  1. an adapter's own classification, carried on the `DomainError`'s cause chain
 *     (`provider-failure.ts`) — `quota_exhausted`, `auth`, `bad_request`, `provider_error`,
 *     `timed_out`, `transport`;
 *  2. `UPSTREAM_TIMEOUT`, for an adapter that does not classify but does time out. Keeps every
 *     pre-existing resolver — and the Overture one — reading exactly as it did;
 *  3. `lookup_failed`, the honest floor. It now means *we do not know why*, which is a narrower
 *     and more useful claim than it made yesterday, when it meant *every failure, including the
 *     ones we could have named*. Four of those in a row on a real Prague import is what started
 *     this change.
 *
 * Never guesses. An unclassified failure stays unclassified rather than being filed under the
 * most likely cause, because a plausible label here would be read as a measurement by whoever
 * greps for it next.
 */
function failureReasonOf(e: unknown): StoredFailureReason {
  const classified = providerFailureOf(e);
  if (classified !== null) return classified.kind;
  if (e instanceof DomainError && e.code === 'UPSTREAM_TIMEOUT') return 'timed_out';
  return 'lookup_failed';
}

export interface ResolveCandidatesOutcome {
  /** One entry per input candidate, same order, same length. */
  readonly resolutions: readonly StoredResolution[];
  /** How many lookups were actually issued — at most `MAX_CANDIDATES`. */
  readonly attempted: number;
  /** `'PLACE_PROVIDER_UNAVAILABLE'` when every attempted lookup failed in transport, else null. */
  readonly degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null;
}

export async function resolveCandidates(
  resolver: PlaceResolver,
  candidates: readonly PlaceCandidate[],
  extractionCityHint: string | null,
  ctx: OpCtx,
): Promise<ResolveCandidatesOutcome> {
  const resolutions: StoredResolution[] = [];
  let attempted = 0;
  let allTransportFailed = true;

  for (const [index, candidate] of candidates.entries()) {
    if (index >= MAX_CANDIDATES) {
      resolutions.push({ kind: 'capped' });
      continue;
    }

    attempted += 1;
    try {
      const result = await resolver.resolve(buildResolveQuery(candidate, extractionCityHint), ctx);
      resolutions.push(answered(result));
      allTransportFailed = false;
    } catch (e) {
      // The resolver's own contract already forbids a vendor error escaping it (`place-resolver.ts`
      // converts every PostgREST/transport failure to `internal(...)`), so this only ever sees a
      // `DomainError` in practice. `failureReasonOf` still takes `unknown`, because a fake port in
      // a test is not bound by that contract and must not be able to crash the loop.
      resolutions.push(failed(failureReasonOf(e)));
    }
  }

  return {
    resolutions,
    attempted,
    degraded: attempted > 0 && allTransportFailed ? 'PLACE_PROVIDER_UNAVAILABLE' : null,
  };
}
