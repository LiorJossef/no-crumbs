/**
 * L0-TRANSCRIPT-T4. Every test here is offline: `fetch` is stubbed, and `sleep`/`now`/`random`
 * are injected so the politeness interval and the backoff are asserted rather than waited out.
 *
 * The response fixtures are built from the shapes measured on 2026-08-29
 * (`docs/evidence/extraction/raw/mstoken-carry-2026-08-29.json`): a shed is HTTP 200 with
 * `x-csr-fallback: 1` and no rehydration marker; a render is HTTP 200 carrying the marker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import {
  __resetMediaAcquisitionStateForTests,
  acquireTikTokMedia,
  mediaAcquisitionBreaker,
  parseMediaRefFromPayload,
} from '@/integrations/tiktok/media-acquisition';

const EXTERNAL_ID = '7245648559981350186';
const HANDLE = 'briancantstopeating';
const MEDIA_URL =
  'https://v16-webapp-prime.tiktokcdn.com/video/tos/useast2a/abc/?a=1988&x-expires=1788112800&x-signature=abc%3D';

interface Recorded {
  readonly name: string;
  readonly fields: Record<string, string | number | boolean>;
}

function ctx(events: Recorded[] = [], signal = new AbortController().signal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: (name, fields) => events.push({ name, fields }) },
  };
}

/** A fake clock plus a `sleep` that only advances it — no timers, no waiting. */
function fakeDeps() {
  let clock = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    now: () => clock,
    deps: {
      now: () => clock,
      sleep: async (ms: number) => {
        slept.push(ms);
        clock += ms;
      },
      random: () => 0.5,
    },
  };
}

function payloadHtml(videoId: string, playAddr: string | null): string {
  const item = playAddr === null ? { id: videoId } : { id: videoId, video: { playAddr } };
  const json = JSON.stringify({
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': { statusCode: 0, itemInfo: { itemStruct: item } },
    },
  });
  return `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script></body></html>`;
}

function renderResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

/** The measured shed: 200, no marker, `x-csr-fallback: 1`. */
function shedResponse(): Response {
  return new Response('<html><body>shell</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html', 'x-csr-fallback': '1' },
  });
}

beforeEach(() => {
  __resetMediaAcquisitionStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMediaAcquisitionStateForTests();
});

describe('acquireTikTokMedia', () => {
  /**
   * Regression, and it shipped: the wall detector substring-matched bare `captcha`, which appears
   * in TikTok's own script bundle on every healthy page. A live local import on 2026-08-29 logged
   * `breaker_tripped reason=hard_block status=200` against a response that had just served us the
   * payload, and acquisition then refused everything for thirty minutes. A page carrying the
   * payload is never a block, whatever words are in it.
   */
  it('does not read a healthy page as a block because its bundle mentions captcha', async () => {
    const html = payloadHtml(EXTERNAL_ID, MEDIA_URL).replace(
      '</body>',
      '<script src="/webapp/captcha-sdk.js"></script><div>Access denied handler</div></body>',
    );
    // A fresh Response per call — a body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => renderResponse(html));
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(ref?.url).toBe(MEDIA_URL);
    expect(events.map((e) => e.name)).not.toContain('tiktok.media_acquisition.breaker_tripped');

    // And the breaker really is closed afterwards, not merely un-logged.
    const second = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(),
      deps,
    );
    expect(second?.url).toBe(MEDIA_URL);
  });

  it('returns a video MediaRef with its expiry when the page is server-rendered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL)));
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(ref).toEqual({
      kind: 'video',
      url: MEDIA_URL,
      expiresAt: new Date(1788112800 * 1000),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.name)).toContain('tiktok.media_acquisition.acquired');
  });

  it('retries a csr-shed and succeeds on the next attempt, with a jittered backoff', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(shedResponse())
      .mockResolvedValueOnce(renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL)));
    vi.stubGlobal('fetch', fetchMock);
    const { deps, slept } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(),
      deps,
    );

    expect(ref?.kind).toBe('video');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 400ms base + 50% jitter = 600ms of backoff, then 600ms more to reach the 1200ms politeness
    // floor: the backoff counts toward the floor rather than stacking on top of it, so the gap
    // between the two fetches is exactly the floor and never less.
    expect(slept).toEqual([600, 600]);
    expect(slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1200);
  });

  it('gives up after four csr-sheds and returns null rather than fetching a fifth time', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => shedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(ref).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toEqual({
      name: 'tiktok.media_acquisition.failed',
      fields: { reason: 'csr_shed_exhausted', attempts: 4, shed: 4 },
    });
    // A shed is not a block: it must never trip the breaker, or a busy hour would disable
    // acquisition (and start logging block alerts) for nothing.
    expect(mediaAcquisitionBreaker(Date.now()).open).toBe(false);
  });

  it('trips the breaker on a 403 and does not retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps, now } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(ref).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mediaAcquisitionBreaker(now()).open).toBe(true);
    expect(events.map((e) => e.name)).toContain('tiktok.media_acquisition.breaker_tripped');
  });

  it('trips the breaker on a 200 verification interstitial, which is not a shed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('<html><body>Please slide to verify</body></html>', { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { deps, now } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(),
      deps,
    );

    expect(ref).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mediaAcquisitionBreaker(now()).open).toBe(true);
  });

  it('suppresses every later call while the breaker is cooling, without fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    await acquireTikTokMedia({ externalId: EXTERNAL_ID, authorHandle: HANDLE }, ctx(), deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { name: 'tiktok.media_acquisition.suppressed', fields: { reason: 'hard_block' } },
    ]);
  });

  it('trips the breaker after a run of non-shed anomalies across calls', async () => {
    // A 500 is neither a render nor a shed. One is noise; three in a row is TikTok treating us
    // differently, and the breaker errs toward stopping.
    const fetchMock = vi.fn().mockImplementation(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { deps, now } = fakeDeps();
    const input = { externalId: EXTERNAL_ID, authorHandle: HANDLE };

    await acquireTikTokMedia(input, ctx(), deps);
    await acquireTikTokMedia(input, ctx(), deps);
    expect(mediaAcquisitionBreaker(now()).open).toBe(false);

    await acquireTikTokMedia(input, ctx(), deps);
    expect(mediaAcquisitionBreaker(now()).open).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('respects the minimum interval between page fetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL)))
      .mockResolvedValueOnce(renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL)));
    vi.stubGlobal('fetch', fetchMock);
    const { deps, slept } = fakeDeps();
    const input = { externalId: EXTERNAL_ID, authorHandle: HANDLE };

    await acquireTikTokMedia(input, ctx(), deps);
    expect(slept).toEqual([]);

    await acquireTikTokMedia(input, ctx(), deps);
    expect(slept).toEqual([1200]);
  });

  it('serialises concurrent callers — never two page fetches in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = fakeDeps();
    const input = { externalId: EXTERNAL_ID, authorHandle: HANDLE };

    await Promise.all([
      acquireTikTokMedia(input, ctx(), deps),
      acquireTikTokMedia(input, ctx(), deps),
      acquireTikTokMedia(input, ctx(), deps),
    ]);

    expect(maxInFlight).toBe(1);
  });

  it('refuses rather than fetches once the rolling process budget is spent', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => shedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();
    const input = { externalId: EXTERNAL_ID, authorHandle: HANDLE };

    // Six calls × four shed attempts = 24 fetches, the whole ten-minute budget.
    for (let i = 0; i < 6; i += 1) {
      await acquireTikTokMedia(input, ctx(), deps);
    }
    expect(fetchMock).toHaveBeenCalledTimes(24);

    const refused = await acquireTikTokMedia(input, ctx(events), deps);
    expect(refused).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(24);
    expect(events[0]?.fields.reason).toBe('budget_exhausted');
  });

  it('throws UPSTREAM_TIMEOUT, not null, when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = fakeDeps();

    await expect(
      acquireTikTokMedia(
        { externalId: EXTERNAL_ID, authorHandle: HANDLE },
        ctx([], controller.signal),
        deps,
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof DomainError && e.code === 'UPSTREAM_TIMEOUT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never fetches for a malformed handle or video id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = fakeDeps();

    expect(
      await acquireTikTokMedia({ externalId: 'not-an-id', authorHandle: HANDLE }, ctx(), deps),
    ).toBeNull();
    expect(
      await acquireTikTokMedia(
        { externalId: EXTERNAL_ID, authorHandle: 'evil/../path' },
        ctx(),
        deps,
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow a redirect off the TikTok host allow-list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(),
      deps,
    );

    expect(ref).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null, and does not throw, when the payload has moved', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        renderResponse(
          '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{"renamedId":1}}}}}</script></html>',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    const ref = await acquireTikTokMedia(
      { externalId: EXTERNAL_ID, authorHandle: HANDLE },
      ctx(events),
      deps,
    );

    expect(ref).toBeNull();
    expect(events.at(-1)?.fields).toMatchObject({
      reason: 'payload_unreadable',
      code: 'MEDIA_UNREADABLE',
    });
    // A moved payload is not a block; retrying would just re-read the same document.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mediaAcquisitionBreaker(Date.now()).open).toBe(false);
  });

  it('logs no URL, caption, cookie or header value on any path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(renderResponse(payloadHtml(EXTERNAL_ID, MEDIA_URL)));
    vi.stubGlobal('fetch', fetchMock);
    const events: Recorded[] = [];
    const { deps } = fakeDeps();

    await acquireTikTokMedia({ externalId: EXTERNAL_ID, authorHandle: HANDLE }, ctx(events), deps);

    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain('tiktokcdn');
    expect(serialised).not.toContain(EXTERNAL_ID);
    expect(serialised).not.toContain(HANDLE);
    expect(serialised).not.toContain('http');
  });
});

describe('parseMediaRefFromPayload', () => {
  it('rejects a media URL on a host outside the CDN allow-list', () => {
    const html = payloadHtml(EXTERNAL_ID, 'https://tiktokcdn.com.evil.io/video.mp4');
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)).toBeNull();
  });

  it('rejects a non-https media URL', () => {
    const html = payloadHtml(EXTERNAL_ID, 'http://v16.tiktokcdn.com/video.mp4');
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)).toBeNull();
  });

  it('rejects a payload for a different post than the one requested', () => {
    const html = payloadHtml('7220925199297039662', MEDIA_URL);
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)).toBeNull();
  });

  it('rejects a payload whose own statusCode says the post is unreadable', () => {
    const json = JSON.stringify({
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          statusCode: 10204,
          itemInfo: { itemStruct: { id: EXTERNAL_ID, video: { playAddr: MEDIA_URL } } },
        },
      },
    });
    const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script>`;
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)).toBeNull();
  });

  it('falls back to downloadAddr when playAddr is absent', () => {
    const json = JSON.stringify({
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: { itemStruct: { id: EXTERNAL_ID, video: { downloadAddr: MEDIA_URL } } },
        },
      },
    });
    const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script>`;
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)?.url).toBe(MEDIA_URL);
  });

  it('returns a null expiry rather than an invented one when x-expires is absent', () => {
    const html = payloadHtml(EXTERNAL_ID, 'https://v16.tiktokcdn.com/video.mp4?a=1988');
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)?.expiresAt).toBeNull();
  });

  it('returns null for garbage in the script tag rather than throwing', () => {
    const html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">not json at all</script>';
    expect(parseMediaRefFromPayload(html, EXTERNAL_ID)).toBeNull();
  });

  it('returns null when the script tag is absent altogether', () => {
    expect(parseMediaRefFromPayload('<html><body>shell</body></html>', EXTERNAL_ID)).toBeNull();
  });
});
