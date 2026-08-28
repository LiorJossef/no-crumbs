/**
 * How an MP4 demux failure crosses the app-layer seam.
 *
 * Every failure is a `MEDIA_UNREADABLE`. `07` §9's taxonomy was written when the only bytes we
 * fetched were an oEmbed JSON body, so it had no media code; this branch adds one rather than
 * borrowing `NO_CAPTION`, which would put a false statement ("this post has no caption") in the
 * log line `07` §7.1 groups by, about a post whose caption may have been perfectly good.
 *
 * The code is deliberately **not retryable**: the same bytes demux the same way. That is a
 * narrower claim than it looks, because it is about the *bytes*, not the post — a truncated CDN
 * response is a fetch-layer problem and retrying the download belongs to whoever fetched it, not
 * to a parser being handed the same buffer again.
 *
 * The caller almost never surfaces one. A failed demux means "no transcript part", and the import
 * continues on the caption; this only reaches a user when there was no caption either. So the code
 * is what gets logged, while `reason` below tells an operator which of the eight things went
 * wrong. It rides on `cause`, never on `DomainErrorView`, so nothing about our parser reaches the
 * client.
 */

import { mediaUnreadable, type DomainError } from '@/domain/errors';

/** The eight distinguishable ways `extractAacFromMp4` can refuse. Distinguishable is the point:
 *  `unsupported_codec` on 30% of posts is a product decision, `truncated` on 30% is a bug in how
 *  we fetch, and both would look identical as one `MEDIA_UNREADABLE`. */
export type Mp4DemuxFailure =
  | 'not_mp4'
  | 'truncated'
  | 'malformed'
  | 'no_audio_track'
  | 'unsupported_codec'
  | 'input_too_large'
  | 'audio_too_long'
  | 'output_too_large';

export interface Mp4DemuxCause {
  readonly kind: 'mp4-demux';
  readonly reason: Mp4DemuxFailure;
  /** Where in the file we gave up, for logs. Never user copy, never wire format. */
  readonly detail: string;
}

/** The only way this module produces a failure. Always a `DomainError`, never a bare `throw`. */
export function mp4DemuxError(reason: Mp4DemuxFailure, detail: string): DomainError {
  const cause: Mp4DemuxCause = { kind: 'mp4-demux', reason, detail };
  return mediaUnreadable(`mp4 demux failed: ${reason} (${detail})`, cause);
}

/** Reads the reason back off a caught error, for a caller that wants to branch on it (and for
 *  tests, which must be able to tell the eight cases apart). `null` for anything not ours. */
export function mp4DemuxFailureReason(error: unknown): Mp4DemuxFailure | null {
  if (!(error instanceof Error)) return null;
  const cause: unknown = error.cause;
  if (typeof cause !== 'object' || cause === null) return null;
  const candidate = cause as Partial<Mp4DemuxCause>;
  return candidate.kind === 'mp4-demux' && typeof candidate.reason === 'string'
    ? candidate.reason
    : null;
}
