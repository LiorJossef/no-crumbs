/**
 * Every call in this file goes through an injected `fetchImpl`. **No live Gemini call is made, and
 * none may be added here** — the project's Gemini budget is a shared 500 requests/day, and an
 * adapter test that spends it is a test nobody can run twice.
 */
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import {
  geminiTranscriber,
  geminiTranscriberVersion,
  MAX_INLINE_AUDIO_BYTES,
} from '@/integrations/transcription/gemini.transcriber';
import { TRANSCRIPTION_PROMPT_VERSION } from '@/integrations/transcription/prompt';

interface LoggedEvent {
  name: string;
  fields: Record<string, string | number | boolean>;
}

function ctx(events: LoggedEvent[] = []): OpCtx {
  return {
    signal: new AbortController().signal,
    importId: null,
    log: {
      event(name, fields) {
        events.push({ name, fields });
      },
    },
  };
}

/** A handful of bytes standing in for an AAC frame. The adapter never inspects the contents — it
 *  base64s them and sends them — so a fixture clip does not need to be real audio. */
const CLIP = new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x00, 0x1f, 0xfc, 0x21]);

function transcriptionResponse(
  payload: unknown,
  usageMetadata = { promptTokenCount: 1_950, candidatesTokenCount: 60 },
): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function rawResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

describe('geminiTranscriber', () => {
  it('returns the spoken words and the reported language, and sends the clip as an inline audio part', async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return transcriptionResponse({
        hasSpeech: true,
        transcript: 'This bakery on Levinsky does the best pistachio thing in the city.',
        language: 'en',
      });
    };
    const transcriber = geminiTranscriber({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx());

    expect(result.text).toBe('This bakery on Levinsky does the best pistachio thing in the city.');
    expect(result.language).toBe('en');
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect((capturedInit?.headers as Record<string, string>)?.['x-goog-api-key']).toBe('test-key');

    const body = JSON.parse(capturedInit?.body as string);
    // Bytes, not a URL: Gemini will not fetch audio for us.
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/aac');
    expect(body.contents[0].parts[0].inlineData.data).toBe('//FQgAAf/CE=');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.transcript.type).toBe('string');
    expect(body.generationConfig.temperature).toBe(0);
  });

  it('records the model and prompt versions the pipeline stamps onto a transcript', () => {
    const transcriber = geminiTranscriber({ apiKey: 'k', model: 'gemini-3.5-flash-lite' });
    expect(transcriber.version).toBe(geminiTranscriberVersion('gemini-3.5-flash-lite'));
    expect(transcriber.promptVersion).toBe(TRANSCRIPTION_PROMPT_VERSION);
  });

  it('tells the model, in the prompt it sends, that an empty transcript is the right answer for silence', async () => {
    // The code-side guard is the control, but the request itself has to *ask* for the empty case or
    // the guard is doing all the work alone. This asserts the ask actually leaves the process.
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return transcriptionResponse({ hasSpeech: false, transcript: '', language: null });
    };
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx());

    const system = JSON.parse(capturedInit?.body as string).systemInstruction.parts[0].text as string;
    expect(system).toContain('IF NOBODY SPEAKS, RETURN NOTHING');
    expect(system).toContain('NEVER INVENT');
    expect(system).toContain('NEVER DESCRIBE THE AUDIO');
  });

  it('returns an honest empty result for a music-only clip', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = async () => transcriptionResponse({ hasSpeech: false, transcript: '', language: null });
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx(events));

    expect(result).toEqual({ text: '', language: null });
    expect(events.find((e) => e.name === 'transcription.suppressed')?.fields.reason).toBe(
      'model-reported-no-speech',
    );
  });

  it('suppresses a narrated non-speech answer instead of passing it to extraction', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = async () =>
      transcriptionResponse({ hasSpeech: true, transcript: '[upbeat music playing]', language: 'en' });
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx(events));

    expect(result).toEqual({ text: '', language: null });
    expect(events.find((e) => e.name === 'transcription.suppressed')?.fields.reason).toBe('annotation-only');
  });

  it('rejects degenerate repetitive output rather than returning it', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = async () =>
      transcriptionResponse({
        hasSpeech: true,
        transcript: 'Thank you for watching. Thank you for watching. Thank you for watching. Thank you for watching.',
        language: 'en',
      });
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx(events));

    expect(result.text).toBe('');
    const suppressed = events.find((e) => e.name === 'transcription.suppressed');
    expect(suppressed?.fields.reason).toBe('degenerate-repetition');
    // The suppressed text itself never reaches a log line (07 §7.1) — only its length.
    expect(JSON.stringify(suppressed?.fields)).not.toContain('Thank you');
  });

  it('logs token counts and an explicitly unmeasured cost model', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = async () =>
      transcriptionResponse(
        { hasSpeech: true, transcript: 'Go early, the queue is long.', language: 'en' },
        { promptTokenCount: 1_950, candidatesTokenCount: 60 },
      );
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx(events));

    const cost = events.find((e) => e.name === 'transcription.cost');
    expect(cost?.fields.inputTokens).toBe(1_950);
    expect(cost?.fields.outputTokens).toBe(60);
    expect(cost?.fields.audioBytes).toBe(CLIP.length);
    // No verified per-token price is on record for this model, so no number is invented.
    expect(cost?.fields.costModel).toBe('unmeasured');
    // A transcription call is counted separately from an extraction call: both bill to one daily
    // budget, and one shared event name makes the split unrecoverable.
    expect(events.some((e) => e.name === 'extraction.cost')).toBe(false);
  });

  it('does not leak the transcript into the completion log line', async () => {
    const events: LoggedEvent[] = [];
    const fetchImpl = async () =>
      transcriptionResponse({ hasSpeech: true, transcript: 'Cafe Levinsky, go early.', language: 'he' });
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    await transcriber.transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx(events));

    const done = events.find((e) => e.name === 'transcription.completed');
    expect(done?.fields.transcriptLength).toBe('Cafe Levinsky, go early.'.length);
    expect(done?.fields.reportedLanguage).toBe('he');
    expect(JSON.stringify(events)).not.toContain('Levinsky');
  });

  it('turns a malformed response body into a DomainError, never a ZodError', async () => {
    const fetchImpl = async () => transcriptionResponse({ transcript: 42, language: [] });
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('EXTRACTOR_INVALID_OUTPUT');
    expect((error as Error).name).toBe('DomainError');
  });

  it('turns a non-JSON content part into a DomainError', async () => {
    const fetchImpl = async () =>
      rawResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Sure! Here is the transcript:' }] } }] }));
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);

    expect((error as DomainError).code).toBe('EXTRACTOR_INVALID_OUTPUT');
  });

  it('turns a response with no text part into a DomainError', async () => {
    const fetchImpl = async () => rawResponse(JSON.stringify({ candidates: [] }));
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);

    expect((error as DomainError).code).toBe('EXTRACTOR_INVALID_OUTPUT');
  });

  it.each([429, 500, 503])('turns HTTP %i into a retryable EXTRACTOR_UNAVAILABLE', async (status) => {
    const fetchImpl = async () => rawResponse('{"error":{"message":"quota"}}', status);
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('EXTRACTOR_UNAVAILABLE');
    expect((error as DomainError).retryable).toBe(true);
    // The vendor's own message never crosses the seam (07 §9).
    expect((error as Error).message).not.toContain('quota');
  });

  it('turns a transport failure into EXTRACTOR_UNAVAILABLE', async () => {
    const fetchImpl = async () => {
      throw new TypeError('fetch failed');
    };
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const error = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);

    expect((error as DomainError).code).toBe('EXTRACTOR_UNAVAILABLE');
  });

  it('refuses an oversized or empty clip before spending a request', async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return transcriptionResponse({ hasSpeech: false, transcript: '', language: null });
    };
    const transcriber = geminiTranscriber({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });

    const tooBig = await transcriber
      .transcribe({ audio: new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1), mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);
    const empty = await transcriber
      .transcribe({ audio: new Uint8Array(0), mimeType: 'audio/aac' }, ctx())
      .then(() => null, (e: unknown) => e);
    const wrongType = await transcriber
      .transcribe({ audio: CLIP, mimeType: 'video/mp4' }, ctx())
      .then(() => null, (e: unknown) => e);

    // INTERNAL, because each of these means the acquisition step handed us something it should not
    // have — a bug report, not a user-facing condition (07 §9).
    for (const error of [tooBig, empty, wrongType]) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INTERNAL');
    }
    expect(called).toBe(0);
  });
});
