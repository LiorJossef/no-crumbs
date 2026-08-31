'use client';

/**
 * Caption preview — the real landing screen. Shows exactly what the real `SourceAdapter` +
 * `ContentExtractor` + `PlaceExtractor` + plausibility gate produced: the caption, plainly, and
 * every surviving `PlaceCandidate` with every field the schema carries
 * (`domain/extraction/schema.ts`), plus the resolver's shortlist for it.
 *
 * The shortlist is a control, not a readout. A `preselect` candidate shows its match and lets the
 * user override it; a `confirm` candidate shows the options and refuses to choose for them; and
 * every other state renders exactly as it did before the picker existed.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 818-827 and 847-1245) by W6-1.
 *
 * **`probe` is one prop, one object, passed by reference — never spread into props.** `views`
 * memoises on `probe.candidates`, and `saveableIndices` and the initial `selected` are derived
 * from that memo. Spreading `{...screen.probe}` would give `candidates` a new identity on every
 * shell render, the memo would never hit, and the initial selection would run against a fresh
 * array. Nothing visibly breaks, which is what makes it worth writing down.
 *
 * **`captionSave` stays in the shell** and arrives as four props. A save failure re-shows *this*
 * screen with an inline error rather than transitioning, which is why it was never a member of
 * the `Screen` union — and `partialNotice` names saves that really happened and cannot be
 * recomputed, so it has to survive anything that remounts this component.
 */

import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, Link2, Loader2, SearchCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  candidateMeta,
  candidateTitle,
  isSaveable,
  saveButtonLabel,
  skippedNotice,
} from '@/domain/import/candidate-presentation';
import {
  arrivesTicked,
  collapsesToOneResult,
  resolutionOptions,
  resolutionView,
  savedPlaceName,
  willSave,
} from '@/ui/import/candidate-resolution-view';
import { IMPORT_ERROR_ACTION_LABEL } from '@/ui/import/import-error-copy';

import type { ProbeSuccess } from '../../_lib/probe-contract';
import type { CandidatePick, ItemStatus } from '../../_lib/save-extracted-candidates';
import { ScreenKicker } from '../screen-kicker';
import { ExtractedCandidateRow } from './candidate-card';

export function CaptionPreviewScreen({
  probe,
  saving,
  error,
  partialNotice,
  statusByIndex,
  onSave,
  onContinue,
  onRetry,
}: {
  probe: ProbeSuccess;
  saving: boolean;
  error: string | null;
  /** Set only for a `partial_failure` save outcome — some candidates saved, some didn't. Swaps
   *  the primary action to "Continue to map" (the saved ones are real; there is nothing left to
   *  retry here) and freezes the list, with each card carrying its own outcome. */
  partialNotice: string | null;
  statusByIndex: ReadonlyMap<number, ItemStatus> | null;
  onSave: (picks: readonly CandidatePick[]) => void;
  onContinue: () => void;
  /** Back to an empty paste field. The primary action when nothing was found — which is the
   *  *modal* import outcome at this hit rate, so "try another link" is the main path through this
   *  screen, not an error recovery. */
  onRetry: () => void;
}) {
  const n = probe.candidates.length;
  const captionId = useId();
  const headingId = useId();
  const [captionOpen, setCaptionOpen] = useState(false);

  /**
   * Which candidates the user wants. Indices, because that is literally what the confirm request
   * takes (`ConfirmImportRequestSchema`'s `items: [{ candidateIndex, note }]`) — the endpoint has
   * always accepted a subset, the screen simply never offered one, and "Done" saved all eight
   * whether you wanted them or not.
   *
   * Preselected rather than empty: the primary path is "save what this TikTok gave me", and an
   * empty selection greets the user with a dead button that reads like a validation error. A
   * candidate the model could not place can never enter the set — not added-then-filtered — so
   * the count on the button is always the number of places that will actually be written.
   */
  /**
   * Which shortlist entry the user picked for each candidate, keyed by candidate index. Only
   * *explicit* picks live here — a `matched` candidate the user never touched stays absent, so
   * the request carries `optionIndex: null` and the server's own auto-accept decides. Recording a
   * `0` we invented would make the row read as a human choice it never was.
   */
  const [picks, setPicks] = useState<ReadonlyMap<number, number>>(() => new Map());

  /** The resolver's answer per candidate, derived once. `resolutionView` is the only mapping —
   *  the band itself comes from `deriveResolution`, the same function the confirm route uses. */
  const views = useMemo(
    () => probe.candidates.map((c) => resolutionView(c.resolution)),
    [probe.candidates],
  );

  /**
   * The candidates a Save would actually write.
   *
   * This used to be `isSaveable(c)` alone — "did the *model* give a coordinate?" — which hid every
   * candidate the resolver had matched but the model had failed to place, even though the server
   * derives that save's coordinate from the stored shortlist and would have written it happily.
   * `willSave` asks the server's question instead: a user pick, or a `preselect` auto-accept, or a
   * model coordinate. It is recomputed as picks change, because picking an option is exactly what
   * turns an unsaveable `ambiguous` candidate into a saveable one.
   */
  const saveableIndices = useMemo(
    () =>
      probe.candidates
        .map((c, i) => (willSave(isSaveable(c), views[i]!, picks.get(i) ?? null) ? i : -1))
        .filter((i) => i >= 0),
    [probe.candidates, views, picks],
  );

  /**
   * Every saveable candidate arrives **ticked**, including one the user already has.
   *
   * A duplicate check briefly un-ticked those, and the owner rejected it on 2026-08-29 for a
   * reason the screen made obvious: on a post whose only candidate was already saved, the single
   * card arrived off and `Select a place to save` was disabled, so the review screen offered
   * nothing to do at all. Save is the primary path and it must be live on arrival.
   *
   * Nothing is lost by ticking a duplicate: `save_place` is idempotent on `(user_id, place_id)`,
   * so re-saving a place the user has is a no-op that reports `already_saved` afterwards — which
   * is where that fact belongs, on the outcome rather than as a warning to read beforehand.
   *
   * **With one exception, and it is not that ruling being walked back** (defect G5, 2026-08-31).
   * `arrivesTicked` withholds the tick from the two views nothing was ever *looked up* for —
   * `capped` (past `MAX_CANDIDATES`) and `not_attempted` — which used to arrive ticked whenever the
   * model had guessed a coordinate, so the card with the least provenance on the screen saved by
   * default. The 2026-08-29 ruling is about a place we found and the user already has; this is
   * about a place nobody checked. Everything else the ruling covers still arrives ticked, including
   * the `unresolved`/`failed` cards whose pin also comes from the caption — we looked for those.
   *
   * `saveableIndices` above deliberately still counts them: they keep their checkbox, `Select all`
   * includes them, and the card says where its pin came from while the user decides
   * (`resolverPinLine`). This is a default, not a veto.
   */
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () =>
      new Set(
        probe.candidates
          .map((c, i) => (arrivesTicked(isSaveable(c), views[i]!) ? i : -1))
          .filter((i) => i >= 0),
      ),
  );

  /** Picking an option is a decision about *this* place, so it selects the card too — otherwise a
   *  user who picks the right branch of a chain and presses Save saves nothing, and the screen
   *  never said why. Changing a pick on an already-selected card leaves the selection alone. */
  function pick(candidateIndex: number, optionIndex: number) {
    setPicks((current) => new Map(current).set(candidateIndex, optionIndex));
    setSelected((current) => (current.has(candidateIndex) ? current : new Set(current).add(candidateIndex)));
  }

  // Counted over the saveable set rather than `selected.size`, so the number on the button is
  // always the number of places the request will actually write — never a card that is ticked but
  // has nothing to save.
  const selectedCount = saveableIndices.filter((i) => selected.has(i)).length;
  // Only the candidates that genuinely have nowhere to go: no map options *and* no model pin.
  // A candidate that is merely waiting for a pick has a location — several — and counting it as
  // "no location" contradicted the "Pick one of these to save it." on its own card.
  const unsaveableCount = probe.candidates.filter(
    (c, i) => !isSaveable(c) && resolutionOptions(views[i]!).length === 0,
  ).length;
  const allSelected = selectedCount === saveableIndices.length && saveableIndices.length > 0;
  const frozen = statusByIndex !== null || saving;

  /**
   * One candidate, and the resolver settled it — so the screen states the result instead of asking
   * a question with one legal answer (`ux-import-flatten.md` §3). The band is `collapsesToOneResult`'s
   * and therefore `deriveResolution`'s; this screen adds no threshold of its own.
   *
   * Suppressed once a save has reported per-card outcomes: that state's whole job is a status chip
   * on a card, and the collapsed layout has no card.
   *
   * What it does not touch is the decision. Save is still one explicit press and still says
   * `Nothing is saved until you tap Save.` — the collapse removes the sub-decisions (Charter §3
   * invariant 2).
   */
  const collapsed = statusByIndex === null && collapsesToOneResult(views);
  /** The name the save will write, exactly as the card derives it — so the H1 and the request can
   *  never name different places, and picking another row re-titles the screen. */
  const soleTitle =
    collapsed && probe.candidates[0]
      ? (savedPlaceName(views[0]!, picks.get(0) ?? null) ?? candidateTitle(probe.candidates[0]))
      : null;

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 pb-4">
        <ScreenKicker
          icon={<SearchCheck className="size-3.5" aria-hidden />}
          // The kicker carries the count and the H1 carries the name: at N = 1 the count is not
          // information — the screen shows one place — and "Review & confirm" names a process
          // rather than the result (`ux-import-flatten.md` §5).
          label={collapsed ? '1 place found' : 'Review & confirm'}
        />
        <h1
          id={headingId}
          className={cn(
            'font-heading text-2xl font-extrabold tracking-tight text-foreground',
            // A name, unlike a count, can be long and can be Hebrew: `<bdi>` below so the
            // surrounding punctuation cannot flip it, and two clamped lines rather than an
            // ellipsis that would eat the start of an RTL name.
            collapsed && 'line-clamp-2',
          )}
        >
          {/* No `n === 0` or `probe.caption === null` arm — see the list below for why
              neither can be reached from here. */}
          {collapsed ? (
            <bdi>{soleTitle}</bdi>
          ) : n === 1 ? (
            '1 place found'
          ) : (
            `${n} places found`
          )}
        </h1>
        {collapsed && probe.candidates[0] && (
          <p className="line-clamp-2 text-sm font-medium text-muted-foreground">
            <bdi>{candidateMeta(probe.candidates[0])}</bdi>
          </p>
        )}
      </div>

      {/* The source row. The thumbnail slot never collapses — its presence is the provenance
          promise, and an empty square reads better than a row that changes shape per post. */}
      <div className="flex shrink-0 items-center gap-3 pb-3">
        {probe.thumbnailUrl ? (
          // A signed, ~6-month-expiry remote TikTok CDN URL; not worth a next/image
          // remotePatterns entry. `referrerPolicy="no-referrer"` for the same reason the saved
          // place's thumbnail carries it: without it the browser hands TikTok's CDN the URL of the
          // screen the user is on. It does not hide the request itself — the CDN still sees the IP
          // and the user agent — it only stops us telling them where from.
          <img
            src={probe.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-card-2 text-muted-foreground"
          >
            <Link2 className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <a
            href={probe.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-sm font-semibold text-brand"
          >
            {probe.authorHandle ? `@${probe.authorHandle}’s TikTok` : 'This TikTok'}
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
          </a>
          {probe.caption !== null && (
            <button
              type="button"
              aria-expanded={captionOpen}
              aria-controls={captionId}
              onClick={() => setCaptionOpen((open) => !open)}
              className="flex h-6 items-center gap-1 text-caption font-medium text-muted-foreground"
            >
              {captionOpen ? 'Hide the caption' : 'Show the caption'}
              <ChevronDown
                className={cn(
                  'size-3.5 motion-safe:transition-transform',
                  captionOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>

      {/* Collapsed by default, and hard-capped when open. The caption is screen-level evidence for
          a rarer question ("what did this post actually say?") than the one each card already
          answers with its own verbatim fragment. Left expanded and uncapped — which is what this
          screen used to do — a thousand characters of ad copy, promo code included, pushed every
          place below the fold. The cap means an expanded caption can never do that again. */}
      {probe.caption !== null && captionOpen && (
        <div
          id={captionId}
          className="mb-3 max-h-38 shrink-0 overflow-y-auto overscroll-contain rounded-lg bg-card-2 p-3 text-caption leading-relaxed font-medium text-muted-foreground"
        >
          {probe.caption}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* No zero-candidate arm, and it is unreachable two ways. `submit()` sends every
            zero-candidate probe to `NoPlacesScreen` instead, so this component is only ever
            constructed with `n >= 1`. And a null caption can never get here either: the probe
            route initialises `candidates` to `[]` and only assigns it inside
            `if (caption !== null)` (`api/imports/probe/route.ts`), so no caption always means
            zero candidates, which always means `no_places`. Both facts are cross-module, so
            anything that splits this request in two has to re-establish them before assuming
            `n >= 1` here. */}
        {n >= 2 && statusByIndex === null && (
          <div className="flex shrink-0 items-center justify-between">
            {/*
              **The denominator is the headline's number, and that is the whole point of it.**

              It used to be `saveableIndices.length`, which produced `3 places found` in the H1 and
              `1 of 2 selected` in the line directly beneath it — two true statements whose
              relationship the screen never accounted for. A reader is told there are three, then
              that there are two, and cannot tell whether the product lost one, is hiding one, or
              is broken. That is §8a's Q3 one layer up from a false claim: not a lie, but two counts
              silently changing population between adjacent lines.

              The candidate that fell out was **not** the capped one — that is saveable and merely
              arrives unticked (W1-4). It was an `ambiguous` card with a real shortlist and no model
              pin: `willSave` is false for it until the user picks, so it was in the headline and
              not in the denominator. Both populations are now the same one, and each card accounts
              for itself in the badge slot W6-4 promoted — `Needs your pick` on that card, `Not
              checked` on the capped one.

              `Select all` therefore settles at `2 of 3` here rather than `2 of 2`, with the toggle
              reading `Deselect all`. That is the honest reading: everything that *can* be selected
              is, and the third card says on its face why it is not among them. Making the headline
              say 2 instead would be the other way of squaring the numbers, and it is the one
              `resolution-record.ts` forbids — a capped candidate is kept and visible rather than
              silently dropped, and W1-4 was entirely about not letting the least-verified card
              disappear into a default.
            */}
            <p className="text-caption font-medium text-muted-foreground">
              {selectedCount} of {n} selected
            </p>
            <button
              type="button"
              disabled={frozen}
              onClick={() => setSelected(allSelected ? new Set() : new Set(saveableIndices))}
              className="flex h-11 items-center text-caption font-bold text-brand disabled:opacity-50"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}

        {/* No screen-level caveat paragraphs. Owner ruling, 2026-08-29: two prose blocks
            apologising for the pin's provenance ("We couldn't reach the place database just
            now…", and the caveat quantifying it) sat between the heading and the first card,
            and the same fact is already on every card that has it — `Pin from the caption`,
            `Pin is approximate` — attached to the one place it is true of rather than
            asserted over the whole screen. The per-card line stays; these do not. */}
        <ul
          aria-labelledby={headingId}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1"
        >
          {probe.candidates.map((c, i) => (
            <ExtractedCandidateRow
              key={i}
              candidate={c}
              caption={probe.caption}
              view={views[i]!}
              pick={picks.get(i) ?? null}
              selected={selected.has(i)}
              frozen={frozen}
              status={statusByIndex?.get(i) ?? null}
              collapsed={collapsed}
              onToggle={() => toggle(i)}
              onPick={(optionIndex) => pick(i, optionIndex)}
            />
          ))}
        </ul>
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/70 pt-4">
        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {partialNotice && (
          <p role="status" className="text-center text-sm font-semibold text-foreground">
            {partialNotice}
          </p>
        )}
        {!partialNotice && skippedNotice(unsaveableCount) !== null && (
          <p className="text-center text-xs font-medium text-muted-foreground">
            {skippedNotice(unsaveableCount)}
          </p>
        )}

        {partialNotice ? (
          <Button
            type="button"
            onClick={onContinue}
            className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            Continue to map →
          </Button>
        ) : saveableIndices.length === 0 ? (
          <>
            <Button
              type="button"
              onClick={onRetry}
              className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              Try another link →
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onContinue}
              className="h-11 w-full rounded-lg text-sm font-bold"
            >
              {IMPORT_ERROR_ACTION_LABEL.back_to_map}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={() =>
                onSave(
                  saveableIndices
                    .filter((i) => selected.has(i))
                    .map((candidateIndex) => ({
                      candidateIndex,
                      optionIndex: picks.get(candidateIndex) ?? null,
                    })),
                )
              }
              disabled={saving || selectedCount === 0}
              className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              {/* `hidden` + `motion-safe:block`: a frozen three-quarter arc reads as a rendering
                  artefact, and `Saving…` beside it never leaves. */}
              {saving && (
                <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
              )}
              {saving ? 'Saving…' : saveButtonLabel(selectedCount)}
            </Button>
            {selectedCount === 0 && (
              // The only state with a dead primary is the one state that most needs a
              // thumb-reachable way out — the ✕ is a 36px target in the top-left corner.
              <Button
                type="button"
                variant="ghost"
                onClick={onContinue}
                className="h-11 w-full rounded-lg text-sm font-bold"
              >
                {IMPORT_ERROR_ACTION_LABEL.back_to_map}
              </Button>
            )}
            <p className="text-center text-xs font-medium text-muted-foreground">
              Nothing is saved until you tap Save.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
