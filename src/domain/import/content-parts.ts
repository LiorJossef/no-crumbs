/**
 * What the import path does with the `ContentPart[]` a `ContentExtractor` produced: which parts
 * carry anything, what text the model is actually shown, and what the extraction cache is keyed by.
 *
 * It exists because the probe route answered all three questions with one string — `parts.find(p =>
 * p.kind === 'caption')?.text` — which is correct for exactly as long as there is one extractor.
 * `ports.ts` has always declared `ContentExtractor` as an array seam (an ASR or OCR analyser is a
 * second implementation and no other stage changes), so the moment a transcript joins the caption,
 * "the caption" stops being the input to anything.
 *
 * Pure, and deliberately ignorant of hashing: `contentHashInput` returns the *string* to digest and
 * the caller owns the digest, because `domain/` may not import `node:crypto` and has no business
 * learning a runtime's crypto API to answer a question about content.
 *
 * No Zod here: these parts are our own extractors' output, already typed at the adapter seam that
 * parsed the untrusted source payload. Re-validating them would be validating ourselves.
 */

import type { ContentPart } from '../types';

/** Both `PlaceExtractor` adapters join the parts with a blank line before prompting
 *  (`anthropic.place-extractor.ts`, `gemini.place-extractor.ts`). Anything reasoning about "the
 *  text the model saw" — the plausibility gate's evidence check above all — has to use the same
 *  separator, or it is checking evidence against a string that never existed. */
const PART_SEPARATOR = '\n\n';

/**
 * The parts that carry text, in the order they were produced.
 *
 * Whitespace counts as nothing. An extractor that ran and found silence must leave the import
 * exactly where one that never ran would: an empty part would otherwise cost a model call on
 * nothing and — worse — a different cache key for identical input.
 */
export function withContent(parts: readonly ContentPart[]): readonly ContentPart[] {
  return parts.filter((p) => p.text.trim().length > 0);
}

/** Every part's text in prompt order, concatenated exactly as the extractor adapters concatenate
 *  it. This is the string the model reads, so it is also the string the plausibility gate must
 *  check "is this evidence really in the source?" against. */
export function contentPartsText(parts: readonly ContentPart[]): string {
  return parts.map((p) => p.text).join(PART_SEPARATOR);
}

/**
 * The version marker on the composite encoding below. Changing the encoding is a cache generation
 * bump — it must be a decision someone made, not a refactor's side effect.
 */
const COMPOSITE_PREFIX = 'content-parts/v1\n';

/**
 * The string whose digest is `extractions.input_hash` — the extraction cache's "is this the same
 * input?" test. Two requirements pull against each other here.
 *
 * The key has to cover **the whole array, `kind` and `origin` included**, not the concatenated
 * text. Key it on text alone and adding a transcript to a source that was already extracted
 * caption-only leaves the key unchanged: that source keeps serving its cached caption-only answer
 * — usually zero candidates — forever, and the transcript never reaches the model at all. Silent,
 * permanent, and invisible to every test that only ever supplies one part.
 *
 * The key also has to leave **the rows we already have** alone. Every `extractions` row in every
 * environment was written as the digest of the caption and nothing else. A composite form applied
 * unconditionally invalidates all of them at once, and the next import of each of those sources
 * re-extracts — spending a 500-call daily Gemini budget to recompute answers already on disk.
 *
 * So the rule is: a lone `caption` part hashes to its own text, byte for byte as before. A second
 * part is what switches the key to the composite form, and by then there is genuinely new input
 * worth paying for.
 *
 * **Order is significant.** The parts are concatenated in order for the prompt, so caption-then-
 * transcript is a different prompt from transcript-then-caption, a different answer, and therefore
 * a different key.
 *
 * The composite form is `JSON.stringify` over `[kind, origin, text]` triples rather than a
 * hand-rolled delimiter: a caption is arbitrary user text, and any separator we invented would be
 * one caption away from an ambiguous encoding.
 */
export function contentHashInput(parts: readonly ContentPart[]): string {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only !== undefined && only.kind === 'caption') return only.text;
  return COMPOSITE_PREFIX + JSON.stringify(parts.map((p) => [p.kind, p.origin, p.text]));
}
