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
  addressScoreOf,
  bestNameScore,
  bestNameScoreAcrossForms,
  branchRival,
  categoryScore,
  confidenceOf,
  distinctiveTokens,
  MAX_QUERY_VARIANTS,
  matchedTextOf,
  nameDifference,
  nameScore,
  placeProximity,
  queryForms,
  queryTokens,
  rankPlaces,
  scoreCandidates,
  scorePlace,
  addressScore,
  parseAddress,
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

  it('holds the prototypes values everywhere TLV-RANK-1 did not re-fit', () => {
    expect(SCORING.name).toEqual({ whole: 0.45, tokenCoverage: 0.55 });
    expect(SCORING.extraTokenPenalty).toEqual({ perToken: 0.04, max: 0.15 });
    expect(SCORING.substringCredit).toBe(0.97);
    expect(SCORING.bands).toEqual({
      preselectScore: 0.92,
      preselectMargin: 0.05,
      confirmScore: 0.8,
    });
    expect(SCORING.defaultMaxResults).toBe(5);
    expect(Object.keys(SCORING.categoryTokens)).toEqual(['cafe', 'bar', 'restaurant']);
  });

  it('holds the re-fits of the two values that moved', () => {
    // `total` and `generic`. Both were the prototype's until 2026-08-27, when the first evidence
    // from a loaded index said they were wrong: a category bonus outranking a 1.000 name match
    // (TLV-14) and `gelato` scored as identity (TLV-10). `total` moved again on 2026-08-28
    // (RESOLVE-CONF-1) when both the category and the dataset-confidence terms were measured to be
    // net-harmful and set to zero. The argument is in `scoring-constants.ts`; the band-by-band
    // consequences are enumerated in `benchmark-golden.test.ts`. This is just the pin.
    expect(SCORING.total).toEqual({ name: 1, category: 0, datasetConfidence: 0 });
    expect(SCORING.total.name + SCORING.total.category + SCORING.total.datasetConfidence)
      .toBeCloseTo(1, 15);
    expect(SCORING.generic.size).toBe(53);
  });

  it('scores on the name, and on the address only where one can be compared', () => {
    // The whole shape of the score after RESOLVE-CONF-1, as an assertion rather than as prose: a
    // row we cannot compare an address against scores *exactly* its name score, whatever its
    // category and whatever the provider thinks of the row.
    const noAddress = place({ name: 'Onibus Coffee', providerCategory: null, datasetConfidence: 0 });
    const scored = scorePlace(noAddress, 'cafe', 'Onibus Coffee');
    expect(scored.score).toBe(scored.nameScore);

    // And the category cannot move it in either direction — the exact defect this removed. Same
    // row, same query, category agreeing and then flatly disagreeing.
    const agrees = scorePlace(
      place({ name: 'Cafe Europa', providerCategory: 'coffee_shop' }),
      'cafe',
      'Cafe Europa',
    );
    const disagrees = scorePlace(
      place({ name: 'Cafe Europa', providerCategory: 'restaurant' }),
      'cafe',
      'Cafe Europa',
    );
    expect(agrees.categoryScore).toBe(1);
    expect(disagrees.categoryScore).toBe(0);
    expect(agrees.score).toBe(disagrees.score);
    // Both auto-accept, which is the point: Google files a real café as `restaurant` and that is a
    // taxonomy disagreement, not evidence that we have the wrong venue.
    expect(disagrees.score).toBeGreaterThanOrEqual(SCORING.bands.preselectScore);
  });

  it('holds the TLV-ADDR-1 address constants', () => {
    // Pinned for the same reason as the weights: the address term is a free parameter fitted on
    // 13 real captions and 19 hand-checked address pairs, and a change to it has to be a
    // deliberate two-file diff. `streetMatch` sits between the two measurements it separates —
    // 0.953 for a spelling variant of one street, 0.800 for two different streets sharing a house
    // number — and moving it without re-running those pairs is how this term goes quietly wrong.
    expect(SCORING.address).toEqual({
      weight: 0.2,
      streetMatch: 0.9,
      streetOnly: 0.5,
      minStreetTokenLength: 3,
    });
    // The address takes its share from the base weights proportionally, so the total is still
    // exactly 1.00 for a row where the address applies — `resolution_score`'s CHECK, unclamped.
    const base = SCORING.total.name + SCORING.total.category + SCORING.total.datasetConfidence;
    expect((1 - SCORING.address.weight) * base + SCORING.address.weight).toBeCloseTo(1, 10);
    // `generic` is for place names and `addressNoise` is for addresses, and they must not be
    // merged: `בית` is generic in a name and is the first word of the street `בית אשל 15`.
    expect(SCORING.generic.has('בית')).toBe(true);
    expect(SCORING.addressNoise.has('בית')).toBe(false);
  });
});

/**
 * TLV-RANK-1 — the two measured ranking defects, as unit tests.
 *
 * Both are *observations from the real index* reduced to the smallest thing that reproduces them,
 * so that the live harness is not the only place they are caught. The live numbers they came from
 * are in the task record; the numbers here are the arithmetic, and they are what a future re-fit
 * has to keep true.
 */
describe('TLV-RANK-1 — the ranking defects the re-fit closed', () => {
  it('TLV-10: a plain Anita beats a Zucca Cafe & Gelato for the query "Anita Gelato"', () => {
    // The whole defect in one comparison. With `gelato` scored as identity, the query had two
    // distinctive tokens and the row that matched the *category* word matched two of two.
    const anita = nameScore('Anita Gelato', 'Anita');
    const zucca = nameScore('Anita Gelato', 'Zucca Cafe & Gelato');
    expect(anita.nameScore).toBeGreaterThan(zucca.nameScore);
    expect(distinctiveTokens('Anita Gelato')).toEqual(['anita']);
  });

  it('TLV-10 in Hebrew: the same query fails the same way without גלידה', () => {
    // 64% of the loaded index is Hebrew-named, so an English-only generic list is generic for a
    // third of the data. This is why the Hebrew block exists, and it is the case that justifies it.
    expect(distinctiveTokens('גלידה אניטה')).toEqual(['אניטה']);
    const anita = nameScore('גלידה אניטה', 'אניטה');
    const other = nameScore('גלידה אניטה', 'זוקה קפה וגלידה');
    expect(anita.nameScore).toBeGreaterThan(other.nameScore);
  });

  it('keeps the Hebrew and English lists saying the same thing', () => {
    // Every Hebrew entry is the translation of an entry that was already generic in English, so
    // this is a symmetry check rather than a list of new judgements. A word added on one side only
    // is the bug this catches.
    for (const [he, en] of [
      ['קפה', 'cafe'],
      ['בר', 'bar'],
      ['מסעדה', 'restaurant'],
      ['בית', 'house'],
      ['תל', 'tel'],
      ['אביב', 'aviv'],
      ['גלידה', 'gelato'],
      ['פיצה', 'pizza'],
      ['סושי', 'sushi'],
      ['מאפייה', 'bakery'],
    ] as const) {
      expect(SCORING.generic.has(he), `${he} (${en}) is generic in English only`).toBe(true);
      expect(SCORING.generic.has(en), `${en} is not generic`).toBe(true);
    }
    // Both current yod spellings, because `normalise()` does not unify them.
    expect(SCORING.generic.has('מאפיה')).toBe(true);
  });

  it('keeps out the words that are somebodys whole identity', () => {
    // `מזנון` is the Hebrew common noun for a canteen and it is also Miznon (TLV-05) — the exact
    // case the admission rule refuses. `wine` is category vocabulary and still excluded, because
    // NEG-03 ("that little wine bar near the market") would be left pointing at Sarona Market.
    for (const word of ['מזנון', 'wine', 'falafel', 'פלאפל', 'חומוס']) {
      expect(SCORING.generic.has(word), `${word} must not be generic`).toBe(false);
    }
    expect(distinctiveTokens('that little wine bar near the market')).toEqual(['wine', 'market']);
  });

  it('TLV-14: a 1.000 name match cannot be lost to a category bonus at all', () => {
    // `Hostel 51` is filed `bar`; the real `Bar 51` is filed `restaurant`. The name scores are the
    // measured ones from the live index. At 0.18 the bonus reversed them by 0.002; at 0.10 it
    // could no longer reverse a gap this size; at 0 it cannot reverse any gap, which is the
    // general form the two earlier re-fits were converging on.
    const exact = SCORING.total.name * 1 + SCORING.total.category * 0 + SCORING.total.datasetConfidence * 1;
    const bonus =
      SCORING.total.name * 0.785 + SCORING.total.category * 1 + SCORING.total.datasetConfidence * 0.768;
    expect(exact).toBeGreaterThan(bonus);

    // A category agreement is worth exactly this much name score: none.
    expect(SCORING.total.category).toBe(0);
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

/* ------------------------------------------------------------------------------------------- *
 * TLV-ADDR-1 — the street-address term
 * ------------------------------------------------------------------------------------------- */

describe('parseAddress', () => {
  it('splits a house number off the street words', () => {
    expect(parseAddress('לבונטין 19')).toEqual({ houseNumber: '19', streetTokens: ['לבונטין'] });
    expect(parseAddress('Rothschild Boulevard 15')).toEqual({
      houseNumber: '15',
      // `boulevard` is address noise; `rothschild` is the street.
      streetTokens: ['rothschild'],
    });
  });

  it('strips the city words a caption appends and address_line does not carry', () => {
    // The real extracted hint for Rustico. Without this, `תל` and `אביב` would be street words
    // that the candidate's `בזל 42` fails to contain, and an exact match would score as a miss.
    expect(parseAddress('בזל 42, תל אביב')).toEqual({ houseNumber: '42', streetTokens: ['בזל'] });
  });

  it('never mistakes a postal code for a house number', () => {
    // A real `address_line` from the index. `7575603` must not become the number — a match would
    // be a spectacular false positive and a mismatch would veto a true one.
    //
    // `ראשון לציון` survives as a street token and that is **deliberate**: `addressNoise` stops at
    // Tel Aviv's own names rather than listing every locality, because `ראשון לציון 10` is a real
    // street in Petah Tikva in this very index. The same words are a city on one row and a street
    // on another, and only one of those two mistakes is recoverable. Harmless here — only the
    // *query's* tokens have to be found, so extra words on the candidate side cost nothing.
    expect(parseAddress('מורשת ישראל 15, 7575603 ראשון לציון, ישראל')).toEqual({
      houseNumber: '15',
      streetTokens: ['מורשת', 'ראשון', 'לציון'],
    });
  });

  it('keeps the first number when the address carries several', () => {
    expect(parseAddress('דיזנגוף סנטר, מאיר דיזנגוף 50')?.houseNumber).toBe('50');
  });

  it('is null when there is nothing to compare, not an empty match', () => {
    expect(parseAddress(null)).toBeNull();
    expect(parseAddress(undefined)).toBeNull();
    expect(parseAddress('')).toBeNull();
    expect(parseAddress('   ')).toBeNull();
    // Numbers alone are not an address: no street, nothing to compare.
    expect(parseAddress('19')).toBeNull();
    // Every word is noise.
    expect(parseAddress('תל אביב, ישראל')).toBeNull();
  });
});

describe('addressScore — the three-valued contract', () => {
  it('is null, not zero, when either side has no address', () => {
    // The property the whole design rests on: 8 of the 17 real candidates carry no `addressHint`,
    // and 7% of index rows carry no address. `null` is "we did not look"; 0 is "it is elsewhere".
    expect(addressScore(null, 'לבונטין 19')).toBeNull();
    expect(addressScore('לבונטין 19', null)).toBeNull();
    expect(addressScore(null, null)).toBeNull();
    expect(addressScore('לבונטין 19', '')).toBeNull();
  });

  it('is null when the two addresses share no writing system', () => {
    // `רוטשילד 15` and `Rothschild Boulevard 15` are the same address and we cannot tell. Scoring
    // that 0 would demote a row for being transliterated — 15% of the index's addresses are Latin
    // or Cyrillic while 83% are Hebrew.
    expect(addressScore('רוטשילד 15, תל אביב', 'Rothschild Boulevard 15')).toBeNull();
    expect(addressScore('בן יהודה 155', 'Шахам 36')).toBeNull();
  });

  it('scores the real matched pairs from the corpus at or near 1', () => {
    // Every one of these is a real `addressHint` from the 13-caption corpus against the real
    // `address_line` of the venue it should have matched. These are the measurement, not examples.
    const pairs: readonly [string, string][] = [
      ['בן יהודה 155', 'בן יהודה 155'], // Kohi Coffee Shop — a Latin name behind a Hebrew address
      ['לבונטין 19', 'לבונטין 19'], // Brasserie 18
      ['אבן גבירול 26', 'אבן גבירול 26'], // האחים
      ['בית אשל 15', 'בית אשל 15'], // wow london
      ['בזל 42, תל אביב', 'בזל 42'], // Rustico — hint carries the city, address_line does not
      ['איינשטיין 69', 'אינשטיין 69'], // Trattoria Una — one yod apart
      ['דיזנגוף 50', 'דיזנגוף סנטר, מאיר דיזנגוף 50'], // address_line more verbose than the caption
    ];
    for (const [hint, line] of pairs) {
      expect(addressScore(hint, line), `${hint} ~ ${line}`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('scores a different house number 0, however similar the street', () => {
    // The house number is the discriminating part and a different one is conclusive. Whole-string
    // Jaro-Winkler scores these 0.94, 0.96 and 0.95 — higher than it scores a true match — which
    // is why this term does not use it.
    expect(addressScore('דיזנגוף 99', 'דיזנגוף 163')).toBe(0);
    expect(addressScore('אבן גבירול 26', 'אבן גבירול 70')).toBe(0);
    expect(addressScore('בן יהודה 155', 'בן יהודה 48')).toBe(0);
  });

  it('scores a different street 0 even when the house numbers agree', () => {
    // Two real Tel Aviv streets sharing a number. A mean over street tokens scores this 0.90,
    // because `המלך` matches itself; the minimum-over-required-tokens rule scores it 0.80, under
    // the 0.90 gate, and the gate takes it to 0.
    expect(addressScore('שלמה המלך 1', "המלך ג'ורג' 1")).toBe(0);
    expect(addressScore('בית אשל 15', 'בית הלל 15')).toBe(0);
    expect(addressScore('בן יהודה 155', 'בן גוריון 155')).toBe(0);
    expect(addressScore('בזל 42', 'הרצל 42')).toBe(0);
  });

  it('halves a street that no house number confirms', () => {
    // 9% of the index's addresses carry no digits at all. One street holds hundreds of venues, so
    // this is real evidence and weak evidence at the same time.
    const both = addressScore('דיזנגוף 99', 'דיזנגוף 99');
    const streetOnly = addressScore('דיזנגוף 99', 'דיזנגוף');
    expect(both).toBe(1);
    expect(streetOnly).toBeCloseTo(SCORING.address.streetOnly, 10);
  });

  it('never returns anything outside [0,1]', () => {
    for (const [h, l] of [
      ['לבונטין 19', 'לבונטין 19'],
      ['לבונטין 19', 'יונה הנביא 2'],
      ['דיזנגוף', 'דיזנגוף'],
    ] as const) {
      const value = addressScore(h, l);
      expect(value).not.toBeNull();
      expect(value!).toBeGreaterThanOrEqual(0);
      expect(value!).toBeLessThanOrEqual(1);
    }
  });
});

describe('scorePlace with an address — the sign of every outcome', () => {
  const kohi = place({
    name: 'Kohi Coffee Shop',
    addressLine: 'בן יהודה 155',
    providerCategory: 'coffee_shop',
    datasetConfidence: 0.8,
  });

  it('changes nothing at all when the query carries no address', () => {
    // **The invariant.** A candidate with an address, a query without one: byte-identical to the
    // score before this term existed. Not "close" — identical, and asserted on the whole object.
    const withoutArgument = scorePlace(kohi, 'cafe', 'Kohi');
    const withExplicitNull = scorePlace(kohi, 'cafe', 'Kohi', null);
    expect(withExplicitNull).toEqual(withoutArgument);

    // And the same row with no address at all scores the same as one with an address nobody asked
    // about, so the term cannot leak in through the candidate side either.
    const addressless = scorePlace({ ...kohi, addressLine: null }, 'cafe', 'Kohi');
    expect(addressless.score).toBe(withoutArgument.score);
  });

  it('lifts a row whose address is confirmed, and never above 1', () => {
    const base = scorePlace(kohi, 'cafe', 'Kohi').score;
    const confirmed = scorePlace(kohi, 'cafe', 'Kohi', 'בן יהודה 155').score;
    expect(confirmed).toBeGreaterThan(base);
    expect(confirmed).toBeLessThanOrEqual(1);

    // A perfect everything is still exactly 1.00, which is what keeps `resolution_score`'s CHECK
    // satisfied without a clamp: `(1 − w)·1 + w·1 = 1`.
    const perfect = scorePlace(
      place({ name: 'האחים', addressLine: 'אבן גבירול 26', providerCategory: 'restaurant', datasetConfidence: 1 }),
      'restaurant',
      'האחים',
      'אבן גבירול 26',
    );
    expect(perfect.score).toBeCloseTo(1, 10);
  });

  it('drops a row we can place somewhere else', () => {
    const base = scorePlace(kohi, 'cafe', 'Kohi').score;
    const elsewhere = scorePlace(kohi, 'cafe', 'Kohi', 'לבונטין 19').score;
    expect(elsewhere).toBeLessThan(base);
    expect(elsewhere).toBeCloseTo((1 - SCORING.address.weight) * base, 10);
  });

  it('leaves a row we cannot place exactly where it was', () => {
    // The ordering this produces is the intended one: a row of unknown location outranks a row
    // known to be elsewhere, because the second has evidence against it and the first has none.
    const unreadable = place({ ...kohi, addressLine: 'Ali Ben Abu Taleb' });
    expect(scorePlace(unreadable, 'cafe', 'Kohi', 'בן יהודה 155').score).toBe(
      scorePlace(unreadable, 'cafe', 'Kohi').score,
    );
    expect(scorePlace(unreadable, 'cafe', 'Kohi', 'בן יהודה 155').score).toBeGreaterThan(
      scorePlace(kohi, 'cafe', 'Kohi', 'לבונטין 19').score,
    );
  });

  it('adds nothing to RankedPlace that is not deliberate provenance', () => {
    // Deliberate: `RankedPlace` is persisted through `extractions.candidates` and its zod schema
    // (`domain/import/resolution-record.ts`), and is constructed by a dozen call sites outside this
    // module. This assertion was written to stop the address term leaking a field, and it is kept
    // exact so that every later addition has to be argued here.
    //
    // **Two fields have been argued.** `matchedText` (TLV-BILING-B) is query provenance — which of
    // `queryForms()`'s strings produced `nameScore`. `addressScore` (TRACK2-ADDR) is the
    // three-valued address term, carried because `confidenceOf` needs to tell *"somewhere else"*
    // (0) from *"could not compare"* (`null`) after the `addressHint` that produced it is out of
    // reach, and because `ux-when-we-ask.md` §3.1 makes that distinction the highest-precedence
    // reason to ask the user.
    //
    // Neither is in `StoredRankedPlaceSchema`, so zod strips both on the way back out of `jsonb`
    // and nothing downstream can ever read either as an input. In-memory provenance, not storage —
    // a resolution read back from the database carries its stored `band`, not the inputs to it.
    const ranked = scorePlace(kohi, 'cafe', 'Kohi', 'בן יהודה 155');
    expect(Object.keys(ranked).sort()).toEqual(
      ['addressScore', 'categoryScore', 'matchedText', 'nameScore', 'place', 'score',
        'tokenCoverage'].sort(),
    );
  });
});

describe('the address term cannot manufacture an auto-accept', () => {
  it('states the carry-over bound in terms of the constants', () => {
    // The lift a perfect address can give is `w·(1 − base)`, so the lowest base score it can carry
    // to the `preselect` gate is `(preselectScore − w) / (1 − w)`. Below that, no address makes a
    // row auto-acceptable. This matters because an address is not unique: `לבונטין 19` holds three
    // venues in the loaded index and `בן יהודה 155` holds two.
    const w = SCORING.address.weight;
    const lowestCarryable = (SCORING.bands.preselectScore - w) / (1 - w);
    expect(lowestCarryable).toBeGreaterThan(0.89);

    const justBelow = lowestCarryable - 0.001;
    expect((1 - w) * justBelow + w * 1).toBeLessThan(SCORING.bands.preselectScore);
  });

  it('leaves a mediocre name mediocre however right the address is', () => {
    // A wrong venue at the right address — the real case is `פונדק השובבים` at `נחלת בנימין 68`,
    // where the caption named Oscar's and Oscar's is not in the index. The address is perfect and
    // the row still cannot come close to the gate.
    const wrongVenueRightAddress = place({
      name: 'פונדק השובבים',
      addressLine: 'נחלת בנימין 68',
      providerCategory: 'restaurant',
      datasetConfidence: 0.9,
    });
    const ranked = scorePlace(wrongVenueRightAddress, 'restaurant', "Oscar's", 'נחלת בנימין 68');
    expect(ranked.score).toBeLessThan(SCORING.bands.confirmScore);
  });
});

describe('rankPlaces reads the address off the query', () => {
  it('treats an absent addressHint and an explicit null as the same thing', () => {
    const candidates = [
      place({ name: 'Brasserie 18', addressLine: 'לבונטין 19' }),
      place({ name: 'Super pizza', addressLine: 'לבונטין 19' }),
    ];
    const absent = rankPlaces(query({ text: 'Brasserie' }), candidates);
    const explicit = rankPlaces(query({ text: 'Brasserie', addressHint: null }), candidates);
    expect(explicit).toEqual(absent);
  });

  it('cannot pick between two venues at the same address on the address alone', () => {
    // `לבונטין 19` holds Hiro, Brasserie 18 and Super pizza. The address ties them, so the name
    // still decides — which is exactly why the term is not allowed to outweigh the name.
    const ranked = rankPlaces(
      query({ text: 'Brasserie 18', addressHint: 'לבונטין 19' }),
      [
        place({ name: 'Super pizza', addressLine: 'לבונטין 19' }),
        place({ name: 'Brasserie 18', addressLine: 'לבונטין 19' }),
        place({ name: 'Hiro', addressLine: 'לבונטין 19' }),
      ],
    );
    expect(ranked[0]!.place.name).toBe('Brasserie 18');
    // All three got the same address credit, so the gap between them is entirely the name.
    expect(ranked[0]!.nameScore).toBeGreaterThan(ranked[1]!.nameScore);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * TLV-BILING-B — divergence 6: the name term is the best over every query FORM.
 *
 * The measured problem this closes (`handoff-2026-08-28` §5): the address arm retrieves
 * `Kohi Coffee Shop` for a caption that says `קוהי`, the cross-script name scores ~0, and the
 * blend lands the right row *below* a wrong-venue row that merely shares a script. The fix is on
 * the query side — not `SCORING.address.weight`, which would make `Oscar's` the first false
 * auto-accept.
 * ------------------------------------------------------------------------------------------- */

describe('queryForms — which strings are allowed to be the query', () => {
  it('is exactly [text] when no variants are offered, however they are spelled', () => {
    expect(queryForms('קוהי')).toEqual(['קוהי']);
    expect(queryForms('קוהי', null)).toEqual(['קוהי']);
    expect(queryForms('קוהי', [])).toEqual(['קוהי']);
    expect(queryForms('קוהי', undefined)).toEqual(['קוהי']);
  });

  it('puts text first and verbatim, so the tie-break always favours what the caption said', () => {
    expect(queryForms('קוהי', ['Kohi'])[0]).toBe('קוהי');
  });

  it('drops a variant that normalises to nothing', () => {
    expect(queryForms('Kohi', ['', '   ', '!!!', '—'])).toEqual(['Kohi']);
  });

  it('drops a variant that is the query again under a different spelling', () => {
    // `normalise()` is the project's one answer to "are these the same name", so it is the one
    // used here. A duplicate would cost a token-budget slot and buy nothing.
    expect(queryForms('Café Europa', ['cafe europa!', 'Cafe  Europa'])).toEqual(['Café Europa']);
    expect(queryForms('Kohi', ['Kohi Coffee'])).toEqual(['Kohi', 'Kohi Coffee']);
  });

  it('drops a variant with no distinctive token at all — the admission rule', () => {
    // A "variant" made only of generic words is not a name, it is a category. `queryTokens`'s
    // all-generic fallback exists for a CAPTION the model could not read; applying it to a model's
    // claim that this is the same venue would make every coffee shop in the index reachable from
    // the word `coffee`.
    expect(queryForms('קוהי', ['Coffee Shop'])).toEqual(['קוהי']);
    expect(queryForms('קוהי', ['בר', 'מסעדה'])).toEqual(['קוהי']);
    // ...while a real name that happens to contain a generic word is admitted on the rest of it.
    expect(queryForms('קוהי', ['Kohi Coffee Shop'])).toEqual(['קוהי', 'Kohi Coffee Shop']);
  });

  it('caps the number of variants it will consider', () => {
    const many = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const forms = queryForms('Zeta', many);
    expect(forms).toHaveLength(MAX_QUERY_VARIANTS + 1);
    expect(forms[0]).toBe('Zeta');
  });

  it('keeps text even when text itself is unusable, so absent variants never change the shape', () => {
    expect(queryForms('!!!', ['Kohi'])).toEqual(['!!!', 'Kohi']);
  });
});

describe('bestNameScoreAcrossForms', () => {
  it('is exactly bestNameScore for a single form', () => {
    expect(bestNameScoreAcrossForms(['Kohi'], 'Kohi Coffee Shop', [])).toEqual({
      ...bestNameScore('Kohi', 'Kohi Coffee Shop', []),
      matchedText: 'Kohi',
    });
  });

  it('reaches a Latin-named row from a Hebrew caption, which is the whole point', () => {
    const hebrewOnly = bestNameScoreAcrossForms(['קוהי'], 'Kohi Coffee Shop', []);
    const withLatin = bestNameScoreAcrossForms(['קוהי', 'Kohi'], 'Kohi Coffee Shop', []);
    expect(hebrewOnly.nameScore).toBe(0);
    expect(withLatin.nameScore).toBeGreaterThan(0.8);
    expect(withLatin.matchedText).toBe('Kohi');
  });

  it('takes the strictly greater form, so text wins every tie', () => {
    const tied = bestNameScoreAcrossForms(['Kohi', 'kohi!'], 'Kohi', []);
    expect(tied.matchedText).toBe('Kohi');
    expect(tied).toEqual({ ...bestNameScore('Kohi', 'Kohi', []), matchedText: 'Kohi' });
  });

  it('carries tokenCoverage from the form that won, not from text', () => {
    const best = bestNameScoreAcrossForms(['קוהי', 'Kohi'], 'Kohi Coffee Shop', []);
    expect(best.tokenCoverage).toBe(nameScore('Kohi', 'Kohi Coffee Shop').tokenCoverage);
  });

  it('crosses with altNames rather than replacing them (divergence 5 still applies)', () => {
    const viaAlias = bestNameScoreAcrossForms(['קוהי', 'Kohi'], 'משהו אחר', ['Kohi Coffee Shop']);
    expect(viaAlias.nameScore).toBe(nameScore('Kohi', 'Kohi Coffee Shop').nameScore);
    expect(viaAlias.matchedText).toBe('Kohi');
  });

  it('never lowers a score — more forms can only ever raise one', () => {
    const rows = ['Kohi Coffee Shop', 'NIKO by Sharon Cohen', 'Miznon', 'קוהי בן יהודה'];
    for (const row of rows) {
      const before = bestNameScoreAcrossForms(['קוהי'], row, []).nameScore;
      const after = bestNameScoreAcrossForms(['קוהי', 'Kohi', 'Kohi Coffee'], row, []).nameScore;
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

describe('scorePlace and rankPlaces with textVariants', () => {
  const kohi = place({
    name: 'Kohi Coffee Shop',
    addressLine: 'בן יהודה 155',
    providerCategory: 'coffee_shop',
    datasetConfidence: 0.5,
  });
  const niko = place({
    name: 'NIKO by Sharon Cohen',
    addressLine: 'בן יהודה 155',
    providerCategory: 'coffee_shop',
    datasetConfidence: 0.9,
  });

  it('treats absent, null and empty variants as the same thing', () => {
    const candidates = [kohi, niko];
    const absent = rankPlaces(query({ text: 'קוהי', addressHint: 'בן יהודה 155' }), candidates);
    const nulled = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', textVariants: null }),
      candidates,
    );
    const empty = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', textVariants: [] }),
      candidates,
    );
    expect(nulled).toEqual(absent);
    expect(empty).toEqual(absent);
  });

  it('is the §5 blocker, and the Latin variant is what unblocks it', () => {
    // Before: the address arm delivers Kohi and the blend throws it away — a wrong-venue row that
    // merely shares a script outranks it, both far below any band.
    const before = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', categoryHint: 'cafe' }),
      [kohi, niko],
    );
    expect(before[0]!.place.name).toBe('NIKO by Sharon Cohen');
    expect(before[0]!.nameScore).toBe(0);

    // After: the name is matchable, so the address confirms rather than carries.
    const after = rankPlaces(
      query({
        text: 'קוהי',
        addressHint: 'בן יהודה 155',
        categoryHint: 'cafe',
        textVariants: ['Kohi'],
      }),
      [kohi, niko],
    );
    expect(after[0]!.place.name).toBe('Kohi Coffee Shop');
    expect(after[0]!.score).toBeGreaterThan(SCORING.bands.confirmScore);

    // **The wrong row rises too, and that is the honest shape of this change.** `Kohi` scores
    // 0.483 against `NIKO by Sharon Cohen` on Jaro-Winkler alone (`niko`/`kohi` share three
    // letters), so NIKO goes 0.352 → 0.661. A variant does not lift only the row it names; it
    // lifts every row it is fuzzily similar to. What saves this case is that the right row rises
    // further, and the margin gate is what would catch it if it did not.
    const nikoBefore = before.find((r) => r.place.name === niko.name)!;
    const nikoAfter = after.find((r) => r.place.name === niko.name)!;
    expect(nikoAfter.score).toBeGreaterThan(nikoBefore.score);
    expect(after[0]!.score - nikoAfter.score).toBeGreaterThan(SCORING.bands.preselectMargin);
  });

  it('auto-accepts the case it rescues, and that is the change RESOLVE-CONF-1 was made for', () => {
    // This is the specimen from `handoff-2026-08-28-categories-and-the-picker.md` §3, and the test
    // that used to stand here asked that any change turning it into an auto-accept say so out
    // loud. Saying it out loud: it does now, deliberately.
    //
    // `קוהי` + `Kohi` + `בן יהודה 155` against `Kohi Coffee Shop` and `NIKO by Sharon Cohen` —
    // near-perfect name, exact category, exact address, and a margin over the runner-up an order of
    // magnitude past the gate. It was held at `confirm` on `Kohi Coffee Shop`'s Overture
    // dataset_confidence of 0.295: a crawler's opinion of a row, vetoing every piece of evidence
    // about the query. That term is gone, so the answer is now settled without asking the user.
    const before = confidenceOf(
      rankPlaces(query({ text: 'קוהי', addressHint: 'בן יהודה 155', categoryHint: 'cafe' }), [
        kohi,
        niko,
      ]),
    );
    const after = confidenceOf(
      rankPlaces(
        query({
          text: 'קוהי',
          addressHint: 'בן יהודה 155',
          categoryHint: 'cafe',
          textVariants: ['Kohi'],
        }),
        [kohi, niko],
      ),
    );
    expect(before.band).toBe('no_match');
    expect(after.band).toBe('preselect');
    expect(round3(after.score)).toBe(0.946);
  });

  it('records which form matched, on every row, including the ones text matched', () => {
    const ranked = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', textVariants: ['Kohi'] }),
      [kohi, place({ name: 'קוהי בן יהודה', addressLine: 'בן יהודה 155' })],
    );
    expect(matchedTextOf(ranked.find((r) => r.place.name === 'Kohi Coffee Shop')!)).toBe('Kohi');
    expect(matchedTextOf(ranked.find((r) => r.place.name === 'קוהי בן יהודה')!)).toBe('קוהי');
  });

  it('reports null provenance for a RankedPlace that did not come from scorePlace', () => {
    expect(matchedTextOf(ranked(0.5))).toBeNull();
  });

  it('cannot lower any row’s score, which is why the risk is entirely in the margin', () => {
    // The property the false-auto-accept analysis rests on, asserted rather than argued: adding a
    // form is a `max` over more terms, so no row can fall. Widening therefore never demotes the
    // right venue — it can only promote some other one, which the margin gate is there to catch.
    const candidates = [kohi, niko, place({ name: 'Miznon' }), place({ name: 'קוהי' })];
    const before = rankPlaces(query({ text: 'קוהי' }), candidates);
    const after = rankPlaces(
      query({ text: 'קוהי', textVariants: ['Kohi', 'Kohi Coffee'] }),
      candidates,
    );
    for (const row of before) {
      const same = after.find((r) => r.place.providerPlaceId === row.place.providerPlaceId)!;
      expect(same.score).toBeGreaterThanOrEqual(row.score);
    }
  });

  it('does not move the auto-accept gates: a variant still needs both of them', () => {
    // One perfect variant match against a lone candidate is still `confirm`, because the margin is
    // unmeasured (divergence 1). Widening the query does not widen what we accept without a human.
    const alone = scoreCandidates(
      query({ text: 'קוהי', categoryHint: 'cafe', textVariants: ['Kohi Coffee Shop'] }),
      [kohi],
      ['tlv'],
    );
    expect(alone.confidence.score).toBeGreaterThan(SCORING.bands.preselectScore);
    expect(alone.confidence.margin).toBeNull();
    expect(alone.confidence.band).toBe('confirm');
  });

  it('leaves a variant that names a DIFFERENT venue below the auto-accept gate on its own', () => {
    // The Oscar's shape, restated for variants: the model offers a Latin form, the index holds a
    // different venue at that address, and the name does not actually match. Nothing here reaches
    // `preselect`; the row is offered for a human to reject.
    const pundak = place({
      name: 'פונדק השובבים',
      addressLine: 'נחלת בנימין 68',
      providerCategory: 'restaurant',
      datasetConfidence: 0.9,
    });
    const ranked = scorePlace(
      pundak,
      'restaurant',
      "Oscar's",
      'נחלת בנימין 68',
      ['אוסקר'],
    );
    expect(ranked.score).toBeLessThan(SCORING.bands.confirmScore);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The lone-candidate band policy (2026-08-28)
 * ------------------------------------------------------------------------------------------- */

describe('confidenceOf — what a sole candidate means', () => {
  const sole = (score: number): readonly RankedPlace[] => [
    { place: {} as ResolvedPlace, score, nameScore: score, tokenCoverage: 1, categoryScore: 1 },
  ];

  it('defaults to narrow-filter, where an unmeasurable margin cannot auto-accept', () => {
    // `10` §12 Q3, unchanged: one prefiltered row says the filter was narrow, not that we are sure.
    const c = confidenceOf(sole(1));
    expect(c.band).toBe('confirm');
    expect(c.margin).toBeNull();
  });

  it('lets an exhaustive search auto-accept its sole result', () => {
    // Google returns one result for 14 of 16 real corpus candidates; one result there means the
    // global index holds one place under that name, which is evidence rather than an artefact.
    const c = confidenceOf(sole(SCORING.bands.preselectScore), 'exhaustive-search');
    expect(c.band).toBe('preselect');
    expect(c.margin).toBeNull();
  });

  it('does not relax the score gate for an exhaustive search', () => {
    const justBelow = SCORING.bands.preselectScore - 0.0001;
    expect(confidenceOf(sole(justBelow), 'exhaustive-search').band).toBe('confirm');
  });

  it('still enforces a margin that was actually measured', () => {
    // The provider's answer decides what an *absent* margin means and nothing else, so a poor but
    // real margin can never be promoted by it.
    const pair: readonly RankedPlace[] = [
      { place: {} as ResolvedPlace, score: 0.99, nameScore: 1, tokenCoverage: 1, categoryScore: 1 },
      { place: {} as ResolvedPlace, score: 0.98, nameScore: 1, tokenCoverage: 1, categoryScore: 1 },
    ];
    expect(confidenceOf(pair, 'exhaustive-search').band).toBe('confirm');
    expect(confidenceOf(pair).band).toBe('confirm');
  });

  it('leaves an empty ranking at no_match under either policy', () => {
    expect(confidenceOf([], 'exhaustive-search').band).toBe('no_match');
    expect(confidenceOf([]).band).toBe('no_match');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The branch guard (TRACK2-BRANCH, 2026-08-28)
 * ------------------------------------------------------------------------------------------- */

describe('nameDifference', () => {
  it('reports the tokens the longer name adds', () => {
    expect(nameDifference('Onibus Coffee', 'Onibus Coffee Yakumo')).toEqual(['yakumo']);
    expect(nameDifference('Onibus Coffee Yakumo', 'Onibus Coffee')).toEqual(['yakumo']);
    expect(nameDifference('むぎとオリーブ', 'むぎとオリーブ 銀座本店')).toEqual(['銀座本店']);
  });

  it('reports an empty difference for two rows under the same name', () => {
    // Not `null`: `The Dove` and `The Dove` 13 km apart are the purest branch question there is,
    // and the caller must be able to tell that from "these names are unrelated".
    expect(nameDifference('The Dove', 'the dove')).toEqual([]);
  });

  it('is token containment, not substring containment', () => {
    // `normalise('Bar B')` IS a substring of `normalise('Bar Benfiddich')`. Measured: a substring
    // rule fires on TYO-05 and TYO-13 for exactly this pair, which is not a branch of anything.
    expect(normalise('Bar B')).toBe('bar b');
    expect(normalise('Bar Benfiddich').includes('bar b')).toBe(true);
    expect(nameDifference('Bar B', 'Bar Benfiddich')).toBeNull();
  });

  it('is null for two different venues that share a token', () => {
    expect(nameDifference('Bar 51', 'Hostel 51')).toBeNull();
    expect(nameDifference('Kohi Coffee Shop', 'NIKO by Sharon Cohen')).toBeNull();
  });

  it('is null when either name normalises to nothing', () => {
    expect(nameDifference('', 'Padella')).toBeNull();
    expect(nameDifference('★', 'Padella')).toBeNull();
  });
});

describe('branchRival — when two rows are branches of one venue', () => {
  /** A ranked row at a chosen score and position. `lat` moves north from the fixture's 35.6. */
  const row = (name: string, score: number, metresNorth = 0): RankedPlace => ({
    place: place({ name, providerPlaceId: name, lat: 35.6 + metresNorth / 110_574, lng: 139.7 }),
    score,
    nameScore: score,
    tokenCoverage: 1,
    categoryScore: 1,
  });

  const forms = ['Onibus Coffee'];

  it('finds a branch-named rival that is close in score and far in space', () => {
    const rival = branchRival(
      [row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', 0.93, 3_000)],
      forms,
    );
    expect(rival?.place.name).toBe('Onibus Coffee Yakumo');
  });

  it('ignores a rival further from the top than rivalScoreBand', () => {
    const justOutside = 1 - SCORING.branchGuard.rivalScoreBand - 0.0001;
    expect(branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', justOutside, 3_000)], forms))
      .toBeNull();
    const justInside = 1 - SCORING.branchGuard.rivalScoreBand;
    expect(
      branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', justInside, 3_000)], forms)
        ?.place.name,
    ).toBe('Onibus Coffee Yakumo');
  });

  it('ignores a rival inside samePlaceMetres — that is one venue recorded twice', () => {
    // 75 m is the radius `resolve_place`'s dedup guard already treats as one place: Kiaans/Kiaans
    // Tooting are 18 m apart and Sycamore's two rows 26 m. Two records of one address pin the same
    // point, so choosing between them is not a decision the user has to make — and the shortlist
    // collapse (`ux-when-we-ask.md` §4) removes one of them before this runs.
    expect(branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', 0.93, 26)], forms))
      .toBeNull();
    const inside = SCORING.samePlaceMetres - 5;
    expect(branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', 0.93, inside)], forms))
      .toBeNull();
    const outside = SCORING.samePlaceMetres + 5;
    expect(
      branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', 0.93, outside)], forms)
        ?.place.name,
    ).toBe('Onibus Coffee Yakumo');
  });

  it('answers the collapse side of the same question from one predicate', () => {
    // `ux-when-we-ask.md` §4 collapses two shortlist rows into one place on exactly this predicate
    // with the opposite verdict, so both sides read `placeProximity` rather than keeping a copy.
    const near = placeProximity(
      { name: 'Sycamore Vino Cucina', lat: 32.0709, lng: 34.7803 },
      { name: 'Sycamore Vino Cucina & Bar', lat: 32.07092, lng: 34.78032 },
    );
    expect(near.difference).toEqual(['bar']);
    expect(near.metres).toBeLessThan(SCORING.samePlaceMetres);
    expect(near.sameSpot).toBe(true);

    // And the pair the collapse must never merge: metres apart, unrelated names.
    const kohiNiko = placeProximity(
      { name: 'Kohi Coffee Shop', lat: 32.0866, lng: 34.7735 },
      { name: 'NIKO by Sharon Cohen', lat: 32.0866, lng: 34.7735 },
    );
    expect(kohiNiko.sameSpot).toBe(true);
    expect(kohiNiko.difference).toBeNull();
  });

  it('does not ask when the caption already named the branch', () => {
    // `Dishoom Shoreditch` against `Dishoom`: the only token separating them is one the user
    // typed. Asking here is the picker's other failure mode — a question whose answer is already
    // on the screen (`handoff-2026-08-28-categories-and-the-picker.md` §3.4 item 4).
    const ranked = [row('Dishoom Shoreditch', 1), row('Dishoom', 0.93, 6_800)];
    expect(branchRival(ranked, ['Dishoom Shoreditch'])).toBeNull();
    expect(branchRival(ranked, ['Dishoom'])?.place.name).toBe('Dishoom');
  });

  it('cannot be settled by the caption when the two names are identical', () => {
    // An empty difference has nothing for the query to answer, so the `every` test must not pass
    // vacuously. `The Dove` and `The Dove`, 13 km apart, is LDN-13 in the golden file.
    expect(
      branchRival([row('The Dove', 1), row('The Dove', 0.99, 13_000)], ['The Dove'])?.place.name,
    ).toBe('The Dove');
  });

  it('is off when no query was supplied', () => {
    // The contract `benchmark-golden.test.ts`'s replay depends on: banding a bare list of recorded
    // scores is not answering a question, and the guard's caption rule has nothing to read.
    expect(branchRival([row('Onibus Coffee', 1), row('Onibus Coffee Yakumo', 0.93, 3_000)], []))
      .toBeNull();
  });

  it('reads every query form, not just the first', () => {
    // The bilingual path (divergence 6): the branch token may be in the Latin variant.
    const ranked = [row('Dishoom Shoreditch', 1), row('Dishoom', 0.93, 6_800)];
    expect(branchRival(ranked, ['דישום', 'Dishoom Shoreditch'])).toBeNull();
  });
});

describe('confidenceOf — the branch guard end to end', () => {
  /** The five TYO-10 rows, verbatim from `raw-overture-scored.json`. */
  const mugito = (name: string, lat: number, lng: number): ResolvedPlace =>
    place({ name, providerPlaceId: name, providerCategory: 'japanese_restaurant', lat, lng });

  // Coordinates are the golden file's, rounded to six decimals (~0.1 m — the file stores float32
  // values whose full decimal expansion loses precision as a double, and no assertion here is
  // within 100 m of a threshold).
  const tyo10 = [
    mugito('むぎとオリーブ 銀座本店', 35.668961, 139.764313),
    mugito('むぎとオリーブ 銀座店', 35.6348, 139.613831),
    mugito('むぎとオリーブ 日本橋店', 35.687054, 139.77478),
    mugito('むぎとオリーブ', 35.69714, 139.770294),
    mugito('むろと', 35.605637, 139.732101),
  ];

  it('holds TYO-10 at confirm instead of pinning the wrong branch', () => {
    // The case this guard was written for. The bare row wins on an exact name match and clears
    // both gates — score 1.000, margin 0.069 — and it sits 3.2 km from `むぎとオリーブ 銀座本店`,
    // which is the branch `benchmark-spec.json` asks for (`expected_area: "Ginza"`).
    const ranked = rankPlaces(query({ text: 'むぎとオリーブ', categoryHint: 'restaurant' }), tyo10);
    expect(ranked[0]!.place.name).toBe('むぎとオリーブ');

    const gatesOnly = confidenceOf(ranked);
    expect(gatesOnly.band).toBe('preselect');
    expect(gatesOnly.margin!).toBeGreaterThan(SCORING.bands.preselectMargin);

    const guarded = confidenceOf(ranked, 'narrow-filter', ['むぎとオリーブ']);
    expect(guarded.band).toBe('confirm');
    // The guard changes the band and nothing else: same ranking, same score, same margin.
    expect(guarded.score).toBe(gatesOnly.score);
    expect(guarded.margin).toBe(gatesOnly.margin);
  });

  it('keeps auto-accepting TLV-14, where the rivals are different venues', () => {
    // `Bar 51` against `Hostel 51` and `Studio 51`: a shared numeral is not a shared name, so
    // `nameDifference` is null and the guard never runs. This is the case two earlier re-fits were
    // aimed at and it must not be undone by this one.
    const ranked = rankPlaces(
      query({ text: 'Bar 51', cityHint: 'Tel Aviv', categoryHint: 'bar' }),
      [
        place({ name: 'Bar 51', providerPlaceId: 'a', lat: 32.0753, lng: 34.7665 }),
        place({ name: 'Hostel 51', providerPlaceId: 'b', lat: 32.0885, lng: 34.7734 }),
        place({ name: 'Studio 51', providerPlaceId: 'c', lat: 32.0704, lng: 34.7677 }),
      ],
    );
    expect(ranked[0]!.place.name).toBe('Bar 51');
    expect(confidenceOf(ranked, 'narrow-filter', ['Bar 51']).band).toBe('preselect');
  });

  it('runs from scoreCandidates without the caller having to ask for it', () => {
    // The one production entry point, and the reason "no forms means no guard" is safe: the guard
    // is on wherever a real query is being answered.
    const result = scoreCandidates(
      query({ text: 'むぎとオリーブ', categoryHint: 'restaurant' }),
      tyo10,
      ['tyo'],
    );
    expect(result.confidence.band).toBe('confirm');
    expect(result.shortlist[0]!.place.name).toBe('むぎとオリーブ');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * A contradicted address asks, it does not discard (TRACK2-ADDR)
 * ------------------------------------------------------------------------------------------- */

describe('confidenceOf — a contradicted address', () => {
  /** `רוסטיקו` from the real corpus: Google returns the רוטשילד branch, the caption says בזל. */
  const rusticoRothschild = place({
    name: 'רוסטיקו רוטשילד',
    providerPlaceId: 'rustico-rothschild',
    addressLine: 'שדרות רוטשילד 15',
    providerCategory: 'italian_restaurant',
    lat: 32.0637,
    lng: 34.7742,
  });

  const askRustico = () =>
    rankPlaces(
      query({ text: 'רוסטיקו', addressHint: 'בזל 42', categoryHint: 'restaurant' }),
      [rusticoRothschild],
    );

  it('can never reach preselect, as an inequality over the constants', () => {
    // Not a case, a bound: `addressScore === 0` makes `score = (1 − weight)·base` and `base ≤ 1`,
    // so the highest a contradicted row can score is `1 − weight`. While that is under
    // `preselectScore` the floor below cannot manufacture an auto-accept, whatever it does to the
    // band. If a future re-fit breaks this inequality, it breaks here first.
    expect(1 - SCORING.address.weight).toBeLessThan(SCORING.bands.preselectScore);
  });

  it('offers the venue at confirm instead of discarding it', () => {
    // Measured: 0.9134 name, 0.7308 after the contradiction — under the 0.80 gate, so today the
    // shortlist is never offered and `derivePlaceSave` falls back to the model's coordinate, which
    // is 65–470 m out. The row is the right venue at the wrong branch, which is a question.
    const ranked = askRustico();
    expect(addressScoreOf(ranked[0]!)).toBe(0);
    expect(ranked[0]!.score).toBeLessThan(SCORING.bands.confirmScore);

    const confidence = confidenceOf(ranked, 'narrow-filter', ['רוסטיקו']);
    expect(confidence.band).toBe('confirm');
    // The score is not floored with the band. It is stored in `places.resolution_score` and it is
    // the honest number: we are less confident, and we say so while still asking.
    expect(confidence.score).toBe(ranked[0]!.score);
  });

  it('does not rescue a row whose name was weak to begin with', () => {
    // The floor is `base ≥ confirmScore`, i.e. "the only thing holding it down is the address".
    const ranked = rankPlaces(
      query({ text: 'רוסטיקו', addressHint: 'בזל 42' }),
      [place({ name: 'מסעדת אווה', addressLine: 'שדרות רוטשילד 15', lat: 32.0637, lng: 34.7742 })],
    );
    expect(addressScoreOf(ranked[0]!)).toBe(0);
    expect(confidenceOf(ranked, 'narrow-filter', ['רוסטיקו']).band).toBe('no_match');
  });

  it('is not triggered by an address that could not be compared', () => {
    // `null` is "no comparison was possible", which must never be read as a conflict — 8 of the 17
    // real candidates carry no `addressHint` at all.
    const ranked = rankPlaces(query({ text: 'Miznon' }), [place({ name: 'Mitbachon' })]);
    expect(addressScoreOf(ranked[0]!)).toBeNull();
    expect(ranked[0]!.score).toBeLessThan(SCORING.bands.confirmScore);
    expect(confidenceOf(ranked, 'narrow-filter', ['Miznon']).band).toBe('no_match');
  });

  it('is not triggered by a row that did not come from scorePlace', () => {
    // A hand-built or read-back row has no `addressScore` at all, and `undefined` is not 0.
    expect(addressScoreOf(ranked(0.75))).toBeUndefined();
    expect(confidenceOf([ranked(0.75), ranked(0.1)]).band).toBe('no_match');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The two evidence overrides (RECOG-METRICS-2)
 *
 * Both are measured in `docs/evidence/places/recognition-decisive-evidence-2026-08-28.md`; what
 * belongs here is the *shape* of each rule and, above all, every shape it must refuse. A rule that
 * only has tests for the cases it was built to rescue is a rule nobody has bounded.
 *
 * Every fixture carries the `textVariants` the real corpus carries. That is not decoration: the
 * first draft of these tests omitted them and three cases scored differently enough to change band
 * — `קוהי` alone drops from 0.9067 to 0.774 without the variant `Kohi`. A fixture that omits half
 * the query measures a query the product never sends.
 * ------------------------------------------------------------------------------------------- */

describe('confidenceOf — the caption’s address is decisive (F2)', () => {
  it('auto-accepts a corroborated address that the score gate alone would refuse', () => {
    // `קוהי` from the real corpus against Google's answer. Score 0.9067 — under the 0.92 gate,
    // entirely because the display name appends the words "Japanese café" — and one result, so
    // there is no margin either. Two gates fail and the house number answers both.
    const ranked_ = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', categoryHint: 'cafe', textVariants: ['Kohi'] }),
      [place({ name: 'Kohi בית קפה יפני', addressLine: 'בן יהודה 155', providerCategory: 'coffee_shop' })],
    );
    const top = ranked_[0]!;
    expect(addressScoreOf(top)).toBe(1);
    expect(top.score).toBeLessThan(SCORING.bands.preselectScore);

    const confidence = confidenceOf(ranked_, 'narrow-filter', ['קוהי', 'Kohi']);
    expect(confidence.band).toBe('preselect');
    // A lone row, so `'narrow-filter'` would normally make auto-accept unreachable by construction.
    expect(confidence.margin).toBeNull();
    // The band moves and the score does not. `places.resolution_score` still stores what was
    // measured, exactly as `contradictedAddressOnly` leaves it alone in the other direction.
    expect(confidence.score).toBe(top.score);
  });

  it('overrides the branch guard, because writing the street is naming the branch', () => {
    // `רוסטיקו` on the Overture path: the caption says בזל 42 and the top row is on בזל 42, while
    // the guard wants to ask about the רוטשילד branch 2.8 km away.
    const forms = ['רוסטיקו', 'Rustico'];
    const ranked_ = rankPlaces(
      query({ text: 'רוסטיקו', addressHint: 'בזל 42', categoryHint: 'restaurant', textVariants: ['Rustico'] }),
      [
        place({ name: 'Rustico', addressLine: 'בזל 42', lat: 32.0876, lng: 34.7838 }),
        place({ name: 'Rustico Rothschild', addressLine: 'Rothschild Boulevard 15', lat: 32.0637, lng: 34.7742 }),
      ],
    );
    expect(ranked_[0]!.place.name).toBe('Rustico');
    // The guard still fires. It is overridden, not disabled — anything deriving the *reason* for a
    // question (`docs/ux-when-we-ask.md` §3.2) must read the band first and this second.
    expect(branchRival(ranked_, forms)?.place.name).toBe('Rustico Rothschild');
    expect(confidenceOf(ranked_, 'narrow-filter', forms).band).toBe('preselect');
  });

  it('refuses when a contender is at the same address, because then the address separated nothing', () => {
    // Two venues at one street number is the case an address cannot decide — `scorePlace`'s header
    // records that `לבונטין 19` holds three and `בן יהודה 155` two. Without this veto F2 would
    // auto-accept the top row here: it clears every other condition.
    const ranked_ = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', categoryHint: 'cafe', textVariants: ['Kohi'] }),
      [
        place({ name: 'Kohi Bakery בית קפה', addressLine: 'בן יהודה 155', lat: 32.0883, lng: 34.7733 }),
        place({ name: 'Kohi בית קפה יפני', addressLine: 'בן יהודה 155', lat: 32.0883, lng: 34.7733, providerPlaceId: 'b' }),
      ],
    );
    expect(addressScoreOf(ranked_[0]!)).toBe(1);
    expect(addressScoreOf(ranked_[1]!)).toBe(1);
    expect(ranked_[0]!.tokenCoverage).toBe(1);
    expect(ranked_[0]!.score - ranked_[1]!.score).toBeLessThanOrEqual(SCORING.branchGuard.rivalScoreBand);
    expect(confidenceOf(ranked_, 'narrow-filter', ['קוהי', 'Kohi']).band).toBe('confirm');
  });

  it('refuses a street match with no house number to confirm it', () => {
    // `addressScore` halves a street-only match (`streetOnly`) and the rule tests for exactly 1.
    // "Somewhere on Basel Street" is not an identification.
    const ranked_ = rankPlaces(
      query({ text: 'רוסטיקו', addressHint: 'בזל', textVariants: ['Rustico'] }),
      [place({ name: 'Rustico רוסטיקו', addressLine: 'בזל 42' })],
    );
    expect(addressScoreOf(ranked_[0]!)).toBeLessThan(1);
    expect(confidenceOf(ranked_, 'narrow-filter', ['רוסטיקו', 'Rustico']).band).not.toBe('preselect');
  });

  it('refuses when the name did not cover the query, however exact the address', () => {
    // An address is not unique, so the name has to break its tie. A row at the right number whose
    // name the caption never wrote is the shortlist's other tenant, not the venue — this is the
    // literal second row of `handoff-2026-08-28-categories-and-the-picker.md` §3.1.
    const ranked_ = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', textVariants: ['Kohi'] }),
      [place({ name: 'NIKO by Sharon Cohen', addressLine: 'בן יהודה 155' })],
    );
    expect(addressScoreOf(ranked_[0]!)).toBe(1);
    expect(ranked_[0]!.tokenCoverage).toBeLessThan(1);
    expect(confidenceOf(ranked_, 'narrow-filter', ['קוהי', 'Kohi']).band).not.toBe('preselect');
  });

  it('is off without forms, so it cannot re-band a recorded run', () => {
    const ranked_ = rankPlaces(
      query({ text: 'קוהי', addressHint: 'בן יהודה 155', categoryHint: 'cafe', textVariants: ['Kohi'] }),
      [place({ name: 'Kohi בית קפה יפני', addressLine: 'בן יהודה 155', providerCategory: 'coffee_shop' })],
    );
    expect(confidenceOf(ranked_).band).toBe('confirm');
    expect(confidenceOf(ranked_, 'narrow-filter', []).band).toBe('confirm');
  });
});

describe('confidenceOf — an exact name beats a fuzzy rival (F3)', () => {
  /** `Palette Bistro` from the real Overture corpus, against the rival that was blocking it. */
  const paletteForms = ['Palette Bistro', 'פלט ביסטרו', 'Palette'];
  const paletteRanking = () =>
    rankPlaces(
      query({
        text: 'Palette Bistro',
        cityHint: 'תל אביב',
        categoryHint: 'bar',
        textVariants: ['פלט ביסטרו', 'Palette'],
      }),
      [
        place({ name: 'Palette Bistro', providerPlaceId: 'palette', lat: 32.054, lng: 34.7593 }),
        place({ name: 'Paulette', providerPlaceId: 'paulette', lat: 32.0664, lng: 34.7735 }),
      ],
    );

  it('waives the margin gate for a whole-string match against a merely similar name', () => {
    const ranked_ = paletteRanking();
    const top = ranked_[0]!;
    expect(top.place.name).toBe('Palette Bistro');
    expect(top.nameScore).toBeGreaterThanOrEqual(0.999);
    const margin = top.score - ranked_[1]!.score;
    expect(margin).toBeLessThan(SCORING.bands.preselectMargin);
    expect(top.nameScore - ranked_[1]!.nameScore).toBeGreaterThan(SCORING.decisive.rivalNameSeparation);

    const confidence = confidenceOf(ranked_, 'narrow-filter', paletteForms);
    expect(confidence.band).toBe('preselect');
    // The margin is reported unchanged. Only the gate it has to clear moved.
    expect(confidence.margin).toBeCloseTo(margin, 12);
  });

  it('keeps asking when two rows carry the identical name', () => {
    // LDN-13 / TYO-07 / TYO-09 in one shape: the name separation is exactly 0, so the rule can
    // never fire and the margin gate keeps the question. This is what stops F3 auto-picking one of
    // two `The Dove`s.
    const ranked_ = rankPlaces(
      query({ text: 'The Dove' }),
      [
        place({ name: 'The Dove', providerPlaceId: 'dove-a', lat: 51.49, lng: -0.235 }),
        place({ name: 'The Dove', providerPlaceId: 'dove-b', lat: 51.527, lng: -0.056 }),
      ],
    );
    expect(ranked_[0]!.nameScore - ranked_[1]!.nameScore).toBe(0);
    expect(confidenceOf(ranked_, 'narrow-filter', ['The Dove']).band).toBe('confirm');
  });

  it('keeps asking when the rival is a branch of the same venue', () => {
    // `Padella` / `Padella Shoreditch` (LDN-07, LDN-12). One name contains the other, which is
    // precisely the question the margin gate exists for, so F3 stands aside for it.
    const ranked_ = rankPlaces(
      query({ text: 'Padella' }),
      [
        place({ name: 'Padella', providerPlaceId: 'p1', lat: 51.5054, lng: -0.0896 }),
        place({ name: 'Padella Shoreditch', providerPlaceId: 'p2', lat: 51.5257, lng: -0.0785 }),
      ],
    );
    expect(nameDifference(ranked_[0]!.place.name, ranked_[1]!.place.name)).toEqual(['shoreditch']);
    expect(confidenceOf(ranked_, 'narrow-filter', ['Padella']).band).toBe('confirm');
  });

  it('does not waive the score gate, only the margin', () => {
    // A perfect name whose *score* is held down by a contradicted address. Every name condition F3
    // asks for is met — 1.000 against 0.956, not branch-shaped, margin 0.036 under the gate — and
    // the band stays `confirm` because 0.80 is not 0.92. F3 relaxes one gate and never two.
    const ranked_ = rankPlaces(
      query({ text: 'רוסטיקו', addressHint: 'בזל 42' }),
      [
        place({ name: 'רוסטיקו', addressLine: 'שדרות רוטשילד 15', lat: 32.0637, lng: 34.7742 }),
        place({ name: 'רוסטיקאנו', addressLine: 'שדרות רוטשילד 15', lat: 32.09, lng: 34.79, providerPlaceId: 'r' }),
      ],
    );
    const top = ranked_[0]!;
    expect(top.nameScore).toBeGreaterThanOrEqual(0.999);
    expect(top.score - ranked_[1]!.score).toBeLessThan(SCORING.bands.preselectMargin);
    expect(top.nameScore - ranked_[1]!.nameScore).toBeGreaterThan(SCORING.decisive.rivalNameSeparation);
    expect(top.score).toBeLessThan(SCORING.bands.preselectScore);
    expect(confidenceOf(ranked_, 'narrow-filter', ['רוסטיקו']).band).toBe('confirm');
  });

  it('is off without forms, so it cannot re-band a recorded run', () => {
    // The regression this caught for real. Without this gate F3 read `nameScore` off the 2026-07
    // recorded rows in `benchmark-golden.test.ts`'s replay and moved LDN-01 (`Kiln`, recorded score
    // 0.999, recorded margin 0.048) from `confirm` to `preselect` — re-banding a measurement taken
    // before the rule existed, and breaking four assertions about it. Same rule, same reason, as
    // the branch guard: no query, no override.
    const ranked_ = paletteRanking();
    expect(confidenceOf(ranked_).band).toBe('confirm');
    expect(confidenceOf(ranked_, 'narrow-filter', []).band).toBe('confirm');
  });
});
