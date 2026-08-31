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

  it('throws EXTRACTOR_UNAVAILABLE on a non-OK HTTP response that is not a quota refusal', async () => {
    const fetchImpl = async () => jsonResponse({ error: 'upstream is unwell' }, 500);
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_UNAVAILABLE' });
  });

  it('throws EXTRACTOR_QUOTA_EXHAUSTED on 429, because a retry cannot clear the day’s budget', async () => {
    // This test used to send 429 and assert `EXTRACTOR_UNAVAILABLE`, whose copy offers a retry.
    // Gemini's 429 is the shared daily budget gone, so that retry fails identically every time —
    // the product was offering a button it could not honour. `fd40c2f` changed the behaviour and
    // this assertion had been left behind at HEAD.
    //
    // **`anthropic.place-extractor.ts` must not gain this branch.** Its 429 is a short per-minute
    // limit a retry genuinely clears. Same status code, opposite meaning.
    const fetchImpl = async () => jsonResponse({ error: 'rate limited' }, 429);
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx()),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_QUOTA_EXHAUSTED' });
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

  it('logs an over-long reply as truncation, which is not the same fact as a drop', async () => {
    // `growth-plan.md` G2's other half. Thirteen valid candidates now yield twelve places instead
    // of none, and the thirteenth is a fact about the model's reply that nothing downstream can
    // carry — `PlaceExtractor` returns candidates and a `cityHint` — so this line is where it
    // lives. It must not arrive as `candidates_dropped`: nothing here was malformed.
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const names = Array.from({ length: 13 }, (_, i) => `Cafe Number ${i}`);
    const fetchImpl = async () =>
      generateContentResponse({ candidates: names.map((name) => candidate(name, name)), cityHint: null });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const result = await extractor.extract(
      [{ kind: 'caption', text: names.join(', '), origin: 'tiktok-oembed-title' }],
      ctx(events),
    );

    expect(result.candidates).toHaveLength(12);
    expect(events.find((e) => e.name === 'extraction.candidates_truncated')?.fields).toMatchObject({
      cap: 12,
      truncated: 1,
      kept: 12,
      total: 13,
    });
    expect(events.find((e) => e.name === 'extraction.candidates_dropped')).toBeUndefined();
  });

  it('says nothing about truncation when the reply fits the cap', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () => generateContentResponse({ candidates: [candidate('Cafe Fiori', 'Cafe Fiori')], cityHint: null });
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'Cafe Fiori', origin: 'tiktok-oembed-title' }], ctx(events));

    expect(events.find((e) => e.name === 'extraction.candidates_truncated')).toBeUndefined();
  });

  it('versions itself per hosted model, defaulting to the hosted flash-lite model', () => {
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('gemini-3.5-flash-lite')).toBe('2026-08-gemini-gemini-3.5-flash-lite');
    expect(geminiExtractorVersion('other-model')).not.toBe(geminiExtractorVersion('gemini-3.5-flash-lite'));
  });
});

/**
 * `postIntent` (v5, E2-T3) at the adapter seam. What is tested here is that the value crosses the
 * boundary untouched and that it never touches the candidates — not that the model classifies
 * correctly, which is unmeasured and needs a live run against a labelled set.
 */
describe('geminiPlaceExtractor — postIntent', () => {
  async function extractWith(body: Record<string, unknown>, caption = 'Cafe Fiori was great') {
    const fetchImpl = async () => generateContentResponse(body);
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });
    return extractor.extract([{ kind: 'caption', text: caption, origin: 'tiktok-oembed-title' }], ctx());
  }

  it('returns the model\'s postIntent unchanged', async () => {
    const result = await extractWith({
      candidates: [candidate('Cafe Fiori', 'Cafe Fiori was great')],
      cityHint: null,
      postIntent: 'place_recommendation',
    });
    expect(result.postIntent).toBe('place_recommendation');
    expect(result.candidates.map((c: PlaceCandidate) => c.rawName)).toEqual(['Cafe Fiori']);
  });

  it('returns place_recommendation with zero candidates — the case the field exists for', async () => {
    // A caption that names nothing under a video recommending real venues out loud. This is the
    // ~73% no-place import that is NOT a dead end, and before this field nothing could say so.
    const result = await extractWith({ candidates: [], cityHint: null, postIntent: 'place_recommendation' });
    expect(result.candidates).toEqual([]);
    expect(result.postIntent).toBe('place_recommendation');
  });

  it('returns null when the reply omits postIntent, and still returns the candidates', async () => {
    // A `p14`-shaped reply, or a model that simply dropped the key. Neither may cost the caption
    // its places.
    const result = await extractWith({
      candidates: [candidate('Cafe Fiori', 'Cafe Fiori was great')],
      cityHint: null,
    });
    expect(result.postIntent).toBeNull();
    expect(result.candidates.map((c: PlaceCandidate) => c.rawName)).toEqual(['Cafe Fiori']);
  });

  it('returns null for an unrecognised value rather than failing the extraction', async () => {
    const result = await extractWith({
      candidates: [candidate('Cafe Fiori', 'Cafe Fiori was great')],
      cityHint: null,
      postIntent: 'food_review',
    });
    expect(result.postIntent).toBeNull();
    expect(result.candidates).toHaveLength(1);
  });

  it('keeps two real venues on a reply the model labelled not_a_place', async () => {
    // Constraint 1 at the seam: this field may only ever add an explanation. A wrong
    // classification must cost a slightly-off sentence, never a place.
    const result = await extractWith({
      candidates: [candidate('Cafe Fiori', 'Cafe Fiori'), candidate('Kohi', 'Kohi')],
      cityHint: null,
      postIntent: 'not_a_place',
    }, 'Cafe Fiori and Kohi, both great');
    expect(result.candidates.map((c: PlaceCandidate) => c.rawName)).toEqual(['Cafe Fiori', 'Kohi']);
    expect(result.postIntent).toBe('not_a_place');
  });

  it('sends postIntent in the responseSchema, with null stripped from the enum for Gemini', async () => {
    // Gemini's `responseSchema` takes a restricted OpenAPI subset: `type: ['string','null']`
    // becomes `type: 'string', nullable: true`, and a `null` enum member is not legal there.
    // `toGeminiSchema` does that conversion, and this asserts the new field went through it.
    let capturedInit: RequestInit | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return generateContentResponse({ candidates: [], cityHint: null, postIntent: null });
    };
    const extractor = geminiPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });
    await extractor.extract([{ kind: 'caption', text: 'a cat', origin: 'tiktok-oembed-title' }], ctx());

    const body = JSON.parse(capturedInit?.body as string);
    const sent = body.generationConfig.responseSchema.properties.postIntent;
    expect(sent.type).toBe('string');
    expect(sent.nullable).toBe(true);
    expect(sent.enum).toEqual(['place_recommendation', 'place_question', 'not_a_place']);
    expect(body.generationConfig.responseSchema.required).toContain('postIntent');
  });
});
