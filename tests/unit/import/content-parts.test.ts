/**
 * The `ContentPart[]` helpers, and above all the extraction cache's key.
 *
 * The bug these pin is silent and permanent in both directions. Key the cache on the caption alone
 * and a source that gains a transcript keeps serving its cached caption-only answer forever; key
 * every array compositely and every `extractions` row ever written is invalidated at once, so every
 * previously-imported source re-extracts on its next import out of a 500-call daily Gemini budget.
 * Neither failure shows up as a test failure anywhere else, which is why the caption-only digest is
 * pinned here as a literal rather than recomputed from the implementation.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { contentHashInput, contentPartsText, withContent } from '@/domain/import/content-parts';
import type { ContentPart } from '@/domain/types';

/** The route's own `sha256`, duplicated deliberately: a test that reached for the implementation's
 *  hash could not detect the implementation changing it. */
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const CAPTION_TEXT = 'grab the sourdough at Cafe Fiori';
const CAPTION: ContentPart = { kind: 'caption', text: CAPTION_TEXT, origin: 'tiktok-oembed-title' };
const TRANSCRIPT: ContentPart = {
  kind: 'transcript',
  text: 'and the babka next door at Lehem Erez',
  origin: 'tiktok-asr',
};

describe('contentHashInput — the extraction cache key', () => {
  /**
   * The compatibility guarantee, written as the digest itself. This is the value every existing
   * `extractions.input_hash` holds for this caption; if a refactor changes it, every stored
   * extraction in every environment silently becomes a miss.
   */
  it('hashes a lone caption to sha256 of the caption text, unchanged', () => {
    expect(contentHashInput([CAPTION])).toBe(CAPTION_TEXT);
    expect(sha256(contentHashInput([CAPTION]))).toBe(
      '0e14a376f9f0a5c0077ff671c337ab4edbfb69bf8ae876a5e5145127a6793153',
    );
    expect(sha256(contentHashInput([CAPTION]))).toBe(sha256(CAPTION_TEXT));
  });

  it('changes the key when a second part joins the caption', () => {
    // The whole point: the model is now shown more than it was, so the cached answer is stale.
    expect(sha256(contentHashInput([CAPTION, TRANSCRIPT]))).not.toBe(sha256(CAPTION_TEXT));
    expect(sha256(contentHashInput([CAPTION, TRANSCRIPT]))).toBe(
      'c86a152d2354b7b9344a62e87e106401a971f8dfd24fa2da4c5c7935ca365f59',
    );
  });

  it('treats the same words under a different kind as different input', () => {
    const asTranscript: ContentPart = { ...CAPTION, kind: 'transcript' };
    expect(contentHashInput([asTranscript])).not.toBe(contentHashInput([CAPTION]));
    // And a second part still separates them, so the single-part shortcut is not what is doing
    // the work here.
    expect(contentHashInput([asTranscript, TRANSCRIPT])).not.toBe(contentHashInput([CAPTION, TRANSCRIPT]));
  });

  it('treats the same text and kind from a different origin as different input', () => {
    const otherOrigin: ContentPart = { ...TRANSCRIPT, origin: 'whisper-local' };
    expect(contentHashInput([CAPTION, otherOrigin])).not.toBe(contentHashInput([CAPTION, TRANSCRIPT]));
  });

  it('makes order significant, because the parts are concatenated in order for the prompt', () => {
    // Caption-then-transcript is a different prompt from transcript-then-caption. A key that
    // ignored order would serve one order's answer for the other's question.
    expect(contentHashInput([TRANSCRIPT, CAPTION])).not.toBe(contentHashInput([CAPTION, TRANSCRIPT]));
  });

  it('cannot be confused by text that contains the delimiter it is encoded with', () => {
    // Two arrays that a hand-rolled `kind:text\n` encoding would collapse into one string.
    const a: readonly ContentPart[] = [
      { kind: 'caption', text: 'one', origin: 'o' },
      { kind: 'transcript', text: 'two', origin: 'o' },
    ];
    const b: readonly ContentPart[] = [
      { kind: 'caption', text: 'one","transcript","o","two', origin: 'o' },
      { kind: 'transcript', text: '', origin: 'o' },
    ];
    expect(contentHashInput(a)).not.toBe(contentHashInput(b));
  });
});

describe('withContent', () => {
  it('drops parts that carry nothing, so a silent extractor cannot invalidate the cache', () => {
    const emptyTranscript: ContentPart = { kind: 'transcript', text: '   \n ', origin: 'tiktok-asr' };
    expect(withContent([CAPTION, emptyTranscript])).toEqual([CAPTION]);
    // The consequence that matters: an ASR run that heard nothing keys identically to no ASR run.
    expect(contentHashInput(withContent([CAPTION, emptyTranscript]))).toBe(CAPTION_TEXT);
  });

  it('preserves order and the parts that do carry text', () => {
    expect(withContent([CAPTION, TRANSCRIPT])).toEqual([CAPTION, TRANSCRIPT]);
    expect(withContent([])).toEqual([]);
  });
});

describe('contentPartsText', () => {
  it('joins in order with the blank line both PlaceExtractor adapters use', () => {
    expect(contentPartsText([CAPTION, TRANSCRIPT])).toBe(`${CAPTION_TEXT}\n\n${TRANSCRIPT.text}`);
  });

  it('is the caption verbatim when the caption is all there is', () => {
    // The plausibility gate's evidence check has been fed exactly this string since it was
    // written; one part must not gain a separator.
    expect(contentPartsText([CAPTION])).toBe(CAPTION_TEXT);
  });
});
