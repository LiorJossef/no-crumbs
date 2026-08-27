/**
 * The review screen's read of the resolver, as data.
 *
 * These are the rules that decide whether a save gets an Overture row (11 m from the venue for
 * "HaKosem") or the model's own guess (555 m and 483 m out on two runs of the same caption). The
 * band policy itself is pinned in `resolution-record.test.ts`; what is pinned here is that the
 * screen never invents a second version of it, never offers a choice the server would reject, and
 * never says "we found nothing" about a candidate it never looked up.
 */
import { describe, expect, it } from 'vitest';

import type { StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';
import {
  effectivePick,
  optionDetail,
  pickRequiredNotice,
  resolutionChip,
  resolutionExplanation,
  resolutionHeadline,
  resolutionOptions,
  resolutionView,
  resolverPinLine,
  willSave,
} from '@/ui/import/candidate-resolution-view';

function place(over: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    provider: 'overture',
    providerPlaceId: 'gers-1',
    sourceDataset: 'overture-places',
    regionId: 'tlv',
    name: 'HaKosem',
    altNames: [],
    providerCategory: 'falafel_shop',
    addressLine: 'Shlomo HaMelech 1',
    locality: 'Tel Aviv',
    lat: 32.0755,
    lng: 34.7746,
    datasetConfidence: 0.87,
    ...over,
  };
}

function ranked(over: Partial<ResolvedPlace> = {}, score = 0.9): RankedPlace {
  return { place: place(over), score, nameScore: 0.9, tokenCoverage: 1, categoryScore: 1 };
}

function answered(
  band: ResolveResult['confidence']['band'],
  shortlist: readonly RankedPlace[],
): StoredResolution {
  return {
    kind: 'answered',
    result: {
      shortlist,
      confidence: { band, score: 0.9, margin: null },
      regionsSearched: ['tlv'],
      candidatesPrefiltered: shortlist.length,
    },
  };
}

describe('resolutionView', () => {
  it('maps the preselect band to `matched` and still offers the whole shortlist', () => {
    // The top entry auto-accepts on save, but `chooseResolvedPlace` honours an explicit pick here
    // too — "the top entry is a default, not a verdict" — so hiding the rest would remove a choice
    // the server is willing to take.
    const view = resolutionView(answered('preselect', [ranked(), ranked({ providerPlaceId: 'gers-2' })]));
    expect(view.kind).toBe('matched');
    expect(resolutionOptions(view)).toHaveLength(2);
  });

  it('maps the confirm band to `ambiguous`', () => {
    const view = resolutionView(answered('confirm', [ranked()]));
    expect(view.kind).toBe('ambiguous');
  });

  it('maps the no_match band to `unresolved`', () => {
    expect(resolutionView(answered('no_match', [])).kind).toBe('unresolved');
  });

  it('treats a `confirm` band with an empty shortlist as unresolved, not as an empty picker', () => {
    expect(resolutionView(answered('confirm', [])).kind).toBe('unresolved');
    expect(resolutionOptions(resolutionView(answered('confirm', [])))).toHaveLength(0);
  });

  it('keeps "we never looked" distinct from "we looked and found nothing"', () => {
    // The distinction `resolution-record.ts` was written to protect. Three different kinds, and
    // none of them may be the `unresolved` one.
    expect(resolutionView(null).kind).toBe('not_attempted');
    expect(resolutionView({ kind: 'capped' }).kind).toBe('capped');
    expect(resolutionView({ kind: 'failed', reason: 'timed_out' })).toEqual({
      kind: 'failed',
      reason: 'timed_out',
    });
  });

  it('says nothing new for any state that has no options', () => {
    // This task added the picker and deliberately left the other four states reading exactly as
    // they read before. `capped` and `not_attempted` especially must never acquire wording that
    // claims a search happened.
    for (const view of [
      resolutionView(null),
      resolutionView({ kind: 'capped' }),
      resolutionView({ kind: 'failed', reason: 'lookup_failed' }),
      resolutionView(answered('no_match', [])),
    ]) {
      expect(resolutionHeadline(view)).toBeNull();
      expect(resolutionExplanation(view)).toBeNull();
      expect(resolutionOptions(view)).toHaveLength(0);
    }
  });
});

describe('option identity and labelling', () => {
  it('carries the stored shortlist position, which is the only thing a confirm may send', () => {
    const view = resolutionView(
      answered('confirm', [ranked({ providerPlaceId: 'a' }), ranked({ providerPlaceId: 'b' }), ranked({ providerPlaceId: 'c' })]),
    );
    expect(resolutionOptions(view).map((o) => o.index)).toEqual([0, 1, 2]);
  });

  it('distinguishes same-named branches by address, which is the whole answer for a chain', () => {
    const view = resolutionView(
      answered('confirm', [
        ranked({ name: 'Cafe Cafe', addressLine: 'Dizengoff 50', locality: 'Tel Aviv' }),
        ranked({ name: 'Cafe Cafe', addressLine: 'Ibn Gabirol 30', locality: 'Tel Aviv' }),
      ]),
    );
    const options = resolutionOptions(view);
    expect(options.map((o) => o.name)).toEqual(['Cafe Cafe', 'Cafe Cafe']);
    expect(options.map((o) => o.detail)).toEqual(['Dizengoff 50, Tel Aviv', 'Ibn Gabirol 30, Tel Aviv']);
  });

  it('does not repeat a locality the address already contains', () => {
    expect(optionDetail(place({ addressLine: 'חצר השוק 6, רעננה', locality: 'רעננה' }))).toBe('חצר השוק 6, רעננה');
  });

  it('falls back through locality, then says the map data has no address', () => {
    expect(optionDetail(place({ addressLine: null, locality: 'Tel Aviv' }))).toBe('Tel Aviv');
    expect(optionDetail(place({ addressLine: null, locality: null }))).toBe('No address in the map data');
  });
});

describe('effectivePick', () => {
  it('shows the top entry as chosen under `matched` — that is what the server would accept', () => {
    expect(effectivePick(resolutionView(answered('preselect', [ranked(), ranked()])), null)).toBe(0);
  });

  it('shows nothing chosen under `ambiguous` until the user chooses', () => {
    // A silent default here *is* the auto-accept the `confirm` band exists to prevent.
    expect(effectivePick(resolutionView(answered('confirm', [ranked(), ranked()])), null)).toBeNull();
    expect(effectivePick(resolutionView(answered('confirm', [ranked(), ranked()])), 1)).toBe(1);
  });

  it('honours an explicit pick over the default under `matched`', () => {
    expect(effectivePick(resolutionView(answered('preselect', [ranked(), ranked()])), 1)).toBe(1);
  });
});

describe('willSave — the bug this replaced', () => {
  const matched = resolutionView(answered('preselect', [ranked()]));
  const ambiguous = resolutionView(answered('confirm', [ranked(), ranked()]));
  const unresolved = resolutionView(answered('no_match', []));

  it('saves a resolver-matched candidate the model gave no coordinate for', () => {
    // The old test was `candidate.coordinates !== null`, which hid this candidate from the screen
    // entirely even though the server derives its pin from the stored shortlist.
    expect(willSave(false, matched, null)).toBe(true);
  });

  it('does not offer to save an ambiguous, uncoordinated candidate until a pick is made', () => {
    // The server would answer `skipped`; counting it on the Save button is a promise the request
    // cannot keep.
    expect(willSave(false, ambiguous, null)).toBe(false);
    expect(willSave(false, ambiguous, 1)).toBe(true);
  });

  it('leaves the model-coordinate fallback exactly as it was', () => {
    expect(willSave(true, unresolved, null)).toBe(true);
    expect(willSave(false, unresolved, null)).toBe(false);
    expect(willSave(true, resolutionView(null), null)).toBe(true);
    expect(willSave(false, resolutionView(null), null)).toBe(false);
  });

  it('asks for a pick only where a pick is what is missing', () => {
    expect(pickRequiredNotice(false, ambiguous, null)).toBe('Pick one of these to save it.');
    expect(pickRequiredNotice(false, ambiguous, 0)).toBeNull();
    expect(pickRequiredNotice(true, ambiguous, null)).toBeNull();
    expect(pickRequiredNotice(false, unresolved, null)).toBeNull();
  });
});

describe('the pin line', () => {
  const ambiguous = resolutionView(answered('confirm', [ranked()]));

  it('claims map data only where the save will actually come from map data', () => {
    expect(resolverPinLine(resolutionView(answered('preselect', [ranked()])), null, false)).toBe(
      'Pin from the map data',
    );
    expect(resolverPinLine(ambiguous, 0, false)).toBe('Pin from the map data');
  });

  it('leaves the model-guess wording alone wherever the model guess is what will be saved', () => {
    // `null` hands the line back to `locationLine`, which is what this screen already said.
    expect(resolverPinLine(ambiguous, null, true)).toBeNull();
    expect(resolverPinLine(resolutionView(null), null, true)).toBeNull();
    expect(resolverPinLine(resolutionView(answered('no_match', [])), null, false)).toBeNull();
  });

  it('does not say "we couldn’t place this one" directly above a list of places we found', () => {
    expect(resolverPinLine(ambiguous, null, false)).toBe('Waiting on your pick');
  });
});

describe('the chip', () => {
  const matched = resolutionView(answered('preselect', [ranked(), ranked()]));
  const ambiguous = resolutionView(answered('confirm', [ranked(), ranked()]));

  it('never lets an unanswered ambiguous candidate wear the settled tone', () => {
    expect(resolutionChip(ambiguous, null)).toEqual({ label: 'Needs your pick', tone: 'needs_pick' });
    expect(resolutionChip(matched, null)).toEqual({ label: 'Matched', tone: 'settled' });
  });

  it('stops asking once the user has answered', () => {
    expect(resolutionChip(ambiguous, 1)).toEqual({ label: 'Your pick', tone: 'settled' });
    expect(resolutionChip(matched, 1)).toEqual({ label: 'Your pick', tone: 'settled' });
  });

  it('says nothing for the states with no options', () => {
    expect(resolutionChip(resolutionView(null), null)).toBeNull();
    expect(resolutionChip(resolutionView({ kind: 'capped' }), null)).toBeNull();
    expect(resolutionChip(resolutionView(answered('no_match', [])), null)).toBeNull();
  });
});
