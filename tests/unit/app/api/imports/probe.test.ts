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

import { extractorUnavailable } from '@/domain/errors';
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

function resetPersisted() {
  persisted.extractions.length = 0;
  persisted.importUpdates.length = 0;
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
        return {
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

function postProbe(): Promise<Response> {
  const req = new NextRequest('http://localhost/api/imports/probe', {
    method: 'POST',
    body: JSON.stringify({ url: VIDEO_URL }),
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
});
