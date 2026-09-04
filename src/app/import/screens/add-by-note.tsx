'use client';

/**
 * The second recovery on the no-places screen: the person who watched the video says what the
 * caption did not, in one sentence, and we read that instead — `spec-no-places-found.md` §4.5,
 * §5.5 and §6.9.
 *
 * ## Why this is not the retry §11.7 bans, and the distinction is the whole design
 *
 * §1 forbids a retry, and the reason it gives is mechanical rather than aesthetic: *"a retry
 * re-reads the same caption and returns the same nothing; offering it is a lie about our
 * capability."* Every word of that survives. **What this sends is not the same input.** The caption
 * is unchanged and would still yield nothing; the sentence beside it did not exist a moment ago,
 * and it came from the only source that has it — a person who watched the video.
 *
 * `docs/evidence/extraction/note-extractor-2026-09-01.md` is what makes that a fact rather than a
 * hope: posts yielding a candidate went 1 of 5 to 3 of 5, with **nothing invented** on either
 * control (a sentence with no name, and a sentence naming only a city). One of the three is
 * `@emshelx`, which the evidence base filed `futile` because the creator withholds the name in the
 * caption *and* in the audio. Nothing else in the design reaches that post.
 *
 * So this control is offered under the rule §11.7 actually protects, restated in §6.9: **no
 * affordance may re-run a read whose inputs have not changed.** The submit is disabled until
 * something is typed, and it is disabled again the moment the field returns to what was already
 * read.
 *
 * ## Why the copy contains no noun for what you type
 *
 * `voice-and-vocabulary.md` §3 ratifies **note** as "the user's own sentence about a place" — and
 * the review screen two steps later already spends that word on `Add a note` / `Your note`, which
 * is a *different thing*: that one is kept on the saved place forever, this one is read once and
 * discarded. One word, two meanings, two screens apart is exactly what §3's one-word-per-thing rule
 * exists to stop, and the screen with the weaker claim on the word is this one. Every string below
 * therefore names the **act** and never the object: *tell us what you saw*, *read it*. The wire
 * field is still `note`, because that is what the route calls it.
 *
 * ## Why it is revealed rather than always on screen
 *
 * Three reasons, and the first is `spec-no-places-found.md` §4.4's own sentence: the screen is type,
 * one hairline, one field and one caption panel. Two open text fields stacked in the thumb zone is
 * a form, which is the thing §4.1 says a field in the action zone must not become. Second, this one
 * costs a model call and the sibling above it does not, so the intent should be explicit before we
 * spend it. Third, it is genuinely the second question: a person who has the name outright is
 * better served by `AddByName` above — an exact provider result, no model in the path — and this is
 * for the answer that is a sentence rather than a name.
 *
 * ## One read per tap
 *
 * §6.4's cost rule, inherited unchanged from the sibling and for the same reason. No submit on
 * keystroke, blur or paste; a second submit while one is in flight is **refused** rather than
 * queued or aborted-and-restarted. The guard is a ref set synchronously before the first `await`,
 * so a burst dispatched inside one task finds it held — `inFlightProbe`'s shape, twice over, since
 * the hook this calls into holds the same guard again.
 *
 * ## One line, never a textarea
 *
 * §2 forbids a textarea on this screen outright — *"if this screen ever grows a textarea, the
 * product has failed its own premise"* — and the ban is about the shape as much as the content: a
 * multi-line box is an invitation to paste the post's own text back at us, which is the premise
 * failure, not a sentence a person wrote. This is a one-line `input`, and widening it would be the
 * banned control wearing a different name.
 */

import { useId, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ENTER_REVEAL, LEAVE_REVEAL, REVEAL_BEAT } from '@/lib/interaction';

/** What one read came back as. `places` never reaches this component's state — the screen has
 *  already changed under it by then — and `abandoned` covers a read that lost its race or was
 *  aborted, where the correct thing to render is whatever the user is already looking at. */
export type ReadNoteOutcome = 'places' | 'nothing' | 'unavailable' | 'offline' | 'abandoned';

/** `spec-no-places-found.md` §5.5, verbatim. Nothing below composes a sentence at its call site. */
const OFFER = 'Tell us what you saw, in your own words.';
/** An example rather than an instruction, and it is the shape the measurement actually used
 *  (`note-extractor-2026-09-01.md`'s first row). It teaches in one glance the two things that make
 *  a sentence work here — that it may be a sentence, and that a name in it is what we can use —
 *  which no imperative of the same length manages. */
const PLACEHOLDER = 'The bakery is called Pita Lila';
const SUBMIT = 'Read it →';
const SUBMIT_PENDING = 'Reading…';
/** Blameless and symmetrical with the headline above it: the same sentence we made about the
 *  caption, made about this. No apology, and nothing about what they should have written. */
const NOTHING = 'We read that too, and it doesn’t name a place either.';
const UNAVAILABLE = 'Reading isn’t working right now. Try again in a moment.';
/** Identical to the sibling's, deliberately — one string per thing, and being offline is the same
 *  fact whichever control the user reached for. */
const OFFLINE = 'You’re offline. Check your connection and try again.';

/**
 * The route trims and bounds at 500 (`api/imports/probe/route.ts`), and this is that bound restated
 * where a person can feel it rather than a second policy.
 *
 * Deliberately **not** `domain/places/note.ts`'s `NOTE_MAX_LENGTH` (2,000): that governs the note
 * kept on a saved place, which is prose someone may come back and extend. This is one sentence read
 * once, and importing the other constant would tie two limits that have no reason to move together.
 */
const MAX_LENGTH = 500;

type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'settled'; readonly message: string; readonly read: string };

export function AddByNote({
  className,
  onRead,
  onSubmitted,
}: {
  className?: string;
  /** Re-runs the import with this sentence beside the caption, and takes the screen to the review
   *  beat if it produced anything. Resolves with what happened when it did not, so this component
   *  renders the outcome and the screen does not move. */
  onRead: (note: string) => Promise<ReadNoteOutcome>;
  /** The caption panel collapses on submit, exactly as it does for the sibling's search (§6.5): it
   *  has done its job, and ~150px of read text between the question and its answer is the thing
   *  that rule exists to remove. */
  onSubmitted: () => void;
}) {
  const fieldId = useId();
  const panelId = useId();
  const statusId = useId();
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  /** The read in flight. A ref rather than state, set synchronously before the first `await`, so a
   *  burst of submits dispatched inside a single task finds it held and returns. */
  const inFlight = useRef(false);

  const open = phase.kind !== 'closed';
  const pending = phase.kind === 'pending';
  const typed = note.trim();
  /**
   * The rule §11.7 is amended into (§6.9): a read may never re-run on inputs that have not changed.
   * After a read that found nothing, the same sentence is exactly the retry the screen forbids, and
   * the button stays disabled until it is edited.
   */
  const alreadyRead = phase.kind === 'settled' && phase.read === typed;

  async function submit() {
    if (typed === '' || inFlight.current || alreadyRead) return;
    // Checked here rather than after the request, so an offline submit costs nothing and says the
    // true thing immediately.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase({ kind: 'settled', message: OFFLINE, read: '' });
      return;
    }
    inFlight.current = true;
    setPhase({ kind: 'pending' });
    onSubmitted();
    try {
      const outcome = await onRead(typed);
      // `places` took the screen and this component is already gone; `abandoned` means the read
      // lost its race or the user left, and the honest render for that is the one they are looking
      // at. Neither sets state.
      if (outcome === 'nothing') setPhase({ kind: 'settled', message: NOTHING, read: typed });
      else if (outcome === 'unavailable') setPhase({ kind: 'settled', message: UNAVAILABLE, read: '' });
      else if (outcome === 'offline') setPhase({ kind: 'settled', message: OFFLINE, read: '' });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className={cn('flex shrink-0 flex-col gap-2', className)}>
      {/* Always mounted, never created alongside its first message — a live region that arrives in
          the same commit as its content is not reliably announced. Polite, and never `alert`:
          a sentence that named no place is a result, not a failure. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {phase.kind === 'settled' ? phase.message : ''}
      </p>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) {
            setPhase({ kind: 'closed' });
            return;
          }
          setPhase({ kind: 'idle' });
        }}
        className="flex h-11 w-full items-center gap-1 text-start text-sm font-bold text-brand"
      >
        {OFFER}
        <ChevronDown
          className={cn('size-3.5 shrink-0', open ? `${REVEAL_BEAT} rotate-180` : LEAVE_REVEAL)}
          aria-hidden
        />
      </button>

      {open && (
        // A real `<form>`, so Enter and the phone keyboard's Go key both submit — the paste field's
        // own fix is the precedent.
        <form
          id={panelId}
          className={cn('flex flex-col gap-2', ENTER_REVEAL)}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {/* The trigger above is the visible label and it does not move when the panel opens, so
              the field takes an invisible copy of the same words rather than a second phrasing. */}
          <label htmlFor={fieldId} className="sr-only">
            {OFFER}
          </label>
          {/*
            **The field takes the whole width and the button sits under it**, which is where this
            block stops looking like the name search above it and starts looking like what it is.

            Measured at 390x844 before the change: the shared row left the field 235px, and the
            example placeholder rendered as `The bakery is called Pita Lil` — the teaching device
            cut mid-word — while a typed sentence scrolled out of its own box at about twenty
            characters, so a person could not read back what they had written. A word fits beside a
            button; a sentence does not, and this field's whole premise is that you may write one.
          */}
          <div className="flex flex-col gap-2">
            <Input
              id={fieldId}
              /*
               * Focus moves in on reveal, and this is the opposite of §6.3's ban rather than an
               * exception to it: that ban is about a keyboard nobody asked for on a screen three
               * imports in four arrive at. A user who taps the line above asked for exactly this.
               *
               * `autoFocus` rather than a ref and a deferred `.focus()`, and the reason is iOS: a
               * programmatic focus outside the gesture's own task moves the caret without raising
               * the software keyboard, which is the worst of both. This field mounts inside the
               * tap's discrete update, so the attribute is applied while the gesture still counts.
               */
              autoFocus
              type="text"
              // A sentence a person writes, so: the phone's Go key, ordinary sentence
              // capitalisation, and both correction aids left on — the opposite of the sibling's
              // proper-noun field on every count.
              enterKeyHint="go"
              autoCapitalize="sentences"
              maxLength={MAX_LENGTH}
              // Tel Aviv is a target city and this is free prose: a Hebrew sentence must render
              // RTL inside the LTR chrome, with its embedded Latin place name in the right order.
              dir="auto"
              placeholder={PLACEHOLDER}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-12 w-full min-w-0 rounded-lg border-2 border-input px-4 text-base font-medium"
            />
            <Button
              type="submit"
              disabled={pending || typed === '' || alreadyRead}
              className="h-12 w-full gap-1.5 rounded-lg px-4 text-base font-bold"
            >
              {/* `hidden` + `motion-safe:block` rather than a bare `motion-safe:animate-spin`: a
                  stationary three-quarter arc reads as a rendering artefact, not a paused spinner.
                  Hiding it is only safe because `Reading…` beside it never leaves — and that word
                  is the rail's own, so the wait reads as the same act the user already watched. */}
              {pending && (
                <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
              )}
              {pending ? SUBMIT_PENDING : SUBMIT}
            </Button>
          </div>
          {phase.kind === 'settled' && (
            // Muted body text in the register of the screen around it — no destructive colour and
            // no icon. Red is reserved for a failed *add*, which is a real failure of an action the
            // user took. The sentence stays in the field so it can be edited rather than retyped.
            <p className="text-caption font-medium text-muted-foreground">{phase.message}</p>
          )}
        </form>
      )}
    </div>
  );
}
