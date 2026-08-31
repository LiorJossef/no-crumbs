/**
 * `signedUrlExpiry` and `thumbnailOf` (`domain/places/spot.ts`) — the two pure pieces of R2-5.
 *
 * The first exists because `SpotSource.media.expiresAt` was a hard-coded `null` with a comment
 * saying no expiry was stored. That was never true: TikTok signs the deadline into the URL as
 * `x-expires`. The fixture below is a **real stored URL**, copied verbatim out of the local
 * database's `sources` table on 2026-08-31, so this test fails if TikTok's signing scheme changes
 * shape rather than only if the parser is edited.
 *
 * The second exists because the two stored copies of a thumbnail URL age differently and only one
 * of them can be repaired; getting the preference backwards makes the whole refresh path repair a
 * value no screen reads.
 */
import { describe, expect, it } from 'vitest';

import { signedUrlExpiry, thumbnailOf, type PlaceDetailFacts } from '@/domain/places/spot';

/** Verbatim from `sources.thumbnail_url`, video `7573466599361924382`, fetched 2026-08-31 16:48Z.
 *  Its `x-expires=1788364800` is 2026-09-02 16:00Z — a **47-hour** window, not six months. */
const REAL_TIKTOK_THUMBNAIL =
  'https://p16-common-sign.tiktokcdn.com/tos-useast8-p-0068-tx2/oE3jBf1nCi9KI8WdxA0AiBcaEUISAAiLAi9Ant~tplv-tiktokx-origin.image?dr=14575&x-expires=1788364800&x-signature=BK7J9AYbXbAfxr8pl7TQ3qDrlds%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my2';

describe('signedUrlExpiry', () => {
  it('reads the deadline TikTok signs into a real stored thumbnail URL', () => {
    const expiry = signedUrlExpiry(REAL_TIKTOK_THUMBNAIL);
    expect(expiry).not.toBeNull();
    expect(expiry?.toISOString()).toBe('2026-09-02T16:00:00.000Z');
  });

  it('is ~47 hours after the fetch, not the ~6 months migration 0003 claims', () => {
    // The measurement the whole finding turns on, pinned so a future reader does not have to take
    // a prose claim on trust. 0003's comment would put this at ~4380 hours.
    const fetchedAt = Date.parse('2026-08-31T16:48:51Z');
    const hours =
      ((signedUrlExpiry(REAL_TIKTOK_THUMBNAIL) as Date).getTime() - fetchedAt) / 3_600_000;
    expect(hours).toBeGreaterThan(46);
    expect(hours).toBeLessThan(48);
  });

  it('says null rather than guessing, for every shape that carries no deadline', () => {
    // `null` means unknown here, never "permanent" — the callers are written to that reading.
    expect(signedUrlExpiry('https://example.com/thumb.jpg')).toBeNull();
    expect(signedUrlExpiry('not a url at all')).toBeNull();
    expect(signedUrlExpiry('')).toBeNull();
    expect(signedUrlExpiry('https://example.com/a?x-expires=')).toBeNull();
    expect(signedUrlExpiry('https://example.com/a?x-expires=soon')).toBeNull();
    expect(signedUrlExpiry('https://example.com/a?x-expires=-1')).toBeNull();
  });

  it('rejects implausible values instead of returning a Date nobody can trust', () => {
    // 0 is the shape a missing value takes when something upstream coerces it; a millisecond
    // timestamp pasted into a seconds field lands in the year 58,000.
    expect(signedUrlExpiry('https://example.com/a?x-expires=0')).toBeNull();
    expect(signedUrlExpiry('https://example.com/a?x-expires=1788364800000')).toBeNull();
  });

  it('never throws, whatever a text column holds', () => {
    for (const junk of ['//', 'http://', '%%%', 'https://[::1', ' ']) {
      expect(() => signedUrlExpiry(junk)).not.toThrow();
    }
  });
});

const BASE: PlaceDetailFacts = { placeId: 'p1' };

describe('thumbnailOf', () => {
  it('prefers the joined sources row, because that is the one a refresh can write to', () => {
    const thumb = thumbnailOf({
      ...BASE,
      sourceThumbnailUrl: 'https://cdn.example/frozen.jpg',
      source: {
        id: 'src-1',
        platform: 'tiktok',
        canonicalUrl: 'https://www.tiktok.com/@a/video/1',
        media: { kind: 'image', url: REAL_TIKTOK_THUMBNAIL, expiresAt: null },
      },
    });
    expect(thumb?.url).toBe(REAL_TIKTOK_THUMBNAIL);
    expect(thumb?.sourceId).toBe('src-1');
  });

  it('falls back to 0016 frozen copy when no source joined, and marks it unrefreshable', () => {
    // `sourceId: null` is the whole point: the route takes a source id, never a URL, so a save
    // whose join resolved nothing has nothing to ask about. Saying so beats pretending.
    const thumb = thumbnailOf({ ...BASE, sourceThumbnailUrl: 'https://cdn.example/frozen.jpg' });
    expect(thumb).toEqual({ url: 'https://cdn.example/frozen.jpg', sourceId: null, expiresAt: null });
  });

  it('is null for a manual save and for no facts at all', () => {
    expect(thumbnailOf(BASE)).toBeNull();
    expect(thumbnailOf(undefined)).toBeNull();
  });

  it('carries the expiry the read path parsed, rather than re-deriving one', () => {
    const expiresAt = new Date('2026-09-02T16:00:00.000Z');
    const thumb = thumbnailOf({
      ...BASE,
      source: {
        id: 'src-1',
        platform: 'tiktok',
        canonicalUrl: 'https://www.tiktok.com/@a/video/1',
        media: { kind: 'image', url: REAL_TIKTOK_THUMBNAIL, expiresAt },
      },
    });
    expect(thumb?.expiresAt).toBe(expiresAt);
  });
});
