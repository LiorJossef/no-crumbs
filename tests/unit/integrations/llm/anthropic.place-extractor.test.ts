import { describe, expect, it } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import { anthropicPlaceExtractor } from '@/integrations/llm/anthropic.place-extractor';
import { MAX_OUTPUT_TOKENS } from '@/integrations/llm/json-schema';

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

function toolUseResponse(
  input: unknown,
  usage = { input_tokens: 1200, output_tokens: 100 },
  stopReason: string = 'tool_use',
) {
  return jsonResponse({
    content: [{ type: 'tool_use', name: 'record_place_candidates', input }],
    stop_reason: stopReason,
    usage,
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

  it('sends an output-token ceiling big enough for a full-length response', async () => {
    // Was 1024, against a fourteen-field candidate. The recorded five-candidate Hebrew response in
    // the corpus estimates at 1,177-1,453 output tokens, so 1024 was already being overrun by real
    // input. The number and its arithmetic live on `MAX_OUTPUT_TOKENS`; this pins that the adapter
    // actually sends it, because a ceiling nobody sends is the defect we started from.
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return toolUseResponse({ candidates: [], cityHint: null });
    };
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx());

    expect(capturedBody?.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThan(1024);
  });

  it('fails a truncated response instead of returning the candidates that survived the cut', async () => {
    // The point of reading `stop_reason`. The tool input here is perfectly valid — it is just not
    // all of it — so without this check the adapter would return one candidate and nothing would
    // ever say that the model had more to add.
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse(
        { candidates: [candidate('Cafe Fiori', 'Cafe Fiori')], cityHint: null },
        { input_tokens: 1200, output_tokens: 8192 },
        'max_tokens',
      );
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'Cafe Fiori', origin: 'tiktok-oembed-title' }], ctx(events)),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });

    expect(events.find((e) => e.name === 'extraction.stopped')?.fields).toMatchObject({
      cause: 'truncated',
      reason: 'max_tokens',
      outputTokens: 8192,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  });

  it('distinguishes a refusal from a truncation and from malformed output', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse({ candidates: [], cityHint: null }, { input_tokens: 1200, output_tokens: 4 }, 'refusal');
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await expect(
      extractor.extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events)),
    ).rejects.toMatchObject({ code: 'EXTRACTOR_INVALID_OUTPUT' });

    expect(events.find((e) => e.name === 'extraction.stopped')?.fields.cause).toBe('refused');
  });

  it('still bills for a call that stopped badly', async () => {
    // A truncated call is a paid call. Logging cost only on success would under-report what
    // extraction costs, which is the one number this project refuses to assume.
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse({ candidates: [], cityHint: null }, { input_tokens: 4000, output_tokens: 8192 }, 'max_tokens');
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor
      .extract([{ kind: 'caption', text: 'anything', origin: 'tiktok-oembed-title' }], ctx(events))
      .catch(() => undefined);

    expect(events.find((e) => e.name === 'extraction.cost')?.fields.outputTokens).toBe(8192);
  });

  it('keeps the valid candidates when one of them is malformed, and logs the ones it dropped', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse({
        candidates: [
          candidate('Cafe Fiori', 'Cafe Fiori was unreal'),
          { rawName: 'x' },
          candidate('Anat Bakery', 'Anat Bakery next door'),
        ],
        cityHint: null,
      });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

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

  it('says nothing about dropped candidates when none were dropped', async () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const fetchImpl = async () =>
      toolUseResponse({ candidates: [candidate('Cafe Fiori', 'Cafe Fiori')], cityHint: null });
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    await extractor.extract([{ kind: 'caption', text: 'Cafe Fiori', origin: 'tiktok-oembed-title' }], ctx(events));

    expect(events.find((e) => e.name === 'extraction.candidates_dropped')).toBeUndefined();
  });

  it('carries a stable version and the current prompt version', () => {
    const extractor = anthropicPlaceExtractor({ apiKey: 'test-key' });
    expect(extractor.version).toBe('2026-08-anthropic-haiku-4-5');
    expect(extractor.promptVersion).toBe('p13-s4');
  });
});
