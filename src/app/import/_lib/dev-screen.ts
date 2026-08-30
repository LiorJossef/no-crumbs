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
 * empty paste field and nothing else: not the review screen, not the fourteen failure screens, and
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
 * /import?state=no-places
 * /import?state=error-POST_UNAVAILABLE      any DomainErrorCode
 * /import?state=redirect-UNSUPPORTED_HOST   any PreSubmitErrorCode
 * ```
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
    return {
      kind: 'rail',
      rail: { ...RAIL_IDLE, source: 'done', sourceFact: 'Read @demo’s TikTok', extract: 'active' },
    };
  }
  if (raw === 'review') return { kind: 'caption_preview', probe: DEV_PROBE };
  if (raw === 'no-places') {
    return {
      kind: 'no_places',
      authorHandle: DEV_PROBE.authorHandle,
      canonicalUrl: DEV_PROBE.canonicalUrl,
      hadCaption: true,
    };
  }
  if (raw.startsWith('error-')) {
    const code = raw.slice('error-'.length);
    // `rawCode` is the same string rather than a fabricated support reference: this screen never
    // made a request, so there is no server-side record for a `Reference:` line to point at, and
    // inventing one would be the screenshot asserting something the product cannot.
    return isDomainErrorCode(code)
      ? { kind: 'probe_error', code, rawCode: code, retryable: true }
      : null;
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
