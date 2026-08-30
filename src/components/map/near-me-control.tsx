'use client';

/**
 * The near-me button, and the sentence it shows when the answer is no (`L1-F11-T1`).
 *
 * It draws itself in the map's own control column because that is where a locate control is looked
 * for, but it owns nothing: the permission, the fix and the camera flight all live with the caller
 * (`map-page-client.tsx`, camera mover 8). This file turns a `NearMeControlModel` into a button and
 * a notice.
 *
 * ## Why it replaced `MapControls`' own locate button
 *
 * `components/ui/map.tsx` ships one (`showLocate`) and it was switched on. Two things made it
 * unusable for this feature and neither is fixable from outside that registry file: a denial is
 * `console.error` and a stopped spinner, which is a silent no-op on screen — precisely what the
 * exit criterion forbids — and it flies the camera itself at a hard-coded zoom, from inside the
 * surface, making it a seventh camera mover that no enumeration knew about. The position also never
 * reaches the page, so `T2` could not be built on it at all.
 *
 * ## The failure states are the feature
 *
 * A refusal is the common case for a control like this, so it gets a designed answer rather than an
 * error: the button stays pressable (the way back, once the browser setting changes, is one tap),
 * and a dismissible line says what happened and points at the alternative that is already on
 * screen — the area list, which every one of these states leaves working.
 */

import { Locate, LocateFixed, LocateOff, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { NearMeStatus } from './near-me';

export interface NearMeControlModel {
  readonly status: NearMeStatus;
  /** The line to show under the button, or `null` for none. Composed by the caller because the
   *  useful version of it ("Nothing saved near you yet") is a fact about the library, which this
   *  component has no business knowing. */
  readonly notice: string | null;
  readonly onRequest: () => void;
  readonly onDismissNotice: () => void;
}

/** Says what the button will do, never what it looks like. `Find my location` while it is the
 *  offer; the failure wording would otherwise leave a screen reader user with a button whose name
 *  is a complaint. */
const BUTTON_LABEL = 'Find my location';

export function NearMeControl({
  status,
  notice,
  onRequest,
  onDismissNotice,
}: NearMeControlModel) {
  const locating = status === 'locating';
  const refused = status === 'denied' || status === 'unavailable';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {notice !== null && (
        <div
          role="status"
          className="flex max-w-[min(17rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/70 bg-card/95 py-1.5 pl-2.5 pr-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-md"
        >
          <p className="pt-0.5 text-xs font-medium text-muted-foreground">{notice}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismissNotice}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      {/* The same shell `MapControls` gives its own groups, so the near-me button and the zoom
          buttons read as one column of controls rather than as two unrelated widgets. */}
      <div className="flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-sm">
        <button
          type="button"
          onClick={onRequest}
          aria-label={BUTTON_LABEL}
          // `pressed` and not `disabled` while locating: the button has to stay in the
          // accessibility tree and keep its focus, and a second tap during a ten-second wait is
          // harmless — `getCurrentPosition` simply answers both callers.
          aria-busy={locating}
          aria-pressed={status === 'located'}
          className={cn(
            // 40px, matching `MapControls`' own buttons; see their note on the 44px floor.
            'flex size-10 items-center justify-center transition-colors',
            'hover:bg-accent dark:hover:bg-accent/40',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
            status === 'located' && 'text-brand',
          )}
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : refused ? (
            // A struck-through locator, so the state is legible without opening the notice and
            // survives the notice being dismissed. Shape, never colour alone.
            <LocateOff className="size-4" aria-hidden />
          ) : status === 'located' ? (
            <LocateFixed className="size-4" aria-hidden />
          ) : (
            <Locate className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
