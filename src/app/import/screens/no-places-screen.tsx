'use client';

/**
 * Lifted verbatim out of `import-page-client.tsx` (its lines 1136-1246) by W6-1.
 *
 * **W6-5 rebuilds this file**, and the split is deliberately neutral about how. Two things it must
 * not do, both of which the extraction was careful to leave possible: `onAddManually` stays a prop
 * that may be `null`, rather than `null` baked into the component or read from a React context only
 * `/map` provides — either would turn the standalone route's missing recovery from an absent prop
 * into a structural property. `spec-no-places-found.md` §10.1 replaces the first three props with
 * `probe: ProbeSuccess`; its strings do not change.
 */

import { ArrowUpRight, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IMPORT_ERROR_ACTION_LABEL } from '@/ui/import/import-error-copy';

/* ------------------------------------------------------------------------------------------- *
 * "No places found" — the modal outcome (~73% at LEVEL B), a success screen, never an error.
 *
 * `ux-architecture` §5.3 gives this screen three actions in order: `Add a place you know` → manual
 * add, `Try another TikTok`, and `Open the TikTok` as a tertiary text link.
 *
 * This screen once promised the first one while it did not exist. Its primary read `Add manually →`
 * under "That happens a lot — add it yourself in a few seconds", and it called `reset()` — an empty
 * paste field. On the *modal* import outcome, the biggest button in the product named a destination
 * we did not have, so it was withheld, for the same reason `ui/import/import-error-copy.ts`
 * withholds it from every failure screen: a recovery must point somewhere that works.
 *
 * Manual add shipped on 2026-08-30 (`components/add/add-sheet.tsx`, behind the `＋`), so the
 * recovery is back — and back under the same rule that removed it. It renders **only when the host
 * passed `onAddManually`**, i.e. only where there is a manual-add surface to open. The standalone
 * `/import` route has none and therefore still shows `Try another TikTok` as its primary, rather
 * than a button that would name a place the route cannot reach.
 * ------------------------------------------------------------------------------------------- */

export function NoPlacesScreen({
  authorHandle,
  url,
  hadCaption,
  onRetry,
  onAddManually,
}: {
  authorHandle: string | null;
  url: string;
  hadCaption: boolean;
  onRetry: () => void;
  /** Opens the manual-add surface. Absent wherever there is none — see this screen's header. */
  onAddManually: (() => void) | null;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-brand">
          <MapPin className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-brand uppercase">All done</p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-foreground">
            {hadCaption ? 'No places named' : 'Nothing to read'}
          </h1>
          {/* C70, `ux-architecture` §12.4, with the handle kept from this screen's own wording.
              The second sentence is the capability boundary said in human — at LEVEL B it is the
              product's main capability disclosure — and it is what replaced the manual-add
              promise. Still no blame: we read it, it simply had no name in it. */}
          {/* Two different facts, and conflating them is the thing this codebase will not do:
              a caption we read that named nothing, and a post that carried no caption at all. */}
          <p className="max-w-xs text-sm font-medium text-muted-foreground">
            {hadCaption ? (
              <>
                We read {authorHandle ? `@${authorHandle}’s TikTok` : 'this one'}, but it
                doesn&rsquo;t name a place we can put on a map. Some TikToks only show the place on
                screen.
              </>
            ) : (
              <>
                {authorHandle ? `@${authorHandle}’s TikTok` : 'This TikTok'} has no caption, and
                the caption is all we can read. Some TikToks only show the place on screen.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        {/* §5.3's hierarchy, and it only exists where the destination does. The user has a place in
            mind — they watched the video — and this is the one action that ends with it on their
            map; trying another link starts the whole wait again. Without a manual-add surface to
            open, `Try another TikTok` keeps the primary it has held since the dead `Add manually →`
            was removed. The retry label comes from the shared map so it cannot drift from the
            identical action on the failure screens. */}
        {onAddManually && (
          <Button
            type="button"
            onClick={onAddManually}
            className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            Add a place you know
          </Button>
        )}
        <Button
          type="button"
          variant={onAddManually ? 'outline' : 'default'}
          onClick={onRetry}
          className={cn(
            'w-full gap-1.5 rounded-lg font-bold',
            onAddManually ? 'h-11 text-sm' : 'h-12 text-base',
          )}
        >
          {IMPORT_ERROR_ACTION_LABEL.another_tiktok}
        </Button>
        {/* §5.1's "honesty move" — we found nothing, here is your thing back. Tertiary text link,
            the weight §5.3 gives it, and dropped entirely when there is no URL to open. */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-brand"
          >
            Open the original TikTok
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
