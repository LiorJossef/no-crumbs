import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';
import {
  collapsesToOneResult,
  resolutionView,
  resolverPinLine,
  savedPlaceName,
  usesModelCoordinate,
  type CandidateResolutionView,
} from '@/ui/import/candidate-resolution-view';

/**
 * The review screen's single-confident-result collapse (`docs/ux-import-flatten.md` §3), and the
 * one thing it must never become.
 *
 * The collapse deletes the tickbox, the chip and the card around a candidate. Everything it
 * deletes is a place the screen says how sure it is — so if it could ever fire on a candidate
 * whose pin came from the caption, it would be a prettier version of the defect §1.3 found: *the
 * one card that would save a guess was the one card that did not say so*. The band is
 * `deriveResolution`'s `preselect` and nothing else, which is what makes that impossible rather
 * than merely unlikely, and this file pins both halves of that claim.
 *
 * The screen itself has no DOM in this runner, so the layout assertions are made against the
 * component source — the same technique `import-error-copy.test.ts` uses, and for the same reason:
 * the defect it guards is a control wired to nothing, which is a fact about the source.
 */

const CLIENT_SOURCE = readFileSync('src/app/import/import-page-client.tsx', 'utf8');

function place(over: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: 'g-1',
    sourceDataset: 'google-places',
    regionId: null,
    name: 'Kohi בית קפה יפני',
    altNames: [],
    providerCategory: 'cafe',
    addressLine: 'Yehuda Halevi 42',
    locality: 'Tel Aviv-Yafo',
    lat: 32.0641,
    lng: 34.7745,
    datasetConfidence: 0.9,
    ...over,
  };
}

function ranked(over: Partial<ResolvedPlace> = {}): RankedPlace {
  return { place: place(over), score: 0.9, nameScore: 0.9, tokenCoverage: 1, categoryScore: 1 };
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
      regionsSearched: [],
      candidatesPrefiltered: shortlist.length,
    },
  };
}

const MATCHED = resolutionView(answered('preselect', [ranked()]));
const AMBIGUOUS = resolutionView(answered('confirm', [ranked(), ranked({ providerPlaceId: 'g-2' })]));
const EVERY_VIEW: readonly CandidateResolutionView[] = [
  MATCHED,
  resolutionView(answered('preselect', [ranked(), ranked({ providerPlaceId: 'g-2' })])),
  AMBIGUOUS,
  resolutionView(answered('confirm', [ranked()])),
  resolutionView(answered('no_match', [])),
  resolutionView({ kind: 'failed', reason: 'quota_exhausted' }),
  resolutionView({ kind: 'capped' }),
  resolutionView(null),
];

describe('collapsesToOneResult', () => {
  it('collapses one candidate the resolver settled', () => {
    expect(collapsesToOneResult([MATCHED])).toBe(true);
  });

  it('leaves every other screen exactly as it was', () => {
    // Two or more candidates keep their tickboxes and `Select all` — a list is a list. And every
    // band other than `preselect` keeps the card that says which band it is in.
    expect(collapsesToOneResult([MATCHED, MATCHED])).toBe(false);
    expect(collapsesToOneResult([])).toBe(false);
    for (const view of EVERY_VIEW) {
      if (view.kind === 'matched') continue;
      expect(collapsesToOneResult([view]), view.kind).toBe(false);
    }
  });
});

describe('the collapse can never hide a caption pin', () => {
  it('never fires on a candidate whose pin would come from the model', () => {
    // The whole invariant, over every view this screen can produce and both answers to "did the
    // model give a coordinate?". `usesModelCoordinate` is the same predicate the card's own
    // caveat is driven by, so this is the screen's definition of a guess, not a second one.
    for (const view of EVERY_VIEW) {
      for (const modelHasCoordinates of [true, false]) {
        for (const pick of [null, 0]) {
          if (!collapsesToOneResult([view])) continue;
          expect(usesModelCoordinate(modelHasCoordinates, view, pick), view.kind).toBe(false);
          expect(resolverPinLine(view, pick, modelHasCoordinates)).toBe('Pin from the map data');
        }
      }
    }
  });

  it('does not collapse the exact card that once saved a guess without saying so', () => {
    // §1.3's defect, verbatim: `confirm` band, no pick, and the model gave a coordinate — so the
    // card is pre-ticked and `Save this place →` would write the model's pin. It stays a full
    // card, and its pin line says where that pin came from.
    const single = resolutionView(answered('confirm', [ranked()]));
    expect(collapsesToOneResult([single])).toBe(false);
    expect(usesModelCoordinate(true, single, null)).toBe(true);
    expect(resolverPinLine(single, null, true)).toBe('Pin from the caption');
  });

  it('keeps collapsing after the user picks a different row, and re-titles to what will be saved', () => {
    // `Not this place?` is still the correction, and the H1 is derived from the same
    // `effectivePick` the save is — so what the screen's largest text says is what gets written.
    const view = resolutionView(
      answered('preselect', [ranked(), ranked({ providerPlaceId: 'g-2', name: 'Kohi Dizengoff' })]),
    );
    expect(collapsesToOneResult([view])).toBe(true);
    expect(savedPlaceName(view, null)).toBe('Kohi בית קפה יפני');
    expect(savedPlaceName(view, 1)).toBe('Kohi Dizengoff');
    expect(usesModelCoordinate(true, view, 1)).toBe(false);
  });
});

describe('the review screen wires the collapse to that one band', () => {
  it('derives it from `collapsesToOneResult` rather than a threshold of its own', () => {
    expect(CLIENT_SOURCE).toContain('const collapsed = statusByIndex === null && collapsesToOneResult(views)');
    // No band literal in the client: that mapping belongs to `deriveResolution`, and a second
    // copy of it here is how the screen and the server end up disagreeing about what was saved.
    expect(CLIENT_SOURCE).not.toContain("'preselect'");
  });

  it('keeps the save an explicit press', () => {
    // Charter §3 invariant 2. Nothing in this component may call the save from an effect, and the
    // reassurance under the button is unconditional — the collapsed state is the one most likely
    // to read as "already done", so it is the state that needs the sentence most.
    expect(CLIENT_SOURCE).toContain('Nothing is saved until you tap Save.');
    expect(/useEffect\([\s\S]{0,400}?onSave\(/.test(CLIENT_SOURCE)).toBe(false);
  });
});

describe('NoPlacesScreen — the modal outcome has its recovery back', () => {
  /** From `function NoPlacesScreen(` to the next top-level `function `. */
  const NO_PLACES_SOURCE = CLIENT_SOURCE.slice(
    CLIENT_SOURCE.indexOf('function NoPlacesScreen('),
  ).split('\nfunction ')[0]!;

  it('offers `Add a place you know`', () => {
    expect(NO_PLACES_SOURCE).toContain('Add a place you know');
  });

  it('wires it to the manual-add surface and to nothing else', () => {
    // The defect `import-error-copy.test.ts` records: an `Add manually →` primary that called
    // `reset()` and landed the user on an empty paste field. The control now calls the host's
    // opener, and this screen never calls `reset`/`onRetry` for it.
    const button = NO_PLACES_SOURCE.slice(
      NO_PLACES_SOURCE.indexOf('{onAddManually && ('),
      NO_PLACES_SOURCE.indexOf('Add a place you know'),
    );
    expect(button).toContain('onClick={onAddManually}');
    expect(button).not.toContain('onRetry');
    expect(button).not.toContain('reset(');
  });

  it('renders it only where there is a manual-add surface to open', () => {
    // The rule that removed the dead button in the first place, kept: guarded on the prop, so the
    // standalone `/import` route (no `＋` sheet) shows `Try another TikTok` as its primary rather
    // than a button naming a destination it cannot reach.
    expect(NO_PLACES_SOURCE).toContain('{onAddManually && (');
    expect(NO_PLACES_SOURCE).toContain("variant={onAddManually ? 'outline' : 'default'}");
  });

  it('is threaded from the page component, not left as an unused prop', () => {
    expect(CLIENT_SOURCE).toContain('readonly onAddManually?: () => void;');
    expect(CLIENT_SOURCE).toContain('onAddManually={onAddManually ?? null}');
  });
});
