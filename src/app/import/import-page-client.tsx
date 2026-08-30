'use client';

/**
 * S6 `/import` — the paste screen, the three-stage rail, the no-places screen (a success state,
 * never an error), the results/review screen, and the non-TikTok redirect. `docs/mvp-plan.md` §5
 * (L0-F1-T1/T2/T3) and `docs/execution-plan.md` L1-F2-T1/T2 spec this surface; copy strings are
 * `docs/ux-architecture.md` §12.1's deck (C01–C22), quoted verbatim.
 *
 * The real flow: `submit()` calls `POST /api/imports/probe` (real oEmbed fetch + caption
 * extraction + `PlaceExtractor` + the real `PlaceResolver` — see that route's header) and lands on
 * `caption_preview`; "Done" there calls `POST /api/imports/confirm` via `saveExtractedCandidates`.
 * Each candidate arrives with the resolver's stored shortlist attached, and the review screen's
 * picker (`ui/import/candidate-resolution-view.ts`) is how a `confirm`-band candidate gets an
 * answer — without it, that whole band silently saved the model's guessed coordinate.
 * `NoPlacesScreen` is where a zero-candidate import lands, and at LEVEL B’s hit rate that is
 * the *modal* outcome of this flow rather than an edge case — `submit()` routes to it directly.
 * A second, competing candidate design sat unreachable beside it here — the `results` `Screen`
 * kind, `ResultsScreen`, `CandidateRow`, and a `saveConfirmedCandidates` that posted place
 * facts rather than positions — kept for a streaming route that never came. It was deleted on
 * 2026-08-31 rather than carried into the decomposition, where it would have been a second
 * answer to every question about how a candidate is confirmed.
 *
 * The one piece of real domain logic wired up live beyond the above is `canonicaliseTikTokUrl`
 * (`domain/source/canonicalise-tiktok-url.ts`) against the pasted string, so the paste screen's
 * validation and the non-TikTok redirect are the real classification, not a stub.
 *
 * The paste screen also offers two or three tappable seed links (`ui/import/seed-links.ts`) for a
 * user who has nothing to paste. A seed is not a demo path: `submitSeed` fills the field and calls
 * the same `submit`, so it runs the same route, the same model call and the same review-and-confirm
 * step, and a dead seed lands on the ordinary failure screen. Nothing fires without a tap.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { decideCaptionSaveOutcome } from '@/domain/import/caption-save-outcome';
import { IMPORT_ERROR_COPY, toDomainErrorCode, type PreSubmitErrorCode } from '@/ui/import/import-error-copy';

import type { ProbeErrorBody, ProbeSuccess } from './_lib/probe-contract';
import { RAIL_IDLE, type Screen } from './_lib/screen';
import { PasteScreen } from './screens/paste-screen';
import { RailScreen } from './screens/rail-screen';
import { NoPlacesScreen } from './screens/no-places-screen';
import { ImportFailureScreen } from './screens/failure-screen';
import { CaptionPreviewScreen } from './screens/review/review-screen';
import {
  saveExtractedCandidates,
  type CandidatePick,
  type ItemStatus,
  type SaveOutcomeDetail,
} from './_lib/save-extracted-candidates';

/**
 * Re-exported from where they now live (`_lib/save-extracted-candidates.ts`).
 *
 * `map-page-client.tsx` imports `SaveOutcomeDetail` from *this* module's path, and two tests pin
 * that path as well (`tests/unit/nav/bottom-nav-import-boundary.test.ts`). `ItemStatus` and
 * `CandidatePick` have no external importer today and are re-exported anyway: they are the
 * documented outcome vocabulary, and quietly dropping a public export is a contract change W6-1
 * has no mandate for.
 */
export type { CandidatePick, ItemStatus, SaveOutcomeDetail };

/* ------------------------------------------------------------------------------------------- *
 * Component
 * ------------------------------------------------------------------------------------------- */

export interface ImportPageClientProps {
  /** Set when this component is rendered as an overlay on top of the persistent map
   *  (`map-page-client.tsx`'s "Add a TikTok" flow) rather than mounted at the standalone `/import`
   *  route. Swaps the full-viewport (`min-h-dvh`) shell for one that fills its (absolutely
   *  positioned) overlay container instead, and swaps the close affordance from a real navigation
   *  (`<Link href="/map">`, which would unmount the map) to a plain state-closer. Omitting this
   *  prop preserves the standalone route's exact behaviour — direct navigation and a mid-import
   *  refresh still land on this same component via `/import`'s page. */
  readonly onClose?: () => void;
  /** Called once, just before this overlay closes, when a "Done" actually saved something. The
   *  map owner (`map-page-client.tsx`) uses it to frame the new pins and confirm the save. */
  readonly onSaved?: (detail: SaveOutcomeDetail) => void;
  /**
   * A link the user has **already submitted** somewhere else. Passing it runs the import.
   *
   * The `＋` sheet has its own field, and reaching this overlay from it used to drop what was in
   * it — the user pasted a TikTok link, pressed the button named after it, and landed on an empty
   * paste screen being asked for the same link again. Then it carried the link but still waited on
   * a second button, also called `Add`, for the same intent: two taps named the same thing, and
   * the overlay's own comment blamed a prop that by then existed.
   *
   * **The contract, and it is load-bearing: only pass this for a link the user pressed a submit
   * button on.** It costs one model call against a hard daily budget the moment this mounts, so it
   * is not "prefill the field" — `AddSheetHost.onSubmitTikTok` is the only caller and it fires
   * only on that press. Seeded as `touched` too, so a seeded link that turns out to be invalid
   * says so immediately rather than waiting for a first edit.
   */
  readonly initialUrl?: string;
  /**
   * Opens the host's manual-add surface (the `＋` sheet, `components/add/add-sheet-host.tsx`).
   *
   * `NoPlacesScreen` is the **modal** outcome of an import at LEVEL B's hit rate, and without this
   * it is a dead end: the user watched a video, knows the place, and the screen can only offer
   * them another link. Pass it wherever that sheet exists — the host closes this overlay and opens
   * it. Omitting it is not a degradation to hide but the honest state of a surface that has no
   * manual add to reach (the standalone `/import` route), and the screen renders accordingly
   * rather than showing a button that goes nowhere. That is the defect
   * `tests/unit/import/import-error-copy.test.ts` guards: `Add manually →`, wired to `reset()`.
   */
  readonly onAddManually?: () => void;
}

export function ImportPageClient({
  onClose,
  onSaved,
  initialUrl,
  onAddManually,
}: ImportPageClientProps = {}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: 'paste' });
  const [url, setUrl] = useState(initialUrl ?? '');
  const [touched, setTouched] = useState(initialUrl !== undefined);
  /**
   * The browser said the radio was off when `submit()` ran, so no request was made.
   *
   * Inline under the field rather than a failure screen, and deliberately not a `DomainErrorCode`:
   * nothing was sent, so there is no `DomainError` to render and the nearest code — `INTERNAL`,
   * "that didn't work on our side" — would blame us for the user's connection. Cleared at the top
   * of every submit, so the message only ever describes the attempt the user just made.
   */
  const [offline, setOffline] = useState(false);
  /** The caption-preview screen's own save-in-flight state (the real "Done" path, this task).
   *  Kept out of `Screen` itself: a save failure re-shows the *same* `caption_preview` screen with
   *  an inline error, never a screen transition — `Screen`'s union is about which layout renders,
   *  not this one screen's transient network state. */
  const [captionSave, setCaptionSave] = useState<{
    readonly saving: boolean;
    readonly error: string | null;
    /** Set only for `partial_failure` (some candidates saved, some didn't) — the screen stays put
     *  with this notice and an explicit "Continue to map" action rather than auto-navigating, so
     *  the which/how-many-failed message is never lost to an immediate unmount. */
    readonly partialNotice: string | null;
    /** Set alongside `partialNotice`: which card ended up where, so "2 couldn't be saved" can be
     *  read off the list instead of leaving the user to guess which two. */
    readonly statusByIndex: ReadonlyMap<number, ItemStatus> | null;
  }>({
    saving: false,
    error: null,
    partialNotice: null,
    statusByIndex: null,
  });

  /** The last save's detail, kept so `continueAfterPartialSave` — which runs on a *later* click,
   *  after the message has been read — can still tell the map what landed. */
  const lastSaveDetail = useRef<SaveOutcomeDetail | null>(null);

  const validation = useMemo(() => canonicaliseTikTokUrl(url), [url]);
  /**
   * Which of the canonicaliser's four verdicts the pasted string got, or `null` if it is valid.
   *
   * `07` §9 splits these two ways and the screen must too: **`MALFORMED_URL` alone** is F1 inline
   * field copy (C06, "That doesn't look like a TikTok link."); `UNSUPPORTED_HOST`,
   * `UNSUPPORTED_URL` each get their own screen, because they are *recognised*
   * links carrying different news.
   *
   * This used to be one boolean, and it produced two bugs at once. `canSubmit` required
   * `validation.ok`, so the `Add →` button was **disabled** for all four verdicts — which made
   * `submit()`'s entire redirect branch dead code, and with it the three pre-submit screens. And
   * `showInvalid` fired on all four, so pasting an Instagram link, a TikTok profile link or a
   * photo post put "That doesn't look like a TikTok link." under the field. An Instagram URL does
   * look like a link, and a TikTok profile URL is unambiguously a TikTok link; C06 is the one
   * sentence that is false for every one of those three.
   */
  const invalidCode = validation.ok ? null : validation.error.code;
  const showInvalid = touched && url.trim().length > 0 && invalidCode === 'MALFORMED_URL';
  // Anything non-empty may be submitted. `submit()` already routes all four verdicts correctly —
  // inline for `MALFORMED_URL`, a screen for the other three, the network for a valid link.
  const canSubmit = url.trim().length > 0;

  /**
   * The probe request currently in flight, or `null`. A ref rather than state, and it does three
   * jobs that all turned out to be the same bug:
   *
   *  - **`Cancel` actually cancels.** `RailScreen`'s `Cancel` was `reset()`, which cleared the
   *    field and went back to paste while the request carried on running. It then resolved and
   *    took the screen — a `1 place found` review for an import the user had already abandoned,
   *    or a failure screen for one they no longer cared about.
   *  - **A response that lost its race is not news.** Every `setScreen` below is now gated on this
   *    ref still pointing at *this* request. Cancel, then paste an Instagram link: the correct
   *    "That link isn't a TikTok." screen used to be replaced a second later by the previous
   *    TikTok's results.
   *  - **One paste costs at most one request.** Set synchronously, before the first `await`, so a
   *    burst of clicks dispatched inside a single task — which `Add →` and `Retry` were both
   *    reachable by — finds it non-null and returns. A rendering accident (the paste screen
   *    unmounting) was the only thing stopping a second fire before, and this route spends a model
   *    call against a hard 500/day ceiling.
   *
   * Deliberately a guard that *refuses* a concurrent submit rather than one that aborts the
   * previous and starts a new one: five clicks would still dispatch five requests that way, four
   * of them cancelled server-side too late to matter.
   */
  const inFlightProbe = useRef<AbortController | null>(null);

  /** Cancels the probe request, if any, and gives up ownership of the screen for it. Both halves
   *  matter: the abort stops the work, and clearing the ref is what makes the in-flight handlers
   *  below fall through without setting state. */
  function abortInFlightProbe() {
    inFlightProbe.current?.abort();
    inFlightProbe.current = null;
  }

  /**
   * Back to the paste screen, keeping the link unless the caller says it is finished with it.
   *
   * Clearing unconditionally made `Cancel` a punishment: the link lives in TikTok, not in the
   * browser, so a user who cancelled a slow import had to leave the product, reopen the post and
   * copy the link again to try the same thing twice. Nothing about cancelling says the link was
   * wrong, so `Cancel` keeps it.
   *
   * `clearUrl` marks the callers for which the link genuinely is spent, and they divide by what the
   * action *claims*, not by whether it succeeded:
   *  - a completed save — leaving it invites re-importing a post already in the library;
   *  - `Try another`, which promises another. A failure screen offers `Try the same one again`
   *    beside it, so returning both of them to a field still holding the old link makes the two
   *    buttons do the same thing, and on `no_places` it re-runs the read that just found nothing.
   */
  function reset(options?: { readonly clearUrl?: boolean }) {
    abortInFlightProbe();
    setScreen({ kind: 'paste' });
    if (options?.clearUrl) setUrl('');
    setTouched(false);
    setCaptionSave({ saving: false, error: null, partialNotice: null, statusByIndex: null });
  }

  /**
   * Run the import for `target`, defaulting to whatever is in the field.
   *
   * The parameter exists for exactly one caller — `submitSeed` below — and it is a parameter
   * rather than a second function because a seed must not get its own code path. `setUrl(seed)`
   * lands a render too late to be read out of state here, so the URL is passed in; everything
   * downstream (validation, the request body, the rail, the review screen, every failure screen,
   * `Retry`, `Open the TikTok`) is the same code reading the same state a paste produces.
   *
   * Deliberately **not** bound straight to a button's `onClick`: with a defaulted first parameter
   * that would pass a `MouseEvent` as `target`, and TypeScript would not catch it through a
   * `() => void` prop. Call sites pass nothing explicitly or go through `submitSeed`.
   */
  async function submit(target: string = url) {
    setTouched(true);
    setOffline(false);
    // Re-derived from `target` rather than read off the `validation` memo, which is bound to the
    // field's current value — one render behind on a seed tap.
    const verdict = canonicaliseTikTokUrl(target);
    if (!verdict.ok) {
      // UNSUPPORTED_HOST/UNSUPPORTED_URL are both "a recognised link, not a failure" —
      // their own screen, sharing the server's copy for the same verdict. MALFORMED_URL stays on
      // the paste screen: `setTouched(true)` above is what reveals C06 under the field, which is
      // `07` §9's F1-inline treatment and the only code that gets it.
      if (verdict.error.code !== 'MALFORMED_URL') {
        setScreen({ kind: 'redirect', reason: verdict.error.code as PreSubmitErrorCode });
      }
      return;
    }

    // Offline, checked here rather than before the verdict above: a malformed link is malformed
    // whether or not there is a connection, and this is the first step that actually needs one.
    // Running the rail instead lands on `INTERNAL` — a claim about our servers, made about a
    // request that never left the device.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true);
      return;
    }

    // A real TikTok link: `/api/imports/probe` is one round trip that now runs the real oEmbed
    // fetch, the real caption extraction *and* the real `PlaceExtractor` call before it responds
    // (`route.ts`'s header) — there is no server-sent boundary between "source done" and
    // "extraction started". oEmbed + caption parsing is sub-second next to a real local-model
    // call (7-34s measured), so the honest approximation is: show `source` active for the
    // request's very first tick, then flip to `source: done, extract: active` right after the
    // fetch is *issued* (not after it resolves) — the rail's `extract` step then genuinely spans
    // the real, multi-second wall-clock time the request is in flight, rather than flashing for
    // 0ms after the response already arrived.
    // The in-flight guard. Synchronous, and ahead of every `await` in this function, so a second
    // call dispatched in the same task sees it — see `inFlightProbe`.
    if (inFlightProbe.current !== null) return;
    const probe = new AbortController();
    inFlightProbe.current = probe;

    /** Is this call still the one that owns the screen? False after a `Cancel` (which aborts and
     *  clears the ref) and after any later submit took over. A response that lost its race must
     *  set no state at all — not a screen, not an error. */
    const stillCurrent = () => inFlightProbe.current === probe;

    setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } });

    try {
      const fetchPromise = fetch('/api/imports/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
        signal: probe.signal,
      });

      setScreen({
        kind: 'rail',
        rail: { ...RAIL_IDLE, source: 'done', sourceFact: 'Read the TikTok', extract: 'active' },
      });

      const res = await fetchPromise;
      const body = (await res.json()) as ProbeSuccess | ProbeErrorBody;
      if (!stillCurrent()) return;

      if (!res.ok || 'error' in body) {
        const rawCode = 'error' in body ? body.error.code : 'INTERNAL';
        const retryable = 'error' in body ? body.error.retryable : true;
        setScreen({ kind: 'probe_error', code: toDomainErrorCode(rawCode), rawCode, retryable });
        return;
      }

      const n = body.candidates.length;
      setScreen({
        kind: 'rail',
        rail: {
          ...RAIL_IDLE,
          source: 'done',
          sourceFact: body.authorHandle ? `Read @${body.authorHandle}'s TikTok` : 'Read the TikTok',
          extract: 'done',
          extractFact: n === 0 ? 'No places named' : n === 1 ? '1 place found' : `${n} places found`,
        },
      });
      // The modal outcome of an import gets its own screen. It had one all along — `NoPlacesScreen`
      // was written, reviewed and never constructed, so every zero-candidate import fell through to
      // the review screen and rendered a source row, one muted sentence and a half-empty card. At
      // LEVEL B's hit rate that is the screen most imports end on.
      setScreen(
        n === 0
          ? {
              kind: 'no_places',
              authorHandle: body.authorHandle,
              canonicalUrl: body.canonicalUrl,
              hadCaption: body.caption !== null,
            }
          : { kind: 'caption_preview', probe: body },
      );
    } catch {
      // A user pressing Cancel is not an internal error. An abort lands here as a DOMException,
      // and so does any response that arrived after this call stopped owning the screen — both
      // are `!stillCurrent()`, and both must leave the screen exactly as the user left it.
      if (!stillCurrent()) return;
      // The network layer failed before any `DomainError` existed — no code came off the wire, so
      // `INTERNAL` is ours to assert (`07` §9's floor), not a fallback for an unrecognised code.
      setScreen({ kind: 'probe_error', code: 'INTERNAL', rawCode: 'INTERNAL', retryable: true });
    } finally {
      // Only if we still own it: a `Cancel` or a later submit has already replaced the ref, and
      // clearing it here would unlock a guard that is legitimately held by someone else.
      if (stillCurrent()) inFlightProbe.current = null;
    }
  }

  /**
   * A tap on one of the paste screen's seed suggestions (`ui/import/seed-links.ts`).
   *
   * Three lines, and all three matter. `setUrl` puts the seed in the field so every screen after
   * this one behaves as if it had been pasted — `Retry` re-runs it, `Open the TikTok` opens it,
   * the review screen's source row points at it. `setTouched` matches what a real paste-and-submit
   * leaves behind. Then the ordinary `submit`: same route, same model call, same review-and-confirm
   * step. **A seed never writes a place without the user confirming**, because there is no seed
   * branch in which it could.
   *
   * Fires on the gesture and only on the gesture — no prefetch, no warm-up, nothing on mount. Each
   * uncached tap is one Gemini call against a hard 500/day budget.
   */
  function submitSeed(seedUrl: string) {
    setUrl(seedUrl);
    setTouched(true);
    void submit(seedUrl);
  }

  /**
   * A link that arrived already submitted runs itself, so `Add this TikTok` is the only `Add`.
   *
   * `inFlightProbe` already refuses a *concurrent* second call, but it is cleared when the first
   * finishes — it cannot stop a re-mount from spending a second model call minutes later. This ref
   * is the once-ever guard, and it is deliberately not in the dependency array: `initialUrl` is the
   * link the user pressed a button on, and re-running for a new value would be a submit they never
   * made.
   */
  const seedSubmitted = useRef(false);
  useEffect(() => {
    if (seedSubmitted.current) return;
    const seed = initialUrl?.trim() ?? '';
    if (seed === '') return;
    seedSubmitted.current = true;
    // Deferred a microtask rather than called straight: `submit` sets `touched`/`offline`
    // synchronously before its first await, and setting state inside an effect body cascades a
    // render. Nothing observable moves — the request is issued in the same frame either way.
    queueMicrotask(() => void submit(seed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  /** After a successful (or nothing-to-save) "Done": land on/near the map with the save visible.
   *  `router.refresh()` re-runs `MapPage`'s server component and its `getSpots()` query — the
   *  overlay case (`onClose` set) is already mounted on `/map`, so refreshing *is* how the newly
   *  saved place reaches `MapPageClient`'s props; the standalone `/import` route case additionally
   *  needs the navigation itself. Doing both, in both cases, is cheap and avoids depending on
   *  which one this render happens to be. */
  function backToMapWithFreshData(detail: SaveOutcomeDetail | null) {
    // Handed up *before* the overlay unmounts, so the map can frame the new pins and say what
    // landed. Without this the import was invisible: eight London places saved into a Tel Aviv
    // library left the camera untouched and nothing on screen to say the save had happened.
    if (detail && detail.saved > 0) onSaved?.(detail);
    if (onClose) {
      router.refresh();
      onClose();
    } else {
      router.push('/map');
      router.refresh();
    }
  }

  /** Leaving the flow with nothing to save — the failure screens' way out. Same two cases as
   *  `backToMapWithFreshData` (overlay closes in place, standalone route navigates), without the
   *  `router.refresh()`: no save happened, so there is no new server data to pull. */
  function backToMap() {
    leaveImport();
  }

  /**
   * Every way out of this flow that is not `reset()`: the overlay's ✕ and the failure screens'
   * `Back to the map`. It aborts first, for the same reason `Cancel` does — the ✕ is reachable
   * during the rail, and an overlay that unmounts while its request is still running leaves that
   * request to resolve into a component that is no longer on screen.
   */
  function leaveImport() {
    abortInFlightProbe();
    if (onClose) onClose();
    else router.push('/map');
  }

  /**
   * `decideCaptionSaveOutcome` (`domain/import/caption-save-outcome.ts`) turns the raw
   * `{ saved, skipped, failed }` counts into exactly one disposition — see that module's header
   * for why all four cases exist and what each one covers. `partial_failure` deliberately does
   * *not* navigate here: some of the save is real, persisted data, and the failed count would be
   * lost the instant this screen unmounts, so it stays put with `continueAfterPartialSave` as the
   * explicit next step, mirroring the same on-screen-with-a-message pattern `hard_failure` (and,
   * before this fix, only `hard_failure`) already used.
   */
  async function finishCaptionPreview(
    picks: readonly CandidatePick[],
    extractionId: string | null,
  ) {
    setCaptionSave({ saving: true, error: null, partialNotice: null, statusByIndex: null });
    try {
      const result = await saveExtractedCandidates(picks, extractionId);
      lastSaveDetail.current = result;
      const outcome = decideCaptionSaveOutcome(result);
      switch (outcome.kind) {
        case 'proceed':
          backToMapWithFreshData(result);
          reset({ clearUrl: true });
          return;
        case 'skip_only':
        case 'hard_failure':
          setCaptionSave({ saving: false, error: outcome.message, partialNotice: null, statusByIndex: null });
          return;
        case 'partial_failure':
          setCaptionSave({
            saving: false,
            error: null,
            partialNotice: outcome.message,
            statusByIndex: result.statusByIndex,
          });
          return;
      }
    } catch {
      setCaptionSave({
        saving: false,
        error: "Couldn't save that place — try again.",
        partialNotice: null,
        statusByIndex: null,
      });
    }
  }

  /** The explicit "Continue to map" action shown only after a `partial_failure` — the successful
   *  saves are real, so this proceeds exactly like a clean success once the user has seen the
   *  which/how-many-failed message. */
  function continueAfterPartialSave() {
    backToMapWithFreshData(lastSaveDetail.current);
    reset({ clearUrl: true });
  }

  return (
    <main
      className={cn(
        'relative flex w-full flex-col overflow-hidden',
        // z-50: above `PlaceSheet`'s vaul-portaled drawer (`z-40`, appended to `document.body`
        // after this tree, so it would otherwise paint on top of an equal z-index regardless of
        // JSX order) and above `PlaceDesktopPanel` (`z-20`) — the overlay must win the stack on
        // both surfaces, not just the one that happens to share DOM order with it.
        // `h-dvh`, not `min-h-dvh`, on the standalone route too: the review screen keeps its
        // primary action in a footer pinned to the bottom of this column, and a column that grows
        // with its content pushes that action off the bottom of a phone. A bounded height makes
        // the candidate list the only scrolling region, which is the whole point of the layout.
        onClose ? 'absolute inset-0 z-50 h-full' : 'h-dvh',
        // Desktop (`lg+`) in overlay mode: this is no longer a right-docked full-height panel —
        // it is a dimming scrim over the *whole* viewport (map + the always-visible places list
        // both read as backgrounded context) with a single centred, capped-height card floating
        // on top. `<main>` itself becomes the flex-centring context and the scrim; the inner div
        // below is the card. Mobile is untouched — these are all `lg:` additions.
        onClose && 'lg:flex lg:items-center lg:justify-center lg:overflow-y-auto lg:bg-foreground/35 lg:p-10 lg:backdrop-blur-[2px]',
      )}
    >
      {/* The gradient backdrop, split out from `<main>` itself: at `lg+` in overlay mode
          (`onClose` set), this must NOT paint over the whole viewport, or it hides the live map
          this screen is supposed to float over. Hidden at `lg:` only when `onClose` (overlay) —
          `<main>` supplies its own dim scrim above instead. The mobile takeover and the standalone
          `/import` route (no map behind it, `onClose` unset) keep the full-bleed gradient. */}
      <div
        aria-hidden
        className={cn('absolute inset-0 -z-10', onClose && 'lg:hidden')}
        // `--brand-wash` (globals.css) rather than the gradient literal that used to be inlined
        // here. It was byte-identical to sign-in's and to the landing page's; three copies of one
        // surface decision is three places to miss when the dark-mode repass lands.
        style={{ background: 'var(--brand-wash)' }}
      />
      {/* Failure replaces the whole screen with news the user did not ask for. Announced the way
          `/map` already announces its filtered result count (`useResultAnnouncement` → one
          `sr-only` polite region): rendered here, once, and always mounted — a live region created
          in the same commit as its first message is not reliably announced. It carries the body
          sentence only; the headline is read by the focus move onto it inside
          `ImportFailureScreen`, so nothing is said twice.

          Both failure screens, not just the async one: the pre-submit redirect swaps the page just
          as completely, and a screen-reader user got nothing at all from it before. */}
      <p role="status" aria-live="polite" className="sr-only">
        {screen.kind === 'probe_error' || screen.kind === 'redirect'
          ? IMPORT_ERROR_COPY[screen.kind === 'probe_error' ? screen.code : screen.reason].body
          : ''}
      </p>
      <div
        className={cn(
          // Mobile: full-bleed thumb-zone column, unchanged.
          // `min-h-0` is load-bearing: without it this flex child refuses to shrink below its
          // content, so the inner `overflow-y-auto` list never scrolls and the footer is pushed
          // off the bottom of the viewport instead.
          'relative z-10 mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          // Desktop (`lg+`), overlay mode only (`onClose` set — the map's "Add a TikTok" flow): a
          // floating card centred over the dimmed map + list, not a docked panel — fixed width,
          // capped height with its own scroll (so a future 3-stage rail grows the card rather than
          // forcing full-viewport height), rounded corners on all sides, hairline border + elevation.
          onClose &&
            'lg:relative lg:mx-0 lg:my-0 lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-[min(52rem,calc(100vh-4rem))] lg:justify-start lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-10 lg:shadow-[var(--shadow-elevated)]',
          // Desktop (`lg+`), standalone `/import` route (`onClose` unset — no map behind it).
          //
          // This used to be a flush right-docked, full-height panel, and with no map behind it that
          // left the other two thirds of a 1280px screen as an empty wash — the emptiest surface in
          // the product, on a screen whose whole content is one input. It is now the same centred
          // card the overlay uses, so the two ways into this flow look like one flow.
          !onClose &&
            'lg:relative lg:my-auto lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-[min(52rem,calc(100vh-4rem))] lg:justify-start lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-10 lg:shadow-[var(--shadow-elevated)]',
        )}
      >
        {onClose ? (
          <button
            type="button"
            onClick={leaveImport}
            aria-label="Close and return to map"
            className="absolute left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-9 items-center justify-center rounded-full bg-accent text-brand transition-colors hover:bg-accent/80 lg:left-6 lg:top-6"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <Link
            href="/map"
            aria-label="Close and return to map"
            className="absolute left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-9 items-center justify-center rounded-full bg-accent text-brand transition-colors hover:bg-accent/80 lg:left-6 lg:top-6"
          >
            <X className="size-4" aria-hidden />
          </Link>
        )}
        {/* Clearance below the close button, not just a same-height spacer: at `h-9` (36px) this
            div was exactly the button's own height (`size-9`), so the heading that follows sat
            flush against the button's bottom edge with zero gap. `h-14` (56px) leaves ~20px of
            breathing room between the button and the kicker/heading below it, on both widths. */}
        <div className="h-14 shrink-0" aria-hidden />

        {screen.kind === 'paste' && (
          <PasteScreen
            url={url}
            setUrl={setUrl}
            setTouched={setTouched}
            showInvalid={showInvalid}
            showOffline={offline}
            canSubmit={canSubmit}
            // Wrapped, never `onSubmit={submit}`: `submit`'s first parameter is the URL, and a
            // bare handler would receive React's `MouseEvent` as it. The `() => void` prop type
            // hides that from the compiler, so the wrapper is the guard.
            onSubmit={() => void submit()}
            onSeed={submitSeed}
          />
        )}

        {screen.kind === 'redirect' && (
          // Same component, same words, one difference that is real: nothing was sent, so there is
          // no server-side record for a `Reference:` line to point at, and there is nothing to
          // retry (`importErrorActions` withholds `retry` on all three of these codes anyway).
          <ImportFailureScreen
            code={screen.reason}
            rawCode={null}
            retryable={false}
            url={url}
            onRetrySameUrl={() => void submit()}
            onTryAnother={() => reset({ clearUrl: true })}
            onBackToMap={backToMap}
            onSignIn={() => router.push('/sign-in')}
          />
        )}

        {screen.kind === 'rail' && (
          <RailScreen rail={screen.rail} onCancel={() => reset()} />
        )}

        {screen.kind === 'no_places' && (
          <NoPlacesScreen
            authorHandle={screen.authorHandle}
            url={screen.canonicalUrl}
            hadCaption={screen.hadCaption}
            onRetry={() => reset({ clearUrl: true })}
            onAddManually={onAddManually ?? null}
          />
        )}

        {screen.kind === 'caption_preview' && (
          <CaptionPreviewScreen
            probe={screen.probe}
            saving={captionSave.saving}
            error={captionSave.error}
            partialNotice={captionSave.partialNotice}
            statusByIndex={captionSave.statusByIndex}
            onSave={(picks) => finishCaptionPreview(picks, screen.probe.extractionId)}
            onRetry={() => reset({ clearUrl: true })}
            onContinue={continueAfterPartialSave}
          />
        )}

        {screen.kind === 'probe_error' && (
          <ImportFailureScreen
            code={screen.code}
            rawCode={screen.rawCode}
            retryable={screen.retryable}
            url={url}
            onRetrySameUrl={() => void submit()}
            onTryAnother={() => reset({ clearUrl: true })}
            onBackToMap={backToMap}
            onSignIn={() => router.push('/sign-in')}
          />
        )}
      </div>
    </main>
  );
}
