import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  DOMAIN_ERROR_CONSTRUCTORS,
  DomainError,
  type DomainErrorCode,
  extractorInvalidOutput,
  extractorUnavailable,
  internal,
  malformedUrl,
  noCaption,
  notAuthenticated,
  postUnavailable,
  rateLimitedLocal,
  rateLimitedUpstream,
  shortLinkUnresolved,
  unsupportedHost,
  unsupportedUrl,
  upstreamTimeout,
} from '@/domain/errors';

describe('DomainErrorCode — the closed 13-code union', () => {
  it('has exactly 13 codes', () => {
    expect(DOMAIN_ERROR_CODES).toHaveLength(13);
    expect(new Set(DOMAIN_ERROR_CODES).size).toBe(13);
  });

  it('is exactly the set named in 07 §9', () => {
    expect(new Set(DOMAIN_ERROR_CODES)).toEqual(
      new Set([
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
      ]),
    );
  });

  it('every code is reachable through exactly one constructor, never a raw string literal', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      const build = DOMAIN_ERROR_CONSTRUCTORS[code];
      expect(typeof build).toBe('function');
      const err = build();
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(code);
    }
  });

  it('is exhaustively covered by a switch — this only compiles if every code is handled', () => {
    const describe_ = (code: DomainErrorCode): string => {
      switch (code) {
        case 'UNSUPPORTED_HOST':
        case 'MALFORMED_URL':
        case 'UNSUPPORTED_URL':
        case 'SHORT_LINK_UNRESOLVED':
        case 'POST_UNAVAILABLE':
        case 'UPSTREAM_TIMEOUT':
        case 'RATE_LIMITED_UPSTREAM':
        case 'RATE_LIMITED_LOCAL':
        case 'NO_CAPTION':
        case 'EXTRACTOR_UNAVAILABLE':
        case 'EXTRACTOR_INVALID_OUTPUT':
        case 'NOT_AUTHENTICATED':
        case 'INTERNAL':
          return code;
        default: {
          // Exhaustiveness check: a 15th code added to the union without a case here fails the
          // build, not just this test.
          const neverCode: never = code;
          throw new Error(`unhandled DomainErrorCode: ${String(neverCode)}`);
        }
      }
    };

    for (const code of DOMAIN_ERROR_CODES) {
      expect(describe_(code)).toBe(code);
    }
  });

  it('fixes retryable per 07 §9, not as a caller-supplied parameter', () => {
    expect(unsupportedHost().retryable).toBe(false);
    expect(malformedUrl().retryable).toBe(false);
    expect(unsupportedUrl().retryable).toBe(false);
    expect(shortLinkUnresolved().retryable).toBe(false);
    expect(postUnavailable().retryable).toBe(true);
    expect(upstreamTimeout().retryable).toBe(true);
    expect(rateLimitedUpstream().retryable).toBe(true);
    expect(rateLimitedLocal().retryable).toBe(false);
    expect(noCaption().retryable).toBe(false);
    expect(extractorUnavailable().retryable).toBe(true);
    expect(extractorInvalidOutput().retryable).toBe(true);
    expect(notAuthenticated().retryable).toBe(false);
    expect(internal().retryable).toBe(true);
  });

  it('accepts an overriding message and an optional cause, without changing the code', () => {
    const cause = new Error('vendor exploded');
    const err = internal('custom diagnostic', cause);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('custom diagnostic');
    expect(err.cause).toBe(cause);
  });

  it('omits cause entirely when none is given, rather than setting it to undefined', () => {
    const err = internal();
    expect('cause' in err).toBe(false);
  });
});

describe('DomainError#toView — the wire-safe shape', () => {
  it('carries only a code and a boolean when no importId is given', () => {
    const view = internal('do not leak this').toView();
    expect(view).toEqual({ code: 'INTERNAL', retryable: true });
    expect('importId' in view).toBe(false);
  });

  it('carries importId when one is given, and never the message or cause', () => {
    const view = postUnavailable('do not leak this either').toView('imp_123' as never);
    expect(view.code).toBe('POST_UNAVAILABLE');
    expect(view.retryable).toBe(true);
    expect(view.importId).toBe('imp_123');
    expect(view).not.toHaveProperty('message');
    expect(view).not.toHaveProperty('cause');
  });
});

describe('NO_PLACES_FOUND is not a DomainError', () => {
  it('the error code union has no no_places/NO_PLACES_FOUND member', () => {
    expect(DOMAIN_ERROR_CODES).not.toContain('NO_PLACES_FOUND');
    expect(DOMAIN_ERROR_CODES).not.toContain('no_places');
  });

  it('domain/errors.ts exposes no constructor for it', () => {
    expect(Object.keys(DOMAIN_ERROR_CONSTRUCTORS)).not.toContain('NO_PLACES_FOUND');
    expect(Object.prototype.hasOwnProperty.call(DOMAIN_ERROR_CONSTRUCTORS, 'NO_PLACES_FOUND')).toBe(false);
  });
});
