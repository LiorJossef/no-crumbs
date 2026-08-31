'use client';

/**
 * The chrome every screen of the import flow sits inside: the wash, the card, the ✕, and the one
 * live region.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 495-587) by W6-1. Three properties of
 * it have no test at all, and each is silently lost by the obvious extraction — which is why the
 * props are shaped the way they are.
 *
 * **`variant` and `onLeave` are two props, not one `onClose?`.** In the old shell that one prop
 * meant both "we are an overlay" and "this is what ✕ does", and the ✕ must call `leaveImport`
 * (which aborts the in-flight request first, because the ✕ is reachable during the rail) rather
 * than the host's `onClose` (which does not). The two have the identical type `() => void`, so
 * passing the wrong one compiles and produces an overlay that unmounts with a live request.
 * Splitting the props makes that unrepresentable.
 *
 * **`announcement` is a prop, and the region is mounted unconditionally.** Its content comes from
 * the two failure screens, so the natural place to put it during a split is inside
 * `failure-screen.tsx` — which is exactly the bug: a live region created in the same commit as its
 * first message is not reliably announced. It renders here, once, always, on every screen.
 *
 * **No `key` on the children, and no component defined inside the caller's render.** Either would
 * remount the review screen on a transition and silently discard every tick and every shortlist
 * pick the user had made. The router stays inline JSX in `import-page-client.tsx`.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { COUPLE_TINT, ENTER_MODAL, ENTER_SCRIM } from '@/lib/interaction';

export function ImportShell({
  variant,
  onLeave,
  announcement,
  children,
}: {
  /** An overlay over the live map, or the standalone `/import` route. Drives the whole `lg:`
   *  layout fork and which close affordance renders. */
  variant: 'overlay' | 'standalone';
  /** What the ✕ does in overlay mode. **Never the host's `onClose` directly** — see this file's
   *  header. */
  onLeave: () => void;
  /** The sentence the polite live region carries, or the empty string. See this file's header. */
  announcement: string;
  children: ReactNode;
}) {
  const isOverlay = variant === 'overlay';
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
        isOverlay ? 'absolute inset-0 z-50 h-full' : 'h-dvh',
        // Desktop (`lg+`) in overlay mode: this is no longer a right-docked full-height panel —
        // it is a dimming scrim over the *whole* viewport (map + the always-visible places list
        // both read as backgrounded context) with a single centred, capped-height card floating
        // on top. `<main>` itself becomes the flex-centring context and the scrim; the inner div
        // below is the card. Mobile is untouched — these are all `lg:` additions.
        isOverlay && 'lg:flex lg:items-center lg:justify-center lg:overflow-y-auto lg:bg-foreground/35 lg:backdrop-blur-[2px]',
        // **This padding is the card's height budget, and it is the only place that number is
        // written.** The card below takes `lg:max-h-full`, which resolves against *this* element's
        // content box, so the two can no longer disagree — and they did: the card capped itself at
        // `min(52rem, 100vh-4rem)` = 832px inside a scrim padded `p-10`, whose content box at
        // 900px is 820px, so the tallest screen in the flow overflowed its own scrim by 12px and
        // made `<main>` scroll.
        //
        // `p-5` rather than `p-10`, on **both** variants (the standalone route had no `lg:`
        // padding at all and centred on `my-auto`, which is the same 4rem by another route).
        // The review screen is the only screen here whose content exceeds the cap, and at
        // 1440 × 900 a laptop has just **56px more height than a phone** — so every pixel of
        // chrome above 56 is a pixel on which the desktop shows *less of the decision than the
        // phone does*, which is what it was doing (`product-review-2026-08-31-r3.md` finding 4:
        // candidate scroller `clientHeight` 371 desktop against 409 mobile). 20px still reads as
        // a floating card — horizontally the scrim is ~480px on each side of a 480px card — and
        // it is the widest inset the arithmetic leaves.
        'lg:p-5',
        // The medium tier, overlay only: this plane arrives over a live map, so it fades in rather
        // than cutting over it. `ENTER_SCRIM` is opacity and nothing else — a 2% zoom on a
        // viewport-sized element would show a ring of un-dimmed map down every edge — and the card
        // below carries the same 300ms with the scale, so the two read as one event.
        //
        // Not on the standalone `/import` route: there this element *is* the page, it arrives by
        // navigation, and a page that fades itself in is the entrance `globals.css` already owns.
        isOverlay && ENTER_SCRIM,
      )}
    >
      {/* The gradient backdrop, split out from `<main>` itself: at `lg+` in overlay mode
          (`variant: "overlay"`), this must NOT paint over the whole viewport, or it hides the live map
          this screen is supposed to float over. Hidden at `lg:` only in the overlay variant —
          `<main>` supplies its own dim scrim above instead. The mobile takeover and the standalone
          `/import` route (no map behind it, the standalone variant) keep the full-bleed gradient. */}
      <div
        aria-hidden
        className={cn('absolute inset-0 -z-10', isOverlay && 'lg:hidden')}
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
        {announcement}
      </p>
      <div
        className={cn(
          // Mobile: full-bleed thumb-zone column, unchanged.
          // `min-h-0` is load-bearing: without it this flex child refuses to shrink below its
          // content, so the inner `overflow-y-auto` list never scrolls and the footer is pushed
          // off the bottom of the viewport instead.
          'relative z-10 mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          // Desktop (`lg+`), overlay mode only (the map's "Add a TikTok link" flow): a
          // floating card centred over the dimmed map + list, not a docked panel — fixed width,
          // capped height with its own scroll (so a future 3-stage rail grows the card rather than
          // forcing full-viewport height), rounded corners on all sides, hairline border + elevation.
          //
          // **The width ruling is `ux-import-review-screen.md` §5.2 and it is deliberate**: *"The
          // card stays `clamp(420px, 34vw, 480px)`. Do not widen it, do not go two-column, do not
          // add a caption pane on the side. This is a task, not a dashboard."* Honoured. What that
          // section did **not** rule on is the card's height, and that is where the desktop was
          // losing to the phone — see `<main>` above and `lg:max-h-full` / `lg:py-8` below.
          isOverlay &&
            'lg:relative lg:mx-0 lg:my-0 lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-full lg:justify-start lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-8 lg:shadow-sheet',
          // Desktop (`lg+`), standalone `/import` route (no map behind it).
          //
          // This used to be a flush right-docked, full-height panel, and with no map behind it that
          // left the other two thirds of a 1280px screen as an empty wash — the emptiest surface in
          // the product, on a screen whose whole content is one input. It is now the same centred
          // card the overlay uses, so the two ways into this flow look like one flow.
          !isOverlay &&
            'lg:relative lg:my-auto lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-full lg:justify-start lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-8 lg:shadow-sheet',
          // **Two numbers in those strings changed together and neither is a taste call.**
          //
          // `lg:max-h-full` replaces `lg:max-h-[min(52rem,calc(100vh-4rem))]`. The `52rem` half was
          // a constant dressed as a viewport rule: at 832px it binds below a 896px viewport and at
          // *every* viewport above it, so a laptop, a 27" monitor and a 900px window all got the
          // same 832px card and the extra height was declined. A percentage against `<main>`'s
          // padding box is the same intent expressed once, and it cannot drift out of step with
          // the scrim the way a second literal did.
          //
          // `lg:py-8` replaces `lg:py-10`. The mobile column spends 56px on vertical padding
          // (`2rem` top, `1.5rem` bottom); the desktop card spent 80px, on a viewport with only
          // 56px more height to give. 32px now matches this card's own `lg:px-8`, so the inset is
          // square, and the 16px goes to the candidate list.
          //
          // The other four screens in this flow are content-height, so `max-h` never binds on them
          // and the only thing they see is the 16px.
          // The card that lands on the scrim above, at the scrim's own duration. See `ENTER_MODAL`
          // for why a modal scales rather than slides, and `ENTER_SCRIM` for why only this half of
          // the pair does.
          isOverlay && ENTER_MODAL,
        )}
      >
        {/*
            **36px circle, 44px hit area** — `spec-no-places-found.md` §4's own wording, and the
            shape it asks for. The visual stays where it was and the target grows around it.

            `size-11` with `-m-1` is how, and the negative margin is the whole trick: on an
            absolutely positioned box, a −4px margin pulls the border box 4px up and left of its
            `left`/`top`, so the 36px circle centred inside it lands on exactly the pixel it landed
            on before. No inset value had to move, at either breakpoint, and nothing below shifted.

            It was 36 × 36 — under this project's 44px bar (§8.3), and this is the **only** way off
            the import flow at the top of the screen. `spec-no-places-found.md` §5.4 already knew:
            it kept a second ghost `Back to the map` in that screen's footer because "the ✕ is a
            36px target in the top-left corner of an 812pt screen". That second exit stays — 44px
            in the hardest corner for a right thumb is still the hardest corner — but the reason it
            was needed is now one problem smaller.

            `group` so the hover still fires from the whole target rather than only from the circle.
        */}
        {isOverlay ? (
          <button
            type="button"
            onClick={onLeave}
            aria-label="Close and return to map"
            className="group absolute -m-1 left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-11 items-center justify-center lg:left-6 lg:top-6"
          >
            <span className={cn('flex size-9 items-center justify-center rounded-full bg-accent text-brand group-hover:bg-accent/80', COUPLE_TINT)}>
              <X className="size-4" aria-hidden />
            </span>
          </button>
        ) : (
          <Link
            href="/map"
            aria-label="Close and return to map"
            className="group absolute -m-1 left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-11 items-center justify-center lg:left-6 lg:top-6"
          >
            <span className={cn('flex size-9 items-center justify-center rounded-full bg-accent text-brand group-hover:bg-accent/80', COUPLE_TINT)}>
              <X className="size-4" aria-hidden />
            </span>
          </Link>
        )}
        {/* Clearance below the close button, not just a same-height spacer: at `h-9` (36px) this
            div was exactly the circle's own height, so the heading that follows sat flush against
            its bottom edge with zero gap. `h-14` (56px) leaves ~20px of breathing room below the
            36px circle on both widths — unchanged when the *target* grew to 44px above, because
            the extra 4px is negative margin rather than layout, and the 16px that remains below
            the hit box is still clear of the nearest thing under it, which is text and not a
            target. */}
        <div className="h-14 shrink-0" aria-hidden />
        {children}
      </div>
    </main>
  );
}
