import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import type { PlaceCandidate } from '@/domain/types';
import { EXTRACTION_JSON_SCHEMA } from '@/integrations/llm/json-schema';
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
            addressHint: null,
            evidence: 'Cafe Fiori was great',
            modelConfidence: null,
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
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: 'Cafe Fiori was great', origin: 'tiktok-oembed-title' }],
      ctx(),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rawName).toBe('Cafe Fiori');
    expect(capturedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect((capturedInit?.headers as Record<string, string>)?.['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeDefined();
  });

  it('caps the candidates array at the measured Gemini schema limit', () => {
    // Not a product decision. The endpoint answers `400 INVALID_ARGUMENT` with no detail when it
    // considers the schema too large, and with the v2 thirteen-property item it does so at
    // `maxItems` 9 and above (bisected live, 2026-08-27; see the adapter's `GEMINI_MAX_CANDIDATES`
    // comment). This assertion is the reminder to re-measure rather than nudge the number.
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return generateContentResponse({ candidates: [], cityHint: null });
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch });
    return extractor
      .extract([{ kind: 'caption', text: 'nothing here', origin: 'tiktok-oembed-title' }], ctx())
      .then(() => {
        const body = JSON.parse(capturedInit?.body as string);
        expect(body.generationConfig.responseSchema.properties.candidates.maxItems).toBe(8);
        // The shared schema is untouched — the cap is applied at call time, for this vendor only.
        expect(EXTRACTION_JSON_SCHEMA.properties.candidates.maxItems).toBe(12);
      });
  });

  it('carries the v2 enrichment fields through to the caller', async () => {
    const fetchImpl = async () =>
      generateContentResponse({
        candidates: [
          {
            rawName: 'La Nonna',
            cityHint: 'London',
            countryHint: null,
            areaHint: 'Market Row, Brixton',
            categoryHint: 'restaurant',
            addressHint: null,
            evidence: 'La Nonna in Market Row, Brixton',
            modelConfidence: 0.9,
            identifiedName: 'La Nonna',
            nameVariants: [],
            tags: ['italian', 'Italian', 'restaurant'],
            dishes: ['artisan pasta', 'a twelve-course tasting menu'],
            whyGo: { text: 'Artisan pasta in a Brixton market hall.', groundedIn: 'delicious artisan pasta' },
            coordinates: null,
          },
        ],
        cityHint: 'London',
      });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [
        {
          kind: 'caption',
          text: 'La Nonna in Market Row, Brixton for delicious artisan pasta',
          origin: 'tiktok-oembed-title',
        },
      ],
      ctx(),
    );

    const candidate = result.candidates[0] as unknown as PlaceCandidate;
    expect(candidate.areaHint).toBe('Market Row, Brixton');
    // Canonicalised and de-duplicated on the way through, and the category echo dropped.
    expect(candidate.tags).toEqual(['italian']);
    // The dish the caption does not name is gone; the one it names survives.
    expect(candidate.dishes).toEqual(['artisan pasta']);
    expect(candidate.whyGo?.text).toBe('Artisan pasta in a Brixton market hall.');
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

  it('logs unmeasured cost — no published price sheet for the hosted model yet', async () => {
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

  it('versions itself per hosted model, defaulting to the hosted flash-lite model', () => {
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('gemini-3.5-flash-lite')).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('other-model')).not.toBe(geminiExtractorVersion('gemini-3.5-flash-lite'));
  });
});
