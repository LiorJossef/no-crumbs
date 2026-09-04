'use client';

/**
 * "No places in this one" — the **modal** outcome of an import, and a success state, never an error.
 *
 * Built to `docs/spec-no-places-found.md`, which is authoritative for this screen and whose strings
 * do not change. At LEVEL B's hit rate roughly 73% of imports land here, which is the whole reason
 * it gets this much care: it is not an edge case, it is the screen most users see most often, and
 * `mvp-plan.md` calls it a core surface rather than an error path.
 *
 * ## What it now shows, and why that is the package
 *
 * It used to show the user **nothing**: a mint circle, two sentences and two buttons. Not the post
 * they had just pasted, not the caption we had just read and were making a claim about. So the
 * screen asserted "it doesn't name a place" and gave the user no way to check, which is the
 * opposite of preserving evidence. The post and its caption are now on screen (§4.2), and the
 * caption is **expanded by default** — the inverse of the review screen's ruling, for the reason
 * that inverts with it: there the candidates are the content and a thousand characters of promo
 * copy pushed them below the fold; here there are no candidates, so the caption is the only content
 * there is, and collapsing it produces a screen that says "nothing here" twice.
 *
 * ## Three honest cases, and only three
 *
 * A (no caption) / B (nothing named) / C (an area but no venue), from `probe.emptyReason` — derived
 * server-side, never re-derived here. §3.2 is the ruling behind that shape: the individual drop
 * reasons are not reliable enough to make a claim to a user with (`evidence_not_in_caption` was
 * measured firing four times and being wrong four times out of four), and surfacing "we discarded
 * something" invites *show me what you discarded*, whose answer is model output we already judged
 * to be junk. Only `area_only` survives as its own case, because it is checkable and because it
 * changes what we can offer.
 *
 * **A `null`/unknown reason reads as case B.** That is the honest floor for a server that predates
 * the field and for a cache hit, where `filterPlausible` does not re-run.
 *
 * ## What is deliberately not here (§4.4)
 *
 * No illustration, no card around the whole thing, no badge or pill, no retry of the same URL, no
 * count of anything, no sentence defending the hit rate. The word "error" does not appear, and
 * neither do "sorry", "oops", "failed" or "couldn't". Charter §6's banned aesthetic is enforced by
 * subtraction: type, one hairline, one caption panel.
 *
 * **§4.4 is a guard as well as a sentence**, and `tests/unit/import/no-places-screen.test.ts`
 * still asserts every item above. What it no longer asserts is the mascot — see below.
 *
 * ## The face, and the four conditions it is here under (§4.4.1)
 *
 * §4.4 read *"No empty-state mascot"* until 2026-08-31. **Owner ruling, 2026-08-31**, recorded in
 * `spec-no-places-found.md` §4.4.1 with both sides: the exclusion is lifted for the `nothingFound`
 * face and for nothing else on that list.
 *
 * It reached the owner as a decision rather than landing as a diff because the ban was executable.
 * A first attempt at this hit the assertion, the face came out rather than the assertion, and the
 * question went up as *two documents disagree **and one of them is already a passing test***. The
 * spec was amended first, then the guard, then this — three commits, because a weakened gate may
 * never be a side effect of the change it permits.
 *
 * **The case against was not weak, and it is what shapes the four conditions.** The design system
 * is not unanimous with itself: `#ship` lists this spec as "No change", and `#apps` — drawing the
 * sibling case, the map's empty state — **declines the identical move**, showing it only as a
 * proposal with the shipping copy intact. Its substantive worry is the one to keep in view: a
 * mascot at the moment the user did not get what they wanted can read as *the product being
 * charming at them about its own failure*, which is precisely what §4.4 existed to prevent.
 *
 *  1. **The neutral face, and only that.** Flat eyes, flat mouth — not a frown, not a droop, not a
 *     shrug. `#moods`: *"a sad mascot turns the product's most common outcome into a small failure
 *     eight times a week. Neutral says that happens, and moves on."* That is
 *     `voice-and-vocabulary.md`'s never-apologetic rule drawn instead of written, on the screen the
 *     rule exists for. **A face is the most persuasive channel on this screen** and therefore the
 *     loudest possible way to break the thing the whole surface is built on: it must read *we did
 *     not find places*, never *there are none*, and it must never perform sympathy. Rendered
 *     against `beenThere`'s closed arcs at 48/56/64/84px and looked at: it reads deadpan, not
 *     rueful, and the two moods stay distinguishable at every one of those sizes.
 *  2. **Inline with the kicker, never centred above the headline.** §4.4's *reason* survives the
 *     ruling and governs the placement: the screen is still type, one hairline, one field and one
 *     caption panel. A small mascot on the kicker's own line leaves that sentence true; a large
 *     centred one makes it false and is the empty-state illustration §4.4 is actually about — which
 *     is also why the guard still asserts `Illustration`.
 *  3. **48px.** `#apps` drops the face below 32px — *"two dot eyes turn to mud"* — and the outlined
 *     artboard is 116 units to a crumb of 89, so a 48px box is 37px of ink: clear of that floor,
 *     and small enough to sit on the kicker's line.
 *  4. **No string changes.** §5's copy is untouched.
 *
 * **One element, so the ruling stays revisitable** — it was granted so it could be seen running.
 *
 * ## The variant this file is, and how finding 10 closes
 *
 * §5.4's **with-search** variant, which the spec says is the one to build now that manual add
 * exists. The add-by-name block is in the thumb zone (§4.1: reach, keyboard occlusion, and because
 * a field in the action zone under a sentence naming what it is for reads as an offer rather than
 * a form), and `Try another TikTok link` is the ghost secondary beneath it.
 *
 * **That block is what closes finding 10.** The standalone `/import` route silently withheld this
 * screen's primary recovery, because `onAddManually` opens the `＋` sheet and that sheet exists
 * only on `/map`. A field on this screen has no host to depend on, so the recovery is now present
 * on **every** entry point by construction rather than by a prop somebody remembered to thread.
 *
 * `onAddManually` is kept, and is now the *secondary* offer where a host has one: the `＋` sheet
 * searches the user's own library first, which the field here deliberately does not. It stays a
 * prop that may be `null` and renders only where its destination exists — a recovery only ever
 * points somewhere that works — but nothing is withheld when it is absent any more.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';

import { CrumbMascot } from '@/components/brand/crumb-mascot';
import { PlatformMark } from '@/components/brand/platform-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ENTER_REVEAL, ENTER_SCREEN, LEAVE_REVEAL, REVEAL_BEAT } from '@/lib/interaction';
import { emptyImportPriorSaveNotice } from '@/domain/import/prior-saves';
import { IMPORT_ERROR_ACTION_LABEL } from '@/ui/import/import-error-copy';

import type { ProbeSuccess } from '../_lib/probe-contract';
import { AddByName, type AddByNameOutcome } from './add-by-name';
import { AddByNote, type ReadNoteOutcome } from './add-by-note';

/**
 * The kicker, headline and body for one arrival (`spec-no-places-found.md` §5.1, verbatim).
 *
 * Case A is surfaced outright and cases B/C share a headline, which is §3.3's ruling: "there is no
 * caption on this one" and "the caption doesn't name anywhere" are different true statements, and a
 * user who pastes three caption-less posts in a row learns something from the first framing that
 * the second would hide. C drops the capability disclosure because it has already explained itself
 * and a third sentence makes the screen wordy — the disclosure survives on A and B, which together
 * are the overwhelming majority of arrivals.
 *
 * `That happens a lot.` is deliberately absent. It shipped, alongside `Some TikTok videos only show the
 * place on screen.`, and two normalising sentences is one too many — the second is the one that
 * edges toward defending the hit rate, which the owner ruling forbids. The capability fact stays;
 * the reassurance goes.
 */
function copyFor(
  emptyReason: ProbeSuccess['emptyReason'],
  cityHint: string | null,
): { readonly kicker: string; readonly headline: string; readonly body: React.ReactNode } {
  if (emptyReason === 'no_caption') {
    return {
      kicker: 'No caption',
      headline: 'This one has no caption.',
      body: 'We opened it fine — there’s just no caption to read. Some TikTok videos only show the place on screen.',
    };
  }
  if (emptyReason === 'area_only' && cityHint !== null) {
    return {
      kicker: 'We read it',
      headline: 'No places in this one.',
      // `<bdi>` around the hint: it can be Hebrew (`תל אביב`) sitting between English chrome, and
      // the surrounding punctuation would otherwise flip it.
      body: (
        <>
          We read the caption. It points at <bdi>{cityHint}</bdi>, but doesn’t name the place itself.
        </>
      ),
    };
  }
  // Case B, and the floor for an unknown reason: we do not know, so we do not claim.
  return {
    kicker: 'We read it',
    headline: 'No places in this one.',
    body: 'We read the caption, and it doesn’t name a place we can put on a map. Some TikTok videos only show the place on screen.',
  };
}

export function NoPlacesScreen({
  probe,
  onRetry,
  onBackToMap,
  onAddManually,
  onAdded,
  onReadNote,
}: {
  probe: ProbeSuccess;
  /** `Try another TikTok link`. Clears the link — see the note on the button. */
  onRetry: () => void;
  /** The same exit the ✕ takes. Rendered as a button too, because the ✕ alone is out of thumb
   *  reach on a tall phone (§5.4). */
  onBackToMap: () => void;
  /** Opens the host's manual-add surface, where the host has one — now the *secondary* offer,
   *  because the field below reaches the same recovery from every entry point. `null` is not a
   *  degradation to hide but the honest state of a surface with no `＋` sheet to open, and the
   *  button renders accordingly rather than naming a destination it cannot go to. */
  onAddManually: (() => void) | null;
  /** A place was added from this screen. The host closes the flow and flies the camera, exactly as
   *  it does after a confirm — a save from here is not a lesser save. */
  onAdded: (outcome: AddByNameOutcome) => void;
  /** Reads the link once more with a sentence the user wrote beside it (§6.9). It takes the screen
   *  to the review beat when that names somewhere, and resolves with the outcome when it does not
   *  — which is why this screen hands it straight to `AddByNote` and never branches on it. */
  onReadNote: (note: string) => Promise<ReadNoteOutcome>;
}) {
  const headingId = useId();
  const bodyId = useId();
  const captionId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  /**
   * Expanded on arrival, every time, and not persisted (§4.2).
   *
   * The caption is the evidence for the claim in the headline. A user checks it in one glance and
   * either agrees or spots the name themselves — and spotting it themselves is exactly the input
   * the manual-add recovery wants, so the two belong on screen together.
   */
  const [captionOpen, setCaptionOpen] = useState(true);

  const { kicker, headline, body } = copyFor(probe.emptyReason ?? null, probe.cityHint ?? null);

  /**
   * What this person already added **from this same TikTok video** (H2-T2).
   *
   * This screen is the modal outcome of the product, and a re-paste of a video someone has already
   * added lands here with `No places in this one.` and no account of why they have been here
   * before. `priorSaves` already rides the probe response for the review screen, so this is the
   * same fact reaching the screen that most needs it — no extra read, no new notion of sameness.
   *
   * `emptyImportPriorSaveNotice` rather than the review screen's `priorSaveNotice`: all three of
   * that one's endings describe the cards below the notice, and this screen has none. Its lead and
   * its list are the whole statement here.
   *
   * **It is not a correction and not a warning.** The headline stays true — we read this caption
   * and it names no place. This says the person's earlier reading of the same video is on their
   * map, which is the difference between a blank and an answer.
   */
  const priorNotice = emptyImportPriorSaveNotice(probe.priorSaves ?? []);

  /**
   * The arrival is announced by the focus move, not by a live region (§8.2).
   *
   * The H1 carries `aria-describedby`, so the headline and the body sentence are read as one
   * utterance. This screen must never be pushed into the shell's polite region: that one carries
   * failure copy, and announcing this as news of a failure would be precisely the lie the whole
   * screen exists to avoid. Nothing here uses `role="alert"` either.
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const sourceLabel = probe.authorHandle
    ? `@${probe.authorHandle}’s TikTok video`
    : probe.authorName
      ? `${probe.authorName}’s TikTok video`
      : 'This TikTok video';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', ENTER_SCREEN)}>
      {/*
        **Two flexible joints, above and below, so the slack is distributed instead of pooling
        above the pinned recovery.**

        Measured at 390x844: **223px between the caption panel and the add-by-name block, 26.4% of
        the viewport**, as one contiguous void — on the *modal* outcome of an import, which more
        users see than see the success path. Same defect as the rail screen's, fixed the same way in
        `cc9f6ce`, on the screen next door. **Nothing was invented to fill it**: §4.4 still governs
        what may be here and the answer is still type, one hairline, one field, one caption panel.

        **The joints go outside the claim-and-evidence pair, not between them**, and that is the
        whole design decision. Splitting the slack evenly at the obvious seam — claim | evidence |
        recovery — was tried first and measured 119px in each: it put a void between *"We read the
        caption, and it doesn't name a place"* and the caption that is the evidence for it. This
        screen exists because it used to make that claim and give the user no way to check
        (§4.2). Separating a claim from its evidence to improve the rhythm would spend the
        screen's reason on its spacing.

        So the pair floats together between one joint above and one below, and the fixed `pb-4`
        between them is unchanged.

        **The two joints are equal, and the top consequently reads a little airier than the bottom**
        — the shell already puts ~90px between the ✕ and the first line, so the *visual* split is
        about 200 above against 111 below rather than 111/111. Weighting them 1:2 fixes that and was
        built; it needs `flex-[2]`, and this screen's own guard bans arbitrary Tailwind values
        outright — *"everything else is a named token"* — with no `flex-2` in the scale to reach for
        instead. The guard is right and the imbalance is small, so the joints stay equal and the
        reason is written down rather than worked around. `AddByName` keeps its place in the thumb zone (§4.1) — it lost
        `mt-auto`, not its position: with no slack left to take, the lower joint holds it exactly
        where `mt-auto` did.

        **Floors, not bare `flex-1`.** The rail's first attempt collapsed to nothing wherever there
        was no slack and wedged the content together; a joint that distributes slack has to still be
        a joint when there is none. And joints rather than a centred block for the reason that bit
        there too: `justify-center` on an overflowing flex column pushes content off **both** ends,
        and this screen overflows readily — the caption panel is `max-h-38` and a 2,000-character
        caption fills it.
      */}
      <div className="min-h-2 flex-1" />

      <div className="flex shrink-0 flex-col gap-1 pb-4">
        {/*
          The kicker row. `gap-2.5` and **no margin utility on the mascot** — §11.21 bans bare
          directional utilities on this screen because the caption can be Hebrew, and the first
          attempt at this carried `-ml-1`, which would have nudged the wrong way in RTL. The guard
          caught it; the ruling that admitted the face did not license the bug.

          `aria-hidden`, with no label: the headline and the body sentence already say what
          happened, and they are what the focus move announces (§8.2). A face is not evidence and
          must not be read out as a second claim about the caption.
        */}
        <div className="flex items-center gap-2.5">
          <CrumbMascot mood="nothingFound" className="size-12 shrink-0" />
          <p className="text-micro font-bold tracking-[0.14em] text-brand uppercase">{kicker}</p>
        </div>
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          aria-describedby={bodyId}
          className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none"
        >
          {headline}
        </h1>
        {/* Full-opacity muted, never `/70`: §8.3 rules the faded variant below the bar, and this is
            the sentence the whole screen is built to let the user check. */}
        <p id={bodyId} className="max-w-xs text-sm font-medium text-muted-foreground">
          {body}
        </p>
      </div>

      {/* The source row. The thumbnail slot never collapses — its presence is the provenance
          promise, and an empty square reads better than a row that changes shape per post. The
          layout does not depend on the image existing (§4.3). */}
      <div className="flex shrink-0 items-center gap-3 pb-3">
        {probe.thumbnailUrl ? (
          // A signed, ~6-month-expiry remote TikTok CDN URL; not worth a next/image
          // remotePatterns entry. `referrerPolicy="no-referrer"` for the same reason the review
          // screen's copy of this row carries it: without it the browser hands TikTok's CDN the URL
          // of the screen the user is on.
          <img
            src={probe.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          // The platform, not a chain link — the same stand-in the rail and the review screen use.
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-card-2 text-muted-foreground"
          >
            <PlatformMark className="size-5" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* `Open on TikTok` appears **once**, here, and is not repeated as a footer
              link (§4.3). It sits with the context it belongs to, and it closes one instance of the
              four-labels-for-one-action defect. It does not leave the flow — the screen is still
              here when they come back. */}
          <a
            href={probe.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-sm font-semibold text-brand"
          >
            {sourceLabel}
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
          </a>
          {probe.caption !== null && (
            <button
              type="button"
              aria-expanded={captionOpen}
              aria-controls={captionId}
              onClick={() => setCaptionOpen((open) => !open)}
              className="flex h-11 items-center gap-1 text-caption font-medium text-muted-foreground"
            >
              {captionOpen ? 'Hide the caption' : 'Show the caption'}
              <ChevronDown
                className={cn(
                  'size-3.5',
                  // `duration-*` and `ease-*` ride the same `motion-safe:` variant as the
                  // transition property, which is what `REVEAL_BEAT` and `LEAVE_REVEAL` package:
                  // without a transition property they are inert anyway, and prefixing them says
                  // so rather than leaving two classes that look like they are doing something
                  // under reduced motion.
                  //
                  // This chevron used to run at `duration-base` (220ms) and the identical chevron
                  // on the review screen at Tailwind's unnamed 150ms default. One control, two
                  // screens, two timings, neither chosen. Both are now the small tier.
                  captionOpen ? `${REVEAL_BEAT} rotate-180` : LEAVE_REVEAL,
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>

      {/* Case A has no caption panel at all — no empty box, no placeholder; the layout closes up.
          Where there is one it is a reachable scroll region: a scrollable region no keyboard user
          can get to is a WCAG 2.1.1 failure, and one extra tab stop is the correct price. Capped
          and `overscroll-contain`, so a 2,000-character caption can never push the actions off the
          bottom. */}
      {probe.caption !== null && captionOpen && (
        <div
          id={captionId}
          tabIndex={0}
          role="group"
          aria-label="The video’s caption"
          dir="auto"
          className={cn(
            'max-h-38 min-h-0 shrink overflow-y-auto overscroll-contain rounded-lg bg-card-2 p-3 text-caption leading-relaxed font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ENTER_REVEAL,
          )}
        >
          {probe.caption}
        </div>
      )}

      {/*
        Under the caption panel, and that placement is the argument for it: the claim is the
        headline, the caption is the evidence for it, and this is the third thing that is true —
        read in that order it explains the screen instead of contradicting it.

        **Type, not a panel.** §4.4's sentence is "type, one hairline, one field and one caption
        panel", and the review screen's bordered warning box would break it and mis-colour the
        news besides: nothing here went wrong, and a place already being on your map is the one
        piece of good news this screen has. Names are `<bdi>` and the sentence arrives in parts for
        the same reason they do next door — half of them are Hebrew, and a joined string lets the
        bidi algorithm move the comma.
      */}
      {priorNotice && (
        <div className={cn('pt-3', ENTER_REVEAL)}>
          <p className="text-caption font-medium text-muted-foreground">{priorNotice.lead}</p>
          {/* One name per line, and no comma anywhere. The review screen sets the same names in a
              comma-separated run and needs `<bdi>` around each to stop the bidi algorithm moving
              the punctuation; giving each its own line removes the punctuation instead, which is
              the stronger fix on the screen that shows the longest Hebrew in the product (§7.3).
              `<bdi>` stays regardless — a Hebrew name still sits inside LTR chrome. */}
          <ul className="flex flex-col">
            {priorNotice.names.map((name, i) => (
              <li key={name + String(i)} className="text-caption font-bold text-foreground">
                <bdi>{name}</bdi>
              </li>
            ))}
            {priorNotice.more !== null && (
              <li className="text-caption font-medium text-muted-foreground">{priorNotice.more}</li>
            )}
          </ul>
        </div>
      )}

      <div className="min-h-8 flex-1" />

      {/* The add-by-name recovery, in the thumb zone (§4.1). It is the reason this screen is a
          destination rather than a dead end, and it is what makes the recovery reachable from
          **every** entry point rather than only where a host passed an opener. */}
      <AddByName
        sourceId={probe.sourceId}
        cityHint={probe.emptyReason === 'area_only' ? (probe.cityHint ?? null) : null}
        onSubmitted={() => setCaptionOpen(false)}
        onAdded={onAdded}
      />

      {/*
        The second recovery, for the answer that is a sentence rather than a name (§4.5).

        **Under the name search, not above it, and it is an ordering by strength of outcome.** A
        person who has the name is better served by the field above: an exact provider result, no
        model in the path, and one step fewer. This one is for the answer that does not fit in a
        search box — *"the donut stall in the shuk, Roladin"* carries the disambiguation a bare name
        would lose, and a sentence may name two places where a search names one.

        **No second hairline.** §4.4's sentence is "type, one hairline, one field and one caption
        panel", and the field count is the only part of it this change moves. Rendered inside the
        sibling's region rather than under a rule of its own, the two read as one recovery block
        with two ways in — which is what they are.
      */}
      <AddByNote className="pt-1" onRead={onReadNote} onSubmitted={() => setCaptionOpen(false)} />

      <div className="flex shrink-0 flex-col gap-2 pt-3">
        {/* Still offered where a host has a `＋` sheet, and now secondary: that sheet searches the
            user's own library first, which the field above deliberately does not. Nothing is
            withheld when it is absent — the field is the recovery. */}
        {onAddManually && (
          <Button
            type="button"
            variant="ghost"
            onClick={onAddManually}
            className="h-11 w-full rounded-lg text-sm font-bold"
          >
            Add a place you know
          </Button>
        )}
        {/* Clears the link, and that is a change from `Cancel`'s behaviour rather than a copy of
            it. Cancel says nothing about the link being wrong, so it keeps it; this action says the
            opposite — we read it, there is nothing in it — and returning the user to a paste screen
            pre-loaded with a link that produces this same screen again is the flow's worst loop.
            The label comes from the shared map so it cannot drift from the identical action on the
            failure screens. */}
        <Button
          type="button"
          variant="ghost"
          onClick={onRetry}
          className="h-11 w-full gap-1.5 rounded-lg text-sm font-bold"
        >
          {IMPORT_ERROR_ACTION_LABEL.another_tiktok}
        </Button>
        {/* The second way out, and it is the correct answer here rather than a defect: the ✕ sits
            in the top-left corner, which is the hardest place on the device for a right thumb
            whatever its size — and this screen is where a user who has run out of ideas actually
            is. (It was also a 36px target until W7-6; that is fixed, and this exit is still
            right, because the reason was reach rather than size.) */}
        <Button
          type="button"
          variant="ghost"
          onClick={onBackToMap}
          className="h-11 w-full rounded-lg text-sm font-bold"
        >
          {IMPORT_ERROR_ACTION_LABEL.back_to_map}
        </Button>
      </div>
    </div>
  );
}
