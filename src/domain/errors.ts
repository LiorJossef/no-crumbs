/**
 * The closed error taxonomy (`07` §9, L0-F1-T1). `DomainError` is the only thing an integration
 * adapter or a pipeline stage may throw across the app-layer seam: no provider error object,
 * message, status code or stack ever reaches the client. Everything else in `07`'s table collapses
 * to one of these 13 codes.
 *
 * Rules this file obeys:
 *  - **Closed set.** `DomainErrorCode` has exactly the 13 members `07` §9 names, minus the retired
 *    `PHOTO_POST` (photo posts are ordinary posts now — see `canonicalise-tiktok-url.ts`).
 *    Adding a 14th is a
 *    decision for that document, not a call site.
 *  - **No code is reachable only by typing a raw string.** Every member of `DomainErrorCode` has
 *    exactly one constructor function below that produces it, and every constructor fixes that
 *    code's `retryable` value from the table — a call site cannot construct, say, `INTERNAL` and
 *    claim it is retryable when the taxonomy says otherwise, because `retryable` is not a
 *    parameter anywhere.
 *  - **These messages are diagnostics, and `voice-and-vocabulary.md` does not bind them.** They
 *    are read in logs and by us, never by a user: the client receives `body.error.code` and renders
 *    `ui/import/import-error-copy.ts`, which is where the vocabulary rules apply. That is why five
 *    of the strings below say *post* while every user-facing string says *video* — §3 bans *post*
 *    as a word a user reads, and TikTok's own URL taxonomy is the right register for a log line.
 *    Asked and answered twice on 2026-08-31; the first sentence of this docblock is the proof.
 *  - **`NO_PLACES_FOUND` is not here.** It is a successful outcome (`ImportOutcome`'s
 *    `kind: 'no_places'`, `domain/import/events.ts`), not a member of this union — see the note at
 *    the bottom of `07` §9. Modelling the modal result (~73%, `04` §4) as an error would poison
 *    every log, metric and screen built on this taxonomy.
 *  - `DomainError` extends `Error` so it composes with `try`/`catch` and keeps a stack trace, but
 *    nothing in `domain/` throws or catches a vendor exception directly: adapters in
 *    `integrations/` catch every vendor exception and construct one of these instead.
 */

import type { ImportId } from './types';

export type DomainErrorCode =
  | 'UNSUPPORTED_HOST'
  | 'MALFORMED_URL'
  | 'UNSUPPORTED_URL'
  | 'SHORT_LINK_UNRESOLVED'
  | 'POST_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'RATE_LIMITED_UPSTREAM'
  | 'RATE_LIMITED_LOCAL'
  | 'NO_CAPTION'
  | 'EXTRACTOR_UNAVAILABLE'
  | 'EXTRACTOR_INVALID_OUTPUT'
  | 'NOT_AUTHENTICATED'
  | 'INTERNAL';

/** Every `DomainErrorCode`, in the order `07` §9's table lists them. The exhaustiveness fixture
 *  for tests: `Object.values` on a `Record<DomainErrorCode, unknown>` is how a test proves this
 *  array and the type stay in lockstep without hand-duplicating the list a second time. */
export const DOMAIN_ERROR_CODES: readonly DomainErrorCode[] = [
  'UNSUPPORTED_HOST',
  'MALFORMED_URL',
  'UNSUPPORTED_URL',
  'SHORT_LINK_UNRESOLVED',
  'POST_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
  'RATE_LIMITED_UPSTREAM',
  'RATE_LIMITED_LOCAL',
  'NO_CAPTION',
  'EXTRACTOR_UNAVAILABLE',
  'EXTRACTOR_INVALID_OUTPUT',
  'NOT_AUTHENTICATED',
  'INTERNAL',
];

/**
 * The one thing that may cross the app-layer seam on failure. A code and two booleans — no
 * prose, no vendor text (`07` §9). Copy lives in one client-side map (UX §12); the wire format
 * carries none.
 */
export interface DomainErrorView {
  readonly code: DomainErrorCode;
  readonly retryable: boolean;
  readonly importId?: ImportId;
}

/**
 * A domain-level failure. Never constructed with `new` from outside this file — use the named
 * function for the code you mean (`unsupportedHost`, `internal`, ...). Kept as a real `Error`
 * subclass (not a plain object) so it survives an ordinary `throw`/`catch` and keeps a stack.
 */
export class DomainError extends Error {
  override readonly name = 'DomainError' as const;
  readonly code: DomainErrorCode;
  readonly retryable: boolean;
  /** `declare`: a type-only re-statement of `Error.cause`. A real field declaration here would,
   *  under ES2022 native class-field semantics, define `cause` as `undefined` on every instance
   *  even when no cause is given — exactly the "set to undefined instead of omitted" bug
   *  `exactOptionalPropertyTypes` exists to catch. Only the conditional assignment below sets it. */
  declare readonly cause?: unknown;

  /** @internal — use one of the named constructor functions below. */
  constructor(code: DomainErrorCode, retryable: boolean, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  /** The wire-safe view: a code and two booleans, never this instance's `message` or `cause`. */
  toView(importId?: ImportId): DomainErrorView {
    return importId === undefined
      ? { code: this.code, retryable: this.retryable }
      : { code: this.code, retryable: this.retryable, importId };
  }
}

/** Builds one code's constructor, with that code's fixed `retryable` value baked in per `07` §9's
 *  table — never a parameter, so a call site cannot mis-declare it. */
function makeConstructor(code: DomainErrorCode, retryable: boolean, defaultMessage: string) {
  return (message?: string, cause?: unknown): DomainError =>
    new DomainError(code, retryable, message ?? defaultMessage, cause);
}

/** Canonicaliser / SSRF gate: the host is not the TikTok allow-list. Pre-A, not retryable. */
export const unsupportedHost = makeConstructor(
  'UNSUPPORTED_HOST',
  false,
  'This host is not a supported TikTok domain.',
);

/** Canonicaliser: the input does not parse as a URL at all. Pre-A, not retryable. */
export const malformedUrl = makeConstructor('MALFORMED_URL', false, 'This does not look like a link.');

/** Canonicaliser: a recognised TikTok URL that is a profile, tag, music or live link, not a
 *  post — the "recognised platform, not a link we read" case (`04` §5, brand doc §1). Pre-A, not
 *  retryable. */
export const unsupportedUrl = makeConstructor(
  'UNSUPPORTED_URL',
  false,
  "That's a TikTok link, but not a single post.",
);

/** Short-link resolver: the `vm./vt./t/` hop did not land on a post within its hop/host budget,
 *  including the 302 → homepage → 200 trap (`07` §7). Stage A1, not retryable. */
export const shortLinkUnresolved = makeConstructor(
  'SHORT_LINK_UNRESOLVED',
  false,
  'This share link has expired.',
);

/** Canonicaliser: `kind = 'photo'`. Pre-A, not retryable — rendered with `POST_UNAVAILABLE`'s copy
 *  until `04` §5 category L has a specimen (`07` §9). */

/** oEmbed returned its one honest failure (`{"message":"Something went wrong","code":400}`) after
 *  our own pre-fetch validation passed. Private / deleted / region-locked are indistinguishable
 *  (VERIFIED, `04` §5) and we do not guess. Stage A2, retryable once. */
export const postUnavailable = makeConstructor(
  'POST_UNAVAILABLE',
  true,
  "We couldn't read this post.",
);

/** Our own `AbortSignal` fired on stage A's per-attempt or stage budget (`07` §7). Retryable. */
export const upstreamTimeout = makeConstructor(
  'UPSTREAM_TIMEOUT',
  true,
  'TikTok took too long to respond.',
);

/** Reserved: no `429`/`retry-after`/`x-ratelimit-*` has ever been observed from TikTok
 *  (`04` §E5, VERIFIED). Kept so a future TikTok change surfaces as a distinct log code rather
 *  than as `UPSTREAM_TIMEOUT`. Stage A2, retryable. */
export const rateLimitedUpstream = makeConstructor(
  'RATE_LIMITED_UPSTREAM',
  true,
  'TikTok is rate-limiting us right now.',
);

/** Our own per-user limiter, checked in the route handler before `getOrCreateImport` (`07` §7).
 *  Pre-A. Not immediately retryable — the UI's own copy is "give it a few minutes", not a retry
 *  button (`07` §9's "later"), which this taxonomy represents as `retryable: false`. */
export const rateLimitedLocal = makeConstructor(
  'RATE_LIMITED_LOCAL',
  false,
  "You've tried this a few times. Give it a few minutes.",
);

/** Content extractor: oEmbed returned 200 but no usable text. A/B seam, not retryable — a retry
 *  would read the same empty caption. */
export const noCaption = makeConstructor('NO_CAPTION', false, 'This post has no caption to read.');

/** LLM adapter: transport failure, 5xx, quota or timeout. Stage B, retryable — the source is
 *  already cached, so a retry is cheap. */
export const extractorUnavailable = makeConstructor(
  'EXTRACTOR_UNAVAILABLE',
  true,
  "We couldn't process this post right now.",
);

/** LLM adapter: the structured-output Zod parse failed after one reprompt (`07` §10 Zod rules).
 *  Stage B, retryable. */
export const extractorInvalidOutput = makeConstructor(
  'EXTRACTOR_INVALID_OUTPUT',
  true,
  "We couldn't process this post right now.",
);

/** Route handler: no Supabase session. Pre-A. Not a retry — a sign-in redirect, pasted URL
 *  preserved (`07` §9). */
export const notAuthenticated = makeConstructor('NOT_AUTHENTICATED', false, 'Please sign in to continue.');

/** The union's floor: anything unmapped. Any stage. Retryable, and an `INTERNAL` in the logs is a
 *  bug report, always (`07` §7.1). */
export const internal = makeConstructor('INTERNAL', true, 'Something went wrong on our side.');

/** Every constructor, keyed by the code it produces — the exhaustiveness fixture for tests and
 *  the one place that would fail to compile if `07` §9 grew a 15th code without a constructor. */
export const DOMAIN_ERROR_CONSTRUCTORS = {
  UNSUPPORTED_HOST: unsupportedHost,
  MALFORMED_URL: malformedUrl,
  UNSUPPORTED_URL: unsupportedUrl,
  SHORT_LINK_UNRESOLVED: shortLinkUnresolved,
  POST_UNAVAILABLE: postUnavailable,
  UPSTREAM_TIMEOUT: upstreamTimeout,
  RATE_LIMITED_UPSTREAM: rateLimitedUpstream,
  RATE_LIMITED_LOCAL: rateLimitedLocal,
  NO_CAPTION: noCaption,
  EXTRACTOR_UNAVAILABLE: extractorUnavailable,
  EXTRACTOR_INVALID_OUTPUT: extractorInvalidOutput,
  NOT_AUTHENTICATED: notAuthenticated,
  INTERNAL: internal,
} satisfies Record<DomainErrorCode, (message?: string, cause?: unknown) => DomainError>;
