/**
 * RECOG-METRICS-1/2 — the failure classes, the two fixes that landed, and the one that did not.
 * **Zero provider quota, no network, no database.**
 *
 *   npx vitest run tests/manual/recognition-failure-classes.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept
 *
 * ## What changed under this file
 *
 * RECOG-METRICS-1 measured three candidate fixes here as band policies applied *on top of* the
 * shipped ranking. Two of them — **F2** (the caption's address is decisive) and **F3** (an exact
 * name beats a fuzzy rival) — have since landed inside `confidenceOf` on the owner's ruling, so
 * they are no longer proposals and are not simulated here. `sinceTheyLanded()` asserts instead that
 * the candidates they were built for now auto-accept, which is the same evidence stated as a
 * regression rather than as a forecast.
 *
 * **F1 was held, deliberately.** It would auto-accept a row whose name wholly contains the query —
 * a pure suffix — and on the pre-landing corpus it was the largest single gain. The owner's ruling
 * of 2026-08-28: on `מתחת לעץ` it silently picks one of **three branches the caption explicitly
 * listed**, which is a wrong auto-match in the user's terms even where the corpus adjudicates it
 * correct, because that corpus expectation accepts any branch. It stays measured here, against the
 * post-landing baseline, because the size of what it would still buy is the whole argument.
 *
 * ## The bar, unchanged
 *
 * Two band proposals have died in this repo, both on one false auto-accept over the 44 golden
 * cases: `score ≥ 0.85 && margin ≥ 0.05` (`band-policy.md`, TLV-14 — a refutation that itself rested
 * on a stale label, `resolution-confidence-2026-08-28.md` §5) and dropping `datasetConfidence`
 * outright (`dataset-confidence-weighting-2026-08-28.md`, TYO-10). So anything measured here is
 * measured on three corpora: the 16 real Google candidates, the 16 real Overture candidates, and
 * the 44 golden cases re-simulated under today's weights — the same construction
 * `tests/unit/places/benchmark-golden.test.ts` uses.
 *
 * ## What the golden file can and cannot say
 *
 * `raw-overture-scored.json` records no `addressLine`, so every address-dependent rule is
 * arithmetically a no-op there and is reported **untested**, never *safe*. Verdicts come from
 * `adjudication.json`'s `overture_scored` column with the two re-fit-stale entries named
 * explicitly — TLV-14 and TLV-10, the same register `benchmark-golden.test.ts` carries.
 *
 * Writes `docs/evidence/places/recognition-failure-classes-run.json`.
 */

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';

import {
  addressScore,
  branchRival,
  confidenceOf,
  nameDifference,
  queryForms,
  rankPlaces,
  type SoleCandidateMeaning,
} from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';
import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';
import type { RankedPlace, ResolveQuery, ResolvedPlace } from '@/domain/types';

import {
  REPO,
  RUNS,
  readJson,
  scoreboardFor,
  type CandidateRow,
  type RecordedCandidate,
  type RecordedRun,
} from './recognition-replay';

/* ------------------------------------------------------------------------------------------- *
 * The proposals, as band policies over an already-ranked list
 * ------------------------------------------------------------------------------------------- */

export interface Proposal {
  readonly id: string;
  readonly title: string;
  readonly targets: string;
  /** True when this proposal would let the ranking auto-accept where the shipped policy does not. */
  promotes(ranked: readonly RankedPlace[], q: ResolveQuery, forms: readonly string[], sole: SoleCandidateMeaning): boolean;
  /** Whether the corpus it is measured on can even exercise it. */
  readonly needsAddresses: boolean;
}

const marginOk = (ranked: readonly RankedPlace[], sole: SoleCandidateMeaning): boolean => {
  const top = ranked[0];
  const second = ranked[1];
  if (top === undefined) return false;
  if (second === undefined) return sole === 'exhaustive-search';
  return top.score - second.score >= SCORING.bands.preselectMargin;
};

/** The tokens the candidate's name adds over the best-matching query form, or `null` if the query
 *  is not contained in the name at all. */
function suffixOver(forms: readonly string[], name: string): readonly string[] | null {
  for (const form of forms) {
    const d = nameDifference(form, name);
    if (d !== null && d.length > 0) return d;
  }
  return null;
}

const PROPOSALS: readonly Proposal[] = [
  {
    id: 'F1',
    title: 'A pure suffix is not a mismatch — auto-accept when the query is wholly contained in the name',
    targets:
      'A provider row whose display name is the venue plus a branch or a descriptor. Token coverage is 1.000 — every word the caption wrote is in the name — and the row is held under the gate by the extra-token penalty, which measures how long the suffix is. Before F2 landed it carried `קוהי`, `מתחת לעץ` and `WOW`; F2 has since taken `קוהי` and `WOW` on address evidence, so what is measured below is what F1 would ADD to the shipped policy.',
    needsAddresses: false,
    promotes(ranked, _q, forms, sole) {
      const top = ranked[0];
      if (top === undefined) return false;
      if (top.score >= SCORING.bands.preselectScore) return false; // already eligible
      if (top.score < SCORING.bands.confirmScore) return false;
      if (top.tokenCoverage < 0.999) return false;
      if (suffixOver(forms, top.place.name) === null) return false;
      if (!marginOk(ranked, sole)) return false;
      return branchRival(ranked, forms) === null;
    },
  },
];

/* ------------------------------------------------------------------------------------------- *
 * Corpus 3 — the 44 golden cases, re-simulated (the construction benchmark-golden.test.ts uses)
 * ------------------------------------------------------------------------------------------- */

/** The 44-case evidence file, narrowed to what the re-simulation reads. */
interface GoldenRow {
  readonly overture_id: string;
  readonly name: string;
  readonly category: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly score: number;
  readonly name_score: number;
  readonly cat_match: number;
}
interface GoldenCase {
  readonly query: string;
  readonly city_scope: string;
  readonly results: readonly GoldenRow[];
}
interface SpecCase {
  readonly id: string;
  readonly city_hint: string | null;
  readonly category_hint: ExtractedCategoryHint | null;
  readonly expected_name: string;
}

const golden = readJson<Record<string, GoldenCase>>('docs/evidence/places/raw-overture-scored.json');
const spec = readJson<{ readonly cases: readonly SpecCase[] }>('docs/evidence/places/benchmark-spec.json');
const adjudication = readJson<{ readonly verdicts: Record<string, Record<string, string>> }>(
  'docs/evidence/places/adjudication.json',
);
const specById = new Map(spec.cases.map((c) => [c.id, c]));

/** `resolve-overture-scored.py`'s weights — every `score` in the file was produced with these. */
const RECORDED_WEIGHTS = { name: 0.72, category: 0.18, datasetConfidence: 0.1 } as const;
const recoveredConfidence = (row: GoldenRow): number =>
  (row.score - RECORDED_WEIGHTS.name * row.name_score - RECORDED_WEIGHTS.category * row.cat_match) /
  RECORDED_WEIGHTS.datasetConfidence;

/**
 * The two adjudication entries the re-fits have made stale — same register, same reasons, as
 * `benchmark-golden.test.ts`. Both are filed `MISS_RANK` against a 2026-07 ranking whose top-1 has
 * since changed to the venue the case asks for.
 */
const STALE_VERDICTS: Readonly<Record<string, string>> = {
  'TLV-14': "recorded MISS_RANK against a ranking whose top-1 was `Hostel 51`; it is now `Bar 51`, the venue the spec asks for",
  'TLV-10': "recorded MISS_RANK; the correct `Anita Sarona` now ranks first",
};

function goldenQuery(caseId: string): ResolveQuery {
  const c = golden[caseId]!;
  const s = specById.get(caseId);
  return {
    text: c.query,
    cityHint: s?.city_hint ?? null,
    countryHint: null,
    categoryHint: categoryHintFor(s?.category_hint ?? null),
    addressHint: null,
    textVariants: null,
    near: null,
    maxResults: null,
  };
}

function goldenRanking(caseId: string): readonly RankedPlace[] {
  const c = golden[caseId]!;
  const candidates: ResolvedPlace[] = c.results.map((row) => ({
    provider: 'overture' as const,
    providerPlaceId: row.overture_id,
    sourceDataset: 'overture-places',
    regionId: c.city_scope === 'ALL' ? null : c.city_scope,
    name: row.name,
    altNames: [],
    providerCategory: row.category,
    // Not recorded by the evidence. Every address-dependent proposal is therefore untestable here,
    // which is reported rather than papered over.
    addressLine: null,
    locality: null,
    lat: row.lat,
    lng: row.lon,
    datasetConfidence: recoveredConfidence(row),
  }));
  return rankPlaces(goldenQuery(caseId), candidates);
}

/* ------------------------------------------------------------------------------------------- *
 * The run
 * ------------------------------------------------------------------------------------------- */

interface ProposalEffect {
  readonly proposal: string;
  readonly corpus: string;
  /** How many non-`preselect` cases the proposal was offered. A proposal that recovers 0 out of 0
   *  was never exercised, and saying "0 false accepts" about it would be a claim about nothing. */
  readonly consideredNonPreselect: number;
  readonly newlyAutoAccepted: readonly string[];
  readonly falseAutoAccepts: readonly string[];
  readonly untestable: boolean;
}

describe('recognition failure classes — what landed, what is held, and what is left', () => {
  const classTable: { class: string; n: number; providers: string[]; candidates: string[] }[] = [];
  const effects: ProposalEffect[] = [];

  it('groups every miss and every needless question into classes', () => {
    const rows: CandidateRow[] = RUNS.flatMap((src) => [...scoreboardFor(src).rows]);
    const bad = rows.filter((r) => r.outcome !== 'auto_correct');
    const byClass = new Map<string, CandidateRow[]>();
    for (const r of bad) byClass.set(r.failureClass, [...(byClass.get(r.failureClass) ?? []), r]);

    const L: string[] = ['\n── failure classes across both replayed providers (32 adjudicated candidates)', ''];
    L.push('| class | n | providers | candidates |');
    L.push('|---|---|---|---|');
    for (const [cls, list] of [...byClass.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const providers = [...new Set(list.map((r) => r.provider))];
      classTable.push({ class: cls, n: list.length, providers, candidates: list.map((r) => `${r.provider}:${r.rawName}`) });
      L.push(`| \`${cls}\` | ${String(list.length)} | ${providers.join(', ')} | ${list.map((r) => r.rawName).join(', ')} |`);
    }
    console.log(L.join('\n'));
    expect(classTable.length).toBeGreaterThan(0);
  });

  it('measures every outstanding proposal on all three corpora', () => {
    const L: string[] = [];
    for (const p of PROPOSALS) {
      L.push(`\n── ${p.id}: ${p.title}`);
      L.push(`   targets: ${p.targets}`);

      // Corpora 1 and 2 — the real captions.
      for (const src of RUNS) {
        const run = readJson<RecordedRun>(src.file);
        const board = scoreboardFor(src);
        const promoted: string[] = [];
        const falseAccepts: string[] = [];
        let considered = 0;
        for (const kase of run.cases ?? []) {
          for (const cand of kase.candidates ?? []) {
            if (cand.resolutionKind !== 'answered') continue;
            const row = board.rows.find((r) => r.url === kase.url && r.rawName === cand.rawName);
            if (row === undefined || row.band === 'preselect') continue;
            const rebuilt = rebuildForProposal(src.provider, kase.url, cand);
            if (rebuilt === null) continue;
            considered += 1;
            if (!p.promotes(rebuilt.ranked, rebuilt.q, rebuilt.forms, src.sole)) continue;
            promoted.push(`${row.rawName} → ${String(row.top1)}`);
            if (row.correctRank !== 1) falseAccepts.push(`${row.rawName} → ${String(row.top1)}`);
          }
        }
        effects.push({ proposal: p.id, corpus: `real:${src.provider}`, consideredNonPreselect: considered, newlyAutoAccepted: promoted, falseAutoAccepts: falseAccepts, untestable: false });
        L.push(`   real ${src.provider.padEnd(8)}: +${String(promoted.length)} of ${String(considered)} non-preselect  [${promoted.join(' · ') || '—'}]  FALSE: ${String(falseAccepts.length)} ${falseAccepts.join(' · ')}`);
      }

      // Corpus 3 — the 44 golden cases. The bar both previous band proposals died on.
      const promoted: string[] = [];
      const falseAccepts: string[] = [];
      let considered = 0;
      for (const caseId of Object.keys(golden)) {
        const ranked = goldenRanking(caseId);
        const q = goldenQuery(caseId);
        const forms = queryForms(q.text, null);
        if (confidenceOf(ranked, 'narrow-filter', forms).band === 'preselect') continue;
        considered += 1;
        if (!p.promotes(ranked, q, forms, 'narrow-filter')) continue;
        const verdict = adjudication.verdicts['overture_scored']?.[caseId] ?? '?';
        const stale = STALE_VERDICTS[caseId];
        const label = `${caseId} → ${String(ranked[0]?.place.name)} (spec wants ${String(specById.get(caseId)?.expected_name)}; verdict ${verdict}${stale === undefined ? '' : ' — STALE: ' + stale})`;
        promoted.push(label);
        if (verdict !== 'OK' && stale === undefined) falseAccepts.push(label);
      }
      effects.push({ proposal: p.id, corpus: 'golden-44', consideredNonPreselect: considered, newlyAutoAccepted: promoted, falseAutoAccepts: falseAccepts, untestable: p.needsAddresses });
      L.push(
        `   golden-44     : +${String(promoted.length)} of ${String(considered)} non-preselect  FALSE: ${String(falseAccepts.length)}` +
          (p.needsAddresses ? '   [UNTESTABLE — raw-overture-scored.json records no addressLine, so this proposal is a no-op here, not proven safe]' : ''),
      );
      for (const item of promoted) L.push(`                     ${item}`);
    }
    console.log(L.join('\n'));

    // Report, do not gate: a refuted proposal is a finding, and this file exists to produce it.
    const refuted = effects.filter((e) => e.falseAutoAccepts.length > 0);
    console.log(
      `\n── refuted proposals: ${refuted.length === 0 ? 'none' : refuted.map((r) => `${r.proposal} on ${r.corpus}`).join(', ')}`,
    );
    expect(effects.length).toBe(PROPOSALS.length * 3);
  });


  it('F2 and F3 have landed — the candidates they carry now auto-accept', () => {
    // Stated as a regression rather than as a forecast. Each of these was a `needless_question`
    // before RECOG-METRICS-2 and is named in `confidenceOf`'s header as the case its rule exists
    // for; if one stops auto-accepting, the rule has been broken by something else.
    const carried: Readonly<Record<string, readonly string[]>> = {
      google: ['קוהי'],
      overture: ['רוסטיקו', 'WOW', 'Palette Bistro'],
    };
    const L: string[] = ['\n── F2 / F3 as shipped: the candidates they carry', ''];
    for (const src of RUNS) {
      const board = scoreboardFor(src);
      for (const name of carried[src.provider] ?? []) {
        const row = board.rows.find((r) => r.rawName === name);
        L.push(`   ${src.provider.padEnd(8)} ${name.padEnd(16)} band=${String(row?.band)} score=${row?.score?.toFixed(4) ?? '—'} margin=${row?.margin?.toFixed(4) ?? 'null'} guard=${String(row?.guard)}`);
        expect(row?.band, `${src.provider}:${name}`).toBe('preselect');
        expect(row?.correctRank, `${src.provider}:${name}`).toBe(1);
      }
    }
    console.log(L.join('\n'));
  });

  it('F1, held: what it would still add, and to which candidate', () => {
    // The measurement that decides whether F1 is worth revisiting. After F2, the only thing it
    // still buys is the case the owner ruled out — so the two facts are reported together:
    // the candidate, and whether the caption gave an address at all.
    //
    // That second column is the finding. A caption that wrote a street address is already served
    // by F2 (corroborated) or is an `address_conflict` (contradicted). So F1's *entire* remaining
    // territory is candidates with NO address hint — which is exactly the population where a
    // trailing token cannot be told apart from a branch name, because nothing else in the query
    // says where the venue is.
    const L: string[] = ['\n── F1, held: what it would add on top of the shipped policy', ''];
    const p = PROPOSALS.find((x) => x.id === 'F1')!;
    let total = 0;
    for (const src of RUNS) {
      const board = scoreboardFor(src);
      const run = readJson<RecordedRun>(src.file);
      for (const kase of run.cases ?? []) {
        for (const cand of kase.candidates ?? []) {
          if (cand.resolutionKind !== 'answered') continue;
          const row = board.rows.find((r) => r.url === kase.url && r.rawName === cand.rawName);
          if (row === undefined || row.band === 'preselect') continue;
          const rb = rebuildForProposal(src.provider, kase.url, cand);
          if (rb === null || !p.promotes(rb.ranked, rb.q, rb.forms, src.sole)) continue;
          total += 1;
          L.push(
            `   ${src.provider.padEnd(8)} ${row.rawName} → ${String(row.top1)}  addressHint=${row.addressHint ?? 'NONE'}` +
              `  correctRank=${String(row.correctRank)}`,
          );
        }
      }
    }
    // Golden 44, for completeness: F1 has no shape there to fire on.
    let goldenMoved = 0;
    for (const caseId of Object.keys(golden)) {
      const ranked = goldenRanking(caseId);
      const q = goldenQuery(caseId);
      const forms = queryForms(q.text, null);
      if (confidenceOf(ranked, 'narrow-filter', forms).band === 'preselect') continue;
      if (p.promotes(ranked, q, forms, 'narrow-filter')) goldenMoved += 1;
    }
    L.push('');
    L.push(`   total across both real providers: ${String(total)}   golden-44: ${String(goldenMoved)}`);
    L.push(
      '   Every candidate above carries NO addressHint — which is the whole argument. A caption that',
    );
    L.push(
      '   wrote a street is already decided by F2 or is an address conflict, so F1 only ever acts where',
    );
    L.push(
      '   the query says nothing about location and a trailing token cannot be told from a branch name.',
    );
    console.log(L.join('\n'));
    expect(goldenMoved).toBe(0);
  });

  it('PART 3 — the three datasetConfidence weightings, re-run on all three corpora', () => {
    // The measurement `handoff-2026-08-28-categories-and-the-picker.md` §3.3 says never returned.
    // Applied externally over the REAL primitives — `bestNameScoreAcrossForms`, `categoryScore`,
    // `addressScore` — exactly as `dataset-confidence-weighting-2026-08-28.md` did. `score.ts` and
    // `scoring-constants.ts` are not touched. What is new here is that the branch guard now exists,
    // so this is the first time the weightings are measured against the control that was supposed
    // to compensate for removing the terms.
    const BLENDS: readonly { readonly id: string; readonly of: (n: number, c: number, d: number, provider: string) => number }[] = [
      { id: 'BASELINE 0.80/0.10/0.10', of: (n, c, d) => 0.8 * n + 0.1 * c + 0.1 * d },
      { id: 'DROP (renormalised)', of: (n, c) => (0.8 * n + 0.1 * c) / 0.9 },
      { id: 'DROP-UNPUBLISHED-ONLY', of: (n, c, d, provider) => (provider === 'google' ? (0.8 * n + 0.1 * c) / 0.9 : 0.8 * n + 0.1 * c + 0.1 * d) },
      { id: 'SHIPPED name-only', of: (n) => n },
    ];

    const L: string[] = ['\n── PART 3: dataset confidence weightings, with the branch guard in place', ''];
    L.push('| weighting | golden-44 preselect | golden-44 FALSE | google preselect | google FALSE | overture preselect | overture FALSE |');
    L.push('|---|---|---|---|---|---|---|');
    for (const blend of BLENDS) {
      const cells: string[] = [];

      // golden-44
      let gPre = 0;
      const gFalse: string[] = [];
      for (const caseId of Object.keys(golden)) {
        const q = goldenQuery(caseId);
        const forms = queryForms(q.text, null);
        const reblended = goldenRanking(caseId)
          .map((r) => ({ ...r, score: blend.of(r.nameScore, r.categoryScore, r.place.datasetConfidence, 'overture') }))
          .sort((a, b) => b.score - a.score);
        if (confidenceOf(reblended, 'narrow-filter', forms).band !== 'preselect') continue;
        gPre += 1;
        const verdict = adjudication.verdicts['overture_scored']?.[caseId] ?? '?';
        if (verdict !== 'OK' && STALE_VERDICTS[caseId] === undefined) gFalse.push(`${caseId}:${verdict}`);
      }
      cells.push(String(gPre), gFalse.length === 0 ? '0' : `**${String(gFalse.length)}** ${gFalse.join(' ')}`);

      // the two real corpora
      for (const src of RUNS) {
        const board = scoreboardFor(src);
        const run = readJson<RecordedRun>(src.file);
        let pre = 0;
        const falses: string[] = [];
        for (const kase of run.cases ?? []) {
          for (const cand of kase.candidates ?? []) {
            if (cand.resolutionKind !== 'answered') continue;
            const rb = rebuildForProposal(src.provider, kase.url, cand);
            if (rb === null) continue;
            const reblended = rb.ranked
              .map((r) => {
                const base = blend.of(r.nameScore, r.categoryScore, r.place.datasetConfidence, src.provider);
                const a = addressScore(rb.q.addressHint, r.place.addressLine);
                return { ...r, score: a === null ? base : (1 - SCORING.address.weight) * base + SCORING.address.weight * a };
              })
              .sort((a, b) => b.score - a.score);
            if (confidenceOf(reblended, src.sole, rb.forms).band !== 'preselect') continue;
            pre += 1;
            const row = board.rows.find((r) => r.url === kase.url && r.rawName === cand.rawName);
            if (row !== undefined && row.expected !== '(unadjudicated)' && row.correctRank !== 1) {
              falses.push(`${String(cand.rawName)}→${String(reblended[0]?.place.name)}`);
            }
          }
        }
        cells.push(String(pre), falses.length === 0 ? '0' : `**${String(falses.length)}** ${falses.join(' ')}`);
      }
      L.push(`| ${blend.id} | ${cells.join(' | ')} |`);
    }

    // The specimen the whole question was raised about.
    const overture = scoreboardFor(RUNS[1]!).rows.find((r) => r.rawName === 'קוהי');
    L.push('');
    L.push(
      `The §3.1 specimen — \`קוהי\` against \`Kohi Coffee Shop\` @ בן יהודה 155, dataset confidence 0.295 — ` +
        `under the SHIPPED weights: band **${String(overture?.band)}**, score ${overture?.score?.toFixed(4) ?? '—'}, margin ${overture?.margin?.toFixed(4) ?? 'null'}. ` +
        `The question it raised is closed by what already shipped.`,
    );
    console.log(L.join('\n'));
    expect(overture?.band).toBe('preselect');
  });

  it('writes the machine record', () => {
    writeFileSync(
      `${REPO}docs/evidence/places/recognition-failure-classes-run.json`,
      `${JSON.stringify(
        {
          _comment:
            'RECOG-METRICS-1 part 2. Failure classes and proposal effects, measured on three corpora with the shipped scorer. Regenerate: npx vitest run tests/manual/recognition-failure-classes.manual.ts --config tests/manual/vitest.manual.config.ts. Nothing in src/ was modified to produce this.',
          generated_at: new Date().toISOString(),
          classes: classTable,
          proposals: PROPOSALS.map((p) => ({ id: p.id, title: p.title, needsAddresses: p.needsAddresses })),
          effects,
        },
        null,
        2,
      )}\n`,
    );
    expect(classTable.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * A candidate's ranking, rebuilt for a proposal to be applied to it. Deliberately re-uses the
 * replay module's own reconstruction by round-tripping through `scoreboardFor`'s inputs.
 * ------------------------------------------------------------------------------------------- */

function rebuildForProposal(
  provider: 'google' | 'overture',
  url: string,
  cand: RecordedCandidate,
): { ranked: readonly RankedPlace[]; q: ResolveQuery; forms: readonly string[] } | null {
  const variants =
    readJson<{ urls?: Record<string, { candidates?: Record<string, readonly string[]> }> }>(
      'docs/evidence/places/recognition-query-variants.json',
    ).urls?.[url]?.candidates?.[cand.rawName] ?? [];
  const q: ResolveQuery = {
    text: cand.queryText,
    cityHint: cand.queryCityHint,
    countryHint: cand.countryHint,
    categoryHint: categoryHintFor(cand.categoryHint),
    addressHint: cand.addressHint,
    textVariants: variants,
    near: null,
    maxResults: null,
  };
  const rows: ResolvedPlace[] = (
    provider === 'overture'
      ? (cand.ranking?.rows ?? []).map((r) => ({
          provider: 'overture' as const,
          providerPlaceId: r.providerPlaceId,
          sourceDataset: 'overture-places' as const,
          regionId: 'tlv' as const,
          name: r.name,
          altNames: [],
          providerCategory: r.providerCategory,
          addressLine: r.address,
          locality: r.locality,
          lat: r.lat,
          lng: r.lng,
          datasetConfidence: r.datasetConfidence,
        }))
      : [
          ...(cand.top1 === null || cand.top1 === undefined
            ? []
            : [
                {
                  provider: 'google' as const,
                  providerPlaceId: `recorded-top1:${String(cand.queryText)}`,
                  sourceDataset: 'google-places' as const,
                  regionId: null,
                  name: cand.top1.name,
                  altNames: [] as readonly string[],
                  providerCategory: cand.top1.providerCategory,
                  addressLine: cand.top1.address,
                  locality: cand.top1.locality,
                  lat: cand.top1.lat,
                  lng: cand.top1.lng,
                  datasetConfidence: cand.top1.datasetConfidence,
                },
              ]),
          ...(cand.top3 ?? []).slice(1).map((entry, i) => ({
            provider: 'google' as const,
            providerPlaceId: `synthesised-rank${String(i + 2)}:${String(cand.queryText)}`,
            sourceDataset: 'google-places' as const,
            regionId: null,
            name: entry.replace(/\s*\([0-9.]+\)\s*$/u, ''),
            altNames: [] as readonly string[],
            providerCategory: null,
            addressLine: null,
            locality: null,
            lat: 0,
            lng: 0,
            datasetConfidence: 0.5,
          })),
        ]
  ) as ResolvedPlace[];
  if (rows.length === 0) return null;
  return { ranked: rankPlaces(q, rows), q, forms: queryForms(q.text, q.textVariants ?? null) };
}

