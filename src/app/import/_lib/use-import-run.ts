'use client';

/**
 * One import run: the pasted link, the request in flight, and which screen owns the result.
 *
 * **A client hook, despite the `_lib` folder** — see `probe-contract.ts`'s header.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 120-131 and 157-399) by W6-1. Nothing
 * in it was rewritten; the only edits are the de-indent, the note inside `reset`, and the return
 * object at the bottom.
 *
 * ## Why these particular things are one module
 *
 * `inFlightProbe`, `abortInFlightProbe`, `stillCurrent`, `submit` and `reset` move together or not
 * at all. The ref's docblock below lists three separate bugs it closes, two of which shipped and
 * have e2e specs (`import-cancel-stale-response.spec.ts`, `import-double-submit.spec.ts`). The
 * guard it implements is *"is this response still the owner of the screen?"*, and that can only be
 * answered where the ref and the `setScreen` calls are the same closure. Any split that puts them
 * on opposite sides of a module boundary reintroduces the whole class.
 *
 * Three specific ways a later change breaks it:
 *
 *  - **turning `inFlightProbe` into `useState`.** It is read synchronously before the first
 *    `await`; state is a render behind, and the double-submit guard evaporates.
 *  - **giving `RailScreen` its own cancel handling.** `Cancel` must call the shell's `reset()`,
 *    which aborts *and* clears the ref — see `abortInFlightProbe` on why both halves matter.
 *  - **calling this `reset` directly instead of the shell's wrapper.** See the note inside it.
 *
 * `seedSubmitted` stays here for a different reason: its effect spends a Gemini call against a hard
 * 500/day ceiling on mount, and `PasteScreen` unmounts on every screen transition, so the same
 * effect there would re-fire on every return to paste. No test would catch that — it costs money,
 * not correctness.
 *
 * **W6-2 and W6-3 both edit this file.** W6-2 issues the source-preview request beside the probe
 * under the *same* `AbortController`, which is precisely why that seam is here and not in
 * `rail-screen.tsx`. W6-3 adds an awaited, abort-aware hold between the last two `setScreen` calls
 * in `submit`, and must re-check `stillCurrent()` **after** the hold as well as before it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { toDomainErrorCode, type PreSubmitErrorCode } from '@/ui/import/import-error-copy';

import { railExtractFact } from '@/ui/import/rail-extract-fact';

import { hold } from './hold';
import type { ProbeErrorBody, ProbeSuccess, SourcePreview } from './probe-contract';
import { PAYOFF_HOLD_MS, RAIL_IDLE, type Screen } from './screen';

/** What the shell needs in order to render and drive one run. */
export interface ImportRun {
  readonly screen: Screen;
  readonly url: string;
  readonly setUrl: (url: string) => void;
  readonly touched: boolean;
  readonly setTouched: (touched: boolean) => void;
  readonly offline: boolean;
  readonly showInvalid: boolean;
  readonly canSubmit: boolean;
  readonly submit: (target?: string) => Promise<void>;
  readonly submitSeed: (seedUrl: string) => void;
  /** Aborts the in-flight probe without touching the screen — what the ✕ needs, and half of what
   *  `reset` does. */
  readonly abort: () => void;
  /**
   * Back to the paste screen. **Call the shell's wrapper, never this directly** — this one cannot
   * clear `captionSave`, which it does not own.
   */
  readonly reset: (options?: { readonly clearUrl?: boolean }) => void;
}

export function useImportRun(initialUrl: string | undefined): ImportRun {
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
  // `captionSave` is NOT cleared here — this hook does not own it. The shell wraps this
  // function and clears it after calling through, and every call site uses that wrapper. A
  // `reset` that leaves a stale `partialNotice` behind re-shows it on the next review screen,
  // attached to a different import. Nothing tests this.
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

  /*
   * A real TikTok link: **two round trips, in sequence, and no stream** (W6-2).
   *
   * `/api/imports/source-preview` answers in under a second with the post — thumbnail, `@handle`,
   * caption. `/api/imports/probe` then takes the 7-34s a real model call measures, and answers
   * with the places. Each `setScreen` below reports a stage only once the server has actually
   * said so.
   *
   * **What this deleted, and why it had to go.** There used to be one request, and the rail flipped
   * `source: 'done'` with the fact `'Read the TikTok'` immediately after the fetch was *issued* —
   * a comment here called it "the honest approximation" available with one round trip, which it
   * was. With two it is no longer needed, and `facelift-plan.md` §5 and the run's rule 3 forbid a
   * stage claim the server did not send. It is not kept alongside the real one.
   *
   * **In sequence rather than in parallel, deliberately.** `oembedSourceAdapter.fetch` is
   * cache-through against `public.sources`, so the probe's own source fetch for the same video is
   * a database read *once the preview has written that row*. Issued in parallel both would miss a
   * cold cache and both would hit TikTok, doubling the upstream cost per import for no latency
   * gain — the total is bounded by the model call either way. The user still sees the post 7-34s
   * earlier, which is the entire point.
   *
   * **A preview failure is silent.** The probe runs regardless and is the sole authority on
   * whether the import failed, so there is exactly one path to a failure screen and no way for the
   * two responses to disagree on screen. Nor does it cost a wait: the probe fails at its own
   * source stage, before any model call, with the same code.
   *
   * The in-flight guard. Synchronous, and ahead of every `await` in this function, so a second
   * call dispatched in the same task sees it — see `inFlightProbe`. **One controller covers both
   * requests**, which is why this sequencing lives here and not in `rail-screen.tsx`: Cancel has to
   * abort whichever is in flight, and the ownership guard has to cover both responses.
   */
  if (inFlightProbe.current !== null) return;
  const probe = new AbortController();
  inFlightProbe.current = probe;

  /** Is this call still the one that owns the screen? False after a `Cancel` (which aborts and
   *  clears the ref) and after any later submit took over. A response that lost its race must
   *  set no state at all — not a screen, not an error. */
  const stillCurrent = () => inFlightProbe.current === probe;

  setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } });

  const post = async (route: string): Promise<Response> =>
    fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
      signal: probe.signal,
    });

  try {
    /**
     * Round trip 1 — the post. Its only job is to fill the rail's `source` stage with something
     * true, so anything other than a well-formed success is dropped: a preview failure leaves
     * `source` reading `active` and `post` null, which is exactly what "we are still reading it"
     * looks like and is the honest rendering of "we could not". `stillCurrent()` gates it like
     * every other response here.
     */
    let preview: SourcePreview | null = null;
    try {
      const previewRes = await post('/api/imports/source-preview');
      const previewBody = (await previewRes.json()) as SourcePreview | ProbeErrorBody;
      if (!stillCurrent()) return;
      if (previewRes.ok && !('error' in previewBody)) {
        preview = previewBody;
        setScreen({
          kind: 'rail',
          rail: {
            ...RAIL_IDLE,
            source: 'done',
            // The real handle off the real response, never the pasted URL.
            sourceFact: previewBody.authorHandle
              ? `Read @${previewBody.authorHandle}'s TikTok`
              : 'Read the TikTok',
            extract: 'active',
            post: previewBody,
          },
        });
      }
    } catch (e) {
      // An abort must not be swallowed here — it would fall through into the probe below and
      // issue a request the user has already cancelled. Every other preview failure is dropped.
      if (probe.signal.aborted || !stillCurrent()) throw e;
    }

    // Round trip 2 — the places.
    const res = await post('/api/imports/probe');
    const body = (await res.json()) as ProbeSuccess | ProbeErrorBody;
    if (!stillCurrent()) return;

    if (!res.ok || 'error' in body) {
      // Narrowed once, here, and the un-narrowed string is not carried onto the screen: the server
      // has already logged what it actually sent (`07` §7.1), and this client had no honest use for
      // a copy of it once the `Reference:` line went (see `_lib/screen.ts`).
      const rawCode = 'error' in body ? body.error.code : 'INTERNAL';
      const retryable = 'error' in body ? body.error.retryable : true;
      setScreen({ kind: 'probe_error', code: toDomainErrorCode(rawCode), retryable });
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
        // Sentence and number from the same call, so they cannot say different things.
        extractFact: railExtractFact(n),
        extractCount: n,
        // The post stays on the rail through the payoff beat. `body` is a `ProbeSuccess`, which
        // extends `SourcePreview`, so this is the same object shape the preview supplied — falling
        // back to it means a rail whose preview failed still gets the post at this point rather
        // than losing the block it had never shown.
        post: preview ?? body,
      },
    });

    /*
     * The payoff, held (W6-3).
     *
     * The two `setScreen` calls either side of this used to be adjacent statements in the same
     * `async` continuation, so React batched them into one commit and `3 places found` — the fact
     * the whole 7-34s wait was for — **rendered for zero frames.** The `await` is the entire fix:
     * it ends the batch.
     *
     * It holds a fact the server actually sent, so nothing the rail claims changes; only how long
     * the true one is legible. The hold applies at every count including zero
     * (`overnight-copy-deck.md` §9.2) — the counter does not mount at zero, but the beat does, so
     * the modal outcome of an import is arrived at on the same rhythm as a success.
     */
    await hold(PAYOFF_HOLD_MS, probe.signal);
    /*
     * Re-checked **after** the hold, not only before it.
     *
     * A Cancel during those 700ms must leave the screen where the user left it. Without this
     * re-check the landing screen arrives after the user has gone back to paste — which is
     * `import-cancel-stale-response.spec.ts`'s exact bug class, with a new window to fire in that
     * did not exist before this package.
     */
    if (!stillCurrent()) return;

    // The modal outcome of an import gets its own screen. It had one all along — `NoPlacesScreen`
    // was written, reviewed and never constructed, so every zero-candidate import fell through to
    // the review screen and rendered a source row, one muted sentence and a half-empty card. At
    // LEVEL B's hit rate that is the screen most imports end on.
    setScreen(
      n === 0 ? { kind: 'no_places', probe: body } : { kind: 'caption_preview', probe: body },
    );
  } catch {
    // A user pressing Cancel is not an internal error. An abort lands here as a DOMException,
    // and so does any response that arrived after this call stopped owning the screen — both
    // are `!stillCurrent()`, and both must leave the screen exactly as the user left it.
    if (!stillCurrent()) return;
    // The network layer failed before any `DomainError` existed — no code came off the wire, so
    // `INTERNAL` is ours to assert (`07` §9's floor), not a fallback for an unrecognised code.
    setScreen({ kind: 'probe_error', code: 'INTERNAL', retryable: true });
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

  /**
   * `setScreen` is deliberately **not** returned.
   *
   * Every transition in this flow is a consequence of the run — a verdict, a response, a cancel —
   * and each one is gated on `stillCurrent()`, which only means something inside the closure that
   * owns `inFlightProbe`. Handing the setter out would let a caller take the screen without that
   * gate, which is the exact defect `import-cancel-stale-response.spec.ts` exists for. The shell
   * reads `screen` and calls `submit` / `reset`; it does not set screens.
   */
  return {
    screen,
    url,
    setUrl,
    touched,
    setTouched,
    offline,
    showInvalid,
    canSubmit,
    submit,
    submitSeed,
    abort: abortInFlightProbe,
    reset,
  };
}
