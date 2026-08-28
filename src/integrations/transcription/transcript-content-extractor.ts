/**
 * The transcript `ContentExtractor` (`domain/ports.ts`) — the second implementation of the seam
 * `07` §10 always said would carry an ASR analyser, and the reason `Ports.content` is an array.
 *
 * Adapted from the paused `completedTranscriptContentExtractor` in `stash@{3}`. Its `supports`
 * test, its "empty transcript produces no part" rule and its injected-loader shape are kept; the
 * job-state machinery around it is not. That version read a finished transcript out of a
 * `transcription_jobs` table filled asynchronously by a Cloudflare queue. Gemini is synchronous and
 * fits inside the request we are already making, so there is no job, no table, no queue and no
 * polling: this extractor transcribes inline and returns.
 *
 * **It emits a part; it never joins the caption.** `domain/import/content-parts.ts` carries the
 * array through the pipeline and folds each part's `kind` and `origin` into the extraction cache
 * key, precisely so a transcript stays attributable. Concatenating a transcript into the caption
 * string would erase the one distinction that lets us later ask "did the model's answer come from
 * something the creator wrote, or from something a machine heard?".
 *
 * **Nothing populates `RawSource.media` yet.** Media acquisition is a separate, currently blocked
 * step, so in production this extractor's `supports` returns `false` on every source and it never
 * runs. That is expected. It is built and tested now so that the acquisition step, when it lands,
 * has something to plug into rather than a design argument to have.
 */

import { DomainError } from '@/domain/errors';
import type { ContentExtractor, OpCtx, Transcriber } from '@/domain/ports';
import type { ContentPart, MediaRef, RawSource } from '@/domain/types';

/** Audio in a form a `Transcriber` can send. Bytes, because no provider we evaluated will fetch a
 *  URL on our behalf. */
export interface AudioClip {
  readonly bytes: Uint8Array;
  /** IANA type of `bytes`, e.g. `audio/aac` — stated by whatever produced the clip, never sniffed
   *  here. */
  readonly mimeType: string;
}

/**
 * The acquisition seam: turn a `MediaRef` into bytes, or return `null` when this ref cannot be
 * turned into audio (expired URL, unsupported container, nothing to demux).
 *
 * It is a constructor argument rather than a domain port because acquisition is entirely an
 * integrations concern — a fetch plus a container remux — and inventing an eighth port for a
 * function with one implementation would be ceremony. **No implementation exists in this repository
 * yet**, and this file deliberately does not supply a stub or a fake one; a caller with nothing to
 * pass here has nothing to compose, which is the honest state of the feature.
 */
export type AudioAcquirer = (media: MediaRef, ctx: OpCtx) => Promise<AudioClip | null>;

/** `'audio'`, not `'video'`: the transcriber needs sendable audio bytes, and turning an MP4 into
 *  those is the acquisition step's job. A `RawSource` that only carries a video ref has not been
 *  through that step, and claiming support for it here would mean this extractor silently doing a
 *  demux nobody asked it to do. */
function audioRefs(raw: RawSource): readonly MediaRef[] {
  return raw.media.filter((m) => m.kind === 'audio');
}

export function transcriptContentExtractor(deps: {
  readonly transcriber: Transcriber;
  readonly acquire: AudioAcquirer;
}): ContentExtractor {
  return {
    id: 'transcript',

    supports(raw: RawSource): boolean {
      return audioRefs(raw).length > 0;
    },

    async extract(raw: RawSource, ctx: OpCtx): Promise<readonly ContentPart[]> {
      const ref = audioRefs(raw)[0];
      if (ref === undefined) return [];

      try {
        const clip = await deps.acquire(ref, ctx);
        if (clip === null || clip.bytes.length === 0) return [];

        const result = await deps.transcriber.transcribe(
          { audio: clip.bytes, mimeType: clip.mimeType },
          ctx,
        );

        // A silent clip and a suppressed hallucination both arrive here as `''`. Returning no part
        // rather than an empty one is not cosmetic: `content-parts.ts` treats a whitespace-only
        // part as nothing anyway, and an empty part would still change the extraction cache key,
        // so the same source would re-extract on every import for no new input.
        if (result.text.trim().length === 0) return [];

        return [
          {
            kind: 'transcript',
            text: result.text,
            // Model *and* prompt, because both change what a transcript says, and `origin` is what
            // the cache key and any later audit have to reconstruct that from. Concretely:
            // `2026-08-transcribe-gemini-3.5-flash-lite/t1-a1`.
            origin: `${deps.transcriber.version}/${deps.transcriber.promptVersion}`,
          },
        ];
      } catch (e) {
        // A transcript is *additive*. An import whose caption is perfectly readable must not fail
        // because an audio fetch 404'd or the model was rate-limited — `runImport` has no
        // per-extractor recovery, so an exception escaping here kills the whole import and the user
        // loses places the caption alone would have produced. Degraded, and logged as such, rather
        // than failed.
        //
        // Two things are deliberately not swallowed: an abort, which means the whole operation is
        // being cancelled and pretending otherwise would leave work running past its own signal;
        // and anything that is not a `DomainError`, which by `07` §9 means a bug in our own code
        // rather than an upstream having a bad day.
        if (ctx.signal.aborted) throw e;
        if (!(e instanceof DomainError)) throw e;
        ctx.log.event('transcription.degraded', {
          transcriberVersion: deps.transcriber.version,
          promptVersion: deps.transcriber.promptVersion,
          code: e.code,
          retryable: e.retryable,
        });
        return [];
      }
    },
  };
}
