'use client';

/**
 * Lifted verbatim out of `import-page-client.tsx` (its lines 2011-2221) by W6-1.
 *
 * `tests/unit/import/import-error-copy.test.ts` is the guard on this file — it asserts that none of
 * `IMPORT_ERROR_COPY`'s strings is hard-coded back into the screen. It reads every file under
 * `src/app/import/`, not one path, precisely so that moving this component here did not make it
 * pass while reading a file with no error copy in it.
 */

import { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  Clock,
  EyeOff,
  ImageOff,
  Link2Off,
  LockKeyhole,
  MessageSquareOff,
  RotateCcw,
} from 'lucide-react';

import { PlatformMark } from '@/components/brand/platform-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ENTER_SCREEN } from '@/lib/interaction';
import type { DomainErrorCode } from '@/domain/errors';
import {
  IMPORT_ERROR_ACTION_LABEL,
  IMPORT_ERROR_COPY,
  importErrorActions,
  type ImportErrorAction,
  type ImportErrorIcon,
} from '@/ui/import/import-error-copy';

/* ------------------------------------------------------------------------------------------- *
 * The one failure screen — every `DomainErrorCode`, rendered from `07` §9's one client-side copy
 * map. Used for both moments a failure can arrive in:
 *
 *   - **pre-submit** (`kind: 'redirect'`), where `canonicaliseTikTokUrl` rejected the pasted
 *     string on the client and nothing was sent;
 *   - **post-attempt** (`kind: 'probe_error'`), where the route threw a `DomainError`.
 *
 * They were two components with two sets of words. That is how the drift happened: the pre-submit
 * screen said "This kind of TikTok **post** isn't supported yet" and collapsed `UNSUPPORTED_HOST`
 * and `UNSUPPORTED_URL` — an Instagram link and a TikTok profile link — into one sentence, while
 * the copy map said something else and never rendered for those three codes at all.
 *
 * They are one component because the layout was already identical and, more importantly, because
 * the three pre-submit codes say nothing about an attempt: "That link isn't a TikTok", "That's a
 * TikTok link, but not a post", "This kind of TikTok isn't supported yet" are all true whether or
 * not we tried. The codes whose copy *does* claim an attempt ("We couldn't read this TikTok yet")
 * are exactly the ones the client can never reach pre-submit. A test pins that property.
 *
 * The one real difference is a prop, not a fork: `retryable` is `false` pre-submit, because nothing
 * was sent. There was a second — `rawCode`, `null` pre-submit for the same reason — and it went
 * with the `Reference:` line it existed to print; see the comment at the bottom of this file.
 *
 * What this replaced on the post-attempt side: one screen for all fourteen codes, headed
 * "Couldn't read that TikTok / Something went wrong" with the raw code in 11px grey and one
 * action, "Try another link". Everything the user reads now comes from
 * `ui/import/import-error-copy.ts`; this component owns only the layout, the mark, the wiring of
 * each action, and the accessibility behaviour.
 *
 * One thing deliberately gone with it: the pre-submit screen's primary action read `Add manually →`
 * under the headline `Add it by hand instead`, and it called `reset()` — back to an empty paste
 * field. S8 manual add is `L1-F7-T1` and does not exist, so that button named a destination it
 * could not reach. The action it actually performs is `Try another TikTok link`, and that is now what it
 * says.
 * ------------------------------------------------------------------------------------------- */

/** The mark for each `ImportErrorIcon` key. Kept here rather than in the copy map so that module
 *  stays React-free and testable as plain data. */
const IMPORT_ERROR_ICON: Record<ImportErrorIcon, typeof Link2Off> = {
  'link-off': Link2Off,
  'post-unavailable': EyeOff,
  photo: ImageOff,
  waiting: Clock,
  'no-caption': MessageSquareOff,
  'our-side': RotateCcw,
  locked: LockKeyhole,
};

export function ImportFailureScreen({
  code,
  retryable,
  url,
  onRetrySameUrl,
  onTryAnother,
  onBackToMap,
  onSignIn,
}: {
  code: DomainErrorCode;
  /** What the server actually sent. Equal to `code` for all 14 real codes; shown small, for a
   *  support conversation, never as the user's explanation. `null` when no request was made — a
   *  reference to nothing helps nobody. */
  retryable: boolean;
  /** The URL the user pasted — still in state, which is what makes `Retry` (same link) and
   *  `Open on TikTok` (here is your thing back, §5.1) possible without asking the server. */
  url: string;
  onRetrySameUrl: () => void;
  onTryAnother: () => void;
  onBackToMap: () => void;
  onSignIn: () => void;
}) {
  const copy = IMPORT_ERROR_COPY[code];
  const Icon = IMPORT_ERROR_ICON[copy.icon];
  /**
   * Already in render order, and already reconciled with the server's `retryable` — see
   * `importErrorActions`. This component picks no actions of its own; the one thing it contributes
   * is a precondition the copy map cannot see.
   *
   * **`Retry` re-runs the pasted URL, so with no pasted URL there is nothing to re-run.** That is
   * the same sentence `retryable` already means, which is why it folds in here rather than
   * becoming a third parameter. An action whose precondition is unmet should not render: the
   * alternative is a mint primary button that does nothing when pressed, which is exactly the dead
   * end this screen exists to remove. `Open on TikTok` / `Open the original link` drop themselves
   * on the same condition further down.
   *
   * With the abort in `submit()` this is now belt-and-braces — `reset()` is the only thing that
   * empties `url` and it cancels the request that could otherwise land here — but it is one line
   * and it holds regardless of how a future caller reaches this screen.
   */
  const actions = importErrorActions(code, retryable && url.trim().length > 0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The button that submitted has just unmounted, so keyboard focus would otherwise fall back to
  // `<body>` and a screen-reader user would be told nothing about why the screen changed. Moving
  // it to the headline both restores a sensible tab position and reads the headline; the page's
  // polite live region carries the sentence under it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [code]);

  function run(action: ImportErrorAction) {
    switch (action) {
      case 'retry':
        onRetrySameUrl();
        return;
      case 'another_tiktok':
        onTryAnother();
        return;
      case 'back_to_map':
        onBackToMap();
        return;
      case 'sign_in':
        onSignIn();
        return;
      case 'open_tiktok':
      case 'open_link':
        return; // rendered as an anchor, never routed through here
    }
  }

  return (
    <div className={cn('flex flex-1 flex-col', ENTER_SCREEN)}>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-brand">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-micro font-bold tracking-[0.14em] text-brand uppercase">
            {copy.kicker}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-xl font-extrabold tracking-tight text-foreground outline-none"
          >
            {copy.headline}
          </h1>
          <p className="max-w-xs text-sm font-medium text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        {actions.map((action) => {
          const label = IMPORT_ERROR_ACTION_LABEL[action];
          // `Open on TikTok` is a real navigation to a third-party page, so it is an anchor with
          // the same affordance as everywhere else in this flow, not a button that calls
          // `window.open`. When the field is somehow empty there is nothing to open, and the
          // action is dropped rather than rendered dead.
          //
          // Two weights, because the two specs ask for two: §5.1 makes it the second 44px
          // secondary on F9 (bordered, in the button rhythm), §5.3 makes it the tertiary text
          // link on F10. "Is it last?" is exactly that distinction on this screen.
          if (action === 'open_tiktok' || action === 'open_link') {
            if (!url) return null;
            const tertiary = action === actions[actions.length - 1];
            return (
              <a
                key={action}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold',
                  tertiary
                    ? 'text-brand'
                    : 'border border-input bg-background text-foreground',
                )}
              >
                {/* The platform mark on `open_tiktok` and **never** on `open_link`, which is the
                    one distinction this pair exists to carry: `UNSUPPORTED_HOST`'s whole news is
                    that the pasted link is not a TikTok, and a TikTok glyph on the button that
                    hands it back would contradict the headline above it. Same leading-mark,
                    trailing-arrow composition as `Open on TikTok` on the place detail. */}
                {action === 'open_tiktok' && <PlatformMark className="size-4" />}
                {label}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            );
          }
          // §5.1's 56px primary / 44px secondary hierarchy, expressed in this flow's existing
          // h-12 / h-11 sizes.
          return action === actions[0] ? (
            <Button
              key={action}
              type="button"
              onClick={() => run(action)}
              className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              {action === 'retry' && <RotateCcw className="size-4" aria-hidden />}
              {label}
            </Button>
          ) : (
            <Button
              key={action}
              type="button"
              variant={action === 'back_to_map' ? 'ghost' : 'outline'}
              onClick={() => run(action)}
              className="h-11 w-full gap-1.5 rounded-lg text-sm font-bold"
            >
              {label}
            </Button>
          );
        })}
        {/*
          **There is no `Reference:` line here, and its absence is the decision.**

          It read `Reference: POST_UNAVAILABLE` — a raw SCREAMING_SNAKE enum shown to a person as
          if it were information for them. `voice-and-vocabulary.md` §4 bans machinery vocabulary
          outright, and it was also the one place on this screen still using
          `text-muted-foreground/70`, which `spec-no-places-found.md` §8.3 rules below the bar.

          It was kept on the stated grounds that a user could quote it in a support message. That
          turned out not to survive contact with what it actually was: **a class, not an instance.**
          Every user who hits this failure quotes the same eleven characters, so it correlates to
          nothing — while the headline above already says the same thing in English. The value that
          *would* correlate is the `importId`, and `failureResponse` in the probe route deliberately
          does not put it on the wire (its comment gives the branded-type reason) because "the
          correlation id lives in the log line above, which is where `07` §7.1 puts it".

          So it was for us, we already have it — one structured `console.error` per failure carrying
          the code, the stage and the import id — and it does not belong on the screen. If a
          user-quotable reference is wanted, it is the `importId`, and that is a route change and a
          new string rather than something to re-add here.
        */}
      </div>
    </div>
  );
}
