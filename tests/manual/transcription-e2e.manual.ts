/**
 * The end-to-end proof: a real TikTok's MP4 → our demuxer → Gemini → a transcript.
 *
 * Deliberately reads a file from disk rather than acquiring it, so the two halves stay separately
 * falsifiable: acquisition is measured by `api/acquisition-probe` against a real deployment, and
 * this asks the different question of whether the bytes we produce are bytes Gemini can read.
 *
 * **Spends real Gemini calls** — one per run. Owner-approved for this proof, not for a batch.
 *
 *   MP4=/path/to.mp4 npx vitest run --config tests/manual/vitest.manual.config.ts \
 *     tests/manual/transcription-e2e.manual.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { extractAacFromMp4 } from '@/integrations/media/mp4-aac-demux';
import { geminiTranscriber } from '@/integrations/transcription/gemini.transcriber';
import type { OpCtx } from '@/domain/ports';

const MP4 = process.env.MP4;
const KEY = process.env.GEMINI_API_KEY;

const ctx: OpCtx = {
  signal: new AbortController().signal,
  importId: null,
  log: {
    event: (name, fields) => {
      console.log(`  [${name}]`, JSON.stringify(fields));
    },
  },
};

describe.skipIf(MP4 === undefined || KEY === undefined)('transcription end to end', () => {
  it('turns a real TikTok MP4 into a transcript', async () => {
    const bytes = new Uint8Array(readFileSync(MP4 as string));
    console.log(`\ninput: ${bytes.byteLength} bytes`);

    const demuxStarted = Date.now();
    const audio = extractAacFromMp4(bytes);
    const demuxMs = Date.now() - demuxStarted;

    console.log(
      `demux: ${demuxMs}ms → ${audio.audio.byteLength} bytes ${audio.mimeType} ` +
        `${audio.codec} ${audio.sampleRateHz}Hz ch${audio.channels} ` +
        `${audio.durationSeconds.toFixed(2)}s ${audio.frameCount} frames`,
    );
    expect(audio.audio.byteLength).toBeGreaterThan(0);

    const transcriber = geminiTranscriber({ apiKey: KEY as string });
    const started = Date.now();
    const result = await transcriber.transcribe(audio, ctx);
    const ms = Date.now() - started;

    console.log(`\ngemini: ${ms}ms  model=${transcriber.version} prompt=${transcriber.promptVersion}`);
    console.log(`language: ${result.language ?? '(none)'}`);
    console.log(`transcript (${result.text.length} chars):\n${result.text || '(empty — no speech)'}\n`);

    const out = process.env.OUT;
    if (out !== undefined) {
      writeFileSync(
        out,
        JSON.stringify(
          {
            inputBytes: bytes.byteLength,
            demuxMs,
            audio: {
              bytes: audio.audio.byteLength,
              mimeType: audio.mimeType,
              codec: audio.codec,
              sampleRateHz: audio.sampleRateHz,
              channels: audio.channels,
              durationSeconds: audio.durationSeconds,
              frameCount: audio.frameCount,
            },
            gemini: { ms, model: transcriber.version, promptVersion: transcriber.promptVersion },
            language: result.language,
            text: result.text,
          },
          null,
          2,
        ),
      );
    }

    expect(typeof result.text).toBe('string');
  }, 180_000);
});
