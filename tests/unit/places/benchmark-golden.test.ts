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
 *
 * ## The re-fit, and why this file now does two jobs (TLV-RANK-1, 2026-08-27)
 *
 * The evidence file is a **record of a run**, not a specification. When `SCORING` is re-fit — as
 * `06` §6.3 always said it would be, and as TLV-RANK-1 did for `total` and `generic` — the file
 * does not change, so a test that says "the port reproduces the file exactly" stops being a
 * fidelity check and starts being a veto on ever improving the scorer. Neither extreme is right:
 * dropping the replay loses the only proof the port is faithful, and regenerating the file loses
 * the only measurement that predates our code.
 *
 * So the file is split in two, and the split is the point:
 *
 *  - **Replay** uses `RECORDED_WEIGHTS` — the weights the evidence was measured at, 0.72/0.18/0.10
 *    — and `REFIT_DIVERGENCE`, which names every row whose `name_score` moved and by how much.
 *    215 of the 220 rows must still reproduce **exactly**; the five that moved are pinned by value.
 *    A sixth row drifting fails, and so does one of the five drifting further.
 *  - **Simulation** re-scores all 44 cases under whatever `SCORING.total` currently is, recovering
 *    each row's unrecorded Overture confidence from the recorded score (which is exact: `conf`
 *    appears linearly and every other term is recorded). It asserts the band table under the
 *    current weights, case by case, and re-asserts zero false auto-accepts there. This is the test
 *    that would have caught a re-fit that fixed two cases and broke three. It is also the only
 *    half that supplies a **query**, which is what runs the branch guard (`resimulatedConfidence`);
 *    the replay bands bare recorded scores and is untouched by band policy invented after the run.
 *
 * The simulation is honest about its one limit: the file records each case's **top 5**, so a row
 * that was sixth under the old weights and would be first under the new ones is invisible to it.
 * That is why the live harness (`tests/manual/tlv-resolve-benchmark.manual.ts`) exists, and why a
 * re-fit is not signed off on this file alone.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Confidence, ConfidenceBand, RankedPlace, ResolvedPlace } from '@/domain/types';
import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';
import {
  categoryScore,
  confidenceOf,
  nameScore,
  queryForms,
  rankPlaces,
} from '@/domain/places/score';
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
 * The weights the evidence was recorded at
 * ------------------------------------------------------------------------------------------- */

/**
 * `resolve-overture-scored.py`'s weights, as literals.
 *
 * Every `score` in the evidence file was produced with these, so every statement this file makes
 * *about the file* — the implied confidence, the same-POI score difference — has to use them.
 * Reading them from `SCORING.total` instead was correct only while the two happened to be equal,
 * and it silently turned four assertions about a 2026-07 measurement into assertions about
 * whatever the scorer weighs today. TLV-RANK-1 is where they stopped being equal.
 *
 * These are a transcription of the prototype and must never be "updated". The current weights are
 * pinned separately, in `CURRENT_WEIGHTS` below, and the gap between the two is the re-fit.
 */
const RECORDED_WEIGHTS = { name: 0.72, category: 0.18, datasetConfidence: 0.1 } as const;

/**
 * `SCORING.total` as it stands, pinned so a re-fit is always a deliberate two-file diff.
 *
 * Not a duplicate of the constant: the point is that changing `scoring-constants.ts` alone turns
 * this red, which forces whoever changes it to come here and re-run the enumerations below —
 * exactly the "the benchmark is their regression test" clause of `06` §6.3, made mechanical.
 */
const CURRENT_WEIGHTS = { name: 1, category: 0, datasetConfidence: 0 } as const;

/**
 * Every row whose replayed `name_score` no longer equals the recorded one, and why.
 *
 * All five are TLV-10, *"Anita Gelato"*, and all five moved for one reason: TLV-RANK-1 added
 * `gelato` (and `bakery`) to `SCORING.generic`, so `gelato` stopped counting as an identity token.
 * Four rows that had been matching the query on the word `gelato` fall; `Anita Sarona`, which
 * matches on the only word that identifies anything, rises from 0.818 to 0.900 and takes rank 1.
 * That is the defect the change was made for, and this table is the receipt.
 *
 * Pinned to 12 decimal places, not to a tolerance. A tolerance here would quietly absorb the next
 * change to the generic list, which is the thing this table exists to make loud.
 */
const REFIT_DIVERGENCE: readonly {
  readonly caseId: string;
  readonly name: string;
  readonly recordedNameScore: number;
  readonly nameScoreNow: number;
  readonly tokenCoverageNow: number;
}[] = [
  {
    caseId: 'TLV-10',
    name: 'Zucca Cafe & Gelato',
    recordedNameScore: 0.716,
    nameScoreNow: 0.574411764706,
    tokenCoverageNow: 0.483333333333,
  },
  {
    caseId: 'TLV-10',
    name: 'Torta Della Nonna',
    recordedNameScore: 0.643,
    nameScoreNow: 0.575245098039,
    tokenCoverageNow: 0.6,
  },
  {
    caseId: 'TLV-10',
    name: 'PLAZO Cafe&Gelato ',
    recordedNameScore: 0.683,
    nameScoreNow: 0.541078431373,
    tokenCoverageNow: 0.483333333333,
  },
  {
    caseId: 'TLV-10',
    name: 'Stefan Austrian bakery&Artisanal Gelato',
    recordedNameScore: 0.573,
    nameScoreNow: 0.526282051282,
    tokenCoverageNow: 0.683333333333,
  },
  {
    caseId: 'TLV-10',
    name: 'Anita Sarona',
    recordedNameScore: 0.818,
    nameScoreNow: 0.9,
    tokenCoverageNow: 1,
  },
];

const isRefitDivergence = (r: ReplayedRow): boolean =>
  REFIT_DIVERGENCE.some((d) => d.caseId === r.caseId && d.name === r.row.name);

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
  it('reproduces name_score, token_cov and cat_match on the 215 rows the re-fit did not touch', () => {
    const divergent = replayed
      .filter((r) => !isRefitDivergence(r))
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
    // The exemption is five named rows and no more. A wider `REFIT_DIVERGENCE` is how a real
    // regression would get through this file, so its size is asserted, not implied.
    expect(replayed.filter(isRefitDivergence).length).toBe(5);
    expect(REFIT_DIVERGENCE.length).toBe(5);
  });

  it('moves exactly the five rows the generic-list re-fit was expected to move', () => {
    // The other half of the test above: not just "these are allowed to differ" but "these differ
    // by exactly this much". Pinned to 12 decimals — a tolerance would swallow the next edit to
    // `SCORING.generic`, which is precisely the edit this is here to expose.
    for (const pinned of REFIT_DIVERGENCE) {
      const row = replayed.find((r) => r.caseId === pinned.caseId && r.row.name === pinned.name);
      expect(row, `${pinned.caseId} ${pinned.name} is not in the evidence file`).toBeDefined();
      expect(row!.row.name_score, `${pinned.name} recorded`).toBe(pinned.recordedNameScore);
      expect(Number(row!.nameScore.toFixed(12)), `${pinned.name} now`).toBe(pinned.nameScoreNow);
      expect(Number(row!.tokenCoverage.toFixed(12)), `${pinned.name} coverage now`).toBe(
        pinned.tokenCoverageNow,
      );
      // `cat_match` is unaffected: the re-fit touched the name path only.
      expect(row!.categoryScore, `${pinned.name} category`).toBe(row!.row.cat_match);
    }
  });

  it('rounds with toFixed, and Math.round would break exactly these five rows', () => {
    for (const pinned of ROUNDING_BOUNDARY_ROWS) {
      const row = replayed.find((r) => r.caseId === pinned.caseId && r.row.name === pinned.name);
      expect(row, `${pinned.caseId} ${pinned.name}`).toBeDefined();
      expect(row!.row.name_score).toBe(pinned.recorded);
      expect(Number(row!.nameScore.toFixed(3))).toBe(pinned.recorded);
      expect(Math.round(row!.nameScore * 1000) / 1000).not.toBe(pinned.recorded);
    }
    // Over the rows that still replay. The five re-fit rows differ from the file under *either*
    // rounding rule, so counting them here would say nothing about rounding.
    const wouldBreak = replayed.filter(
      (r) =>
        !isRefitDivergence(r) &&
        (Math.round(r.nameScore * 1000) / 1000 !== r.row.name_score ||
          Math.round(r.tokenCoverage * 1000) / 1000 !== r.row.token_cov),
    );
    expect(wouldBreak.length).toBe(ROUNDING_BOUNDARY_ROWS.length);
  });
});

describe('exit 3 — the score column, and the confidence the file does not record', () => {
  /**
   * `score = 0.72·name_score + 0.18·cat_match + 0.10·conf`, solved for `conf`.
   *
   * `RECORDED_WEIGHTS`, not `SCORING.total`: this inverts a number that was *written down in 2026-07*
   * and the only weights that can invert it are the ones that produced it. Using the live constants
   * here made every assertion in this block silently depend on the current re-fit — with 0.80/0.10
   * they imply confidences above 1.2 for 124 rows, which says nothing about the data and everything
   * about mixing two different runs' arithmetic.
   *
   * The rows are the port's own `nameScore`, so a porting error still shows up here. The five
   * re-fit rows are excluded where that matters and named in `REFIT_DIVERGENCE`.
   */
  const impliedConfidence = (r: ReplayedRow): number =>
    (r.row.score -
      RECORDED_WEIGHTS.name * r.nameScore -
      RECORDED_WEIGHTS.category * r.categoryScore) /
    RECORDED_WEIGHTS.datasetConfidence;

  const replayedExactly = replayed.filter((r) => !isRefitDivergence(r));

  it('shows the prototype used a per-row Overture confidence, not 0.5', () => {
    // The reason `score` is not replayable row by row, stated as an assertion rather than as
    // prose: with `conf = 0.5` **none** of the 220 rows reproduces, and the implied confidence
    // ranges over most of [0,1]. `poi_index.dataset_confidence`'s 0.5 default is a fact about our
    // table, not about what the prototype read out of the parquet.
    const reproducedAtHalf = replayed.filter(
      (r) =>
        round3(
          RECORDED_WEIGHTS.name * r.nameScore +
            RECORDED_WEIGHTS.category * r.categoryScore +
            RECORDED_WEIGHTS.datasetConfidence * 0.5,
        ) === r.row.score,
    );
    expect(reproducedAtHalf).toEqual([]);

    const implied = replayedExactly.map(impliedConfidence);
    expect(Math.min(...implied)).toBeLessThan(0.3);
    expect(Math.max(...implied)).toBeGreaterThan(0.99);
  });

  it('implies a confidence inside [0,1] for every row that replays exactly', () => {
    // Weak, but not nothing: a wrong weight or a wrong `name_score` would push rows outside the
    // range the column can hold. The ±0.0005 is the recorded score's own rounding, divided by the
    // 0.10 weight.
    //
    // Over `replayedExactly`. For a re-fit row the inversion mixes the file's `score` with a
    // `name_score` the file never saw, so a value outside [0,1] there is arithmetic, not evidence —
    // those five are pinned by value instead.
    const slack = 0.0005 / RECORDED_WEIGHTS.datasetConfidence;
    const outside = replayedExactly
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
    //
    // `RECORDED_WEIGHTS` for the same reason as above, and over `replayedExactly` so that the five
    // re-fit rows cannot enter a pair. As it happens none of them would — TLV-10's rows appear in
    // no other case — and the pair count below is what proves that rather than a comment.
    const byPlace = new Map<string, ReplayedRow[]>();
    for (const r of replayedExactly) {
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
            RECORDED_WEIGHTS.name * (a.nameScore - b.nameScore) +
            RECORDED_WEIGHTS.category * (a.categoryScore - b.categoryScore);
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

/* ------------------------------------------------------------------------------------------- *
 * The re-fit — the 44 cases re-scored under the weights the product actually ships (TLV-RANK-1)
 * ------------------------------------------------------------------------------------------- */

/**
 * Every row's unrecorded Overture confidence, recovered exactly.
 *
 * `score = 0.72·name_score + 0.18·cat_match + 0.10·conf` with three of the four terms recorded, so
 * this is algebra, not estimation — and it is the **recorded** `name_score`, never the port's, for
 * the five re-fit rows: the prototype computed its score from the number it wrote down.
 *
 * The recovered value carries the recorded score's own ±0.005 rounding (0.0005 divided by the 0.10
 * weight), which is far below any band gate and cannot move a verdict here.
 */
const recoveredConfidence = (row: GoldenResult): number =>
  (row.score - RECORDED_WEIGHTS.name * row.name_score - RECORDED_WEIGHTS.category * row.cat_match) /
  RECORDED_WEIGHTS.datasetConfidence;

/**
 * The recorded top-5 of one case, put back through the **production** path: `rankPlaces` re-scores
 * with the current `SCORING`, re-sorts with the real comparator, and `confidenceOf` bands it.
 *
 * Nothing about the scoring is reimplemented here, which is the whole point — a re-fit that moved a
 * band only in this file's private arithmetic would prove nothing.
 */
function resimulated(caseId: string): readonly RankedPlace[] {
  const goldenCase = golden[caseId]!;
  const specCase = specById.get(caseId)!;
  const candidates: ResolvedPlace[] = goldenCase.results.map((row) => ({
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
    datasetConfidence: recoveredConfidence(row),
  }));
  return rankPlaces(
    {
      text: goldenCase.query,
      cityHint: specCase.city_hint,
      countryHint: null,
      categoryHint: categoryHintFor(specCase.category_hint),
      near: null,
      maxResults: null,
    },
    candidates,
  );
}

/**
 * The band `resimulated`'s ranking lands in, with the **query supplied** — which is what turns the
 * branch guard on (`score.ts`, divergence 7). `queryForms` rather than a bare `[query]` so this
 * asks the question the production path asks; no golden case carries `textVariants`, so the list
 * is one element either way.
 *
 * The replay section above deliberately does *not* do this: it bands the 2026-07 recorded scores,
 * and a guard invented in 2026-08 re-banding that run would turn a fidelity check into a moving
 * target. Six of its 29 recorded preselects would move if it did — TYO-02, TYO-04, TYO-14, LDN-02,
 * LDN-07, LDN-12, the same branch families the re-fit section reports below.
 */
const resimulatedConfidence = (caseId: string): Confidence =>
  confidenceOf(resimulated(caseId), 'narrow-filter', queryForms(golden[caseId]!.query, null));

/**
 * Every case the re-fit moves, and in which direction. Fifteen entries, and each one had to be
 * argued before it was written down — this list is the review record, not a snapshot.
 *
 * Nine of them are RESOLVE-CONF-1's (`SCORING.total` at name-only). The other six are
 * TRACK2-BRANCH's branch guard, and they all read `preselect -> confirm` with an **unchanged**
 * top-1: the guard never reorders a shortlist, it only refuses to pre-tick one.
 *
 * `verdict` is the *recorded* adjudication, which was made against the **old** top-1. Where the
 * re-fit changes the top-1 the verdict is therefore stale and pessimistic (TLV-10 and TLV-14 are
 * filed `MISS_RANK` and are now ranking the right venue first). Left stale on purpose: re-labelling
 * adjudication from inside the test that the adjudication grades is how a benchmark stops meaning
 * anything. The live harness re-adjudicates against the real index; this file only reports.
 */
const REFIT_CASE_MOVES: readonly {
  readonly caseId: string;
  readonly from: ConfidenceBand;
  readonly to: ConfidenceBand;
  readonly top1Was: string;
  readonly top1Now: string;
  readonly why: string;
}[] = [
  {
    caseId: 'TYO-02',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Onibus Coffee',
    top1Now: 'Onibus Coffee',
    why: 'The branch guard. The caption says `Onibus Coffee` and the index holds the bare name ' +
      'plus `Onibus Coffee Yakumo` (3.1 km, Δ 0.072), `… 自由が丘` (4.5 km, Δ 0.085) and ' +
      '`… 中目黒三丁目店` (497 m, Δ 0.097). The top-1 happens to be the Nakameguro flagship the ' +
      'case asks for, but nothing measured says so — the gap to each branch is its suffix length. ' +
      'This is the same shape as TYO-10, where the equivalent luck runs the other way.',
  },
  {
    caseId: 'TYO-04',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Koffee Mameya',
    top1Now: 'Koffee Mameya',
    why: 'The branch guard: `KOFFEE MAMEYA Kakeru`, 8.5 km away at Δ 0.072, is a different room ' +
      'with a different menu and the caption names neither.',
  },
  {
    caseId: 'TYO-07',
    from: 'confirm',
    to: 'confirm',
    top1Was: 'AFURI',
    top1Now: 'Afuri',
    why: 'Two Overture rows for the same ramen chain, tied at a 1.000 name score. With the ' +
      'category and confidence terms gone the totals are exactly equal and the comparator falls ' +
      'through to the raw name, where "Afuri" sorts above "AFURI". Same venue, same band, and the ' +
      'margin is 0 either way — this is the tie-break becoming visible, not a ranking change.',
  },
  {
    caseId: 'TYO-10',
    from: 'confirm',
    to: 'confirm',
    top1Was: 'むぎとオリーブ 銀座本店',
    top1Now: 'むぎとオリーブ',
    why: 'The case TRACK2-BRANCH exists for. Under RESOLVE-CONF-1 the bare `むぎとオリーブ` row ' +
      'takes rank 1 on an exact name match and used to auto-accept at margin 0.069 — pinning a ' +
      'point 3.2 km from `むぎとオリーブ 銀座本店`, and `benchmark-spec.json` gives this case ' +
      '`expected_area: "Ginza"`. So the earlier entry here, which read the two rows as ' +
      'interchangeable branches, was wrong about what the case asks. The branch guard now holds ' +
      'it at `confirm`: same ranking, but the user picks the branch instead of being handed one. ' +
      'Its band is unchanged from the recorded run; only the top-1 moves.',
  },
  {
    caseId: 'TYO-14',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Koffee Mameya',
    top1Now: 'Koffee Mameya',
    why: 'TYO-04 asked twice, with `Omotesando, Tokyo` for an expected area rather than ' +
      '`Omotesando`. Same rows, same guard, same reason.',
  },
  {
    caseId: 'TLV-08',
    from: 'confirm',
    to: 'confirm',
    top1Was: 'אורליס רוטיסרי',
    top1Now: 'אולמי קונקורד',
    why: 'Orna and Ella is absent from Overture, so both rows are wrong. Two near-tied wrong rows ' +
      'swap at margin 0.0006; no verdict changes and the band does not move. ' +
      '`nameIsEstablished` briefly took this to `no_match` on 2026-08-31 at a 0.85 floor — its ' +
      'weakest token covers at 0.830 — and the floor came back down to 0.81 the same day, because ' +
      '0.85 also threw away `Pita Lila` against Google`s `Pizza Lila` at 0.827: the same venue, ' +
      'named both ways by the creator in one breath. **Correct and wrong overlap on this signal ' +
      'and cannot be separated by it.** This row is the cost of keeping that real place.',
  },
  {
    caseId: 'TLV-10',
    from: 'no_match',
    to: 'confirm',
    top1Was: 'Zucca Cafe & Gelato',
    top1Now: 'Anita Sarona',
    why: 'The generic-list fix put a real Anita branch first; RESOLVE-CONF-1 now lifts it over the ' +
      '0.80 gate as well, so a correct venue is offered to the user instead of being discarded. ' +
      'It was under the gate on Overture dataset confidence alone.',
  },
  {
    caseId: 'TLV-12',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Bellboy',
    top1Now: 'Bellboy',
    why: 'The cost, and it is the same case that paid for TLV-RANK-1: a correct top-1 that used to ' +
      'be auto-accepted because it matched the category. At 0.896 it is now a confirm. The venue ' +
      'is unchanged and right; the user taps once.',
  },
  {
    caseId: 'TLV-14',
    from: 'confirm',
    to: 'preselect',
    top1Was: 'Hostel 51',
    top1Now: 'Bar 51',
    why: 'The case both earlier re-fits were aimed at, now settled. `Bar 51` takes rank 1 on a ' +
      '1.000 name score with a 0.215 margin over `Hostel 51`, and auto-accepts. Its RECORDED ' +
      'verdict is MISS_RANK, which was true of the 2026-07 ranking and is not true of this one — ' +
      'see STALE_VERDICTS below.',
  },
  {
    caseId: 'LDN-01',
    from: 'confirm',
    to: 'preselect',
    top1Was: 'Kiln',
    top1Now: 'Kiln',
    why: 'Adjudicated OK, and it now clears the gate on name alone at margin 0.067 rather than by ' +
      'a hair. It was the marginal auto-accept of the previous re-fit; it is no longer marginal.',
  },
  {
    caseId: 'LDN-02',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Bar Termini',
    top1Now: 'Bar Termini',
    why: 'The branch guard: `Bar Termini Centrale` is 1.5 km away at Δ 0.081, and `Bar Termini` ' +
      'is what a caption calls either of them.',
  },
  {
    caseId: 'LDN-07',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Padella',
    top1Now: 'Padella',
    why: 'The branch guard: `Padella Shoreditch`, 2.1 km away at Δ 0.095. The spec expects ' +
      '"Borough Market **or** Shoreditch", which is the case admitting in writing that it cannot ' +
      'tell the two apart either.',
  },
  {
    caseId: 'LDN-12',
    from: 'preselect',
    to: 'confirm',
    top1Was: 'Padella',
    top1Now: 'Padella',
    why: 'LDN-07 asked again with a bare `London` for an expected area. Same rows, same guard.',
  },
  {
    caseId: 'NEG-01',
    from: 'confirm',
    to: 'confirm',
    top1Was: 'The Edge Bar Shoreditch',
    top1Now: 'The Rum Kitchen - Shoreditch',
    why: 'A caption naming no venue. Which wrong row is first is noise by construction — the ' +
      'margin is 0.005 — and the band is what matters: still confirm, still not auto-accepted.',
  },
  {
    caseId: 'NEG-02',
    from: 'confirm',
    to: 'no_match',
    top1Was: 'Bees Coffee',
    top1Now: 'Bees Coffee',
    why: 'A NEGATIVE case: the caption is `best coffee ever` and names no venue at all. It was ' +
      'already kept out of auto-accept by the margin gate, but it still reached the user as a ' +
      'shortlist offering `Bees Coffee` — a specific answer to a question that named nothing. ' +
      '`nameIsEstablished` covers its weakest distinctive token at 0.667 and drops it to ' +
      '`no_match` (2026-08-31). This is the case the guard was worth adding for: the ranking was ' +
      'never wrong, the *offer* was.',
  },
  {
    caseId: 'NEG-03',
    from: 'confirm',
    to: 'no_match',
    top1Was: 'Tirza wine bar',
    top1Now: 'Tirza wine bar',
    why: 'A negative case gets safer: a caption naming no venue drops to 0.744, under the confirm ' +
      'gate. This is the direction a no-name caption should move.',
  },
];

/**
 * Auto-accepted cases whose **recorded** verdict is not `OK`, with the reason it is stale.
 *
 * This list is the one place the benchmark is allowed to disagree with its own adjudication, and it
 * exists because the alternative is worse: the verdicts were made in 2026-07 against a ranking two
 * re-fits ago, and silently re-labelling them from inside the test that they grade would end the
 * benchmark's usefulness. So the disagreement is written down, one entry at a time, with what the
 * top-1 actually is now and what the case actually asked for.
 *
 * Empty is the healthy state. An entry here is a debt: it should be paid off by re-adjudicating
 * against the live index in `tests/manual/tlv-resolve-benchmark.manual.ts`, not by growing this
 * list.
 */
const STALE_VERDICTS: readonly { readonly caseId: string; readonly why: string }[] = [
  {
    caseId: 'TLV-14',
    why: 'Recorded MISS_RANK — "intended venue exists in the dataset but was not returned in the ' +
      'top 3" — against a 2026-07 ranking whose top-1 was `Hostel 51`. The spec asks for "any real ' +
      'Tel Aviv venue named Bar 51" and the top-1 is now `Bar 51` itself, at a 1.000 name score. ' +
      'Note that `docs/evidence/places/band-policy.md` §3 read this stale label as ground truth ' +
      'and concluded a decisive-margin band rule produced a false auto-accept here; it does not.',
  },
];

describe('the re-fit — 44 cases under the current SCORING.total', () => {
  it('ships the weights this file was reasoned about with', () => {
    // The two-file diff. If `scoring-constants.ts` changes and this does not, every enumeration
    // below is stale and this is the assertion that says so.
    expect({ ...SCORING.total }).toEqual({ ...CURRENT_WEIGHTS });
    expect(
      SCORING.total.name + SCORING.total.category + SCORING.total.datasetConfidence,
      'the weights must sum to 1.00 or `resolution_score`’s CHECK needs a clamp',
    ).toBeCloseTo(1, 10);
  });

  it('names the gate that actually stops a caption which names no venue', () => {
    // The property this file used to assert — "cannot reach preselect without a category match,
    // because 0.80 + 0.10 < 0.92" — died with the category term, so its replacement is asserted
    // here rather than assumed. It is the MARGIN gate, and it is the stronger of the two: a
    // caption that names no venue matches many rows equally badly, which is a small margin by
    // construction, whereas its absolute score depends on how generic the words happen to be.
    const perfectName = SCORING.total.name;
    expect(perfectName).toBeGreaterThanOrEqual(SCORING.bands.preselectScore);

    for (const caseId of ['NEG-01', 'NEG-02', 'NEG-03']) {
      const confidence = resimulatedConfidence(caseId);
      expect(confidence.margin, caseId).not.toBeNull();
      expect(confidence.margin!, caseId).toBeLessThan(SCORING.bands.preselectMargin / 3);
    }
  });

  it('moves exactly the sixteen enumerated cases, in the enumerated directions', () => {
    const moved: string[] = [];
    for (const caseId of caseIds) {
      const before = bandOf(caseId, 'recorded');
      const ranked = resimulated(caseId);
      const after = resimulatedConfidence(caseId).band;
      const top1Was = golden[caseId]!.results[0]!.name;
      const top1Now = ranked[0]!.place.name;
      if (before !== after || top1Was !== top1Now) {
        moved.push(`${caseId} ${before}->${after} top1 ${JSON.stringify(top1Was)}->${JSON.stringify(top1Now)}`);
      }
    }
    expect(moved).toEqual(
      REFIT_CASE_MOVES.map(
        (m) =>
          `${m.caseId} ${m.from}->${m.to} top1 ${JSON.stringify(m.top1Was)}->${JSON.stringify(m.top1Now)}`,
      ),
    );
  });

  it('tallies 24 preselect / 16 confirm / 4 no_match under the current weights and guards', () => {
    // Recorded was 29/12/3; the previous re-fit held 29/11/4; RESOLVE-CONF-1 alone gives 31/10/3.
    // TRACK2-BRANCH's guard then returns seven of those auto-accepts to the user — TYO-02, TYO-04,
    // TYO-10, TYO-14, LDN-02, LDN-07, LDN-12, every one of them a bare chain name with a branch
    // within 0.10 of it and kilometres away. Six show as `preselect -> confirm` moves; TYO-10 was
    // already `confirm` in the recorded run and is listed for its top-1 change. That is the price,
    // and it is paid for one thing: TYO-10 was a FALSE auto-accept, 3.2 km from the Ginza branch
    // `benchmark-spec.json` asks for. `docs/evidence/places/branch-guard-2026-08-28.md` has the
    // per-configuration table, including the 30/11/3 variant that catches TYO-10 alone and why it
    // was refused.
    //
    // 2026-08-31, `nameIsEstablished` at its final 0.81 floor: 17 confirm -> 16, 3 no_match -> 4.
    // NEG-02 alone moves. TLV-08 moved too at the 0.85 floor this guard shipped with for an hour;
    // 0.81 restores it, because 0.85 also cost a real place on the live path. The cases are
    // where the shortlist was offering a specific venue the caption did not name — TLV-08's query
    // is absent from Overture entirely, and NEG-02's caption is `best coffee ever`. **Preselect is
    // untouched at 24**, which is the property that matters: the guard only ever demotes, and it
    // demoted nothing that was being auto-accepted.
    const tally = { preselect: 0, confirm: 0, no_match: 0 };
    for (const caseId of caseIds) tally[resimulatedConfidence(caseId).band] += 1;
    expect(tally).toEqual({ preselect: 24, confirm: 16, no_match: 4 });
  });

  it('still auto-accepts nothing the adjudication did not call correct', () => {
    // The invariant, and the only one that cannot be traded away: not "no more false auto-accepts
    // than before" but none at all, judged by the recorded verdicts — with every disagreement
    // between a recorded verdict and the current ranking named in `STALE_VERDICTS` rather than
    // absorbed.
    const verdicts = adjudication.verdicts.overture_scored!;
    const stale = new Set(STALE_VERDICTS.map((v) => v.caseId));
    const autoAccepted = caseIds.filter(
      (id) => resimulatedConfidence(id).band === 'preselect',
    );
    expect(autoAccepted.length).toBe(24);
    expect(autoAccepted.filter((id) => verdicts[id] !== 'OK' && !stale.has(id))).toEqual([]);
    // And nothing may sit in `STALE_VERDICTS` that is not actually auto-accepted — the list is an
    // exception register, not a place to park a case.
    expect(STALE_VERDICTS.map((v) => v.caseId).filter((id) => !autoAccepted.includes(id))).toEqual([]);
  });

  it('keeps the three no-name captions out of auto-accept', () => {
    // `06` §6.3's negatives, re-checked under the re-fit rather than assumed to have survived it.
    // All three still fail the 0.92 gate, and NEG-03 now fails the 0.80 gate as well. The margin
    // is the gate that holds structurally; see the assertion above.
    for (const caseId of ['NEG-01', 'NEG-02', 'NEG-03']) {
      const confidence = resimulatedConfidence(caseId);
      expect(confidence.band, caseId).not.toBe('preselect');
      expect(confidence.score, caseId).toBeLessThan(SCORING.bands.preselectScore);
    }
  });
});
