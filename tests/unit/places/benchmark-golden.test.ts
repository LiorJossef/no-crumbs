/**
 * MS5 exit criteria 2 and 3: the 44-case benchmark, replayed through the TypeScript port.
 *
 * The evidence is read from `docs/evidence/places/raw-overture-scored.json` — the file
 * `resolve-overture-scored.py` wrote and every number in `06` §6.3 came out of — plus
 * `benchmark-spec.json` for the category hints and `adjudication.json` for the hand verdicts.
 * Nothing is copied into this test: a regenerated evidence file must move this test, not be
 * silently outvoted by a transcribed constant. The only literals here are the band expectation
 * (exit 2 is *"the same case in each band"*, and a tally alone cannot say that) and the five
 * rounding-boundary rows.
 *
 * Rounding is `Number(x.toFixed(3))`, never `Math.round(x * 1000) / 1000`. Five rows sit on a
 * `.0005` boundary whose double is a hair below the half (`0.92849999999999999201`, recorded
 * `0.928`); Python's `round()` and `toFixed()` both go down there and `Math.round` goes up. The
 * five are pinned below so the rule is a test, not a comment.
 *
 * ## What this file proves, and what it cannot
 *
 * The golden file records each case's **top-5 only**, with `name`, `category`, `lat`, `lon`,
 * `overture_id` and the four scores. It does **not** record the candidate rows that lost, and it
 * does **not** record the per-row Overture `confidence` the prototype fed into
 * `0.10 * (conf or 0.5)`. So:
 *
 *  - `name_score`, `token_cov` and `cat_match` are replayed exactly, all 220 rows. Those three
 *    depend only on the query, the name and the category, all of which the file carries.
 *  - `score` is **not** exactly replayable, and this test does not pretend otherwise. Inverting
 *    the recorded `score` against our exact `name_score` implies a per-row `dataset_confidence`
 *    spread over 0.27–1.00, so `conf` was a real Overture column and not the 0.5 default of
 *    `poi_index.dataset_confidence` (migration 0010). What *is* provable without it is the score
 *    arithmetic itself: `conf` cancels when the same POI appears in two different cases, and
 *    `Δscore = 0.72·Δname_score + 0.18·Δcat_match` is then an exact statement about the weights.
 *    27 such pairs exist; 18 of them have a different `name_score` on the two sides.
 *  - the **ranking** over the full prefilter (18–2 904 rows per query, `06` §6.1 step 3) is not
 *    replayable either, for the same reason: without each row's confidence, a re-sort of the
 *    recorded five is a sort on numbers we cannot reconstruct. `rankPlaces`'s comparator is tested
 *    on constructed rows in `score.test.ts`; task 7 re-tests ranking through the real index, where
 *    `poi_index.dataset_confidence` exists as a column.
 *  - the **bands** are therefore decided from the file's own recorded scores rather than from
 *    re-scored candidates: this exercises `confidenceOf`, `SCORING.bands` and the margin gate
 *    against the measured numbers, and it is exactly what exit 2 asks — same case in each band.
 *    The rounding is shown to be harmless: no top-1 score is within 0.0005 of the 0.92 or 0.80
 *    gate and no margin is within 0.0005 of the 0.05 gate, and the bands are identical under both
 *    readings of the margin (the file's `round(top1 − top2, 3)` and the difference of the two
 *    rounded scores, which differ by up to 0.001).
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { ConfidenceBand, RankedPlace, ResolvedPlace } from '@/domain/types';
import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';
import { categoryScore, confidenceOf, nameScore } from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';

/* ------------------------------------------------------------------------------------------- *
 * The evidence, as it is on disk
 * ------------------------------------------------------------------------------------------- */

interface GoldenResult {
  readonly name: string;
  readonly category: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly overture_id: string;
  readonly score: number;
  readonly name_score: number;
  readonly token_cov: number;
  readonly cat_match: number;
}

interface GoldenCase {
  readonly query: string;
  readonly city_scope: string;
  readonly candidates_prefiltered: number;
  readonly margin_top1_top2: number;
  readonly results: readonly GoldenResult[];
}

interface SpecCase {
  readonly id: string;
  readonly query: string;
  readonly city_hint: string | null;
  readonly category_hint: ExtractedCategoryHint | null;
}

const golden = JSON.parse(
  readFileSync('docs/evidence/places/raw-overture-scored.json', 'utf8'),
) as Readonly<Record<string, GoldenCase>>;

const spec = JSON.parse(readFileSync('docs/evidence/places/benchmark-spec.json', 'utf8')) as {
  readonly cases: readonly SpecCase[];
};

const adjudication = JSON.parse(
  readFileSync('docs/evidence/places/adjudication.json', 'utf8'),
) as { readonly verdicts: Readonly<Record<string, Readonly<Record<string, string>>>> };

const specById = new Map(spec.cases.map((c) => [c.id, c]));
const caseIds = Object.keys(golden);
const rowCount = caseIds.reduce((n, id) => n + golden[id]!.results.length, 0);

const round3 = (value: number): number => Number(value.toFixed(3));

/* ------------------------------------------------------------------------------------------- *
 * Expectations that are judgements rather than data
 * ------------------------------------------------------------------------------------------- */

/**
 * `06` §6.3's band table, case by case. Everything not named here is `preselect` — writing the
 * 29 out would make the file harder to diff, and the tally test below is what closes the gap.
 *
 * These 15 are not free parameters: they are the measurement. A case moving in or out of this
 * list is the exit-criterion-2 failure ("a case that drifts preselect → confirm is a failure, not
 * a pass with a smaller number"), and it must be argued in the plan before it is edited here.
 */
const NOT_PRESELECT: Readonly<Record<string, ConfidenceBand>> = {
  'TYO-07': 'confirm', // AFURI — five branches, margin 0.002
  'TYO-09': 'confirm', // 猿田彦珈琲 — margin 0.001
  'TYO-10': 'confirm', // むぎとオリーブ
  'TLV-02': 'no_match', // Cafe Levinsky 41 — absent from Overture
  'TLV-07': 'confirm', // הקוסם
  'TLV-08': 'confirm', // Orna and Ella — absent from Overture
  'TLV-10': 'no_match', // mis-ranked
  'TLV-13': 'no_match', // mis-ranked
  'TLV-14': 'confirm',
  'LDN-01': 'confirm', // Monmouth Coffee — margin 0.012
  'LDN-03': 'confirm', // The Dove — margin 0.000
  'LDN-13': 'confirm', // Kiln — margin 0.048, just under the gate
  'NEG-01': 'confirm', // "this hidden gem in Shoreditch"
  'NEG-02': 'confirm', // "best coffee ever"
  'NEG-03': 'confirm', // "that little wine bar near the market"
};

/**
 * The five rows whose `name_score` lands a hair below a `.0005` boundary. Pinned by value, not by
 * tolerance: this is the one rounding rule the whole golden file rests on.
 */
const ROUNDING_BOUNDARY_ROWS: readonly {
  readonly caseId: string;
  readonly name: string;
  readonly recorded: number;
}[] = [
  { caseId: 'TYO-02', name: 'Onibus Coffee Yakumo', recorded: 0.928 },
  { caseId: 'TYO-04', name: 'KOFFEE MAMEYA Kakeru', recorded: 0.928 },
  { caseId: 'TYO-14', name: 'KOFFEE MAMEYA Kakeru', recorded: 0.928 },
  { caseId: 'LDN-02', name: 'Bar Termini Centrale', recorded: 0.919 },
  { caseId: 'LDN-13', name: 'The Andover Arms', recorded: 0.898 },
];

/* ------------------------------------------------------------------------------------------- *
 * Replay
 * ------------------------------------------------------------------------------------------- */

interface ReplayedRow {
  readonly caseId: string;
  readonly row: GoldenResult;
  readonly nameScore: number;
  readonly tokenCoverage: number;
  readonly categoryScore: 0 | 1;
}

/** Every recorded result row, re-scored by the port. Computed once; the tests read it. */
const replayed: readonly ReplayedRow[] = caseIds.flatMap((caseId) => {
  const goldenCase = golden[caseId]!;
  const specCase = specById.get(caseId);
  if (specCase === undefined) throw new Error(`no spec case for ${caseId}`);
  const hint = categoryHintFor(specCase.category_hint);
  return goldenCase.results.map((row) => {
    const name = nameScore(goldenCase.query, row.name);
    return {
      caseId,
      row,
      nameScore: name.nameScore,
      tokenCoverage: name.tokenCoverage,
      categoryScore: categoryScore(hint, row.category),
    };
  });
});

describe('the evidence file is the shape this test assumes', () => {
  it('holds all 44 benchmark cases and 220 result rows', () => {
    // A truncated or regenerated file must fail loudly here rather than turn the replay below
    // into a green test over three rows.
    expect(caseIds.length).toBe(44);
    expect(rowCount).toBe(220);
    expect([...caseIds].sort()).toEqual(spec.cases.map((c) => c.id).sort());
  });

  it('carries the same query text as the spec, so both sides scored the same string', () => {
    for (const caseId of caseIds) {
      expect(golden[caseId]!.query).toBe(specById.get(caseId)!.query);
    }
  });

  it('uses only category hints the scorer can score, through the total conversion', () => {
    // All 44 hints are already `CategoryHint`s, so `categoryHintFor` is the identity here — but
    // the resolver's real input is `09` §4.2's seven-value enum, and indexing `CAT_TOKENS`
    // directly is the `KeyError` that `11` §2 ruling 9 exists to prevent.
    for (const specCase of spec.cases) {
      expect(['cafe', 'bar', 'restaurant']).toContain(specCase.category_hint);
      expect(categoryHintFor(specCase.category_hint)).toBe(specCase.category_hint);
    }
  });

  it('never exercises the single-candidate margin, so divergence 1 is untested by the benchmark', () => {
    // Every case recorded a full top-5, so the prototype's `margin = 1.0` branch never fired and
    // the port's `margin: null` (`10` §12 Q3, banded `confirm`) cannot be validated from this
    // file. It is covered by construction in `score.test.ts` instead.
    for (const caseId of caseIds) {
      expect(golden[caseId]!.results.length).toBe(5);
      expect(golden[caseId]!.margin_top1_top2).not.toBe(1);
    }
  });

  it('records its results in descending score order', () => {
    for (const caseId of caseIds) {
      const scores = golden[caseId]!.results.map((r) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
  });
});

describe('exit 3 — every recorded row replays through the port', () => {
  it('reproduces name_score, token_cov and cat_match on all 220 rows', () => {
    const divergent = replayed
      .filter(
        (r) =>
          round3(r.nameScore) !== r.row.name_score ||
          round3(r.tokenCoverage) !== r.row.token_cov ||
          r.categoryScore !== r.row.cat_match,
      )
      .map(
        (r) =>
          `${r.caseId} ${JSON.stringify(r.row.name)}: ` +
          `name_score ${r.nameScore} (golden ${r.row.name_score}), ` +
          `token_cov ${r.tokenCoverage} (golden ${r.row.token_cov}), ` +
          `cat_match ${r.categoryScore} (golden ${r.row.cat_match})`,
      );
    expect(divergent).toEqual([]);
    expect(replayed.length).toBe(220);
  });

  it('rounds with toFixed, and Math.round would break exactly these five rows', () => {
    for (const pinned of ROUNDING_BOUNDARY_ROWS) {
      const row = replayed.find((r) => r.caseId === pinned.caseId && r.row.name === pinned.name);
      expect(row, `${pinned.caseId} ${pinned.name}`).toBeDefined();
      expect(row!.row.name_score).toBe(pinned.recorded);
      expect(Number(row!.nameScore.toFixed(3))).toBe(pinned.recorded);
      expect(Math.round(row!.nameScore * 1000) / 1000).not.toBe(pinned.recorded);
    }
    const wouldBreak = replayed.filter(
      (r) =>
        Math.round(r.nameScore * 1000) / 1000 !== r.row.name_score ||
        Math.round(r.tokenCoverage * 1000) / 1000 !== r.row.token_cov,
    );
    expect(wouldBreak.length).toBe(ROUNDING_BOUNDARY_ROWS.length);
  });
});

describe('exit 3 — the score column, and the confidence the file does not record', () => {
  /** `score = 0.72·name_score + 0.18·cat_match + 0.10·conf`, solved for `conf`. */
  const impliedConfidence = (r: ReplayedRow): number =>
    (r.row.score - SCORING.total.name * r.nameScore - SCORING.total.category * r.categoryScore) /
    SCORING.total.datasetConfidence;

  it('shows the prototype used a per-row Overture confidence, not 0.5', () => {
    // The reason `score` is not replayable row by row, stated as an assertion rather than as
    // prose: with `conf = 0.5` **none** of the 220 rows reproduces, and the implied confidence
    // ranges over most of [0,1]. `poi_index.dataset_confidence`'s 0.5 default is a fact about our
    // table, not about what the prototype read out of the parquet.
    const reproducedAtHalf = replayed.filter(
      (r) =>
        round3(
          SCORING.total.name * r.nameScore +
            SCORING.total.category * r.categoryScore +
            SCORING.total.datasetConfidence * 0.5,
        ) === r.row.score,
    );
    expect(reproducedAtHalf).toEqual([]);

    const implied = replayed.map(impliedConfidence);
    expect(Math.min(...implied)).toBeLessThan(0.3);
    expect(Math.max(...implied)).toBeGreaterThan(0.99);
  });

  it('implies a confidence inside [0,1] for every row', () => {
    // Weak, but not nothing: a wrong weight or a wrong `name_score` would push rows outside the
    // range the column can hold. The ±0.0005 is the recorded score's own rounding, divided by the
    // 0.10 weight.
    const slack = 0.0005 / SCORING.total.datasetConfidence;
    const outside = replayed
      .map((r) => ({ r, conf: impliedConfidence(r) }))
      .filter(({ conf }) => conf < -slack || conf > 1 + slack)
      .map(({ r, conf }) => `${r.caseId} ${r.row.name}: implied confidence ${conf}`);
    expect(outside).toEqual([]);
  });

  it('reproduces the score difference where the same POI appears in two cases', () => {
    // The confidence-free test of the score weights: the same `overture_id` carries the same
    // (unrecorded) confidence in both cases, so it cancels out of the difference and
    // `Δscore = 0.72·Δname_score + 0.18·Δcat_match` is exact up to the 2 × 0.0005 rounding of the
    // two recorded scores. This is the strongest statement the evidence supports about `score`.
    const byPlace = new Map<string, ReplayedRow[]>();
    for (const r of replayed) {
      const rows = byPlace.get(r.row.overture_id);
      if (rows === undefined) byPlace.set(r.row.overture_id, [r]);
      else rows.push(r);
    }

    let pairs = 0;
    let informative = 0;
    let worst = 0;
    const violations: string[] = [];
    for (const rows of byPlace.values()) {
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const a = rows[i]!;
          const b = rows[j]!;
          pairs += 1;
          if (a.nameScore !== b.nameScore || a.categoryScore !== b.categoryScore) informative += 1;
          const predicted =
            SCORING.total.name * (a.nameScore - b.nameScore) +
            SCORING.total.category * (a.categoryScore - b.categoryScore);
          const deviation = Math.abs(a.row.score - b.row.score - predicted);
          worst = Math.max(worst, deviation);
          if (deviation > 0.001) {
            violations.push(
              `${a.row.overture_id} in ${a.caseId} vs ${b.caseId}: ` +
                `Δscore ${a.row.score - b.row.score}, predicted ${predicted}`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
    expect(pairs).toBe(27);
    expect(informative).toBe(18);
    expect(worst).toBeLessThanOrEqual(0.001);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Exit 2 — the bands
 * ------------------------------------------------------------------------------------------- */

/**
 * A ranked list carrying the file's own recorded scores. The other fields are filled from the
 * recorded row so a failure names a real place, but only `score` reaches `confidenceOf`.
 *
 * `margin` chooses which of the two readings of the top-1/top-2 gap to feed in. The file's
 * `margin_top1_top2` is `round(top1 − top2, 3)` over the *unrounded* scores and can differ by
 * 0.001 from the difference of the two rounded scores; both are exercised below.
 */
function rankingOf(caseId: string, margin: 'recorded' | 'derived'): RankedPlace[] {
  const goldenCase = golden[caseId]!;
  const ranked = goldenCase.results.map((row, index) => {
    const place: ResolvedPlace = {
      provider: 'overture',
      providerPlaceId: row.overture_id,
      sourceDataset: 'overture-places',
      regionId: goldenCase.city_scope === 'ALL' ? null : goldenCase.city_scope,
      name: row.name,
      altNames: [],
      providerCategory: row.category,
      addressLine: null,
      locality: null,
      lat: row.lat,
      lng: row.lon,
      // Unrecorded by the evidence and deliberately not invented. `NaN` rather than 0.5 so that
      // a future edit which starts *scoring* these rows fails loudly instead of quietly scoring
      // them against a confidence nobody measured.
      datasetConfidence: Number.NaN,
    };
    const score =
      margin === 'recorded' && index === 1
        ? goldenCase.results[0]!.score - goldenCase.margin_top1_top2
        : row.score;
    return {
      place,
      score,
      nameScore: row.name_score,
      tokenCoverage: row.token_cov,
      categoryScore: (row.cat_match === 1 ? 1 : 0) as 0 | 1,
    };
  });
  return ranked;
}

const bandOf = (caseId: string, margin: 'recorded' | 'derived'): ConfidenceBand =>
  confidenceOf(rankingOf(caseId, margin)).band;

describe('exit 2 — band for band on all 44 cases', () => {
  it('puts the same case in the same band as the measurement', () => {
    const drifted: string[] = [];
    for (const caseId of caseIds) {
      const expected = NOT_PRESELECT[caseId] ?? 'preselect';
      const actual = bandOf(caseId, 'recorded');
      if (actual !== expected) {
        const c = golden[caseId]!;
        drifted.push(
          `${caseId} ${JSON.stringify(c.query)}: expected ${expected}, got ${actual} ` +
            `(score ${c.results[0]!.score}, margin ${c.margin_top1_top2})`,
        );
      }
    }
    expect(drifted).toEqual([]);
  });

  it('tallies 29 preselect / 12 confirm / 3 no_match', () => {
    const tally = { preselect: 0, confirm: 0, no_match: 0 };
    for (const caseId of caseIds) tally[bandOf(caseId, 'recorded')] += 1;
    expect(tally).toEqual({ preselect: 29, confirm: 12, no_match: 3 });
  });

  it('is not sensitive to how the recorded margin was rounded', () => {
    // The file rounds the margin from the unrounded scores; a reader differencing the two rounded
    // scores gets a value up to 0.001 away. If a band depended on that choice, the 29/12/3 above
    // would be an artefact of the evidence format rather than a property of the scorer.
    for (const caseId of caseIds) {
      expect(bandOf(caseId, 'derived'), caseId).toBe(bandOf(caseId, 'recorded'));
    }
  });

  it('keeps every case clear of the gates by more than the rounding', () => {
    // The scores in the file are rounded to three decimals, so a case within 0.0005 of a gate
    // would make the band above unprovable from this evidence. None is: the closest are TLV-12
    // (0.004 over the 0.92 gate), TLV-10 (0.005 under the 0.80 gate) and TYO-02 (margin 0.001
    // over the 0.05 gate).
    for (const caseId of caseIds) {
      const c = golden[caseId]!;
      const top = c.results[0]!.score;
      expect(Math.abs(top - SCORING.bands.preselectScore), caseId).toBeGreaterThan(0.0005);
      expect(Math.abs(top - SCORING.bands.confirmScore), caseId).toBeGreaterThan(0.0005);
      expect(
        Math.abs(c.margin_top1_top2 - SCORING.bands.preselectMargin),
        caseId,
      ).toBeGreaterThan(0.0005);
    }
  });
});

describe('exit 2 — zero false auto-accepts', () => {
  const verdicts = adjudication.verdicts.overture_scored!;

  it('auto-accepts nothing the adjudication did not call correct', () => {
    // `preselect` is the only band that pre-ticks a row (`06` §6.2), so it is the only band where
    // a wrong top-1 costs the user something they did not ask for. Six of the 44 have a non-OK
    // verdict; the claim is that none of them is pre-ticked.
    const wrong = caseIds
      .filter((id) => verdicts[id] !== 'OK')
      .map((id) => ({ id, band: bandOf(id, 'recorded'), verdict: verdicts[id] }));
    expect(wrong.length).toBe(6);
    expect(wrong.filter((w) => w.band === 'preselect')).toEqual([]);
  });

  it('has an OK verdict for all 29 preselected cases', () => {
    const preselected = caseIds.filter((id) => bandOf(id, 'recorded') === 'preselect');
    expect(preselected.length).toBe(29);
    expect(preselected.filter((id) => verdicts[id] !== 'OK')).toEqual([]);
  });

  it('routes all three no-name captions away from auto-accept', () => {
    // `06` §6.3: 0.813–0.894, high enough to be dangerous under a naive 0.80 cut and caught by
    // the 0.92 gate. These are the cases the negative set exists for.
    for (const caseId of ['NEG-01', 'NEG-02', 'NEG-03']) {
      const confidence = confidenceOf(rankingOf(caseId, 'recorded'));
      expect(confidence.band, caseId).toBe('confirm');
      expect(confidence.score).toBeGreaterThanOrEqual(0.813);
      expect(confidence.score).toBeLessThanOrEqual(0.894);
    }
  });
});
