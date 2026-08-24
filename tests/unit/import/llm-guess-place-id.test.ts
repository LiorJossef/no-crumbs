import { describe, expect, it } from 'vitest';

import { llmGuessProviderPlaceId } from '@/domain/import/llm-guess-place-id';

describe('llmGuessProviderPlaceId', () => {
  it('is deterministic for the same candidate — repeat paste of the same TikTok converges on one id', () => {
    const candidate = {
      rawName: 'Anat Bakery',
      identifiedName: null,
      cityHint: 'Tel Aviv',
      countryHint: 'IL',
    };

    expect(llmGuessProviderPlaceId(candidate)).toBe(llmGuessProviderPlaceId({ ...candidate }));
  });

  it('prefers identifiedName over rawName, matching what the save path sends as the place name', () => {
    const withIdentified = llmGuessProviderPlaceId({
      rawName: 'Paradiso',
      identifiedName: 'Paradiso Matcha Bar',
      cityHint: 'Prague',
      countryHint: 'CZ',
    });
    const rawNameOnly = llmGuessProviderPlaceId({
      rawName: 'Paradiso Matcha Bar',
      identifiedName: null,
      cityHint: 'Prague',
      countryHint: 'CZ',
    });

    expect(withIdentified).toBe(rawNameOnly);
  });

  it('differs for different names, cities or countries', () => {
    const base = { rawName: 'Container', identifiedName: null, cityHint: 'Tel Aviv', countryHint: 'IL' };

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
      identifiedName: null,
      cityHint: null,
      countryHint: null,
    });

    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.length).toBeGreaterThan(0);
  });
});
