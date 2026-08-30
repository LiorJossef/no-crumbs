'use client';

/**
 * F2-F5 — the rail the user watches while the import runs.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 991-1134) by W6-1. `RailStep` stays
 * private to this file; only `RailScreen` is exported.
 *
 * **The rail may claim no stage the server did not send** (`facelift-plan.md` §5, and the reason
 * `resolve` is not in `stages` below). **W6-2 edits this file next**: it splits the source fetch
 * into its own sub-second request, which finally lets `source: done` be reported when the fetch
 * *resolves* rather than when it is issued, and deletes the honest approximation that stands in for
 * it today. The sequencing itself belongs to the run module, not here — one `AbortController` has
 * to cover both requests or Cancel stops covering either.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/domain/import/events';
import { railWaitLine } from '@/ui/import/rail-wait-line';

import type { RailState, StageStatus } from '../_lib/screen';
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
        <ScreenKicker icon={<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />} label="Working on it" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Adding your TikTok
        </h1>
        {/* `aria-live="polite"`: the line changes while the user is waiting and a screen reader
            user has no other way to learn that anything is still happening. */}
        <p aria-live="polite" className="text-sm font-medium text-muted-foreground">
          {railWaitLine(elapsedMs)}
        </p>
      </div>

      <ol className="flex flex-col gap-0">
        {stages.map((stage, i) => (
          <RailStep
            key={stage}
            stage={stage}
            status={rail[stage]}
            fact={
              stage === 'source' ? rail.sourceFact : stage === 'extract' ? rail.extractFact : null
            }
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
  progress,
  isLast,
}: {
  stage: PipelineStage;
  status: StageStatus;
  fact: string | null;
  progress: { readonly index: number; readonly total: number } | null;
  isLast: boolean;
}) {
  const activeCopy =
    status === 'active'
      ? progress
        ? `Matching locations… ${progress.index} of ${progress.total}`
        : `${STAGE_LABEL[stage]}…`
      : null;

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            status === 'done' && 'border-brand bg-brand text-white',
            status === 'active' && 'border-brand bg-transparent text-brand',
            status === 'pending' && 'border-border bg-transparent text-muted-foreground',
          )}
        >
          {status === 'done' && <Check className="size-4" aria-hidden />}
          {status === 'active' && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {status === 'pending' && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
        </span>
        {!isLast && (
          <span
            className={cn(
              'my-1 w-0.5 flex-1 transition-colors',
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
        {status === 'done' && fact && <p className="text-sm font-medium text-muted-foreground">{fact}</p>}
        {status === 'active' && activeCopy && (
          <p className="text-sm font-medium text-brand">{activeCopy}</p>
        )}
      </div>
    </li>
  );
}
