/**
 * `httpAudioAcquirer` — the download-and-demux half of transcription. Offline in the strong sense:
 * `fetchImpl` is injected in every case, the MP4 comes from the demuxer's own fixture builder, and
 * nothing here can reach TikTok's CDN, Gemini or any other network.
 *
 * What is being pinned is not "it downloads a file". It is the bound on every way the download can
 * go wrong, and the rule that each one is `null` plus a reason code — because a transcript is
 * additive, and an import that fails because a CDN 403'd would cost the user places their caption
 * had already named.
 */
import { describe, expect, it, vi } from 'vitest';

import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { MediaRef } from '@/domain/types';
import { httpAudioAcquirer } from '@/integrations/import/audio-acquirer';

import { buildMp4 } from '../media/mp4-fixtures';

interface LoggedEvent {
  name: string;
  fields: Record<string, string | number | boolean>;
}

function ctx(events: LoggedEvent[] = [], signal = new AbortController().signal): OpCtx {
  return {
    signal,
    importId: null,
    log: {
      event(name, fields) {
        events.push({ name, fields });
      },
    },
  };
}

const REF: MediaRef = {
  kind: 'audio',
  url: 'https://v16-webapp-prime.tiktokcdn.com/video/7220925199297039662.mp4',
  expiresAt: null,
};

const MP4 = buildMp4();

/** `Uint8Array` is not a `BodyInit` under this lib; `slice()` gives a buffer that is exactly the
 *  view, so nothing extra is served. */
function asBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function respondWith(body: Uint8Array, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(asBody(body), { status: 200, ...init })) as unknown as typeof fetch;
}

describe('httpAudioAcquirer', () => {
  it('downloads the ref and returns the demuxed AAC as a TranscriptionInput', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({ fetchImpl: respondWith(MP4) });

    const clip = await acquire(REF, ctx(events));

    expect(clip).not.toBeNull();
    expect(clip?.mimeType).toBe('audio/aac');
    expect(clip?.bytes.byteLength).toBeGreaterThan(0);
    // The ADTS sync word, so this is the demuxer's output and not the MP4 handed back whole.
    expect(clip?.bytes[0]).toBe(0xff);
    expect(events.map((e) => e.name)).toContain('transcription.audio_acquired');
  });

  it('sends the request to the ref, over https, with the caller’s signal attached', async () => {
    const fetchImpl = vi.fn(async () => new Response(asBody(MP4), { status: 200 }));
    const controller = new AbortController();
    const acquire = httpAudioAcquirer({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await acquire(REF, ctx([], controller.signal));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(REF.url);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('refuses a ref whose signed URL has already expired, without a request', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = vi.fn();
    const acquire = httpAudioAcquirer({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => Date.parse('2026-08-29T12:00:00Z'),
    });

    const clip = await acquire(
      { ...REF, expiresAt: new Date('2026-08-29T11:59:59Z') },
      ctx(events),
    );

    expect(clip).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(events[0]?.fields.reason).toBe('expired');
  });

  it('refuses a non-https ref', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = vi.fn();
    const acquire = httpAudioAcquirer({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const clip = await acquire({ ...REF, url: 'http://cdn.invalid/a.mp4' }, ctx(events));

    expect(clip).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(events[0]?.fields.reason).toBe('not_https');
  });

  it('degrades on a transport failure rather than throwing', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields).toMatchObject({ reason: 'transport', cause: 'TypeError' });
  });

  it('degrades on a non-2xx, and records which status it was', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({
      fetchImpl: (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields).toMatchObject({ reason: 'status', status: 403 });
  });

  it('refuses a body larger than the ceiling while it streams, not after', async () => {
    const events: LoggedEvent[] = [];
    let delivered = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        delivered += 1;
        // Ten chunks would be 10 KB; the acquirer must stop long before the last one.
        if (delivered > 10) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const acquire = httpAudioAcquirer({
      maxBytes: 2048,
      fetchImpl: (async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields).toMatchObject({ reason: 'too_large', maxBytes: 2048 });
    expect(delivered).toBeLessThan(10);
  });

  it('refuses a truthful content-length over the ceiling before transferring a byte', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({
      maxBytes: 1024,
      fetchImpl: (async () =>
        new Response(asBody(new Uint8Array(64)), {
          status: 200,
          headers: { 'content-length': '9999999' },
        })) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields.reason).toBe('too_large');
  });

  it('degrades on an empty body', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({ fetchImpl: respondWith(new Uint8Array(0)) });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields.reason).toBe('empty_body');
  });

  it('degrades when the bytes are not a demuxable MP4, naming the demuxer’s own reason', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({ fetchImpl: respondWith(new Uint8Array(64).fill(0x7a)) });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields).toMatchObject({ reason: 'demux', detail: 'not_mp4' });
  });

  it('gives up on its own time budget without failing the import', async () => {
    const events: LoggedEvent[] = [];
    const acquire = httpAudioAcquirer({
      budgetMs: 5,
      fetchImpl: ((_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx(events))).resolves.toBeNull();
    expect(events[0]?.fields).toMatchObject({ reason: 'timeout', budgetMs: 5 });
  });

  /**
   * The one thing that is *not* degraded. An abort means the caller has gone, and a `null` here
   * would let the rest of the import carry on transcribing and extracting on their behalf.
   */
  it('propagates the caller’s abort as UPSTREAM_TIMEOUT', async () => {
    const controller = new AbortController();
    const acquire = httpAudioAcquirer({
      fetchImpl: ((_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          controller.abort();
        })) as unknown as typeof fetch,
    });

    await expect(acquire(REF, ctx([], controller.signal))).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
    await expect(acquire(REF, ctx([], controller.signal))).rejects.toBeInstanceOf(DomainError);
  });

  it('refuses before the request when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const acquire = httpAudioAcquirer({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(acquire(REF, ctx([], controller.signal))).rejects.toBeInstanceOf(DomainError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
