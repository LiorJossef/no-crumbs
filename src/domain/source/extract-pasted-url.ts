/**
 * Pulls the link out of what a share sheet actually puts on the clipboard.
 *
 * TikTok's own "Copy link" gives you the caption, then the link, then a pile of hashtags:
 *
 *     best falafel in tel aviv 🧆 https://vm.tiktok.com/ZS2abc/ #telaviv #foodie
 *
 * Pasting that into the import field is the single most likely first action in the product, and
 * until now it was rejected as "That doesn't look like a TikTok link." — which is a lie, since the
 * link is right there and we can see it.
 *
 * ## What this is not
 *
 * It is **not** part of the SSRF boundary and it must never become one.
 * `canonicalise-tiktok-url.ts` is that boundary: a closed five-host allow-list, no ports, no
 * userinfo, no IP literals. This function only chooses *which substring* to hand it. Whatever comes
 * out of here still goes through every one of those gates unchanged, so the worst a hostile paste
 * can achieve is to pick a different substring for the allow-list to reject.
 *
 * Deliberately not clever:
 *  - Only `http://` and `https://` starts are recognised. A bare `tiktok.com/@a/video/1` is not
 *    promoted to a URL — guessing a scheme for a string the user did not write one on is exactly
 *    the kind of helpfulness that turns a typo into a request.
 *  - The **first** match wins, not the "most TikTok-looking" one. Ranking candidates would mean
 *    this function had an opinion about hosts, which is the allow-list's job and nobody else's.
 *  - Input that already parses as an absolute URL is returned untouched, so nothing about the
 *    ordinary case changes.
 */

/** Trailing characters that end a sentence or close a bracket rather than belong to a URL. `/` is
 *  deliberately absent: a trailing slash is part of the path, and TikTok's short links carry one. */
const TRAILING_NOISE = /[.,;:!?'")\]}>»”’…]+$/u;

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The link inside `raw`, or `raw` trimmed when there is nothing that looks like one.
 *
 * Returning the original rather than an empty string on no-match is what keeps the failure honest:
 * the user sees `MALFORMED_URL` against the text they actually pasted, not against a blank.
 */
export function extractPastedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (isAbsoluteHttpUrl(trimmed)) return trimmed;

  // Scanned by position rather than by splitting on whitespace, so a link wrapped in brackets —
  // `(https://vm.tiktok.com/x/)`, which is how people quote one in a message — is found rather
  // than skipped for not starting the token. A run stops at the first whitespace of any kind,
  // including the newlines a multi-line share text arrives with.
  for (const match of trimmed.matchAll(/https?:\/\/[^\s]+/giu)) {
    const cleaned = (match[0] ?? '').replace(TRAILING_NOISE, '');
    if (isAbsoluteHttpUrl(cleaned)) return cleaned;
  }

  return trimmed;
}

/** Whether reading the paste changed it, i.e. whether the field is about to show the user
 *  something different from what they pasted. The UI uses this to say so rather than silently
 *  rewriting the field under their cursor. */
export function pasteWasNarrowed(raw: string): boolean {
  return extractPastedUrl(raw) !== raw.trim();
}
