import { describe, expect, it } from 'vitest';

import { resolveLocality, type LocalityRow } from '@/domain/search/locality-match';

/**
 * **The measured defect, as a test.** `nls-plan.md` §1.2: the library stores four spellings of one
 * city, `normalise()` folds none of them together because it folds hyphens and accents but nothing
 * across scripts, and `filterBySearch` therefore returns 7 rows for `tel aviv` and 13 for
 * `תל אביב` where the truth is one area. §5.6 makes closing that the stage's headline criterion:
 * *"All four stored Tel Aviv spellings, plus `תל אביב` and `Tel Aviv-Yafo`, each return the same
 * 20 places."*
 *
 * The fixture mirrors §1.2's real distribution — 14 `תל אביב-יפו`, 8 `Tel Aviv-Yafo`, 2
 * `Tel Aviv`, 1 `ת״א` — with coordinates a few hundred metres apart, plus decoys that must not be
 * dragged in. **25 is this fixture's number, not a claim about the live library**: the live count
 * belongs to §5.6 and is measured when this is wired to the page.
 */
function tlv(index: number, locality: string): LocalityRow {
  return {
    id: `tlv-${locality}-${index}`,
    locality,
    // ~200 m apart, so proximity alone joins them and the spelling never gets a vote.
    lat: 32.07 + index * 0.002,
    lng: 34.78 + index * 0.002,
  };
}

const TEL_AVIV: readonly LocalityRow[] = [
  ...Array.from({ length: 14 }, (_, i) => tlv(i, 'תל אביב-יפו')),
  ...Array.from({ length: 8 }, (_, i) => tlv(i, 'Tel Aviv-Yafo')),
  ...Array.from({ length: 2 }, (_, i) => tlv(i, 'Tel Aviv')),
  tlv(0, 'ת״א'),
];

const ELSEWHERE: readonly LocalityRow[] = [
  { id: 'jlm-1', locality: 'ירושלים', lat: 31.78, lng: 35.21 },
  { id: 'jlm-2', locality: 'Jerusalem', lat: 31.79, lng: 35.22 },
  { id: 'ldn-1', locality: 'London', lat: 51.5, lng: -0.12 },
  { id: 'ldn-2', locality: 'London', lat: 51.51, lng: -0.13 },
  { id: 'nowhere', locality: null, lat: 40.0, lng: -3.0 },
];

const LIBRARY: readonly LocalityRow[] = [...TEL_AVIV, ...ELSEWHERE];
const TEL_AVIV_IDS = new Set(TEL_AVIV.map((row) => row.id));

describe('a city name resolves to the user’s own area, whatever they spelled it', () => {
  const spellings = [
    'תל אביב-יפו',
    'Tel Aviv-Yafo',
    'Tel Aviv',
    'ת״א',
    // The two §5.6 adds beyond what is stored. `תל אביב` is not a stored string at all — it is a
    // whole-token prefix of `תל אביב יפו`, which is the entire reason rung 2 exists.
    'תל אביב',
    'TEL AVIV',
    '  tel   aviv  ',
  ];

  it.each(spellings)('“%s” returns the same 25 places', (query) => {
    const match = resolveLocality(query, LIBRARY);
    expect(match).not.toBeNull();
    expect(new Set(match?.memberIds)).toEqual(TEL_AVIV_IDS);
    expect(match?.memberIds).toHaveLength(25);
  });

  it('every spelling returns exactly the same set as every other', () => {
    const sets = spellings.map((query) => [...(resolveLocality(query, LIBRARY)?.memberIds ?? [])].sort());
    for (const set of sets) expect(set).toEqual(sets[0]);
  });

  it('shows the library’s own plurality spelling, not a canonical one', () => {
    // 14 rows say `תל אביב-יפו` and 8 say `Tel Aviv-Yafo`, so a query typed in English still gets
    // the Hebrew label the library actually uses (§5.3).
    expect(resolveLocality('Tel Aviv', LIBRARY)?.label).toBe('תל אביב-יפו');
  });

  it('says which rung answered, because a prefix is a weaker claim than an exact name', () => {
    expect(resolveLocality('Tel Aviv-Yafo', LIBRARY)?.via).toBe('exact');
    expect(resolveLocality('תל אביב', LIBRARY)?.via).toBe('prefix');
  });

  it('reports what actually matched by name, apart from what the cluster added', () => {
    const match = resolveLocality('Tel Aviv', LIBRARY);
    expect(match?.matchedIds).toHaveLength(2);
    expect(match?.memberIds).toHaveLength(25);
  });
});

describe('what it refuses to answer', () => {
  it('does not resolve a name the library has nothing in — the keyword stays text', () => {
    expect(resolveLocality('Kyoto', LIBRARY)).toBeNull();
    expect(resolveLocality('京都', LIBRARY)).toBeNull();
  });

  it('does not resolve a dish, which is what most keywords are', () => {
    expect(resolveLocality('שניצל', LIBRARY)).toBeNull();
    expect(resolveLocality('momos', LIBRARY)).toBeNull();
  });

  it('does not resolve nothing at all', () => {
    expect(resolveLocality('', LIBRARY)).toBeNull();
    expect(resolveLocality('   ', LIBRARY)).toBeNull();
    expect(resolveLocality(null, LIBRARY)).toBeNull();
    expect(resolveLocality('Tel Aviv', [])).toBeNull();
  });

  it('never lets a longer phrase drag in a shorter name it merely contains', () => {
    // The asymmetry: the query may be a prefix of a stored name, never the reverse.
    expect(resolveLocality('Tel Aviv-Yafo north', LIBRARY)).toBeNull();
    expect(resolveLocality('London Bridge', LIBRARY)).toBeNull();
  });

  it('keeps a different city out of the answer', () => {
    const match = resolveLocality('Tel Aviv', LIBRARY);
    expect(match?.memberIds).not.toContain('jlm-1');
    expect(match?.memberIds).not.toContain('ldn-1');
    expect(match?.memberIds).not.toContain('nowhere');
  });

  it('resolves a city the user has one row in, and nothing more', () => {
    const match = resolveLocality('ירושלים', LIBRARY);
    expect(new Set(match?.memberIds)).toEqual(new Set(['jlm-1', 'jlm-2']));
    // Both spellings are one 2 km cluster, and the label is the plurality of the raw strings —
    // a genuine tie here, which `clusterLabel` answers with `null` rather than a coin flip.
    expect(match?.label).toBeNull();
  });

  it('is null, not a guess, when the name only ever appears on a row with no coordinate', () => {
    const rows: readonly LocalityRow[] = [
      { id: 'x', locality: 'Atlantis', lat: Number.NaN, lng: Number.NaN },
    ];
    expect(resolveLocality('Atlantis', rows)).toBeNull();
  });
});
