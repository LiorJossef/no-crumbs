'use client';

/**
 * The one line of feedback a finished import owes the user.
 *
 * Before this, pressing "Done" on eight extracted London places closed the overlay and left the
 * map exactly where it was, framed on Tel Aviv, with no message and no camera move. The eight rows
 * were written correctly and were, from the user's side, indistinguishable from nothing happening.
 *
 * Deliberately small: a single dismissible strip anchored under the safe area, not a modal and not
 * a toast library. It carries three facts and no actions —
 *
 *  - how many places this import added;
 *  - how many were **already in the library**, said plainly rather than folded into the total
 *    (a re-import used to report every place as a fresh save);
 *  - how many the model named but could not place, because "we found it but could not pin it" is
 *    the honest outcome and silently dropping those candidates is the failure mode this product
 *    cannot afford (`docs/working-agreement.md` §4).
 *
 * It auto-dismisses, because the camera flight it accompanies is the real answer and a permanent
 * banner over a map is clutter. `role="status"` so a screen reader hears it without the focus
 * being stolen mid-flight.
 */

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const AUTO_DISMISS_MS = 9000;

export interface ImportConfirmationProps {
  readonly saved: number;
  readonly alreadySaved: number;
  readonly skipped: number;
  readonly onDismiss: () => void;
}

/** "3 places added · 5 already saved · 1 couldn't be pinned" — only the true clauses. */
export function importConfirmationText(
  saved: number,
  alreadySaved: number,
  skipped: number,
): string {
  const added = saved - alreadySaved;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? 'place' : 'places'} added`);
  if (alreadySaved > 0) parts.push(`${alreadySaved} already saved`);
  if (skipped > 0) parts.push(`${skipped} couldn’t be pinned`);
  // Every clause false means a save that added nothing new and skipped nothing — possible only
  // when `saved === alreadySaved === 0`, which the caller never renders. Kept total anyway.
  return parts.length > 0 ? parts.join(' · ') : 'Nothing new to add';
}

export function ImportConfirmation({
  saved,
  alreadySaved,
  skipped,
  onDismiss,
}: ImportConfirmationProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    /* Sits *below* the account chip on a phone rather than beside it: both live in the same top
       band, and at 390px a centred strip and a right-aligned pill overlap — verified on a
       Pixel-sized run, where the banner covered the email chip. At `lg+` the viewport is wide
       enough that a centred, max-28rem strip clears a right-aligned chip, so it moves back up. */
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-40 flex justify-center px-3 lg:top-4"
    >
      <div className="pointer-events-auto flex max-w-[min(28rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1.5 pl-3 pr-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-md">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)]">
          <Check className="size-3.5" aria-hidden />
        </span>
        <p className="truncate text-xs font-semibold text-foreground">
          {importConfirmationText(saved, alreadySaved, skipped)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
