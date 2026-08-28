import { describe, expect, it } from 'vitest';

import { extractPastedUrl, pasteWasNarrowed } from '@/domain/source/extract-pasted-url';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';

describe('extractPastedUrl', () => {
  it('leaves a bare URL exactly as it was', () => {
    const url = 'https://www.tiktok.com/@user/video/1234567890123456789';
    expect(extractPastedUrl(url)).toBe(url);
    expect(pasteWasNarrowed(url)).toBe(false);
  });

  it('reads the link out of what TikTok actually copies', () => {
    // Caption, link, hashtags — the real shape of the clipboard after "Copy link".
    const pasted = 'best falafel in tel aviv 🧆 https://vm.tiktok.com/ZS2abc/ #telaviv #foodie';
    expect(extractPastedUrl(pasted)).toBe('https://vm.tiktok.com/ZS2abc/');
    expect(pasteWasNarrowed(pasted)).toBe(true);
  });

  it('handles the multi-line form and a Hebrew caption', () => {
    const pasted = 'הפלאפל הכי טוב בתל אביב\nhttps://vm.tiktok.com/ZS2abc/\n#אוכל';
    expect(extractPastedUrl(pasted)).toBe('https://vm.tiktok.com/ZS2abc/');
  });

  it('drops sentence punctuation stuck to the end, but never a trailing slash', () => {
    expect(extractPastedUrl('go here: https://vm.tiktok.com/ZS2abc/.')).toBe(
      'https://vm.tiktok.com/ZS2abc/',
    );
    expect(extractPastedUrl('(https://vm.tiktok.com/ZS2abc/)')).toBe(
      'https://vm.tiktok.com/ZS2abc/',
    );
    // The slash is path, not punctuation — TikTok's own short links end in one.
    expect(extractPastedUrl('https://vm.tiktok.com/ZS2abc/')).toBe('https://vm.tiktok.com/ZS2abc/');
  });

  it('takes the first link, not the most TikTok-looking one', () => {
    // Ranking would mean this function had an opinion about hosts. That is the allow-list's job.
    expect(extractPastedUrl('see https://example.com/a and https://vm.tiktok.com/b')).toBe(
      'https://example.com/a',
    );
  });

  it('does not invent a scheme for a bare host', () => {
    expect(extractPastedUrl('tiktok.com/@user/video/1234567890123456789')).toBe(
      'tiktok.com/@user/video/1234567890123456789',
    );
  });

  it('returns the pasted text when there is no link in it, so the error is about what they pasted', () => {
    expect(extractPastedUrl('  no link here  ')).toBe('no link here');
    expect(extractPastedUrl('   ')).toBe('');
  });

  it('cannot widen the host allow-list — every extraction still goes through the boundary', () => {
    // The security property this module must not touch: whatever it picks, the canonicaliser is
    // still the thing that decides, and a hostile paste can at most choose a different substring
    // for it to reject.
    const hostile = 'look https://tiktok.com.evil.io/@a/video/1234567890123456789 nice';
    const extracted = extractPastedUrl(hostile);
    expect(extracted).toBe('https://tiktok.com.evil.io/@a/video/1234567890123456789');

    const result = canonicaliseTikTokUrl(extracted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('a real share-sheet paste survives the whole path', () => {
    const pasted = 'Kiaans Tooting 🍜 https://www.tiktok.com/@exploringlondon/video/1234567890123456789 #london';
    const result = canonicaliseTikTokUrl(extractPastedUrl(pasted));
    expect(result.ok).toBe(true);
  });
});
