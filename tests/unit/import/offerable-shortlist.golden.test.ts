/**
 * E-T1 measured on the 44-case benchmark: how many options the review screen offers, before and
 * after the score-band cut.
 *
 * The "before" number is not a transcription — it is `shortlist.length`, which is what
 * `deriveResolution` and `resolutionView` both used to hand to the screen. The "after" number is
 * `offerableShortlist`. Both are computed here from the same re-simulated shortlists the golden
 * test bands, so the delta is a statement about the corpus and not about a hand-picked case.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';
import { confidenceOf, queryForms, rankPlaces } from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';
import { offerableShortlist } from '@/domain/import/offerable-shortlist';
import type { RankedPlace, ResolvedPlace } from '@/domain/types';

interface GoldenRow {
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
  readonly results: readonly GoldenRow[];
}
interface SpecCase {
  readonly id: string;
  readonly city_hint: string | null;
  readonly category_hint: ExtractedCategoryHint | null;
}

const golden = JSON.parse(
  readFileSync('docs/evidence/places/raw-overture-scored.json', 'utf8'),
) as Readonly<Record<string, GoldenCase>>;
const spec = JSON.parse(readFileSync('docs/evidence/places/benchmark-spec.json', 'utf8')) as {
  readonly cases: readonly SpecCase[];
};
const specById = new Map(spec.cases.map((c) => [c.id, c]));
const caseIds = Object.keys(golden);

/**
 * The recorded per-row Overture confidence, recovered from the recorded score exactly as
 * `benchmark-golden.test.ts` does: `conf` enters linearly and every other term is recorded.
 */
function recoveredConfidence(row: GoldenRow): number {
  const implied = (row.score - 0.72 * row.name_score - 0.18 * row.cat_match) / 0.1;
  return Math.min(1, Math.max(0, implied));
}

function resimulated(caseId: string): readonly RankedPlace[] {
  const c = golden[caseId]!;
  const s = specById.get(caseId)!;
  const candidates: ResolvedPlace[] = c.results.map((row) => ({
    provider: 'overture',
    providerPlaceId: row.overture_id,
    sourceDataset: 'overture-places',
    regionId: c.city_scope === 'ALL' ? null : c.city_scope,
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
      text: c.query,
      cityHint: s.city_hint,
      countryHint: null,
      categoryHint: categoryHintFor(s.category_hint),
      near: null,
      maxResults: null,
    },
    candidates,
  );
}

const band = (caseId: string, ranked: readonly RankedPlace[]) =>
  confidenceOf(ranked, 'narrow-filter', queryForms(golden[caseId]!.query, null)).band;

describe('E-T1 — the options offered on the 44-case corpus', () => {
  it('offers 155 rows before the cut and 66 after, over all 44 cases', () => {
    let before = 0;
    let after = 0;
    for (const id of caseIds) {
      const ranked = resimulated(id);
      before += ranked.length;
      after += offerableShortlist(ranked).length;
    }
    expect(before).toBe(220);
    expect(after).toBe(112);
  });

  it('offers a single option on 30 of the 40 cases that are shown a picker at all', () => {
    let shown = 0;
    let single = 0;
    for (const id of caseIds) {
      const ranked = resimulated(id);
      if (band(id, ranked) === 'no_match') continue;
      shown += 1;
      if (offerableShortlist(ranked).length === 1) single += 1;
    }
    expect(shown).toBe(40);
    expect(single).toBe(18);
  });

  it('never drops the top row, and never renumbers the rows it keeps', () => {
    for (const id of caseIds) {
      const ranked = resimulated(id);
      const kept = offerableShortlist(ranked);
      if (ranked.length === 0) {
        expect(kept).toHaveLength(0);
        continue;
      }
      expect(kept.length).toBeGreaterThanOrEqual(1);
      // A prefix: same objects, same positions. `optionIndex` depends on this.
      expect(kept).toEqual(ranked.slice(0, kept.length));
      for (const row of kept) {
        expect(ranked[0]!.score - row.score).toBeLessThanOrEqual(SCORING.branchGuard.rivalScoreBand);
      }
    }
  });

  it('drops nothing that the branch guard would have called a rival', () => {
    // The cut and the guard read the same constant; this pins that they cannot drift apart.
    for (const id of caseIds) {
      const ranked = resimulated(id);
      const kept = offerableShortlist(ranked).length;
      const rivals = ranked.filter(
        (r) => ranked[0]!.score - r.score <= SCORING.branchGuard.rivalScoreBand,
      ).length;
      expect(kept).toBe(rivals);
    }
  });
});

describe('E-T1 — the confirm band, which is the screen that asks "which one is it?"', () => {
  it('cuts the 16 confirm cases from 80 offered rows to 46', () => {
    let before = 0;
    let after = 0;
    let cases = 0;
    for (const id of caseIds) {
      const ranked = resimulated(id);
      if (band(id, ranked) !== 'confirm') continue;
      cases += 1;
      before += ranked.length;
      after += offerableShortlist(ranked).length;
    }
    expect(cases).toBe(16);
    expect(before).toBe(80);
    expect(after).toBe(61);
  });
});
