/**
 * How an import route turns a `DomainError` into (a) an HTTP status, (b) one server log line, and
 * (c) the `imports.stage` value the audit row is allowed to hold. Pure — no `NextResponse`, no
 * Supabase, no `console` — so every rule below is unit-testable without a request.
 *
 * ## Why this lives in `app/`, not `domain/`
 *
 * An HTTP status is a transport fact, not a domain fact. `domain/errors.ts` deliberately knows
 * nothing about HTTP (`07` §9: the wire format is "a code and two booleans"), and giving a
 * `DomainError` a `status` field would put the transport inside the taxonomy. So the mapping sits
 * one layer out, next to the only things that speak HTTP — the route handlers — and both of them
 * share it rather than each inventing a number at the call site.
 *
 * ## What this file is fixing
 *
 * `current-state.md` §3.5: every probe-route failure was reported as `INTERNAL, retryable: true`
 * with **HTTP 502**, whatever actually happened. Three separate lies in one response:
 *
 *  1. `INTERNAL` for a malformed request body claimed *our* bug for *the caller's* mistake.
 *  2. `retryable: true` on a deterministic client fault promised that an identical retry might
 *     work. It cannot.
 *  3. `502` on a `NO_CAPTION` (we read the post fine — it simply has no caption) told every caller,
 *     every log search and every future alarm that the upstream was broken.
 *
 * And the real cause — the thing that would have answered "why?" — was put into a `DomainError`
 * message and `cause` that `toView()` correctly strips and **nothing ever logged**. `07` §7.1 says
 * "an `error_code = 'INTERNAL'` is the one line that should page a human"; there was no line.
 *
 * ## What it is deliberately NOT doing
 *
 * Not widening the response. Honesty here means picking the right **code** and writing the detail
 * to the **server log**; it never means adding a `message` or `detail` field to the payload. No
 * provider error object, message, HTTP status, stack, env var name or vendor prose may reach the
 * client (`07` §9, and the security fix already on `main`).
 *
 * Not inventing a code. The 14-member set is closed and owned by `07` §9, not by a call site.
 */

import type { DomainError, DomainErrorCode } from '@/domain/errors';

/**
 * One HTTP status per domain error code. `satisfies Record<DomainErrorCode, number>` is the point
 * of the shape: if `07` §9 ever grows a 15th code, this object **fails to compile** rather than
 * silently falling through to a default. There is no default.
 *
 * The question each row answers is *whose fault was it*, because that is the only thing a status
 * code communicates that the body does not:
 *
 *  - **4xx — the caller's request cannot be served as sent.** Nothing is broken on our side and
 *    nothing is broken upstream; re-sending the identical request produces the identical answer.
 *  - **5xx — we or a dependency failed.** This is the class that should show up in an error-rate
 *    graph, and the reason the blanket 502 was so expensive: it put every category in there.
 *
 * `retryable` is a *separate* signal and the two do not have to agree. `POST_UNAVAILABLE` is 422
 * (the link you sent cannot be read — not our outage) and retryable once (TikTok's 400 is
 * occasionally transient). Status = whose fault; `retryable` = should the UI offer a retry.
 */
export const HTTP_STATUS_BY_ERROR_CODE = {
  /** Client fault. Syntactically a URL, but not a host we will ever fetch — this is also the SSRF
   *  gate, so the request is understood and refused, not failed. */
  UNSUPPORTED_HOST: 422,
  /** Client fault, and the only *syntactic* one: what arrived was not a usable link at all. 400
   *  rather than 422 because there is nothing well-formed here to be unprocessable about. */
  MALFORMED_URL: 400,
  /** Client fault. A real TikTok URL that is a profile / tag / music / live page: understood,
   *  unprocessable. */
  UNSUPPORTED_URL: 422,
  /** Client fault in the sense that matters: the share link they hold no longer leads anywhere.
   *  Not 502 — TikTok answered us correctly, it just did not answer with a post. */
  SHORT_LINK_UNRESOLVED: 422,
  /** Client fault. A supported host, an unsupported post kind. */
  /** The post itself cannot be read (private / deleted / region-locked — indistinguishable,
   *  VERIFIED `04` §5). 422, not 404: the route and the request were both fine, and not 502: this
   *  is TikTok working correctly and declining, which is not an upstream outage. */
  POST_UNAVAILABLE: 422,
  /** Upstream fault. We are the gateway and the thing behind us ran out the clock — 504 is
   *  literally this case. */
  UPSTREAM_TIMEOUT: 504,
  /** Upstream fault. Not 429: 429 would say *the caller* sent too many requests, when in fact
   *  **we** are the one being throttled and the caller did nothing wrong. 503 = we cannot serve
   *  this right now, try later. */
  RATE_LIMITED_UPSTREAM: 503,
  /** Client fault, and the one place 429 is honest: this caller really did send too many. */
  RATE_LIMITED_LOCAL: 429,
  /** Neither fault, and emphatically not 502 — this is the headline defect of the blanket status.
   *  We read the post successfully; it has no caption to extract from. Understood, unprocessable. */
  NO_CAPTION: 422,
  /** Upstream fault: the model provider was unreachable, 5xx, out of quota or too slow. 502 is
   *  correct *here* and only here (plus the line below). */
  /** Client-ish fault, in the sense that the bytes are what they are: the post's video carries no
   *  audio we can read. Nothing upstream is broken and nothing of ours failed, so neither a 5xx
   *  nor an alarm is warranted. */
  MEDIA_UNREADABLE: 422,
  EXTRACTOR_UNAVAILABLE: 502,
  /** Upstream fault: the model answered with something that fails its own schema after a reprompt.
   *  "Invalid response from the upstream server" is the definition of 502. */
  EXTRACTOR_INVALID_OUTPUT: 502,
  /** Client fault: no session. */
  NOT_AUTHENTICATED: 401,
  /** Ours. The only code that may be a 500, and the only one that means "page a human"
   *  (`07` §7.1). Keeping this exclusive is what makes a 500 in the logs meaningful. */
  INTERNAL: 500,
} satisfies Record<DomainErrorCode, number>;

/**
 * Which console severity a failure deserves — `'error'` only for the ones that are actually ours.
 *
 * `07` §7.1 says "an `error_code = 'INTERNAL'` is the one line that should page a human". That
 * sentence only means anything if a human is not also paged for every mistyped link and every
 * logged-out request. Reporting all fourteen user-reachable codes at `console.error` would put a user's typo in
 * the same Vercel bucket as a service-role misconfiguration — the same dilution as the blanket 502
 * this module exists to remove, one layer up.
 *
 * So the split follows the status class, which already encodes whose fault it was: 5xx is ours or
 * a dependency's and is worth an alarm; 4xx is the caller's request and is ordinary traffic.
 * Both still emit a full line — nothing is silenced, only ranked.
 */
export function logSeverityFor(code: DomainErrorCode): 'error' | 'warn' {
  return httpStatusFor(code) >= 500 ? 'error' : 'warn';
}

/** The status for a code. Total by construction — the map above has no index signature and no
 *  default branch, so this cannot return `undefined`. */
export function httpStatusFor(code: DomainErrorCode): number {
  return HTTP_STATUS_BY_ERROR_CODE[code];
}

/**
 * Where a request got to before it failed. `'request'` covers everything before an `imports` row
 * exists (bad body, unusable URL, no session); the other two are `imports.stage`'s own vocabulary.
 */
export type ImportFailureStage = 'request' | 'source' | 'extract';

/**
 * The `imports.stage` value to write for a failure at this stage.
 *
 * `imports_stage_check` (migration `0003`) allows only `source | extract | resolve | done`, so
 * `'request'` — which is not a pipeline stage — must never reach the column. It cannot in practice
 * (there is no import row to update until after `start_import`), but the constraint is enforced
 * here rather than assumed, because a `check` violation inside the failure handler would turn a
 * clean 4xx into an unhandled throw at the worst possible moment.
 */
export function importRowStage(stage: ImportFailureStage): 'source' | 'extract' {
  return stage === 'extract' ? 'extract' : 'source';
}

/**
 * One structured line, `07` §7.1's shape (`{ event, importId, videoId, stage, ms, outcome }`) plus
 * the code and the underlying cause that the response is not allowed to carry.
 *
 * **Never a caption, never a coordinate** (charter R9, `04` §8 Q8). Video ids, codes, timings and
 * a sanitised cause string only — see `describeCause`, which exists precisely so that a validation
 * error carrying model-produced latitudes cannot be dumped in here by accident.
 */
export interface ImportFailureLogLine {
  readonly event: 'import.stage';
  /**
   * `'aborted'` when the caller went away mid-request (`req.signal`), `'failed'` when something
   * actually went wrong. They are not the same event and must not read as one: a cancelled import
   * is a user changing their mind, and counting those as failures would put a deliberate `Cancel`
   * into the same error-rate graph as a real outage — the same dilution, one level up, that this
   * module removes from the status code.
   */
  readonly outcome: 'failed' | 'aborted';
  readonly importId: string | null;
  readonly videoId: string | null;
  readonly stage: ImportFailureStage;
  readonly ms: number;
  readonly code: DomainErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  /** Our own `DomainError` message — the sentence a developer wrote, e.g. `start_import failed`.
   *  Never sent to the client (`toView()` strips it); this is the only place it survives. */
  readonly message: string;
  /** The sanitised underlying exception. `'none'` when the error carried no cause. */
  readonly cause: string;
}

export function importFailureLogLine(input: {
  readonly error: DomainError;
  readonly importId: string | null;
  readonly videoId: string | null;
  readonly stage: ImportFailureStage;
  readonly ms: number;
  /** True when `req.signal` fired — the caller left, and the `DomainError` below describes the
   *  abort's side effect (an aborted `fetch` surfaces as `UPSTREAM_TIMEOUT`) rather than a real
   *  fault. Measured: three client aborts at 50/200/600 ms each wrote `UPSTREAM_TIMEOUT`, so
   *  without this flag every cancellation is filed as a TikTok incident. */
  readonly aborted?: boolean;
}): ImportFailureLogLine {
  return {
    event: 'import.stage',
    outcome: input.aborted === true ? 'aborted' : 'failed',
    importId: input.importId,
    videoId: input.videoId,
    stage: input.stage,
    ms: input.ms,
    code: input.error.code,
    retryable: input.error.retryable,
    status: httpStatusFor(input.error.code),
    message: clamp(input.error.message),
    cause: describeCause(input.error.cause),
  };
}

/** How much of any single free-text field survives into a log line. Long enough to identify a
 *  failure, short enough that a runaway vendor payload cannot be smuggled through it. */
const MAX_FIELD_CHARS = 200;

function clamp(text: string): string {
  return text.length <= MAX_FIELD_CHARS ? text : `${text.slice(0, MAX_FIELD_CHARS)}…[truncated]`;
}

/**
 * A short, bounded, **redacted** description of an underlying exception, plus up to two links of
 * its `cause` chain.
 *
 * The rule this enforces is not "keep the log tidy", it is charter R9 / product-spec M6: **no
 * coordinate ever appears in a log line**, and `07` §7.1's "never log the caption". Three vendor
 * error shapes would each break that on their own, so each has a branch:
 *
 *  1. **A validation error.** A Zod error's `.message` is a JSON dump of its issues, and those
 *     issues quote the *values* that failed — for a place-extraction schema that is candidate
 *     names and, in the `coordinates` branch, real latitudes and longitudes. Summarised as
 *     **paths and issue codes only**; the value that failed is never reproduced.
 *  2. **A `JSON.parse` `SyntaxError`.** Measured on Node 22 (`docs/evidence/`): V8 echoes the
 *     parser's *input* into the message — the whole input when it is ≤20 characters, otherwise a
 *     ~20-character window around the failure position. `JSON.parse('(32.0578, 34.7702)')` throws
 *     `Unexpected token '(', "(32.0578, 34.7702)" is not valid JSON`, and a trailing comma in
 *     model output throws `Unexpected token ']', ..."":34.7702},]" is not valid JSON`. Both are
 *     reachable: `gemini.place-extractor.ts` parses raw model output about places and passes the
 *     `SyntaxError` as a `cause`. So every double-quoted span is stripped out of a `SyntaxError`'s
 *     message. What survives — the parser's complaint, the position, and the single offending
 *     character — is what actually diagnoses the failure: a markdown-fenced answer still reads
 *     as an unexpected backtick, and one character can be neither a caption nor a coordinate.
 *  3. **A PostgREST-style error object.** Its `message` and `code`, never `details`/`hint`, which
 *     quote row values back at you. (`supabase-js` returns this as a plain object, not a
 *     `PostgrestError` instance, on the non-throwing `{ data, error }` path this app uses —
 *     verified against `@supabase/postgrest-js` 2.112.3 — so this branch is live, not dead.)
 *
 * Everything else is reduced to `name: message`, plus a short machine `code` when the error
 * carries one (`ENOTFOUND`, a SQLSTATE, a `DomainErrorCode`), and clamped.
 *
 * **The chain is followed, deliberately.** `undici` reports every transport failure as
 * `TypeError: fetch failed` and puts the real reason in `error.cause`, so stopping at the first
 * link would log nothing usable for exactly the class of failure `current-state.md` §3.5 was
 * about. Following it does not widen the leak surface: each link is described by these same
 * rules. Depth is capped and cycles are detected.
 *
 * **What this does not claim.** It bounds *our* known echo vectors, not every string a vendor
 * could conceivably interpolate into an exception message. A provider that puts request content
 * into a non-`SyntaxError` message would still reach the log; nothing observed on this route's
 * paths does (audited: the extractor adapters, the oEmbed adapter and the short-link resolver
 * pass either a validation error, a transport error, or a `SyntaxError`).
 */
export function describeCause(cause: unknown): string {
  // Every read below touches an object we did not construct: a vendor error, a thrown value, a
  // `cause` chain of unknown provenance. Any of those may expose a throwing getter, a `Proxy` whose
  // traps throw, or a `name` that is a symbol and cannot be string-coerced. That is not a
  // theoretical shape — it is simply the shape of "unknown", which is the parameter type.
  //
  // The reason this is wrapped rather than hardened property-by-property: this function is called
  // from `failureResponse`, *inside* the route's own catch block. A throw here escapes `POST` after
  // the failure has already been recorded, and Next answers with its own 500 — turning an honest
  // 4xx into exactly the masked, misdiagnosed failure this module exists to abolish. A log
  // formatter must never be the reason a request's status is wrong.
  try {
    return describeCauseUnsafe(cause);
  } catch {
    return 'undescribable cause';
  }
}

function describeCauseUnsafe(cause: unknown): string {
  const links: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current === undefined || current === null) break;
    if (typeof current === 'object') {
      if (seen.has(current)) {
        links.push('<cycle>');
        break;
      }
      seen.add(current);
    }
    links.push(describeOneCause(current));
    current = nestedCauseOf(current);
  }

  if (links.length === 0) return 'none';
  return clamp(links.join(' <- '));
}

/** The error itself plus two `cause` links. Enough for `fetch failed <- ENOTFOUND`; short enough
 *  that a pathological chain cannot fill the line on its own. */
const MAX_CAUSE_DEPTH = 3;

/** The next link, and only from a real `Error`. A validation error's own `cause` is never
 *  interesting and following it would re-open the value-quoting problem branch 1 exists to close. */
function nestedCauseOf(cause: unknown): unknown {
  if (isValidationError(cause)) return undefined;
  if (!(cause instanceof Error)) return undefined;
  return cause.cause;
}

function describeOneCause(cause: unknown): string {
  if (isValidationError(cause)) {
    const issues = cause.issues
      .slice(0, 5)
      .map((issue) => `${pathOf(issue) || '<root>'}(${typeof issue.code === 'string' ? issue.code : 'unknown'})`)
      .join(', ');
    return clamp(`ValidationError: ${cause.issues.length} issue(s) at ${issues}`);
  }

  if (cause instanceof Error) {
    const message = isJsonSyntaxError(cause) ? redactEchoedSource(cause.message) : cause.message;
    const code = machineCodeOf(cause);
    return clamp(code === null ? `${cause.name}: ${message}` : `${cause.name}: ${message} [${code}]`);
  }

  if (typeof cause === 'string') return clamp(cause);

  if (typeof cause === 'object') {
    const record = cause as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : null;
    if (message !== null) {
      const code = typeof record.code === 'string' ? record.code : null;
      return clamp(code === null ? message : `${message} [${code}]`);
    }
  }

  // A thrown number, boolean, symbol or bare object. Its shape is not worth guessing at, and
  // stringifying an unknown object is exactly how untrusted content gets into a log.
  return `non-error ${typeof cause}`;
}

/** `name`, not `instanceof`: a `SyntaxError` crossing a `vm`/worker realm boundary fails
 *  `instanceof` while still carrying V8's echoed source, and failing open here is a leak. */
function isJsonSyntaxError(error: Error): boolean {
  return error instanceof SyntaxError || error.name === 'SyntaxError';
}

/**
 * Collapses everything between the **first** and the **last** double quote of the message — which
 * is where V8 puts the echoed parser input.
 *
 * Deliberately one span, not a per-quoted-run regex. The echo is a raw slice of the source, so its
 * quotes do not pair up the way a redactor would assume: on
 * `Unexpected token 'N', ..."578,"lng":NaN}" is not valid JSON` a pair-wise redactor redacts
 * `"578,"` and `"lng"` and leaves `:NaN}` — and on a slice cut one character earlier it would leave
 * a whole latitude standing between two redacted pairs. Collapsing the entire span cannot have
 * that failure mode, and it costs only the parser's structural preamble
 * (`Unexpected token 'X', `) and suffix (` is not valid JSON`), both of which are kept.
 */
function redactEchoedSource(message: string): string {
  const first = message.indexOf('"');
  if (first === -1) return message;
  const last = message.lastIndexOf('"');
  return `${message.slice(0, first)}"<redacted>"${message.slice(last + 1)}`;
}

/** A short machine-readable code (`ENOTFOUND`, `42501`, `INTERNAL`) when the error carries one.
 *  Length- and charset-bounded so an error object that uses `code` for free text cannot smuggle
 *  content in through it. */
function machineCodeOf(error: Error): string | null {
  const code = (error as unknown as { code?: unknown }).code;
  if (typeof code !== 'string') return null;
  return /^[A-Za-z0-9_.:-]{1,40}$/.test(code) ? code : null;
}

interface ValidationIssueLike {
  readonly code?: unknown;
  readonly path?: unknown;
}

/** Duck-typed rather than `instanceof z.ZodError`: this module stays dependency-free, and a log
 *  formatter must not become the reason two copies of Zod break redaction. */
function isValidationError(cause: unknown): cause is { readonly issues: readonly ValidationIssueLike[] } {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'issues' in cause &&
    Array.isArray((cause as { issues: unknown }).issues)
  );
}

function pathOf(issue: ValidationIssueLike): string {
  if (!Array.isArray(issue.path)) return '';
  // Path segments are keys and array indices — structural, never values.
  return issue.path.map((segment) => String(segment)).join('.');
}
