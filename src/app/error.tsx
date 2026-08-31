'use client';

/**
 * The route-level error boundary for everything under `app/` — `/map`, `/import`, `/collections`
 * and any segment that does not carry its own. It does **not** cover the root layout; that is
 * `global-error.tsx` next to this file.
 *
 * Until this existed the product's failure mode was the framework's: an unstyled white
 * `__next_error__` document on `/import` and a bare `text/plain` body on `/map`, measured on this
 * branch. Two constraints shape what is here rather than a generic card:
 *
 *  - **Nothing is behind it.** The boundary replaces the failed segment's whole subtree, so on
 *    `/map` the map is gone and there is no shell to sit inside. It therefore paints a full
 *    surface of its own — `--brand-wash`, the same atmosphere as `/` and `/sign-in`, per
 *    `brand-and-product-foundation.md` §5 — instead of assuming a backdrop.
 *  - **`error.message` never renders.** Next serialises the real message in development and a
 *    generic one in production, so printing it would show two different products to two audiences
 *    and leak server detail in the case where it is real. The `digest` goes on screen instead: a
 *    hash the user can read down a phone and we can grep the logs for.
 *
 * Voice is `brand-and-product-foundation.md` §4 and the banned list in `ux-architecture` §12 —
 * which is why the headline is not "Something went wrong", and why nothing here apologises or
 * blames the user. `Back to the map` is deliberately the same eight characters the import failure
 * screens use (`ui/import/import-error-copy.ts`); the backlog already counts four labels for one
 * action and this is not the fifth.
 */

import { useEffect } from 'react';
import Link from 'next/link';

import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { CrumbMascot } from '@/components/brand/crumb-mascot';
import { Button } from '@/components/ui/button';

/** Exported so the wording is assertable as data — the test runner has no DOM. */
export const SHELL_ERROR_COPY = {
  kicker: 'On our side',
  headline: 'This screen didn’t load.',
  body: 'The fault is ours, not anything you did. Trying again usually clears it.',
  retry: 'Try again',
  back: 'Back to the map',
  /** Prefix for the digest line. Matches the `Reference: …` shape the import screens already use. */
  referenceLabel: 'Reference',
} as const;

/**
 * The quotable reference, or `null` when there is nothing to quote.
 *
 * `digest` is a hex hash Next generates, but it arrives as an untyped field on a serialised error
 * — an error boundary is the worst place in the product to render a string we have not looked at,
 * so it is filtered to alphanumerics and clipped rather than printed. Clipping also keeps it one
 * short line, which is the only thing it is for: a user reading it out or pasting it into a
 * message.
 */
export function errorReference(digest: string | undefined): string | null {
  if (!digest) return null;
  const safe = digest.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return safe.length > 0 ? safe : null;
}

export default function ShellError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // `retry`, not `reset`: in Next 16.3 `retry()` re-fetches *and* re-renders the boundary's
  // children, while `reset()` only clears the error state and re-renders what it already has.
  // A failed server render needs the fetch, so `reset()` would put the same broken tree back.
  retry: () => void;
}) {
  useEffect(() => {
    // The only place the digest is observable from the browser. Nothing reads these logs today
    // (backlog §12.22); it costs one line and is what a report from a user gets matched against.
    console.error('[shell] route error', { digest: error.digest, message: error.message });
  }, [error]);

  const reference = errorReference(error.digest);

  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-14 pb-8 lg:items-center lg:justify-center lg:pt-0"
      style={{ background: 'var(--brand-wash)' }}
    >
      {/* One column, not the two-panel split the other full-screen surfaces use: the split exists
          to hold an editorial column beside a form, and a failure screen has no second panel of
          content to put there. Mobile keeps the shared shape — hero at the top, action in the
          thumb zone via `mt-auto` — and desktop centres the same column. */}
      <div className="w-full lg:max-w-105">
        {/*
         * **The face, and the mood is a claim about this screen rather than decoration.**
         *
         * `#moods` binds `offline` to *"connection lost, retryable error"*, and this is the
         * retryable error boundary — it ships a reset action, which is the *retryable* half stated
         * in code. Flat eyes and a wiggle mouth: not a frown, not an apology. The voice rule that
         * governs the no-places screen governs here too — *never apologetic, never cute* — and a
         * neutral face is what says *that happened* and stops.
         *
         * **This overrides a recorded decision in `pin-mark.tsx`**, which said `error.tsx` and
         * `not-found.tsx` *"are on neither list and call `PinMark` directly, which is what keeps
         * them off it"*. That sentence is about §3.1 rule 2's face surfaces — app icon, splash,
         * sign-in, link preview — and it was right when the only alternative was the `idle` face,
         * which would have been a resting mark on a failure screen. `offline` is not a resting
         * mark; it is a mood the design system bound to this exact state, and `#moods`' own rule is
         * that a face may exist where a screen needs it. Noted at `pin-mark.tsx` too, so the two do
         * not disagree.
         *
         * **`not-found.tsx` deliberately does not get this.** A 404 is not an error the product
         * had — it is a URL that does not exist — and no mood is bound to it. Wearing `offline`
         * there would claim a connection problem that did not happen, which is the one constraint
         * on this whole package: no mood may assert more than the product knows.
         *
         * `animation="stir"` is the idle state, not a reaction to the failure: 17 s, 85.6% of it
         * at rest. A character that holds still on an error screen reads as a picture; one that
         * stirs occasionally reads as still being there.
         */}
        <CrumbMascot mood="offline" animation="stir" className="size-7.5 lg:size-9" />

        {/* Assertive: this content swaps in without a navigation, so nothing else announces it. */}
        <div role="alert">
          <p className="mt-6 text-micro font-bold tracking-[0.14em] text-brand uppercase">
            {SHELL_ERROR_COPY.kicker}
          </p>
          {/* The display face, and the token type scale. `brand-and-product-foundation.md` §3.1
              gives `h1`/`h2` to Fraunces; a failure screen is still the product speaking. What was
              here was `font-heading`, a bracketed 34px with a bracketed line height, and a
              bracketed 40px at `lg` — three arbitrary values for a size W0 registered as
              `--text-display` with its own line height. The `lg` bump to 40px goes with them: this
              column is capped at 420px on desktop and 34px already fills it, so the bump only made
              the failure louder.

              The old classes are described rather than quoted. `token-call-sites.test.ts` counts
              arbitrary-value classes with a regex over the source and cannot tell a comment from a
              call site, so quoting them here would put back on the ledger exactly what this change
              took off it. */}
          <h1
            className="mt-2 font-display text-display font-bold tracking-tight text-foreground"
            style={DISPLAY_HEADING_AXES}
          >
            {SHELL_ERROR_COPY.headline}
          </h1>
          <p className="mt-3 max-w-sm text-sm font-medium leading-snug text-muted-foreground lg:text-base">
            {SHELL_ERROR_COPY.body}
          </p>
        </div>
      </div>

      <div className="mt-auto w-full pt-10 lg:mt-0 lg:max-w-105">
        <Button
          onClick={() => retry()}
          className="h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading"
        >
          {SHELL_ERROR_COPY.retry}
        </Button>

        <Link
          href="/map"
          className="mt-3 flex h-12 w-full items-center justify-center text-sm font-bold text-brand"
        >
          {SHELL_ERROR_COPY.back}
        </Link>

        {reference && (
          <p className="mt-4 text-center text-xs font-medium text-muted-foreground">
            {SHELL_ERROR_COPY.referenceLabel}{' '}
            {/* Selectable on purpose — the whole point is that it can be copied. */}
            <span className="font-mono select-all">{reference}</span>
          </p>
        )}
      </div>
    </main>
  );
}
