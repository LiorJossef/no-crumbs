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
 * No illustration, no mascot, no card around the whole thing, no badge or pill, no retry of the
 * same URL, no count of anything, no sentence defending the hit rate. The word "error" does not
 * appear, and neither do "sorry", "oops", "failed" or "couldn't". Charter §6's banned aesthetic is
 * enforced by subtraction: type, one hairline, one caption panel.
 *
 * ## The variant this file is
 *
 * §5.4's **no-search** variant: primary `Try another TikTok`, secondary `Back to the map`. The
 * second exit is deliberate rather than an inconsistency — with no field in the footer it would
 * otherwise hold one button, and the ✕ is a 36px target in the top-left corner of an 812pt screen,
 * the hardest place on the device for a right thumb.
 *
 * **The add-by-name block (§5.2) is not built yet**, and until it is, `onAddManually` is how the
 * manual-add recovery is reached where a host provides one. Finding 10 — the standalone `/import`
 * route silently withholding that recovery — is closed by the block, not by this file, because the
 * `＋` sheet the prop opens exists only on `/map`. `onAddManually` therefore stays a prop that may
 * be `null` and the button renders only where its destination exists: a recovery only ever points
 * somewhere that works.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IMPORT_ERROR_ACTION_LABEL } from '@/ui/import/import-error-copy';

import type { ProbeSuccess } from '../_lib/probe-contract';

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
 * `That happens a lot.` is deliberately absent. It shipped, alongside `Some TikToks only show the
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
      body: 'We opened it fine — there’s just no caption to read. Some TikToks only show the place on screen.',
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
    body: 'We read the caption, and it doesn’t name a place we can put on a map. Some TikToks only show the place on screen.',
  };
}

export function NoPlacesScreen({
  probe,
  onRetry,
  onBackToMap,
  onAddManually,
}: {
  probe: ProbeSuccess;
  /** `Try another TikTok`. Clears the link — see the note on the button. */
  onRetry: () => void;
  /** The same exit the ✕ takes. Rendered as a button too, because the ✕ alone is out of thumb
   *  reach on a tall phone (§5.4). */
  onBackToMap: () => void;
  /** Opens the host's manual-add surface, where the host has one. `null` is not a degradation to
   *  hide but the honest state of a surface with no manual add to reach, and the button renders
   *  accordingly rather than naming a destination it cannot go to. */
  onAddManually: (() => void) | null;
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
    ? `@${probe.authorHandle}’s TikTok`
    : probe.authorName
      ? `${probe.authorName}’s TikTok`
      : 'This TikTok';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 pb-4">
        <p className="text-micro font-bold tracking-[0.14em] text-brand uppercase">{kicker}</p>
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
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Link2 className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* `Open the original TikTok` appears **once**, here, and is not repeated as a footer
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
                  'size-3.5 transition-transform duration-base ease-standard motion-reduce:transition-none',
                  captionOpen && 'rotate-180',
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
          aria-label="The TikTok’s caption"
          dir="auto"
          className="mb-4 max-h-38 min-h-0 shrink overflow-y-auto overscroll-contain rounded-lg bg-muted/50 p-3 text-caption leading-relaxed font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {probe.caption}
        </div>
      )}

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/70 pt-4">
        {/* §5.3's hierarchy, and it only exists where the destination does. The user has a place in
            mind — they watched the video — and this is the one action that ends with it on their
            map; trying another link starts the whole wait again. */}
        {onAddManually && (
          <Button
            type="button"
            onClick={onAddManually}
            className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
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
          variant={onAddManually ? 'outline' : 'default'}
          onClick={onRetry}
          className={cn(
            'w-full gap-1.5 rounded-lg font-bold',
            onAddManually ? 'h-11 text-sm' : 'h-12 text-base',
          )}
        >
          {IMPORT_ERROR_ACTION_LABEL.another_tiktok}
        </Button>
        {/* The second way out, and it is the correct answer here rather than a defect: without a
            field in this footer it holds one button, and the ✕ is a 36px target in the top-left
            corner — the single hardest place on the device for a right thumb. */}
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
