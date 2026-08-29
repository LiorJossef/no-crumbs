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
          'Worked out from the post rather than matched to a map listing, so it can be a street or two off.',
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
 * "Saved on 24 August", or with the year once it is no longer this one.
 *
 * The library is ordered most-recently-saved-first and said so nowhere, which made the order both
 * invisible and unverifiable. Shown on the detail rather than on every row on purpose: twenty rows
 * saved in one afternoon would carry twenty identical dates, which is noise sold as information.
 */
export function savedOnLine(savedAt: Date, now: Date): string {
  const sameYear = savedAt.getFullYear() === now.getFullYear();
  return `Saved on ${savedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}
