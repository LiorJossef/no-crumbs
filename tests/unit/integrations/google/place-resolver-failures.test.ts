/**
 * Why a Google lookup failed — the question the product could not answer on 2026-08-28, when a
 * real Prague import produced four identical `{"kind":"failed","reason":"lookup_failed"}` records
 * and no server log line at all.
 *
 * Two properties are under test and they pull in opposite directions, which is the whole point:
 *
 *  1. **Diagnosability.** The status and a classification reach `ctx.log` and the `DomainError`'s
 *     cause chain, so an operator can tell an exhausted quota from a rejected key from a timeout.
 *  2. **Containment.** Nothing vendor-specific may travel with them. The wire view is still a code
 *     and two booleans, and the composed message quotes no part of Google's response.
 *
 * Kept in its own file rather than appended to `place-resolver.test.ts`, which tests the adapter's
 * mapping and query decisions; these are about its failure seam.
 *
 * **No live quota is spent here.** Every response is a stub; the project's Text Search cap is 100
 * requests per day and is reserved for the owner's real dataset.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Same reason as `place-resolver.test.ts`: the module opens with `import 'server-only'`.
vi.mock('server-only', () => ({}));

import { DomainError } from '@/domain/errors';
import { providerFailureOf } from '@/domain/import/provider-failure';
import type { OpCtx } from '@/domain/ports';
import type { ResolveQuery } from '@/domain/types';
import {
  classifyGoogleStatus,
  googlePlaceResolver,
  googlePlacesGateway,
  type GooglePlacesGateway,
} from '@/integrations/google/place-resolver';

interface Logged {
  readonly name: string;
  readonly fields: Record<string, string | number | boolean>;
}

function ctxWith(signal?: AbortSignal): { ctx: OpCtx; logs: Logged[] } {
  const logs: Logged[] = [];
  return {
    logs,
    ctx: {
      signal: signal ?? new AbortController().signal,
      importId: null,
      log: { event: (name, fields) => void logs.push({ name, fields }) },
    },
  };
}

const QUERY: ResolveQuery = {
  text: 'Angelato',
  cityHint: 'Prague',
  countryHint: 'CZ',
  categoryHint: null,
  near: null,
  maxResults: null,
};

/** A stubbed HTTP response, enough for the gateway's three reads. */
function response(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyGoogleStatus', () => {
  it('reads 429 as an exhausted quota — the failure this project actually hits', () => {
    expect(classifyGoogleStatus(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toBe('quota_exhausted');
  });

  it('separates a spent quota from a broken key even when both arrive as 403', () => {
    // Google has served quota refusals as 403 as well as 429. Filing one as `auth` would send an
    // operator to the credentials page for a problem that fixes itself at midnight.
    expect(classifyGoogleStatus(403, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')).toBe('quota_exhausted');
    expect(classifyGoogleStatus(403, '{"error":{"reason":"rateLimitExceeded"}}')).toBe('quota_exhausted');
    expect(classifyGoogleStatus(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toBe('auth');
    expect(classifyGoogleStatus(401, '')).toBe('auth');
  });

  it('reads a 4xx as our bug and a 5xx as theirs', () => {
    expect(classifyGoogleStatus(400, '{"error":{"message":"Invalid field mask"}}')).toBe('bad_request');
    expect(classifyGoogleStatus(404, '')).toBe('bad_request');
    expect(classifyGoogleStatus(500, '')).toBe('provider_error');
    expect(classifyGoogleStatus(503, '')).toBe('provider_error');
  });
});

describe('googlePlacesGateway failure classification', () => {
  it('attaches the classification and the status to the thrown DomainError', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(response(429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')),
    );
    const gateway = googlePlacesGateway('unused-in-this-test');

    const thrown = await gateway
      .searchText(
        { textQuery: 'Angelato, Prague', regionCode: 'CZ', languageCode: null, maxResultCount: 10 },
        new AbortController().signal,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(thrown).toBeInstanceOf(DomainError);
    const failure = providerFailureOf(thrown);
    expect(failure?.kind).toBe('quota_exhausted');
    expect(failure?.status).toBe(429);
    expect(failure?.provider).toBe('google');
  });

  it('never lets the vendor body reach the client view', async () => {
    const body = '{"error":{"message":"API key not valid","status":"PERMISSION_DENIED"}}';
    vi.stubGlobal('fetch', () => Promise.resolve(response(403, body)));
    const gateway = googlePlacesGateway('unused-in-this-test');

    const thrown = (await gateway
      .searchText(
        { textQuery: 'x', regionCode: null, languageCode: null, maxResultCount: 10 },
        new AbortController().signal,
      )
      .catch((e: unknown) => e)) as DomainError;

    const view = JSON.stringify(thrown.toView());
    expect(view).not.toContain('API key');
    expect(view).not.toContain('PERMISSION_DENIED');
    expect(thrown.toView()).toEqual({ code: 'INTERNAL', retryable: true });
    // Our own message is a composed sentence, not Google's.
    expect(thrown.message).toBe('Google Places searchText failed');
  });

  it('classifies our own ceiling as `timed_out`, with the timeout error code', async () => {
    // Never settles on its own: only the composed signal ends it, which is exactly the shape of a
    // Google request that hangs. `timeoutMs` keeps this to milliseconds instead of five seconds.
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => void reject(init.signal.reason as Error));
        }),
    );
    const gateway = googlePlacesGateway('unused-in-this-test', { timeoutMs: 5 });

    const thrown = (await gateway
      .searchText(
        { textQuery: 'x', regionCode: null, languageCode: null, maxResultCount: 10 },
        new AbortController().signal,
      )
      .catch((e: unknown) => e)) as DomainError;

    expect(thrown.code).toBe('UPSTREAM_TIMEOUT');
    expect(providerFailureOf(thrown)?.kind).toBe('timed_out');
    expect(providerFailureOf(thrown)?.status).toBeNull();
  });

  it('does not file a caller cancellation as a provider timeout', async () => {
    // The user pressed Back. Google did nothing wrong and must not appear in its error rate.
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => void reject(init.signal.reason as Error));
        }),
    );
    const gateway = googlePlacesGateway('unused-in-this-test');

    const pending = gateway
      .searchText(
        { textQuery: 'x', regionCode: null, languageCode: null, maxResultCount: 10 },
        controller.signal,
      )
      .catch((e: unknown) => e);
    controller.abort();

    const thrown = (await pending) as DomainError;
    expect(providerFailureOf(thrown)?.kind).toBe('transport');
  });

  it('classifies a transport failure with no response as `transport`', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('getaddrinfo ENOTFOUND places.googleapis.com'), {
            code: 'ENOTFOUND',
          }),
        }),
      ),
    );
    const gateway = googlePlacesGateway('unused-in-this-test');

    const thrown = (await gateway
      .searchText(
        { textQuery: 'x', regionCode: null, languageCode: null, maxResultCount: 10 },
        new AbortController().signal,
      )
      .catch((e: unknown) => e)) as DomainError;

    const failure = providerFailureOf(thrown);
    expect(failure?.kind).toBe('transport');
    expect(failure?.status).toBeNull();
    // The real reason is still one link further down, for `describeCause` to read.
    expect((failure?.cause as Error).message).toContain('fetch failed');
  });
});

describe('googlePlaceResolver failure logging', () => {
  function failingGateway(error: unknown): GooglePlacesGateway {
    return { searchText: () => Promise.reject(error) };
  }

  it('emits one server-side line naming the classification and the status', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(response(429, '{"error":{"code":429}}')));
    const real = googlePlacesGateway('unused-in-this-test');
    const thrownFromGateway = await real
      .searchText(
        { textQuery: 'x', regionCode: null, languageCode: null, maxResultCount: 10 },
        new AbortController().signal,
      )
      .catch((e: unknown) => e);

    const { ctx, logs } = ctxWith();
    const resolver = googlePlaceResolver(failingGateway(thrownFromGateway));

    await expect(resolver.resolve(QUERY, ctx)).rejects.toBeInstanceOf(DomainError);

    const line = logs.find((l) => l.name === 'places.resolve_failed');
    expect(line).toBeDefined();
    expect(line?.fields).toEqual({
      provider: 'google',
      classification: 'quota_exhausted',
      status: 429,
      cached: false,
    });
  });

  it('logs no status when there was no response, rather than a zero that reads as one', async () => {
    const { ctx, logs } = ctxWith();
    const resolver = googlePlaceResolver(failingGateway(new Error('something unclassified')));

    await expect(resolver.resolve(QUERY, ctx)).rejects.toBeInstanceOf(DomainError);

    const fields = logs.find((l) => l.name === 'places.resolve_failed')?.fields;
    expect(fields).toBeDefined();
    expect(fields).not.toHaveProperty('status');
    // Unclassified stays unclassified: `transport` is the honest floor, not a guess at the cause.
    expect(fields?.classification).toBe('transport');
  });

  it('logs no caption, no query text and no coordinate', async () => {
    const { ctx, logs } = ctxWith();
    const resolver = googlePlaceResolver(failingGateway(new Error('boom')));
    await resolver.resolve(QUERY, ctx).catch(() => undefined);

    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain('Angelato');
    expect(serialised).not.toContain('Prague');
  });

  it('passes a DomainError through instead of re-wrapping it into INTERNAL', async () => {
    // Re-wrapping buried the cause chain a link deeper and flattened UPSTREAM_TIMEOUT to INTERNAL,
    // which is how a timeout became indistinguishable from every other failure.
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => void reject(init.signal.reason as Error));
        }),
    );
    const real = googlePlacesGateway('unused-in-this-test', { timeoutMs: 5 });
    const { ctx } = ctxWith();
    const resolver = googlePlaceResolver(real);

    const thrown = (await resolver.resolve(QUERY, ctx).catch((e: unknown) => e)) as DomainError;
    expect(thrown.code).toBe('UPSTREAM_TIMEOUT');
    expect(providerFailureOf(thrown)?.kind).toBe('timed_out');
  });
});
