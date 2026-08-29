import { describe, expect, it } from 'vitest';

import { DEFAULT_AFTER_SIGN_IN, safeReturnPath } from '@/domain/auth/return-path';

describe('safeReturnPath', () => {
  it('returns to a collection invite, which is the only reason it exists', () => {
    const path = '/collections/join/0c96cfdb-1111-4222-8333-444455556666';
    expect(safeReturnPath(path)).toBe(path);
  });

  it('falls back to the map when there is nothing to return to', () => {
    expect(safeReturnPath(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses every shape of open redirect', () => {
    for (const hostile of [
      'https://evil.io',
      'http://evil.io/collections/join/0c96cfdb-1111-4222-8333-444455556666',
      '//evil.io',
      '//evil.io/collections/join/0c96cfdb-1111-4222-8333-444455556666',
      '/\\evil.io',
      'javascript:alert(1)',
      'data:text/html,<script>',
      '  /collections/join/0c96cfdb-1111-4222-8333-444455556666',
    ]) {
      expect(safeReturnPath(hostile)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it('is an allow-list of destinations, not merely a same-origin check', () => {
    // Same origin, perfectly safe, and still refused: nobody has decided these are post-sign-in
    // destinations, and a wildcard would make that decision for every route added later.
    expect(safeReturnPath('/import')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('/collections')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('/collections/join/not-a-uuid')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('/collections/join/0c96cfdb-1111-4222-8333-444455556666/../../x')).toBe(
      DEFAULT_AFTER_SIGN_IN,
    );
  });
});
