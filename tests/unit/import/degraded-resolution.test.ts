/**
 * The degraded path — owner ruling, 2026-08-28: **resolution must never dead-end.**
 *
 * The failure this is written against is a real one. A Prague ice-cream roundup
 * (`https://vt.tiktok.com/ZSVG11K7V/`) named five venues, extraction found four, and all four
 * lookups came back `{"kind":"failed","reason":"lookup_failed"}`. From five real venues the
 * product offered to save one, and nothing anywhere said why.
 *
 * The chain under test is the whole one, in the order it actually runs, because the defect lived
 * in the joins rather than in any single function:
 *
 *     resolveCandidates  →  StoredResolution  →  resolutionView  →  willSave / derivePlaceSave
 *
 * Two rules pull against each other here and both are asserted:
 *
 *  - **never dead-end** — a candidate carrying the model's own coordinate is still saveable when
 *    the provider is unreachable, as an honest `llm_guess` with no invented identity and no
 *    invented score;
 *  - **never fabricate** — a candidate with *no* coordinate stays unsaveable. There is no
 *    city-centre fallback, no borrowed neighbour, no zero score standing in for an absent one.
 *
 * No provider is contacted: the resolver is a fake port throwing the exact `DomainError` the
 * Google adapter throws. The project's Text Search quota is 100/day and is reserved for the
 * owner's dataset.
 */

import { describe, expect, it } from 'vitest';

import { internal } from '@/domain/errors';
import { derivePlaceSave } from '@/domain/import/candidate-place';
import { ProviderLookupFailure } from '@/domain/import/provider-failure';
import { resolveCandidates } from '@/domain/import/resolve-candidates';
import { StoredResolutionSchema, type StoredResolution } from '@/domain/import/resolution-record';
import type { OpCtx, PlaceResolver } from '@/domain/ports';
import type { PlaceCandidate, RankedPlace, ResolveResult } from '@/domain/types';
import {
  dominantFailure,
  lookupFailureNotice,
  resolutionView,
  resolverPinLine,
  usesModelCoordinate,
  willSave,
} from '@/ui/import/candidate-resolution-view';

/* ------------------------------------------------------------------------------------------- *
 * Fixtures
 * ------------------------------------------------------------------------------------------- */

function candidate(overrides: Partial<PlaceCandidate> & { rawName: string }): PlaceCandidate {
  return {
    cityHint: 'Prague',
    countryHint: 'Czech Republic',
    categoryHint: 'cafe',
    addressHint: null,
    areaHint: null,
    evidence: null,
    modelConfidence: null,
    identifiedName: null,
    nameVariants: [],
    coordinates: null,
    tags: [],
    dishes: [],
    whyGo: null,
    ...overrides,
  };
}

/** The first candidate of the real Prague import, with the coordinate the model actually gave. */
const ANGELATO = candidate({
  rawName: 'Angelato',
  coordinates: { lat: 50.1034, lng: 14.3912 },
});

/** A candidate from the same import that the model could not place at all. */
const UNPLACED = candidate({ rawName: 'Etapa' });

function ctx(): OpCtx {
  return {
    signal: new AbortController().signal,
    importId: null,
    log: { event: () => undefined },
  };
}

/** A resolver that always fails the way the Google adapter fails. */
function failingResolver(kind: 'quota_exhausted' | 'auth', status: number): PlaceResolver {
  return {
    provider: 'google',
    resolve: () =>
      Promise.reject(
        internal(
          'Google Places searchText failed',
          new ProviderLookupFailure({ provider: 'google', kind, status }),
        ),
      ),
  };
}

const MATCH: RankedPlace = {
  place: {
    provider: 'google',
    providerPlaceId: 'ChIJangelato',
    sourceDataset: 'google-places',
    regionId: null,
    name: 'Angelato',
    altNames: [],
    providerCategory: 'ice_cream_shop',
    addressLine: 'Újezd 24',
    locality: 'Praha',
    lat: 50.0812,
    lng: 14.4041,
    datasetConfidence: 0.5,
  },
  score: 0.94,
  nameScore: 1,
  tokenCoverage: 1,
  categoryScore: 1,
};

function succeedingResolver(): PlaceResolver {
  const result: ResolveResult = {
    shortlist: [MATCH],
    confidence: { band: 'preselect', score: 0.94, margin: null },
    regionsSearched: ['global'],
    candidatesPrefiltered: 1,
  };
  return { provider: 'google', resolve: () => Promise.resolve(result) };
}

/* ------------------------------------------------------------------------------------------- *
 * 1. The reason survives
 * ------------------------------------------------------------------------------------------- */

describe('resolveCandidates carries the adapter classification', () => {
  it('records an exhausted quota as `quota_exhausted`, not as `lookup_failed`', async () => {
    const outcome = await resolveCandidates(
      failingResolver('quota_exhausted', 429),
      [ANGELATO, UNPLACED],
      'Prague',
      ctx(),
    );

    expect(outcome.resolutions).toEqual<StoredResolution[]>([
      { kind: 'failed', reason: 'quota_exhausted' },
      { kind: 'failed', reason: 'quota_exhausted' },
    ]);
    // A failed lookup still degrades one candidate rather than the import.
    expect(outcome.attempted).toBe(2);
    expect(outcome.degraded).toBe('PLACE_PROVIDER_UNAVAILABLE');
  });

  it('distinguishes a rejected key from a spent quota', async () => {
    const outcome = await resolveCandidates(failingResolver('auth', 403), [ANGELATO], null, ctx());
    expect(outcome.resolutions[0]).toEqual({ kind: 'failed', reason: 'auth' });
  });

  it('falls back to `lookup_failed` when the adapter offers no classification', async () => {
    const resolver: PlaceResolver = {
      provider: 'google',
      resolve: () => Promise.reject(internal('no classification here')),
    };
    const outcome = await resolveCandidates(resolver, [ANGELATO], null, ctx());
    expect(outcome.resolutions[0]).toEqual({ kind: 'failed', reason: 'lookup_failed' });
  });
});

describe('StoredResolutionSchema', () => {
  it('still parses every reason written before the widening', () => {
    // `extractions.candidates` rows on the local database hold these two. A row this schema cannot
    // parse does not fail loudly — it reads back as `null` and the confirm silently saves the
    // model's guess instead.
    for (const reason of ['lookup_failed', 'timed_out']) {
      expect(StoredResolutionSchema.parse({ kind: 'failed', reason })).toEqual({
        kind: 'failed',
        reason,
      });
    }
  });

  it('parses each new classification', () => {
    for (const reason of ['quota_exhausted', 'auth', 'bad_request', 'provider_error', 'transport']) {
      expect(StoredResolutionSchema.parse({ kind: 'failed', reason })).toEqual({
        kind: 'failed',
        reason,
      });
    }
  });

  it('still refuses a reason nothing produces', () => {
    expect(StoredResolutionSchema.safeParse({ kind: 'failed', reason: 'vibes' }).success).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------- *
 * 2. Quota exhausted + model coordinates → a saveable, honest, approximate place
 * ------------------------------------------------------------------------------------------- */

describe('degraded save: the provider is gone but the model placed the candidate', () => {
  it('is saveable, and the screen says the pin came from the caption', async () => {
    const { resolutions } = await resolveCandidates(
      failingResolver('quota_exhausted', 429),
      [ANGELATO],
      'Prague',
      ctx(),
    );
    const view = resolutionView(resolutions[0]!);

    expect(view).toEqual({ kind: 'failed', reason: 'quota_exhausted' });
    expect(willSave(true, view, null)).toBe(true);
    expect(usesModelCoordinate(true, view, null)).toBe(true);
    expect(resolverPinLine(view, null, true)).toBe('Pin from the caption');
  });

  it('writes an honest `llm_guess` row: the model’s coordinate, no provider identity, no score', async () => {
    const { resolutions } = await resolveCandidates(
      failingResolver('quota_exhausted', 429),
      [ANGELATO],
      'Prague',
      ctx(),
    );
    // Nothing was resolved, so the confirm step has no `RankedPlace` to pass.
    const outcome = derivePlaceSave(ANGELATO, null);

    expect(resolutions[0]).toEqual({ kind: 'failed', reason: 'quota_exhausted' });
    expect(outcome.kind).toBe('save');
    if (outcome.kind !== 'save') return;

    expect(outcome.place.provider).toBe('llm_guess');
    expect(outcome.place.sourceDataset).toBe('llm-guess');
    expect(outcome.place.lat).toBe(50.1034);
    expect(outcome.place.lng).toBe(14.3912);
    expect(outcome.place.providerCategory).toBeNull();

    // `resolution_score` is `real check (between 0 and 1)` on the scorer's own scale, so `0` would
    // be a measurement meaning "ranked, and ranked worst". Nothing ranked this. `null` is the only
    // value that says so.
    expect(outcome.place.resolutionScore).toBeNull();
    // Likewise `datasetConfidence`: 0, never the schema's neutral 0.5, so no wiring change can
    // silently credit a model guess with a provider's confidence.
    expect(outcome.place.datasetConfidence).toBe(0);
    expect(outcome.place.regionId).toBeNull();
  });

  it('mints a provider id that is deterministic, so a re-paste converges rather than duplicating', () => {
    const first = derivePlaceSave(ANGELATO, null);
    const second = derivePlaceSave(ANGELATO, null);
    if (first.kind !== 'save' || second.kind !== 'save') throw new Error('expected saves');

    expect(first.place.providerPlaceId).toBe(second.place.providerPlaceId);
    // Namespaced as a guess: it can never be mistaken for, or collide with, a Google place id.
    expect(first.place.providerPlaceId.startsWith('llm:')).toBe(true);
    expect(first.place.providerPlaceId).not.toContain('ChIJ');
  });
});

describe('degraded save: the provider answered, and the answer was "no such place"', () => {
  it('treats a genuine no_match with a model coordinate exactly like a failure for the user', () => {
    // `no_match` is a successful resolution, not an error — but from the user's side the pin has
    // the same provenance and must carry the same sentence.
    const view = resolutionView({
      kind: 'answered',
      result: {
        shortlist: [],
        confidence: { band: 'no_match', score: 0, margin: null },
        regionsSearched: ['global'],
        candidatesPrefiltered: 0,
      },
    });

    expect(view).toEqual({ kind: 'unresolved' });
    expect(willSave(true, view, null)).toBe(true);
    expect(resolverPinLine(view, null, true)).toBe('Pin from the caption');
    // …and it is still not a failure, so it never triggers the failure notice.
    expect(dominantFailure([view])).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------- *
 * 3. Quota exhausted + NO model coordinates → still honest, still unsaveable
 * ------------------------------------------------------------------------------------------- */

describe('degraded save: the provider is gone and the model placed nothing', () => {
  it('does not fabricate a point', async () => {
    const { resolutions } = await resolveCandidates(
      failingResolver('quota_exhausted', 429),
      [UNPLACED],
      'Prague',
      ctx(),
    );
    const view = resolutionView(resolutions[0]!);

    expect(willSave(false, view, null)).toBe(false);
    expect(usesModelCoordinate(false, view, null)).toBe(false);
    // No pin line at all — the screen keeps saying "We couldn't place this one".
    expect(resolverPinLine(view, null, false)).toBeNull();

    const outcome = derivePlaceSave(UNPLACED, null);
    expect(outcome).toEqual({ kind: 'skipped', reason: 'no_coordinates' });
  });
});

/* ------------------------------------------------------------------------------------------- *
 * 4. A successful resolve is untouched by any of this
 * ------------------------------------------------------------------------------------------- */

describe('a successful Google resolve is unchanged', () => {
  it('still preselects, still saves the provider identity, still carries the real score', async () => {
    const { resolutions, degraded } = await resolveCandidates(
      succeedingResolver(),
      [ANGELATO],
      'Prague',
      ctx(),
    );
    expect(degraded).toBeNull();

    const view = resolutionView(resolutions[0]!);
    expect(view.kind).toBe('matched');
    expect(resolverPinLine(view, null, true)).toBe('Pin from the map data');
    // The pin comes from the provider, so the caption caveat must not be claimed of it.
    expect(usesModelCoordinate(true, view, null)).toBe(false);

    const outcome = derivePlaceSave(ANGELATO, MATCH);
    if (outcome.kind !== 'save') throw new Error('expected a save');
    expect(outcome.place.provider).toBe('google');
    expect(outcome.place.sourceDataset).toBe('google-places');
    expect(outcome.place.providerPlaceId).toBe('ChIJangelato');
    expect(outcome.place.lat).toBe(50.0812);
    expect(outcome.place.resolutionScore).toBe(0.94);
  });

  it('says nothing about failures when there were none', () => {
    const view = resolutionView({
      kind: 'answered',
      result: {
        shortlist: [MATCH],
        confidence: { band: 'preselect', score: 0.94, margin: null },
        regionsSearched: ['global'],
        candidatesPrefiltered: 1,
      },
    });
    expect(dominantFailure([view])).toBeNull();
    expect(lookupFailureNotice([view], 1)).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------- *
 * 5. The sentence the screen says
 * ------------------------------------------------------------------------------------------- */

describe('lookupFailureNotice', () => {
  const quota = resolutionView({ kind: 'failed', reason: 'quota_exhausted' });
  const broke = resolutionView({ kind: 'failed', reason: 'auth' });
  const slow = resolutionView({ kind: 'failed', reason: 'timed_out' });

  it('names the daily limit, because that is the one cause with a time attached', () => {
    const notice = lookupFailureNotice([quota, quota], 2);
    expect(notice).toContain('today’s place lookups');
    expect(notice).toContain('You can still save them');
    expect(notice).toContain('captions');
  });

  it('never leaks which of our own things is broken', () => {
    const notice = lookupFailureNotice([broke], 1);
    expect(notice).toBe(
      'We couldn’t reach the place database just now, so 1 of these pins comes from the captions rather than a place database. You can still save them.',
    );
    expect(notice).not.toMatch(/key|auth|403|quota/i);
  });

  it('drops the "you can still save" clause when nothing is saveable', () => {
    const notice = lookupFailureNotice([quota], 0);
    expect(notice).toBe(
      'We’ve used up today’s place lookups, so we couldn’t match one of these to a place.',
    );
  });

  it('says "too slow" only when every failure really was a timeout', () => {
    expect(dominantFailure([slow, slow])).toBe('timed_out');
    expect(lookupFailureNotice([slow, slow], 0)).toContain('didn’t answer in time');
    // One rejected key among the timeouts and "it was slow" stops being true.
    expect(dominantFailure([slow, broke])).toBe('lookup_failed');
  });

  // Both of these were rendered and photographed before they were written down
  // (QA-DEGRADED-1). The notice used to take "does ANY candidate on this screen use a model
  // coordinate", which a `capped` or `no_match` candidate satisfies — so a failure that rescued
  // nobody still claimed credit for a survivor it had nothing to do with.
  it('does not credit a failure for a candidate the resolver never saw', () => {
    const capped = resolutionView({ kind: 'capped' });
    expect(lookupFailureNotice([broke, capped], 0)).toBe(
      'We couldn’t reach the place database just now, so we couldn’t match one of these to a place.',
    );
  });

  // The worst rendering of the old bug: this sentence sat directly above a card chipped "Matched"
  // and footed "Pin from the map data". A screen-level sentence about a per-candidate fact is
  // false as soon as the screen is mixed, so it has to say how many.
  it('counts, rather than describing the whole screen, when only some candidates failed', () => {
    const matched = resolutionView({
      kind: 'answered',
      result: {
        shortlist: [MATCH],
        confidence: { band: 'preselect', score: 0.94, margin: null },
        regionsSearched: ['global'],
        candidatesPrefiltered: 1,
      },
    });
    const notice = lookupFailureNotice([matched, matched, broke], 1);
    expect(notice).not.toContain('these pins come from the captions');
    expect(notice).toContain('1 of these pins comes');

    expect(lookupFailureNotice([matched, broke, broke], 0)).toContain(
      'we couldn’t match 2 of these to a place',
    );
  });

  it('lets an exhausted quota outrank everything else', () => {
    expect(dominantFailure([broke, slow, quota])).toBe('quota_exhausted');
  });

  it('says nothing for a candidate that was never looked up', () => {
    // `null` (never attempted) and `capped` are not failures and must not acquire failure copy.
    expect(dominantFailure([resolutionView(null), resolutionView({ kind: 'capped' })])).toBeNull();
  });
});
