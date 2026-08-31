/**
 * The client half of R2-5: `createThumbnailRefresher` (`components/sheet/place-sheet.tsx`) and the
 * two `<img>` elements it feeds.
 *
 * **What is actually at risk here is somebody else's quota.** `onError` does not fire once — it
 * fires for every row on screen, during parse, before hydration, and the failures are perfectly
 * correlated because every signed URL in a library expires within the same hour (~47 hours after
 * it was fetched, measured 2026-08-31). The naive handler turns one scroll into one oEmbed call
 * per row against a hard 500/day shared with the import path, every agent and the owner. So every
 * test below counts requests, not outcomes.
 *
 * The Server Action modules are mocked exactly as `place-detail.test.ts` mocks them: importing them
 * pulls in `@/app/_lib/supabase/server`, which imports `server-only`, which throws by design
 * outside a React Server Component.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  removePlaceFromCollection: vi.fn(),
}));

const { PlaceDetail, createThumbnailRefresher, MAX_THUMBNAIL_REFRESHES_PER_PAGE } = await import(
  '@/components/sheet/place-sheet'
);

import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { ThumbnailRef } from '@/domain/places/spot';

const DEAD = 'https://cdn.example/dead.jpg?x-expires=1788364800';
const ALIVE = 'https://cdn.example/alive.jpg?x-expires=1791000000';

function thumb(sourceId: string | null, url = DEAD): ThumbnailRef {
  return { url, sourceId, expiresAt: null };
}

/** What the route answers with, as the coordinator's transport sees it. */
interface ThumbnailReply {
  ok: boolean;
  status: number;
  body: unknown;
}

/** A transport that answers with a fresh URL and counts how many times it was asked. */
function fresh(url = ALIVE) {
  const post = vi.fn<(body: { sourceId: string; failedUrl: string }) => Promise<ThumbnailReply>>(
    async () => ({ ok: true, status: 200, body: { status: 'ok', url } }),
  );
  return { post, refresher: createThumbnailRefresher({ post }) };
}

describe('createThumbnailRefresher', () => {
  it('asks the server once and hands back the fresh URL', async () => {
    const { post, refresher } = fresh();
    await expect(refresher.refresh(thumb('s1'))).resolves.toEqual({ kind: 'url', url: ALIVE });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toEqual({ sourceId: 's1', failedUrl: DEAD });
  });

  it('does not fire a second call for a source it has already settled', async () => {
    // The brief's own "a second failure within your window does not fire a second call". The
    // refreshed image can fail again (a slow CDN, a 403), and the retry must not be free.
    const { post, refresher } = fresh();
    await refresher.refresh(thumb('s1'));
    await refresher.refresh(thumb('s1'));
    await refresher.refresh(thumb('s1', ALIVE));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('coalesces rows that fail in the same tick into one request', async () => {
    // Twenty rows sharing one TikTok is ordinary — a post that named five places produces five
    // saves against one source. Without coalescing that is five calls for one answer.
    const { post, refresher } = fresh();
    const answers = await Promise.all([
      refresher.refresh(thumb('s1')),
      refresher.refresh(thumb('s1')),
      refresher.refresh(thumb('s1')),
    ]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(answers.every((a) => a.kind === 'url')).toBe(true);
  });

  it('serialises: no second request is issued until the first has answered', async () => {
    // Concurrency 1 is what turns eight refreshes into eight sequential ~600ms calls instead of a
    // burst, and a burst is what a shared quota notices.
    let inFlight = 0;
    let peak = 0;
    const post = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { ok: true, status: 200, body: { status: 'ok', url: ALIVE } };
    });
    const refresher = createThumbnailRefresher({ post });
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => refresher.refresh(thumb(id))));
    expect(post).toHaveBeenCalledTimes(4);
    expect(peak).toBe(1);
  });

  it('stops at the per-page cap however many rows are on screen', async () => {
    // The stampede bound stated as a number: a 200-place library whose thumbnails all expired on
    // the same afternoon costs at most this many upstream calls per page load, not 200.
    const { post, refresher } = fresh();
    const ids = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const answers = [];
    for (const id of ids) answers.push(await refresher.refresh(thumb(id)));
    expect(post).toHaveBeenCalledTimes(MAX_THUMBNAIL_REFRESHES_PER_PAGE);
    expect(refresher.spent()).toBe(MAX_THUMBNAIL_REFRESHES_PER_PAGE);
    expect(answers.filter((a) => a.kind === 'url')).toHaveLength(MAX_THUMBNAIL_REFRESHES_PER_PAGE);
    expect(answers.at(-1)).toEqual({ kind: 'gone' });
  });

  it('spends nothing on a thumbnail with no sources row behind it', async () => {
    // `0016`'s frozen denormalized copy on a save whose join resolved nothing. The route takes a
    // source id, never a URL, so there is genuinely nothing to ask about.
    const { post, refresher } = fresh();
    await expect(refresher.refresh(thumb(null))).resolves.toEqual({ kind: 'gone' });
    expect(post).not.toHaveBeenCalled();
  });

  it('treats a cooling, unavailable or errored answer as gone, and asks no more', async () => {
    for (const response of [
      { ok: true, status: 200, body: { status: 'cooling', url: null } },
      { ok: true, status: 200, body: { status: 'no-thumbnail', url: null } },
      { ok: false, status: 422, body: { error: { code: 'POST_UNAVAILABLE', retryable: true } } },
      { ok: false, status: 401, body: { error: { code: 'NOT_AUTHENTICATED', retryable: false } } },
      { ok: true, status: 200, body: null },
    ]) {
      const post = vi.fn(async () => response);
      const refresher = createThumbnailRefresher({ post });
      await expect(refresher.refresh(thumb('s1'))).resolves.toEqual({ kind: 'gone' });
      await refresher.refresh(thumb('s1'));
      expect(post).toHaveBeenCalledTimes(1);
    }
  });

  it('never rejects, and does not retry after a network failure', async () => {
    // Offline is the common case on a phone. A rejected promise here would surface as an unhandled
    // rejection inside an `onError` handler, and a retry loop would be one per row.
    const post = vi.fn(async () => {
      throw new Error('offline');
    });
    const refresher = createThumbnailRefresher({ post });
    await expect(refresher.refresh(thumb('s1'))).resolves.toEqual({ kind: 'gone' });
    await refresher.refresh(thumb('s1'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('refuses to hand back the URL that just died', async () => {
    // The route answers with what it has, and what it has can be the same string the browser just
    // failed on (a cooldown that raced the write). Handing it back is a guaranteed second failure.
    const post = vi.fn(async () => ({ ok: true, status: 200, body: { status: 'ok', url: DEAD } }));
    const refresher = createThumbnailRefresher({ post });
    await expect(refresher.refresh(thumb('s1'))).resolves.toEqual({ kind: 'gone' });
  });

  it('one failure does not poison the queue behind it', async () => {
    let call = 0;
    const post = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('offline');
      return { ok: true, status: 200, body: { status: 'ok', url: ALIVE } };
    });
    const refresher = createThumbnailRefresher({ post });
    const [first, second] = await Promise.all([
      refresher.refresh(thumb('s1')),
      refresher.refresh(thumb('s2')),
    ]);
    expect(first).toEqual({ kind: 'gone' });
    expect(second).toEqual({ kind: 'url', url: ALIVE });
  });
});

/**
 * The referrer discipline is deliberate and load-bearing: without `no-referrer` the browser hands
 * TikTok's CDN the URL of the page being viewed on every image request, which lets TikTok correlate
 * its own signed URLs with the device asking for them — "which posts this person saved". This
 * change added a second `<img>` attribute (`ref`) and rewrote both elements' failure handling, so
 * the policy is asserted on rendered markup rather than trusted to a diff review.
 */
describe('the referrer policy survives the refresh path', () => {
  const PLACE: DetailPlace = {
    name: 'Sycamore',
    category: 'restaurant',
    lat: 51.47,
    lng: -0.07,
    sourceUrl: 'https://www.tiktok.com/@someone/video/1',
    detail: {
      placeId: 'place-1',
      source: {
        id: 'src-1',
        platform: 'tiktok',
        canonicalUrl: 'https://www.tiktok.com/@someone/video/1',
        media: { kind: 'image', url: DEAD, expiresAt: null },
      },
    },
  };

  it('renders the thumbnail with no-referrer, on the joined source URL', () => {
    const html = renderToStaticMarkup(
      createElement(PlaceDetail, { place: PLACE, savedPlace: null, onClose: () => {} }),
    );
    expect(html).toContain(DEAD);
    // Every `<img>` on this surface, not just the one this test aimed at: a future element added
    // without the attribute fails here.
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    // Case-insensitive: React 19 emits this one attribute camelCased into static markup
    // (`referrerPolicy=`), unlike the lowercased HTML attributes around it.
    for (const image of images) expect(image).toMatch(/referrerpolicy="no-referrer"/i);
  });

  it('prefers the joined sources URL over 0016 frozen copy, so a refresh is visible', () => {
    // The ordering this change reversed. With the old preference, repairing `sources.thumbnail_url`
    // would repair a value no screen reads.
    const html = renderToStaticMarkup(
      createElement(PlaceDetail, {
        place: {
          ...PLACE,
          detail: { ...PLACE.detail!, sourceThumbnailUrl: 'https://cdn.example/frozen.jpg' },
        },
        savedPlace: null,
        onClose: () => {},
      }),
    );
    expect(html).toContain(DEAD);
    expect(html).not.toContain('frozen.jpg');
  });
});
