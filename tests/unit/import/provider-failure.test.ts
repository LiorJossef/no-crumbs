/**
 * The classification carrier itself: that it survives the wrapping the resolver seam does to it,
 * and that it cannot smuggle vendor prose out of the adapter.
 */

import { describe, expect, it } from 'vitest';

import { internal, upstreamTimeout } from '@/domain/errors';
import {
  PROVIDER_FAILURE_KINDS,
  ProviderLookupFailure,
  providerFailureOf,
} from '@/domain/import/provider-failure';

describe('ProviderLookupFailure', () => {
  it('composes its message from closed values only — never the vendor body', () => {
    const body = '{"error":{"message":"API key not valid. Please pass a valid API key.","status":"PERMISSION_DENIED"}}';
    const failure = new ProviderLookupFailure({
      provider: 'google',
      kind: 'auth',
      status: 403,
      cause: body,
    });

    expect(failure.message).toBe('google lookup failed: auth (HTTP 403)');
    expect(failure.message).not.toContain('API key');
    // The vendor text is still reachable for a log, but only as a cause — the one field
    // `DomainError.toView` is proven not to serialise.
    expect(failure.cause).toBe(body);
  });

  it('says "no response" rather than inventing a status when there was none', () => {
    const failure = new ProviderLookupFailure({
      provider: 'google',
      kind: 'transport',
      status: null,
      cause: new TypeError('fetch failed'),
    });
    expect(failure.message).toBe('google lookup failed: transport (no response)');
    expect(failure.status).toBeNull();
  });

  it('exposes the kind as `code`, so describeCause surfaces it without knowing this type', () => {
    for (const kind of PROVIDER_FAILURE_KINDS) {
      const failure = new ProviderLookupFailure({ provider: 'google', kind, status: null });
      expect(failure.code).toBe(kind);
      // `describeCause`'s machineCodeOf admits /^[A-Za-z0-9_.:-]{1,40}$/ and drops anything else.
      expect(failure.code).toMatch(/^[A-Za-z0-9_.:-]{1,40}$/);
    }
  });
});

describe('providerFailureOf', () => {
  it('finds the classification through the DomainError the resolver seam throws', () => {
    const failure = new ProviderLookupFailure({
      provider: 'google',
      kind: 'quota_exhausted',
      status: 429,
    });
    const thrown = internal('Google Places searchText failed', failure);

    expect(providerFailureOf(thrown)?.kind).toBe('quota_exhausted');
    expect(providerFailureOf(thrown)?.status).toBe(429);
  });

  it('finds it through a second wrap, so a future re-wrap cannot silently lose it', () => {
    const failure = new ProviderLookupFailure({ provider: 'google', kind: 'auth', status: 403 });
    const thrown = internal('outer', upstreamTimeout('inner', failure));
    expect(providerFailureOf(thrown)?.kind).toBe('auth');
  });

  it('returns null for an unclassified failure rather than guessing one', () => {
    expect(providerFailureOf(internal('something else'))).toBeNull();
    expect(providerFailureOf(new Error('plain'))).toBeNull();
    expect(providerFailureOf(null)).toBeNull();
    expect(providerFailureOf('a string')).toBeNull();
  });

  it('terminates on a cause cycle', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(providerFailureOf(a)).toBeNull();
  });
});
