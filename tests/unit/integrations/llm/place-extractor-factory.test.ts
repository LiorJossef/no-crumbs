import { describe, expect, it } from 'vitest';

import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';

describe('createPlaceExtractor', () => {
  it('selects the Anthropic hosted adapter by default', () => {
    const extractor = createPlaceExtractor({ ANTHROPIC_API_KEY: 'test-key' });
    expect(extractor.version).toBe('2026-08-anthropic-haiku-4-5');
  });

  it('selects the Anthropic hosted adapter when LLM_PROVIDER=anthropic', () => {
    const extractor = createPlaceExtractor({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' });
    expect(extractor.version).toBe('2026-08-anthropic-haiku-4-5');
  });

  it('selects the Gemini hosted adapter when LLM_PROVIDER=gemini', () => {
    const extractor = createPlaceExtractor({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' });
    expect(extractor.version).toBe('2026-08-gemini-gemini-2.5-flash');
  });

  it('honours GEMINI_MODEL when LLM_PROVIDER=gemini', () => {
    const extractor = createPlaceExtractor({
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemma-2b-it',
    });
    expect(extractor.version).toBe('2026-08-gemini-gemma-2b-it');
  });

  it('throws rather than silently falling back when Gemini is selected with no API key', () => {
    expect(() => createPlaceExtractor({ LLM_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('throws rather than silently falling back when Anthropic is selected with no API key', () => {
    expect(() => createPlaceExtractor({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws on an unrecognised provider rather than silently defaulting', () => {
    expect(() => createPlaceExtractor({ LLM_PROVIDER: 'openai' })).toThrow(/Unknown LLM_PROVIDER/);
  });
});
