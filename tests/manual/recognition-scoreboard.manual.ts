/**
 * RECOG-METRICS-1 — the recognition scoreboard. **Zero provider quota, no network, no database.**
 *
 *   npx vitest run tests/manual/recognition-scoreboard.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept
 *
 * Everything it reads is committed. The replay, the fidelity limits and the definitions of the four
 * rates all live in `recognition-replay.ts`; this file is the report and the assertions.
 *
 * Writes `docs/evidence/places/recognition-scoreboard-run.json`.
 */

import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';

import { SCORING } from '@/domain/places/scoring-constants';
import {
  REPO,
  RUNS,
  pct,
  scoreboardFor,
  synthesisedRivalsCannotReachTheGuard,
  type Scoreboard,
} from './recognition-replay';

describe('recognition scoreboard — recorded provider answers, shipped scorer', () => {
  const boards: Scoreboard[] = [];
  const sweep: Scoreboard[] = [];

  it('the replay is faithful to the record it replays', () => {
    // A synthesised Google rival has no coordinates. That is only safe while none of them can reach
    // the branch guard's distance test.
    expect(synthesisedRivalsCannotReachTheGuard()).toEqual([]);

    // The Overture record stores each row's `nameScore`. If today's primitives disagree with the
    // recorded ones the replay is measuring a different scorer than the run did — most likely
    // because the recorded run matched through an `altNames` entry the record does not keep.
    const drift = scoreboardFor(RUNS[1]!).rows
      .filter((r) => r.nameScoreDrift !== null && r.nameScoreDrift > 0.001)
      .map((r) => `${r.rawName}: drift ${String(r.nameScoreDrift)}`);
    expect(drift, 'recomputed name scores must match the recorded Overture run').toEqual([]);
  });

  for (const src of RUNS) {
    it(`${src.provider}: the four rates`, () => {
      const board = scoreboardFor(src);
      boards.push(board);

      const L: string[] = [];
      L.push(`\n── ${src.provider.toUpperCase()}  soleCandidateMeaning='${src.sole}'  —  ${String(board.adjudicated)} adjudicated candidates`);
      L.push(`   correct top-1        ${String(board.correctTop1)}/${String(board.adjudicated)}  ${pct(board.correctTop1, board.adjudicated)}`);
      L.push(`   auto-resolution      ${String(board.autoCorrect)}/${String(board.adjudicated)}  ${pct(board.autoCorrect, board.adjudicated)}   (rows in preselect: ${String(board.preselect)})`);
      L.push(`   genuine ambiguity    ${String(board.genuine)}/${String(board.adjudicated)}  ${pct(board.genuine, board.adjudicated)}`);
      L.push(`   WRONG AUTO-MATCH     ${String(board.autoWrong)}/${String(board.adjudicated)}  ${pct(board.autoWrong, board.adjudicated)}`);
      L.push(`   needless questions   ${String(board.needless)}/${String(board.adjudicated)}  ${pct(board.needless, board.adjudicated)}`);
      L.push(`   ranking failures ${String(board.rankingFailure)} · not found ${String(board.notFound)} · extraction misses ${String(board.extractionMiss)}`);
      L.push('');
      for (const r of board.rows) {
        L.push(
          `   ${r.outcome.padEnd(19)}${r.failureClass.padEnd(50)}${r.rawName} → ${r.top1 ?? '—'}` +
            `  band=${r.band} score=${r.score === null ? '—' : r.score.toFixed(4)} margin=${r.margin === null ? 'null' : r.margin.toFixed(4)}` +
            `  ask=${r.reason ?? '—'} guard=${r.guard}` +
            (r.synthesisedRivals > 0 ? `  [${String(r.synthesisedRivals)} rival(s) name-only]` : '') +
            (r.complete ? '' : `  [10-row window of ${String(r.rankedLength)}]`),
        );
      }
      console.log(L.join('\n'));

      expect(
        board.rows.filter((r) => r.outcome === 'auto_wrong').map((r) => `${r.rawName} → ${String(r.top1)}`),
        'a preselect that is wrong is shown to the user as settled fact',
      ).toEqual([]);
    });
  }

  it('lone-candidate policy — what `soleCandidateMeaning` buys, and what it costs', () => {
    const L: string[] = [
      '\n── lone candidate: should "the only result, and it matches" auto-accept?',
      '',
      '| provider | soleCandidateMeaning | auto-resolution | WRONG auto-match | needless questions | genuine ambiguity |',
      '|---|---|---|---|---|---|',
    ];
    for (const src of RUNS) {
      for (const sole of ['narrow-filter', 'exhaustive-search'] as const) {
        const b = scoreboardFor(src, sole);
        sweep.push(b);
        L.push(
          `| ${b.provider} | \`${sole}\`${sole === src.sole ? ' **(shipped)**' : ''} | ` +
            `${String(b.autoCorrect)}/${String(b.adjudicated)} (${pct(b.autoCorrect, b.adjudicated)}) | ` +
            `**${String(b.autoWrong)}** | ${String(b.needless)} | ${String(b.genuine)} |`,
        );
      }
    }
    const introduced = sweep
      .filter((b) => b.sole === 'exhaustive-search')
      .flatMap((b) => b.rows.filter((r) => r.outcome === 'auto_wrong').map((r) => `${b.provider}:${r.rawName}`));
    L.push('');
    L.push(`Wrong auto-matches under 'exhaustive-search', either provider: ${String(introduced.length)}`);
    console.log(L.join('\n'));
    expect(introduced).toEqual([]);
  });

  it('writes the machine record', () => {
    writeFileSync(
      `${REPO}docs/evidence/places/recognition-scoreboard-run.json`,
      `${JSON.stringify(
        {
          _comment:
            'RECOG-METRICS-1 machine record. Recorded provider answers re-scored with the SHIPPED scorer — no network, no database, no provider quota. Regenerate: npx vitest run tests/manual/recognition-scoreboard.manual.ts --config tests/manual/vitest.manual.config.ts. Definitions in tests/manual/recognition-replay.ts.',
          generated_at: new Date().toISOString(),
          scoring_constants: {
            total: SCORING.total,
            bands: SCORING.bands,
            branchGuard: SCORING.branchGuard,
            address: SCORING.address,
          },
          shipped: boards,
          lone_candidate_sweep: sweep.map((b) => ({ ...b, rows: undefined })),
        },
        null,
        2,
      )}\n`,
    );
    expect(boards.length).toBe(RUNS.length);
  });
});
