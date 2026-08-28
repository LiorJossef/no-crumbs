/**
 * HARNESS-RIVAL-1 — the ranked rows the recognition harness records, and the branch-guard verdict
 * it records alongside them.
 *
 * ## Why this is a module and not fifty lines inside the harness
 *
 * `docs/handoff-2026-08-28-resolution-confidence.md` §4.3 names the defect this fixes: the branch
 * guard shipped with its evidence measured entirely on the 44-case Overture golden file, and **it
 * could not be evidenced on Google at all** because `tiktok-recognition-run.google.json` stored
 * coordinates for the top-1 row and nothing but a formatted `"name (0.951)"` string for the
 * runner-ups. The guard's whole question is *how far apart are the top row and its nearest rival*,
 * and that number was not recorded, so no amount of re-reading the artefact could answer it.
 *
 * Recording it is therefore a **measurement capability**, not a reporting nicety, and a capability
 * that lives inline in a harness nobody runs in CI is a capability that rots silently. Pulling it
 * into a plain module lets `tests/unit/places/recognition-record-rivals.test.ts` exercise it on
 * every `npm run test` — so if a future edit drops `lat`/`lng` from the recorded rivals, a test
 * fails that day instead of the next time somebody tries to re-fit the guard.
 *
 * ## What it deliberately does not do
 *
 * It does not decide anything. `branchRival`, `placeProximity`, `nameDifference` and `queryForms`
 * are imported from `@/domain/places/score` and called; nothing here re-implements the guard, its
 * band, its distance test or its token containment. A harness that re-derived the verdict would be
 * measuring a copy of the guard rather than the guard.
 */

import { addressScoreOf, branchRival, placeProximity } from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';
import type { RankedPlace } from '@/domain/types';

/**
 * How many ranked rows the record keeps per candidate.
 *
 * Ten, because that is `MAX_GOOGLE_RESULTS` — the whole answer Google is ever asked for — so on the
 * provider the product is moving to this cap never truncates. On Overture the prefilter can return
 * up to 500 rows and the cap does bite; `RankedRecord.complete` says so per candidate rather than
 * leaving a silent truncation to be mistaken for "there was no rival".
 */
export const RANKED_ROWS_RECORDED = 10;

/**
 * One row of the ranking, with everything needed to re-derive a band or a guard verdict offline.
 *
 * The three score components are carried separately from `score` on purpose: `score` is a blend
 * whose weights have moved twice in two days (`scoring-constants.ts`), so a record that stored only
 * the blend would be un-re-scorable the moment the weights move again — which is exactly what
 * happened to the 2026-08-28 07:52 run, whose 6-preselect numbers were stale by lunchtime.
 */
export interface RankedRow {
  /** 1-based, over the ranking this row came from. */
  readonly rank: number;
  readonly name: string;
  readonly address: string | null;
  readonly locality: string | null;
  /** The reason this file exists. Never optional, never null: `toResolvedPlace` drops a pointless row. */
  readonly lat: number;
  readonly lng: number;
  readonly provider: string;
  readonly providerPlaceId: string;
  readonly providerCategory: string | null;
  readonly datasetConfidence: number;
  readonly score: number;
  readonly nameScore: number;
  readonly tokenCoverage: number;
  readonly categoryScore: number;
  /** Three-valued: 1 corroborated, 0 contradicted, `null` not comparable. `undefined` never reaches JSON. */
  readonly addressScore: number | null;
  /** `score(top1) − score(this)`. 0 on rank 1. */
  readonly scoreGapFromTop1: number;
  /** Great-circle metres to the top-1 row. 0 on rank 1. */
  readonly metresFromTop1: number;
  /** `nameDifference(top1, this)` — the tokens one name has that the other does not, or `null`. */
  readonly nameDifferenceFromTop1: readonly string[] | null;
  /** `metresFromTop1 <= SCORING.samePlaceMetres` — one venue recorded twice, not two premises. */
  readonly sameSpotAsTop1: boolean;
  /** Whether this row is inside `SCORING.branchGuard.rivalScoreBand` of the top. */
  readonly withinRivalScoreBand: boolean;
}

/** What the shipped `branchRival` said about this candidate's ranking, and why. */
export interface BranchGuardRecord {
  /** True when `branchRival` returned a row — i.e. `preselect` was withheld for branch ambiguity. */
  readonly fired: boolean;
  /** The rival's 1-based rank, or `null` when the guard did not fire. */
  readonly rivalRank: number | null;
  readonly rivalName: string | null;
  readonly rivalScoreGap: number | null;
  readonly rivalMetres: number | null;
  readonly rivalDifference: readonly string[] | null;
  /**
   * Why the guard could not fire, when it did not. Not decoration: `'no-rival'` (a one-row answer)
   * and `'no-condition-met'` (rivals existed and none qualified) are completely different findings
   * about a corpus, and §4.3's null result is only interpretable if the record distinguishes them.
   */
  readonly reason: 'fired' | 'no-rival' | 'no-condition-met' | 'no-forms';
  /**
   * How many rows the verdict was actually evaluated over.
   *
   * Production runs `branchRival` over the **full** ranking (`scoreCandidates` bands before it
   * truncates). When this is below `RankedRecord.rankedLength`, a `false` here is a *lower bound*:
   * a row past the cut could still have satisfied all three conditions where none of these did.
   * Recorded so that a null result cannot be quoted as a measured negative.
   */
  readonly evaluatedOverRows: number;
  /** The query forms the guard's "did the caption already name the branch" test read. */
  readonly forms: readonly string[];
}

/** Everything the record keeps about one candidate's ranking. */
export interface RankedRecord {
  readonly rows: readonly RankedRow[];
  /**
   * True only when `rows` is the **whole** ranking — nothing was dropped by `RANKED_ROWS_RECORDED`
   * and nothing was left behind by the caller's own `maxResults`.
   *
   * It is computed against `rankedLength` rather than against `rows.length` because the first
   * version of this file got it wrong in exactly the way that matters: it compared the rows it had
   * been handed against the cap, so an Overture candidate whose prefilter returned 297 rows and
   * whose caller passed 10 of them was recorded `complete: true`. A truncation reported as
   * completeness is the same class of defect as the missing coordinates — a record that overstates
   * what it knows.
   */
  readonly complete: boolean;
  /** The full ranking's length — `ResolveResult.candidatesPrefiltered`, not what the caller kept. */
  readonly rankedLength: number;
  /** How many rows the caller actually had to work with, before `RANKED_ROWS_RECORDED`. */
  readonly rowsAvailable: number;
  readonly branchGuard: BranchGuardRecord;
  /** The constants the two booleans above were evaluated against, so a record is self-describing. */
  readonly constants: {
    readonly rivalScoreBand: number;
    readonly samePlaceMetres: number;
  };
}

/**
 * Build the record from a ranking and the query forms it was scored against.
 *
 * `ranked` must be the ranking, best first — `ResolveResult.shortlist` when it is not truncated,
 * or a deeper re-resolve when it is. `forms` is `queryForms()`'s output, passed straight through to
 * `branchRival` so the guard reads the same question the rows were matched against; an empty
 * `forms` disables the guard in production and is recorded here as `'no-forms'` rather than as a
 * pass.
 */
export function rankedRecordOf(
  ranked: readonly RankedPlace[],
  forms: readonly string[],
  rankedLength: number = ranked.length,
): RankedRecord {
  const top = ranked[0] ?? null;
  const rival = branchRival(ranked, forms);

  const rows: RankedRow[] = ranked.slice(0, RANKED_ROWS_RECORDED).map((r, i) => {
    const proximity =
      top === null
        ? null
        : placeProximity(
            { name: top.place.name, lat: top.place.lat, lng: top.place.lng },
            { name: r.place.name, lat: r.place.lat, lng: r.place.lng },
          );
    const gap = top === null ? 0 : top.score - r.score;
    const address = addressScoreOf(r);
    return {
      rank: i + 1,
      name: r.place.name,
      address: r.place.addressLine,
      locality: r.place.locality,
      lat: r.place.lat,
      lng: r.place.lng,
      provider: r.place.provider,
      providerPlaceId: r.place.providerPlaceId,
      providerCategory: r.place.providerCategory,
      datasetConfidence: r.place.datasetConfidence,
      score: r.score,
      nameScore: r.nameScore,
      tokenCoverage: r.tokenCoverage,
      categoryScore: r.categoryScore,
      addressScore: address ?? null,
      scoreGapFromTop1: gap,
      metresFromTop1: proximity?.metres ?? 0,
      nameDifferenceFromTop1: proximity?.difference ?? null,
      sameSpotAsTop1: proximity?.sameSpot ?? true,
      withinRivalScoreBand: gap <= SCORING.branchGuard.rivalScoreBand,
    };
  });

  const rivalIndex = rival === null ? -1 : ranked.indexOf(rival);
  const rivalRow = rivalIndex >= 0 ? rows[rivalIndex] ?? null : null;

  const reason: BranchGuardRecord['reason'] =
    rival !== null
      ? 'fired'
      : forms.length === 0
        ? 'no-forms'
        : Math.max(rankedLength, ranked.length) < 2
          ? 'no-rival'
          : 'no-condition-met';

  return {
    rows,
    complete: rows.length >= rankedLength,
    rankedLength: Math.max(rankedLength, ranked.length),
    rowsAvailable: ranked.length,
    branchGuard: {
      fired: rival !== null,
      rivalRank: rivalIndex >= 0 ? rivalIndex + 1 : null,
      rivalName: rival?.place.name ?? null,
      rivalScoreGap: rivalRow?.scoreGapFromTop1 ?? null,
      rivalMetres: rivalRow?.metresFromTop1 ?? null,
      rivalDifference: rivalRow?.nameDifferenceFromTop1 ?? null,
      reason,
      evaluatedOverRows: ranked.length,
      forms: [...forms],
    },
    constants: {
      rivalScoreBand: SCORING.branchGuard.rivalScoreBand,
      samePlaceMetres: SCORING.samePlaceMetres,
    },
  };
}

/**
 * The nearest rival by score, or `null` for a one-row ranking — the two numbers §4.3 asked for
 * (score gap and metres) regardless of whether the guard fired.
 *
 * Separate from `branchGuard` on purpose: "the guard did not fire" and "there was no rival within
 * a kilometre" are different facts, and reporting only the first is how a threshold gets called
 * safe on a corpus that never tested it.
 */
export function nearestRivalOf(record: RankedRecord): RankedRow | null {
  return record.rows[1] ?? null;
}
