/**
 * The control on the transcription prompt: pure functions that decide whether a model's answer is
 * speech or is silence dressed up as speech.
 *
 * `prompt.ts` asks for an empty transcript when nobody speaks. This file assumes the model will
 * sometimes ignore that, because the measured behaviour of ASR models on non-speech is not "returns
 * nothing" — it is "returns something plausible". FAccT '24 measured ~1% of Whisper transcriptions
 * as hallucinated specifically during non-speech, and the two shapes it recorded are the two shapes
 * caught here: **annotation** ("[Music]", "(upbeat song)") and **loop** (a phrase repeated until the
 * decoder gives up). A third shape, a wholly invented fluent sentence, is not detectable from the
 * text alone and this file does not pretend otherwise — see the note on that at the bottom.
 *
 * Everything here decides toward **silence**. The asymmetry is deliberate and it is the product
 * argument, not a coding preference: a dropped real transcript costs one import its extra text,
 * which we would mostly have got from the caption anyway; a kept fabricated transcript puts a venue
 * in front of the user that nobody recommended, and by the time it reaches the map it looks exactly
 * like a real one. An uncertain result beats a confidently wrong place.
 *
 * Pure and synchronous, so the thresholds below can be argued with in a test rather than in prose.
 */

/** Why a transcript was suppressed. A closed set, because it is logged and will be counted. */
export type SuppressionReason =
  | 'model-reported-no-speech'
  | 'empty'
  | 'annotation-only'
  | 'no-speech-phrase'
  | 'degenerate-repetition';

export type TranscriptVerdict =
  | { readonly kept: true; readonly text: string }
  | { readonly kept: false; readonly reason: SuppressionReason };

/**
 * Bracketed, parenthesised, angle-bracketed and musical-note spans, as a *test* mask only — the
 * text we keep is never rewritten by this, because editing a real transcript to make it pass a
 * check we invented would be putting our words in a speaker's mouth.
 */
const ANNOTATION_SPAN = /\[[^\]]*\]|\([^)]*\)|<[^>]*>|[♪♫♬♩]/gu;

/** Any letter or digit in any script — the test for "is there anything here at all". `\p{L}`
 *  matters: an all-Hebrew or all-Japanese transcript must not read as empty. */
const HAS_CONTENT = /[\p{L}\p{N}]/u;

const PUNCTUATION = /[\p{P}\p{S}]/gu;

/**
 * Whole-string matches only, never substrings. "No speech" as an entire transcript is the model
 * answering the question instead of doing the job; "no speech" inside a sentence is somebody
 * talking. Kept short and literal rather than fuzzy: a broad regex over model prose is how a real
 * transcript that happens to open with the word "music" gets deleted.
 */
const NO_SPEECH_PHRASES: ReadonlySet<string> = new Set([
  'music',
  'music playing',
  'background music',
  'instrumental',
  'instrumental music',
  'upbeat music',
  'silence',
  'silent',
  'no speech',
  'no speech detected',
  'no audible speech',
  'no speech in this audio',
  'there is no speech in this audio',
  'the audio contains no speech',
  'the audio contains only music',
  'this audio contains no speech',
  'inaudible',
  'unintelligible',
  'none',
  'n a',
  'null',
  'empty',
  'no transcript',
  'no transcription available',
]);

/** Below this many tokens, repetition is ordinary speech ("yes, yes, yes") and the ratio rule has
 *  no signal. Above it, a quarter-unique vocabulary is not how anyone talks. */
const MIN_TOKENS_FOR_RATIO = 8;
const MAX_REPETITION_RATIO = 0.25;
/** Six identical words in a row. Catches the classic decoder loop even in a short output, where
 *  the ratio rule is deliberately asleep. */
const MAX_CONSECUTIVE_RUN = 6;
/** A phrase loop needs at least three whole repetitions before it is a loop rather than a refrain
 *  or a chant a person genuinely performed. */
const MIN_PHRASE_REPEATS = 3;

function normaliseTokens(text: string): readonly string[] {
  return text
    .replace(PUNCTUATION, ' ')
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
}

function longestConsecutiveRun(tokens: readonly string[]): number {
  let best = 0;
  let run = 0;
  let previous: string | undefined;
  for (const token of tokens) {
    run = token === previous ? run + 1 : 1;
    previous = token;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Is the whole token list the first `n` tokens said over and over? Covers the "Subscribe to my
 * channel. Subscribe to my channel. Subscribe to my channel." shape that the unique-ratio rule
 * misses, because a five-word phrase repeated three times is still 33% unique.
 *
 * A trailing partial repeat counts, since a loop truncated by a token limit is still a loop.
 */
function isPhraseLoop(tokens: readonly string[]): boolean {
  const maxPeriod = Math.floor(tokens.length / MIN_PHRASE_REPEATS);
  for (let period = 1; period <= maxPeriod; period += 1) {
    let matches = true;
    for (let i = period; i < tokens.length && matches; i += 1) {
      if (tokens[i] !== tokens[i % period]) matches = false;
    }
    if (matches) return true;
  }
  return false;
}

/** Exported for its own tests: the thresholds are the interesting part of this file and they should
 *  be arguable without going through a whole transcription response. */
export function isDegenerateRepetition(text: string): boolean {
  const tokens = normaliseTokens(text);
  if (tokens.length === 0) return false;
  if (longestConsecutiveRun(tokens) >= MAX_CONSECUTIVE_RUN) return true;
  if (tokens.length < MIN_TOKENS_FOR_RATIO) return false;
  if (isPhraseLoop(tokens)) return true;
  const unique = new Set(tokens).size;
  return unique / tokens.length < MAX_REPETITION_RATIO;
}

/**
 * The one place a model's transcription answer becomes either text we will show a language model,
 * or nothing.
 *
 * `hasSpeech: false` wins outright even when a transcript came with it — a self-contradicting
 * response is resolved toward silence, per `schema.ts`.
 *
 * **What this cannot catch.** A fluent, well-formed, entirely invented sentence — "we went to
 * Cafe Levinsky and the sourdough was incredible", over a clip where nobody said anything — is
 * indistinguishable from a true transcript by inspecting the string. Nothing downstream can catch
 * it either: it will look like ordinary caption text to the extractor. The mitigations that do
 * apply live outside this file (the extraction plausibility gate's evidence check, and a human
 * confirming the place before it is saved), and the residual risk is real and unmeasured.
 */
export function judgeTranscript(response: {
  readonly hasSpeech: boolean;
  readonly transcript: string;
}): TranscriptVerdict {
  if (!response.hasSpeech) return { kept: false, reason: 'model-reported-no-speech' };

  const text = response.transcript.trim();
  if (text.length === 0) return { kept: false, reason: 'empty' };

  const withoutAnnotations = text.replace(ANNOTATION_SPAN, ' ');
  if (!HAS_CONTENT.test(withoutAnnotations)) return { kept: false, reason: 'annotation-only' };

  const normalised = normaliseTokens(withoutAnnotations).join(' ');
  if (NO_SPEECH_PHRASES.has(normalised)) return { kept: false, reason: 'no-speech-phrase' };

  if (isDegenerateRepetition(withoutAnnotations)) return { kept: false, reason: 'degenerate-repetition' };

  return { kept: true, text };
}
