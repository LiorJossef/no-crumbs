import { describe, expect, it } from 'vitest';

import type { RawSource } from '@/domain/types';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';

function rawWith(caption: string | null): RawSource {
  return {
    id: 'source-1',
    externalId: '1',
    authorHandle: 'x',
    authorName: 'X',
    canonicalUrl: 'https://www.tiktok.com/@x/video/1',
    thumbnailUrl: null,
    texts: caption === null ? [] : [{ kind: 'caption', text: caption }],
    media: [],
  };
}

describe('captionContentExtractor', () => {
  it('supports a raw source with a non-empty caption', () => {
    expect(captionContentExtractor.supports(rawWith('Cafe Fiori, Tel Aviv'))).toBe(true);
  });

  it('does not support a raw source with no caption text', () => {
    expect(captionContentExtractor.supports(rawWith(null))).toBe(false);
  });

  it('does not support a raw source whose caption is only whitespace', () => {
    expect(captionContentExtractor.supports(rawWith('   '))).toBe(false);
  });

  it('extracts the caption verbatim as one ContentPart', async () => {
    const ctx = { signal: new AbortController().signal, importId: null, log: { event: () => {} } };
    const parts = await captionContentExtractor.extract(rawWith('Cafe Fiori, Tel Aviv'), ctx);
    expect(parts).toEqual([{ kind: 'caption', text: 'Cafe Fiori, Tel Aviv', origin: 'tiktok-oembed-title' }]);
  });

  it('throws NO_CAPTION if called directly on an empty caption', async () => {
    const ctx = { signal: new AbortController().signal, importId: null, log: { event: () => {} } };
    await expect(captionContentExtractor.extract(rawWith(''), ctx)).rejects.toMatchObject({ code: 'NO_CAPTION' });
  });
});
