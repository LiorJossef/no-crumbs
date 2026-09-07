/**
 * HARNESS-RIVAL-1 — the measurement capability guard.
 *
 * `docs/archive/handoff-2026-08-28-resolution-confidence.md` §4.3 records a defect that is not a bug in any
 * shipped function: the branch guard was measured entirely on the 44-case Overture golden file
 * because the **Google** run record stored coordinates for the top-1 row and a formatted string
 * (`"むぎとオリーブ (0.926)"`) for its runner-ups. The guard's whole question is how far apart the
 * top row and its nearest rival are, and that number was never written down — so the artefact could
 * not answer it however carefully it was re-read.
 *
 * The fix was to record it (`tests/manual/recognition-ranking.ts`). This file is the reason that
 * fix cannot silently rot: the harness it lives in is deliberately excluded from CI, so without a
 * unit test the next person to tidy the record shape can delete `lat`/`lng` and nothing goes red
 * until somebody tries, months later, to re-fit the guard and finds the corpus mute again.
 *
 * Each assertion below is written as *"the record can still answer question X"*, not as a snapshot
 * of the current field list — a record that grows fields stays green, a record that loses the
 * ability to locate a rival does not.
 */

import { describe, expect, it } from 'vitest';

import { nearestRivalOf, rankedRecordOf, RANKED_ROWS_RECORDED } from '../../manual/recognition-ranking';
import { queryForms } from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';
import type { RankedPlace, ResolvedPlace } from '@/domain/types';

function place(name: string, lat: number, lng: number, id: string): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: id,
    sourceDataset: 'google-places',
    regionId: null,
    name,
    altNames: [],
    providerCategory: 'restaurant',
    addressLine: null,
    locality: 'Tokyo',
    lat,
    lng,
    datasetConfidence: 0.5,
  };
}

function ranked(p: ResolvedPlace, score: number): RankedPlace {
  return { place: p, score, nameScore: score, tokenCoverage: score, categoryScore: 0 };
}

/**
 * TYO-10, the case the guard was built for, with its real coordinates:
 * `むぎとオリーブ` (bare, 3.2 km from Ginza) outscoring `むぎとオリーブ 銀座本店` (the venue the
 * caption asks for). Numbers from `docs/evidence/places/branch-guard-2026-08-28.md` §4.1.
 */
const BARE = place('むぎとオリーブ', 35.697, 139.77, 'p-bare');
const GINZA = place('むぎとオリーブ 銀座本店', 35.669, 139.764, 'p-ginza');

describe('the recognition run record can still locate a rival', () => {
  it('carries coordinates and a provider id for every ranked row, not only the top one', () => {
    const record = rankedRecordOf([ranked(BARE, 1.0), ranked(GINZA, 0.926)], queryForms('むぎとオリーブ', null));

    expect(record.rows).toHaveLength(2);
    for (const row of record.rows) {
      // The three facts §4.3 says were missing. A rival without a point cannot be measured against
      // `samePlaceMetres`, and a rival without an id cannot be looked up again later.
      expect(typeof row.lat, `rank ${String(row.rank)} lat`).toBe('number');
      expect(typeof row.lng, `rank ${String(row.rank)} lng`).toBe('number');
      expect(Number.isFinite(row.lat) && Number.isFinite(row.lng)).toBe(true);
      expect(row.providerPlaceId).not.toBe('');
    }
    expect(record.rows.map((r) => r.providerPlaceId)).toEqual(['p-bare', 'p-ginza']);
  });

  it('carries the score AND its component terms, so a record survives a re-weighting', () => {
    const record = rankedRecordOf([ranked(BARE, 1.0), ranked(GINZA, 0.926)], queryForms('むぎとオリーブ', null));
    const rival = nearestRivalOf(record);

    expect(rival).not.toBeNull();
    // `score` is a blend whose weights moved twice on 2026-08-28. A record that stored only the
    // blend would be un-re-scorable the next time they move.
    for (const key of ['score', 'nameScore', 'tokenCoverage', 'categoryScore'] as const) {
      expect(typeof record.rows[0]?.[key], key).toBe('number');
      expect(typeof rival?.[key], key).toBe('number');
    }
  });

  it('records the two numbers the guard reads — score gap and metres from the top-1', () => {
    const record = rankedRecordOf([ranked(BARE, 1.0), ranked(GINZA, 0.926)], queryForms('むぎとオリーブ', null));
    const rival = nearestRivalOf(record);

    expect(rival?.scoreGapFromTop1).toBeCloseTo(0.074, 6);
    // ~3.2 km, per §4.1. Asserted as a band rather than a constant: this is a geometry check, not a
    // pin on `haversineKm`'s last digit.
    expect(rival?.metresFromTop1).toBeGreaterThan(3_000);
    expect(rival?.metresFromTop1).toBeLessThan(3_500);
    expect(rival?.sameSpotAsTop1).toBe(false);
    expect(rival?.withinRivalScoreBand).toBe(true);
  });

  it('reports the shipped guard verdict rather than a copy of it', () => {
    const record = rankedRecordOf([ranked(BARE, 1.0), ranked(GINZA, 0.926)], queryForms('むぎとオリーブ', null));

    expect(record.branchGuard.fired).toBe(true);
    expect(record.branchGuard.reason).toBe('fired');
    expect(record.branchGuard.rivalName).toBe('むぎとオリーブ 銀座本店');
    expect(record.branchGuard.rivalRank).toBe(2);
    expect(record.branchGuard.rivalDifference).toEqual(['銀座本店']);
    // The constants are carried with the verdict so a stored record is self-describing.
    expect(record.constants.rivalScoreBand).toBe(SCORING.branchGuard.rivalScoreBand);
    expect(record.constants.samePlaceMetres).toBe(SCORING.samePlaceMetres);
  });

  it('distinguishes "no rival existed" from "a rival existed and did not qualify"', () => {
    // The single-answer case — 14 of the 16 Google corpus candidates. This must NOT read as a pass.
    const alone = rankedRecordOf([ranked(BARE, 1.0)], queryForms('むぎとオリーブ', null));
    expect(alone.branchGuard.fired).toBe(false);
    expect(alone.branchGuard.reason).toBe('no-rival');
    expect(alone.complete).toBe(true);
    expect(nearestRivalOf(alone)).toBeNull();

    // Two rows at the same point: `sameSpot`, so the guard declines on condition (3), not on
    // absence of a rival — and the record says which.
    const twin = place('むぎとオリーブ 銀座本店', 35.697, 139.7701, 'p-twin');
    const together = rankedRecordOf([ranked(BARE, 1.0), ranked(twin, 0.926)], queryForms('むぎとオリーブ', null));
    expect(together.branchGuard.fired).toBe(false);
    expect(together.branchGuard.reason).toBe('no-condition-met');
    expect(nearestRivalOf(together)?.sameSpotAsTop1).toBe(true);
  });

  it('says when the ranking was longer than it recorded, instead of looking rival-free', () => {
    const many = Array.from({ length: RANKED_ROWS_RECORDED + 3 }, (_, i) =>
      ranked(place(`row ${String(i)}`, 35.6 + i / 1000, 139.7, `p-${String(i)}`), 1 - i / 100),
    );
    const record = rankedRecordOf(many, queryForms('row', null));

    expect(record.rows).toHaveLength(RANKED_ROWS_RECORDED);
    expect(record.complete).toBe(false);
    expect(record.rankedLength).toBe(RANKED_ROWS_RECORDED + 3);
    expect(record.branchGuard.evaluatedOverRows).toBe(RANKED_ROWS_RECORDED + 3);
  });

  it('never calls a 10-row window onto a 297-row prefilter complete', () => {
    // The defect the first version of `rankedRecordOf` shipped with, pinned: `complete` was
    // computed against the rows it was handed rather than against the ranking those rows came from,
    // so a truncated Overture prefilter recorded as if nothing had been cut. A `false` guard
    // verdict over a window is a lower bound, and the record has to say so.
    const window = [ranked(BARE, 1.0), ranked(GINZA, 0.926)];
    const record = rankedRecordOf(window, queryForms('むぎとオリーブ', null), 297);

    expect(record.complete).toBe(false);
    expect(record.rankedLength).toBe(297);
    expect(record.rowsAvailable).toBe(2);
    expect(record.branchGuard.evaluatedOverRows).toBe(2);
  });

  it('records the guard as off — not as passed — when the caller passed no query forms', () => {
    // `confidenceOf` disables the guard without `forms` (evidence replays band a bare score list).
    // A record that spelled that `false` would read as "checked and clear".
    const record = rankedRecordOf([ranked(BARE, 1.0), ranked(GINZA, 0.926)], []);
    expect(record.branchGuard.fired).toBe(false);
    expect(record.branchGuard.reason).toBe('no-forms');
  });
});
