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

  it('selects the local Ollama adapter when LLM_PROVIDER=ollama, with no API key required', () => {
    const extractor = createPlaceExtractor({ LLM_PROVIDER: 'ollama', OLLAMA_MODEL: 'llama3.2:3b' });
    expect(extractor.version).toBe('2026-08-ollama-llama3.2:3b');
  });

  it('throws rather than silently falling back when Anthropic is selected with no API key', () => {
    expect(() => createPlaceExtractor({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws on an unrecognised provider rather than silently defaulting', () => {
    expect(() => createPlaceExtractor({ LLM_PROVIDER: 'openai' })).toThrow(/Unknown LLM_PROVIDER/);
  });
});
