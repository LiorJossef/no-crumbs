import { describe, expect, it } from 'vitest';

import { DEFAULT_AFTER_SIGN_IN, safeReturnPath } from '@/domain/auth/return-path';

const INVITE = '/collections/join/0c96cfdb-1111-4222-8333-444455556666';
const REAL_TIKTOK = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';

describe('safeReturnPath', () => {
  it('returns to a collection invite, which is the first reason it exists', () => {
    expect(safeReturnPath(INVITE)).toBe(INVITE);
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
      // The same four aimed at the destination that was *added* in 2026-08-31's widening, because
      // an allow-list that grows is the moment these have to be re-asked rather than assumed.
      '//evil.io/import?url=x',
      'https://evil.io/import?url=x',
      '/\\evil.io/import?url=x',
      '/import\\@evil.io?url=x',
    ]) {
      expect(safeReturnPath(hostile), hostile).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it('is an allow-list of destinations, not merely a same-origin check', () => {
    // Same origin, perfectly safe, and still refused: nobody has decided these are post-sign-in
    // destinations, and a wildcard would make that decision for every route added later.
    expect(safeReturnPath('/profile')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('/collections')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnPath('/collections/join/not-a-uuid')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('compares the normalised path, so a traversal cannot spell its way past the list', () => {
    // `new URL` collapses `.` and `..` — and their `%2e` spellings, which the URL standard treats
    // as the same segment — before anything is matched. Each of these normalises to a path that is
    // not a destination, which is why checking the raw string would have been the weaker test.
    for (const traversal of [
      `${INVITE}/../../x`,
      `${INVITE}/%2e%2e/%2e%2e/x`,
      '/import/../profile',
      '/import/%2e%2e/profile',
      '/import%2Furl',
    ]) {
      expect(safeReturnPath(traversal), traversal).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it('returns to the share seam carrying its link, which is the second reason it exists', () => {
    const back = safeReturnPath(`/import?url=${encodeURIComponent(REAL_TIKTOK)}`);
    expect(new URL(back, 'https://n').pathname).toBe('/import');
    expect(new URLSearchParams(back.split('?')[1]).get('url')).toBe(REAL_TIKTOK);
  });

  it('returns to a bare /import too — arriving there signed out is not a reason to lose the page', () => {
    expect(safeReturnPath('/import')).toBe('/import');
  });

  it('carries only the parameters the destination named', () => {
    // `state` is the development-only screen seam. It is dropped, along with anything else a
    // stranger's link tried to set on the page we are returning to.
    const back = safeReturnPath('/import?url=x&state=review&next=/map&foo=bar#frag');
    expect(back).toBe('/import?url=x');
  });

  it('carries every value of a repeated parameter, because a share sends two', () => {
    // Chromium's share target maps both `url` and `text` onto this one name. Dropping one would
    // make `sharedImportUrl`'s "first value that contains a link" rule un-runnable on return.
    const back = safeReturnPath('/import?url=Look+at+this&url=' + encodeURIComponent(REAL_TIKTOK));
    expect(new URLSearchParams(back.split('?')[1]).getAll('url')).toEqual([
      'Look at this',
      REAL_TIKTOK,
    ]);
  });

  it('does not decide what a TikTok link is — it carries a hostile value back to be refused there', () => {
    // The point of the design: `canonicaliseTikTokUrl` is the SSRF boundary and it runs on
    // arrival. A second host check here would be a second place that can disagree with it.
    for (const payload of [
      'http://169.254.169.254/latest/meta-data/',
      'javascript:alert(1)',
      'https://tiktok.com.evil.test/@a/video/1',
    ]) {
      const back = safeReturnPath(`/import?url=${encodeURIComponent(payload)}`);
      expect(new URLSearchParams(back.split('?')[1]).get('url'), payload).toBe(payload);
    }
  });

  it('refuses a payload too long to carry rather than building an unbounded URL', () => {
    expect(safeReturnPath(`/import?url=${'a'.repeat(3000)}`)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('never returns anything but a path, for any input', () => {
    // A blanket property over the hostile corpus: whatever comes out is relative and single-slashed,
    // so resolving it against our own origin cannot land on another one.
    for (const raw of [
      null,
      '',
      'https://evil.io',
      '//evil.io',
      '/\\evil.io',
      '/import?url=//evil.io',
      `${INVITE}?next=//evil.io`,
      'javascript:alert(1)',
      INVITE,
      '/import',
    ]) {
      const back = safeReturnPath(raw);
      expect(back.startsWith('/'), String(raw)).toBe(true);
      expect(back.startsWith('//'), String(raw)).toBe(false);
      expect(new URL(back, 'https://own.origin.test').origin, String(raw)).toBe(
        'https://own.origin.test',
      );
    }
  });
});
