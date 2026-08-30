'use client';

/**
 * One candidate, as a decision rather than a readout — the card the review screen is a list of.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 1247 to the end of the file) by W6-1.
 *
 * **W6-4 edits this file next**: provenance takes the badge slot, and settledness demotes to the
 * line provenance vacates. Two rules it inherits from the split and does not get to renegotiate.
 *
 * **No band literal lives here.** No `'preselect'`, no `'confirm'`, no `'no_match'`, no
 * `'not_attempted'`. Every one of those mappings is `deriveResolution`'s, read through
 * `ui/import/candidate-resolution-view.ts`; a second copy in the UI is how the screen and the
 * server end up disagreeing about what was saved, and
 * `tests/unit/import/one-result-collapse.test.ts` asserts its absence. The `view.kind === 'matched'`
 * below is a colour decision on an already-derived kind, not a second derivation of the band.
 *
 * **It stays a component.** It calls `useId` and `useState`, so turning it into a `renderCard(…)`
 * helper called from the same `.map()` would break the rules of hooks — and not always loudly.
 */

import { useId, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Crosshair, MapPinOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isolate } from '@/ui/place/active-area';
import {
  candidateMeta,
  candidateTitle,
  isHashtagOnly,
  isSaveable,
  locationLine,
} from '@/domain/import/candidate-presentation';
import { googleMapsSearchUrl } from '@/domain/places/google-maps-search-url';
import type { PlaceCandidate } from '@/domain/types';
import {
  effectivePick,
  pickRequiredNotice,
  resolutionChip,
  resolutionExplanation,
  resolutionHeadline,
  resolutionOptions,
  resolverPinLine,
  savedPlaceName,
  willSave,
  type CandidateResolutionView,
} from '@/ui/import/candidate-resolution-view';

import type { ItemStatus } from '../../_lib/save-extracted-candidates';

/** Post-save outcome chips. Shown only after a partial failure, when the user stays on this screen
 *  and every card has to say what became of it — including `already_saved`, which a re-import used
 *  to report as a fresh save it had not made. */
export const STATUS_CHIP: Record<ItemStatus, { readonly label: string; readonly className: string }> = {
  saved: { label: 'Saved', className: 'bg-accent text-brand' },
  already_saved: { label: 'Already on your map', className: 'bg-muted text-muted-foreground' },
  skipped: { label: 'No location', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Couldn’t save', className: 'bg-destructive/10 text-destructive' },
};

/**
 * One candidate, as a decision rather than a readout.
 *
 * Two zones separated by a hairline: above it, what we believe this place is; below it, how sure
 * we are about *where* it is and the one tap that settles it. That structure is the
 * extracted-versus-inferred story without a legend to learn.
 *
 * The Google Maps link is a sibling of the toggle, not a child — an `<a>` inside a `<button>` is
 * invalid and needs event-propagation tricks to behave. This shape needs none.
 */
export function ExtractedCandidateRow({
  candidate,
  caption,
  view,
  pick,
  selected,
  frozen,
  status,
  collapsed,
  onToggle,
  onPick,
}: {
  candidate: PlaceCandidate;
  /** The post's caption, which is where "is this name only in a hashtag?" is decided. */
  caption: string | null;
  /** What the resolver made of this candidate, already derived (`ui/import/candidate-resolution-view.ts`). */
  view: CandidateResolutionView;
  /** The user's explicit shortlist choice, or `null` for "they haven't chosen". */
  pick: number | null;
  selected: boolean;
  frozen: boolean;
  status: ItemStatus | null;
  /** The single-confident-result layout (`ux-import-flatten.md` §3): the screen's H1 already
   *  carries this candidate's name and meta, so the card drops its own chrome, its tickbox and
   *  that name. Only ever true for a `matched` view — see `collapsesToOneResult`. */
  collapsed: boolean;
  onToggle: () => void;
  onPick: (optionIndex: number) => void;
}) {
  // The name the SAVE will write, never the model's guess at it — `savedPlaceName` explains why the
  // two used to differ on screen. Falls back to the caption's reading when nothing resolved.
  const title = savedPlaceName(view, pick) ?? candidateTitle(candidate);
  // Not `isSaveable(candidate)`: a candidate the resolver matched is saveable even with no model
  // coordinate, because the server derives the pin from the stored shortlist entry.
  const saveable = willSave(isSaveable(candidate), view, pick);
  const chip = status === null ? null : STATUS_CHIP[status];
  const options = resolutionOptions(view);
  const chosen = effectivePick(view, pick);
  /** The chosen row itself, not just the name `savedPlaceName` reads off it: the Google Maps link
   *  needs its address too, which is the only thing that tells two branches of one chain apart. */
  const chosenRow = options.find((option) => option.index === chosen) ?? null;
  const chosenOption =
    chosenRow === null ? null : { name: chosenRow.name, detail: chosenRow.address };
  const needsPick = pickRequiredNotice(isSaveable(candidate), view, pick);
  const optionsId = useId();
  /** The shortlist is progressive disclosure, opened by `Not this place?` — except when there is
   *  nothing chosen for it to be an alternative *to*, which is the one card that has to ask. Held
   *  as initial state rather than derived, so it stays open once opened even after picking. */
  const [optionsOpen, setOptionsOpen] = useState(chosen === null);
  /**
   * Whether the shortlist is worth offering at all. Owner ruling, 2026-08-29: **more than one**
   * option, because `Not this place?` over a list of exactly one is asking the user to pick a
   * different one when there is no different one.
   *
   * The second arm is the card that has no answer yet — a sole option nothing has chosen still
   * has to be reachable, or that card can never be saved and the screen never says why.
   */
  const showsShortlist = options.length > 1 || (options.length > 0 && chosen === null);
  const badge = resolutionChip(view, pick);

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <div className="flex items-baseline gap-2">
        {/* `<bdi>` and `line-clamp-1` rather than `truncate`, on every name and address line of
            this screen — the ruling the saved-place list and popover already made
            (`place-sheet.tsx`): a Hebrew name in an LTR row is flipped by the chip beside it, and
            an ellipsis on an RTL string clips the *start*, which is the half that identifies it. */}
        <p className="line-clamp-1 font-heading text-[15px] font-bold text-foreground">
          <bdi>{title}</bdi>
        </p>
        {chip ? (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', chip.className)}>
            {chip.label}
          </span>
        ) : (
          // The resolver's state, in the same slot the post-save outcome uses — never both, and
          // never the same colour: a matched candidate is the only one that gets the mint accent,
          // so an ambiguous one can never be mistaken for a settled one at a glance.
          badge !== null && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                badge.tone === 'settled'
                  ? 'bg-accent text-brand'
                  : 'bg-muted text-foreground',
              )}
            >
              {badge.label}
            </span>
          )
        )}
      </div>
      {/* Category and address, and nothing else. Owner ruling, 2026-08-29: one clean result.
          Three blocks are gone from here and each was saying something already on screen — the
          caption's own wording for the name ("The caption called it …") directly under the name
          it resolved to, the verbatim caption fragment under that, and a duplicate warning naming
          a pin the user is about to harmlessly re-save. */}
      <p className="line-clamp-1 text-[13px] font-medium text-muted-foreground">
        <bdi>{candidateMeta(candidate)}</bdi>
      </p>
      {isHashtagOnly(caption, candidate) && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">Only mentioned in a hashtag.</p>
      )}
    </div>
  );

  /* The shortlist, **closed by default** (owner ruling, 2026-08-29).
     Rendered outside the toggle button on purpose — a radio inside a checkbox is invalid
     markup and needs propagation tricks to behave. Only `matched` and `ambiguous` have
     options; every other state renders exactly what it rendered before this existed.

     Open on arrival in exactly one case: nothing is chosen yet. That is not an exception to
     the ruling but the reason it is safe — a card the resolver could not settle has no
     default to present as the clean single result, and hiding its options would leave a
     card that cannot be saved and does not say why. Everywhere else the resolver has an
     answer, and asking the user to audit it before they have doubted it is the busywork
     this closes. */
  const shortlist = showsShortlist && status === null && (
    // The hairline and the inset belong to the card. Collapsed, there is no card to sit inside,
    // so this block carries the screen's own margin instead.
    <div
      className={cn(
        'flex flex-col gap-1.5',
        !collapsed && 'border-t border-border/60 px-4 pt-2.5 pb-1',
      )}
    >
        {!optionsOpen ? (
          <button
            type="button"
            disabled={frozen}
            aria-expanded={false}
            aria-controls={optionsId}
            onClick={() => setOptionsOpen(true)}
            className="flex h-11 w-fit items-center gap-1 text-xs font-bold text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            Not this place?
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
        ) : (
        <>
        <div className="flex flex-col gap-0.5">
          <p
            id={`${optionsId}-label`}
            className={cn(
              'text-[11px] font-bold tracking-[0.08em] uppercase',
              view.kind === 'matched' ? 'text-brand' : 'text-foreground',
            )}
          >
            {resolutionHeadline(view)}
          </p>
          <p className="text-xs font-medium text-muted-foreground">{resolutionExplanation(view)}</p>
        </div>
        <ul id={optionsId} role="radiogroup" aria-labelledby={`${optionsId}-label`} className="flex flex-col gap-1">
          {options.map((option) => {
            const isChosen = chosen === option.index;
            return (
              <li key={option.index}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  disabled={frozen}
                  onClick={() => onPick(option.index)}
                  className={cn(
                    // min-h-11 rather than a fixed height: the address wraps to two lines on a
                    // 390px viewport far more often than it fits on one, and a clipped address
                    // is the one thing this control exists to show.
                    'flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                    isChosen ? 'border-brand bg-accent/40' : 'border-border/60 bg-background',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                      isChosen ? 'border-brand' : 'border-border',
                    )}
                  >
                    {isChosen && <span className="size-2 rounded-full bg-brand" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-1 text-[13px] font-bold text-foreground">
                      <bdi>{option.name}</bdi>
                    </span>
                    {/* The address, not the name, is what tells two branches of a chain apart —
                        so it wraps rather than truncating. */}
                    <span className="text-xs font-medium break-words text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {needsPick && (
          <p className="text-xs font-semibold text-foreground">{needsPick}</p>
        )}
        </>
        )}
    </div>
  );

  const pinRow = (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        !collapsed && 'border-t border-border/60 px-4 py-1.5',
      )}
    >
      {/* Not `truncate`. This line's only job is to say where the pin came from, so clipping it
          removes the whole message — measured at 412 px, "Approximate pin from the caption"
          rendered as "Approximate pin from the ca…". Wrapping costs a few pixels of height and
          never costs meaning. */}
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-tight text-muted-foreground">
        <Crosshair className="size-3.5 shrink-0" aria-hidden />
        {resolverPinLine(view, pick, isSaveable(candidate)) ?? locationLine(candidate)}
      </span>
      <a
        href={googleMapsSearchUrl(candidate, chosenOption)}
        target="_blank"
        rel="noreferrer"
        aria-label={
          saveable
            ? `Check “${isolate(title)}” on Google Maps`
            : `Find “${isolate(title)}” on Google Maps`
        }
        className="flex h-11 shrink-0 items-center gap-1 text-xs font-bold text-brand"
      >
        {saveable ? 'Check on Google Maps' : 'Find on Google Maps'}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </a>
    </div>
  );

  // The single-confident-result layout (`ux-import-flatten.md` §3). Gone: the tickbox (one legal
  // value is not a control), the resolver chip, the card's border and surface (one card is not a
  // list), and the name — the screen's own H1 carries it now. Kept: where the pin came from, the
  // Google Maps check, and the shortlist behind `Not this place?`.
  //
  // The pin line is read from `resolverPinLine` exactly as the full card reads it, so this layout
  // states its provenance rather than assuming it — and `collapsesToOneResult` only ever returns
  // true for a `matched` view, whose pin is a provider row and never the caption's.
  if (collapsed) {
    return (
      <li className="flex shrink-0 flex-col gap-1.5">
        {isHashtagOnly(caption, candidate) && (
          <p className="text-xs font-medium text-muted-foreground">Only mentioned in a hashtag.</p>
        )}
        {pinRow}
        {shortlist}
      </li>
    );
  }

  return (
    <li
      className={cn(
        'flex shrink-0 flex-col rounded-xl border',
        !saveable
          ? 'border-dashed border-border/70 bg-muted/40'
          : selected
            ? 'border-border/70 bg-card'
            : 'border-border/50 bg-muted/50',
        status === 'failed' && 'border-destructive/40 bg-card',
      )}
    >
      {saveable && status === null ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          disabled={frozen}
          onClick={onToggle}
          className="flex w-full items-start gap-3 rounded-t-xl px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-ring-offset-2 disabled:cursor-default"
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors motion-reduce:transition-none',
              selected
                ? 'border-brand bg-brand text-white'
                : 'border-border bg-transparent',
            )}
          >
            {selected && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          {body}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3 px-4 py-3.5">
          {/* Not a disabled checkbox: a control that cannot be operated is worse than no control.
              The text stays at full contrast — this is a stated outcome, not a degraded one. */}
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            {status === 'saved' || status === 'already_saved' ? (
              <Check className="size-4" />
            ) : (
              <MapPinOff className="size-4" />
            )}
          </span>
          {body}
        </div>
      )}

      {shortlist}

      {pinRow}
    </li>
  );
}
