/**
 * `createTranscriptionStep` — the composition root that decides whether a post's audio is fetched
 * and transcribed at all, and the only place `RawSource.media` is ever populated.
 *
 * Offline by construction: acquisition, audio download and transcription are all injected here, so
 * no test in this file can reach TikTok or Gemini. What it pins is the gate (two switches, both
 * off by default) and the degradation rule (nothing in this step may fail an import).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractorUnavailable, upstreamTimeout } from '@/domain/errors';
import type { OpCtx, Transcriber } from '@/domain/ports';
import type { MediaRef, RawSource } from '@/domain/types';
import { createTranscriptionStep, transcriptionEnv } from '@/integrations/import/transcription';

vi.mock('server-only', () => ({}));

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

const RAW: RawSource = {
  id: 'source-1',
  externalId: '7220925199297039662',
  authorHandle: 'nom_life',
  authorName: 'Nom Life',
  canonicalUrl: 'https://www.tiktok.com/@nom_life/video/7220925199297039662',
  thumbnailUrl: null,
  texts: [{ kind: 'caption', text: 'the best day in Tokyo' }],
  media: [],
};

const VIDEO_REF: MediaRef = {
  kind: 'video',
  url: 'https://v16-webapp-prime.tiktokcdn.com/video/7220925199297039662.mp4',
  expiresAt: new Date('2026-08-30T00:00:00Z'),
};

const ON = { IMPORT_TRANSCRIPTION: 'on', GEMINI_API_KEY: 'test-key' } as const;

function fakeTranscriber(text = 'the katsu sando at Konbini Nine'): Transcriber {
  return {
    version: '2026-08-transcribe-gemini-3.5-flash-lite',
    promptVersion: 't1-a1',
    transcribe: async () => ({ text, language: 'en' }),
  };
}

/** Everything injected: acquisition on, a ref found, bytes acquired, a transcript returned. */
function enabledDeps(overrides: Parameters<typeof createTranscriptionStep>[1] = {}) {
  return {
    acquisitionEnabled: () => true,
    acquireMediaRef: async () => VIDEO_REF,
    acquireAudio: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/aac' }),
    transcriber: fakeTranscriber(),
    ...overrides,
  };
}

describe('createTranscriptionStep', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the gate', () => {
    it('is off when IMPORT_TRANSCRIPTION is unset', () => {
      expect(createTranscriptionStep({}, enabledDeps())).toBeNull();
    });

    it('is off for any value other than "on"', () => {
      expect(createTranscriptionStep({ IMPORT_TRANSCRIPTION: 'true' }, enabledDeps())).toBeNull();
      expect(createTranscriptionStep({ IMPORT_TRANSCRIPTION: '1' }, enabledDeps())).toBeNull();
      expect(createTranscriptionStep({ IMPORT_TRANSCRIPTION: '' }, enabledDeps())).toBeNull();
    });

    it('is off, loudly, when the flag is on but there is no Gemini key', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(createTranscriptionStep({ IMPORT_TRANSCRIPTION: 'on' })).toBeNull();

      // A silent null here is the failure mode this line exists for: "I set the flag and nothing
      // happened" has to be answerable from the log.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('no_gemini_api_key');
    });

    it('builds the step when the flag is on and a key is configured', () => {
      expect(createTranscriptionStep(ON, enabledDeps())).not.toBeNull();
    });
  });

  describe('attachMedia', () => {
    it('attaches the acquired ref as an audio ref the transcript extractor claims', async () => {
      const step = createTranscriptionStep(ON, enabledDeps())!;

      const enriched = await step.attachMedia(RAW, ctx());

      expect(enriched.media).toEqual([
        { kind: 'audio', url: VIDEO_REF.url, expiresAt: VIDEO_REF.expiresAt },
      ]);
      expect(step.extractor.supports(enriched)).toBe(true);
      // The adapter's own object is untouched: anything still holding `RAW` sees what it returned.
      expect(RAW.media).toEqual([]);
    });

    it('asks acquisition for the post it was actually given', async () => {
      const acquireMediaRef =
        vi.fn<(input: { externalId: string; authorHandle: string }) => Promise<MediaRef>>(
          async () => VIDEO_REF,
        );
      const step = createTranscriptionStep(ON, enabledDeps({ acquireMediaRef }))!;

      await step.attachMedia(RAW, ctx());

      expect(acquireMediaRef.mock.calls[0]?.[0]).toEqual({
        externalId: RAW.externalId,
        authorHandle: RAW.authorHandle,
      });
    });

    it('does not acquire while TIKTOK_MEDIA_ACQUISITION is off', async () => {
      const events: LoggedEvent[] = [];
      const acquireMediaRef = vi.fn(async () => VIDEO_REF);
      const step = createTranscriptionStep(
        ON,
        enabledDeps({ acquisitionEnabled: () => false, acquireMediaRef }),
      )!;

      const enriched = await step.attachMedia(RAW, ctx(events));

      expect(acquireMediaRef).not.toHaveBeenCalled();
      expect(enriched).toBe(RAW);
      expect(events[0]).toMatchObject({
        name: 'transcription.skipped',
        fields: { reason: 'acquisition_disabled' },
      });
      expect(step.extractor.supports(enriched)).toBe(false);
    });

    it('leaves the source alone when acquisition finds nothing', async () => {
      const step = createTranscriptionStep(ON, enabledDeps({ acquireMediaRef: async () => null }))!;

      const enriched = await step.attachMedia(RAW, ctx());

      expect(enriched.media).toEqual([]);
      expect(step.extractor.supports(enriched)).toBe(false);
    });

    it('skips a source with no author handle rather than guessing one', async () => {
      const events: LoggedEvent[] = [];
      const acquireMediaRef = vi.fn(async () => VIDEO_REF);
      const step = createTranscriptionStep(ON, enabledDeps({ acquireMediaRef }))!;

      const enriched = await step.attachMedia({ ...RAW, authorHandle: null }, ctx(events));

      expect(acquireMediaRef).not.toHaveBeenCalled();
      expect(enriched.media).toEqual([]);
      expect(events[0]?.fields.reason).toBe('no_author_handle');
    });

    it('degrades to caption-only when acquisition throws unexpectedly', async () => {
      const events: LoggedEvent[] = [];
      const step = createTranscriptionStep(
        ON,
        enabledDeps({
          acquireMediaRef: async () => {
            throw new Error('bug in the acquirer');
          },
        }),
      )!;

      const enriched = await step.attachMedia(RAW, ctx(events));

      expect(enriched.media).toEqual([]);
      expect(events[0]?.fields).toMatchObject({ reason: 'acquisition_threw', cause: 'Error' });
    });

    it('propagates an abort instead of degrading', async () => {
      const controller = new AbortController();
      controller.abort();
      const step = createTranscriptionStep(
        ON,
        enabledDeps({
          acquireMediaRef: async () => {
            throw upstreamTimeout();
          },
        }),
      )!;

      await expect(step.attachMedia(RAW, ctx([], controller.signal))).rejects.toMatchObject({
        code: 'UPSTREAM_TIMEOUT',
      });
    });
  });

  describe('the composed extractor', () => {
    it('produces one transcript part carrying the transcriber’s provenance', async () => {
      const step = createTranscriptionStep(ON, enabledDeps())!;
      const enriched = await step.attachMedia(RAW, ctx());

      const parts = await step.extractor.extract(enriched, ctx());

      expect(parts).toEqual([
        {
          kind: 'transcript',
          text: 'the katsu sando at Konbini Nine',
          origin: '2026-08-transcribe-gemini-3.5-flash-lite/t1-a1',
        },
      ]);
    });

    it('produces nothing when the audio could not be acquired', async () => {
      const step = createTranscriptionStep(ON, enabledDeps({ acquireAudio: async () => null }))!;
      const enriched = await step.attachMedia(RAW, ctx());

      expect(await step.extractor.extract(enriched, ctx())).toEqual([]);
    });

    it('produces nothing when the transcriber fails, and says so', async () => {
      const events: LoggedEvent[] = [];
      const step = createTranscriptionStep(
        ON,
        enabledDeps({
          transcriber: {
            version: 'v',
            promptVersion: 'p',
            transcribe: async () => {
              throw extractorUnavailable('429 from the model');
            },
          },
        }),
      )!;
      const enriched = await step.attachMedia(RAW, ctx());

      expect(await step.extractor.extract(enriched, ctx(events))).toEqual([]);
      expect(events[0]).toMatchObject({
        name: 'transcription.degraded',
        fields: { code: 'EXTRACTOR_UNAVAILABLE' },
      });
    });
  });
});

describe('transcriptionEnv', () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });

  it('reads only its own keys, and omits the ones that are unset', () => {
    delete process.env.IMPORT_TRANSCRIPTION;
    delete process.env.GEMINI_TRANSCRIPTION_MODEL;
    process.env.GEMINI_API_KEY = 'k';

    const env = transcriptionEnv();

    expect(env).toEqual({ GEMINI_API_KEY: 'k' });
    expect('IMPORT_TRANSCRIPTION' in env).toBe(false);
  });
});
