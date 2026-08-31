/**
 * Where sign-in sends you afterwards.
 *
 * Sign-in has always pushed `/map`, which is right for someone opening the app and wrong for
 * someone who arrived carrying something: an invitation to a collection, or a TikTok link handed
 * to the product from a share sheet. They sign in, land on the map, and the thing they arrived
 * with is gone unless they still have the link in their clipboard.
 *
 * ## The rule, and why it is shaped like this
 *
 * An open redirect is a phishing primitive, and the sign-in page is the single most valuable page
 * in any product to send someone away from. So this is an **allow-list of destinations**, not a
 * validator trying to decide whether a URL is safe, and the value it returns is **rebuilt from
 * parts we checked** rather than the string it was handed:
 *
 *  - It must start with a single `/`, and not `//` (a protocol-relative URL to another host — the
 *    classic bypass). A backslash anywhere is refused outright: `\` is a path separator to the
 *    URL parser but not to a regex written by a human, which is how `/\evil.io` becomes a host.
 *  - It is parsed against a sentinel origin that exists nowhere, and refused if it did not stay
 *    on it. That rejects `https://evil.io`, every scheme including `javascript:`, and anything
 *    else that can talk a URL parser into changing host.
 *  - The **normalised** pathname — `new URL` has already collapsed `.` and `..`, including their
 *    `%2e` spellings — must match a destination we have actually decided to return to. Checking
 *    the normalised form rather than the raw string is what makes an encoded traversal a
 *    non-event: `/import/%2e%2e/%2e%2e/x` is `/x` by the time it is compared, and `/x` is not a
 *    destination.
 *  - Only the query parameters that destination names survive, and they are re-serialised through
 *    `URLSearchParams`. Everything else — extra parameters, the fragment — is dropped.
 *
 * "Any path on our own origin" would be safe from phishing and still wrong: it would make every
 * page in the product a post-sign-in destination, and every query parameter of every page a thing
 * a stranger's link can set, without anyone choosing that.
 *
 * Anything else falls back to `/map`, silently. There is nothing useful to say to a user about a
 * return path they did not type.
 *
 * ## The two destinations, and what each one costs
 *
 * **A collection invite** carries a bearer token in its path; returning to it is the whole reason
 * this function exists.
 *
 * **`/import?url=`** is the share seam (`app/import/page.tsx`). A share, a Shortcut or a
 * bookmarklet fires the product from nothing, so it is *more* likely than a normal visit to arrive
 * at a cold session — and dropping the link at the door restores by hand exactly the copy-paste
 * tax the seam was built to remove.
 *
 * Carrying `url` means a stranger's link can decide what a returning visitor's import runs on.
 * That is the same authority a stranger's link already has by sending them to `/import?url=`
 * directly, and it stops at the same place: **this function does not decide what a TikTok link
 * is.** It carries an opaque string back to the page it came from, and `sharedImportUrl` and
 * `canonicaliseTikTokUrl` — the SSRF boundary, a closed host allow-list by equality — judge it on
 * arrival exactly as they judge a fresh paste. A hostile value is not blocked here; it becomes
 * `UNSUPPORTED_HOST` or `MALFORMED_URL` there, which is a screen rather than a fetch.
 */

/**
 * An origin that cannot exist. `.invalid` is reserved by RFC 2606 precisely so a name can be used
 * as a parse target without ever resolving. Nothing is fetched against it; it exists so relative
 * and absolute inputs go through one code path and any escape from the origin is visible.
 */
const SENTINEL_ORIGIN = 'https://return-path.invalid';

/**
 * A cap on what we will carry, applied to the input.
 *
 * A share target hands over the caption, the link and a pile of hashtags in one field, so this is
 * not a fixed-size value — and it is about to be percent-encoded into a second URL. 2048 is the
 * length every browser and proxy handles without argument, and overflowing it fails to `/map`,
 * which is the same outcome as not carrying anything at all.
 */
const MAX_LENGTH = 2048;

type Destination = {
  /** Matched against the **normalised** pathname, never the raw input. Anchored, always. */
  readonly path: RegExp;
  /** Query parameters that survive the round trip. Absent means none do. */
  readonly params?: readonly string[];
};

/** The shapes we return to. Adding one is a security decision — read the header first. */
const ALLOWED: readonly Destination[] = [
  /** A token is a uuid, so the tail is bounded and checkable. Nothing else on this URL matters. */
  { path: /^\/collections\/join\/[0-9a-f-]{36}$/iu },
  /**
   * The share seam. `url` is the only parameter `manifest.ts`'s `share_target` sets and the only
   * one worth carrying; `state` is deliberately not here, because it is the development-only
   * screen seam (`app/import/_lib/dev-screen.ts`) and a return path is no place to reach it.
   */
  { path: /^\/import$/u, params: ['url'] },
];

export const DEFAULT_AFTER_SIGN_IN = '/map';

export function safeReturnPath(raw: string | null | undefined): string {
  const next = raw ?? '';
  if (next.length === 0 || next.length > MAX_LENGTH) return DEFAULT_AFTER_SIGN_IN;

  // A protocol-relative or backslash-bearing path is a different host wearing a path's clothes.
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return DEFAULT_AFTER_SIGN_IN;
  }

  let url: URL;
  try {
    url = new URL(next, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  // It parsed, but did it stay where we put it? Anything that moved is not a path.
  if (url.origin !== SENTINEL_ORIGIN) return DEFAULT_AFTER_SIGN_IN;

  const destination = ALLOWED.find((shape) => shape.path.test(url.pathname));
  if (destination === undefined) return DEFAULT_AFTER_SIGN_IN;

  // Rebuilt, not echoed: every value here was named by the destination above.
  const carried = new URLSearchParams();
  for (const name of destination.params ?? []) {
    for (const value of url.searchParams.getAll(name)) carried.append(name, value);
  }

  const query = carried.toString();
  return query.length === 0 ? url.pathname : `${url.pathname}?${query}`;
}
