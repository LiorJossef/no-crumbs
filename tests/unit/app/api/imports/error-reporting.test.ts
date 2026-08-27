/**
 * The pure half of FIX-ERR-T1 (`current-state.md` §3.5 — "every API error is masked as INTERNAL,
 * retryable: true", and every one of them returned HTTP 502).
 *
 * Three properties are worth a test here and they are not the same property:
 *
 *  1. **Totality.** The status map must cover the closed 14-code taxonomy, driven by
 *     `DOMAIN_ERROR_CODES` rather than a list copied into this file — a hand-copied list would go
 *     stale in exactly the situation the test exists to catch.
 *  2. **Honesty.** A 5xx means "we or a dependency failed". A code the caller cannot do anything
 *     about must never be reported as one, and `INTERNAL` must be the only route to a 500,
 *     because `07` §7.1 makes an `INTERNAL` a page-a-human event.
 *  3. **Redaction.** `describeCause` is the only thing standing between a validation error and a
 *     log line full of coordinates (charter R9, `07` §7.1: "never log the caption, never log
 *     coordinates"). Zod's `.message` is a JSON dump of its issues, values included, so
 *     `String(zodError)` in a log is a real leak and not a hypothetical one.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DOMAIN_ERROR_CODES,
  upstreamTimeout,
  DOMAIN_ERROR_CONSTRUCTORS,
  internal,
  malformedUrl,
  noCaption,
  postUnavailable,
} from '@/domain/errors';
import {
  HTTP_STATUS_BY_ERROR_CODE,
  describeCause,
  httpStatusFor,
  logSeverityFor,
  importFailureLogLine,
  importRowStage,
} from '@/app/api/imports/_lib/error-reporting';

describe('HTTP_STATUS_BY_ERROR_CODE', () => {
  it('is total over the closed taxonomy — every code has a status, and no extra keys', () => {
    expect(Object.keys(HTTP_STATUS_BY_ERROR_CODE).sort()).toEqual([...DOMAIN_ERROR_CODES].sort());
    for (const code of DOMAIN_ERROR_CODES) {
      expect(typeof httpStatusFor(code)).toBe('number');
    }
  });

  it('never reports a failure as a success', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      expect(httpStatusFor(code)).toBeGreaterThanOrEqual(400);
      expect(httpStatusFor(code)).toBeLessThanOrEqual(504);
    }
  });

  it('reserves 500 for INTERNAL alone, so a 500 in the logs still means "our bug"', () => {
    const fiveHundreds = DOMAIN_ERROR_CODES.filter((code) => httpStatusFor(code) === 500);
    expect(fiveHundreds).toEqual(['INTERNAL']);
  });

  it('never dresses a non-retryable failure up as a server or upstream fault', () => {
    // If a retry of the identical request cannot succeed, the failure is by definition not a
    // transient fault on our side or upstream — so it belongs in 4xx. The converse is deliberately
    // not asserted: POST_UNAVAILABLE is retryable *and* a 4xx, because TikTok declining to serve a
    // private post is not an outage.
    const misreported = DOMAIN_ERROR_CODES.filter(
      (code) => !DOMAIN_ERROR_CONSTRUCTORS[code]().retryable && httpStatusFor(code) >= 500,
    );
    expect(misreported).toEqual([]);
  });

  it('stops the three specific lies §3.5 recorded', () => {
    // A malformed request body is the caller's, not ours, and not a broken upstream.
    expect(httpStatusFor('MALFORMED_URL')).toBe(400);
    expect(malformedUrl().retryable).toBe(false);
    // We read the post fine — it has no caption. Reporting this as 502 told every caller the
    // upstream was down.
    expect(httpStatusFor('NO_CAPTION')).toBe(422);
    expect(noCaption().retryable).toBe(false);
    // Our own limiter. 429 is the one place "you sent too many" is true.
    expect(httpStatusFor('RATE_LIMITED_LOCAL')).toBe(429);
  });

  it('keeps 502 for the two failures that really are a bad upstream response', () => {
    const badGateways = DOMAIN_ERROR_CODES.filter((code) => httpStatusFor(code) === 502);
    expect(new Set(badGateways)).toEqual(new Set(['EXTRACTOR_UNAVAILABLE', 'EXTRACTOR_INVALID_OUTPUT']));
    expect(httpStatusFor('UPSTREAM_TIMEOUT')).toBe(504);
    expect(httpStatusFor('NOT_AUTHENTICATED')).toBe(401);
    expect(httpStatusFor('POST_UNAVAILABLE')).toBe(422);
  });
});

describe('importRowStage', () => {
  it('only ever produces a value imports_stage_check accepts', () => {
    // `request` is not a pipeline stage and would violate the CHECK constraint if it reached the
    // column — a throw inside the failure handler, at the worst possible moment.
    expect(importRowStage('request')).toBe('source');
    expect(importRowStage('source')).toBe('source');
    expect(importRowStage('extract')).toBe('extract');
    for (const stage of ['request', 'source', 'extract'] as const) {
      expect(['source', 'extract']).toContain(importRowStage(stage));
    }
  });
});

describe('describeCause', () => {
  it('summarises a validation error by path and issue code, never by value', () => {
    // The exact shape the place-extraction schema produces when the model returns a bad
    // coordinate. `String(err)` here would put 32.0708 and 34.7805 straight into the log.
    const schema = z.object({
      rawName: z.string(),
      coordinates: z.object({ lat: z.string(), lng: z.string() }),
    });
    const parsed = schema.safeParse({
      rawName: 'Cafe Fiori',
      coordinates: { lat: 32.0708, lng: 34.7805 },
    });
    expect(parsed.success).toBe(false);

    const described = describeCause(parsed.success ? null : parsed.error);

    expect(described).toContain('coordinates.lat');
    expect(described).toContain('coordinates.lng');
    expect(described).not.toContain('32.0708');
    expect(described).not.toContain('34.7805');
    expect(described).not.toContain('Cafe Fiori');
  });

  it('reduces a plain Error to name and message', () => {
    expect(describeCause(new TypeError('fetch failed'))).toBe('TypeError: fetch failed');
  });

  it('never echoes JSON.parse input back, because V8 puts the parsed source in the message', () => {
    // Not hypothetical and not a fixture: `gemini.place-extractor.ts` does exactly this
    // `JSON.parse` on raw model output about places, and hands the SyntaxError to
    // `extractorInvalidOutput(..., e)`. Measured on Node 22 — V8 echoes the whole input when it
    // is <= 20 characters, so a short prose answer is reproduced in full, coordinates included.
    const modelOutputs = [
      '(32.0578, 34.7702)',
      'Lat 32.0578',
      'Cafe Levinsky',
      'Here you go: Cafe Levinsky at 32.0578, 34.7702',
      '[{"name":"Cafe","lat":32.0578,"lng":34.7702},]',
      '{"name":"Levinsky","lat":32.0578,"lng":NaN}',
      '```json\n{"places":[{"rawName":"Cafe Levinsky"}]}\n```',
      // The echo is a raw slice of the source, so its quotes do not pair up: these three put a
      // coordinate *between* two quoted runs, which is precisely where a pair-wise redactor
      // leaves it standing. Regression cases for the redaction being one span, not a per-run
      // replace.
      '{"a":"xxxxxxxxxx","lat":32.0578,"lng":NaN}',
      '{"lat":32.0578,"a":NaN}',
      '{"places":[{"rawName":"x","lat":32.0578,"lng":34.7702,"note":nope}]}',
    ];

    for (const output of modelOutputs) {
      let thrown: unknown;
      try {
        JSON.parse(output);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(SyntaxError);

      const described = describeCause(thrown);
      expect(described).not.toContain('32.0578');
      expect(described).not.toContain('34.7702');
      expect(described).not.toContain('Levinsky');
      expect(described).not.toContain('Cafe');
      // Still diagnosable: the parser's own complaint survives the redaction, so a fenced answer
      // and a trailing comma remain tellable apart in the log.
      expect(described).toContain('SyntaxError:');
      expect(described.length).toBeGreaterThan('SyntaxError: '.length);
    }
  });

  it('keeps the parser complaint around the redaction, so the log still diagnoses the failure', () => {
    // A redaction that leaves nothing behind just recreates §3.5 somewhere else: the operator
    // still has to be able to tell a fenced answer from a prose answer from a trailing comma.
    let fenced: unknown;
    try {
      JSON.parse('```json\n{"places":[]}\n```');
    } catch (e) {
      fenced = e;
    }
    expect(describeCause(fenced)).toBe(
      'SyntaxError: Unexpected token \'`\', "<redacted>"... is not valid JSON',
    );

    let empty: unknown;
    try {
      JSON.parse('');
    } catch (e) {
      empty = e;
    }
    // No echo, nothing to redact — the message is left exactly as V8 wrote it.
    expect(describeCause(empty)).toBe('SyntaxError: Unexpected end of JSON input');
  });

  it('follows the cause chain, because undici reports every transport failure identically', () => {
    // `TypeError: fetch failed` on its own is the same log line for a DNS failure, a refused
    // connection and a TLS error — which is §3.5's "the real cause was never logged" in a new
    // place. The chain is described by the same rules at every link.
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'), {
      code: 'ENOTFOUND',
    });
    const described = describeCause(new TypeError('fetch failed', { cause: dns }));

    expect(described).toContain('TypeError: fetch failed');
    expect(described).toContain('ENOTFOUND');
  });

  it('applies the same redaction to a nested cause, not only to the outermost error', () => {
    const inner = (() => {
      try {
        JSON.parse('Cafe Levinsky at 32.0578');
        return null;
      } catch (e) {
        return e;
      }
    })();
    const described = describeCause(new Error('extraction failed', { cause: inner }));

    expect(described).toContain('extraction failed');
    expect(described).not.toContain('Levinsky');
    expect(described).not.toContain('32.0578');
  });

  it('terminates on a cause cycle rather than looping', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    Object.defineProperty(a, 'cause', { value: b, configurable: true });

    const described = describeCause(b);
    expect(described).toContain('Error: b');
    expect(described.length).toBeLessThan(260);
  });

  it('will not let an error object smuggle free text through its `code`', () => {
    const chatty = Object.assign(new Error('boom'), {
      code: 'a caption we must never log, at 32.0578, 34.7702',
    });
    const described = describeCause(chatty);
    expect(described).toBe('Error: boom');
  });

  it('reads a PostgREST-style error object without echoing its row detail back', () => {
    const described = describeCause({
      message: 'permission denied for function start_import',
      code: '42501',
      details: 'Key (content_text)=(a caption we must never log) is present.',
      hint: null,
    });
    expect(described).toBe('permission denied for function start_import [42501]');
    expect(described).not.toContain('caption');
  });

  it('clamps a long message rather than letting a vendor payload through', () => {
    const described = describeCause(new Error('x'.repeat(5000)));
    expect(described.length).toBeLessThan(260);
    expect(described).toContain('[truncated]');
  });

  it('says so, rather than stringifying, when something that is not an error was thrown', () => {
    expect(describeCause(undefined)).toBe('none');
    expect(describeCause(null)).toBe('none');
    expect(describeCause(42)).toBe('non-error number');
    expect(describeCause({ lat: 32.0708, lng: 34.7805 })).toBe('non-error object');
  });
});

describe('importFailureLogLine', () => {
  it('carries 07 §7.1’s fields plus the code and the cause the response may not have', () => {
    const line = importFailureLogLine({
      error: internal('start_import failed', new Error('permission denied')),
      importId: 'imp-1',
      videoId: '7123456789012345678',
      stage: 'source',
      ms: 412,
    });

    expect(line).toEqual({
      event: 'import.stage',
      outcome: 'failed',
      importId: 'imp-1',
      videoId: '7123456789012345678',
      stage: 'source',
      ms: 412,
      code: 'INTERNAL',
      retryable: true,
      status: 500,
      message: 'start_import failed',
      cause: 'Error: permission denied',
    });
  });

  it('has no field that could hold a caption or a coordinate', () => {
    const line = importFailureLogLine({
      error: postUnavailable(),
      importId: null,
      videoId: null,
      stage: 'request',
      ms: 3,
    });
    // The keys are the contract: video ids, codes, timings and a sanitised cause only. A future
    // `caption`, `candidates` or `coordinates` field fails here rather than in a log review.
    expect(Object.keys(line).sort()).toEqual(
      [
        'cause',
        'code',
        'event',
        'importId',
        'message',
        'ms',
        'outcome',
        'retryable',
        'stage',
        'status',
        'videoId',
      ].sort(),
    );
    expect(line.cause).toBe('none');
  });

  it('serialises to a single line, so a log drain sees one record per failure', () => {
    const serialised = JSON.stringify(
      importFailureLogLine({
        error: internal('unhandled exception in probe route', new Error('boom')),
        importId: 'imp-1',
        videoId: null,
        stage: 'extract',
        ms: 9000,
      }),
    );
    expect(serialised.split('\n')).toHaveLength(1);
    expect(JSON.parse(serialised)).toMatchObject({ code: 'INTERNAL', status: 500 });
  });
});

/**
 * `07` §7.1 reserves "page a human" for `INTERNAL`. That reservation only means something if the
 * other thirteen codes do not also arrive at error severity — a user's typo must not sit in the
 * same Vercel bucket as a service-role misconfiguration, which is the blanket-502 dilution this
 * module exists to remove, one layer up.
 */
describe('logSeverityFor', () => {
  it('reports only our own failures and our dependencies at error severity', () => {
    const errors = DOMAIN_ERROR_CODES.filter((code) => logSeverityFor(code) === 'error');
    expect([...errors].sort()).toEqual(
      ['EXTRACTOR_INVALID_OUTPUT', 'EXTRACTOR_UNAVAILABLE', 'INTERNAL', 'RATE_LIMITED_UPSTREAM', 'UPSTREAM_TIMEOUT'].sort(),
    );
  });

  it('never pages a human for a fault in the caller request', () => {
    for (const code of ['MALFORMED_URL', 'NOT_AUTHENTICATED', 'RATE_LIMITED_LOCAL', 'UNSUPPORTED_URL', 'NO_CAPTION'] as const) {
      expect(logSeverityFor(code)).toBe('warn');
    }
  });

  it('agrees with the status map for every code, so the two cannot drift', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      expect(logSeverityFor(code)).toBe(httpStatusFor(code) >= 500 ? 'error' : 'warn');
    }
  });
});

/**
 * A cancelled import and a failed one are different events. Measured before this split: three
 * client aborts at 50/200/600 ms each wrote `error_code='UPSTREAM_TIMEOUT'` — TikTok had not timed
 * out, the caller had left. Filing those as upstream incidents would corrupt the audit record this
 * branch exists to make trustworthy.
 */
describe('importFailureLogLine — aborted vs failed', () => {
  const base = { importId: 'imp-1', videoId: '7000000000000000001', stage: 'source' as const, ms: 12 };

  it('reports a caller abort as its own outcome, not as a failure', () => {
    const line = importFailureLogLine({ ...base, error: upstreamTimeout(), aborted: true });
    expect(line.outcome).toBe('aborted');
  });

  it('still reports a genuine failure as failed when the caller is present', () => {
    expect(importFailureLogLine({ ...base, error: upstreamTimeout() }).outcome).toBe('failed');
    expect(importFailureLogLine({ ...base, error: upstreamTimeout(), aborted: false }).outcome).toBe('failed');
  });

  it('keeps the code it was given, so an abort is still diagnosable', () => {
    const line = importFailureLogLine({ ...base, error: upstreamTimeout(), aborted: true });
    expect(line.code).toBe('UPSTREAM_TIMEOUT');
  });
});

/** A log formatter must never be the reason a request's status is wrong: `describeCause` runs
 *  inside the route's own catch, so a throw there escapes `POST` and Next answers 500 — masking an
 *  honest 4xx, which is the defect this whole module removes. */
describe('describeCause — total against hostile input', () => {
  it('never throws, whatever it is handed', () => {
    const throwingGetter = (prop: string) => Object.defineProperty(new Error('x'), prop, {
      get() { throw new Error('boom'); },
    });
    const symbolName = Object.defineProperty(new Error('x'), 'name', { value: Symbol('s') });
    const hostileProxy = new Proxy({}, { has() { throw new Error('boom'); }, get() { throw new Error('boom'); } });

    for (const hostile of [throwingGetter('message'), throwingGetter('code'), throwingGetter('cause'), symbolName, hostileProxy]) {
      expect(() => describeCause(hostile)).not.toThrow();
      expect(typeof describeCause(hostile)).toBe('string');
    }
  });
});
