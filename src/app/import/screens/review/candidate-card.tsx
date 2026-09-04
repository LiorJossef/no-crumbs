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

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Crosshair, MapPinOff, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ENTER_REVEAL, LEAVE_REVEAL, REVEAL_BEAT, TINT_BEAT } from '@/lib/interaction';
import { NOTE_MAX_LENGTH } from '@/domain/places/note';
import { isolate } from '@/ui/place/active-area';
import {
  candidateMeta,
  candidateTitle,
  isHashtagOnly,
  isTaggedAccountOnly,
  isSaveable,
  locationLine,
} from '@/domain/import/candidate-presentation';
import { googleMapsSearchUrl } from '@/domain/places/google-maps-search-url';
import { deriveSavedPlaceEnrichment } from '@/domain/import/saved-place-enrichment';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { ALREADY_ADDED_LINE } from '@/domain/import/prior-saves';
import type { PlaceCandidate } from '@/domain/types';
import {
  effectivePick,
  pickRequiredNotice,
  provenanceBadge,
  resolutionExplanation,
  resolutionHeadline,
  resolutionOptions,
  resolverPinLine,
  savedPlaceName,
  settlednessLine,
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
 * Shown once the note gets close enough to the limit that the number is useful rather than noise —
 * the same threshold, for the same reason, as the place sheet's editor
 * (`components/sheet/saved-place-edits.tsx`). Nobody writing "before 10, get the pistachio one"
 * will ever see it; somebody pasting a paragraph will.
 */
const COUNTER_VISIBLE_FROM = NOTE_MAX_LENGTH - 200;

/**
 * How many proposed tags a card shows before the rest become a count.
 *
 * Three, matching the library row's own fold (`splitRowTags`), so the review screen and the place
 * it becomes do not disagree about how many tags fit on one line. See `tagRow` for why the
 * remainder is a `+N` and not a silent truncation.
 */
const MAX_PROPOSED_TAGS_SHOWN = 3;

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
  note,
  selected,
  frozen,
  status,
  collapsed,
  alreadyAdded,
  onToggle,
  onPick,
  onNoteChange,
}: {
  candidate: PlaceCandidate;
  /** The post's caption, which is where "is this name only in a hashtag?" is decided. */
  caption: string | null;
  /** What the resolver made of this candidate, already derived (`ui/import/candidate-resolution-view.ts`). */
  view: CandidateResolutionView;
  /** The user's explicit shortlist choice, or `null` for "they haven't chosen". */
  pick: number | null;
  /** The note as typed, raw and untrimmed — `''` for "nothing written". Owned by the screen, not
   *  by this card, so it survives a re-render and is there when Save assembles the request. */
  note: string;
  selected: boolean;
  frozen: boolean;
  status: ItemStatus | null;
  /** The single-confident-result layout (`ux-import-flatten.md` §3): the screen's H1 already
   *  carries this candidate's name and meta, so the card drops its own chrome, its tickbox and
   *  that name. Only ever true for a `matched` view — see `collapsesToOneResult`. */
  collapsed: boolean;
  /**
   * This person already added a place with this name **from this same TikTok video**
   * (`domain/import/prior-saves.ts`). The card says so and the screen leaves it unticked; it is
   * never a refusal — the tickbox works, and picking a shortlist row or writing a note still ticks
   * it, because both are decisions about this place.
   *
   * **Not the global duplicate warning the owner rejected on 2026-08-29.** That one fired on any
   * place already anywhere on the map, said nothing, and left a single-candidate post with a dead
   * primary button. This is scoped to one source, is what round-3 feedback §6.1 measured, and the
   * screen leads with a sentence naming what was added before.
   */
  alreadyAdded: boolean;
  onToggle: () => void;
  onPick: (optionIndex: number) => void;
  onNoteChange: (value: string) => void;
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
  /**
   * The badge now answers **"where did this pin come from?"** (W6-4).
   *
   * It used to carry settledness in an 11px mint pill while provenance sat at the bottom of the
   * card in 12px grey — `facelift-plan.md` §1: the hierarchy inverted the epistemics. Settledness
   * has not gone; it is `settlednessLine` in the row this vacated.
   */
  const badge = provenanceBadge(isSaveable(candidate), view, pick);

  /**
   * **The tags this save will file the place under, shown before the save rather than after it.**
   *
   * Migration `0036` split one column into three: `tags_extracted` is what the model proposed,
   * `tags` is the user's vocabulary, and `tags_confirmed_at` is `NULL` for as long as nobody has
   * asserted it. Every tag in the database is currently in that unasserted state, and the reason is
   * this card: tags were written on every import and rendered on **no** screen until the place was
   * already on the map. `product-edge-2026-08-31.md` names refusing to assert what the user did not
   * confirm as the property this product is built on, and a word filed under someone's library that
   * they were never shown is exactly such an assertion.
   *
   * **Shown, not asked** — the ruling, and it is a ruling rather than a shortcut. Everything else on
   * this card works this way: the category, the address, the resolved name and the pin are all
   * *stated*, and pressing Save is what confirms them. Tags were the one fact on the card that was
   * neither stated nor confirmable, so showing them brings them up to the screen's existing consent
   * standard instead of inventing a second, higher one for a single field. A per-tag opt-out here
   * would be a second decision per candidate on the surface `ui-review-2026-08-31.md` finding 11
   * already measures as the least responsive in the product — and pruning a vocabulary is a
   * considered act that belongs in the library, next to the place, not inside a flow somebody is
   * trying to finish. The confirm route stamps `tags_confirmed_at` on exactly this basis, and only
   * when this row rendered (see `api/imports/confirm/route.ts`).
   *
   * **Derived by the function the server writes with, not by a second reading of the candidate.**
   * `deriveSavedPlaceEnrichment` is what `confirmOne` passes to `apply_saved_place_extraction`, so
   * the chips below and the column cannot say different things — which is the entire basis on which
   * the save is allowed to count as consent. A `candidate.tags` read here would look identical and
   * would be free to drift.
   *
   * They render exactly as the library renders them — same token pair, same pill, same
   * `tagDisplayLabel` — because "see what will be stored" is only true if this *is* what gets
   * stored. `<span>`s rather than the sheet's `<ul>`: this block sits inside the tickbox
   * `<button role="checkbox">`, a list inside a button is invalid markup, and being part of that
   * control's accessible name is the correct outcome anyway — the thing the user presses names the
   * tags it is going to write.
   */
  /** Where the caption actually named this place, when it named it only in a tag. One line, one
   *  fact, and never two at once — a name inside a hashtag is not also a tagged account. */
  const evidenceNote: string | null = isHashtagOnly(caption, candidate)
    ? 'Only mentioned in a hashtag.'
    : isTaggedAccountOnly(caption, candidate)
      ? 'Only mentioned as a tagged account.'
      : null;

  const proposedTags = deriveSavedPlaceEnrichment(candidate)?.tags ?? [];
  /**
   * **Three chips, then a count** (`ux-overwhelm-audit-2026-09-02.md` §7 item 13).
   *
   * **The audit's premise is wrong and the cap is kept anyway, which needs saying.** It counts
   * "0-6 tag pills" per card and multiplies them by three cards; the real ceiling is **two**.
   * `normaliseTags` truncates to `MAX_TAGS_PER_CANDIDATE` (= `MAX_SUB_TAGS_PER_PLACE` = 2) before
   * anything is stored, so no candidate the probe returns can carry a third tag, and this slice
   * does not bind on any data the product can currently produce. Verified by reading
   * `domain/extraction/tags.ts:84,247`, not by watching a screen — the pills are simply not the
   * density the audit measured, and the screen it photographed shows at most six across three
   * cards, not eighteen.
   *
   * It stays because it costs one `slice` and it is the taxonomy cap's only downstream guard: that
   * ceiling is a product decision that has already moved once (five to two), and the row it feeds
   * is the one place where growing it silently would file words under someone's library that this
   * card never showed them. `tests/unit/import/review-tags.test.ts` pins the two numbers against
   * each other so a future raise has to look here.
   *
   * **The consent argument above survives, and the `+N` is why.** It requires the tags to be
   * *shown* before the save writes them, not to be shown all at once, and a silent truncation
   * would fail it — a word filed under someone's library that they were never told about is the
   * assertion this card exists to refuse. `+2` is telling them: the count is exact, it is inside
   * the same tickbox and therefore inside the control's accessible name, and the full list is on
   * the place the moment it is saved. What is deliberately not here is a disclosure control —
   * this block sits inside a `<button role="checkbox">`, so a nested button is invalid markup,
   * and a second tap target per card is the density the audit is about.
   */
  const shownTags = proposedTags.slice(0, MAX_PROPOSED_TAGS_SHOWN);
  const hiddenTagCount = proposedTags.length - shownTags.length;
  const tagRow = proposedTags.length > 0 && (
    <span className="mt-1 flex flex-wrap gap-1">
      {shownTags.map((tag) => (
        <span
          key={tag}
          // Read by the browser measurement in `docs/`-filed evidence and by nothing in the app.
          data-review-tag=""
          dir="auto"
          className="inline-block max-w-full truncate rounded-full bg-tag px-2 py-0.5 text-micro leading-4 font-medium text-tag-foreground"
        >
          {tagDisplayLabel(tag)}
        </span>
      ))}
      {hiddenTagCount > 0 && (
        <span className="inline-block px-1 py-0.5 text-micro leading-4 font-medium text-muted-foreground">
          +{hiddenTagCount}
        </span>
      )}
    </span>
  );

  /** The note's own disclosure, closed on arrival. See `noteRow` for why it may not be an
   *  always-open field, and why the text itself lives in the screen rather than here. */
  const noteId = useId();
  const [noteOpen, setNoteOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteText = note.trim();

  // Tapping `Add a note` is a request to type, so the field takes the caret — and on a phone that
  // is what raises the keyboard, which is the whole difference between one tap and two. Fires on
  // the open transition only; on mount `noteOpen` is false and this does nothing.
  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <div className="flex items-baseline gap-2">
        {/* `<bdi>` and `line-clamp-1` rather than `truncate`, on every name and address line of
            this screen — the ruling the saved-place list and popover already made
            (`place-sheet.tsx`): a Hebrew name in an LTR row is flipped by the chip beside it, and
            an ellipsis on an RTL string clips the *start*, which is the half that identifies it. */}
        {/* `text-reading` (0.96875rem) rather than `text-[15px]`. **Not a pure rename** — it is
            half a pixel larger — but it is the registered scale for this size class, five other
            call sites already use it, and 15 was this card's own number rather than the system's. */}
        <p className="line-clamp-1 font-heading text-reading font-bold text-foreground">
          <bdi>{title}</bdi>
        </p>
        {chip ? (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-micro font-bold', chip.className)}>
            {chip.label}
          </span>
        ) : (
          // Where the pin came from, in the same slot the post-save outcome uses — never both.
          //
          // Three tones, and `caption` is the one that had to stop being the quiet one. A pin the
          // model guessed is not a lesser version of a matched pin, it is a different kind of
          // claim, and painting it grey is what made it the quietest thing on the card. Mint stays
          // exclusive to `settled`, so a caption pin can never be mistaken for a verified one at a
          // glance — which is the exit criterion, read cold.
          //
          // `bg-card-2`, not `bg-muted`: `--muted` and `--background` are the same value in this
          // palette (#FAF9F6), so a muted pill has no pill at all — the defect
          // `components/ui/skeleton.tsx` records for `--accent` on `--card`, one token across.
          // Caught by looking at the rendered screen, not at the diff.
          //
          // `shrink-0` and no `truncate`: `From the map data` is seventeen characters in an 11px
          // pill, and this codebase has already shipped the clipped version of this exact sentence
          // once (`candidate-resolution-view.ts`'s note on 208px into a 180px box). It takes the
          // width it needs and the name beside it clamps instead. It may never truncate.
          badge !== null && (
            <span
              className={cn(
                // **`font-medium`, not `font-bold`.** This is a label on the name beside it, and it
                // was set heavier than the name it labels — `From the map data` in bold beside
                // `HaKosem` in bold reads as two headings on one row. The three tones are
                // untouched: mint stays exclusive to `settled` and the caption pin keeps its amber,
                // because the tone is the claim and only the weight was the shouting.
                'shrink-0 rounded-full px-2 py-0.5 text-micro font-medium',
                badge.tone === 'settled' && 'bg-accent text-brand',
                badge.tone === 'caption' && 'bg-warning/10 text-warning',
                badge.tone === 'needs_pick' && 'bg-card-2 text-foreground',
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
      <p className="line-clamp-1 text-caption font-medium text-muted-foreground">
        <bdi>{candidateMeta(candidate)}</bdi>
      </p>
      {/* Above the tags and the evidence note, not in the badge slot: that slot answers "where did
          this pin come from?" and is already spoken for on every card. This answers a different
          question — "have I done this already?" — and it is the reason the box below it is
          unticked, so it sits where a reason sits. Warning-toned rather than grey because it is
          news, and grey is what made the rejected 2026-08-29 version invisible. */}
      {alreadyAdded && status === null && (
        <p className="text-xs font-medium text-warning">{ALREADY_ADDED_LINE}</p>
      )}
      {tagRow}
      {evidenceNote !== null && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">{evidenceNote}</p>
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
        {/* One line, not a stacked block (E-T4, feedback round 3 §2.7). The words are unchanged —
            they are ruled copy — but the treatment was an 11px uppercase tracked label over a
            second sentence, inside a modal the same feedback calls dense. Uppercase + letter-
            spacing is the loudest type this screen owns and it was spending it on a question that
            already has a radio group under it. Sentence case, one row, the explanation trailing in
            muted weight: the same two facts, one block instead of two. */}
        {/* `font-semibold`, and the muted colour on the matched card: the heading half of this line
            was heavier and darker than the option names it introduces, which are `text-caption
            font-bold`. A label may not outweigh its content. The ambiguous card keeps
            `text-foreground` — there the line is a question the user has to answer before the card
            can be saved, and it is the only thing on the card that says so. */}
        <p id={`${optionsId}-label`} className="text-xs leading-5 font-medium text-muted-foreground">
          <span className={cn('font-semibold', view.kind === 'matched' ? 'text-brand' : 'text-foreground')}>
            {resolutionHeadline(view)}
          </span>{' '}
          {resolutionExplanation(view)}
        </p>
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
                    // The unchosen rows keep the border's *metrics* and drop its ink (E-T4): a
                    // stack of outlined boxes inside an outlined card inside a modal is the
                    // density the feedback is about, and the radio dot already says these are
                    // options. `border-transparent` rather than removing the border, so nothing
                    // shifts by a pixel when a row becomes the chosen one.
                    isChosen ? 'border-brand bg-accent/40' : 'border-transparent bg-card-2/60',
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
                    <span className="line-clamp-1 text-caption font-bold text-foreground">
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

  /**
   * The user's own sentence, written at the one moment they still know why they are saving.
   *
   * The note is the only field in this whole request the user authors
   * (`domain/import/confirm.ts`), it is **searchable** afterwards (`domain/places/search.ts`), and
   * until now it existed only in the place sheet — days later, when the reason has gone and
   * re-watching the video is the only way to recover it. This is the same field, offered while it
   * is still free.
   *
   * **A disclosure, never an open textarea.** `ui-review-2026-08-31.md` finding 11 already names
   * this screen the least responsive surface in the product; a stack of open fields on a
   * four-candidate review would make the worst screen worse. Closed, it is one 44px text button.
   * It borrows the shortlist's own `Not this place?` idiom rather than inventing a second
   * disclosure vocabulary two rows apart, and the beats are `interaction.ts`'s named ones — so the
   * chevron turns in at 200ms and out at 140, and a reduced-motion reader gets the panel's fade
   * with none of its travel (`ENTER_REVEAL`'s opacity arm is deliberately unprefixed).
   *
   * **Optional, and it has to read that way.** No asterisk, no "required", brand-coloured link
   * weight rather than a filled control: the screen's job is deciding what to save, and a note
   * that looks compulsory would make people think they owe it a sentence.
   *
   * **The rule where the note meets the tickbox**, which is the one place these two could fight:
   *
   *  - A note is only ever saved *with* its place. There is no other row it could go on.
   *  - So writing one **ticks the place** — the same rule `pick()` already applies to choosing a
   *    shortlist entry, and for the same reason: an authored decision about this card that left it
   *    unticked would be silently discarded at Save. Only on the empty → non-empty transition, so
   *    a user who deliberately unticks a card they already annotated can keep typing without the
   *    tick springing back.
   *  - Unticking never deletes what they wrote. The text stays, stays visible, and the card says
   *    plainly that it is not going anywhere until the place is selected.
   *
   * Not offered on a card that cannot be saved, and not after a save has reported outcomes — in
   * both of those states there is no request left for a note to ride on.
   */
  const noteRow = saveable && status === null && (
    <div
      className={cn(
        'flex flex-col gap-1',
        // The hairline and the inset belong to the card. Collapsed, there is no card to sit
        // inside, so this block takes the screen's own margin — the same split `shortlist` makes.
        !collapsed && 'border-t border-border/60 px-4 pb-2',
      )}
    >
      <button
        type="button"
        disabled={frozen}
        aria-expanded={noteOpen}
        aria-controls={noteId}
        onClick={() => setNoteOpen((open) => !open)}
        className="flex h-11 w-fit items-center gap-1.5 text-xs font-bold text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <Pencil className="size-3.5 shrink-0" aria-hidden />
        {noteOpen ? 'Your note' : noteText === '' ? 'Add a note' : 'Edit your note'}
        <ChevronDown
          className={cn('size-3.5 shrink-0', noteOpen ? `${REVEAL_BEAT} rotate-180` : LEAVE_REVEAL)}
          aria-hidden
        />
      </button>

      {noteOpen ? (
        <div id={noteId} className={cn('flex flex-col gap-1', ENTER_REVEAL)}>
          <textarea
            ref={noteRef}
            // `dir="auto"`: a note is free-form prose and Tel Aviv is a target city, so it is
            // routinely Hebrew — the same treatment the place sheet's editor and the shared
            // collection note already carry.
            dir="auto"
            rows={2}
            // The database's own limit, restated (`domain/places/note.ts`). Enforced here rather
            // than validated afterwards, so the field cannot reach a state that disables Save —
            // one fewer way for this screen to end with a dead primary button.
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            disabled={frozen}
            aria-label="Your note"
            onChange={(event) => onNoteChange(event.target.value)}
            onKeyDown={(event) => {
              // Escape closes the field, and stops there: the shell also listens for it, and an
              // Escape meant for a textarea should never close the import.
              // Enter does NOT close — a note is prose, and stealing Enter makes a second line
              // impossible to type (`saved-place-edits.tsx` settled this).
              if (event.key === 'Escape') {
                event.stopPropagation();
                setNoteOpen(false);
              }
            }}
            placeholder="Why are you saving this?"
            className={cn(
              // Restated from the place sheet's editor rather than shared: a `<textarea>` cannot
              // be an `<Input>`, and that file's copy is the only other one in the tree.
              // `TINT_BEAT` is the border warming under a pointer — the micro tier, named.
              TINT_BEAT,
              // `text-base` up to `md`, and it is not a style choice: iOS Safari zooms the
              // viewport on focusing any field under 16px, and this one sits inside a scroll
              // region on the screen a phone user reaches most often.
              'w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-base leading-relaxed outline-none hover:border-ring/60 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
            )}
          />
          {/* Absent rather than invisible until it matters. The sheet's editor holds the line to
              stop its Save row jumping; there is no row under this one to jump, and every pixel
              on this screen is contested. */}
          {noteText.length >= COUNTER_VISIBLE_FROM && (
            <p className="text-end text-micro font-medium text-muted-foreground">
              {noteText.length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        noteText !== '' && (
          // Closed, the note is still on the card. It is the one thing here the user wrote, and
          // hiding it behind the affordance that wrote it would make `Edit your note` a button
          // whose subject is invisible — and would hide the note this card is about to not save.
          // `whitespace-pre-wrap` because `validateNote` preserves newlines.
          <p
            dir="auto"
            className="line-clamp-2 text-xs leading-relaxed font-medium whitespace-pre-wrap text-foreground"
          >
            {noteText}
          </p>
        )
      )}

      {/* The deselect rule, said out loud on the one card it is true of. Nothing was lost — the
          text is right there — and the sentence names the single action that saves it. */}
      {!selected && noteText !== '' && (
        <p className="text-xs font-semibold text-warning">Select this place to save your note.</p>
      )}
    </div>
  );

  /**
   * What this row says now that the badge above it carries provenance (W6-4).
   *
   * **The collapsed layout is the exception, and it is not a fork.** That layout deletes the card,
   * the tickbox, the name and the badge slot — the screen's own H1 carries the name — so this row
   * is the only place provenance can live there, and it keeps `resolverPinLine`'s long form.
   * `collapsesToOneResult` only ever returns true for a `matched` view, so the sentence it renders
   * is always `Pin from the map data`; the collapse can never be the thing that hides a guess.
   *
   * On the full card this row takes what the badge gave up: settledness, so a user who read three
   * addresses and chose one still sees that their choice took. When there is no settledness to
   * report and no pin either, it falls back to what it has always said about a candidate with
   * nowhere to go.
   */
  const pinLine = collapsed
    ? (resolverPinLine(view, pick, isSaveable(candidate)) ?? locationLine(candidate))
    : (settlednessLine(view, pick) ?? (saveable ? null : locationLine(candidate)));

  const pinRow = (
    <div
      className={cn(
        'flex items-center gap-2',
        // The Maps link keeps its edge when there is no line beside it, rather than sliding left
        // into the space and changing the card's geometry per state.
        pinLine === null ? 'justify-end' : 'justify-between',
        !collapsed && 'border-t border-border/60 px-4 py-1.5',
      )}
    >
      {/* Not `truncate`. This line's only job is to say where the pin came from, so clipping it
          removes the whole message — measured at 412 px, "Approximate pin from the caption"
          rendered as "Approximate pin from the ca…". Wrapping costs a few pixels of height and
          never costs meaning. */}
      {pinLine !== null && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-tight text-muted-foreground">
          {/* The crosshair means "this is about where the pin is". Settledness is about the
              decision, not the coordinate, so it gets the tick instead — the same mark the
              tickbox and the saved-outcome chip already use for "this one is answered". */}
          {collapsed || settlednessLine(view, pick) === null ? (
            <Crosshair className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Check className="size-3.5 shrink-0" aria-hidden />
          )}
          {pinLine}
        </span>
      )}
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
        {/* The collapsed layout deletes the card and its `body`, so this is where the tags go: the
            screen's own H1 and meta line sit directly above, which is the position they hold on the
            full card too. Without this branch the one layout a *confident* single result gets would
            be the only one that saved tags without showing them. */}
        {tagRow}
        {evidenceNote !== null && (
          <p className="text-xs font-medium text-muted-foreground">{evidenceNote}</p>
        )}
        {pinRow}
        {shortlist}
        {noteRow}
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
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 motion-safe:transition-colors',
              selected
                ? 'border-brand bg-brand text-brand-foreground'
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

      {noteRow}
    </li>
  );
}
