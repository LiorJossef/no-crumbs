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

/**
 * `p13` (L0-TRANSCRIPT-T5). Measured on @maygilboa's `7606044724532612370`: the transcript says, in
 * Hebrew, "the place is called Bar Kafe", the caption names no venue, and extraction returned a
 * city hint and zero candidates. The adapter flattened the parts into one unlabelled string and the
 * prompt called that string a caption.
 */
describe('geminiPlaceExtractor — a transcript is a source, not padding', () => {
  const CAPTION = 'יום מושלם בתל אביב ☀️';
  const TRANSCRIPT = 'היינו במקום מטורף, המקום נקרא בר קפה, ממש ליד הים';
  const PARTS = [
    { kind: 'caption', text: CAPTION, origin: 'tiktok-oembed-title' },
    { kind: 'transcript', text: TRANSCRIPT, origin: 'gemini-transcriber' },
  ] as const;

  /** What the model returns having read the spoken part: name, quote and citation all from the
   *  transcript, nothing from the caption. */
  const HEARD = {
    rawName: 'בר קפה',
    cityHint: 'תל אביב',
    countryHint: 'Israel',
    areaHint: null,
    categoryHint: 'cafe',
    addressHint: null,
    evidence: 'המקום נקרא בר קפה',
    modelConfidence: 0.8,
    identifiedName: null,
    nameVariants: ['Bar Kafe'],
    tags: [],
    dishes: [],
    whyGo: { text: 'A seafront spot the creator describes as right by the water.', groundedIn: 'ממש ליד הים' },
    coordinates: null,
  };

  it('shows the model both parts, each under its own kind', async () => {
    let sent = '';
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(init?.body as string).contents[0].parts[0].text as string;
      return generateContentResponse({ candidates: [], cityHint: null });
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract(PARTS, ctx());

    expect(sent).toContain('CAPTION — what the creator wrote');
    expect(sent).toContain('TRANSCRIPT — what a speech-to-text model heard');
    expect(sent).toContain(CAPTION);
    expect(sent).toContain(TRANSCRIPT);
  });

  it('keeps a candidate whose only evidence is in the transcript', async () => {
    // The caption names nothing. Everything backing this candidate — the name, the quote and the
    // `whyGo` citation — was spoken, and the plausibility and grounding gates have to find it.
    const fetchImpl = async () =>
      generateContentResponse({
        candidates: [
          HEARD,
        ],
        cityHint: 'תל אביב',
      });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(PARTS, ctx());

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rawName).toBe('בר קפה');
    expect(result.candidates[0]?.evidence).toBe('המקום נקרא בר קפה');
    expect(result.candidates[0]?.whyGo?.groundedIn).toBe('ממש ליד הים');
  });

  it('still drops a candidate quoting something neither part says', async () => {
    // The relaxation is "the transcript counts too", not "the evidence gate is off".
    const fetchImpl = async () =>
      generateContentResponse({
        candidates: [
          {
            ...HEARD,
            rawName: 'Invented Bistro',
            evidence: 'we loved Invented Bistro',
            whyGo: null,
          },
        ],
        cityHint: 'תל אביב',
      });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(PARTS, ctx());

    expect(result.candidates).toEqual([]);
  });
});
