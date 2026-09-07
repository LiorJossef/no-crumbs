'use client';

/**
 * S6 `/import` — **the shell**. It holds the props, the save, and the router; every beat of the
 * flow is a file beside it. `docs/mvp-plan.md` §5 (L0-F1-T1/T2/T3) and `docs/execution-plan.md`
 * L1-F2-T1/T2 spec this surface; copy strings are `docs/ux-architecture.md` §12.1's deck
 * (C01–C22), quoted verbatim.
 *
 * ## The tree, and which package edits which file
 *
 * ```
 * import-page-client.tsx     this file — props, the save, the screen router
 * _lib/
 *   probe-contract.ts        the `/api/imports/probe` wire shape          · W6-2
 *   screen.ts                the `Screen` union, `RailState`, `RAIL_IDLE` · W6-2 W6-3 W6-5
 *   use-import-run.ts        url + screen + submit + abort + reset        · W6-2 W6-3
 *   save-extracted-candidates.ts   the confirm request and its vocabulary
 * screens/
 *   import-shell.tsx         the wash, the card, the ✕, the live region
 *   screen-kicker.tsx        the kicker every screen wears
 *   paste-screen.tsx         F0/F1
 *   rail-screen.tsx          F2-F5                                        · W6-2
 *   no-places-screen.tsx     the modal outcome                            · W6-5
 *   failure-screen.tsx       every `DomainErrorCode`, one layout
 *   review/review-screen.tsx the review beat
 *   review/candidate-card.tsx  one candidate, as a decision               · W6-4
 * ```
 *
 * Split out of one 2,482-line file on 2026-08-31 (W6-1,
 * `docs/archive/overnight-import-decomposition.md`). **The router below stays inline JSX** — seven sibling
 * `&&` blocks, no `key`, no `screensByKind` map and no component defined inside this render. A
 * `key` on a router wrapper remounts the review screen on every transition and silently discards
 * every tick and every shortlist pick the user made; a map would need ~25 drilled props and buy
 * nothing. Routing *is* this file's job.
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
 * validation and the non-TikTok redirect are the real classification, not a stub. It now runs
 * inside `_lib/use-import-run.ts`, with the rest of the run.
 *
 * The paste screen also offers two or three tappable seed links (`ui/import/seed-links.ts`) for a
 * user who has nothing to paste. A seed is not a demo path: `submitSeed` fills the field and calls
 * the same `submit`, so it runs the same route, the same model call and the same review-and-confirm
 * step, and a dead seed lands on the ordinary failure screen. Nothing fires without a tap.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { decideCaptionSaveOutcome } from '@/domain/import/caption-save-outcome';
import { IMPORT_ERROR_COPY } from '@/ui/import/import-error-copy';

import { useDevScreen } from './_lib/dev-screen';
import { useImportRun } from './_lib/use-import-run';
import { ImportShell } from './screens/import-shell';
import { PasteScreen } from './screens/paste-screen';
import { RailScreen } from './screens/rail-screen';
import type { AddByNameOutcome } from './screens/add-by-name';
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
   *  (`map-page-client.tsx`'s "Add a TikTok link" flow) rather than mounted at the standalone `/import`
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
   * **The contract, and it is load-bearing: only pass this for a link the user submitted.** It
   * costs one model call against a hard daily budget the moment this mounts, so it is not "prefill
   * the field". Two callers qualify, and both are a deliberate act on a specific link:
   * `AddSheetHost.onSubmitTikTok`, which fires only on the button press, and `/import?url=…`
   * (`page.tsx`'s `sharedImportUrl`), where the link was handed to this route from outside the
   * product — a share sheet, a Shortcut, a bookmarklet. Seeded as `touched` too, so a seeded link
   * that turns out to be invalid says so immediately rather than waiting for a first edit.
   *
   * A reload of `/import?url=…` re-runs the import rather than re-spending the model call:
   * `extractions` is keyed on `(source_id, model, prompt_version)` with an input hash, so the
   * second run is a cache hit (`api/imports/probe/route.ts`). That is why the seam does not strip
   * the parameter after submitting — stripping it would cost the user their link on a reload to
   * buy back a cost the cache already refunds.
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
  /**
   * The run — the pasted link, the request in flight, and which screen owns the result
   * (`_lib/use-import-run.ts`, which says why those five things are one module).
   *
   * Destructured rather than used as `run.x` so every call site below reads exactly as it did when
   * all of this was one function body.
   */
  const {
    screen: runScreen,
    url,
    setUrl,
    setTouched,
    offline,
    showInvalid,
    canSubmit,
    submit,
    submitSeed,
    submitNote,
    abort: abortInFlightProbe,
    reset: resetRun,
  } = useImportRun(initialUrl);

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

  /**
   * `useImportRun`'s `reset`, plus the one piece of state it does not own.
   *
   * **Every call site goes through this, never `resetRun`.** The hook can only clear the run; a
   * `reset` that leaves a stale `error` or `partialNotice` behind re-shows it the next time the
   * review screen renders, attached to a different import. Nothing tests this, which is why the
   * two are named differently rather than shadowed.
   */
  function reset(options?: { readonly clearUrl?: boolean }) {
    resetRun(options);
    setCaptionSave({ saving: false, error: null, partialNotice: null, statusByIndex: null });
  }

  /**
   * A screen forced by `/import?state=…`, or `null` — which it always is in production, where the
   * branch is folded out of the bundle entirely (`_lib/dev-screen.ts`).
   *
   * A render-time override and nothing else. `run.screen` is untouched, so `submit`, `reset` and
   * the in-flight ownership guard behave exactly as they do without it; this line is the whole
   * integration. It exists so the quality gates can photograph the review screen, the thirteen
   * failure screens and — the one that matters most — "no places found", which is the modal
   * outcome of an import and which the harness could not reach at all.
   */
  const devScreen = useDevScreen();
  const screen = devScreen ?? runScreen;

  /**
   * The one sentence the shell's always-mounted polite live region carries.
   *
   * Computed here rather than inside `ImportFailureScreen`, which is where it would naturally have
   * gone: a live region created in the same commit as its first message is not reliably announced,
   * so the region has to be mounted on every screen and fed from above. It is the body sentence
   * only — the headline is read by the focus move inside the failure screen, so nothing is said
   * twice — and it covers the pre-submit redirect as well as the async failure, because that
   * screen swaps the page just as completely and used to say nothing at all.
   */
  const announcement =
    screen.kind === 'probe_error' || screen.kind === 'redirect'
      ? IMPORT_ERROR_COPY[screen.kind === 'probe_error' ? screen.code : screen.reason].body
      : '';




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

  /**
   * A place added by name from the no-places screen (`spec-no-places-found.md` §6.8).
   *
   * It leaves the flow exactly as a confirm does, camera flight included — a save from that screen
   * is not a lesser save, and the whole point of inlining the search there rather than routing to a
   * standalone add screen is that the place keeps its link to the TikTok it came from.
   *
   * The counts are shaped to say what actually happened: one place, and `alreadySaved` reported
   * rather than dressed up, because `save_place` is idempotent and claiming a fresh save for a
   * place the user already had is the small lie this codebase keeps refusing to tell. The link is
   * cleared on the way out for the same reason `Try another TikTok link` clears it — this one is spent.
   */
  function addedFromNoPlaces(outcome: AddByNameOutcome) {
    backToMapWithFreshData({
      saved: 1,
      skipped: 0,
      failed: 0,
      alreadySaved: outcome.alreadySaved ? 1 : 0,
      savedPlaceIds: [outcome.savedPlaceId],
      statusByIndex: new Map(),
    });
    reset({ clearUrl: true });
  }

  /** The explicit "Continue to map" action shown only after a `partial_failure` — the successful
   *  saves are real, so this proceeds exactly like a clean success once the user has seen the
   *  which/how-many-failed message. */
  function continueAfterPartialSave() {
    backToMapWithFreshData(lastSaveDetail.current);
    reset({ clearUrl: true });
  }

  return (
    <ImportShell
      variant={onClose ? 'overlay' : 'standalone'}
      // Never `onClose`: the ✕ is reachable during the rail, so leaving has to abort first.
      onLeave={leaveImport}
      announcement={announcement}
    >
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
          probe={screen.probe}
          onRetry={() => reset({ clearUrl: true })}
          onBackToMap={backToMap}
          onAddManually={onAddManually ?? null}
          onAdded={addedFromNoPlaces}
          onReadNote={submitNote}
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
          retryable={screen.retryable}
          url={url}
          onRetrySameUrl={() => void submit()}
          onTryAnother={() => reset({ clearUrl: true })}
          onBackToMap={backToMap}
          onSignIn={() => router.push('/sign-in')}
        />
      )}
    </ImportShell>
  );
}
