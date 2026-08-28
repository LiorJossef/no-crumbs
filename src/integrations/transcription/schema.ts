/**
 * What a transcription response is allowed to be, in two forms: the Zod schema we actually trust,
 * and the Gemini-dialect `responseSchema` we send so the model has less room to say something else.
 *
 * Same division of labour as extraction (`integrations/llm/json-schema.ts` +
 * `domain/extraction/schema.ts`): shaping the request narrows what the model *can* return, the Zod
 * parse is what decides whether we believe it. A response that fails the parse is a `DomainError`,
 * never a thrown `ZodError` crossing the adapter seam.
 *
 * The Gemini schema is written directly in Gemini's restricted OpenAPI subset rather than run
 * through `gemini.place-extractor.ts`'s `toGeminiSchema` converter. That converter exists because
 * the extraction schema is *shared* with the Anthropic adapter and must stay vendor-neutral; there
 * is one transcription adapter and three properties, so importing a converter to translate a schema
 * that has only ever had one target would be indirection with nothing on the other end of it.
 */

import { z } from 'zod';

/** The response shape's version, welded onto `TRANSCRIPTION_PROMPT_VERSION` so a field change
 *  cannot ship without moving the version string the `ContentPart.origin` carries. */
export const TRANSCRIPTION_SCHEMA_VERSION = 1;

/**
 * `hasSpeech` is a separate boolean rather than "the transcript is empty" because the two failure
 * directions are different and we want to see them apart in the logs. A model that returns
 * `hasSpeech: false` with a non-empty `transcript` has contradicted itself, and
 * `no-speech.ts` resolves that contradiction toward silence — the safe direction, since the
 * expensive mistake here is a fabricated venue name, not a missed one.
 */
export const TranscriptionResponseSchema = z.object({
  hasSpeech: z.boolean(),
  /** Bounded because an unbounded transcript from a ~120 s clip is itself a hallucination signal
   *  (a looping model can emit tens of thousands of characters). 20k characters is roughly an order
   *  of magnitude more than two minutes of fast speech in any language we handle. */
  transcript: z.string().max(20_000),
  language: z.string().max(32).nullable(),
});

export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

/** Gemini's `generationConfig.responseSchema` dialect: single-valued `type`, `nullable` instead of
 *  a `['string', 'null']` union, no `additionalProperties`. */
export const GEMINI_TRANSCRIPTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    hasSpeech: {
      type: 'boolean',
      description: 'True only if a human voice speaks words in the clip. Music, singing, ambience and silence are all false.',
    },
    transcript: {
      type: 'string',
      description: 'The words that were spoken, verbatim, in the language spoken. Empty string when hasSpeech is false.',
    },
    language: {
      type: 'string',
      nullable: true,
      description: 'BCP-47 code of the spoken language, e.g. "he", "en", "ja". Null when nothing was spoken.',
    },
  },
  required: ['hasSpeech', 'transcript', 'language'],
} as const;
