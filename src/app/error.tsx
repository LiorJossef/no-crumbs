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

import { PinMark } from '@/components/brand/pin-mark';
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
      <div className="w-full lg:max-w-[420px]">
        <PinMark className="h-[30px] w-[30px] lg:h-9 lg:w-9" />

        {/* Assertive: this content swaps in without a navigation, so nothing else announces it. */}
        <div role="alert">
          <p className="mt-6 text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase lg:text-[13px]">
            {SHELL_ERROR_COPY.kicker}
          </p>
          <h1 className="mt-2 font-heading text-[34px] leading-[1.05] font-extrabold tracking-tight text-foreground lg:text-[40px]">
            {SHELL_ERROR_COPY.headline}
          </h1>
          <p className="mt-3 max-w-sm text-sm font-medium leading-snug text-muted-foreground lg:text-base">
            {SHELL_ERROR_COPY.body}
          </p>
        </div>
      </div>

      <div className="mt-auto w-full pt-10 lg:mt-0 lg:max-w-[420px]">
        <Button
          onClick={() => retry()}
          className="h-12 w-full rounded-lg text-base font-bold lg:h-[52px] lg:text-[15.5px]"
        >
          {SHELL_ERROR_COPY.retry}
        </Button>

        <Link
          href="/map"
          className="mt-3 flex h-12 w-full items-center justify-center text-sm font-bold text-[var(--mint-700)]"
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
