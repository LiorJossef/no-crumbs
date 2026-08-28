import { describe, expect, it } from 'vitest';

import { DomainError, extractorUnavailable, internal } from '@/domain/errors';
import type { OpCtx, Transcriber, TranscriptionResult } from '@/domain/ports';
import type { RawSource } from '@/domain/types';
import type { AudioAcquirer } from '@/integrations/transcription/transcript-content-extractor';
import { transcriptContentExtractor } from '@/integrations/transcription/transcript-content-extractor';

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

function rawSource(media: RawSource['media']): RawSource {
  return {
    id: 'source-1',
    externalId: '7220925199297039662',
    authorHandle: 'nom_life',
    authorName: 'Nom Life',
    canonicalUrl: 'https://www.tiktok.com/@nom_life/video/7220925199297039662',
    thumbnailUrl: null,
    texts: [{ kind: 'caption', text: 'the best day in Tokyo' }],
    media,
  };
}

const AUDIO_REF = { kind: 'audio', url: 'https://example.invalid/a.aac', expiresAt: null } as const;
const VIDEO_REF = { kind: 'video', url: 'https://example.invalid/v.mp4', expiresAt: null } as const;

const CLIP = new Uint8Array([1, 2, 3, 4]);
const acquireClip: AudioAcquirer = async () => ({ bytes: CLIP, mimeType: 'audio/aac' });

function fakeTranscriber(
  transcribe: (input: { audio: Uint8Array; mimeType: string }) => Promise<TranscriptionResult>,
): Transcriber {
  return {
    version: '2026-08-transcribe-gemini-3.5-flash-lite',
    promptVersion: 't1-a1',
    async transcribe(input) {
      return transcribe(input);
    },
  };
}

describe('transcriptContentExtractor', () => {
  describe('supports', () => {
    it('is true only when the source carries an audio ref', () => {
      const extractor = transcriptContentExtractor({
        transcriber: fakeTranscriber(async () => ({ text: 'x', language: 'en' })),
        acquire: acquireClip,
      });

      expect(extractor.supports(rawSource([AUDIO_REF]))).toBe(true);
      expect(extractor.supports(rawSource([VIDEO_REF, AUDIO_REF]))).toBe(true);
      expect(extractor.supports(rawSource([]))).toBe(false);
      // A video ref is not an audio ref. Demuxing it is the acquisition step's job, and claiming
      // support here would mean this extractor quietly doing work nobody wired up.
      expect(extractor.supports(rawSource([VIDEO_REF]))).toBe(false);
    });

    it('is false for every real source today, because nothing populates RawSource.media yet', () => {
      const extractor = transcriptContentExtractor({
        transcriber: fakeTranscriber(async () => ({ text: 'x', language: 'en' })),
        acquire: acquireClip,
      });
      // The oEmbed adapter emits `media: []`. This is the documented reason the extractor cannot
      // fire in production yet, asserted rather than left as a comment.
      expect(extractor.supports(rawSource([]))).toBe(false);
    });
  });

  it('emits one transcript part carrying model and prompt provenance in its origin', async () => {
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => ({ text: 'Go early, the queue is long.', language: 'en' })),
      acquire: acquireClip,
    });

    const parts = await extractor.extract(rawSource([AUDIO_REF]), ctx());

    expect(parts).toEqual([
      {
        kind: 'transcript',
        text: 'Go early, the queue is long.',
        origin: '2026-08-transcribe-gemini-3.5-flash-lite/t1-a1',
      },
    ]);
    expect(extractor.id).toBe('transcript');
  });

  it('never merges the transcript into the caption part', async () => {
    // `content-parts.ts` keys the extraction cache on each part's kind and origin. A transcript
    // folded into the caption string would be indistinguishable from something the creator wrote.
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => ({ text: 'spoken words', language: 'en' })),
      acquire: acquireClip,
    });

    const parts = await extractor.extract(rawSource([AUDIO_REF]), ctx());

    expect(parts).toHaveLength(1);
    expect(parts[0]?.kind).toBe('transcript');
    expect(parts[0]?.text).not.toContain('the best day in Tokyo');
  });

  it('passes the acquired bytes and MIME type straight through to the transcriber', async () => {
    let seen: { audio: Uint8Array; mimeType: string } | undefined;
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async (input) => {
        seen = input;
        return { text: 'hello', language: 'en' };
      }),
      acquire: async () => ({ bytes: CLIP, mimeType: 'audio/aac' }),
    });

    await extractor.extract(rawSource([AUDIO_REF]), ctx());

    expect(seen?.audio).toBe(CLIP);
    expect(seen?.mimeType).toBe('audio/aac');
  });

  it('emits no part at all for a silent clip', async () => {
    // Not an empty part: an empty part would still change the extraction cache key, so the same
    // source would re-extract on every import for input that has not changed.
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => ({ text: '', language: null })),
      acquire: acquireClip,
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx())).resolves.toEqual([]);
  });

  it('emits no part when the transcript is whitespace only', async () => {
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => ({ text: '   \n ', language: null })),
      acquire: acquireClip,
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx())).resolves.toEqual([]);
  });

  it('emits no part and does not call the transcriber when the audio cannot be acquired', async () => {
    let called = 0;
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => {
        called += 1;
        return { text: 'should not happen', language: 'en' };
      }),
      acquire: async () => null,
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx())).resolves.toEqual([]);
    expect(called).toBe(0);
  });

  it('degrades rather than failing the whole import when transcription fails', async () => {
    // `runImport` has no per-extractor recovery: an exception escaping here loses the caption's
    // places too. A transcript is additive, so its failure must be a logged degradation.
    const events: LoggedEvent[] = [];
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => {
        throw extractorUnavailable('Gemini returned HTTP 429');
      }),
      acquire: acquireClip,
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx(events))).resolves.toEqual([]);
    const degraded = events.find((e) => e.name === 'transcription.degraded');
    expect(degraded?.fields.code).toBe('EXTRACTOR_UNAVAILABLE');
    expect(degraded?.fields.retryable).toBe(true);
  });

  it('degrades on an acquisition failure too', async () => {
    const events: LoggedEvent[] = [];
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => ({ text: 'unreachable', language: 'en' })),
      acquire: async () => {
        throw internal('audio fetch failed');
      },
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx(events))).resolves.toEqual([]);
    expect(events.find((e) => e.name === 'transcription.degraded')?.fields.code).toBe('INTERNAL');
  });

  it('rethrows when the operation was aborted', async () => {
    const controller = new AbortController();
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => {
        controller.abort();
        throw extractorUnavailable('aborted');
      }),
      acquire: acquireClip,
    });

    await expect(
      extractor.extract(rawSource([AUDIO_REF]), ctx([], controller.signal)),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('rethrows anything that is not a DomainError, because that is our own bug', async () => {
    const extractor = transcriptContentExtractor({
      transcriber: fakeTranscriber(async () => {
        throw new TypeError('cannot read properties of undefined');
      }),
      acquire: acquireClip,
    });

    await expect(extractor.extract(rawSource([AUDIO_REF]), ctx())).rejects.toBeInstanceOf(TypeError);
  });
});
