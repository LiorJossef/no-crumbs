import { describe, expect, it } from 'vitest';

import { MAX_CANDIDATES } from '@/domain/import/pipeline';
import type { OpCtx } from '@/domain/ports';
import type { PlaceCandidate } from '@/domain/types';
import { EXTRACTION_JSON_SCHEMA, MAX_OUTPUT_TOKENS } from '@/integrations/llm/json-schema';
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
  finishReason: string = 'STOP',
) {
  return jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(candidateJson) }] }, finishReason }],
    usageMetadata,
  });
}

/** One schema-valid candidate, so a test can talk about *which* candidates survive. */
function candidate(rawName: string, evidence: string) {
  return {
    rawName,
    cityHint: null,
    countryHint: null,
    areaHint: null,
    categoryHint: null,
    addressHint: null,
    evidence,
    modelConfidence: null,
    identifiedName: null,
    nameVariants: [],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
  };
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
        // Since 2026-08-31 (growth-plan G3) the pipeline's own cap is this same 8, so the two meet
        // exactly and nothing absorbs a change to either: a lower model cap silently loses a place
        // the pipeline would have resolved, a higher one is a live re-bisection. Asserted as an
        // equality rather than two separate numbers, because the agreement is the invariant.
        expect(body.generationConfig.responseSchema.properties.candidates.maxItems).toBe(MAX_CANDIDATES);
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

  it('sends the same explicit output-token ceiling as the other adapter', async () => {
    // Gemini set no `maxOutputTokens` at all, so it inherited a model default we neither control
    // nor see. Two adapters truncating at different, unstated points makes every cross-adapter
    // comparison a comparison of two budgets.
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return generateContentResponse({ candidates: [], cityHint: null });
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx());

    const body = JSON.parse(capturedInit?.body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it('fails a truncated response instead of returning the candidates that survived the cut', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      generateContentResponse(
        { candidates: [candidate('Cafe Fiori', 'Cafe Fiori')], cityHint: null },
        { promptTokenCount: 4000, candidatesTokenCount: 8192 },
        'MAX_TOKENS',
      );
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'Cafe Fiori', origin: 'tiktok-oembed-title' }], ctx(events)),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });

    expect(events.find((e) => e.name === 'extraction.stopped')?.fields).toMatchObject({
      cause: 'truncated',
      reason: 'MAX_TOKENS',
      outputTokens: 8192,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  });

  it('reports a safety stop as a refusal, not as malformed output', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      generateContentResponse({ candidates: [], cityHint: null }, { promptTokenCount: 300, candidatesTokenCount: 0 }, 'SAFETY');
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events)),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });

    expect(events.find((e) => e.name === 'extraction.stopped')?.fields.cause).toBe('refused');
  });

  it('reports a blocked prompt as a refusal rather than as "no text part"', async () => {
    // A blocked prompt returns no candidate at all, so the old code reached "response contained no
    // text part" — the symptom, not the cause.
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events)),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });

    expect(events.find((e) => e.name === 'extraction.stopped')?.fields).toMatchObject({
      cause: 'refused',
      reason: 'prompt_SAFETY',
    });
  });

  it('keeps the valid candidates when one of them is malformed, and logs the ones it dropped', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      generateContentResponse({
        candidates: [
          candidate('Cafe Fiori', 'Cafe Fiori was unreal'),
          { rawName: 'x' },
          candidate('Anat Bakery', 'Anat Bakery next door'),
        ],
        cityHint: null,
      });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [
        {
          kind: 'caption',
          text: 'Cafe Fiori was unreal, and Anat Bakery next door',
          origin: 'tiktok-oembed-title',
        },
      ],
      ctx(events),
    );

    expect(result.candidates.map((c) => c.rawName)).toEqual(['Cafe Fiori', 'Anat Bakery']);
    expect(events.find((e) => e.name === 'extraction.candidates_dropped')?.fields).toMatchObject({
      reason: 'schema_invalid',
      dropped: 1,
      kept: 2,
      total: 3,
    });
  });

  it('versions itself per hosted model, defaulting to the hosted flash-lite model', () => {
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('gemini-3.5-flash-lite')).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('other-model')).not.toBe(geminiExtractorVersion('gemini-3.5-flash-lite'));
  });
});
