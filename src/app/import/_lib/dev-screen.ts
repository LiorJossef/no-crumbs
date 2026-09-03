'use client';

/**
 * A development-only way to render any screen of this flow directly, so the quality gates can
 * photograph it.
 *
 * **A client module, despite the `_lib` folder** — see `probe-contract.ts`'s header.
 *
 * ## Why it exists
 *
 * `ImportPageClient` holds every visual state in React and reaches each one only by running a real
 * import. The screenshot harness (`tests/harness/capture-screens.mjs`) therefore photographs an
 * empty paste field and nothing else: not the review screen, not the thirteen failure screens, and
 * **not "no places found", which `mvp-plan.md` calls the modal outcome of an import** and therefore
 * the surface the product most needs to be judged on. A gate that cannot see a screen cannot fail
 * it.
 *
 * ## Three rules it is built to obey
 *
 * **1. It is impossible in production.** `devScreen` returns `null` unless
 * `process.env.NODE_ENV !== 'production'`, and that is a static comparison the bundler folds at
 * build time — so in a production build the branch and the fixtures below are dead code and are
 * eliminated, rather than shipped-but-unreachable. The consequence is worth stating plainly: `next
 * build` pins `NODE_ENV=production`, so **the harness has to run the app in dev mode for this to
 * exist at all.** That is the guarantee working, not a gap in it.
 *
 * **2. It does not weaken or bypass a single real transition.** It is a *render-time override*, not
 * a state seed: `useImportRun`'s `screen` is untouched, `submit`, `reset` and the in-flight guard
 * never see it, and nothing here writes state. The component renders `devScreen ?? screen`, which
 * is one line and has no other effect.
 *
 * **3. It cannot become a second way to reach a screen a real user can reach.** It only fires on
 * the standalone `/import` route, never on the overlay the map mounts, and it is read once after
 * mount rather than tracked — so it cannot fight a transition, and a user who lands mid-flow is
 * not holding a URL that re-forces a screen.
 *
 * ## The vocabulary
 *
 * ```
 * /import?state=rail
 * /import?state=review
 * /import?state=review-one-option        a confirm band whose offerable list holds ONE row,
 *                                        with a model coordinate — feedback 6.1's card
 * /import?state=no-places                  case B, the modal arrival
 * /import?state=no-places-a                case A, no caption at all
 * /import?state=no-places-c                case C, an area but no venue
 * /import?state=review-added               every place on it already added from this video (H2-T1)
 * /import?state=review-added-one           the same, on the one-candidate post the 2026-08-29
 *                                          ruling was actually about — which also collapses
 * /import?state=no-places-added            case B on a video already added from (H2-T2)
 * /import?state=error-POST_UNAVAILABLE      any DomainErrorCode
 * /import?state=redirect-UNSUPPORTED_HOST   any PreSubmitErrorCode
 * ```
 *
 * The no-places screens are the ones this matters most for: they are ~73% of imports, and the
 * harness could not reach any of them. All three honest cases are here, because they are three
 * different true statements and each is judged separately.
 *
 * The fixtures below are the input to a *design* judgement, so they are shaped to exercise the
 * hierarchy rather than to look tidy: three candidates in three different resolution states — one
 * matched to map data, one ambiguous with a real shortlist, one past the cap that nobody looked up.
 * That last one is defect G5's card and the one W6-4's provenance work is judged on.
 */

import { useEffect, useState } from 'react';

import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@/domain/errors';
import { PRE_SUBMIT_ERROR_CODES, type PreSubmitErrorCode } from '@/ui/import/import-error-copy';

import type { RankedPlace } from '@/domain/types';

import type { ProbeCandidate, ProbeSuccess } from './probe-contract';
import { RAIL_IDLE, type Screen } from './screen';

/** The query parameter. One name, exported so the test and any harness can spell it once. */
export const DEV_SCREEN_PARAM = 'state';

/**
 * The whole guard, in one place and exported so a test can assert it rather than trust it.
 *
 * A literal comparison against `process.env.NODE_ENV`, because that is what the bundler can fold.
 * An indirection — a helper, a variable, a config lookup — would still be *correct* and would stop
 * the branch being eliminated, which is the difference between "unreachable" and "not shipped".
 */
export function devScreensEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function candidate(over: Partial<ProbeCandidate>): ProbeCandidate {
  return {
    rawName: 'HaKosem',
    cityHint: 'Tel Aviv',
    countryHint: 'IL',
    categoryHint: 'restaurant',
    addressHint: null,
    areaHint: null,
    evidence: null,
    modelConfidence: null,
    identifiedName: null,
    nameVariants: [],
    coordinates: { lat: 32.0755, lng: 34.7746 },
    tags: [],
    dishes: [],
    whyGo: null,
    resolution: null,
    ...over,
  };
}

function ranked(name: string, addressLine: string, providerPlaceId: string): RankedPlace {
  return {
    place: {
      provider: 'google' as const,
      providerPlaceId,
      sourceDataset: 'google-places' as const,
      regionId: null,
      name,
      altNames: [],
      providerCategory: 'restaurant',
      addressLine,
      locality: 'Tel Aviv-Yafo',
      lat: 32.0755,
      lng: 34.7746,
      datasetConfidence: 0.9,
    },
    score: 0.9,
    nameScore: 0.9,
    tokenCoverage: 1,
    categoryScore: 1 as const,
  };
}

const DEV_PROBE: ProbeSuccess = {
  sourceId: 'dev-source',
  extractionId: 'dev-extraction',
  authorHandle: 'demo',
  authorName: 'Demo',
  // Deliberately **not** a post URL. It is never visible in any of these screens — the link text
  // comes from `authorHandle` — and `seed-links.test.ts` bans a handle-and-video URL literal
  // anywhere in this directory, because that is how a "temporary" test link ends up shipped. An
  // obvious placeholder is the honest thing for a fixture anyway: nothing here should be
  // mistakable for a real post.
  canonicalUrl: 'https://www.tiktok.com/dev-screen-fixture',
  thumbnailUrl: null,
  caption: 'Three places worth the queue in Tel Aviv: HaKosem, Cafe Cafe, and Miznon.',
  candidates: [
    // Matched — the settled card. Its pin is the venue's own coordinate.
    candidate({
      // **Two tags, which is the real ceiling** — `normaliseTags` truncates every candidate to
      // `MAX_TAGS_PER_CANDIDATE` (2) before anything is stored, so a fixture with more would be
      // showing the gate a card the product cannot produce. Present at all because the row was
      // invisible to the harness while every fixture candidate carried none, and the tags this
      // card shows are the basis on which the confirm route stamps `tags_confirmed_at`.
      tags: ['middle eastern', 'brunch'],
      resolution: {
        kind: 'answered',
        result: {
          shortlist: [ranked('HaKosem', 'Shlomo HaMelech 1', 'g-hakosem')],
          confidence: { band: 'preselect', score: 0.94, margin: 0.3 },
          regionsSearched: ['tlv'],
          candidatesPrefiltered: 12,
        },
      },
    }),
    // Ambiguous — a real shortlist the margin cannot separate. The address is the whole answer.
    candidate({
      rawName: 'Cafe Cafe',
      coordinates: null,
      resolution: {
        kind: 'answered',
        result: {
          shortlist: [
            ranked('Cafe Cafe', 'Dizengoff 172', 'g-cafe-1'),
            ranked('Cafe Cafe', 'Rothschild 45', 'g-cafe-2'),
            ranked('Cafe Cafe', 'Ibn Gabirol 30', 'g-cafe-3'),
          ],
          confidence: { band: 'confirm', score: 0.71, margin: 0.02 },
          regionsSearched: ['tlv'],
          candidatesPrefiltered: 31,
        },
      },
    }),
    // Capped — past `MAX_CANDIDATES`, so nobody looked it up, and the model gave a coordinate.
    // This is defect G5's card and the one W1-4 changed; it must not arrive ticked.
    candidate({ rawName: 'Miznon', resolution: { kind: 'capped' } }),
  ],
};

/**
 * The two H2 states, which are the ones nobody had seen on a screen.
 *
 * Lane H's report said so outright: its notice, its card mark and the button state they produce
 * were asserted in source-text tests and never looked at. Reaching either one for real needs a
 * second import of a video you have already saved from, which the harness cannot stage — so the
 * fixture stages it instead, and one of the three names is Hebrew because half of this product's
 * place names are and the notice sets them in a comma-separated English sentence.
 *
 * `priorSaves` names all three candidates, so every card is marked and the review screen's primary
 * becomes the way back to the map rather than a dead `Select a place to save`.
 */
/**
 * Feedback 6.1 / 6.4's card, and the reason it is a fixture: **three of the owner's six failing
 * links land in this state and no other dev screen reaches it.**
 *
 * A `confirm`-band result whose offerable list holds exactly one row (`offerableShortlist` cuts to
 * the rows within `rivalScoreBand` of the top, so this is common, not exotic) *and* a model
 * coordinate. Before 2026-09-03 that card asked "Which one is it?" over a list of one while
 * arriving **pre-ticked on the model's own pin**, with the single unpicked provider row directly
 * above it. The two coordinates here are 2.7 km apart on purpose — the measured drift on `רגאצי`,
 * the owner's own example of one place saved twice.
 *
 * Reaching it for real costs a TikTok fetch, an LLM extraction and a Google Places lookup. The
 * fixture is what makes the screen judgeable without spending any of the three.
 */
const RAGAZZI_BASE = ranked('Ragazzi', 'אחוזה 100, רעננה', 'g-ragazzi');
/** The provider's row: 2.7 km from the model's pin above, which is the whole point of the fixture. */
const RAGAZZI_ROW: RankedPlace = {
  ...RAGAZZI_BASE,
  score: 0.78,
  place: { ...RAGAZZI_BASE.place, locality: 'רעננה', lat: 32.1611, lng: 34.8712 },
};

const ONE_OPTION_CANDIDATES: readonly ProbeCandidate[] = [
  candidate({
    rawName: 'רגאצי',
    cityHint: 'רעננה',
    // The model's own pin — what this card used to save silently.
    coordinates: { lat: 32.1848, lng: 34.8713 },
    resolution: {
      kind: 'answered',
      result: {
        shortlist: [RAGAZZI_ROW],
        confidence: { band: 'confirm', score: 0.78, margin: 0.04 },
        regionsSearched: ['tlv'],
        candidatesPrefiltered: 18,
      },
    },
  }),
  // Kept beside it so the screen can be judged on the contrast: real ambiguity, three rows, and it
  // must still ask "Which one is it?".
  DEV_PROBE.candidates[1]!,
];

const ALREADY_ADDED_CANDIDATES: readonly ProbeCandidate[] = [
  DEV_PROBE.candidates[0]!,
  candidate({ rawName: 'רגאצי', cityHint: 'רעננה' }),
  DEV_PROBE.candidates[2]!,
];

const DEV_PRIOR_SAVES = [
  { placeName: 'HaKosem', label: 'HaKosem' },
  { placeName: 'רגאצי', label: 'רגאצי' },
  { placeName: 'Miznon', label: 'Miznon' },
];

function isDomainErrorCode(value: string): value is DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(value);
}

function isPreSubmitErrorCode(value: string): value is PreSubmitErrorCode {
  return (PRE_SUBMIT_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The parser. `null` for anything it does not recognise, and `null` for **everything** in
 * production.
 *
 * Exported separately from the hook so the guard is testable without a DOM: the test sets
 * `process.env.NODE_ENV` and asserts this returns `null` for inputs it otherwise honours.
 */
export function parseDevScreen(raw: string | null | undefined): Screen | null {
  if (!devScreensEnabled()) return null;
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw === 'rail') {
    // The state W6-2 exists to make possible: the source stage genuinely settled, the post on
    // screen, and extraction still running underneath. The bare `source: 'active'` rail that
    // precedes it lasts about a second and has nothing on it to judge.
    return {
      kind: 'rail',
      rail: {
        ...RAIL_IDLE,
        source: 'done',
        sourceFact: 'Read @demo’s video',
        extract: 'active',
        post: DEV_PROBE,
      },
    };
  }
  if (raw === 'review') return { kind: 'caption_preview', probe: DEV_PROBE };
  // Feedback 6.1's card beside a genuinely ambiguous one — see `ONE_OPTION_CANDIDATES`.
  if (raw === 'review-one-option') {
    return {
      kind: 'caption_preview',
      probe: {
        ...DEV_PROBE,
        caption: 'רגאצי ברעננה, ואחר כך קפה קפה בתל אביב.',
        candidates: ONE_OPTION_CANDIDATES,
      },
    };
  }
  // H2-T1. Every candidate already on the map from this same video, so nothing arrives ticked and
  // the screen must say something true about why.
  if (raw === 'review-added') {
    return {
      kind: 'caption_preview',
      probe: { ...DEV_PROBE, candidates: ALREADY_ADDED_CANDIDATES, priorSaves: DEV_PRIOR_SAVES },
    };
  }
  // Case B, the modal arrival. `no-places-a` and `no-places-c` are the other two honest cases —
  // three screens, because they are three different true statements and the gate judges each.
  if (raw === 'no-places') return { kind: 'no_places', probe: { ...DEV_PROBE, emptyReason: 'nothing_named' } };
  // The single-candidate re-paste, which is the exact shape the owner rejected a global duplicate
  // check for on 2026-08-29: one place, already saved, nothing to do and no explanation. It also
  // takes the *collapsed* layout, which has no checkbox on it at all.
  if (raw === 'review-added-one') {
    return {
      kind: 'caption_preview',
      probe: {
        ...DEV_PROBE,
        candidates: [DEV_PROBE.candidates[0]!],
        priorSaves: [DEV_PRIOR_SAVES[0]!],
      },
    };
  }
  // H2-T2. The modal outcome, on a video this person has already added three places from.
  if (raw === 'no-places-added') {
    return {
      kind: 'no_places',
      probe: { ...DEV_PROBE, emptyReason: 'nothing_named', priorSaves: DEV_PRIOR_SAVES },
    };
  }
  if (raw === 'no-places-a') {
    return { kind: 'no_places', probe: { ...DEV_PROBE, caption: null, emptyReason: 'no_caption' } };
  }
  if (raw === 'no-places-c') {
    return {
      kind: 'no_places',
      probe: { ...DEV_PROBE, emptyReason: 'area_only', cityHint: 'Tel Aviv' },
    };
  }
  if (raw.startsWith('error-')) {
    const code = raw.slice('error-'.length);
    return isDomainErrorCode(code) ? { kind: 'probe_error', code, retryable: true } : null;
  }
  if (raw.startsWith('redirect-')) {
    const code = raw.slice('redirect-'.length);
    return isPreSubmitErrorCode(code) ? { kind: 'redirect', reason: code } : null;
  }
  return null;
}

/**
 * Reads the seam out of the address bar, once, after mount.
 *
 * `window.location.search` rather than `useSearchParams`, for a reason that is about this component
 * and not about the framework: `ImportPageClient` has **two** mount points, and the overlay one is
 * mounted by `/map`. `useSearchParams` would hand it `/map`'s query string, so `/map?state=review`
 * would force the overlay — a second way into a screen a real user reaches, which is exactly what
 * rule 3 above forbids. The pathname check is the guard, and reading `location` directly is what
 * makes it possible. Next 16.3.1's own guidance allows this outside render
 * (`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`).
 *
 * Read in an effect rather than a `useState` initialiser so the server and the first client render
 * agree; the override lands on the second paint, which is well inside what the harness waits for.
 */
export function useDevScreen(): Screen | null {
  const [devScreen, setDevScreen] = useState<Screen | null>(null);
  useEffect(() => {
    if (!devScreensEnabled()) return;
    // The overlay mount point is `/map`'s, and forcing a screen there would be a second way into a
    // screen a real user reaches. This check is why `window.location` is read directly rather than
    // through `useSearchParams`, which would hand this component `/map`'s query string.
    if (window.location.pathname !== '/import') return;
    const forced = parseDevScreen(new URLSearchParams(window.location.search).get(DEV_SCREEN_PARAM));
    if (forced === null) return;
    // Deferred a microtask rather than set straight, the same way the seed effect in
    // `use-import-run.ts` defers its submit: setting state synchronously in an effect body cascades
    // a render, and the lint rule that says so is right. Nothing observable moves.
    queueMicrotask(() => setDevScreen(forced));
  }, []);
  return devScreen;
}
