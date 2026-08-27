/**
 * Enough to prove the port, not the whole benchmark. The 44-case golden file against
 * `raw-overture-scored.json` is MS5 task 4's (`qa-reliability`) and is deliberately not written
 * here; DuckDB equivalence is `jaro-winkler.test.ts`. What is left for this file is the arithmetic
 * around those two: the blend, the substring credit, the surplus-token penalty, the tie-break, the
 * bands, and the two defect fixes the port is required to make.
 *
 * The `nameScore` expectations that carry a case id are the prototype's own measured outputs, read
 * off `raw-overture-scored.json` — the port is being compared against the script that produced the
 * evidence, not against what this test's author expected. They are rounded with `toFixed(3)` rather
 * than `Math.round(x * 1000)`, because five rows in that file sit exactly on a `.0005` boundary
 * whose double is a hair *below* the half; Python's `round()` and `toFixed()` both go down there and
 * `Math.round(x * 1000)` goes up.
 */

import { describe, expect, it } from 'vitest';

import type { PlaceProvider, RankedPlace, ResolveQuery, ResolvedPlace } from '@/domain/types';
import { jaroWinklerSimilarity } from '@/domain/places/jaro-winkler';
import { normalise } from '@/domain/places/normalise';
import {
  bestNameScore,
  categoryScore,
  confidenceOf,
  distinctiveTokens,
  nameScore,
  queryTokens,
  rankPlaces,
  scoreCandidates,
  scorePlace,
} from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';

const round3 = (value: number): number => Number(value.toFixed(3));

function place(overrides: Partial<ResolvedPlace> & { name: string }): ResolvedPlace {
  return {
    provider: 'overture' satisfies PlaceProvider,
    providerPlaceId: `id-${overrides.name}`,
    sourceDataset: 'overture-places',
    regionId: 'tyo',
    altNames: [],
    providerCategory: 'coffee_shop',
    addressLine: null,
    locality: null,
    lat: 35.6,
    lng: 139.7,
    datasetConfidence: 0.5,
    ...overrides,
  };
}

function query(overrides: Partial<ResolveQuery> & { text: string }): ResolveQuery {
  return {
    cityHint: null,
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: null,
    ...overrides,
  };
}

function ranked(score: number, name = 'x'): RankedPlace {
  return { place: place({ name }), score, nameScore: score, tokenCoverage: 1, categoryScore: 1 };
}

describe('distinctiveTokens / queryTokens', () => {
  it('drops generic words and single characters', () => {
    expect(distinctiveTokens('The Glitch Coffee & Roasters')).toEqual(['glitch']);
    // 'a' is generic *and* too short; '&' is gone at normalisation.
    expect(distinctiveTokens('a b Kiln')).toEqual(['kiln']);
  });

  it('counts token length in code points, not UTF-16 units', () => {
    // U+20BB7 is one CJK ideograph in two UTF-16 units. `t.length > 1` would keep it; Python's
    // `len(t) > 1` does not, and the benchmark was measured with Python's answer.
    expect(distinctiveTokens('\u{20BB7}')).toEqual([]);
    expect(distinctiveTokens('東京都')).toEqual(['東京都']);
  });

  it('falls back to every token when a query is nothing but generic words', () => {
    expect(distinctiveTokens('best coffee ever')).toEqual([]);
    expect(queryTokens('best coffee ever')).toEqual(['best', 'coffee', 'ever']);
  });

  it('is empty for an empty query rather than [""]', () => {
    expect(queryTokens('')).toEqual([]);
    expect(queryTokens('   !!!   ')).toEqual([]);
  });
});

describe('nameScore', () => {
  it('reproduces the prototype on rows it measured', () => {
    // TYO-01: '&' vs 'and' — the normalisation drops the ampersand, `and` is generic.
    const glitch = nameScore('Glitch Coffee & Roasters', 'Glitch Coffee and Roasters');
    expect(round3(glitch.nameScore)).toBe(0.982);
    expect(round3(glitch.tokenCoverage)).toBe(1);

    // TYO-02: the same distinctive token plus a branch suffix — the surplus-token penalty at work.
    const yakumo = nameScore('Onibus Coffee', 'Onibus Coffee Yakumo');
    expect(round3(yakumo.nameScore)).toBe(0.928);
    expect(round3(yakumo.tokenCoverage)).toBe(1);

    // LDN-13, the 0.000-margin case: a wrong candidate that still scores 0.898.
    const dove = nameScore('The Dove', 'The Andover Arms');
    expect(round3(dove.nameScore)).toBe(0.898);
    expect(round3(dove.tokenCoverage)).toBe(0.97);
  });

  it('is 1 for an identical name and unaffected by case, accents or punctuation', () => {
    expect(nameScore('Onibus Coffee', 'Onibus Coffee').nameScore).toBe(1);
    expect(nameScore('Café Levinsky', 'cafe levinsky!').nameScore).toBe(1);
  });

  it('credits a distinctive token contained in the name, however agglutinated', () => {
    // 'xoho' is not a token of 'cafexoho'; without the substring rule this scores far lower
    // (Jaro-Winkler alone gives 0.7833, and no prefix boost, because the name starts with 'cafe').
    const agglutinated = nameScore('Xoho', 'CafeXoho');
    expect(agglutinated.tokenCoverage).toBe(SCORING.substringCredit);
    expect(jaroWinklerSimilarity('xoho', 'cafexoho')).toBeLessThan(SCORING.substringCredit);
  });

  it('does not need the substring rule for `06` §6.1s prefixed-Hebrew example', () => {
    // Worth pinning because the documented justification is slightly off: `פלאפל הקוסם` splits into
    // two tokens on the space, so `פלאפל` is an exact **token** match at 1.0 and never reaches the
    // 0.97 substring credit. The rule earns its place on the agglutinated case above, not this one.
    expect(nameScore('פלאפל', 'פלאפל הקוסם').tokenCoverage).toBe(1);
  });

  it('never lets the substring credit lower a real token match', () => {
    // An exact token match is 1.0 and must not be dragged down to 0.97.
    expect(nameScore('Kiln', 'Kiln').tokenCoverage).toBe(1);
  });

  it('penalises surplus distinctive tokens, and caps the penalty', () => {
    // Asserted against the formula rather than against a difference, because the whole-string term
    // changes with the candidate too and would hide the penalty.
    const expected = (query_: string, name: string, penalty: number, coverage: number): number =>
      SCORING.name.whole * jaroWinklerSimilarity(normalise(query_), normalise(name)) +
      SCORING.name.tokenCoverage * coverage -
      penalty;

    // 'Kiln Bar Soho': distinctive tokens kiln + soho ('bar' is generic) against a one-token
    // query — one surplus token, one unit of penalty.
    expect(nameScore('Kiln', 'Kiln Bar Soho').nameScore).toBe(
      expected('Kiln', 'Kiln Bar Soho', SCORING.extraTokenPenalty.perToken, 1),
    );
    // Six surplus tokens would be 0.24 of penalty; the cap holds it at 0.15.
    const long = 'Kiln Soho Brewer Street Upstairs Annex Two';
    expect(nameScore('Kiln', long).nameScore).toBe(
      expected('Kiln', long, SCORING.extraTokenPenalty.max, 1),
    );
    // No surplus, no penalty.
    expect(nameScore('Kiln Soho', 'Kiln Soho').nameScore).toBe(1);
  });

  it('scores 0/0 when either side normalises away', () => {
    expect(nameScore('', 'Kiln')).toEqual({ nameScore: 0, tokenCoverage: 0 });
    expect(nameScore('Kiln', '   ')).toEqual({ nameScore: 0, tokenCoverage: 0 });
    expect(nameScore('!!!', '!!!')).toEqual({ nameScore: 0, tokenCoverage: 0 });
  });

  it('is floored at 0 rather than going negative on the penalty', () => {
    const score = nameScore('zzzz', 'alpha beta gamma delta epsilon zeta').nameScore;
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('categoryScore', () => {
  it('matches on a split part and on the whole slug', () => {
    expect(categoryScore('cafe', 'coffee_shop')).toBe(1);
    expect(categoryScore('cafe', 'bakery')).toBe(1);
    expect(categoryScore('restaurant', 'fast_food')).toBe(1);
    expect(categoryScore('bar', 'cocktail bar')).toBe(1);
    expect(categoryScore('bar', 'PUB')).toBe(1);
  });

  it('is 0 for a disagreement, a missing hint or a missing category', () => {
    expect(categoryScore('cafe', 'lawyer')).toBe(0);
    expect(categoryScore('bar', 'coffee_shop')).toBe(0);
    expect(categoryScore(null, 'coffee_shop')).toBe(0);
    expect(categoryScore('cafe', null)).toBe(0);
    expect(categoryScore('cafe', '')).toBe(0);
  });
});

describe('scorePlace', () => {
  it('blends the three terms with weights that sum to 1', () => {
    const scored = scorePlace(
      place({ name: 'Onibus Coffee', providerCategory: 'coffee_shop', datasetConfidence: 1 }),
      'cafe',
      'Onibus Coffee',
    );
    expect(scored.nameScore).toBe(1);
    expect(scored.categoryScore).toBe(1);
    // 0.72 + 0.18 + 0.1 is 0.9999999999999999 in binary floating point, so a perfect match scores
    // a hair under 1. That is the direction that matters: the score can never *exceed* 1, which is
    // what `places.resolution_score`s `check (… between 0 and 1)` (migration 0005) needs.
    expect(scored.score).toBeCloseTo(1, 15);
    expect(scored.score).toBeLessThanOrEqual(1);
  });

  it('keeps the score in [0,1] for the worst case, which is `resolution_score`s CHECK', () => {
    const worst = scorePlace(place({ name: '', datasetConfidence: 0 }), null, '');
    expect(worst.score).toBe(0);
  });

  it('does not coalesce dataset confidence — the column supplies the default', () => {
    const scored = scorePlace(
      place({ name: 'Kiln', providerCategory: null, datasetConfidence: 0 }),
      null,
      'Kiln',
    );
    expect(scored.score).toBe(SCORING.total.name);
  });
});

describe('rankPlaces', () => {
  it('ranks best first', () => {
    const result = rankPlaces(query({ text: 'Onibus Coffee' }), [
      place({ name: 'Onibus Coffee Yakumo' }),
      place({ name: 'Onibus Coffee' }),
      place({ name: 'Ichiran Shibuya' }),
    ]);
    expect(result.map((r) => r.place.name)).toEqual([
      'Onibus Coffee',
      'Onibus Coffee Yakumo',
      'Ichiran Shibuya',
    ]);
  });

  it('breaks an exact tie by name descending, as the prototypes tuple sort did', () => {
    const result = rankPlaces(query({ text: 'Kiln' }), [
      place({ name: 'Kiln', providerPlaceId: 'a' }),
      place({ name: 'Kilo', providerPlaceId: 'b' }),
    ]);
    // Both would tie only if scores matched; assert the comparator is total and deterministic
    // by ranking two rows with the same name and different ids.
    const sameName = rankPlaces(query({ text: 'Kiln' }), [
      place({ name: 'Kiln', providerPlaceId: 'aaa' }),
      place({ name: 'Kiln', providerPlaceId: 'zzz' }),
    ]);
    expect(result[0]?.place.name).toBe('Kiln');
    expect(sameName.map((r) => r.place.providerPlaceId)).toEqual(['zzz', 'aaa']);
  });

  it('does not mutate the candidate array it was given', () => {
    const candidates = [place({ name: 'Ichiran' }), place({ name: 'Kiln' })];
    const before = candidates.map((c) => c.name);
    rankPlaces(query({ text: 'Kiln' }), candidates);
    expect(candidates.map((c) => c.name)).toEqual(before);
  });
});

describe('confidenceOf — the bands, and the two defects the port fixes', () => {
  it('preselects only when both gates pass', () => {
    const confidence = confidenceOf([ranked(0.96), ranked(0.9)]);
    expect(confidence).toEqual({ band: 'preselect', score: 0.96, margin: 0.96 - 0.9 });
  });

  it('is exact at the boundaries rather than rounding to three decimals first', () => {
    // Score exactly at the gate, margin comfortably over it: preselect. A hair under: confirm.
    expect(confidenceOf([ranked(0.92), ranked(0.85)]).band).toBe('preselect');
    expect(confidenceOf([ranked(0.9199), ranked(0.85)]).band).toBe('confirm');
    // And exactly at the confirm gate is confirm, not no_match.
    expect(confidenceOf([ranked(0.8), ranked(0.1)]).band).toBe('confirm');
    // Margin 0.0496 — an implementation that rounded to three decimals first would call this 0.05
    // and pre-tick a row it should have asked about.
    expect(confidenceOf([ranked(0.95), ranked(0.9004)]).band).toBe('confirm');
    // And the comparison is on the double, not on the decimal it looks like: 0.95 − 0.90 is
    // 0.04999999999999993, which does *not* clear a 0.05 gate. Pinned rather than papered over —
    // if a re-fit ever wants decimal semantics here, this is the test that will say so out loud.
    expect(0.95 - 0.9).toBeLessThan(SCORING.bands.preselectMargin);
    expect(confidenceOf([ranked(0.95), ranked(0.9)]).band).toBe('confirm');
  });

  it('confirms a high score with a thin margin — the multi-branch case', () => {
    // AFURI at margin 0.002: certain of the business, uncertain which branch.
    const confidence = confidenceOf([ranked(0.98), ranked(0.978)]);
    expect(confidence.band).toBe('confirm');
  });

  it('reports an unmeasured margin as null and bands it `confirm`, never `preselect`', () => {
    // The inherited defect (10 §8): the prototype wrote 1.0 here and sailed through the gate.
    const confidence = confidenceOf([ranked(1)]);
    expect(confidence.margin).toBeNull();
    expect(confidence.band).toBe('confirm');
  });

  it('is no_match below the confirm gate, and for nothing at all', () => {
    expect(confidenceOf([ranked(0.799), ranked(0.1)]).band).toBe('no_match');
    expect(confidenceOf([])).toEqual({ band: 'no_match', score: 0, margin: null });
  });
});

describe('scoreCandidates', () => {
  const candidates = [
    place({ name: 'Onibus Coffee', providerPlaceId: '1', datasetConfidence: 0.95 }),
    place({ name: 'Onibus Coffee Yakumo', providerPlaceId: '2', datasetConfidence: 0.95 }),
    place({ name: 'Onibus Coffee Nakameguro', providerPlaceId: '3', datasetConfidence: 0.95 }),
    place({ name: 'Onibus Coffee Jiyugaoka', providerPlaceId: '4', datasetConfidence: 0.95 }),
    place({ name: 'Koffee Mameya', providerPlaceId: '5', datasetConfidence: 0.95 }),
    place({ name: 'Ichiran Shibuya', providerPlaceId: '6', datasetConfidence: 0.95 }),
  ];

  it('defaults the shortlist to five and reports what the prefilter returned', () => {
    const result = scoreCandidates(
      query({ text: 'Onibus Coffee', categoryHint: 'cafe' }),
      candidates,
      ['tyo'],
    );
    expect(result.shortlist).toHaveLength(SCORING.defaultMaxResults);
    expect(result.candidatesPrefiltered).toBe(6);
    expect(result.regionsSearched).toEqual(['tyo']);
    expect(result.shortlist[0]?.place.name).toBe('Onibus Coffee');
  });

  it('honours maxResults without letting truncation fabricate a null margin', () => {
    const result = scoreCandidates(
      query({ text: 'Onibus Coffee', categoryHint: 'cafe', maxResults: 1 }),
      candidates,
      ['tyo'],
    );
    expect(result.shortlist).toHaveLength(1);
    // Six real candidates were compared, so the margin is measured and the band is decided on the
    // full ranking — the divergence from the prototype, which computed the margin from its
    // truncated list and would have reported an unmeasured margin here.
    expect(result.confidence.margin).not.toBeNull();
    expect(result.confidence).toEqual(
      scoreCandidates(query({ text: 'Onibus Coffee', categoryHint: 'cafe' }), candidates, ['tyo'])
        .confidence,
    );
  });

  it('searched nothing when the city hint mapped to no loaded region', () => {
    const result = scoreCandidates(query({ text: 'Some Lisbon Cafe' }), [], []);
    expect(result.shortlist).toEqual([]);
    expect(result.confidence.band).toBe('no_match');
    expect(result.regionsSearched).toEqual([]);
    expect(result.candidatesPrefiltered).toBe(0);
  });
});

describe('SCORING', () => {
  it('is frozen, so one test cannot re-band another', () => {
    expect(Object.isFrozen(SCORING)).toBe(true);
    expect(Object.isFrozen(SCORING.bands)).toBe(true);
    expect(Object.isFrozen(SCORING.generic)).toBe(true);
    expect(Object.isFrozen(SCORING.categoryTokens.cafe)).toBe(true);
  });

  it('holds the prototypes values, which are what 06 §6.3 measured', () => {
    expect(SCORING.name).toEqual({ whole: 0.45, tokenCoverage: 0.55 });
    expect(SCORING.total).toEqual({ name: 0.72, category: 0.18, datasetConfidence: 0.1 });
    // 0.9999999999999999 in binary, which is the safe side of `resolution_score`s CHECK.
    expect(SCORING.total.name + SCORING.total.category + SCORING.total.datasetConfidence)
      .toBeCloseTo(1, 15);
    expect(SCORING.extraTokenPenalty).toEqual({ perToken: 0.04, max: 0.15 });
    expect(SCORING.substringCredit).toBe(0.97);
    expect(SCORING.bands).toEqual({
      preselectScore: 0.92,
      preselectMargin: 0.05,
      confirmScore: 0.8,
    });
    expect(SCORING.defaultMaxResults).toBe(5);
    expect(SCORING.generic.size).toBe(31);
    expect(Object.keys(SCORING.categoryTokens)).toEqual(['cafe', 'bar', 'restaurant']);
  });
});

/**
 * Divergence 5 — `nameScore` is the best over `name` and `altNames`.
 *
 * The reason this exists is not "aliases are nice": `poi_index.alt_names` is about to carry the
 * Hebrew and English forms of the same venue, and without this the Hebrew row is unreachable from
 * an English caption and vice versa. The properties below are what keep it from being a licence for
 * an alias to change results it should not.
 */
describe('bestNameScore — the alias change', () => {
  it('is exactly nameScore(name) when there are no aliases', () => {
    expect(bestNameScore('Falafel HaKosem', 'Falafel HaKosem', [])).toEqual(
      nameScore('Falafel HaKosem', 'Falafel HaKosem'),
    );
    expect(bestNameScore('HaKosem', 'Miznon', [])).toEqual(nameScore('HaKosem', 'Miznon'));
  });

  it('takes the alias when the alias scores higher', () => {
    const viaAlias = bestNameScore('Falafel HaKosem', 'פלאפל הקוסם', ['Falafel HaKosem']);
    expect(viaAlias).toEqual(nameScore('Falafel HaKosem', 'Falafel HaKosem'));
    expect(viaAlias.nameScore).toBeGreaterThan(nameScore('Falafel HaKosem', 'פלאפל הקוסם').nameScore);
  });

  it('works in the other direction too — Hebrew query, Hebrew alias on a Latin row', () => {
    expect(bestNameScore('פלאפל הקוסם', 'Falafel HaKosem', ['פלאפל הקוסם'])).toEqual(
      nameScore('פלאפל הקוסם', 'פלאפל הקוסם'),
    );
  });

  it('keeps the primary name on a tie, so an alias can only ever raise a score', () => {
    const both = bestNameScore('HaKosem', 'HaKosem', ['HaKosem']);
    expect(both).toEqual(nameScore('HaKosem', 'HaKosem'));
  });

  it('never lowers a score, whatever the aliases are', () => {
    const alone = nameScore('HaKosem', 'HaKosem');
    const withJunk = bestNameScore('HaKosem', 'HaKosem', ['', 'utterly unrelated brasserie', 'x']);
    expect(withJunk.nameScore).toBe(alone.nameScore);
  });

  it('carries tokenCoverage from the winning string, not from the primary name', () => {
    // If coverage were recomputed against `name`, RankedPlace would report two numbers describing
    // two different comparisons — an incoherent diagnostic is worse than a missing one.
    const best = bestNameScore('Falafel HaKosem', 'פלאפל הקוסם', ['Falafel HaKosem']);
    expect(best.tokenCoverage).toBe(nameScore('Falafel HaKosem', 'Falafel HaKosem').tokenCoverage);
  });
});

describe('scorePlace with aliases', () => {
  it('promotes an aliased row above an unaliased near-miss', () => {
    const aliased = place({ name: 'פלאפל הקוסם', altNames: ['Falafel HaKosem'], providerPlaceId: 'a' });
    const other = place({ name: 'Falafel Ravid', providerPlaceId: 'b' });
    const ranked = rankPlaces(query({ text: 'Falafel HaKosem' }), [other, aliased]);
    expect(ranked[0]?.place.providerPlaceId).toBe('a');
  });

  it('leaves an alias-free row byte-identical to before the change', () => {
    const row = place({ name: 'Falafel HaKosem' });
    const scored = scorePlace(row, null, 'Falafel HaKosem');
    const expected = nameScore('Falafel HaKosem', 'Falafel HaKosem');
    expect(scored.nameScore).toBe(expected.nameScore);
    expect(scored.tokenCoverage).toBe(expected.tokenCoverage);
  });
});
