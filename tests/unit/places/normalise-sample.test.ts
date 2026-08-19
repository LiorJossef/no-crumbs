import { describe, expect, it } from 'vitest';

import { normalise } from '@/domain/places/normalise';
import sample from '../../../docs/evidence/places/normalise-name-sample-tlv.json';

/**
 * The second half of `10` §4.3's porting test, which task 2 recorded as owed: byte-identical output
 * to the Python `norm()` for a **1 000-row sample of ingested names**, not only for the 44 benchmark
 * queries. It needed a real ingest, and MS5 task 5 is the ingest.
 *
 * The pairs are pinned from a run of the prototype's unmodified `norm()`
 * (`docs/evidence/places/measure-normalise-name-sample.py`) over a deterministic stride sample of
 * the Tel Aviv extract of Overture release `2026-07-22.0` — the release the benchmark was measured
 * on. 613 of the 1 000 names contain non-ASCII characters and 590 contain Hebrew, which is the
 * point: the porting trap in `10` §4 (`\w` is Unicode-aware in Python, ASCII-only in JavaScript)
 * fails as silent coverage loss, and Hebrew names are exactly where it would have shown up.
 *
 * This matters more than a normal port test because `name_norm` is written by the loader and the
 * query is normalised by the resolver. A divergence between the two is not an error — it is a
 * coverage drop that reads as bad data (`10` §4).
 */
describe('normalise() against 1 000 ingested Overture names', () => {
  it('has a sample of the shape the evidence file documents', () => {
    expect(sample.pairs).toHaveLength(1000);
    expect(sample.source_rows).toBe(4997);
    expect(sample.names_with_hebrew).toBe(590);
  });

  it('is byte-identical to the prototype for every sampled name', () => {
    const divergences: { name: string; python: string; typescript: string }[] = [];
    for (const pair of sample.pairs) {
      const ours = normalise(pair.name);
      // === on strings, never a normalised-then-compared form: this test exists to catch the case
      // where the two implementations disagree by one code point.
      if (ours !== pair.norm) {
        divergences.push({ name: pair.name, python: pair.norm, typescript: ours });
      }
    }
    expect(divergences).toEqual([]);
  });

  it('never produces an empty or over-long name_norm for a real ingested name', () => {
    // `poi_index.name_norm` is `check (length(name_norm) between 1 and 1000)` (0010). A row that
    // normalises to '' would abort the whole single-transaction region load, so the loader rejects
    // it; this asserts the sample contains no such name, i.e. that the guard is not load-bearing
    // for ordinary data.
    for (const pair of sample.pairs) {
      const ours = normalise(pair.name);
      expect(ours.length).toBeGreaterThan(0);
      expect(ours.length).toBeLessThanOrEqual(1000);
    }
  });
});
