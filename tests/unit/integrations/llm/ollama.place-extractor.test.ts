import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { ollamaPlaceExtractor, ollamaExtractorVersion } from '@/integrations/llm/ollama.place-extractor';

function ctx(events: { name: string; fields: Record<string, unknown> }[] = []): OpCtx {
  return {
    signal: new AbortController().signal,
    importId: null,
    log: {
      event(name, fields) {
        events.push({ name, fields });
      },
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function chatResponse(candidateJson: unknown, counts = { prompt_eval_count: 300, eval_count: 40 }) {
  return jsonResponse({
    message: { role: 'assistant', content: JSON.stringify(candidateJson) },
    ...counts,
  });
}

describe('ollamaPlaceExtractor', () => {
  it('returns schema-valid candidates parsed from the chat response body', async () => {
    const fetchImpl = async () =>
      chatResponse({
        candidates: [
          {
            rawName: 'Cafe Fiori',
            cityHint: null,
            countryHint: null,
            categoryHint: null,
            evidence: 'Cafe Fiori was great',
            modelConfidence: null,
          },
        ],
        cityHint: null,
      });
    const extractor = ollamaPlaceExtractor({ model: 'llama3.2:3b', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'Cafe Fiori was great', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rawName).toBe('Cafe Fiori');
  });

  it('returns zero candidates cleanly for a caption naming no place', async () => {
    const fetchImpl = async () => chatResponse({ candidates: [], cityHint: null });
    const extractor = ollamaPlaceExtractor({ model: 'llama3.2:3b', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'no place named here', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toEqual([]);
  });

  it('logs zero-cost, token-counted usage — the documented proxy for a local model', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      chatResponse({ candidates: [], cityHint: null }, { prompt_eval_count: 500, eval_count: 20 });
    const extractor = ollamaPlaceExtractor({ model: 'llama3.2:3b', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events));

    const costEvent = events.find((e) => e.name === 'extraction.cost');
    expect(costEvent?.fields.costModel).toBe('zero-cost-local');
    expect(costEvent?.fields.costUsd).toBe(0);
    expect(costEvent?.fields.inputTokens).toBe(500);
    expect(costEvent?.fields.outputTokens).toBe(20);
  });

  it('throws EXTRACTOR_UNAVAILABLE when the local daemon is unreachable', async () => {
    const fetchImpl = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    };
    const extractor = ollamaPlaceExtractor({ model: 'llama3.2:3b', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });

  it('throws EXTRACTOR_INVALID_OUTPUT when the model reply is not valid JSON', async () => {
    const fetchImpl = async () =>
      jsonResponse({ message: { role: 'assistant', content: 'not json at all' } });
    const extractor = ollamaPlaceExtractor({ model: 'llama3.2:3b', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });
  });

  it('versions itself per local model so two local models are two cache keys', () => {
    expect(ollamaExtractorVersion('llama3.2:3b')).toBe('2026-08-ollama-llama3.2:3b');
    expect(ollamaExtractorVersion('qwen2.5:7b')).not.toBe(ollamaExtractorVersion('llama3.2:3b'));
  });
});
