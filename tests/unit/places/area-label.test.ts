import { describe, expect, it } from 'vitest';

import { withCanonicalAreaLabels } from '@/domain/places/area-label';

/** Tel Aviv, roughly. Close enough that everything here lands in one 50 km cluster. */
const tlv = (locality?: string, n = 0): { lat: number; lng: number; locality?: string } => ({
  lat: 32.07 + n * 0.001,
  lng: 34.78 + n * 0.001,
  ...(locality === undefined ? {} : { locality }),
});

/** London, ~3 500 km away, so it is unambiguously its own cluster. */
const ldn = (locality?: string, n = 0): { lat: number; lng: number; locality?: string } => ({
  lat: 51.51 + n * 0.001,
  lng: -0.12 + n * 0.001,
  ...(locality === undefined ? {} : { locality }),
});

describe('withCanonicalAreaLabels', () => {
  it('gives one area one name — the real six-spelling library', () => {
    // The measured contents of `places.locality` on 2026-08-28, which is what this exists for.
    const before = [
      tlv('Tel Aviv-Yafo', 1),
      tlv('Tel Aviv-Yafo', 2),
      tlv('Tel Aviv-Yafo', 3),
      tlv('Tel Aviv-Yafo', 4),
      tlv('Tel Aviv-Yafo', 5),
      tlv('Tel Aviv-Yafo', 6),
      tlv('תל אביב - יפו', 7),
      tlv('תל אביב - יפו', 8),
      tlv('תל אביב - יפו', 9),
      tlv('Tel Aviv', 10),
      tlv('Tel Aviv', 11),
      tlv('תל אביב-יפו', 12),
      tlv('ת״א', 13),
    ];
    const after = withCanonicalAreaLabels(before);
    expect(new Set(after.map((p) => p.locality))).toEqual(new Set(['Tel Aviv-Yafo']));
  });

  it('names each area separately and never borrows across them', () => {
    const after = withCanonicalAreaLabels([
      tlv('תל אביב - יפו', 1),
      tlv('Tel Aviv-Yafo', 2),
      tlv('Tel Aviv-Yafo', 3),
      ldn('London', 4),
      ldn('London, UK', 5),
      ldn('London', 6),
    ]);
    expect(after.map((p) => p.locality)).toEqual([
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'Tel Aviv-Yafo',
      'London',
      'London',
      'London',
    ]);
  });

  it('preserves input order, which the list depends on', () => {
    const before = [tlv('Tel Aviv', 1), ldn('London', 2), tlv('Tel Aviv-Yafo', 3)];
    const after = withCanonicalAreaLabels(before);
    expect(after.map((p) => [p.lat, p.lng])).toEqual(before.map((p) => [p.lat, p.lng]));
  });

  it('leaves a place with no locality of its own without one', () => {
    // The honesty guard. Its cluster's name is very probably right; "probably right" is not a fact
    // to print in a field the user reads as one.
    const after = withCanonicalAreaLabels([tlv('Tel Aviv-Yafo', 1), tlv('Tel Aviv-Yafo', 2), tlv(undefined, 3)]);
    expect(after[2]!.locality).toBeUndefined();
  });

  it('leaves every member alone when the spellings tie', () => {
    // `clusterLabel` returns null on a tie rather than flipping a coin, and a tie is exactly the
    // case where there is no agreement to impose.
    const after = withCanonicalAreaLabels([tlv('Tel Aviv', 1), tlv('Tel Aviv-Yafo', 2)]);
    expect(after.map((p) => p.locality)).toEqual(['Tel Aviv', 'Tel Aviv-Yafo']);
  });

  it('passes an unusable coordinate through untouched', () => {
    // `clusterByProximity` drops it rather than clustering it at Null Island, so it belongs to no
    // area and has no name to take.
    const stray = { lat: Number.NaN, lng: Number.NaN, locality: 'ת״א' };
    const after = withCanonicalAreaLabels([tlv('Tel Aviv-Yafo', 1), tlv('Tel Aviv-Yafo', 2), stray]);
    expect(after[2]).toBe(stray);
  });

  it('returns the same object when nothing about it changes', () => {
    // Not micro-optimisation: these flow into React lists, and a new object identity per render for
    // a row that did not change is a re-render nobody asked for.
    const keeps = tlv('Tel Aviv-Yafo', 1);
    const after = withCanonicalAreaLabels([keeps, tlv('Tel Aviv-Yafo', 2), tlv('Tel Aviv', 3)]);
    expect(after[0]).toBe(keeps);
    expect(after[2]).not.toBe(undefined);
    expect(after[2]!.locality).toBe('Tel Aviv-Yafo');
  });

  it('carries every other field through unchanged', () => {
    const spot = { ...tlv('Tel Aviv', 1), id: 'a', name: 'Gelalucci' };
    const [only] = withCanonicalAreaLabels([spot, { ...tlv('Tel Aviv-Yafo', 2) }, { ...tlv('Tel Aviv-Yafo', 3) }]);
    expect(only).toEqual({ ...spot, locality: 'Tel Aviv-Yafo' });
  });
});
