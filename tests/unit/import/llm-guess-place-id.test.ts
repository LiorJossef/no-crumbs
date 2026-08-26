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
    expect(firstRun).toContain('kiaans tooting');
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
