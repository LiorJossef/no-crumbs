/**
 * Where sign-in sends you afterwards.
 *
 * Sign-in has always pushed `/map`, which is right for someone opening the app and wrong for
 * someone who arrived at a collection invite link: they sign in, land on the map, and the thing
 * they were invited to is gone unless they still have the link in their clipboard.
 *
 * ## The rule, and why it is this narrow
 *
 * An open redirect is a phishing primitive, and the sign-in page is the single most valuable page
 * in any product to send someone away from. So this is an **allow-list of path shapes**, not a
 * validator trying to decide whether a URL is safe:
 *
 *  - It must start with a single `/`, and not `//` (a protocol-relative URL to another host — the
 *    classic bypass) or `/\` (which some parsers normalise the same way).
 *  - It must not parse as an absolute URL on its own, which rejects `https://evil.io` and every
 *    scheme including `javascript:`.
 *  - It must match a destination we have actually decided to return to. Today that is exactly one:
 *    a collection invite. "Any path on our own origin" would be safe from phishing and still wrong
 *    — it would make every page in the product a post-sign-in destination without anyone choosing
 *    that.
 *
 * Anything else falls back to `/map`, silently. There is nothing useful to say to a user about a
 * return path they did not type.
 */

/** The one shape we return to today. A token is a uuid, so the tail is bounded and checkable. */
const ALLOWED = [/^\/collections\/join\/[0-9a-f-]{36}$/i];

export const DEFAULT_AFTER_SIGN_IN = '/map';

export function safeReturnPath(raw: string | null | undefined): string {
  const next = raw ?? '';
  if (next.length === 0) return DEFAULT_AFTER_SIGN_IN;

  // A protocol-relative or backslash-prefixed path is a different host wearing a path's clothes.
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_AFTER_SIGN_IN;
  }

  try {
    new URL(next);
    // It parsed as absolute, so it is not a path.
    return DEFAULT_AFTER_SIGN_IN;
  } catch {
    // Not absolute — good.
  }

  return ALLOWED.some((shape) => shape.test(next)) ? next : DEFAULT_AFTER_SIGN_IN;
}
