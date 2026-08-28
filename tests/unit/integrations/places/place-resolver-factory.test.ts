/**
 * The provider gate. These are terms-of-service assertions dressed as unit tests: `06` §3.1 says
 * Google Places content may not be paired with a non-Google map, our renderer is still MapLibre,
 * and the owner's 2026-08-28 ruling makes Google primary anyway. The reconciliation is that
 * production keeps Overture until the renderer moves — so the cases below are the boundary itself,
 * not an implementation detail of it.
 *
 * `createPlaceResolver` is exercised only where it does not need a Supabase client. The Overture
 * branch builds a real gateway, which is `supabase/place-resolver.test.ts`'s subject.
 */

import { describe, expect, it, vi } from 'vitest';

// The module opens with `import 'server-only'`, which throws outside a server bundle. What that
// package protects is the bundler boundary, not this test — same mock, same reason, as
// `integrations/supabase/place-resolver.test.ts`.
vi.mock('server-only', () => ({}));

import {
  lookupCacheEnabled,
  resolverProviderFor,
  type PlaceResolverEnv,
} from '@/integrations/places/place-resolver-factory';

const LOCAL_WITH_KEY: PlaceResolverEnv = {
  NEXT_PUBLIC_STAGE: 'local',
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-key',
};

describe('resolverProviderFor', () => {
  it('uses Google where we develop and measure', () => {
    expect(resolverProviderFor(LOCAL_WITH_KEY).provider).toBe('google');
    expect(resolverProviderFor({ ...LOCAL_WITH_KEY, NEXT_PUBLIC_STAGE: 'preview' }).provider).toBe(
      'google',
    );
    expect(resolverProviderFor({ ...LOCAL_WITH_KEY, NEXT_PUBLIC_STAGE: 'staging' }).provider).toBe(
      'google',
    );
  });

  it('falls back to Overture in production, and says why', () => {
    const decision = resolverProviderFor({ ...LOCAL_WITH_KEY, NEXT_PUBLIC_STAGE: 'production' });
    expect(decision.provider).toBe('overture');
    expect(decision.reason).toContain('non-Google map');
  });

  it('treats an unset or unrecognised stage as production', () => {
    // Failing safe toward the compliant pairing costs a measurement; failing open costs a breach,
    // so a stage nobody has thought about must not silently enable Google.
    expect(resolverProviderFor({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'k' }).provider).toBe('overture');
    expect(
      resolverProviderFor({ ...LOCAL_WITH_KEY, NEXT_PUBLIC_STAGE: 'prod-canary' }).provider,
    ).toBe('overture');
  });

  it('lets an explicit PLACE_RESOLVER override the gate in either direction', () => {
    // The escape hatch for the day the renderer moves — and for pinning a measurement run.
    expect(
      resolverProviderFor({
        ...LOCAL_WITH_KEY,
        NEXT_PUBLIC_STAGE: 'production',
        PLACE_RESOLVER: 'google',
      }).provider,
    ).toBe('google');

    expect(resolverProviderFor({ ...LOCAL_WITH_KEY, PLACE_RESOLVER: 'overture' }).provider).toBe(
      'overture',
    );
  });

  it('refuses a PLACE_RESOLVER value it does not recognise', () => {
    // Silently falling back would make a typo look like a policy decision.
    expect(() => resolverProviderFor({ ...LOCAL_WITH_KEY, PLACE_RESOLVER: 'googl' })).toThrow(
      /Unknown PLACE_RESOLVER/u,
    );
  });

  it('falls back to Overture when no Google key is configured', () => {
    expect(resolverProviderFor({ NEXT_PUBLIC_STAGE: 'local' }).provider).toBe('overture');
    expect(
      resolverProviderFor({ NEXT_PUBLIC_STAGE: 'local', NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '' })
        .provider,
    ).toBe('overture');
  });

  it('prefers the server-only key over the browser-exposed one', () => {
    // `NEXT_PUBLIC_*` is compiled into the client bundle, so it is readable by anyone and spendable
    // by anyone. It stays supported for local work only.
    const decision = resolverProviderFor({
      NEXT_PUBLIC_STAGE: 'local',
      GOOGLE_PLACES_API_KEY: 'server-key',
    });
    expect(decision.provider).toBe('google');
  });
});

describe('lookupCacheEnabled', () => {
  it('is on unless it is explicitly switched off', () => {
    // A cache that has to be opted into is a cache that is off in production, where the 100/day
    // Text Search quota is the constraint it exists for.
    expect(lookupCacheEnabled({})).toBe(true);
    expect(lookupCacheEnabled({ PLACE_LOOKUP_CACHE: '' })).toBe(true);
    expect(lookupCacheEnabled({ PLACE_LOOKUP_CACHE: 'on' })).toBe(true);
    expect(lookupCacheEnabled({ PLACE_LOOKUP_CACHE: 'off' })).toBe(false);
  });
});
