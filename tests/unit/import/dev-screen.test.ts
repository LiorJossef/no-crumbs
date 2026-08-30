/**
 * The development-only screen seam, and the one property that matters about it.
 *
 * `/import?state=review` renders the review screen without running an import, so the quality gates
 * can photograph the screens `ImportPageClient` otherwise only reaches by spending a model call —
 * including "no places found", which `mvp-plan.md` calls the modal outcome of an import and which
 * the screenshot harness could not reach at all.
 *
 * A seam like this is only acceptable if it cannot exist in production, so that is what this file
 * asserts, from both directions: every input the parser honours in development returns `null` when
 * `NODE_ENV` is `production`, and the guard is not vacuous — the same inputs really do return a
 * screen otherwise. A guard that cannot be observed to bite is decoration.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES } from '@/domain/errors';
import { PRE_SUBMIT_ERROR_CODES } from '@/ui/import/import-error-copy';
import { isSaveable } from '@/domain/import/candidate-presentation';
import {
  arrivesTicked,
  resolutionView,
  resolverPinLine,
} from '@/ui/import/candidate-resolution-view';
import { devScreensEnabled, parseDevScreen } from '@/app/import/_lib/dev-screen';

/** Every `?state=` value the seam is meant to honour. */
const HONOURED = [
  'rail',
  'review',
  'no-places',
  ...DOMAIN_ERROR_CODES.map((code) => `error-${code}`),
  ...PRE_SUBMIT_ERROR_CODES.map((code) => `redirect-${code}`),
];

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function withNodeEnv(value: string, run: () => void) {
  // Assigned through the index signature: `NODE_ENV` is typed as a literal union and this is the
  // one place that needs to lie about it. Restored in `afterEach` as well, so a throwing
  // expectation cannot leak the value into the next file.
  (process.env as Record<string, string>)['NODE_ENV'] = value;
  run();
}

afterEach(() => {
  (process.env as Record<string, string>)['NODE_ENV'] = ORIGINAL_NODE_ENV ?? 'test';
});

describe('the seam is impossible in production', () => {
  it('returns null for every input it otherwise honours', () => {
    withNodeEnv('production', () => {
      expect(devScreensEnabled()).toBe(false);
      for (const state of HONOURED) {
        expect(parseDevScreen(state), state).toBeNull();
      }
    });
  });

  it('and the guard is not vacuous — the same inputs work outside production', () => {
    withNodeEnv('development', () => {
      expect(devScreensEnabled()).toBe(true);
      for (const state of HONOURED) {
        expect(parseDevScreen(state), state).not.toBeNull();
      }
    });
  });
});

describe('what it will and will not render', () => {
  it('reaches the three screens an import cannot be made to produce on demand', () => {
    withNodeEnv('development', () => {
      expect(parseDevScreen('rail')?.kind).toBe('rail');
      expect(parseDevScreen('review')?.kind).toBe('caption_preview');
      expect(parseDevScreen('no-places')?.kind).toBe('no_places');
    });
  });

  it('accepts only real codes, so a screenshot can never be of an invented error', () => {
    withNodeEnv('development', () => {
      expect(parseDevScreen('error-NOT_A_REAL_CODE')).toBeNull();
      expect(parseDevScreen('error-')).toBeNull();
      // `MALFORMED_URL` is a real `DomainErrorCode` but not a pre-submit one — it is inline field
      // copy, not a screen (`07` §9's F1-inline treatment).
      expect(parseDevScreen('redirect-MALFORMED_URL')).toBeNull();
      expect(parseDevScreen('anything-else')).toBeNull();
      expect(parseDevScreen('')).toBeNull();
      expect(parseDevScreen(null)).toBeNull();
      expect(parseDevScreen(undefined)).toBeNull();
    });
  });

  it('shows a review screen that exercises the hierarchy rather than one that looks tidy', () => {
    withNodeEnv('development', () => {
      const screen = parseDevScreen('review');
      expect(screen?.kind).toBe('caption_preview');
      if (screen?.kind !== 'caption_preview') return;
      const kinds = screen.probe.candidates.map((c) => c.resolution?.kind ?? 'none');
      // One matched, one ambiguous, and one the resolver never saw. The third is defect G5's card
      // and the one W6-4's provenance work is judged on; a fixture of three matched candidates
      // would photograph as a pass whatever the hierarchy did.
      expect(kinds).toEqual(['answered', 'answered', 'capped']);
    });
  });

  it('produces the three card states the gate is meant to judge, derived not asserted', () => {
    // The fixture is only useful if the *screen's own* logic reads it as three different cards.
    // Asserted through `resolutionView`/`arrivesTicked`/`resolverPinLine` — the same functions the
    // review screen calls — rather than by re-reading the fixture, so a fixture that silently
    // stopped exercising the hierarchy fails here instead of photographing as a pass.
    withNodeEnv('development', () => {
      const screen = parseDevScreen('review');
      if (screen?.kind !== 'caption_preview') throw new Error('expected the review screen');
      const views = screen.probe.candidates.map((c) => resolutionView(c.resolution));
      expect(views.map((v) => v.kind)).toEqual(['matched', 'ambiguous', 'capped']);

      const hasCoords = screen.probe.candidates.map(isSaveable);
      // Matched ticks; the capped one does not, which is the whole of defect G5 on screen.
      expect(views.map((v, i) => arrivesTicked(hasCoords[i]!, v))).toEqual([true, false, false]);
      // And the three pin lines are three different sentences.
      expect(views.map((v, i) => resolverPinLine(v, null, hasCoords[i]!))).toEqual([
        'Pin from the map data',
        'Waiting on your pick',
        'Pin from the caption. We didn’t check this one.',
      ]);
    });
  });

  it('invents no confidence number for the screenshot to assert', () => {
    withNodeEnv('development', () => {
      const screen = parseDevScreen('review');
      if (screen?.kind !== 'caption_preview') throw new Error('expected the review screen');
      for (const candidate of screen.probe.candidates) {
        expect(candidate.modelConfidence).toBeNull();
      }
    });
  });
});
