/**
 * Reading `extractions.candidates` back across schema versions (`domain/import/stored-candidates.ts`).
 *
 * The v1 fixture below is **genuinely v1-shaped** — it is the field set as it was written before
 * `areaHint`/`tags`/`dishes`/`whyGo` existed, with those four keys absent rather than present-and-
 * empty. That distinction is the whole point of these tests: `tags: []` on the wire and no `tags`
 * key at all are two different rows saying two different things, and the code must not conflate
 * them. Four such rows exist on the local database today (`prompt_version = 'p6'`).
 */
import { describe, expect, it } from 'vitest';

import { parseStoredCandidates } from '@/domain/import/stored-candidates';

/** Exactly what schema v1 wrote. Do not add the v2 keys to this object — its absences are the test. */
const V1_ROW = {
  rawName: 'Ha Kosem',
  cityHint: 'Tel Aviv',
  countryHint: 'Israel',
  categoryHint: 'restaurant',
  addressHint: null,
  evidence: 'Ha Kosem',
  modelConfidence: 0.9,
  identifiedName: 'HaKosem',
  coordinates: { lat: 32.0708, lng: 34.7726 },
};

const V2_ROW = {
  ...V1_ROW,
  areaHint: 'Market Row',
  tags: ['italian', 'hidden gem'],
  dishes: ['the sabich'],
  whyGo: { text: 'Seasonal Italian plates in a tucked-away market row.', groundedIn: 'in Market Row, Brixton' },
};

describe('parseStoredCandidates', () => {
  it('reads a v2 row as v2, with its enrichment intact', () => {
    const result = parseStoredCandidates([V2_ROW]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.schemaVersion).toBe(2);
    expect(result.candidates[0]?.candidate.tags).toEqual(['italian', 'hidden gem']);
    expect(result.candidates[0]?.candidate.dishes).toEqual(['the sabich']);
    expect(result.candidates[0]?.candidate.areaHint).toBe('Market Row');
    expect(result.candidates[0]?.candidate.whyGo?.groundedIn).toBe('in Market Row, Brixton');
  });

  it('reads a genuinely v1-shaped row without crashing, and says it is v1', () => {
    const result = parseStoredCandidates([V1_ROW]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(1);
    // The place facts survive untouched — a v1 extraction id still saves the place it always did.
    expect(result.candidates[0]?.candidate.rawName).toBe('Ha Kosem');
    expect(result.candidates[0]?.candidate.coordinates).toEqual({ lat: 32.0708, lng: 34.7726 });
  });

  it('does not let a v1 row read as v2 — the empty values it gets are labelled, not measured', () => {
    const v1 = parseStoredCandidates([V1_ROW]);
    const v2Empty = parseStoredCandidates([{ ...V1_ROW, areaHint: null, tags: [], dishes: [], whyGo: null }]);

    expect(v1.kind).toBe('ok');
    expect(v2Empty.kind).toBe('ok');
    if (v1.kind !== 'ok' || v2Empty.kind !== 'ok') return;

    // The candidates are identical. Only `schemaVersion` tells "we could not look" from "we looked
    // and the caption supported nothing", which is why the confirm route branches on that and never
    // on `tags.length`.
    expect(v1.candidates[0]?.candidate).toEqual(v2Empty.candidates[0]?.candidate);
    expect(v1.candidates[0]?.schemaVersion).toBe(1);
    expect(v2Empty.candidates[0]?.schemaVersion).toBe(2);
  });

  it('tries v2 before v1, so a v2 row never loses its enrichment to the fallback', () => {
    // Zod strips unknown keys, so a v2 row parses cleanly against the v1 shape. If the order were
    // reversed every v2 row would silently come back as v1 with no tags — and every test above
    // except this one would still pass.
    const result = parseStoredCandidates([V2_ROW]);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.candidates[0]?.schemaVersion).toBe(2);
    expect(result.candidates[0]?.candidate.tags).not.toEqual([]);
  });

  it('handles a mixed array per element rather than failing the whole batch', () => {
    const result = parseStoredCandidates([V2_ROW, V1_ROW]);
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.candidates.map((c) => c.schemaVersion)).toEqual([2, 1]);
  });

  it('treats a null / absent candidates column as a legal empty extraction, not an error', () => {
    // "No places found" is the modal import outcome (`mvp-plan.md`), and a zero-candidate row is
    // written for it. Answering 500 here would fail the commonest import there is.
    expect(parseStoredCandidates(null)).toEqual({ kind: 'ok', candidates: [] });
    expect(parseStoredCandidates([])).toEqual({ kind: 'ok', candidates: [] });
  });

  it('reports invalid when a row is neither shape', () => {
    expect(parseStoredCandidates([{ rawName: 'x' }]).kind).toBe('invalid');
    expect(parseStoredCandidates('not an array').kind).toBe('invalid');
  });

  it('rejects a row that violates a shared bound, in either version', () => {
    // The v1 fallback is a *subset* of v2's rules, never a relaxation of them: a v1 row still has
    // to satisfy every bound v1 itself imposed.
    expect(parseStoredCandidates([{ ...V1_ROW, coordinates: { lat: 999, lng: 0 } }]).kind).toBe('invalid');
    expect(parseStoredCandidates([{ ...V2_ROW, rawName: 'x' }]).kind).toBe('invalid');
  });
});
