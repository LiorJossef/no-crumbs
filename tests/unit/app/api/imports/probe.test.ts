/**
 * Unit coverage for `POST /api/imports/probe`'s extraction branch added alongside the real
 * `PlaceExtractor` + `filterPlausible` wiring (`route.ts`'s header). Every vendor-facing seam is
 * mocked — auth, the service-role client, the oEmbed adapter, the caption extractor and the LLM
 * factory — so this test never depends on a live hosted-model call or a real Supabase project; the
 * owner's own manual, real-model pass against a live TikTok URL is the other half of this task's
 * verification, not something an automated test can stand in for.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { extractorUnavailable } from '@/domain/errors';
import type { PlaceCandidate } from '@/domain/types';

const VIDEO_URL = 'https://www.tiktok.com/@tlv.eats/video/7123456789012345678';

const FAKE_RAW_SOURCE = {
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

vi.mock('@/integrations/supabase/service-role-client', () => ({
  serviceRoleClient: () => ({
    // `start_import` (0007, B7) and `search_poi_index` (the DB-first resolver check, L0-F2b) are
    // both reached through this one `rpc()` — this suite covers the extraction branch only, so
    // both are stubbed as a no-op ("no row", not an error).
    rpc: async () => ({ data: null, error: null }),
    // `poiIndexPlaceResolver`'s `poi_regions` read: no region reports `is_loaded`, so every
    // candidate's DB check comes back a clean, honest "not loaded" (`dbMatches[i] === null`) —
    // exactly the fallback path this suite's assertions already exercise.
    from: (table: string) => {
      if (table !== 'poi_regions') throw new Error(`unexpected table ${table}`);
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
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
    const body = (await res.json()) as { caption: string | null; candidates: PlaceCandidate[] };

    expect(res.status).toBe(200);
    expect(body.caption).toBeNull();
    expect(body.candidates).toHaveLength(0);
    expect(extractMock).not.toHaveBeenCalled();
  });
});
