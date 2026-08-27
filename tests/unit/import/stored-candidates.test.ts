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

/** v3 added `nameVariants`. As with V1_ROW, V2_ROW's *absence* of that key is the test. */
const V3_ROW_EXTRA = { nameVariants: ['Kohi'] };

const V2_ROW = {
  ...V1_ROW,
  areaHint: 'Market Row',
  tags: ['italian', 'hidden gem'],
  dishes: ['the sabich'],
  whyGo: { text: 'Seasonal Italian plates in a tucked-away market row.', groundedIn: 'in Market Row, Brixton' },
};

describe('parseStoredCandidates', () => {
  it('reads a v3 row as v3, keeping its name variants', () => {
    const result = parseStoredCandidates([{ ...V2_ROW, ...V3_ROW_EXTRA }]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(3);
    expect(result.candidates[0]?.candidate.nameVariants).toEqual(['Kohi']);
  });

  // REGRESSION (TLV-BILING, 2026-08-28). Adding a required `nameVariants` to the candidate schema
  // made every row already in `extractions` unparseable. The probe path was safe — `PROMPT_VERSION`
  // moved, so it misses the cache and re-extracts — but **confirm** looks a row up by an id the
  // client is already holding, so a user mid-import got a 500 on the one screen where their work
  // was about to be saved. The version ladder is the whole defence; this test is the proof it holds
  // for the shape that was actually in the database when the field landed.
  it('reads a real p7-s2 row — v2 fields present, no nameVariants key — as v2, not as invalid', () => {
    const result = parseStoredCandidates([V2_ROW]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(2);
    // Absent, therefore empty — and `schemaVersion: 2` beside it is what stops that being a lie.
    expect(result.candidates[0]?.candidate.nameVariants).toEqual([]);
  });

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

/**
 * The `resolution` sibling (TLV-RESOLVE-T3). It rides *inside* each candidate object rather than in
 * a parallel array, because `ConfirmItem.candidateIndex` addresses this array and two arrays are one
 * off-by-one away from saving a different place than the user picked.
 */
describe('parseStoredCandidates — the resolution sibling', () => {
  const RESOLUTION = {
    kind: 'answered',
    result: {
      shortlist: [
        {
          place: {
            provider: 'overture',
            providerPlaceId: 'gers-1',
            sourceDataset: 'overture-places',
            regionId: 'tlv',
            name: 'HaKosem Falafel',
            altNames: [],
            providerCategory: 'falafel_shop',
            addressLine: null,
            locality: 'Tel Aviv',
            lat: 32.07515,
            lng: 34.77291,
            datasetConfidence: 0.87,
          },
          score: 0.93,
          nameScore: 0.95,
          tokenCoverage: 1,
          categoryScore: 1,
        },
      ],
      confidence: { band: 'preselect', score: 0.93, margin: 0.4 },
      regionsSearched: ['tlv'],
      candidatesPrefiltered: 21,
    },
  };

  it('reads it back off a v2 row without disturbing the candidate', () => {
    const result = parseStoredCandidates([{ ...V2_ROW, resolution: RESOLUTION }]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(2);
    expect(result.candidates[0]?.candidate.rawName).toBe('Ha Kosem');
    expect(result.candidates[0]?.resolution).toMatchObject({ kind: 'answered' });
  });

  it('reads it back off a v1 row too — the two are independent', () => {
    // A v1 candidate re-pasted today gets resolved and backfilled by the probe route, so the pairing
    // v1-candidate + v2-era resolution is a real row shape, not a hypothetical one.
    const result = parseStoredCandidates([{ ...V1_ROW, resolution: RESOLUTION }]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.schemaVersion).toBe(1);
    expect(result.candidates[0]?.resolution).toMatchObject({ kind: 'answered' });
  });

  it('reports null — never a guess — for a row written before the resolver existed', () => {
    // Six such rows exist on the local database. `null` means "never asked", which is deliberately
    // not the same value as "asked and matched nothing".
    const result = parseStoredCandidates([V2_ROW]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.resolution).toBeNull();
  });

  it('drops an unreadable resolution without costing the candidate its save', () => {
    // A shape from a future schema, or a corrupted row. Losing the Overture coordinate is the right
    // cost; losing the save is not, and a 500 for the whole batch certainly is not.
    const result = parseStoredCandidates([
      { ...V2_ROW, resolution: { kind: 'answered', result: { shortlist: 'not an array' } } },
    ]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.resolution).toBeNull();
  });

  it('refuses a shortlist entry with an out-of-range coordinate', () => {
    // The stored column is boundary data like any provider response — parsed, not trusted, even
    // though only a service-role write can have put it there.
    const bad = structuredClone(RESOLUTION);
    bad.result.shortlist[0]!.place.lat = 999;

    const result = parseStoredCandidates([{ ...V2_ROW, resolution: bad }]);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.candidates[0]?.resolution).toBeNull();
  });
});
