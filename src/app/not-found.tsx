/**
 * The 404 surface. Two different things land here and the copy has to be true for both:
 *
 *  1. A URL that matches no route at all — Next routes every unmatched URL to the root
 *     `not-found.tsx` (`file-conventions/not-found`, "Good to know").
 *  2. `notFound()` from `map/page.tsx`, which fires for a collection that does not
 *     exist **and** for one that exists but the caller is not a member of. That ambiguity is
 *     deliberate — `getCollection` returns null for both so the route cannot be used as an
 *     existence oracle for other people's collections — and it means this screen must not say
 *     "this page doesn't exist". Sometimes it does; it just isn't theirs.
 *
 * So the headline states our own inability, not the resource's absence, and the body names both
 * possibilities without letting the reader tell which one they hit.
 *
 * A Server Component, and one that reads nothing: no session, no database. It has to render when
 * the rest of the product cannot.
 */

import Link from 'next/link';

import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { PinMark } from '@/components/brand/pin-mark';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Exported so the wording is assertable as data — the test runner has no DOM. */
export const NOT_FOUND_COPY = {
  kicker: 'Nothing to open',
  headline: 'We can’t open this link.',
  body: 'Either there’s nothing at this address, or it belongs to an account that isn’t yours. If someone shared it with you, ask them to send it again.',
  // The same label the import failure screens and `error.tsx` use. One action, not two: a visitor
  // with no session is redirected from `/map` to `/sign-in` by the proxy, which is where they
  // need to be anyway, so a second "start from the beginning" link would only add a fifth name
  // for a destination the product already has one name for.
  back: 'Back to the map',
} as const;

export default function NotFound() {
  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-14 pb-8 lg:items-center lg:justify-center lg:pt-0"
      style={{ background: 'var(--brand-wash)' }}
    >
      <div className="w-full lg:max-w-105">
        <PinMark className="size-7.5 lg:size-9" />

        <p className="mt-6 text-micro font-bold tracking-[0.14em] text-brand uppercase">
          {NOT_FOUND_COPY.kicker}
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
          {NOT_FOUND_COPY.headline}
        </h1>
        <p className="mt-3 max-w-sm text-sm font-medium leading-snug text-muted-foreground lg:text-base">
          {NOT_FOUND_COPY.body}
        </p>
      </div>

      <div className="mt-auto w-full pt-10 lg:mt-0 lg:max-w-105">
        <Link
          href="/map"
          className={cn(
            buttonVariants(),
            'h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading',
          )}
        >
          {NOT_FOUND_COPY.back}
        </Link>
      </div>
    </main>
  );
}
