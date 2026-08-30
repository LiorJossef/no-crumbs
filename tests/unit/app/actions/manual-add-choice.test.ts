/**
 * The pure half of manual add. Everything here runs without a database, a network or a session,
 * which is exactly why these three functions were split out of the `'use server'` file.
 *
 * The assertion that matters most is the last one: an empty shortlist has **no** save arm. That is
 * the difference between "we could not find it" and a pin somewhere plausible, and the import
 * path's `llm_guess` fallback has no counterpart here — nobody guessed a coordinate for a name a
 * user typed.
 */

import { describe, expect, it } from 'vitest';

import {
  chooseManualPlace,
  manualAddQuery,
  NEEDS_A_NAME,
  validateManualName,
} from '@/app/actions/manual-add-choice';
import { DISPLAY_NAME_MAX_LENGTH } from '@/domain/places/display-name';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';

function place(name: string): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: `places/${name}`,
    sourceDataset: 'google-places',
    regionId: null,
    name,
    altNames: [],
    providerCategory: 'restaurant',
    addressLine: '4 Levinsky St',
    locality: 'Tel Aviv-Yafo',
    lat: 32.0567,
    lng: 34.7745,
    datasetConfidence: 0.5,
  };
}

function ranked(name: string, score: number): RankedPlace {
  return { place: place(name), score, nameScore: score, tokenCoverage: 1, categoryScore: 1 };
}

function result(shortlist: readonly RankedPlace[], band: ResolveResult['confidence']['band']): ResolveResult {
  return {
    shortlist,
    confidence: { band, score: shortlist[0]?.score ?? 0, margin: shortlist.length > 1 ? 0.1 : null },
    regionsSearched: [],
    candidatesPrefiltered: shortlist.length,
  };
}

describe('validateManualName', () => {
  it('accepts a typed name, trimmed and with interior whitespace collapsed', () => {
    expect(validateManualName('  Cafe   Levinsky  ')).toEqual({ ok: true, value: 'Cafe Levinsky' });
  });

  it('refuses an empty field rather than looking up nothing', () => {
    // The manual-add row is offered with an empty field on purpose (`add-sheet.tsx`), so this is a
    // reachable press and not a defensive branch. Refusing here is also what keeps a stray tap
    // from costing a lookup against the 100/day quota.
    expect(validateManualName('')).toEqual({ ok: false, message: NEEDS_A_NAME });
    expect(validateManualName('   ')).toEqual({ ok: false, message: NEEDS_A_NAME });
  });

  it('refuses a name past the column limit and says by how much', () => {
    const tooLong = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 3);
    const validated = validateManualName(tooLong);
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.message).toContain('3 characters too long');
  });
});

describe('manualAddQuery', () => {
  it('carries the typed name verbatim and hints nothing', () => {
    // Every hint is null deliberately: there is no caption to have stated a city, a country or a
    // category, and the map's viewport is not something the user said.
    expect(manualAddQuery('Cafe Levinsky')).toEqual({
      text: 'Cafe Levinsky',
      cityHint: null,
      countryHint: null,
      categoryHint: null,
      near: null,
      maxResults: null,
    });
  });
});

describe('chooseManualPlace', () => {
  it('takes the top-ranked result', () => {
    const top = ranked('Cafe Levinsky', 0.97);
    expect(chooseManualPlace(result([top, ranked('Levinsky 41', 0.7)], 'preselect'))).toEqual({
      kind: 'save',
      ranked: top,
    });
  });

  it('has no save arm at all for an empty shortlist', () => {
    expect(chooseManualPlace(result([], 'no_match'))).toEqual({ kind: 'not_found' });
  });

  it('does not gate on the band — a weak match is still a real place', () => {
    // `no_match` means the top row matched the *string* poorly, which is what a half-remembered
    // name looks like. The protection is that the save is named back and reversible, and that its
    // score is written to `places.resolution_score` — not a refusal that reads as "nothing exists".
    const weak = ranked('Levinsky Market', 0.42);
    expect(chooseManualPlace(result([weak], 'no_match'))).toEqual({ kind: 'save', ranked: weak });
  });
});
