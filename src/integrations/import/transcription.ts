import 'server-only';

/**
 * The composition root for transcription: the one place that decides whether a post's audio is
 * fetched and transcribed, and the only place the four pieces are wired to each other.
 * L0-TRANSCRIPT-T6.
 *
 * Everything it composes already existed and none of it had a caller —
 * `acquireTikTokMedia` (the ref), `httpAudioAcquirer` (the bytes), `geminiTranscriber` (the words)
 * and `transcriptContentExtractor` (the `ContentPart`). What was missing was this file, so in
 * production `RawSource.media` was always `[]`, the extractor's `supports` was always false, and a
 * fully built and tested feature ran on nothing.
 *
 * ## Two flags, both off, and why it is not one
 *
 * Same idiom as `places/place-resolver-factory.ts`: an env var read at the composition root, a
 * small factory, off by default.
 *
 *  - `TIKTOK_MEDIA_ACQUISITION=on` — owned by `tiktok/media-acquisition.ts`, and **not re-read or
 *    re-implemented here**. Reading the post's page is the ToS-contrary, egress-visible half; its
 *    gate, its rate limits and its circuit breaker stay where they are.
 *  - `IMPORT_TRANSCRIPTION=on` — this file's gate on *paying a model* for the audio.
 *
 * They are separate because they buy different risks. Acquisition risks our egress reputation and
 * the oEmbed path that the whole product depends on; transcription risks a 500-call daily Gemini
 * budget, one call per import. Folding them into one switch would mean that measuring the
 * acquisition hit rate — the honest reason to turn the first one on — silently starts spending the
 * budget on every import. Both must be `on` for a transcript to happen; either one off leaves the
 * import exactly where it is today, on the caption alone.
 *
 * ## Degradation is the contract
 *
 * Nothing in this file may fail an import. Acquisition disabled, no ref, an expired URL, a demux
 * failure, a rate-limited model, an open breaker — every one of them is a structured log line and a
 * caption-only import, which is precisely the result the product produces today. The one thing that
 * does propagate is the caller's abort: `ctx.signal` firing means the user left, and pretending
 * otherwise would leave work running on their behalf.
 */

import type { ContentExtractor, OpCtx, Transcriber } from '@/domain/ports';
import type { MediaRef, RawSource } from '@/domain/types';
import { httpAudioAcquirer } from '@/integrations/import/audio-acquirer';
import { acquireTikTokMedia, mediaAcquisitionEnabled } from '@/integrations/tiktok/media-acquisition';
import { geminiTranscriber } from '@/integrations/transcription/gemini.transcriber';
import {
  transcriptContentExtractor,
  type AudioAcquirer,
} from '@/integrations/transcription/transcript-content-extractor';

export interface TranscriptionEnv {
  /** `on` and nothing else. Absent, empty or any other value leaves transcription off. */
  readonly IMPORT_TRANSCRIPTION?: string;
  readonly GEMINI_API_KEY?: string;
  /** Optional override; the adapter's own default is `gemini-3.5-flash-lite`. */
  readonly GEMINI_TRANSCRIPTION_MODEL?: string;
}

/** `process.env` narrowed to this factory's keys, for the same reason `placeResolverEnv()` exists:
 *  `ProcessEnv` has no index signature under this tsconfig, and the key list should have one home. */
export function transcriptionEnv(): TranscriptionEnv {
  return {
    ...(process.env.IMPORT_TRANSCRIPTION !== undefined
      ? { IMPORT_TRANSCRIPTION: process.env.IMPORT_TRANSCRIPTION }
      : {}),
    ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
    ...(process.env.GEMINI_TRANSCRIPTION_MODEL !== undefined
      ? { GEMINI_TRANSCRIPTION_MODEL: process.env.GEMINI_TRANSCRIPTION_MODEL }
      : {}),
  };
}

/**
 * What the route holds when transcription is on: the extra `ContentExtractor` to run after the
 * caption one, and the step that gives it something to work with.
 */
export interface TranscriptionStep {
  readonly extractor: ContentExtractor;
  /**
   * The same `RawSource` with the post's audio ref attached, or the same `RawSource` unchanged.
   * Never the argument mutated — `oembed-source-adapter.ts` owns that object's shape and a caller
   * that reads `raw` after this call must see what the adapter returned.
   */
  attachMedia(raw: RawSource, ctx: OpCtx): Promise<RawSource>;
}

export interface TranscriptionDeps {
  readonly acquireMediaRef?: typeof acquireTikTokMedia;
  readonly acquisitionEnabled?: () => boolean;
  readonly acquireAudio?: AudioAcquirer;
  readonly transcriber?: Transcriber;
}

/**
 * The ref as the transcript extractor needs to see it.
 *
 * `acquireTikTokMedia` returns `kind: 'video'`, honestly: the URL points at an MP4. The extractor
 * only claims sources with an `'audio'` ref, equally honestly: it will not do a demux nobody asked
 * for. The thing that reconciles the two is the `AudioAcquirer` this file pairs the ref with —
 * `httpAudioAcquirer` *is* the demux step, so from the extractor's side this ref really does yield
 * audio. The re-label and the acquirer are constructed together, in this one function, so the claim
 * cannot drift away from the code that makes it true.
 */
function audioRefFrom(video: MediaRef): MediaRef {
  return { kind: 'audio', url: video.url, expiresAt: video.expiresAt };
}

/**
 * The step, or `null` when transcription is switched off or cannot be built.
 *
 * `null` rather than a throw for the missing-key case, unlike `createPlaceResolver`'s hard failure
 * on a bad `PLACE_RESOLVER`: a resolver is load-bearing and a transcript is additive, so a
 * misconfiguration here must cost the transcript and never the import. It is loud in the log,
 * because "I set the flag and nothing happened" is otherwise unanswerable.
 */
export function createTranscriptionStep(
  env: TranscriptionEnv,
  deps: TranscriptionDeps = {},
): TranscriptionStep | null {
  if (env.IMPORT_TRANSCRIPTION !== 'on') return null;

  const apiKey = env.GEMINI_API_KEY ?? '';
  const transcriber =
    deps.transcriber ??
    (apiKey === ''
      ? null
      : geminiTranscriber({
          apiKey,
          ...(env.GEMINI_TRANSCRIPTION_MODEL !== undefined ? { model: env.GEMINI_TRANSCRIPTION_MODEL } : {}),
        }));

  if (transcriber === null) {
    console.warn(
      JSON.stringify({ event: 'transcription.disabled', reason: 'no_gemini_api_key' }),
    );
    return null;
  }

  const acquireRef = deps.acquireMediaRef ?? acquireTikTokMedia;
  const enabled = deps.acquisitionEnabled ?? mediaAcquisitionEnabled;
  const acquire = deps.acquireAudio ?? httpAudioAcquirer();
  /** Present only on the real acquirer; an injected fake in a test needs no session. */
  const attachSession = (acquire as { attachSession?: (cookie: string) => void }).attachSession?.bind(acquire);

  return {
    extractor: transcriptContentExtractor({ transcriber, acquire }),

    async attachMedia(raw: RawSource, ctx: OpCtx): Promise<RawSource> {
      if (raw.media.some((m) => m.kind === 'audio')) return raw;
      if (!enabled()) {
        ctx.log.event('transcription.skipped', { reason: 'acquisition_disabled' });
        return raw;
      }
      if (raw.authorHandle === null) {
        // The page URL is rebuilt from handle + id inside `acquireTikTokMedia`; without a handle
        // there is nothing to rebuild and guessing one would be a request to a URL we invented.
        ctx.log.event('transcription.skipped', { reason: 'no_author_handle' });
        return raw;
      }

      let ref: MediaRef | null;
      try {
        // The CDN will not serve the signed media URL to a request that does not carry the session
        // the page fetch was issued (measured: 403 without, 200 with). The two calls are separate
        // fetches, so the session has to be handed across explicitly — and only to the acquirer,
        // never onto the `MediaRef` that travels into `RawSource`.
        ref = await acquireRef(
          { externalId: raw.externalId, authorHandle: raw.authorHandle },
          ctx,
          { onSession: (cookie) => attachSession?.(cookie) },
        );
      } catch (e) {
        // `acquireTikTokMedia` documents itself as throwing only on the caller's abort, and that one
        // must propagate. Anything else reaching here is a bug in it rather than a bad day at
        // TikTok — and a bug in an additive step still must not cost the user the places their
        // caption would have found, so it is logged by name and the import goes on.
        if (ctx.signal.aborted) throw e;
        ctx.log.event('transcription.skipped', {
          reason: 'acquisition_threw',
          cause: e instanceof Error ? e.name : 'unknown',
        });
        return raw;
      }

      // `null` is the normal outcome: a shed page, a spent budget, an open breaker. It has already
      // logged which, under `tiktok.media_acquisition.*`, so there is nothing to add here.
      if (ref === null) return raw;

      return { ...raw, media: [...raw.media, audioRefFrom(ref)] };
    },
  };
}
