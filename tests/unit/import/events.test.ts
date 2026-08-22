import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES, internal } from '@/domain/errors';
import type { ImportEvent, ImportOutcome, PipelineStage } from '@/domain/import/events';

const importId = 'imp_1' as never;

describe('ImportEvent — the stage sequence 07 §5 describes', () => {
  it('accepted carries the importId and the idempotency flag', () => {
    const e: ImportEvent = { t: 'accepted', importId, idempotent: false };
    expect(e.t).toBe('accepted');
  });

  it('each real stage has a started event and a done event with its stage-specific fact', () => {
    const stages: PipelineStage[] = ['source', 'extract', 'resolve'];
    expect(stages).toEqual(['source', 'extract', 'resolve']);

    const sourceStarted: ImportEvent = { t: 'stage', stage: 'source', status: 'started' };
    const sourceDone: ImportEvent = {
      t: 'stage',
      stage: 'source',
      status: 'done',
      fact: { authorHandle: 'someone' },
    };
    const extractStarted: ImportEvent = { t: 'stage', stage: 'extract', status: 'started' };
    const extractDone: ImportEvent = {
      t: 'stage',
      stage: 'extract',
      status: 'done',
      fact: { candidateCount: 3 },
    };
    const resolveStarted: ImportEvent = { t: 'stage', stage: 'resolve', status: 'started' };

    for (const e of [sourceStarted, sourceDone, extractStarted, extractDone, resolveStarted]) {
      expect(e.t).toBe('stage');
    }
  });

  it('candidate progress carries only index/total — no candidate payload before completion', () => {
    const e: ImportEvent = { t: 'candidate', index: 2, total: 3 };
    expect(Object.keys(e).sort()).toEqual(['index', 't', 'total']);
  });

  it('heartbeat carries no data', () => {
    const e: ImportEvent = { t: 'heartbeat' };
    expect(Object.keys(e)).toEqual(['t']);
  });

  it('done carries the whole ImportOutcome, and is the only place resolution data appears', () => {
    const outcome: ImportOutcome = {
      kind: 'ready',
      importId,
      source: { externalId: '123', canonicalUrl: 'https://tiktok.com/@x/video/123', authorHandle: '@x', thumbnailUrl: null },
      candidates: [],
      degraded: null,
    };
    const e: ImportEvent = { t: 'done', outcome };
    expect(e.t).toBe('done');
  });
});

describe('ImportOutcome — partial success is a shape, not a separate kind (07 §8)', () => {
  it('kind "ready" carries candidates regardless of how each one resolved', () => {
    const outcome: ImportOutcome = {
      kind: 'ready',
      importId,
      source: { externalId: '1', canonicalUrl: 'https://tiktok.com/@x/video/1', authorHandle: null, thumbnailUrl: null },
      candidates: [
        {
          candidate: {
            rawName: 'Afuri',
            cityHint: 'Tokyo',
            countryHint: 'JP',
            categoryHint: 'restaurant',
            evidence: 'best ramen at afuri',
            modelConfidence: 0.9,
            identifiedName: null,
          },
          resolution: { status: 'unresolved', reason: 'no_match' },
        },
      ],
      degraded: null,
    };
    expect(outcome.candidates).toHaveLength(1);
  });

  it('degraded is a marker on a successful outcome, not a DomainError', () => {
    const outcome: ImportOutcome = {
      kind: 'ready',
      importId,
      source: { externalId: '1', canonicalUrl: 'https://tiktok.com/@x/video/1', authorHandle: null, thumbnailUrl: null },
      candidates: [],
      degraded: 'PLACE_PROVIDER_UNAVAILABLE',
    };
    expect(outcome.kind).toBe('ready');
    expect(outcome.degraded).toBe('PLACE_PROVIDER_UNAVAILABLE');
  });

  it('failed is the only outcome kind that embeds a DomainErrorView', () => {
    const outcome: ImportOutcome = { kind: 'failed', importId, error: internal('boom').toView() };
    expect(outcome.kind).toBe('failed');
    expect(outcome.error.code).toBe('INTERNAL');
  });
});

describe('NO_PLACES_FOUND — a distinct outcome, structurally apart from DomainError', () => {
  it('is the outcome kind "no_places", carrying a source but no error field', () => {
    const outcome: ImportOutcome = {
      kind: 'no_places',
      importId,
      source: { externalId: '1', canonicalUrl: 'https://tiktok.com/@x/video/1', authorHandle: null, thumbnailUrl: null },
    };
    expect(outcome.kind).toBe('no_places');
    expect('error' in outcome).toBe(false);
    expect('code' in outcome).toBe(false);
  });

  it('shares no discriminant value with any DomainErrorCode', () => {
    expect(DOMAIN_ERROR_CODES).not.toContain('no_places');
    expect(DOMAIN_ERROR_CODES.map((c) => c.toLowerCase())).not.toContain('no_places_found');
  });

  it('a no_places outcome and a failed outcome are never assignable to each other at the value level', () => {
    const noPlaces: ImportOutcome = {
      kind: 'no_places',
      importId,
      source: { externalId: '1', canonicalUrl: 'https://tiktok.com/@x/video/1', authorHandle: null, thumbnailUrl: null },
    };
    const failed: ImportOutcome = { kind: 'failed', importId, error: internal().toView() };
    expect(noPlaces.kind).not.toBe(failed.kind);
  });
});
