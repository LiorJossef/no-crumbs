/**
 * The 404 surface. Two different things land here and the copy has to be true for both:
 *
 *  1. A URL that matches no route at all — Next routes every unmatched URL to the root
 *     `not-found.tsx` (`file-conventions/not-found`, "Good to know").
 *  2. `notFound()` from `collections/[id]/page.tsx`, which fires for a collection that does not
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
      <div className="w-full lg:max-w-[420px]">
        <PinMark className="h-[30px] w-[30px] lg:h-9 lg:w-9" />

        <p className="mt-6 text-[11px] font-bold tracking-[0.14em] text-brand uppercase lg:text-[13px]">
          {NOT_FOUND_COPY.kicker}
        </p>
        <h1 className="mt-2 font-heading text-[34px] leading-[1.05] font-extrabold tracking-tight text-foreground lg:text-[40px]">
          {NOT_FOUND_COPY.headline}
        </h1>
        <p className="mt-3 max-w-sm text-sm font-medium leading-snug text-muted-foreground lg:text-base">
          {NOT_FOUND_COPY.body}
        </p>
      </div>

      <div className="mt-auto w-full pt-10 lg:mt-0 lg:max-w-[420px]">
        <Link
          href="/map"
          className={cn(
            buttonVariants(),
            'h-12 w-full rounded-lg text-base font-bold lg:h-[52px] lg:text-[15.5px]',
          )}
        >
          {NOT_FOUND_COPY.back}
        </Link>
      </div>
    </main>
  );
}
