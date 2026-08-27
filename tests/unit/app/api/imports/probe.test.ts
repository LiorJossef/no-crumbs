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

import { extractorUnavailable, internal, noCaption, upstreamTimeout } from '@/domain/errors';
import type { PlaceCandidate, ResolveResult } from '@/domain/types';

/**
 * `place-resolver.ts` opens with `import 'server-only'`, which throws unless it is resolved under
 * React's `react-server` condition — Vitest resolves the node entry, so importing the route (which
 * now imports the resolver) fails without this. Safe here for the same reason it is safe in
 * `confirm.test.ts`: what `server-only` protects is the bundler boundary, and `npm run check:layers`
 * is what actually enforces that.
 */
vi.mock('server-only', () => ({}));

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
  /** Narrow `update`s to an existing extraction row — the resolution backfill on a cache hit. */
  extractionUpdates: [] as Record<string, unknown>[],
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
  persisted.extractionUpdates.length = 0;
  cachedExtractionRow = null;
  resolveMock.mockReset();
  // Default: every candidate resolves to nothing. Tests that care set their own answers, and a
  // test that forgets gets the conservative outcome rather than a silent auto-accept.
  resolveMock.mockResolvedValue(NO_MATCH_RESULT);
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
          update: (row: Record<string, unknown>) => {
            persisted.extractionUpdates.push(row);
            return { eq: async () => ({ error: null }) };
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

/**
 * The `PlaceResolver` seam. Faked at the *adapter factory*, not at the gateway, because what this
 * file is responsible for is the route's stage C — that a lookup is issued per in-budget candidate,
 * that the answer is stored index-aligned, and that a failed lookup degrades one candidate instead
 * of the request. Whether the Overture SQL is right is `place-resolver`'s own test's job, and the
 * owner's measured Tel Aviv pass is the other half.
 */
const resolveMock = vi.fn();
vi.mock('@/integrations/supabase/place-resolver', () => ({
  supabasePoiIndexGateway: () => ({ loadedRegions: async () => [], prefilter: async () => [] }),
  overturePlaceResolver: () => ({ provider: 'overture', resolve: resolveMock }),
}));

/** A `preselect` result — the band the confirm step is allowed to auto-accept. */
function preselectResult(name: string, lat: number, lng: number): ResolveResult {
  return {
    shortlist: [
      {
        place: {
          provider: 'overture',
          providerPlaceId: `gers-${name}`,
          sourceDataset: 'overture-places',
          regionId: 'tlv',
          name,
          altNames: [],
          providerCategory: 'cafe',
          addressLine: '1 Some Street',
          locality: 'Tel Aviv',
          lat,
          lng,
          datasetConfidence: 0.9,
        },
        score: 0.91,
        nameScore: 0.95,
        tokenCoverage: 1,
        categoryScore: 1,
      },
    ],
    confidence: { band: 'preselect', score: 0.91, margin: 0.4 },
    regionsSearched: ['tlv'],
    candidatesPrefiltered: 12,
  };
}

/** The honest empty answer: we searched and matched nothing. */
const NO_MATCH_RESULT: ResolveResult = {
  shortlist: [],
  confidence: { band: 'no_match', score: 0, margin: null },
  regionsSearched: ['tlv'],
  candidatesPrefiltered: 3,
};

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
      nameVariants: [],
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
      nameVariants: [],
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
      nameVariants: [],
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
    // `resolve`, not `extract`: the route genuinely runs the resolver now. `done` would still be a
    // lie — the user has not confirmed.
    expect(update.stage).toBe('resolve');
    expect(update.prompt_version).toBe('fake');
    expect(update.extractor_version).toBe('fake');
    expect(typeof update.ms_source).toBe('number');
    expect(typeof update.ms_extract).toBe('number');
    expect(typeof update.ms_resolve).toBe('number');
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
      nameVariants: [],
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
   * Stage C — the `PlaceResolver` wiring (TLV-RESOLVE-T3).
   *
   * The property that matters here is not "the resolver was called". It is that the shortlist ends
   * up **on the server**, in the row `/api/imports/confirm` already reads, index-aligned with the
   * candidates. `confirm` derives every place fact from that row; if the resolution only existed in
   * this response, the browser would have to send it back and the whole authority model
   * (`domain/import/candidate-place.ts`'s header) would be undone.
   */
  describe('resolution', () => {
    function candidateNamed(rawName: string, evidence: string): PlaceCandidate {
      return {
        rawName,
        cityHint: 'Tel Aviv',
        countryHint: 'Israel',
        categoryHint: 'cafe',
        evidence,
        modelConfidence: 0.8,
        addressHint: null,
        identifiedName: null,
        nameVariants: [],
        coordinates: null,
        areaHint: null,
        tags: [],
        dishes: [],
        whyGo: null,
      };
    }

    it('stores the resolver shortlist on the extraction row, index-aligned with the candidates', async () => {
      extractMock.mockResolvedValueOnce({
        candidates: [candidateNamed('Cafe Fiori', 'at Cafe Fiori')],
        cityHint: 'Tel Aviv',
      });
      resolveMock.mockResolvedValueOnce(preselectResult('Cafe Fiori', 32.0701, 34.7801));

      const res = await postProbe();
      const body = (await res.json()) as {
        candidates: (PlaceCandidate & { resolution: unknown })[];
      };

      expect(res.status).toBe(200);
      expect(resolveMock).toHaveBeenCalledTimes(1);

      const stored = persisted.extractions[0]?.candidates as { resolution: unknown }[];
      expect(stored).toHaveLength(1);
      expect(stored[0]?.resolution).toMatchObject({
        kind: 'answered',
        result: { confidence: { band: 'preselect' } },
      });
      // The persisted array and the returned array are the same objects in the same order. The
      // confirm route addresses candidates by index into the *stored* one.
      expect(stored).toEqual(body.candidates);
    });

    it('asks the resolver the query the streamed pipeline would ask', async () => {
      extractMock.mockResolvedValueOnce({
        candidates: [{ ...candidateNamed('Cafe Fiori', 'at Cafe Fiori'), cityHint: null }],
        cityHint: 'Tel Aviv',
      });

      await postProbe();

      // `buildResolveQuery` is imported from `domain/import/pipeline.ts` rather than restated here,
      // so a candidate with no city of its own falls back to the extraction's — the behaviour a
      // second, hand-rolled copy at this route would have been free to get wrong.
      expect(resolveMock.mock.calls[0]?.[0]).toMatchObject({
        text: 'Cafe Fiori',
        cityHint: 'Tel Aviv',
        countryHint: 'Israel',
        categoryHint: 'cafe',
      });
    });

    it('records a no-match honestly rather than leaving the candidate unasked', async () => {
      extractMock.mockResolvedValueOnce({
        candidates: [candidateNamed('Cafe Fiori', 'at Cafe Fiori')],
        cityHint: 'Tel Aviv',
      });
      resolveMock.mockResolvedValueOnce(NO_MATCH_RESULT);

      await postProbe();

      const stored = persisted.extractions[0]?.candidates as { resolution: unknown }[];
      // Not `null`. `null` means "never asked"; this means "asked, found nothing", and the confirm
      // route treats them the same way but the audit trail must not conflate them.
      expect(stored[0]?.resolution).toMatchObject({
        kind: 'answered',
        result: { confidence: { band: 'no_match' }, shortlist: [] },
      });
    });

    it('degrades one candidate when its lookup fails, and still returns the import', async () => {
      extractMock.mockResolvedValueOnce({
        candidates: [
          candidateNamed('Cafe Fiori', 'at Cafe Fiori'),
          candidateNamed('Bread Bar', 'the Bread Bar'),
        ],
        cityHint: 'Tel Aviv',
      });
      captionExtractMock.mockResolvedValueOnce([
        { kind: 'caption', text: 'at Cafe Fiori and the Bread Bar', origin: 'tiktok-oembed-title' },
      ]);
      resolveMock.mockRejectedValueOnce(internal('poi_index prefilter failed'));
      resolveMock.mockResolvedValueOnce(preselectResult('Bread Bar', 32.06, 34.77));

      const res = await postProbe();

      // `07` §7's asymmetry: resolution never fails the import.
      expect(res.status).toBe(200);
      const stored = persisted.extractions[0]?.candidates as { resolution: unknown }[];
      expect(stored[0]?.resolution).toEqual({ kind: 'failed', reason: 'lookup_failed' });
      expect(stored[1]?.resolution).toMatchObject({ kind: 'answered' });
      // Not every lookup failed, so the import is not degraded.
      expect(persisted.importUpdates[0]?.degraded_code).toBeNull();
    });

    it('marks the import degraded only when every attempted lookup failed in transport', async () => {
      extractMock.mockResolvedValueOnce({
        candidates: [candidateNamed('Cafe Fiori', 'at Cafe Fiori')],
        cityHint: 'Tel Aviv',
      });
      resolveMock.mockRejectedValueOnce(upstreamTimeout('poi_index timed out'));

      await postProbe();

      const stored = persisted.extractions[0]?.candidates as { resolution: unknown }[];
      expect(stored[0]?.resolution).toEqual({ kind: 'failed', reason: 'timed_out' });
      expect(persisted.importUpdates[0]?.degraded_code).toBe('PLACE_PROVIDER_UNAVAILABLE');
    });

    it('issues at most MAX_CANDIDATES lookups and keeps the rest, marked capped', async () => {
      const names = Array.from({ length: 9 }, (_, i) => `Place ${i}`);
      captionExtractMock.mockResolvedValueOnce([
        { kind: 'caption', text: names.join(' and '), origin: 'tiktok-oembed-title' },
      ]);
      extractMock.mockResolvedValueOnce({
        candidates: names.map((n) => candidateNamed(n, n)),
        cityHint: 'Tel Aviv',
      });

      await postProbe();

      // `07` §7's `MAX_PROVIDER_REQUESTS_PER_IMPORT` is the same 7 as `MAX_CANDIDATES`.
      expect(resolveMock).toHaveBeenCalledTimes(7);
      const stored = persisted.extractions[0]?.candidates as { resolution: unknown }[];
      expect(stored).toHaveLength(9);
      // Kept and visible, never silently dropped.
      expect(stored[7]?.resolution).toEqual({ kind: 'capped' });
      expect(stored[8]?.resolution).toEqual({ kind: 'capped' });
    });
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
      nameVariants: [],
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

    it('backfills resolutions onto a cached row written before the resolver existed', async () => {
      // The six rows on the local database are exactly this shape: candidates, no `resolution`.
      // Serving them unchanged would mean a re-paste of an old TikTok still saves a model guess.
      cachedExtractionRow = {
        id: 'ext-cached',
        status: 'ok',
        input_hash: CAPTION_HASH,
        candidates: [storedCandidate],
      };
      extractMock.mockClear();
      resolveMock.mockResolvedValueOnce(preselectResult('Cafe Fiori', 32.0701, 34.7801));

      const res = await postProbe();

      expect(res.status).toBe(200);
      // Still a cache hit: no second model call, and no upsert that would clobber `latency_ms`.
      expect(extractMock).not.toHaveBeenCalled();
      expect(persisted.extractions).toHaveLength(0);
      // But the resolution is written back, because confirm reads the row and not this response.
      expect(resolveMock).toHaveBeenCalledTimes(1);
      expect(persisted.extractionUpdates).toHaveLength(1);
      const written = persisted.extractionUpdates[0]?.candidates as { resolution: unknown }[];
      expect(written[0]?.resolution).toMatchObject({ kind: 'answered' });
    });

    it('reuses a stored resolution instead of re-resolving', async () => {
      // The same reason the extraction cache exists: re-opening the same TikTok must show the same
      // places. A re-resolve would be cheap but is not guaranteed identical — the region set and the
      // index can move underneath it.
      cachedExtractionRow = {
        id: 'ext-cached',
        status: 'ok',
        input_hash: CAPTION_HASH,
        candidates: [
          { ...storedCandidate, resolution: { kind: 'answered', result: preselectResult('Cafe Fiori', 32.07, 34.78) } },
        ],
      };
      extractMock.mockClear();

      const res = await postProbe();
      const body = (await res.json()) as { candidates: { resolution: unknown }[] };

      expect(res.status).toBe(200);
      expect(resolveMock).not.toHaveBeenCalled();
      expect(persisted.extractionUpdates).toHaveLength(0);
      expect(body.candidates[0]?.resolution).toMatchObject({
        kind: 'answered',
        result: { shortlist: [{ place: { providerPlaceId: 'gers-Cafe Fiori' } }] },
      });
      // Nothing was resolved in this request, so the column must not claim a measurement.
      expect(persisted.importUpdates[0]?.ms_resolve).toBeNull();
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
