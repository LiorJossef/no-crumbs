'use client';

/**
 * F2-F5 — the rail the user watches while the import runs.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 991-1134) by W6-1. `RailStep` stays
 * private to this file; only `RailScreen` is exported.
 *
 * **The rail may claim no stage the server did not send** (`facelift-plan.md` §5, and the reason
 * `resolve` is not in `stages` below).
 *
 * W6-2 split the source fetch into its own sub-second request, so `source: done` is now reported
 * when the fetch **resolves** rather than when it is issued, and the honest approximation that
 * stood in for that is deleted rather than kept alongside it. The sequencing lives in
 * `_lib/use-import-run.ts`, not here: one `AbortController` has to cover both requests or Cancel
 * stops covering either.
 *
 * What that buys this screen is `rail.post` — the thumbnail, the `@handle` and the caption of the
 * post the user just pasted, on screen within about a second while the 7-34s model call runs
 * underneath. **It renders only when the server has actually sent it.** `post === null` means the
 * preview has not landed or did not, and the honest rendering of both is the block simply not
 * being there; nothing here may fill it from the pasted URL or from a timer.
 */

import { useEffect, useState } from 'react';
import { Check, Link2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/domain/import/events';
import { railExtractFactParts } from '@/ui/import/rail-extract-fact';
import { railWaitLine } from '@/ui/import/rail-wait-line';

import type { RailState, StageStatus } from '../_lib/screen';
import { CountTick } from './count-tick';
import { ScreenKicker } from './screen-kicker';

/* ------------------------------------------------------------------------------------------- *
 * F2–F5 — the three-stage rail
 * ------------------------------------------------------------------------------------------- */

const STAGE_LABEL: Record<PipelineStage, string> = {
  source: 'Reading the TikTok',
  extract: 'Finding the places',
  resolve: 'Matching locations',
};

export function RailScreen({
  rail,
  onCancel,
}: {
  rail: RailState;
  onCancel: () => void;
}) {
  /**
   * Two stages, not three.
   *
   * `resolve` was on this rail and never left `pending`, because `/api/imports/probe` is one
   * request and one response: there is no boundary inside it between extraction and resolution for
   * anything to report crossing. So the rail displayed a step it could never run, and the last
   * thing a user saw before the results was a grey "Matching locations" that stayed grey.
   *
   * The honest fix is the opposite of marking it done on a timer — that would be inventing
   * progress, which is the one thing this product must not do. `PipelineStage` keeps all three
   * values, because the *pipeline* genuinely has three; this list is what the rail can honestly
   * narrate today, and the third comes back when `L0-F6`'s streaming route can drive it.
   */
  const stages: readonly PipelineStage[] = ['source', 'extract'];

  /**
   * Elapsed time, only so the line below can stop claiming "a few seconds" through a 30-second
   * wait. One second is the coarsest tick that still lets the copy change on its thresholds, and
   * the interval is cleared on unmount — this screen is replaced the moment the probe answers.
   */
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-1 pb-10">
        {/* `hidden` + `motion-safe:block`: a frozen `Loader2` arc reads as a rendering artefact,
            and `Working on it` beside it never leaves, so the state stays findable without it. */}
        <ScreenKicker
          icon={<Loader2 className="hidden size-3.5 motion-safe:block motion-safe:animate-spin" aria-hidden />}
          label="Working on it"
        />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Adding your TikTok
        </h1>
        {/* `aria-live="polite"`: the line changes while the user is waiting and a screen reader
            user has no other way to learn that anything is still happening. */}
        <p aria-live="polite" className="text-sm font-medium text-muted-foreground">
          {railWaitLine(elapsedMs)}
        </p>
      </div>

      {/* The post, once the server has actually sent it (`RailState.post`, W6-2). Its visual
          language is the review screen's source row on purpose: the same 48px still, the same
          handle line, so the object the user is watching being read is recognisably the same
          object they then confirm.

          The caption is shown expanded and clamped rather than behind a disclosure. On the review
          screen the caption is evidence for a rarer question and is collapsed by default; here it
          is the only thing on screen that proves we read the right post, and there is nothing else
          for the user to do for the next half-minute. Four lines is enough to recognise a post and
          short enough that the rail stays the subject. */}
      {rail.post !== null && (
        <div className="mb-8 flex flex-col gap-2.5 rounded-lg border border-border/70 bg-card p-3">
          <div className="flex items-center gap-3">
            {rail.post.thumbnailUrl ? (
              // A signed, ~6-month-expiry remote TikTok CDN URL; not worth a next/image
              // remotePatterns entry. `referrerPolicy="no-referrer"` for the same reason the review
              // screen's copy of this row carries it: without it the browser hands TikTok's CDN the
              // URL of the screen the user is on. It does not hide the request — the CDN still sees
              // the IP and the user agent — it only stops us telling them where from.
              <img
                src={rail.post.thumbnailUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-12 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-md bg-card-2 text-muted-foreground"
              >
                <Link2 className="size-4" />
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">
              {rail.post.authorHandle ? `@${rail.post.authorHandle}’s TikTok` : 'This TikTok'}
            </p>
          </div>
          {rail.post.caption !== null && (
            <p className="line-clamp-4 text-caption font-medium text-muted-foreground">
              {rail.post.caption}
            </p>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-0">
        {stages.map((stage, i) => (
          <RailStep
            key={stage}
            stage={stage}
            status={rail[stage]}
            fact={
              stage === 'source' ? rail.sourceFact : stage === 'extract' ? rail.extractFact : null
            }
            /* The count, for the one step where the number is the news (W6-3). `null` everywhere
               else, and `null` at zero — `railExtractFactParts` returns `null` there, so no
               counting component mounts on the modal outcome of an import. The hold still does
               (`overnight-copy-deck.md` §9.2): same beat, same pace, only the true sentence
               differs. */
            countParts={stage === 'extract' ? railExtractFactParts(rail.extractCount ?? 0) : null}
            progress={stage === 'resolve' ? rail.candidateProgress : null}
            isLast={i === stages.length - 1}
          />
        ))}
      </ol>

      <div className="mt-auto flex flex-col gap-2 pt-10">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 w-full rounded-lg text-sm font-bold">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RailStep({
  stage,
  status,
  fact,
  countParts,
  progress,
  isLast,
}: {
  stage: PipelineStage;
  status: StageStatus;
  fact: string | null;
  /** The number to count up to and the words after it, or `null` where there is no number to count
   *  — every stage but `extract`, and `extract` when nothing was found. */
  countParts: { readonly count: number; readonly rest: string } | null;
  progress: { readonly index: number; readonly total: number } | null;
  isLast: boolean;
}) {
  /**
   * What the fact line says while a step is running — and it is `null` unless the server has sent
   * something to say.
   *
   * It used to fall back to `${STAGE_LABEL[stage]}…`, so step two read `Finding the places` above
   * `Finding the places…`: a slot filled rather than a fact reported. Step one is the contrast that
   * makes it obvious — `Reading the TikTok` above `Read @demo's TikTok` tells the user *which*
   * TikTok and that it is done, which the label could not.
   *
   * This is the same rule W6-2 is built on, one line down: **the rail may claim no stage the server
   * did not send**, and a line that restates its own label is decoration standing where a claim
   * goes. An empty slot is honest; the spinner beside the label already says it is running. The
   * `progress` branch stays because a count *is* a fact — it arrives with the streaming route,
   * which is also when `resolve` rejoins `stages`.
   */
  const activeCopy =
    status === 'active' && progress
      ? `Matching locations… ${progress.index} of ${progress.total}`
      : null;

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border-2 motion-safe:transition-colors',
            status === 'done' && 'border-brand bg-brand text-brand-foreground',
            status === 'active' && 'border-brand bg-transparent text-brand',
            status === 'pending' && 'border-border bg-transparent text-muted-foreground',
          )}
        >
          {status === 'done' && <Check className="size-4" aria-hidden />}
          {/*
            The one spinner in this flow that may **not** simply be hidden under reduced motion.

            Everywhere else a label beside the spinner carries the state, so removing the glyph
            costs nothing. Here the glyph *is* the state — check, spinner, dot is a three-way
            indicator — and hiding it would leave the running step's circle emptier than the
            pending step's, which has a dot. The active step would read as *less* marked than the
            one that has not started.

            So the reduced form is the dot the system already uses for "not done", inheriting
            `text-brand` from the active circle rather than `pending`'s muted grey. Three states,
            three appearances, no arc frozen mid-rotation.
          */}
          {status === 'active' && (
            <>
              <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
              <span className="size-1.5 rounded-full bg-current motion-safe:hidden" aria-hidden />
            </>
          )}
          {status === 'pending' && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
        </span>
        {!isLast && (
          <span
            className={cn(
              'my-1 w-0.5 flex-1 motion-safe:transition-colors',
              status === 'done' ? 'bg-brand' : 'bg-border',
            )}
            aria-hidden
          />
        )}
      </div>
      <div className="flex min-h-8 flex-col gap-0.5 pb-7">
        <p
          className={cn(
            'text-sm font-bold',
            status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {STAGE_LABEL[stage]}
        </p>
        {status === 'done' && fact && (
          <p className="text-sm font-medium text-muted-foreground">
            {countParts === null ? (
              fact
            ) : (
              <>
                {/* The whole settled sentence, for the accessibility tree only. A digit stepping
                    through 0, 1, 2, 3 is four announcements of a number changing for decorative
                    reasons, so the tick beside this is `aria-hidden` and this is what is read. */}
                <span className="sr-only">{fact}</span>
                <CountTick value={countParts.count} className="font-bold text-brand" />
                <span aria-hidden> {countParts.rest}</span>
              </>
            )}
          </p>
        )}
        {status === 'active' && activeCopy && (
          <p className="text-sm font-medium text-brand">{activeCopy}</p>
        )}
      </div>
    </li>
  );
}
