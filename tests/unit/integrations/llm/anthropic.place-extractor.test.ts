import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { anthropicPlaceExtractor } from '@/integrations/llm/anthropic.place-extractor';

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

function toolUseResponse(input: unknown, usage = { input_tokens: 1200, output_tokens: 100 }) {
  return jsonResponse({
    content: [{ type: 'tool_use', name: 'record_place_candidates', input }],
    usage,
  });
}

describe('anthropicPlaceExtractor', () => {
  it('returns schema-valid candidates parsed from the forced tool call', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return toolUseResponse({
        candidates: [
          {
            rawName: 'Cafe Fiori',
            cityHint: 'Tel Aviv',
            countryHint: null,
            categoryHint: 'cafe',
            addressHint: null,
            evidence: 'Cafe Fiori was unreal',
            modelConfidence: 0.85,
            identifiedName: null,
            nameVariants: [],
            areaHint: null,
            tags: [],
            dishes: [],
            whyGo: null,
            coordinates: null,
          },
        ],
        cityHint: 'Tel Aviv',
      });
    };
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'Cafe Fiori was unreal, go now', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toEqual([
      {
        rawName: 'Cafe Fiori',
        cityHint: 'Tel Aviv',
        countryHint: null,
        categoryHint: 'cafe',
        addressHint: null,
        evidence: 'Cafe Fiori was unreal',
        modelConfidence: 0.85,
        identifiedName: null,
        nameVariants: [],
        areaHint: null,
        tags: [],
        dishes: [],
        whyGo: null,
        coordinates: null,
      },
    ]);
    expect(result.cityHint).toBe('Tel Aviv');
    // The caption is sent as untrusted data, never as an instruction outside the delimiter.
    expect(capturedBody?.tool_choice).toEqual({ type: 'tool', name: 'record_place_candidates' });
  });

  it('returns zero candidates cleanly for a caption naming no place — the modal outcome', async () => {
    const fetchImpl = async () => toolUseResponse({ candidates: [], cityHint: null });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'just a vibe check, no place named here', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toEqual([]);
    expect(result.cityHint).toBeNull();
  });

  it('drops a fabricated candidate whose evidence is not a substring of the caption', async () => {
    const fetchImpl = async () =>
      toolUseResponse({
        candidates: [
          {
            rawName: 'Invented Place',
            cityHint: null,
            countryHint: null,
            categoryHint: null,
            addressHint: null,
            evidence: 'a quote that never appears',
            modelConfidence: 0.4,
            identifiedName: null,
            nameVariants: [],
            areaHint: null,
            tags: [],
            dishes: [],
            whyGo: null,
            coordinates: null,
          },
        ],
        cityHint: null,
      });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'the real caption, unrelated to that quote', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toEqual([]);
  });

  it('logs measured per-call cost against real token usage', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse({ candidates: [], cityHint: null }, { input_tokens: 1200, output_tokens: 400 });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events));

    const costEvent = events.find((e) => e.name === 'extraction.cost');
    expect(costEvent).toBeDefined();
    expect(costEvent?.fields.costModel).toBe('measured');
    expect(costEvent?.fields.inputTokens).toBe(1200);
    expect(costEvent?.fields.outputTokens).toBe(400);
    // 1200 * $1/1M + 400 * $5/1M = $0.0012 + $0.002 = $0.0032 — the 09 §2.2 worst-case figure.
    expect(costEvent?.fields.costUsd as number).toBeCloseTo(0.0032, 6);
  });

  it('throws EXTRACTOR_UNAVAILABLE on a transport failure', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });

  it('throws EXTRACTOR_INVALID_OUTPUT when the tool input fails Zod validation', async () => {
    const fetchImpl = async () => toolUseResponse({ candidates: [{ rawName: 'x' }], cityHint: null });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });
  });

  it('carries a stable version and the current prompt version', () => {
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-anthropic-haiku-4-5');
    expect(extractor.promptVersion).toBe('p11-s3');
  });
});
