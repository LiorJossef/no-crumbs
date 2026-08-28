import { describe, expect, it } from 'vitest';

import { llmGuessProviderPlaceId } from '@/domain/import/llm-guess-place-id';

describe('llmGuessProviderPlaceId', () => {
  it('is deterministic for the same candidate — repeat paste of the same TikTok converges on one id', () => {
    const candidate = {
      rawName: 'Anat Bakery',
      cityHint: 'Tel Aviv',
      countryHint: 'IL',
    };

    expect(llmGuessProviderPlaceId(candidate)).toBe(llmGuessProviderPlaceId({ ...candidate }));
  });

  // The regression this asserts was measured on a real import, not imagined: the same London
  // caption yielded `identifiedName: 'Kiaans'` on one run and `'Kiaans Tooting'` on the next, so
  // an identity keyed on that field minted a second `places` row for the same venue every time
  // the link was re-pasted. Identity keys on the caption-verbatim `rawName` instead.
  it('ignores identifiedName — the model re-identifies the same caption differently between runs', () => {
    const firstRun = llmGuessProviderPlaceId({
      rawName: 'Kiaans Tooting',
      cityHint: 'London',
      countryHint: 'United Kingdom',
    });
    const secondRun = llmGuessProviderPlaceId({
      rawName: 'Kiaans Tooting',
      cityHint: 'London',
      countryHint: 'United Kingdom',
    });

    expect(firstRun).toBe(secondRun);
    expect(firstRun).toContain('kiaanstooting');
  });

  it('differs for different names, cities or countries', () => {
    const base = { rawName: 'Container', cityHint: 'Tel Aviv', countryHint: 'IL' };

    expect(llmGuessProviderPlaceId(base)).not.toBe(
      llmGuessProviderPlaceId({ ...base, rawName: 'Container Bar' }),
    );
    expect(llmGuessProviderPlaceId(base)).not.toBe(
      llmGuessProviderPlaceId({ ...base, cityHint: 'Haifa' }),
    );
    expect(llmGuessProviderPlaceId(base)).not.toBe(
      llmGuessProviderPlaceId({ ...base, countryHint: null }),
    );
  });

  // Measured on the local database, 2026-08-28: `llm:hakosem|tel aviv|israel` and
  // `llm:ha kosem|tel aviv|israel` were two `place_provider_refs` rows, so two `places` rows, for
  // one venue — while `places.name_key` was the identical `hakosem` for both. The two points sit
  // ~570 m apart, so `resolve_place`'s 75 m near-duplicate guard could never have merged them.
  it('collapses a spelling that differs only in whitespace or punctuation', () => {
    const city = { cityHint: 'Tel Aviv', countryHint: 'Israel' };

    expect(llmGuessProviderPlaceId({ rawName: 'HaKosem', ...city })).toBe(
      llmGuessProviderPlaceId({ rawName: 'Ha Kosem', ...city }),
    );
    expect(llmGuessProviderPlaceId({ rawName: "Oscar's", ...city })).toBe(
      llmGuessProviderPlaceId({ rawName: 'Oscars', ...city }),
    );
    // The city hint is keyed the same way, so it cannot reintroduce the split on its own.
    expect(llmGuessProviderPlaceId({ rawName: 'HaKosem', cityHint: 'Tel Aviv', countryHint: 'IL' })).toBe(
      llmGuessProviderPlaceId({ rawName: 'HaKosem', cityHint: 'tel-aviv', countryHint: 'IL' }),
    );
  });

  // The deliberate limit of the rule above, and the reason it is not "strip trailing city words".
  // `Loveat` and `Loveat tel aviv` are four genuinely different branches in the Tel Aviv index,
  // the closest pair 522 m apart. A provider id carries no distance check at all, so collapsing a
  // whole word token would fuse two real venues into one row with nothing left to appeal to.
  it('keeps whole word tokens apart, even when they look like a locality', () => {
    const london = { cityHint: 'London', countryHint: 'United Kingdom' };

    expect(llmGuessProviderPlaceId({ rawName: 'Tokii', ...london })).not.toBe(
      llmGuessProviderPlaceId({ rawName: 'Tokii London', ...london }),
    );
    expect(
      llmGuessProviderPlaceId({ rawName: 'Loveat', cityHint: 'Tel Aviv', countryHint: 'IL' }),
    ).not.toBe(
      llmGuessProviderPlaceId({ rawName: 'Loveat Tel Aviv', cityHint: 'Tel Aviv', countryHint: 'IL' }),
    );
  });

  it('handles null cityHint/countryHint without throwing, and stays within the 200-char column cap', () => {
    const id = llmGuessProviderPlaceId({
      rawName: 'a'.repeat(300),
      cityHint: null,
      countryHint: null,
    });

    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.length).toBeGreaterThan(0);
  });
});
