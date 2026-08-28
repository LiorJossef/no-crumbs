import { describe, expect, it } from 'vitest';

import {
  canonicaliseTikTokUrl,
  isAllowedTikTokHost,
  TIKTOK_HOSTS,
  type CanonicaliseResult,
} from '@/domain/source/canonicalise-tiktok-url';

const VIDEO_ID = '7346702347491446049'; // 19 digits, a real id from `04` §1

function expectVideo(result: CanonicaliseResult, externalId: string): void {
  expect(result.ok).toBe(true);
  if (!result.ok) return; // narrows for TS; the assertion above already failed the test otherwise
  expect(result.value).toEqual({ kind: 'video', externalId });
}

function expectShortLink(
  result: CanonicaliseResult,
  code: string,
  host: 'vm.tiktok.com' | 'vt.tiktok.com' | 'www.tiktok.com',
): void {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toEqual({ kind: 'short_link', code, host });
}

function expectError(result: CanonicaliseResult, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
}

describe('canonicaliseTikTokUrl — 04 §2\'s table, verbatim', () => {
  it('https://tiktok.com/@a/video/<id> — bare tiktok.com is allow-listed', () => {
    expectVideo(canonicaliseTikTokUrl(`https://tiktok.com/@a/video/${VIDEO_ID}`), VIDEO_ID);
  });

  it('/en/@a/video/<id> — strips a two-letter locale prefix', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/en/@a/video/${VIDEO_ID}`), VIDEO_ID);
  });

  it('/en-US/@a/video/<id> — strips a language-region locale prefix', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/en-US/@a/video/${VIDEO_ID}`), VIDEO_ID);
  });

  it('m.tiktok.com/v/<id>.html — same id, the m-host short-video form', () => {
    expectVideo(canonicaliseTikTokUrl(`https://m.tiktok.com/v/${VIDEO_ID}.html`), VIDEO_ID);
  });

  it('@x/video/<id> with a wrong/arbitrary handle — the handle is never inspected here', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/@x/video/${VIDEO_ID}`), VIDEO_ID);
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/@/video/${VIDEO_ID}`), VIDEO_ID);
  });

  it('vm./vt./www.tiktok.com/t/ + a 6-20 char code — classified as a short link, not resolved', () => {
    expectShortLink(canonicaliseTikTokUrl('https://vm.tiktok.com/ZMrRs9oPp/'), 'ZMrRs9oPp', 'vm.tiktok.com');
    expectShortLink(canonicaliseTikTokUrl('https://vt.tiktok.com/ZMrRs9oPp'), 'ZMrRs9oPp', 'vt.tiktok.com');
    expectShortLink(
      canonicaliseTikTokUrl('https://www.tiktok.com/t/ZMrRs9oPp/'),
      'ZMrRs9oPp',
      'www.tiktok.com',
    );
  });

  it('vm.tiktok.com/ZMdYXsQLW — 302-to-homepage-then-200 is NOT this function\'s job', () => {
    // 04 §2's test-case table lists this URL resolving to SHORT_LINK_UNRESOLVED, but that outcome
    // depends on the actual redirect chain (a network operation). This pure canonicaliser cannot
    // know a short code is dead without dereferencing it, so its only correct answer here is
    // "this is a short link, go resolve it" — the same as any other syntactically valid code.
    // SHORT_LINK_UNRESOLVED is asserted at the network-touching adapter that performs the hop
    // (L0-F1's later task), not here.
    expectShortLink(canonicaliseTikTokUrl('https://vm.tiktok.com/ZMdYXsQLW'), 'ZMdYXsQLW', 'vm.tiktok.com');
  });

  it('tiktok.com.evil.io/@a/video/<id> — UNSUPPORTED_HOST, closed allow-list fails suffix tricks', () => {
    expectError(canonicaliseTikTokUrl(`https://tiktok.com.evil.io/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('https://www.tiktok.com/@definitelynotarealuser999xyz — a profile is not a post', () => {
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/@definitelynotarealuser999xyz'), 'UNSUPPORTED_URL');
  });
});

describe('the SSRF boundary — default-deny, allow-list only', () => {
  it('rejects a host that only ends in tiktok.com (suffix, never accepted)', () => {
    expectError(canonicaliseTikTokUrl(`https://tiktok.com.evil.io/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
    expectError(canonicaliseTikTokUrl(`https://faketiktok.com/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('rejects a host that merely contains "tiktok.com" as a substring, not a suffix', () => {
    expectError(canonicaliseTikTokUrl(`https://nottiktok.com/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
    expectError(canonicaliseTikTokUrl(`https://tiktok.com.attacker.example/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('rejects userinfo, even when the resulting host would otherwise be allowed by a naive check', () => {
    expectError(canonicaliseTikTokUrl(`https://tiktok.com@evil.io/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('rejects an explicit port on an otherwise allow-listed host', () => {
    expectError(canonicaliseTikTokUrl(`https://www.tiktok.com:8443/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('rejects IPv4 and bracketed IPv6 literals outright', () => {
    expectError(canonicaliseTikTokUrl(`https://127.0.0.1/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
    expectError(canonicaliseTikTokUrl(`https://[::1]/@a/video/${VIDEO_ID}`), 'UNSUPPORTED_HOST');
  });

  it('rejects a non-http(s) scheme', () => {
    expectError(canonicaliseTikTokUrl(`ftp://www.tiktok.com/@a/video/${VIDEO_ID}`), 'MALFORMED_URL');
    expectError(canonicaliseTikTokUrl(`javascript:alert(1)`), 'MALFORMED_URL');
  });

  it('TIKTOK_HOSTS / isAllowedTikTokHost is the exact five-host closed set, reusable by the future short-link adapter', () => {
    expect([...TIKTOK_HOSTS].sort()).toEqual(
      ['m.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'www.tiktok.com'].sort(),
    );
    expect(isAllowedTikTokHost('www.tiktok.com')).toBe(true);
    expect(isAllowedTikTokHost('tiktok.com.evil.io')).toBe(false);
    expect(isAllowedTikTokHost('nottiktok.com')).toBe(false);
    expect(isAllowedTikTokHost('TIKTOK.COM')).toBe(false); // caller must pass an already-lowercased hostname
  });
});

describe('photo / carousel posts resolve exactly like a video (04 §5 category L, specimen 2026-08-28)', () => {
  // Measured on a real carousel supplied by the owner, `@evesela/photo/7665396684981095688`:
  // oEmbed **400s** the `/photo/` URL form and **200s** the identical id under `/video/<id>`,
  // returning the full caption — which in that specimen names a venue outright. So the URL form
  // was the only obstacle, and rejecting these as `PHOTO_POST` was refusing content we can read.
  it('/@handle/photo/<id> yields the same externalId as the video form', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/@a/photo/${VIDEO_ID}`), VIDEO_ID);
  });

  it('the bare /photo/<id> form works too', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/photo/${VIDEO_ID}`), VIDEO_ID);
  });

  it('dedups against the same post linked as a video — the id alone is the key', () => {
    // `04` §2: the dedup key is the numeric id, never the URL or the handle. A carousel and a
    // video link to the same post must therefore not become two rows.
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/@a/photo/${VIDEO_ID}`), VIDEO_ID);
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/@b/video/${VIDEO_ID}`), VIDEO_ID);
  });
});

describe('recognised-platform vs not-a-link-at-all — two distinguishable outcomes (L0-F1-T2)', () => {
  it('a well-formed URL on a non-TikTok host is UNSUPPORTED_HOST ("recognised platform, not a link we read")', () => {
    expectError(canonicaliseTikTokUrl('https://www.instagram.com/p/Cxyz123/'), 'UNSUPPORTED_HOST');
    expectError(canonicaliseTikTokUrl('https://www.youtube.com/watch?v=abc123'), 'UNSUPPORTED_HOST');
    expectError(canonicaliseTikTokUrl('https://youtu.be/abc123'), 'UNSUPPORTED_HOST');
  });

  it('input that does not parse as an absolute URL at all is MALFORMED_URL ("not a link at all")', () => {
    expectError(canonicaliseTikTokUrl('this is just some text I typed'), 'MALFORMED_URL');
    expectError(canonicaliseTikTokUrl('tiktok.com/@a/video/123'), 'MALFORMED_URL'); // no scheme
    expectError(canonicaliseTikTokUrl(''), 'MALFORMED_URL');
    expectError(canonicaliseTikTokUrl('   '), 'MALFORMED_URL');
  });

  it('these two outcomes carry different DomainErrorCode values, never collapsed to one', () => {
    const recognisedPlatform = canonicaliseTikTokUrl('https://www.instagram.com/p/Cxyz123/');
    const notALink = canonicaliseTikTokUrl('not a link');
    expect(recognisedPlatform.ok).toBe(false);
    expect(notALink.ok).toBe(false);
    if (recognisedPlatform.ok || notALink.ok) return;
    expect(recognisedPlatform.error.code).not.toBe(notALink.error.code);
    expect(recognisedPlatform.error.code).toBe('UNSUPPORTED_HOST');
    expect(notALink.error.code).toBe('MALFORMED_URL');
  });
});

describe('other path classifications — 04 §2 step 3\'s remaining rows', () => {
  it('/video/<id> — the handle-less video form', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/video/${VIDEO_ID}`), VIDEO_ID);
  });

  it('/embed/v2/<id> and /embed/<id> — rewritten to a video id', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/embed/v2/${VIDEO_ID}`), VIDEO_ID);
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com/embed/${VIDEO_ID}`), VIDEO_ID);
  });

  it('tag / music / discover / live / channel — all UNSUPPORTED_URL', () => {
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/tag/travel'), 'UNSUPPORTED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/music/original-sound-123'), 'UNSUPPORTED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/discover/tokyo-food'), 'UNSUPPORTED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/live'), 'UNSUPPORTED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/channel/travel'), 'UNSUPPORTED_URL');
  });

  it('a bare host with no path at all is UNSUPPORTED_URL, not a crash', () => {
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com'), 'UNSUPPORTED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/'), 'UNSUPPORTED_URL');
  });

  it('an id of the wrong shape is MALFORMED_URL, even under an otherwise valid path', () => {
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/@a/video/not-a-number'), 'MALFORMED_URL');
    expectError(canonicaliseTikTokUrl('https://www.tiktok.com/@a/video/123'), 'MALFORMED_URL'); // too short
    expectError(
      canonicaliseTikTokUrl('https://www.tiktok.com/@a/video/123456789012345678901'), // too long (21 digits)
      'MALFORMED_URL',
    );
  });

  it('a short-link code of the wrong shape is MALFORMED_URL', () => {
    expectError(canonicaliseTikTokUrl('https://vm.tiktok.com/ab'), 'MALFORMED_URL'); // too short
  });
});

describe('step 2 — noise stripping', () => {
  it('drops the fragment and all query parameters, including tracking params, from the identity', () => {
    expectVideo(
      canonicaliseTikTokUrl(
        `https://www.tiktok.com/@a/video/${VIDEO_ID}?is_from_webapp=1&sender_device=pc&utm_source=x#section`,
      ),
      VIDEO_ID,
    );
  });

  it('collapses duplicate slashes and a trailing slash', () => {
    expectVideo(canonicaliseTikTokUrl(`https://www.tiktok.com//@a//video/${VIDEO_ID}//`), VIDEO_ID);
  });
});
