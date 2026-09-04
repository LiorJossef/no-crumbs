/**
 * W6-4 — provenance takes the badge slot.
 *
 * The confident signal used to be an 11px mint pill and the uncertainty 12px grey at the bottom of
 * the card: `facelift-plan.md` §1 called it out as a hierarchy that **inverts the epistemics**. The
 * two swap here. Same three states, opposite visual weight.
 *
 * The exit criterion is a human reading five cards cold, which no test can stand in for. What this
 * file can do is pin the four things a restyle could quietly break on the way, none of which are
 * visible in a screenshot:
 *
 *  1. **The logic did not move.** `facelift-plan.md` §1 calls the provenance derivation *"the best
 *     work in the repo; only its visual weight is wrong"*. Every label here is derived from the
 *     same primitives `resolverPinLine` uses, and the badge and the line can never contradict.
 *  2. **`not_attempted` is still not `no_match`.** `Not checked` and `No match` are different
 *     sentences about different events, and collapsing them is the uncertainty-into-certainty move
 *     the working agreement forbids.
 *  3. **C120 and C122 stay a matched pair.** They are the two answers to one question and the
 *     parallel is what makes the difference legible at a glance.
 *  4. **No invented confidence number, anywhere** — not on screen, not in the DOM, not in an
 *     `aria-label` (`overnight-copy-deck.md` §3.1).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';
import {
  provenanceBadge,
  resolutionView,
  resolverPinLine,
  settlednessLine,
  type CandidateResolutionView,
} from '@/ui/import/candidate-resolution-view';

const CARD = readFileSync('src/app/import/screens/review/candidate-card.tsx', 'utf8');

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function place(over: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    provider: 'google',
    providerPlaceId: 'g-1',
    sourceDataset: 'google-places',
    regionId: null,
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
      regionsSearched: ['tlv'],
      candidatesPrefiltered: shortlist.length,
    },
  };
}

const matched = resolutionView(answered('preselect', [ranked()]));
const ambiguous = resolutionView(answered('confirm', [ranked(), ranked({ providerPlaceId: 'g-2' })]));
const unresolved = resolutionView(answered('no_match', []));
const failed = resolutionView({ kind: 'failed', reason: 'timed_out' });
const capped = resolutionView({ kind: 'capped' });
const notAttempted = resolutionView(null);

const EVERY_VIEW: readonly CandidateResolutionView[] = [
  matched,
  ambiguous,
  unresolved,
  failed,
  capped,
  notAttempted,
];

describe('the badge answers “where did this pin come from?”', () => {
  it('C120 — a picked or auto-accepted shortlist entry is map data', () => {
    expect(provenanceBadge(false, matched, null)).toEqual({
      label: 'From the map data',
      tone: 'settled',
    });
    expect(provenanceBadge(true, ambiguous, 1)).toEqual({
      label: 'From the map data',
      tone: 'settled',
    });
  });

  it('C121 — options with nothing chosen and no model pin is the absence of a provenance', () => {
    // Its words come from `resolutionChip`, which already ships and already tests. Not restated.
    expect(provenanceBadge(false, ambiguous, null)).toEqual({
      label: 'Needs your pick',
      tone: 'needs_pick',
    });
  });

  it('C122 — a model coordinate we are about to save is the caption, in its own tone', () => {
    for (const view of [failed, unresolved, ambiguous]) {
      expect(provenanceBadge(true, view, null), view.kind).toEqual({
        label: 'From the caption',
        tone: 'caption',
      });
    }
  });

  it('C123 — the two nobody looked up say so, and it is not a tone quieter than C122', () => {
    for (const view of [capped, notAttempted]) {
      expect(provenanceBadge(true, view, null), view.kind).toEqual({
        label: 'Not checked',
        tone: 'caption',
      });
      expect(provenanceBadge(false, view, null), view.kind).toEqual({
        label: 'Not checked',
        tone: 'caption',
      });
    }
  });

  it('C124 — a lookup that came back empty is a no match', () => {
    expect(provenanceBadge(false, unresolved, null)).toEqual({ label: 'No match', tone: 'needs_pick' });
  });

  it('never says “no match” about a search that did not happen', () => {
    // The distinction the whole module exists for. `capped`/`not_attempted` were never put to the
    // resolver; `unresolved` was, and came back empty. One badge may not serve both.
    const neverLooked = [provenanceBadge(false, capped, null), provenanceBadge(false, notAttempted, null)];
    for (const badge of neverLooked) {
      expect(badge?.label).not.toBe('No match');
      expect(badge?.label).toBe('Not checked');
    }
    expect(provenanceBadge(false, unresolved, null)?.label).toBe('No match');
  });

  it('has nothing to say about a failed lookup with no coordinate, rather than guessing', () => {
    // `No match` would claim we looked and found nothing, which is exactly what `failed` is not,
    // and the copy deck specifies no sixth string. `lookupFailureNotice` states this case at
    // screen level. Recorded as a gap rather than filled by inventing copy.
    expect(provenanceBadge(false, failed, null)).toBeNull();
  });
});

describe('C120 and C122 are a matched pair', () => {
  it('are both the long form or both the short form', () => {
    /*
     * `overnight-copy-deck.md` §3.4 acceptance 4 words this as "the same word count", which does
     * not hold for the strings the same document specifies — `From the map data` is four words and
     * `From the caption` is three. The property it is reaching for is the parallel construction:
     * both carry the `From the ` frame, or, if the pair ever cannot fit at 320px, neither does
     * (`Map data` / `Caption`). That is what is asserted, and the discrepancy is reported upward
     * rather than resolved by editing a ruled string.
     */
    const mapData = provenanceBadge(false, matched, null)?.label ?? '';
    const caption = provenanceBadge(true, failed, null)?.label ?? '';
    expect(mapData.startsWith('From the ')).toBe(caption.startsWith('From the '));
  });

  it('are told apart by tone, and only `settled` gets the mint', () => {
    // A caption pin can never be mistaken for a verified one at a glance, which is the exit
    // criterion in one assertion.
    expect(provenanceBadge(false, matched, null)?.tone).toBe('settled');
    expect(provenanceBadge(true, failed, null)?.tone).toBe('caption');
    expect(code(CARD)).toContain("badge.tone === 'settled' && 'bg-accent text-brand'");
    expect(code(CARD)).toContain("badge.tone === 'caption' && 'bg-warning/10 text-warning'");
  });

  it('may never truncate', () => {
    // `From the map data` is seventeen characters in an 11px pill and this codebase has already
    // shipped the clipped version of this exact sentence once — 208px into a 180px box on a Pixel
    // 7, rendered as "Approximate pin from the ca…", losing the half that carried the meaning.
    const badgeBlock = code(CARD).slice(code(CARD).indexOf('badge !== null && ('), code(CARD).indexOf('{badge.label}'));
    expect(badgeBlock).toContain('shrink-0');
    expect(badgeBlock).not.toContain('truncate');
    expect(badgeBlock).not.toContain('line-clamp');
  });
});

describe('settledness demotes rather than vanishing', () => {
  it('still says that a pick took', () => {
    expect(settlednessLine(ambiguous, 1)).toBe('Your pick');
    expect(settlednessLine(matched, null)).toBe('Matched');
  });

  it('leaves “needs your pick” to the badge, so it is not said twice on one card', () => {
    expect(settlednessLine(ambiguous, null)).toBeNull();
    expect(provenanceBadge(false, ambiguous, null)?.label).toBe('Needs your pick');
  });

  it('says nothing for the states that have nothing settled', () => {
    for (const view of [unresolved, failed, capped, notAttempted]) {
      expect(settlednessLine(view, null), view.kind).toBeNull();
    }
  });
});

describe('the collapsed layout keeps the long form, because it has no badge', () => {
  it('reads the pin line from `resolverPinLine` exactly as before', () => {
    // That layout deletes the card, the tickbox, the name and the badge slot, so this row is the
    // only place provenance can live in it. `collapsesToOneResult` only fires for `matched`, so
    // the sentence is always `Pin from the map data` and the collapse can never hide a guess.
    expect(code(CARD)).toContain('collapsed');
    expect(code(CARD)).toContain('resolverPinLine(view, pick, isSaveable(candidate))');
    expect(resolverPinLine(matched, null, true)).toBe('Pin from the map data');
  });
});

describe('nothing here invents a number', () => {
  it('produces no digit, percentage or confidence word on any card state', () => {
    // `overnight-copy-deck.md` §3.1, and the reason `candidate-presentation.ts` has none either:
    // the score behind these bands is an internal ranking, and rendering it would dress it as a
    // finding.
    for (const view of EVERY_VIEW) {
      for (const hasCoords of [true, false]) {
        for (const pick of [null, 0]) {
          const labels = [provenanceBadge(hasCoords, view, pick)?.label, settlednessLine(view, pick)];
          for (const label of labels) {
            if (label === undefined || label === null) continue;
            expect(label, `${view.kind}/${String(hasCoords)}/${String(pick)}`).not.toMatch(
              /\d|%|confiden|score|likel|probab|match rate/i,
            );
          }
        }
      }
    }
  });

  it('derives the badge in the view module, not in the card', () => {
    // `facelift-plan.md` §1's "preserve unchanged" list names this logic. The card renders what
    // the module decides and holds no band literal of its own.
    expect(code(CARD)).toContain('provenanceBadge(isSaveable(candidate), view, pick)');
    for (const literal of ["'preselect'", "'confirm'", "'no_match'", "'not_attempted'"]) {
      expect(code(CARD), literal).not.toContain(literal);
    }
  });

  it('keeps “From the caption” to the one module that owns it', () => {
    // `overnight-copy-deck.md` §3.4 acceptance 5. A second literal is a second place for the
    // wording to drift from the logic that earns it.
    expect(code(CARD)).not.toContain('From the caption');
    expect(code(CARD)).not.toContain('From the map data');
  });
});
