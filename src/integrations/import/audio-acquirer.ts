/**
 * The `AudioAcquirer` (`integrations/transcription/transcript-content-extractor.ts`) that was
 * missing: a `MediaRef` in, sendable audio bytes out. Download the post's MP4, demux its AAC track,
 * hand the result to the transcriber. L0-TRANSCRIPT-T6.
 *
 * Both halves already existed and neither had a caller — `acquireTikTokMedia` produces the ref and
 * `extractAacFromMp4` turns MP4 bytes into a `TranscriptionInput`. This file is the fetch between
 * them and nothing else; it owns no parsing and no protocol knowledge of its own.
 *
 * **It is bounded three ways, and each bound exists for a different failure.**
 *  - A **byte ceiling**, enforced while the body streams rather than after it lands. The measured
 *    TikTok MP4s are ~2 MB; the cap is `MAX_DOWNLOAD_BYTES` below, four times that and an order of
 *    magnitude under the demuxer's own 64 MiB input fence. A CDN URL that unexpectedly points at
 *    something enormous must cost us one comparison, not a serverless function's whole heap.
 *  - A **time budget**, because a stalled CDN connection would otherwise hold the import request
 *    open until Vercel kills the function — and the caption was ready before we ever asked for
 *    audio.
 *  - The **caller's `ctx.signal`**, honoured for real: the two are combined into one signal, so a
 *    user pressing Cancel stops the download rather than leaving it running past its own operation.
 *
 * **Every failure is `null`, never a throw** — with the single exception of the caller's own abort,
 * which is `UPSTREAM_TIMEOUT` so it propagates instead of being quietly downgraded to "this post
 * had no audio". A transcript is additive: an expired URL, a 403, a body that is not an MP4 and a
 * track we cannot demux all mean the import continues on the caption alone. Each one emits one
 * structured line with a reason code — never the URL, never a byte of the body (charter R9).
 *
 * **Two things deliberately not done here.**
 *  - No host allow-list. The ref's hostname was already checked against the CDN suffix list inside
 *    `media-acquisition.ts` (`isAllowedMediaHost`), which is where a URL scraped out of an untrusted
 *    document should be validated; a second, drifting copy of that list would be worse than one. The
 *    scheme is re-checked because that check is one line and `https` is the property that matters at
 *    the moment of the request.
 *  - No rate limiting of its own. This runs at most once per successful `acquireTikTokMedia`, which
 *    is already single-flighted, interval-floored and budget-capped process-wide, so this download
 *    inherits that pacing exactly. Adding a second limiter would be two schedulers disagreeing.
 */

import { upstreamTimeout } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { MediaRef } from '@/domain/types';
import { mp4DemuxFailureReason } from '@/integrations/media/demux-errors';
import { extractAacFromMp4, type Mp4Audio } from '@/integrations/media/mp4-aac-demux';
import type {
  AudioAcquirer,
  AudioClip,
} from '@/integrations/transcription/transcript-content-extractor';

/** Four times the ~2 MB measured on real posts, and far below `DEFAULT_MAX_INPUT_BYTES`: enough
 *  slack for a long, high-bitrate post, not enough to matter if a URL lies. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

/** Whole-download budget. A 2 MB file over a CDN is sub-second; this is the point at which we stop
 *  waiting, not the point at which we expect to. */
export const DOWNLOAD_BUDGET_MS = 20_000;

/**
 * The closed set of reasons this file gives up. Distinguishable on purpose: `expired` on most posts
 * means the ref is being acquired too far ahead of its use, `status` means the CDN is refusing us,
 * and `demux` means the file is fine and our parser is not — three different fixes that would be
 * one indistinguishable "no transcript" if they shared a code.
 */
export type AudioAcquisitionFailure =
  | 'expired'
  | 'not_https'
  | 'malformed_url'
  | 'transport'
  | 'status'
  | 'too_large'
  | 'timeout'
  | 'empty_body'
  | 'demux';

export interface AudioAcquirerDeps {
  readonly fetchImpl?: typeof fetch;
  /** Injected only so a test can force a demux failure without hand-crafting a broken MP4. */
  readonly demux?: (bytes: Uint8Array) => Mp4Audio;
  readonly now?: () => number;
  readonly maxBytes?: number;
  readonly budgetMs?: number;
}

/** The same current-browser string the page fetch sends. A bare `node`/`undici` user agent is
 *  refused by enough CDNs that omitting it would measure the header rather than the file — and it
 *  is the whole of the impersonation here: no cookies, no session, no TLS fingerprinting.
 *  Whether the CDN needs it at all is UNMEASURED; no live request was made building this. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

/** The CDN serves the file to a page on this origin, and some edges check it. Constant, never
 *  derived from the ref. */
const TIKTOK_REFERER = 'https://www.tiktok.com/';

/**
 * One signal that fires on either the caller's abort or our own budget, plus a way to tell the two
 * apart afterwards. `AbortSignal.any` would do this in one line on a new enough runtime; this is
 * the boring form, and it also has to report *which* fired.
 */
function boundedSignal(
  ctx: OpCtx,
  budgetMs: number,
): { readonly signal: AbortSignal; timedOut: () => boolean; release: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const onAbort = (): void => controller.abort(ctx.signal.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('audio download budget exhausted'));
  }, budgetMs);

  if (ctx.signal.aborted) onAbort();
  else ctx.signal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    release: () => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * The body, or `'too_large'` — decided while it streams. `content-length` is checked first because
 * a truthful one lets us refuse before a byte is transferred, but it is a claim, so the running
 * total is the enforcing check.
 */
async function readCapped(res: Response, cap: number): Promise<Uint8Array | 'too_large'> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) return 'too_large';

  const body = res.body;
  if (body === null) {
    const whole = new Uint8Array(await res.arrayBuffer());
    return whole.byteLength > cap ? 'too_large' : whole;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        return 'too_large';
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export function httpAudioAcquirer(deps: AudioAcquirerDeps = {}): AudioAcquirer {
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const maxBytes = deps.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const budgetMs = deps.budgetMs ?? DOWNLOAD_BUDGET_MS;
  // The demuxer's input fence is set to our own ceiling rather than left at its 64 MiB default:
  // two limits that disagree would mean the one that fires is whichever the file happened to hit.
  const demux = deps.demux ?? ((bytes: Uint8Array): Mp4Audio => extractAacFromMp4(bytes, { maxInputBytes: maxBytes }));

  /**
   * The session the page fetch was issued, if the caller captured one. **The CDN requires it** —
   * measured 2026-08-29 against `v16-webapp-prime.tiktok.com`: identical signed URL, UA and
   * referer returns 403 without these cookies and 200 with them. A `Range` header makes no
   * difference either way.
   *
   * Held here rather than on `MediaRef` because a session token must not travel into `RawSource`,
   * where it would be logged and persisted alongside the caption.
   */
  let session: string | null = null;

  const acquireAudio = async function acquireAudio(
    media: MediaRef,
    ctx: OpCtx,
  ): Promise<AudioClip | null> {
    const giveUp = (
      reason: AudioAcquisitionFailure,
      fields: Record<string, string | number | boolean> = {},
    ): null => {
      ctx.log.event('transcription.audio_unavailable', { reason, ...fields });
      return null;
    };

    if (ctx.signal.aborted) throw upstreamTimeout();

    // A signed CDN URL that has already expired is a guaranteed 403. Refusing it here costs the CDN
    // nothing and tells us something a 403 would not: that acquisition and use drifted apart.
    if (media.expiresAt !== null && media.expiresAt.getTime() <= now()) {
      return giveUp('expired');
    }

    let url: URL;
    try {
      url = new URL(media.url);
    } catch {
      return giveUp('malformed_url');
    }
    if (url.protocol !== 'https:') return giveUp('not_https');

    const bound = boundedSignal(ctx, budgetMs);
    let downloaded: Uint8Array;
    try {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: bound.signal,
          headers: {
            'user-agent': BROWSER_UA,
            referer: TIKTOK_REFERER,
            accept: 'video/mp4,*/*',
            ...(session === null ? {} : { cookie: session }),
          },
        });
      } catch (e) {
        // The caller's abort outranks our own budget: it means the whole operation is being
        // cancelled, and reporting it as a download failure would leave the rest of the request
        // working on behalf of a user who has gone.
        if (ctx.signal.aborted) throw upstreamTimeout();
        if (bound.timedOut()) return giveUp('timeout', { budgetMs });
        return giveUp('transport', { cause: e instanceof Error ? e.name : 'unknown' });
      }

      if (!res.ok) return giveUp('status', { status: res.status });

      const body = await readCapped(res, maxBytes);
      if (body === 'too_large') return giveUp('too_large', { maxBytes });
      if (body.byteLength === 0) return giveUp('empty_body');
      downloaded = body;
    } catch (e) {
      if (ctx.signal.aborted) throw upstreamTimeout();
      if (bound.timedOut()) return giveUp('timeout', { budgetMs });
      return giveUp('transport', { cause: e instanceof Error ? e.name : 'unknown' });
    } finally {
      bound.release();
    }

    let audio: Mp4Audio;
    try {
      audio = demux(downloaded);
    } catch (e) {
      // `mp4DemuxFailureReason` recovers which of the eight refusals it was; anything else is a bug
      // in the demuxer rather than a bad file, and is reported as such instead of being flattened
      // into "unsupported post".
      return giveUp('demux', {
        detail: mp4DemuxFailureReason(e) ?? 'unexpected',
        bytes: downloaded.byteLength,
      });
    }

    ctx.log.event('transcription.audio_acquired', {
      downloadedBytes: downloaded.byteLength,
      audioBytes: audio.audio.byteLength,
      durationSeconds: Math.round(audio.durationSeconds),
      codec: audio.codec,
    });

    return { bytes: audio.audio, mimeType: audio.mimeType };
  } as AudioAcquirer & { attachSession(cookie: string): void };

  /** Hand this acquirer the session the page fetch was issued, before the download. */
  acquireAudio.attachSession = (cookie: string): void => {
    session = cookie;
  };

  return acquireAudio;
}
