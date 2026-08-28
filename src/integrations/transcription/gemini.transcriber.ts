/**
 * The hosted-Gemini `Transcriber` (`domain/ports.ts`) — the same `generateContent` endpoint over
 * plain `fetch` that `integrations/llm/gemini.place-extractor.ts` already calls, with an inline
 * audio part in place of a caption. Deliberately the same file shape, the same error mapping and
 * the same cost-logging vocabulary as that adapter: one vendor, one style.
 *
 * **Why this surface and not a transcription endpoint.** Settled in
 * `docs/evidence/deploy/audio-acquisition-hosting-2026-08-29.md`: `gemini-3.5-transcribe` is capped
 * at 25 requests/day, which makes a hundred-post batch take four calendar days;
 * `gemini-3.5-transcribe-live` is a Preview WebSocket surface that accepts only 16 kHz raw PCM, so
 * feeding it means decoding and resampling AAC — a codec, not a remux. Ordinary `generateContent`
 * on `gemini-3.5-flash-lite` takes `audio/aac` directly, is Stable, and bills to the same daily
 * bucket the project already counts.
 *
 * **Bytes, not a URL.** Gemini will not fetch audio for us (only Files-API URIs and YouTube links
 * are accepted), so the caller has already acquired the clip. Inline base64 rather than the Files
 * API because ~120 s of TikTok AAC is roughly 1.9 MB against a 20 MB inline request ceiling — an
 * upload, a URI and a lifecycle to manage would buy nothing.
 *
 * **Nothing here has been run against the live endpoint.** No live call was made building this: the
 * request shape is written from the vendor's documented `inlineData` part and the response shape
 * from the same `generateContent` body the extraction adapter already parses in production. The
 * accuracy of the transcripts, the real token cost of an audio part, and whether the model honours
 * the empty-output instruction are all UNMEASURED.
 */

import { extractorInvalidOutput, extractorUnavailable, internal } from '@/domain/errors';
import type { OpCtx, Transcriber, TranscriptionInput } from '@/domain/ports';
import { costUsd, type TokenUsage } from '@/integrations/llm/cost';

import { judgeTranscript } from './no-speech';
import {
  TRANSCRIPTION_PROMPT_VERSION,
  TRANSCRIPTION_SYSTEM_PROMPT,
  TRANSCRIPTION_USER_PROMPT,
} from './prompt';
import { GEMINI_TRANSCRIPTION_RESPONSE_SCHEMA, TranscriptionResponseSchema } from './schema';

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Raw bytes, before base64. The documented inline ceiling is 20 MB on the whole request and base64
 * inflates by 4/3, so 15 MB of audio is the largest clip that can fit with room for the prompt.
 *
 * Exceeding it is a bug in whatever acquired the audio, not a user-facing condition — a TikTok
 * clip trimmed to the intended ~120 s is ~1.9 MB, so anything near this cap means the trim did not
 * happen. Hence `INTERNAL`, which `07` §9 defines as "always a bug report", rather than quietly
 * transcribing a truncated prefix or pretending the clip was silent.
 */
export const MAX_INLINE_AUDIO_BYTES = 15_000_000;

/** IANA types Gemini documents for audio input. Checked before the call because a rejected MIME
 *  type costs a request against a shared daily budget to learn something we already knew. */
const SUPPORTED_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set([
  'audio/aac',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/aiff',
  'audio/ogg',
  'audio/flac',
]);

/**
 * No verified per-token price for `gemini-3.5-flash-lite` is on record in this codebase — the same
 * position `gemini.place-extractor.ts` takes, and the two Gemini call sites must report cost the
 * same way or the per-import total is a mix of a real number and a guess. The evidence file records
 * a *published* $0.30/M input for this model, which is a DOCUMENTED figure, not a billed one; when
 * it is confirmed it should be adopted in both adapters at once, not here alone.
 */
const GEMINI_FLASH_LITE_PRICE_PER_1M: { input: number; output: number } | undefined = undefined;

/** `version` names the model, `promptVersion` names the prompt — the pair that becomes the
 *  transcript `ContentPart`'s `origin`, and therefore part of the extraction cache key. */
export function geminiTranscriberVersion(model: string): string {
  return `2026-08-transcribe-${model}`;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly { readonly text?: string }[] };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
}

/**
 * `btoa` over fixed-size chunks rather than `Buffer`: this adapter has no other reason to require a
 * Node runtime, and `String.fromCharCode(...bytes)` on a 2 MB clip overflows the argument stack.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * One transcription call's cost, in the same field vocabulary as `logExtractionCost` but under its
 * own event name. Not folded into that function: a transcription call and an extraction call are
 * both Gemini requests against one daily budget, and counting them as the same event is how you end
 * up unable to say which half of an import's spend went where.
 */
function logTranscriptionCost(
  log: OpCtx['log'],
  fields: {
    readonly transcriberVersion: string;
    readonly promptVersion: string;
    readonly audioBytes: number;
    readonly usage: TokenUsage;
    readonly elapsedMs: number;
  },
): void {
  log.event('transcription.cost', {
    transcriberVersion: fields.transcriberVersion,
    promptVersion: fields.promptVersion,
    audioBytes: fields.audioBytes,
    inputTokens: fields.usage.inputTokens,
    outputTokens: fields.usage.outputTokens,
    costUsd:
      GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 0 : costUsd(fields.usage, GEMINI_FLASH_LITE_PRICE_PER_1M),
    costModel: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 'unmeasured' : 'measured',
    elapsedMs: fields.elapsedMs,
  });
}

/** `apiKey` and `model` are passed in, not read from `process.env` here — same composition-root
 *  separation as every other adapter in `integrations/`. */
export function geminiTranscriber(config: {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}): Transcriber {
  const model = config.model ?? 'gemini-3.5-flash-lite';
  const doFetch = config.fetchImpl ?? fetch;
  const version = geminiTranscriberVersion(model);

  return {
    version,
    promptVersion: TRANSCRIPTION_PROMPT_VERSION,

    async transcribe(input: TranscriptionInput, ctx: OpCtx) {
      if (input.audio.length === 0) {
        throw internal('Transcription was called with an empty audio clip.');
      }
      if (input.audio.length > MAX_INLINE_AUDIO_BYTES) {
        throw internal('Audio clip exceeds the inline request ceiling.');
      }
      if (!SUPPORTED_AUDIO_MIME_TYPES.has(input.mimeType)) {
        throw internal(`Unsupported audio MIME type for transcription: ${input.mimeType}`);
      }

      const startedAt = Date.now();

      let response: Response;
      try {
        response = await doFetch(`${GEMINI_ENDPOINT_BASE}/${model}:generateContent`, {
          method: 'POST',
          signal: ctx.signal,
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: TRANSCRIPTION_SYSTEM_PROMPT }] },
            contents: [
              {
                role: 'user',
                parts: [
                  // Audio first, instruction second. The instruction is the last thing the model
                  // reads, which is where an instruction is least likely to be lost behind a large
                  // media part — and it is also the ordering the vendor's own audio examples use.
                  { inlineData: { mimeType: input.mimeType, data: toBase64(input.audio) } },
                  { text: TRANSCRIPTION_USER_PROMPT },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: GEMINI_TRANSCRIPTION_RESPONSE_SCHEMA,
              // Same reasoning as the extraction adapter: not determinism, but a measurement floor.
              // Without it, a prompt change and a sampling draw are indistinguishable, and the only
              // way transcription quality improves is by comparing prompts.
              temperature: 0,
            },
          }),
        });
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      if (!response.ok) {
        throw extractorUnavailable(`Gemini returned HTTP ${response.status}`);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      const body = json as GeminiGenerateContentResponse;
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text === undefined) {
        throw extractorInvalidOutput('Gemini transcription response contained no text part.');
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        throw extractorInvalidOutput('Gemini transcription response content was not valid JSON.', e);
      }

      const parsed = TranscriptionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }

      logTranscriptionCost(ctx.log, {
        transcriberVersion: version,
        promptVersion: TRANSCRIPTION_PROMPT_VERSION,
        audioBytes: input.audio.length,
        usage: {
          inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        },
        elapsedMs: Date.now() - startedAt,
      });

      const verdict = judgeTranscript(parsed.data);
      if (!verdict.kept) {
        // Counted, because "how often does the guard fire, and on which rule" is the only way to
        // learn whether the prompt is working or the thresholds are wrong. Scalar fields only —
        // never the suppressed text itself (`07` §7.1).
        ctx.log.event('transcription.suppressed', {
          transcriberVersion: version,
          promptVersion: TRANSCRIPTION_PROMPT_VERSION,
          reason: verdict.reason,
          rawLength: parsed.data.transcript.length,
        });
        return { text: '', language: null };
      }

      ctx.log.event('transcription.completed', {
        transcriberVersion: version,
        promptVersion: TRANSCRIPTION_PROMPT_VERSION,
        // Length, not content: a transcript is user data of exactly the kind `07` §7.1 keeps out
        // of logs, and its length is enough to see whether the step is producing anything.
        transcriptLength: verdict.text.length,
        // Self-reported and ungraded. Logged so it can one day be checked against a label, never
        // branched on until it has been.
        reportedLanguage: parsed.data.language ?? 'unknown',
      });

      return { text: verdict.text, language: parsed.data.language };
    },
  };
}
