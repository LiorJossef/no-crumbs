import { describe, expect, it } from 'vitest';

import type { PlaceCandidate } from '@/domain/types';
import type { OpCtx } from '@/domain/ports';
import { postProcessCandidates } from '@/integrations/llm/post-process';

function ctx(events: { name: string; fields: Record<string, unknown> }[]): OpCtx {
  return {
    signal: new AbortController().signal,
    importId: null,
    log: { event: (name, fields) => { events.push({ name, fields }); } },
  };
}

function candidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    rawName: 'La Nonna',
    cityHint: 'London',
    countryHint: null,
    areaHint: null,
    categoryHint: 'restaurant',
    addressHint: null,
    evidence: 'La Nonna',
    modelConfidence: 0.8,
    identifiedName: null,
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
    ...overrides,
  };
}

const CAPTION = 'La Nonna in Market Row, Brixton for delicious artisan pasta';

/**
 * Both gates in one place, in one order, called by both adapters. The order is the thing worth
 * pinning: grounding must not spend work on — or report counters for — candidates that
 * plausibility is about to discard.
 */
describe('postProcessCandidates', () => {
  it('runs plausibility first, so a discarded candidate never reaches the grounding counters', () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    const kept = postProcessCandidates(
      [
        candidate(),
        // Dropped by `filterPlausible` (a handle is never a venue) — its junk tags and ungrounded
        // summary must not be counted as grounding problems.
        candidate({
          rawName: '@londonfoodie',
          evidence: null,
          tags: ['food', 'restaurant'],
          whyGo: { text: 'Invented.', groundedIn: 'nothing like this in the caption' },
        }),
      ],
      CAPTION,
      ctx(events),
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.rawName).toBe('La Nonna');
    const grounding = events.find((e) => e.name === 'extraction.grounding');
    expect(grounding).toBeUndefined();
    expect(events.find((e) => e.name === 'extraction.plausibility_dropped')?.fields.total).toBe(1);
  });

  it('logs grounding counters when a surviving candidate needed cleaning', () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    postProcessCandidates(
      [candidate({ tags: ['Italian', 'italian'], whyGo: { text: 'x'.repeat(10), groundedIn: 'not in the caption' } })],
      CAPTION,
      ctx(events),
    );

    const grounding = events.find((e) => e.name === 'extraction.grounding');
    expect(grounding?.fields.why_go_ungrounded).toBe(1);
    expect(grounding?.fields.tag_dropped).toBe(1);
  });

  it('logs nothing when everything the model returned was clean', () => {
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    postProcessCandidates([candidate({ tags: ['Italian'] })], CAPTION, ctx(events));
    expect(events).toEqual([]);
  });

  it('never logs caption text or a candidate name', () => {
    // `07` §7.1: structured logging, scalar fields only.
    const events: { name: string; fields: Record<string, unknown> }[] = [];
    postProcessCandidates(
      [candidate({ rawName: '@londonfoodie', evidence: null })],
      CAPTION,
      ctx(events),
    );
    for (const event of events) {
      for (const value of Object.values(event.fields)) {
        expect(typeof value).toBe('number');
      }
    }
  });
});
