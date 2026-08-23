import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { geminiPlaceExtractor, geminiExtractorVersion } from '@/integrations/llm/gemini.place-extractor';

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

function generateContentResponse(
  candidateJson: unknown,
  usageMetadata = { promptTokenCount: 300, candidatesTokenCount: 40 },
) {
  return jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(candidateJson) }] } }],
    usageMetadata,
  });
}

describe('geminiPlaceExtractor', () => {
  it('returns schema-valid candidates parsed from the generateContent response body', async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return generateContentResponse({
        candidates: [
          {
            rawName: 'Cafe Fiori',
            cityHint: null,
            countryHint: null,
            categoryHint: null,
            evidence: 'Cafe Fiori was great',
            modelConfidence: null,
            identifiedName: null,
          },
        ],
        cityHint: null,
      });
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'Cafe Fiori was great', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rawName).toBe('Cafe Fiori');
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent',
    );
    expect((capturedInit?.headers as Record<string, string>)?.['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeDefined();
  });

  it('returns zero candidates cleanly for a caption naming no place', async () => {
    const fetchImpl = async () => generateContentResponse({ candidates: [], cityHint: null });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'no place named here', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toEqual([]);
  });

  it('logs unmeasured cost — no published price sheet for hosted Gemma', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      generateContentResponse(
        { candidates: [], cityHint: null },
        { promptTokenCount: 500, candidatesTokenCount: 20 },
      );
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events));

    const costEvent = events.find((e) => e.name === 'extraction.cost');
    expect(costEvent?.fields.costModel).toBe('unmeasured');
    expect(costEvent?.fields.costUsd).toBe(0);
    expect(costEvent?.fields.inputTokens).toBe(500);
    expect(costEvent?.fields.outputTokens).toBe(20);
  });

  it('throws EXTRACTOR_UNAVAILABLE on a transport failure', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });

  it('throws EXTRACTOR_UNAVAILABLE on a non-OK HTTP response', async () => {
    const fetchImpl = async () => jsonResponse({ error: 'rate limited' }, 429);
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });

  it('throws EXTRACTOR_INVALID_OUTPUT when the response contains no text part', async () => {
    const fetchImpl = async () => jsonResponse({ candidates: [{ content: { parts: [] } }] });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });
  });

  it('throws EXTRACTOR_INVALID_OUTPUT when the model reply is not valid JSON', async () => {
    const fetchImpl = async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });
  });

  it('throws EXTRACTOR_INVALID_OUTPUT when the parsed JSON fails Zod validation', async () => {
    const fetchImpl = async () => generateContentResponse({ candidates: [{ rawName: 'x' }] });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });
  });

  it('versions itself per hosted model, defaulting to the hosted Gemma model', () => {
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-gemini-gemma-4-26b-a4b-it');
    expect(geminiExtractorVersion('gemma-4-26b-a4b-it')).toBe('2026-08-gemini-gemma-4-26b-a4b-it');
    expect(geminiExtractorVersion('other-model')).not.toBe(geminiExtractorVersion('gemma-4-26b-a4b-it'));
  });
});
