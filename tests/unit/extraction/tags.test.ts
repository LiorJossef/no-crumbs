import { describe, expect, it } from 'vitest';

import {
  canonicaliseTag,
  canonicaliseTags,
  MAX_TAGS_PER_CANDIDATE,
  tagDisplayLabel,
  tagKey,
} from '@/domain/extraction/tags';

/**
 * These tests are the argument for `tags.ts` existing at all. The model is asked for an open
 * vocabulary, and an open vocabulary is only worth having if two captions six months apart file the
 * same concept under the same label — which is a code problem, not a prompt problem.
 *
 * Several cases below are transcribed from real `gemini-3.5-flash-lite` output on the four cached
 * captions, and one of them (`Street food`) is a bug this suite caught in an earlier version of
 * this file rather than a case it was written to pass.
 */
describe('tagKey', () => {
  it('folds case, accents and punctuation onto one key', () => {
    expect(tagKey('Italian')).toBe('italian');
    expect(tagKey('italian')).toBe('italian');
    expect(tagKey('  ITALIAN ')).toBe('italian');
    expect(tagKey('Café')).toBe(tagKey('cafe'));
  });

  it('treats a hyphen and a space as the same separator', () => {
    expect(tagKey('pan-Asian')).toBe(tagKey('pan asian'));
  });
});

describe('canonicaliseTag', () => {
  it('returns the normalised form, not a display label', () => {
    // The stored value is `normalise()`'s output so that the application and the database agree on
    // what "the same tag" means. Prettiness is `tagDisplayLabel`'s job.
    expect(canonicaliseTag('Matcha')).toBe('matcha');
    expect(canonicaliseTag('Hidden Gem')).toBe('hidden gem');
    expect(canonicaliseTag('ITALIAN')).toBe('italian');
  });

  it('folds the two spellings the database would otherwise keep apart', () => {
    // `normalize_tag()` in the database lowercases and trims but does not fold punctuation or
    // accents, so `pan-asian` and `pan asian` would be two rows in the column the filter chips
    // read. Folding here is what stops the tag vocabulary fragmenting.
    expect(canonicaliseTag('Pan-Asian')).toBe(canonicaliseTag('pan asian'));
    expect(canonicaliseTag('Café')).toBe(canonicaliseTag('cafe'));
  });

  it('is idempotent, so the stored value is already its own key', () => {
    const once = canonicaliseTag('Pan-Asian');
    expect(once).not.toBeNull();
    expect(canonicaliseTag(once as string)).toBe(once);
    expect(tagKey(once as string)).toBe(once);
  });

  it('strips a leading hash or at-sign the model sometimes prefixes', () => {
    expect(canonicaliseTag('#matcha')).toBe('matcha');
  });

  it('collapses internal whitespace', () => {
    expect(canonicaliseTag('natural   wine')).toBe('natural wine');
  });

  it('rejects a label that is only filler', () => {
    expect(canonicaliseTag('food')).toBeNull();
    expect(canonicaliseTag('the best')).toBeNull();
    expect(canonicaliseTag('restaurants')).toBeNull();
  });

  it('rejects a label outside the length bounds', () => {
    expect(canonicaliseTag('a')).toBeNull();
    expect(canonicaliseTag('a very long descriptive phrase that is really a sentence')).toBeNull();
  });

  it('rejects a label with no letters or digits at all', () => {
    expect(canonicaliseTag('✨✨')).toBeNull();
  });

  it('keeps a compound tag whole rather than stripping its second word', () => {
    // Regression. An earlier version stripped a "redundant" trailing `food`/`cuisine` so
    // `Italian food` would merge with `Italian`. Measured against real model output it turned
    // `Street food` into `Street`, and by the same rule `Comfort food` into `Comfort` — the head
    // word is only redundant when it happens to be a cuisine, and telling those apart needs the
    // closed vocabulary this feature exists to escape.
    expect(canonicaliseTag('Street food')).toBe('street food');
    expect(canonicaliseTag('Comfort food')).toBe('comfort food');
  });

  it('leaves a script without case untouched', () => {
    expect(canonicaliseTag('סביח')).toBe('סביח');
  });
});

describe('tagDisplayLabel', () => {
  it('title-cases a stored tag for rendering only', () => {
    expect(tagDisplayLabel('italian')).toBe('Italian');
    expect(tagDisplayLabel('hidden gem')).toBe('Hidden Gem');
  });

  it('is lossy about acronyms and punctuation, which is the cost of one identity function', () => {
    // Stated as a test rather than a comment so the trade-off is visible if someone tries to fix
    // it by changing what gets stored.
    expect(tagDisplayLabel(canonicaliseTag('BBQ') as string)).toBe('Bbq');
    expect(tagDisplayLabel(canonicaliseTag('pan-Asian') as string)).toBe('Pan Asian');
  });

  it('never changes what a tag is', () => {
    expect(tagKey(tagDisplayLabel('pan asian'))).toBe('pan asian');
  });
});

describe('canonicaliseTags', () => {
  it('de-duplicates every spelling onto one stored tag', () => {
    expect(canonicaliseTags(['Italian', 'italian', 'ITALIAN'])).toEqual(['italian']);
  });

  it('folds two runs of the same caption onto identical tags', () => {
    // Real output: run 1 of the London caption produced `Market Stall`/`Hotel Restaurant`, run 2
    // produced `Market stall`/`Hotel restaurant`. Consistency across imports is the whole point of
    // the field, so it cannot depend on which casing the model felt like this time.
    expect(canonicaliseTags(['Market Stall', 'Hotel Restaurant'])).toEqual(
      canonicaliseTags(['Market stall', 'Hotel restaurant']),
    );
  });

  it('drops a tag that only repeats the place name', () => {
    expect(canonicaliseTags(['La Nonna', 'Italian'], { names: ['La Nonna'] })).toEqual(['italian']);
  });

  it('drops a tag that only repeats the category hint', () => {
    expect(canonicaliseTags(['Restaurant', 'Greek'], { categoryHint: 'restaurant' })).toEqual(['greek']);
  });

  it('ignores a null name or category in the exclusions', () => {
    expect(canonicaliseTags(['Greek'], { names: [null], categoryHint: null })).toEqual(['greek']);
  });

  it('caps the list', () => {
    const many = ['Italian', 'Greek', 'Nepalese', 'Matcha', 'Rooftop', 'Vegan', 'Kosher'];
    expect(canonicaliseTags(many)).toHaveLength(MAX_TAGS_PER_CANDIDATE);
  });

  it('returns an empty list for an empty input, not a placeholder', () => {
    expect(canonicaliseTags([])).toEqual([]);
  });
});

/**
 * Characters that are letters to Unicode and blank to a human. A tag made of these would be a
 * permanent, unclickable, invisible filter chip in someone's library, minted from a caption.
 */
describe('canonicaliseTag — invisible and expanding characters', () => {
  it('rejects a tag with no visible character', () => {
    // U+3164 HANGUL FILLER, U+115F HANGUL CHOSEONG FILLER, U+FFA0 HALFWIDTH HANGUL FILLER. All
    // category `Lo`, so `\p{L}` and the database's `[[:alnum:]]` both consider them letters.
    expect(canonicaliseTag('ㅤㅤㅤ')).toBeNull();
    expect(canonicaliseTag('ᅟᅠ')).toBeNull();
    expect(canonicaliseTag('ﾠﾠ')).toBeNull();
    // The Khmer inherent vowels are invisible too, but they are category `Mn`, so `normalise()`'s
    // existing mark strip already handles them — asserted so that stays true.
    expect(canonicaliseTag('឴឵')).toBeNull();
  });

  it('keeps the visible part of a tag padded with invisible letters', () => {
    // Stripping rather than rejecting: `italian` with a filler stuck on is still the tag `italian`,
    // and must land on the same key as a clean one or it fragments the vocabulary.
    expect(canonicaliseTag('italianㅤ')).toBe('italian');
    expect(canonicaliseTag('ㅤitalian')).toBe(canonicaliseTag('italian'));
  });

  it('does not let a variation selector mint a second copy of one tag', () => {
    // `normalise()` strips every non-spacing mark, which is what closes this one — two visually
    // identical tags must not be two rows.
    expect(canonicaliseTags(['italian', 'italian️'])).toEqual(['italian']);
  });

  it('does not let a zero-width space mint a second copy of one tag', () => {
    expect(canonicaliseTags(['hidden gem', 'hidden​ gem'])).toEqual(['hidden gem']);
  });

  it('drops a tag whose stored form exceeds the bound, rather than truncating it', () => {
    // Bounded on the value that is actually stored, not on the raw string: `normalise()` is
    // NFKD-based and can expand where NFKC does not, so "the raw string fits" is not enough.
    const tag = 'ﬄ'.repeat(12);
    expect(tag.length).toBeLessThanOrEqual(28);
    expect(canonicaliseTag(tag)).toBeNull();
  });
});

describe('canonicaliseTag — agreement with the database normaliser', () => {
  it('produces a form the database will not change', () => {
    // `normalise()` is NFKD-based and decomposes `한식` into six jamo; the column normalises to
    // NFKC and recomposes them into two syllables. Without the NFKC pass the application and the
    // column hold different strings for one tag. Brute-forced over every non-surrogate code point:
    // `normalise(x)` fails this for 11,209 of them, `normalise(x).normalize('NFKC')` for none.
    const tag = canonicaliseTag('한식');
    expect(tag).not.toBeNull();
    expect((tag as string).normalize('NFKC')).toBe(tag);
    expect((tag as string).length).toBe(2);
  });

  it('is idempotent, so the stored value is already its own key', () => {
    for (const raw of ['Pan-Asian', '한식', 'Café', 'hidden gem', 'סביח']) {
      const once = canonicaliseTag(raw);
      expect(once).not.toBeNull();
      expect(canonicaliseTag(once as string)).toBe(once);
      expect(tagKey(once as string)).toBe(once);
    }
  });

  it('still folds every spelling of a Latin tag onto one key', () => {
    // The NFKC pass must not undo the accent folding `normalise()` does.
    expect(canonicaliseTag('Café')).toBe(canonicaliseTag('cafe'));
    expect(canonicaliseTag('Pan-Asian')).toBe(canonicaliseTag('pan asian'));
  });
});
