/**
 * Growth defect G5 — the card carrying the least provenance was the one saved by default.
 *
 * A `capped` candidate is one past `MAX_CANDIDATES`: kept, shown, and **never put to the
 * resolver**. `not_attempted` is the same fact for a different reason (a row written before the
 * resolver existed). Both were correctly excluded from the resolver chip and from the pin line,
 * for a reason `candidate-resolution-view.ts` states and this file does not weaken: contrasting
 * them with a place database would claim a search that never happened.
 *
 * But `willSave` is `effectivePick(…) !== null || modelHasCoordinates`, and a capped candidate has
 * no pick — so whenever the model had produced a coordinate the card arrived **pre-ticked** and
 * `Save` wrote an unverified `llm_guess` pin. Nothing had checked it and nothing had said so.
 *
 * Two things close it, and this file pins both plus the line between them:
 *
 *  - `arrivesTicked` withholds the tick from those two views, and **only** those two;
 *  - `resolverPinLine` gives them their own line rather than routing them into the existing one.
 *
 * The line that must not move: `unresolved` and `failed` cards also save a caption pin, and they
 * keep their tick. We looked for those and got nothing back — that is the degraded path the owner
 * ruled in on 2026-08-28 (*resolution must never dead-end*), and un-ticking it here would repeal
 * that ruling by accident.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { StoredResolution } from '@/domain/import/resolution-record';
import type { RankedPlace, ResolveResult, ResolvedPlace } from '@/domain/types';
import {
  arrivesTicked,
  resolutionView,
  resolverPinLine,
  willSave,
  type CandidateResolutionView,
} from '@/ui/import/candidate-resolution-view';

/** C125 (`docs/overnight-copy-deck.md` §3.3). Two facts, because one of them alone misstates. */
const CAPPED_PIN_LINE = 'Pin from the caption. We didn’t check this one.';

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

const capped = resolutionView({ kind: 'capped' });
const notAttempted = resolutionView(null);
const matched = resolutionView(answered('preselect', [ranked()]));
const ambiguous = resolutionView(answered('confirm', [ranked(), ranked({ providerPlaceId: 'g-2' })]));
const unresolved = resolutionView(answered('no_match', []));
const failed = resolutionView({ kind: 'failed', reason: 'timed_out' });

describe('a candidate nobody looked up does not arrive ticked', () => {
  it('withholds the tick from `capped` and `not_attempted`, model coordinate or not', () => {
    expect(arrivesTicked(true, capped)).toBe(false);
    expect(arrivesTicked(true, notAttempted)).toBe(false);
    expect(arrivesTicked(false, capped)).toBe(false);
    expect(arrivesTicked(false, notAttempted)).toBe(false);
  });

  it('is a default and not a veto — the candidate is still saveable', () => {
    // The whole point of the fix: `willSave` is unchanged, so the checkbox is live, the card is
    // counted in `saveableIndices`, and `Select all` reaches it. One tap saves it; nothing saves
    // it silently.
    expect(willSave(true, capped, null)).toBe(true);
    expect(willSave(true, notAttempted, null)).toBe(true);
  });

  it('does not un-tick the caption pins we actually looked for', () => {
    // `unresolved` and `failed` with a model coordinate are the degraded path the owner ruled in
    // on 2026-08-28. They save a caption pin too, and they must keep arriving ticked.
    expect(arrivesTicked(true, unresolved)).toBe(true);
    expect(arrivesTicked(true, failed)).toBe(true);
  });

  it('leaves every other arrival exactly as it was', () => {
    const views: readonly CandidateResolutionView[] = [matched, ambiguous, unresolved, failed];
    for (const view of views) {
      for (const hasCoords of [true, false]) {
        expect(arrivesTicked(hasCoords, view), view.kind).toBe(willSave(hasCoords, view, null));
      }
    }
  });

  it('never ticks something Save would refuse to write', () => {
    const views: readonly CandidateResolutionView[] = [
      matched, ambiguous, unresolved, failed, capped, notAttempted,
    ];
    for (const view of views) {
      for (const hasCoords of [true, false]) {
        if (arrivesTicked(hasCoords, view)) {
          expect(willSave(hasCoords, view, null), view.kind).toBe(true);
        }
      }
    }
  });
});

describe('and it says so on the card', () => {
  it('states both facts, and does not imply a search that never happened', () => {
    expect(resolverPinLine(capped, null, true)).toBe(CAPPED_PIN_LINE);
    expect(resolverPinLine(notAttempted, null, true)).toBe(CAPPED_PIN_LINE);
    // Not the bare line. That one means "we consulted the map data and it gave us nothing", which
    // for these two would be a claim about a search that never happened.
    expect(resolverPinLine(capped, null, true)).not.toBe('Pin from the caption');
  });

  it('keeps the bare line for the states that were looked up', () => {
    expect(resolverPinLine(unresolved, null, true)).toBe('Pin from the caption');
    expect(resolverPinLine(failed, null, true)).toBe('Pin from the caption');
    expect(resolverPinLine(ambiguous, null, true)).toBe('Pin from the caption');
  });

  it('says nothing when there is no pin to have a provenance', () => {
    expect(resolverPinLine(capped, null, false)).toBeNull();
    expect(resolverPinLine(notAttempted, null, false)).toBeNull();
  });

  it('does not put a number, a percentage or a confidence word on any of it', () => {
    // `docs/overnight-copy-deck.md` §3.1: no invented confidence number, band, bar or percentage.
    for (const line of [CAPPED_PIN_LINE, 'Pin from the caption', 'Pin from the map data']) {
      expect(line).not.toMatch(/\d|%|confiden|score|likel|probab/i);
    }
  });
});

/**
 * The arithmetic on the Save button is a property of the review screen, which has no DOM in this
 * runner — so it is asserted against the source, the technique `import-error-copy.test.ts` and
 * `one-result-collapse.test.ts` already use for the same reason.
 *
 * Written as a scan over **every** file under `src/app/import/`, not over one hard-coded path.
 * W6-1 splits that file six ways, and a guard pinned to a path it no longer lives at keeps passing
 * while guarding nothing — which is exactly the failure this assertion exists to prevent.
 */
function importClientSource(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk('src/app/import');
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

describe('the review screen seeds its selection from the arrival predicate', () => {
  const SOURCE = importClientSource();

  it('reads the initial tick from `arrivesTicked`', () => {
    // Matched on the call rather than on its exact argument list. The literal
    // `arrivesTicked(isSaveable(c), views[i]!)` was pinned here and broke the moment the predicate
    // grew a third argument for hashtag-only candidates — a real improvement failing a test that
    // was describing today's spelling rather than the property. What matters is that the seed
    // comes from `arrivesTicked` and not from `willSave`, which the next test still pins.
    expect(SOURCE).toMatch(/arrivesTicked\(\s*isSaveable\(c\),\s*views\[i\]!/);
  });

  it('passes the hashtag-only fact to the tick predicate, or the notice is drawn beside a ticked box', () => {
    // Measured recurrence 2026-09-01: `RICH-EXT-1` §4's caption — one sentence, 28 tags — produced
    // `tsukjimarket`, resolved to `Tsukiji Market` at 1.000 and **pre-selected**. The confidence
    // cap in `filterPlausible` gates nothing (`SCORING.total.datasetConfidence` is 0) and the card's
    // "Only mentioned in a hashtag" notice is drawn next to a box that is already ticked.
    expect(SOURCE).toContain('isHashtagOnly(probe.caption, c)');
  });

  it('no longer seeds it from `willSave` with a null pick', () => {
    // The exact expression this replaced. If it comes back, so does G5.
    expect(SOURCE).not.toContain('willSave(isSaveable(c), views[i]!, null)');
  });

  it('still counts those candidates as saveable', () => {
    // `saveableIndices` is unchanged and must stay `willSave`'s question, or the fix turns from a
    // default into a veto and the card loses its checkbox.
    expect(SOURCE).toContain('willSave(isSaveable(c), views[i]!, picks.get(i) ?? null)');
  });

  it('the scan is looking at something', () => {
    // A guard that cannot fail is decoration. This is the self-test the other source scans in
    // this directory carry, and it is what makes the glob above trustworthy after W6-1 moves the
    // code out of `import-page-client.tsx`.
    expect(SOURCE.length).toBeGreaterThan(10_000);
    expect(SOURCE).toContain('function CaptionPreviewScreen(');
  });
});

describe('a name the caption gives only in a hashtag does not arrive ticked', () => {
  // The defect this closes, measured twice on the same specimen. `RICH-EXT-1` §4 (2026-08-28)
  // recorded `#tsukijifishmarket` becoming a place at 0.95 confidence. The hashtag gate was built,
  // and on 2026-09-01 the same caption produced `tsukjimarket` -> `Tsukiji Market` at **1.000,
  // pre-selected**. The gate had worked exactly as designed and none of it reached the tick:
  // `filterPlausible` caps `modelConfidence`, which `SCORING.total.datasetConfidence: 0` makes
  // inert, and the card's notice is drawn beside a box already ticked.
  //
  // The prose of that caption never says the creator went to Tsukiji. That is the same test the
  // `capped` rule is drawn on — nothing has established this is a recommendation — so it gets the
  // same answer: shown, labelled, saveable in one tap, **not** decided on the user's behalf.
  const matched: CandidateResolutionView = {
    kind: 'matched',
    options: [
      {
        index: 0,
        name: 'Tsukiji Market',
        detail: 'Tsukiji, Chuo City, Tokyo',
        address: 'Tsukiji, Chuo City, Tokyo',
        lat: 35.6654,
        lng: 139.7707,
      },
    ],
  };

  it('is not ticked, however cleanly it resolved', () => {
    expect(arrivesTicked(true, matched, true)).toBe(false);
    expect(arrivesTicked(false, matched, true)).toBe(false);
  });

  it('is still ticked when the caption names it in prose', () => {
    expect(arrivesTicked(true, matched, false)).toBe(true);
  });

  it('defaults to ticked when no caller says otherwise, so nothing silently changed', () => {
    expect(arrivesTicked(true, matched)).toBe(true);
  });
});
