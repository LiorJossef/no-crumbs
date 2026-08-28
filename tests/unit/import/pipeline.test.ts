import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  extractorInvalidOutput,
  extractorUnavailable,
  notAuthenticated,
  postUnavailable,
  rateLimitedLocal,
  rateLimitedUpstream,
  shortLinkUnresolved,
  upstreamTimeout,
  type DomainErrorCode,
} from '@/domain/errors';
import { MAX_CANDIDATES, runImport, type ImportInput } from '@/domain/import/pipeline';
import type { ImportEvent, ImportOutcome } from '@/domain/import/events';
import type {
  Clock,
  ContentExtractor,
  ImportStore,
  OpCtx,
  PlaceExtractor,
  Ports,
  SourceAdapter,
} from '@/domain/ports';
import type {
  ContentPart,
  PlaceCandidate,
  RawSource,
  ResolveResult,
  ResolvedPlace,
} from '@/domain/types';

const importId = 'imp_1' as never;
const userId = 'user_1' as never;

const VALID_VIDEO_URL = 'https://www.tiktok.com/@someone/video/7123456789012345678';
const VALID_SHORT_LINK_URL = 'https://vm.tiktok.com/ABC123xyz';

function makeCtx(overrides: Partial<OpCtx> = {}): OpCtx {
  return {
    signal: new AbortController().signal,
    importId,
    log: { event: () => {} },
    ...overrides,
  };
}

function makeInput(overrides: Partial<ImportInput> = {}): ImportInput {
  return {
    userId,
    importId,
    rawInput: VALID_VIDEO_URL,
    idempotent: false,
    ...overrides,
  };
}

/** A `Clock` that never advances on its own: `sleep` only ever settles if its signal aborts, so a
 *  fake port that resolves instantly never triggers a heartbeat and never leaves a real timer
 *  running past the test. `monotonicMs` still moves, so stage timings are non-degenerate. */
function makeQuietClock(): Clock {
  let tick = 0;
  return {
    now: () => new Date('2026-08-20T00:00:00.000Z'),
    monotonicMs: () => (tick += 5),
    sleep: (_ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => resolve(), { once: true });
      }),
    jitterMs: (ms: number) => ms,
  };
}

function rawSourceFixture(externalId: string, texts: RawSource['texts'] = [{ kind: 'caption', text: 'best ramen at afuri' }]): RawSource {
  return {
    id: `source-${externalId}`,
    externalId,
    authorHandle: '@someone',
    authorName: 'Someone',
    canonicalUrl: `https://www.tiktok.com/@someone/video/${externalId}`,
    thumbnailUrl: null,
    texts,
    media: [],
  };
}

function captionExtractor(parts: readonly ContentPart[] = [{ kind: 'caption', text: 'best ramen at afuri', origin: 'oembed.title' }]): ContentExtractor {
  return {
    id: 'caption',
    supports: () => true,
    extract: async () => parts,
  };
}

const oneCandidate: PlaceCandidate = {
  rawName: 'Afuri',
  cityHint: 'Tokyo',
  countryHint: 'JP',
  categoryHint: 'restaurant',
  evidence: 'best ramen at afuri',
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

function resolvedPlaceFixture(providerPlaceId: string): ResolvedPlace {
  return {
    provider: 'overture',
    providerPlaceId,
    sourceDataset: 'overture-places',
    regionId: 'tyo',
    name: 'Afuri',
    altNames: [],
    providerCategory: 'restaurant',
    addressLine: '1 Chome',
    locality: 'Shibuya',
    lat: 35.66,
    lng: 139.7,
    datasetConfidence: 0.9,
  };
}

function preselectResult(providerPlaceId = 'p1'): ResolveResult {
  const place = resolvedPlaceFixture(providerPlaceId);
  return {
    shortlist: [{ place, score: 0.95, nameScore: 0.95, tokenCoverage: 1, categoryScore: 1 }],
    confidence: { band: 'preselect', score: 0.95, margin: 0.1 },
    regionsSearched: ['tyo'],
    candidatesPrefiltered: 1,
  };
}

function noMatchResult(): ResolveResult {
  return {
    shortlist: [],
    confidence: { band: 'no_match', score: 0, margin: null },
    regionsSearched: ['tyo'],
    candidatesPrefiltered: 0,
  };
}

function makePorts(overrides: Partial<Ports> = {}): Ports {
  const source: SourceAdapter = {
    platform: 'tiktok',
    resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
    fetch: async (externalId) => rawSourceFixture(externalId),
  };
  const extractor: PlaceExtractor = {
    version: 'v1',
    promptVersion: 'p1',
    extract: async () => ({ candidates: [oneCandidate], cityHint: 'Tokyo' }),
  };
  const store: ImportStore = {
    recordStage: async () => {},
    finish: async () => {},
  };
  return {
    source,
    content: [captionExtractor()],
    extractor,
    resolver: { provider: 'overture', resolve: async () => preselectResult() },
    store,
    clock: makeQuietClock(),
    heartbeatIntervalMs: 60_000,
    ...overrides,
  };
}

async function collect(ports: Ports, input: ImportInput, ctx: OpCtx = makeCtx()): Promise<ImportEvent[]> {
  const events: ImportEvent[] = [];
  for await (const e of runImport(ports, input, ctx)) {
    events.push(e);
  }
  return events;
}

function terminalOutcome(events: ImportEvent[]): ImportOutcome {
  const last = events[events.length - 1];
  if (last === undefined || last.t !== 'done') {
    throw new Error('no terminal done event');
  }
  return last.outcome;
}

describe('runImport — the golden path (07 §5)', () => {
  it('emits the full event sequence in order and lands on kind: ready', async () => {
    const events = await collect(makePorts(), makeInput());

    expect(events.map((e) => (e.t === 'stage' ? `stage:${e.stage}:${e.status}` : e.t))).toEqual([
      'accepted',
      'stage:source:started',
      'stage:source:done',
      'stage:extract:started',
      'stage:extract:done',
      'stage:resolve:started',
      'candidate',
      'done',
    ]);

    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.candidates).toHaveLength(1);
      expect(outcome.candidates[0]?.resolution.status).toBe('resolved');
      expect(outcome.degraded).toBeNull();
    }
  });

  it('the accepted event carries the caller-supplied idempotent flag verbatim', async () => {
    const events = await collect(makePorts(), makeInput({ idempotent: true }));
    const accepted = events[0];
    expect(accepted).toEqual({ t: 'accepted', importId, idempotent: true });
  });

  it('the candidate event carries index/total, and total is known once extraction is done', async () => {
    const events = await collect(makePorts(), makeInput());
    const candidateEvent = events.find((e) => e.t === 'candidate');
    expect(candidateEvent).toEqual({ t: 'candidate', index: 1, total: 1 });
  });
});

describe('runImport — NO_PLACES_FOUND is a success, not an error (07 §9)', () => {
  it('zero candidates from extraction ends the sequence after the extract stage, kind: no_places', async () => {
    const ports = makePorts({
      extractor: { version: 'v1', promptVersion: 'p1', extract: async () => ({ candidates: [], cityHint: null }) },
    });
    const events = await collect(ports, makeInput());

    expect(events.map((e) => (e.t === 'stage' ? `stage:${e.stage}:${e.status}` : e.t))).toEqual([
      'accepted',
      'stage:source:started',
      'stage:source:done',
      'stage:extract:started',
      'stage:extract:done',
      'done',
    ]);
    expect(terminalOutcome(events).kind).toBe('no_places');
  });
});

describe('runImport — MAX_CANDIDATES = 7 is enforced (07 §7)', () => {
  it('caps resolution at 7 even when extraction returns 10; the rest are visible and capped', async () => {
    expect(MAX_CANDIDATES).toBe(7);

    const tenCandidates: PlaceCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      ...oneCandidate,
      rawName: `Place ${i}`,
    }));
    let resolveCalls = 0;
    const ports = makePorts({
      extractor: { version: 'v1', promptVersion: 'p1', extract: async () => ({ candidates: tenCandidates, cityHint: null }) },
      resolver: {
        provider: 'overture',
        resolve: async () => {
          resolveCalls += 1;
          return preselectResult(`p${resolveCalls}`);
        },
      },
    });

    const events = await collect(ports, makeInput());
    expect(resolveCalls).toBe(7);

    const candidateEvents = events.filter((e): e is Extract<ImportEvent, { t: 'candidate' }> => e.t === 'candidate');
    expect(candidateEvents).toHaveLength(7);
    expect(candidateEvents.every((e) => e.total === 7)).toBe(true);

    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.candidates).toHaveLength(10);
      const capped = outcome.candidates.slice(7);
      expect(capped.every((c) => c.resolution.status === 'unresolved' && c.resolution.reason === 'capped')).toBe(true);
      const inBudget = outcome.candidates.slice(0, 7);
      expect(inBudget.every((c) => c.resolution.status === 'resolved')).toBe(true);
    }
  });
});

describe('runImport — partial success is first-class (07 §8)', () => {
  it('some candidates resolved and some not is still kind: ready, not failed', async () => {
    const twoCandidates: PlaceCandidate[] = [oneCandidate, { ...oneCandidate, rawName: 'Unknown Place' }];
    let call = 0;
    const ports = makePorts({
      extractor: { version: 'v1', promptVersion: 'p1', extract: async () => ({ candidates: twoCandidates, cityHint: 'Tokyo' }) },
      resolver: {
        provider: 'overture',
        resolve: async () => {
          call += 1;
          return call === 1 ? preselectResult() : noMatchResult();
        },
      },
    });

    const events = await collect(ports, makeInput());
    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.candidates.map((c) => c.resolution.status)).toEqual(['resolved', 'unresolved']);
      expect(outcome.degraded).toBeNull();
    }
  });

  it('every lookup failing with a transport error sets degraded, and is still kind: ready', async () => {
    const ports = makePorts({
      resolver: {
        provider: 'overture',
        resolve: async () => {
          throw postUnavailable('provider down');
        },
      },
    });
    const events = await collect(ports, makeInput());
    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.degraded).toBe('PLACE_PROVIDER_UNAVAILABLE');
      expect(outcome.candidates[0]?.resolution).toEqual({ status: 'unresolved', reason: 'lookup_failed' });
    }
  });

  it('a resolver timeout is reported with reason timed_out, not lookup_failed', async () => {
    const ports = makePorts({
      resolver: {
        provider: 'overture',
        resolve: async () => {
          throw upstreamTimeout();
        },
      },
    });
    const events = await collect(ports, makeInput());
    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind === 'ready') {
      expect(outcome.candidates[0]?.resolution).toEqual({ status: 'unresolved', reason: 'timed_out' });
    }
  });
});

describe('runImport — heartbeats keep the stream non-idle (07 §5)', () => {
  it('emits at least one heartbeat while a slow port call is in flight', async () => {
    const ports = makePorts({
      heartbeatIntervalMs: 1,
      clock: {
        ...makeQuietClock(),
        sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      },
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async (externalId) =>
          new Promise((resolve) => setTimeout(() => resolve(rawSourceFixture(externalId)), 20)),
      },
    });

    const events = await collect(ports, makeInput());
    expect(events.some((e) => e.t === 'heartbeat')).toBe(true);
    expect(terminalOutcome(events).kind).toBe('ready');
  });
});

describe('runImport — every one of the 13 DomainErrorCodes is a reachable failed outcome (07 §9)', () => {
  const seen = new Set<DomainErrorCode>();

  async function expectFailed(ports: Ports, input: ImportInput, code: DomainErrorCode): Promise<void> {
    seen.add(code);
    const events = await collect(ports, input);
    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.error.code).toBe(code);
      expect(outcome.importId).toBe(importId);
    }
    // A failed outcome is still the terminal event — nothing after it, and no raw error escapes
    // the generator (this `await` already proves that: a thrown value here would fail the test).
    expect(events[events.length - 1]).toEqual({ t: 'done', outcome });
  }

  it('UNSUPPORTED_HOST — canonicaliser rejects a non-TikTok host', async () => {
    await expectFailed(makePorts(), makeInput({ rawInput: 'https://instagram.com/p/xyz' }), 'UNSUPPORTED_HOST');
  });

  it('MALFORMED_URL — canonicaliser rejects unparsable input', async () => {
    await expectFailed(makePorts(), makeInput({ rawInput: 'not a url at all' }), 'MALFORMED_URL');
  });

  it('UNSUPPORTED_URL — canonicaliser rejects a profile link', async () => {
    await expectFailed(makePorts(), makeInput({ rawInput: 'https://www.tiktok.com/@someone' }), 'UNSUPPORTED_URL');
  });

  it('SHORT_LINK_UNRESOLVED — the short-link hop exhausts its budget', async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => {
          throw shortLinkUnresolved();
        },
        fetch: async (externalId) => rawSourceFixture(externalId),
      },
    });
    await expectFailed(ports, makeInput({ rawInput: VALID_SHORT_LINK_URL }), 'SHORT_LINK_UNRESOLVED');
  });

  it('POST_UNAVAILABLE — oEmbed returns its one honest failure', async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async () => {
          throw postUnavailable();
        },
      },
    });
    await expectFailed(ports, makeInput(), 'POST_UNAVAILABLE');
  });

  it('UPSTREAM_TIMEOUT — stage A exhausts its deadline', async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async () => {
          throw upstreamTimeout();
        },
      },
    });
    await expectFailed(ports, makeInput(), 'UPSTREAM_TIMEOUT');
  });

  it('RATE_LIMITED_UPSTREAM — reserved, but a distinct reachable code', async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async () => {
          throw rateLimitedUpstream();
        },
      },
    });
    await expectFailed(ports, makeInput(), 'RATE_LIMITED_UPSTREAM');
  });

  it('RATE_LIMITED_LOCAL — raised, in production, by the route handler before this pipeline is ' +
    'ever invoked (07 §9); proven reachable here via a fake ImportStore to show runImport maps ' +
    'any DomainError from any port uniformly, not by special-casing which stage raised it', async () => {
    const ports = makePorts({
      store: {
        recordStage: async () => {
          throw rateLimitedLocal();
        },
        finish: async () => {},
      },
    });
    await expectFailed(ports, makeInput(), 'RATE_LIMITED_LOCAL');
  });

  it('NO_CAPTION — every content extractor declines or returns nothing usable', async () => {
    const ports = makePorts({ content: [captionExtractor([])] });
    await expectFailed(ports, makeInput(), 'NO_CAPTION');
  });

  it('EXTRACTOR_UNAVAILABLE — the LLM adapter fails transport-side', async () => {
    const ports = makePorts({
      extractor: {
        version: 'v1',
        promptVersion: 'p1',
        extract: async () => {
          throw extractorUnavailable();
        },
      },
    });
    await expectFailed(ports, makeInput(), 'EXTRACTOR_UNAVAILABLE');
  });

  it('EXTRACTOR_INVALID_OUTPUT — the structured-output Zod parse fails after one reprompt', async () => {
    const ports = makePorts({
      extractor: {
        version: 'v1',
        promptVersion: 'p1',
        extract: async () => {
          throw extractorInvalidOutput();
        },
      },
    });
    await expectFailed(ports, makeInput(), 'EXTRACTOR_INVALID_OUTPUT');
  });

  it('NOT_AUTHENTICATED — raised, in production, by the route handler pre-A (07 §9); proven ' +
    'reachable here the same way as RATE_LIMITED_LOCAL, via a fake port, for the same reason', async () => {
    const ports = makePorts({ content: [{ id: 'caption', supports: () => true, extract: async () => {
      throw notAuthenticated();
    } }] });
    await expectFailed(ports, makeInput(), 'NOT_AUTHENTICATED');
  });

  it('INTERNAL — the union floor, for anything a port throws that is not itself a DomainError', async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async () => {
          throw new Error('a bug, not a domain condition');
        },
      },
    });
    await expectFailed(ports, makeInput(), 'INTERNAL');
  });

  it('proves all 13 codes were exercised above, none left out', () => {
    expect(seen.size).toBe(13);
    expect([...seen].sort()).toEqual([...DOMAIN_ERROR_CODES].sort());
  });
});

describe('runImport — no raw error object ever crosses the generator boundary (07 §9)', () => {
  it("a DomainError's message and cause never leak into the outcome's error view", async () => {
    const ports = makePorts({
      source: {
        platform: 'tiktok',
        resolveShortLink: async () => ({ externalId: '9999999999999999999' }),
        fetch: async () => {
          throw postUnavailable('the vendor said something we must never repeat verbatim');
        },
      },
    });
    const events = await collect(ports, makeInput());
    const outcome = terminalOutcome(events);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(Object.keys(outcome.error).sort()).toEqual(['code', 'importId', 'retryable']);
    }
  });

  it('finish() itself failing does not prevent the true outcome from being yielded', async () => {
    const ports = makePorts({
      store: {
        recordStage: async () => {},
        finish: async () => {
          throw new Error('write failed');
        },
      },
    });
    // Force a failure path (extractor throws) so finish() is reached from the catch branch too.
    const failingPorts: Ports = {
      ...ports,
      extractor: {
        version: 'v1',
        promptVersion: 'p1',
        extract: async () => {
          throw extractorUnavailable();
        },
      },
    };
    const events = await collect(failingPorts, makeInput());
    expect(terminalOutcome(events).kind).toBe('failed');
    expect(events[events.length - 1]?.t).toBe('done');
  });
});
