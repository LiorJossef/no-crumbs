/**
 * How sure we are about where a place *is*, said in words a person can act on.
 *
 * The detail view used to print `Matched via llm-guess · 87% confidence`, and both halves were
 * wrong in different ways.
 *
 * `llm-guess` is the internal name for "the model wrote down a coordinate from reading a caption,
 * and nothing checked it against a map listing". Measured drift on those is 65–470 m, median 327 m
 * — a street or two, sometimes the wrong building. Twenty-one of the thirty-one places in the
 * current library are that. The import screen says so at the time, in plain words, and then the
 * product forgot it the moment the place was saved: a guessed pin looked exactly like a matched
 * one, and the only trace was a dataset slug at 11px.
 *
 * The percentage was worse than useless. `places.resolution_score` is a diagnostic — `0010` calls
 * it that in its own words — and it is not a probability of being right; the *review* screen bans
 * confidence numbers by rule for exactly that reason, so printing one two taps later contradicted
 * our own rule and lent false precision to the least certain rows.
 *
 * What replaces it is the smallest honest thing: which of two kinds of answer this is, and what
 * that means for the user. Provider names survive where a provider was actually used, because
 * Google's terms require attribution and because "matched" is more believable when it says
 * matched *to what*.
 */

import type { SourceDataset } from '@/domain/types';

export interface LocationCertainty {
  readonly label: string;
  /** One sentence on what the label means for the person reading it. Absent when the label is
   *  already the whole story. */
  readonly detail?: string;
  /** Whether this is the uncertain kind, for callers that want to mark it rather than describe
   *  it (a row, an accessible name). */
  readonly isApproximate: boolean;
}

/**
 * Returns `null` when the row carries no provenance at all — five of the current thirty-one. That
 * is genuinely "we do not know how this was placed", and inventing a third label for it would be
 * inventing a claim.
 */
export function locationCertainty(
  sourceDataset: SourceDataset | string | null | undefined,
): LocationCertainty | null {
  switch (sourceDataset) {
    case 'llm-guess':
      return {
        label: 'Approximate location',
        detail:
          'Worked out from the video rather than matched to a map listing, so it can be a street or two off.',
        isApproximate: true,
      };
    case 'google-places':
      return { label: 'Matched on Google Maps', isApproximate: false };
    case 'overture-places':
      return { label: 'Matched in Overture Maps', isApproximate: false };
    default:
      return null;
  }
}

/**
 * How a list row says `isApproximate` to a screen reader.
 *
 * Lowercase and a fragment, exactly like `BEEN_ROW_ANNOTATION`, because it is appended to the
 * row's one accessible name rather than announced on its own. The row itself can only afford a
 * glyph — `PlaceRow` says why — and `aria-label` replaces a button's content, so a mark rendered
 * inside one is announced nowhere unless it is in the name.
 */
export const APPROXIMATE_ROW_ANNOTATION = 'approximate location';

/**
 * "Saved on 24 August", or with the year once it is no longer this one.
 *
 * The library is ordered most-recently-saved-first and said so nowhere, which made the order both
 * invisible and unverifiable.
 *
 * **This used to say the line was on the detail and never on a row**, because twenty rows saved in
 * one afternoon would carry twenty identical dates — noise sold as information. That argument was
 * right about *this* string and it is why the row gets `savedElapsedLine` below instead
 * (`overnight-copy-deck.md` §4.1, which quotes this paragraph and rules on it). Two things changed:
 * the row now pairs the line with the post's own thumbnail, so it has a metadata band with a reason
 * to exist, and elapsed time distinguishes rows where a repeated date does not — `3 days ago` and
 * `just now` are different words for the two ends of one afternoon.
 */
export function savedOnLine(savedAt: Date, now: Date): string {
  const sameYear = savedAt.getFullYear() === now.getFullYear();
  return `Saved on ${savedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

/**
 * "Saved 3 days ago" — the same fact as `savedOnLine`, said the way a list row needs it.
 *
 * The full ladder is ruled in `docs/overnight-copy-deck.md` §4.1 (C130) and is reproduced here
 * rather than paraphrased, because a rung with no string is a rung a caller invents at 2 am:
 *
 * | Condition | String |
 * |---|---|
 * | in the future, or under a minute | `Saved just now` |
 * | under an hour | `Saved 1 minute ago` … `Saved 59 minutes ago` |
 * | under a day | `Saved 1 hour ago` … `Saved 23 hours ago` |
 * | under a week | `Saved 1 day ago` … `Saved 6 days ago` |
 * | under 35 days | `Saved 1 week ago` … `Saved 4 weeks ago` |
 * | 35 days or more, this year | `Saved 3 Aug` |
 * | otherwise | `Saved 3 Aug 2025` |
 *
 * Four decisions inside that table, all of them the copy deck's and none of them re-litigated here:
 *
 *  - **It stops at weeks and hands off to the date.** `Saved 5 months ago` is vaguer than
 *    `Saved 3 Aug`, no shorter, and `voice-and-vocabulary.md` §5 already fixes the date format.
 *  - **35 days, not 30**, so `4 weeks ago` is reachable and no rung is unreachable.
 *  - **Digits throughout, and no `yesterday` or `last week`.** §5: *"Digits, always."* One word form
 *    inside a numeric ladder is a special case a verifier has to remember and a translator has to
 *    restructure.
 *  - **A future timestamp clamps to `Saved just now`** rather than reading `in 2 hours`. Clock skew
 *    between a browser and Postgres is real — this is computed against the reader's own clock — and
 *    the product must not narrate it.
 *
 * `3 Aug`, short, per §5's `Dates:` rule — deliberately not `savedOnLine`'s `24 August`. The two
 * strings sit on different surfaces and the detail's long form predates that rule.
 *
 * Pure, and a function of `(savedAt, now)` rather than of `Date.now()`, so every rung above is
 * testable with no DOM and no clock — which is what this repo's `node` test environment allows.
 */
export function savedElapsedLine(savedAt: Date, now: Date): string {
  const seconds = (now.getTime() - savedAt.getTime()) / 1000;
  if (seconds < 60) return 'Saved just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Saved ${plural(minutes, 'minute')} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${plural(hours, 'hour')} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Saved ${plural(days, 'day')} ago`;
  if (days < 35) return `Saved ${plural(Math.floor(days / 7), 'week')} ago`;

  const sameYear = savedAt.getFullYear() === now.getFullYear();
  return `Saved ${savedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

/** `1 minute` / `12 minutes`. Written per string rather than through a `(s)`, which
 *  `voice-and-vocabulary.md` §5 bans by name. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * "Marked as been in August", or with the year once it is no longer this one.
 *
 * Two things this wording is careful about, and both are about not claiming more than the column
 * holds. `saved_places.visited_at` is the moment the *mark* was made in this app — never a date
 * the user gave us, and an editable visit date is out of scope
 * (`product-ruling-after-the-save.md` §6.5) — so "Marked as" rather than "You went", and a month
 * rather than a day: to-the-day precision on a record-keeping timestamp reads as a claim about
 * the visit itself.
 *
 * `null` when there is no timestamp, and that state is real rather than defensive: `0006`'s
 * `saved_places_visited_at_consistent` only forbids a timestamp *without* the state, so a row can
 * be `visited` with `visited_at is null` — anything marked by a path that did not write one.
 * Guessing a month for it would be inventing the fact.
 *
 * On the detail only, like `savedOnLine` above and for the same reason.
 */
export function visitedOnLine(visitedAt: Date | null | undefined, now: Date): string | null {
  if (!visitedAt) return null;
  const sameYear = visitedAt.getFullYear() === now.getFullYear();
  return `Marked as been in ${visitedAt.toLocaleDateString('en-GB', {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}
