/**
 * Why a place lookup failed, as a closed domain vocabulary — the thing that was missing when a
 * real Prague import returned `{"kind":"failed","reason":"lookup_failed"}` four times and nobody
 * could say whether the quota was gone, the key was wrong, or the network was.
 *
 * ## The shape of the problem this fixes
 *
 * `googlePlacesGateway` threw `internal(...)` on every non-OK response and `resolveCandidates`
 * collapsed every `DomainError` to `lookup_failed`. Both are correct about the *client* boundary —
 * `DomainError.toView` never serialises a message or a cause, so no vendor text can reach a
 * browser — and both were silent server-side. An operator had four identical records and no way to
 * tell an exhausted 100/day Text Search quota (HTTP 429, `RESOURCE_EXHAUSTED`) from a revoked key
 * (403) from a five-second timeout.
 *
 * So the classification travels as a **cause**, not as a new `DomainErrorCode`. Three reasons:
 *
 *  1. `07` §9's set of 14 codes is closed and owned by that document. "Which vendor, and how did
 *     it fail" is one layer below "what kind of failure was this", and inflating the taxonomy with
 *     one member per provider symptom would make every consumer of the taxonomy provider-aware.
 *  2. A `cause` is already the field the wire view is guaranteed to strip. Putting the detail
 *     anywhere else would need a new proof that it cannot reach the client; putting it here reuses
 *     the one the repo already has (`tests/manual/describe-cause-redaction.manual.mts`).
 *  3. `describeCause` (`app/api/imports/_lib/error-reporting.ts`) walks `Error.cause` and reports a
 *     short `code` when it finds one — so making this an `Error` whose `code` *is* the
 *     classification puts the reason into the existing route failure line for free, with the real
 *     vendor error still one link further down the chain.
 *
 * ## What may and may not be in here
 *
 * `kind` and `status` only. **No vendor message, no response body, no API key, no URL** — the
 * message is composed here from the provider slug, the classification and the status, so there is
 * no path by which provider prose enters this object. The vendor's own error text stays where it
 * always was: as this error's own `cause`, redacted and clamped by `describeCause` before it
 * reaches a log line, and never serialised anywhere else.
 *
 * ## `null` status is a real value
 *
 * A transport failure or an abort never produced an HTTP response, so there is no status to
 * report. Writing `0` there would be the uncertainty-into-certainty move the working agreement
 * forbids — a number that reads like a measurement and is not one.
 */

import type { PlaceProvider } from '../types';

/**
 * The closed set. Deliberately about *our* ability to get an answer, not about the answer:
 * "the provider said no such place" is `no_match` and is a successful resolution, not a member
 * here.
 *
 *  - `quota_exhausted` — we are out of requests. Retrying now cannot work; retrying tomorrow can.
 *    The one classification the UI must be able to phrase differently, because it is the only one
 *    where the honest sentence is "not today" rather than "something broke".
 *  - `auth` — the key is missing, wrong, revoked or unauthorised for this API. Ours to fix; no
 *    amount of retrying helps.
 *  - `bad_request` — the provider rejected the request we composed. A bug in this adapter.
 *  - `provider_error` — the provider failed on its own side (5xx).
 *  - `timed_out` — our own per-lookup ceiling fired before any response arrived.
 *  - `transport` — the request never completed and we cannot say more: DNS, TLS, a socket, or a
 *    cancellation from above. The honest floor, never a guess dressed as one of the others.
 */
export type ProviderFailureKind =
  | 'quota_exhausted'
  | 'auth'
  | 'bad_request'
  | 'provider_error'
  | 'timed_out'
  | 'transport';

export const PROVIDER_FAILURE_KINDS: readonly ProviderFailureKind[] = [
  'quota_exhausted',
  'auth',
  'bad_request',
  'provider_error',
  'timed_out',
  'transport',
];

/**
 * The carrier. An `Error` rather than a plain object so it composes with `Error.cause` chains in
 * both directions: it is thrown *as* the cause of a `DomainError`, and it carries the vendor's own
 * exception or error body as *its* cause.
 *
 * `code` duplicates `kind` on purpose. `describeCause`'s `machineCodeOf` reads `.code` and admits
 * `/^[A-Za-z0-9_.:-]{1,40}$/`; every member of `ProviderFailureKind` matches, so the classification
 * lands in the route's structured failure line without that module having to know this type exists.
 */
export class ProviderLookupFailure extends Error {
  override readonly name = 'ProviderLookupFailure' as const;
  readonly kind: ProviderFailureKind;
  readonly provider: PlaceProvider;
  /** The HTTP status when the provider answered at all, else `null` — see the header. */
  readonly status: number | null;
  /** The same string as `kind`. Exists so `describeCause` surfaces it; see above. */
  readonly code: ProviderFailureKind;

  constructor(args: {
    readonly provider: PlaceProvider;
    readonly kind: ProviderFailureKind;
    readonly status: number | null;
    readonly cause?: unknown;
  }) {
    // Composed from three closed values. Nothing here is provider prose.
    const status = args.status === null ? 'no response' : `HTTP ${String(args.status)}`;
    super(`${args.provider} lookup failed: ${args.kind} (${status})`, { cause: args.cause });
    this.kind = args.kind;
    this.provider = args.provider;
    this.status = args.status;
    this.code = args.kind;
  }
}

/** How far down an `Error.cause` chain to look. The adapter wraps at most once today; the extra
 *  link is headroom so a future wrap does not silently drop the classification back to
 *  `lookup_failed`. Cycles are impossible to loop on because `seen` is checked first. */
const MAX_DEPTH = 4;

/**
 * The classification behind a thrown value, or `null` when it carries none.
 *
 * Walks the `cause` chain because the resolver seam wraps: `resolveCandidates` catches a
 * `DomainError`, whose cause is the `ProviderLookupFailure`, whose cause is the vendor's own
 * error. A caller that only looked at the top value would see `INTERNAL` and nothing else — which
 * is exactly the state this module exists to leave behind.
 *
 * Returns `null` rather than a default: "we do not know why" is a distinct, honest answer, and the
 * stored `lookup_failed` reason is what represents it.
 */
export function providerFailureOf(thrown: unknown): ProviderLookupFailure | null {
  const seen = new Set<unknown>();
  let current: unknown = thrown;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (current === null || current === undefined) return null;
    if (current instanceof ProviderLookupFailure) return current;
    if (typeof current === 'object') {
      if (seen.has(current)) return null;
      seen.add(current);
    }
    if (!(current instanceof Error)) return null;
    current = current.cause;
  }
  return null;
}
