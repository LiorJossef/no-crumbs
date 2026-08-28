/**
 * One multimodal call vs two: does sending caption + audio straight to the place extractor find
 * the same places as transcribe-then-extract?
 *
 * Arm A (current): the transcript is already text, so extraction runs over
 *   `[caption, transcript]` — one call here, because transcription happened earlier.
 * Arm B (proposed): caption text plus the raw audio in one `generateContent`, same prompt, same
 *   schema, no transcript ever materialised.
 *
 * Two real Gemini calls per run. Owner-approved for this comparison, not for a batch.
 *
 *   MP4=… TRANSCRIPT=… CAPTION=… OUT=… npx vitest run \
 *     --config tests/manual/vitest.manual.config.ts tests/manual/one-call-vs-two-call.manual.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { extractAacFromMp4 } from '@/integrations/media/mp4-aac-demux';
import { geminiPlaceExtractor } from '@/integrations/llm/gemini.place-extractor';
import { EXTRACTION_JSON_SCHEMA } from '@/integrations/llm/json-schema';
import { SYSTEM_PROMPT, buildUserPrompt, generateDelimiter } from '@/integrations/llm/prompt';
import type { ContentPart } from '@/domain/types';
import type { OpCtx } from '@/domain/ports';

const MP4 = process.env.MP4;
const TRANSCRIPT = process.env.TRANSCRIPT;
const CAPTION = process.env.CAPTION;
const KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.5-flash-lite';

/** `toGeminiSchema` is private to the adapter (Gemini rejects `type: [..., 'null']` unions and
 *  wants `nullable`). Mirrored here so both arms send an identical response schema — the point of
 *  the comparison is the input modality, not the schema. */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'type' && Array.isArray(value)) {
      const nonNull = value.filter((t) => t !== 'null');
      out.type = nonNull[0];
      if (nonNull.length !== value.length) out.nullable = true;
      continue;
    }
    if (key === 'additionalProperties') continue;
    out[key] = geminiSchema(value);
  }
  return out;
}

const ctx: OpCtx = {
  signal: new AbortController().signal,
  importId: null,
  log: { event: () => {} },
};

/** Arm B by hand: the same system prompt and response schema the adapter uses, with the audio
 *  added as a second part. Written out rather than routed through `geminiPlaceExtractor` because
 *  that adapter's port takes `ContentPart[]` — text only — and the whole question is whether it
 *  should learn to take bytes. */
async function oneCall(
  caption: string,
  audio: Uint8Array,
  mimeType: string,
): Promise<{ ms: number; body: unknown }> {
  const delimiter = generateDelimiter();
  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY as string },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildUserPrompt([{ kind: 'caption', text: caption, origin: 'manual' }], delimiter) },
              {
                text:
                  'The spoken audio of the same post follows. Treat what is said in it as ' +
                  'additional source text, subject to every rule above.',
              },
              { inlineData: { mimeType, data: Buffer.from(audio).toString('base64') } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: geminiSchema(EXTRACTION_JSON_SCHEMA),
        },
      }),
    },
  );
  const ms = Date.now() - started;
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return { ms, body: { httpStatus: res.status, error: json } };
  const candidates = json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { unparseable: text.slice(0, 800) };
  }
  return { ms, body: { usage: json.usageMetadata, parsed } };
}

describe.skipIf([MP4, TRANSCRIPT, CAPTION, KEY].some((v) => v === undefined))(
  'one multimodal call vs transcribe-then-extract',
  () => {
    it('compares both arms on the same post', async () => {
      const audio = extractAacFromMp4(new Uint8Array(readFileSync(MP4 as string)));

      // Arm A — extraction over text parts, the shape that exists today.
      const parts: readonly ContentPart[] = [
        { kind: 'caption', text: CAPTION as string, origin: 'tiktok:oembed' },
        { kind: 'transcript', text: TRANSCRIPT as string, origin: `gemini:${MODEL}` },
      ];
      const extractor = geminiPlaceExtractor({ apiKey: KEY as string });
      const aStarted = Date.now();
      const a = await extractor.extract(parts, ctx);
      const aMs = Date.now() - aStarted;

      // Arm B — caption + audio, one call, no transcript.
      // Arm B is a known 400 and costs a call to re-learn that; skip it when only Arm A matters.
      const b =
        process.env.SKIP_B === '1'
          ? { ms: 0, body: { skipped: true } }
          : await oneCall(CAPTION as string, audio.audio, audio.mimeType);

      const out = process.env.OUT;
      if (out !== undefined) {
        writeFileSync(
          out,
          JSON.stringify(
            {
              armA_transcriptThenExtract: { ms: aMs, cityHint: a.cityHint, candidates: a.candidates },
              armB_oneMultimodalCall: b,
            },
            null,
            2,
          ),
        );
      }
      expect(a).toBeDefined();
    }, 300_000);
  },
);
