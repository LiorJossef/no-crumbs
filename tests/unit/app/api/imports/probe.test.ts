/**
 * Unit coverage for `POST /api/imports/probe`'s extraction branch added alongside the real
 * `PlaceExtractor` + `filterPlausible` wiring (`route.ts`'s header). Every vendor-facing seam is
 * mocked — auth, the service-role client, the oEmbed adapter, the caption extractor and the LLM
 * factory — so this test never depends on a live hosted-model call or a real Supabase project; the
 * owner's own manual, real-model pass against a live TikTok URL is the other half of this task's
 * verification, not something an automated test can stand in for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { extractorUnavailable, noCaption } from '@/domain/errors';
import type { PlaceCandidate } from '@/domain/types';

const VIDEO_URL = 'https://www.tiktok.com/@tlv.eats/video/7123456789012345678';

const FAKE_RAW_SOURCE = {
  /**
   * The `sources.id` uuid the adapter returns after upserting the row. The fixture was missing it
   * — the route has always echoed it back as `sourceId`, but nothing asserted that, so the gap was
   * invisible. It is load-bearing now: it is the foreign key on the persisted `extractions` row.
   */
  id: 'src-1',
  externalId: '7123456789012345678',
  authorHandle: 'tlv.eats',
  authorName: 'TLV Eats',
  canonicalUrl: VIDEO_URL,
  thumbnailUrl: null,
  fetchedAt: new Date('2026-01-01T00:00:00Z'),
};

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}));

/**
 * Records what the route writes, so persistence is asserted rather than assumed. The route now
 * writes two rows that used to be left behind on every real import — the `extractions` row (the
 * table had zero writers) and the `imports` row's terminal state (`start_import` opened it and
 * nothing ever updated it). Both are load-bearing: `extractionId` is what `/api/imports/confirm`
 * derives place facts from, so a silent persistence regression would take the security fix with it.
 */
const persisted = {
  extractions: [] as Record<string, unknown>[],
  importUpdates: [] as Record<string, unknown>[],
};

/**
 * What a cache read finds, if anything. The route consults `extractions` for the same
 * (source, model, prompt version) *before* calling the model — the read side that was missing when
 * the write side first shipped, which meant every re-paste re-paid for an answer we already had.
 * Default `null` = a miss, which is what most tests here want.
 */
let cachedExtractionRow: Record<string, unknown> | null = null;

function resetPersisted() {
  persisted.extractions.length = 0;
  persisted.importUpdates.length = 0;
  cachedExtractionRow = null;
}

vi.mock('@/integrations/supabase/service-role-client', () => ({
  serviceRoleClient: () => ({
    // `start_import` (0007, B7) is `returns table (...)`, so PostgREST hands back an array. The
    // route needs the id from it to advance the row it opened.
    rpc: async () => ({
      data: [
        {
          import_id: 'imp-1',
          import_source_id: 'src-1',
          import_status: 'processing',
          is_idempotent: false,
        },
      ],
      error: null,
    }),
    from: (table: string) => {
      if (table === 'extractions') {
        // `select(...).eq().eq().eq().maybeSingle()` is the cache read; `upsert(...)` is the write.
        const eqChain = {
          eq: () => eqChain,
          maybeSingle: async () => ({ data: cachedExtractionRow, error: null }),
        };
        return {
          select: () => eqChain,
          upsert: (row: Record<string, unknown>) => {
            persisted.extractions.push(row);
            return {
              select: () => ({ single: async () => ({ data: { id: 'ext-1' }, error: null }) }),
            };
          },
        };
      }
      if (table === 'imports') {
        return {
          update: (row: Record<string, unknown>) => {
            persisted.importUpdates.push(row);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/integrations/tiktok/oembed-source-adapter', () => ({
  oembedSourceAdapter: () => ({
    resolveShortLink: async () => ({ externalId: FAKE_RAW_SOURCE.externalId }),
    fetch: async () => FAKE_RAW_SOURCE,
  }),
  canonicalUrlFor: (externalId: string) => `https://www.tiktok.com/@_/video/${externalId}`,
}));

const captionExtractMock = vi.fn(async () => [
  { kind: 'caption', text: 'grab the sourdough at Cafe Fiori', origin: 'tiktok-oembed-title' },
]);
vi.mock('@/integrations/tiktok/caption-content-extractor', () => ({
  captionContentExtractor: {
    id: 'caption',
    supports: () => true,
    extract: captionExtractMock,
  },
}));

const extractMock = vi.fn();
vi.mock('@/integrations/llm/place-extractor-factory', () => ({
  createPlaceExtractor: () => ({ version: 'fake', promptVersion: 'fake', extract: extractMock }),
}));

function postProbe(rawBody?: string): Promise<Response> {
  const req = new NextRequest('http://localhost/api/imports/probe', {
    method: 'POST',
    body: rawBody ?? JSON.stringify({ url: VIDEO_URL }),
    headers: { 'Content-Type': 'application/json' },
  });
  return import('@/app/api/imports/probe/route').then(({ POST }) => POST(req));
}

describe('POST /api/imports/probe — extraction branch', () => {
  beforeEach(resetPersisted);

  it('runs the extractor and returns candidates that survive filterPlausible', async () => {
    const candidate: PlaceCandidate = {
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: 'IL',
      categoryHint: 'cafe',
      evidence: 'at Cafe Fiori',
      modelConfidence: 0.8,
      addressHint: null,
      identifiedName: null,
      coordinates: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
    };
    extractMock.mockResolvedValueOnce({ candidates: [candidate], cityHint: 'Tel Aviv' });

    const res = await postProbe();
    const body = (await res.json()) as { candidates: PlaceCandidate[] };

    expect(res.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]?.rawName).toBe('Cafe Fiori');
  });

  it('persists the extraction and returns its id, so a save can be derived server-side', async () => {
    const candidate: PlaceCandidate = {
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: 'Israel',
      categoryHint: 'cafe',
      evidence: 'at Cafe Fiori',
      modelConfidence: 0.8,
      addressHint: null,
      identifiedName: 'Cafe Fiori Tel Aviv',
      coordinates: { lat: 32.07, lng: 34.78 },
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
    };
    extractMock.mockResolvedValueOnce({ candidates: [candidate], cityHint: 'Tel Aviv' });

    const res = await postProbe();
    const body = (await res.json()) as {
      extractionId: string | null;
      candidates: PlaceCandidate[];
    };

    expect(res.status).toBe(200);
    expect(body.extractionId).toBe('ext-1');

    expect(persisted.extractions).toHaveLength(1);
    const row = persisted.extractions[0]!;
    expect(row.source_id).toBe(FAKE_RAW_SOURCE.id);
    expect(row.model).toBe('fake');
    expect(row.prompt_version).toBe('fake');
    expect(row.status).toBe('ok');
    expect(row.candidate_count).toBe(1);
    // The stored array must be the same one the response carries, in the same order — the confirm
    // route addresses candidates by index, so any divergence would save the wrong place.
    expect(row.candidates).toEqual(body.candidates);
    // A caption hash, not the caption: `sources.content_text` already holds the text.
    expect(row.input_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('advances the import row it opened to review, with its versions and timings', async () => {
    const candidate: PlaceCandidate = {
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: 'Israel',
      categoryHint: 'cafe',
      evidence: 'at Cafe Fiori',
      modelConfidence: 0.8,
      addressHint: null,
      identifiedName: null,
      coordinates: { lat: 32.07, lng: 34.78 },
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
    };
    extractMock.mockResolvedValueOnce({ candidates: [candidate], cityHint: 'Tel Aviv' });

    await postProbe();

    expect(persisted.importUpdates).toHaveLength(1);
    const update = persisted.importUpdates[0]!;
    // Not `completed`: extraction finishing is not the import finishing — the user still has to
    // confirm, and `/api/imports/confirm` is what writes `completed`/`done`.
    expect(update.status).toBe('review');
    expect(update.stage).toBe('extract');
    expect(update.prompt_version).toBe('fake');
    expect(update.extractor_version).toBe('fake');
    expect(typeof update.ms_source).toBe('number');
    expect(typeof update.ms_extract).toBe('number');
  });

  it('advances the import row to no_places when the caption named none', async () => {
    extractMock.mockResolvedValueOnce({ candidates: [], cityHint: null });

    await postProbe();

    expect(persisted.importUpdates[0]?.status).toBe('no_places');
    // Still persisted, with an empty candidate list: "no places found" is the modal outcome and
    // re-pasting is the natural retry, so this row is the cache entry that stops the retry paying
    // the model a second time.
    expect(persisted.extractions).toHaveLength(1);
    expect(persisted.extractions[0]?.candidate_count).toBe(0);
  });

  it('drops candidates that fail the plausibility gate (evidence not in caption)', async () => {
    const candidate: PlaceCandidate = {
      rawName: 'Made Up Place',
      cityHint: null,
      countryHint: null,
      categoryHint: null,
      evidence: 'this text is not in the caption',
      modelConfidence: 0.9,
      addressHint: null,
      identifiedName: null,
      coordinates: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
    };
    extractMock.mockResolvedValueOnce({ candidates: [candidate], cityHint: null });

    const res = await postProbe();
    const body = (await res.json()) as { candidates: PlaceCandidate[] };

    expect(res.status).toBe(200);
    expect(body.candidates).toHaveLength(0);
  });

  it('maps a thrown DomainError from the extractor to the existing toView() error shape', async () => {
    extractMock.mockRejectedValueOnce(extractorUnavailable('extractor unreachable'));

    const res = await postProbe();
    const body = (await res.json()) as { error: { code: string; retryable: boolean } };

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('EXTRACTOR_UNAVAILABLE');
  });

  it('skips the LLM call entirely when there is no caption', async () => {
    extractMock.mockClear();
    captionExtractMock.mockResolvedValueOnce([]);

    const res = await postProbe();
    const body = (await res.json()) as {
      caption: string | null;
      candidates: PlaceCandidate[];
      extractionId: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.caption).toBeNull();
    expect(body.candidates).toHaveLength(0);
    expect(extractMock).not.toHaveBeenCalled();
    // No model ran, so there is no `model`/`prompt_version` to satisfy those `not null` columns
    // and no extraction to record. The id must be null rather than a fabricated handle the
    // confirm route would reject anyway.
    expect(body.extractionId).toBeNull();
    expect(persisted.extractions).toHaveLength(0);
  });

  /**
   * The cache read. The write side of this shipped alone, so the row was stored under
   * `(source_id, model, prompt_version)` and never consulted — every re-paste re-paid the model
   * for an answer already on disk, and got a *different* answer back, because the model is not
   * deterministic. These three cases pin the read side's contract.
   */
  describe('the extraction cache', () => {
    // sha256 of the caption `captionExtractMock` returns, which is what the route hashes.
    const CAPTION_HASH = '0e14a376f9f0a5c0077ff671c337ab4edbfb69bf8ae876a5e5145127a6793153';

    // Shaped as schema v2 writes it (`domain/extraction/schema.ts`). A v1-shaped row — one with no
    // `tags`/`dishes`/`whyGo`/`areaHint` — would fail `RawPlaceCandidateSchema` here and be treated
    // as a cache miss, which is the designed behaviour and is why `PROMPT_VERSION` carries the
    // schema version: rows written by v1 are never looked up under a v2 key in the first place.
    const storedCandidate = {
      rawName: 'Cafe Fiori',
      cityHint: null,
      countryHint: null,
      areaHint: null,
      categoryHint: null,
      evidence: 'Cafe Fiori',
      modelConfidence: 0.8,
      addressHint: null,
      identifiedName: null,
      tags: [],
      dishes: [],
      whyGo: null,
      coordinates: null,
    };

    it('serves a stored extraction without calling the model again', async () => {
      cachedExtractionRow = {
        id: 'ext-cached',
        status: 'ok',
        input_hash: CAPTION_HASH,
        candidates: [storedCandidate],
      };
      extractMock.mockClear();

      const res = await postProbe();
      const body = (await res.json()) as {
        extractionId: string | null;
        candidates: PlaceCandidate[];
      };

      expect(res.status).toBe(200);
      expect(extractMock).not.toHaveBeenCalled();
      expect(body.extractionId).toBe('ext-cached');
      expect(body.candidates).toHaveLength(1);
      expect(body.candidates[0]?.rawName).toBe('Cafe Fiori');
      // A hit writes nothing: there is no new answer to record, and re-upserting would overwrite
      // the original row's `latency_ms` with a null.
      expect(persisted.extractions).toHaveLength(0);
    });

    it('re-extracts when the caption changed under the same source and prompt version', async () => {
      // TikTok lets a caption be edited. Reusing the old row would show places the current caption
      // no longer names, which is the exact "confidently wrong" failure this product cannot have.
      cachedExtractionRow = {
        id: 'ext-cached',
        status: 'ok',
        input_hash: 'a-hash-from-some-earlier-caption',
        candidates: [storedCandidate],
      };
      extractMock.mockClear();
      extractMock.mockResolvedValueOnce({ candidates: [], cityHint: null });

      const res = await postProbe();
      const body = (await res.json()) as { extractionId: string | null };

      expect(res.status).toBe(200);
      expect(extractMock).toHaveBeenCalledTimes(1);
      expect(body.extractionId).toBe('ext-1');
      expect(persisted.extractions).toHaveLength(1);
    });

    it('re-extracts when the stored row is not a successful extraction', async () => {
      cachedExtractionRow = {
        id: 'ext-cached',
        status: 'failed',
        input_hash: CAPTION_HASH,
        candidates: null,
      };
      extractMock.mockClear();
      extractMock.mockResolvedValueOnce({ candidates: [], cityHint: null });

      const res = await postProbe();

      expect(res.status).toBe(200);
      expect(extractMock).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * FIX-ERR-T1 — the request-boundary and failure-path half of `current-state.md` §3.5.
 *
 * Before this, *every* failure this route could produce came back as `INTERNAL, retryable: true`
 * with HTTP 502, and the actual cause was put into a `DomainError` message and `cause` that
 * `toView()` strips and nothing logged. On 2026-08-26 that presented a service-role
 * misconfiguration on screen as "COULDN'T READ THAT TIKTOK / INTERNAL", pointing at TikTok, the
 * model and the network — none of which were the cause.
 */
describe('POST /api/imports/probe — honest failures', () => {
  beforeEach(resetPersisted);

  it('reports a malformed body as the caller’s fault, and not as retryable', async () => {
    const res = await postProbe('{ not json');
    const body = (await res.json()) as { error: { code: string; retryable: boolean } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('MALFORMED_URL');
    // The old `retryable: true` was a straight lie: re-sending the identical bytes fails
    // identically.
    expect(body.error.retryable).toBe(false);
  });

  it('reports a body with no url the same way', async () => {
    const res = await postProbe(JSON.stringify({ notUrl: 1 }));
    const body = (await res.json()) as { error: { code: string; retryable: boolean } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('MALFORMED_URL');
    expect(body.error.retryable).toBe(false);
  });

  it('keeps the canonicaliser’s own codes and gives each its own status', async () => {
    const res = await postProbe(JSON.stringify({ url: 'https://example.com/video/1' }));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('UNSUPPORTED_HOST');
  });

  it('does not report a caption-less post as a broken upstream', async () => {
    // NO_CAPTION used to come back as 502 — "the upstream is broken" — when in fact we read the
    // post perfectly and it simply has no caption. Thrown from the content extractor, which is
    // where `07` §9 says this code originates (the A/B seam).
    captionExtractMock.mockRejectedValueOnce(noCaption());

    const res = await postProbe();
    const body = (await res.json()) as { error: { code: string; retryable: boolean } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('NO_CAPTION');
    expect(body.error.retryable).toBe(false);
  });

  it('stamps the imports row it opened as failed, with the error code', async () => {
    extractMock.mockRejectedValueOnce(extractorUnavailable('extractor unreachable'));

    await postProbe();

    // `imports_failed_implies_code` (0003) has required this pairing since the schema was written
    // and nothing had ever written it: a failed import used to sit at `processing` until
    // `expires_at` swept it.
    expect(persisted.importUpdates).toHaveLength(1);
    const update = persisted.importUpdates[0]!;
    expect(update.status).toBe('failed');
    expect(update.error_code).toBe('EXTRACTOR_UNAVAILABLE');
    // `imports_stage_check` allows source/extract/resolve/done — never 'request'.
    expect(['source', 'extract']).toContain(update.stage);
  });

  it('clears a stale error_code when a later attempt succeeds', async () => {
    // `start_import` treats `failed` as an *open* import, so a re-paste after a failure adopts the
    // stamped row. Leaving the old code on it would misreport a succeeded import in every audit
    // query.
    extractMock.mockResolvedValueOnce({ candidates: [], cityHint: null });

    await postProbe();

    expect(persisted.importUpdates[0]?.status).toBe('no_places');
    expect(persisted.importUpdates[0]?.error_code).toBeNull();
  });

  it('logs the real cause server-side, and never puts it in the response', async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
    try {
      extractMock.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not set'));

      const res = await postProbe();
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      // The wire format stays a code and two booleans — no message, no detail, no env var name.
      expect(body).toEqual({ error: { code: 'INTERNAL', retryable: true } });
      expect(JSON.stringify(body)).not.toContain('ANTHROPIC');

      const failureLine = logged
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.event === 'import.stage');

      expect(failureLine).toBeDefined();
      expect(failureLine).toMatchObject({
        outcome: 'failed',
        code: 'INTERNAL',
        status: 500,
        importId: 'imp-1',
        videoId: FAKE_RAW_SOURCE.externalId,
        stage: 'extract',
      });
      // The one thing that would have answered "why?" on 2026-08-26, and which the response is
      // not allowed to carry.
      expect(String(failureLine?.cause)).toContain('ANTHROPIC_API_KEY is not set');
      // Never the caption (charter R9) — the fixture caption is the canary.
      expect(JSON.stringify(failureLine)).not.toContain('sourdough');
    } finally {
      spy.mockRestore();
    }
  });
});
