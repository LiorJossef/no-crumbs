/**
 * **The one place a TikTok Embed Player URL is built**, and the one place the iframe's attributes
 * are written down.
 *
 * ## Why the Embed Player and not the blockquote
 *
 * `docs/evidence/tiktok/10-embed-playback-2026-08-31.md` §1 measured both mechanisms against our own
 * 16 real oEmbed captures. The oEmbed `html` blockquote carries `min-width:325px` in **all sixteen**
 * — ~578px tall at 9:16 — server-renders a `<video preload="auto">` that starts pulling CDN bytes
 * the moment the document parses, and ships a 2.39 MB application bundle. The Embed Player
 * (`/player/v1/{id}`) has no documented minimum, no server-baked video tag, and a documented
 * parameter and `postMessage` surface. `security-ruling-embed-playback-2026-08-31.md` §6 item 5
 * makes that choice an acceptance line rather than a preference.
 *
 * ## What the attributes below do and do not buy
 *
 * **Read this before adding one of them to a mitigation list.** `security-ruling-embed-playback`
 * §3 is explicit and this comment restates it so nobody has to go and find it:
 *
 *  - `sandbox` **requires** `allow-same-origin` for the player to function at all, and
 *    `allow-same-origin` is precisely the permission that lets TikTok's document read and write
 *    `tiktok.com`'s real cookie jar. **The sandbox cannot reach the disclosure the consent gate is
 *    for.** What it does reach is a different, real risk class — a third-party document we chose to
 *    embed opening windows, navigating our page away, submitting forms or raising native dialogs —
 *    and it closes that at zero functional cost, which is why it ships.
 *  - `referrerpolicy="no-referrer"` suppresses exactly one header on exactly one navigation. The
 *    cookie is set by the *response* to that navigation and the fingerprint SDK is loaded from
 *    inside TikTok's own document afterwards; neither is a thing a referrer policy has jurisdiction
 *    over (`10` §4.5). Free, correct, and not a mitigation of the cookie.
 *  - `credentialless` is **deliberately absent**. It is Chromium-only, not Baseline, it would close
 *    only the storage half rather than the SDK-execution half, and its functional impact on this
 *    specific player is untested. Shipping it would put a line item in the record that reads as
 *    containment on two of three engines where it does nothing at all.
 *
 * The permissions policy in `PLAYER_IFRAME_ALLOW` is a grant rather than a restriction, and it is
 * worth being honest about that too: it costs no disclosure beyond what mounting already made, and
 * it is what lets the muted-or-unmuted autoplay decision below be the browser's rather than a
 * guaranteed failure.
 */

/** The only origin this feature ever frames, and the only origin a player message is accepted from
 *  (`player-messages.ts`). A `Set` of hosts would be the wrong shape here — the embed has exactly
 *  one, and one is not a list. */
export const EMBED_PLAYER_ORIGIN = 'https://www.tiktok.com';

/** What a `frame-src` CSP entry has to name for this to load. Exported so the header and the iframe
 *  cannot drift apart, and so a test can assert they agree. */
export const EMBED_PLAYER_FRAME_SRC = 'https://www.tiktok.com';

/**
 * **A deliberate second copy of `integrations/tiktok/resolve-short-link.ts`'s `VIDEO_ID_IN_PATH`,
 * narrowed to the canonical form.**
 *
 * That file is server-side: it takes a `Response`, reads `Location` headers and follows redirects.
 * Importing it into a client component would pull a fetch path into the browser bundle to get at a
 * regular expression. The duplication is the cheaper of the two wrongs — and
 * `tests/unit/embed/embed-player-url.test.ts` reads that file as source text and asserts the two
 * still agree on the digit range, so a drift fails a test rather than silently producing a URL that
 * 404s.
 *
 * 17–20 digits is TikTok's own snowflake id width. `photo` is here because a TikTok image post is a
 * valid Embed Player post type (its parameter table lists `Post type: video, image`), so a photo
 * post's id is a real id rather than something to reject.
 */
const CANONICAL_VIDEO_ID = /\/(?:@[^/]*\/)?(?:video|photo)\/(\d{17,20})(?:[/?#]|$)/;

/**
 * The post id out of a canonical TikTok URL, or `null`.
 *
 * `null` is a complete answer and not a failure: it is what a `vm.tiktok.com` short link, a
 * manually-added place with no post behind it, or a malformed stored value all produce, and every
 * one of those is a case where the panel simply offers the link it already had. Resolving a short
 * link is a server round trip and is **not** done here — a privacy surface that quietly makes a
 * network call to decide whether to offer a privacy choice would be its own bug.
 */
export function tiktokPostId(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  let path: string;
  try {
    const parsed = new URL(url);
    // Only ever read the path. A host check belongs to whoever produced the URL, and every caller
    // here is reading a value this product itself canonicalised on the way in.
    path = parsed.pathname;
  } catch {
    return null;
  }
  return CANONICAL_VIDEO_ID.exec(path)?.[1] ?? null;
}

/**
 * **The player's parameters, and why each one is set rather than left at its default.**
 *
 * Every value here is from the parameter table in
 * `docs/evidence/tiktok/raw/10-embed-player-doc-verbatim-2026-08-31.txt`.
 *
 *  - `autoplay=1` — the user pressed a control that means *play*. Making them press a second one
 *    inside TikTok's chrome would be the product asking twice for the same decision.
 *  - `muted=0`, and this is the parameter with a real trade in it. TikTok's own wording for
 *    `muted=1` is *"Set the default volume to 0 **and prevent the user from changing the volume**"*
 *    — so `muted=1` is not "starts quiet", it is **silent for good**, on videos whose creator is
 *    usually talking. `muted=0` buys sound at the price of the browser sometimes refusing to
 *    autoplay, which TikTok itself anticipated with a dedicated error code (3002 `AUTOPLAY_ERROR`).
 *    **That state is handled** (`player-messages.ts`, `PLAYBACK_COPY.blocked`), which is what makes
 *    this the cheaper side of the trade: a refused autoplay costs one tap on a control that is
 *    already on screen, and a permanent mute costs the audio track forever.
 *  - `controls=1` — the default, set explicitly because a video the user cannot pause is not a
 *    player. A default that is load-bearing is written down.
 *  - `rel=0` — *"Show the current video author's videos as related video"* rather than TikTok's
 *    recommendations. The user asked to see one post; turning the end of it into a recommendation
 *    feed is a surface this product did not agree to host.
 *  - `music_info=1` — Developer Terms `III.3(n)` names three things: creator, description and
 *    **background sound**. We render the first two ourselves from our own stored row; the sound is
 *    the one we hold no data for, so TikTok's own chrome is the only way to discharge it.
 *  - `description=0` — the counterpart. We render the caption ourselves, next to the player, which
 *    is what `security-ruling-embed-playback` §6 item 9 requires: attribution that does not depend
 *    on a third party's default staying what it is today.
 */
const PLAYER_PARAMS: Readonly<Record<string, string>> = Object.freeze({
  autoplay: '1',
  muted: '0',
  controls: '1',
  rel: '0',
  music_info: '1',
  description: '0',
});

/** The player URL for a post id, with the parameters above. Throws on an id this module did not
 *  produce, because every caller gets its id from `tiktokPostId` and an id from anywhere else is a
 *  bug rather than a user input. */
export function embedPlayerUrl(postId: string): string {
  if (!/^\d{17,20}$/.test(postId)) {
    throw new Error(`Not a TikTok post id: ${JSON.stringify(postId)}`);
  }
  const query = new URLSearchParams(PLAYER_PARAMS).toString();
  return `${EMBED_PLAYER_ORIGIN}/player/v1/${postId}?${query}`;
}

/**
 * `sandbox`, in full. **Two tokens, and the four that are absent are the point.**
 *
 * `allow-scripts` and `allow-same-origin` are what the player needs to run — see the header comment
 * on why granting the second is not a hole this file opened but the mechanism the whole feature
 * rests on. `allow-popups`, `allow-top-navigation`, `allow-forms` and `allow-modals` are omitted,
 * which is `security-ruling-embed-playback` §6 item 7 verbatim. `tests/unit/embed` asserts the
 * absent four by name so that a future "the player wants a popup" fixes it deliberately.
 */
export const PLAYER_IFRAME_SANDBOX = 'allow-scripts allow-same-origin';

/** The four the sandbox must never grant. Exported so the assertion and the value have one source. */
export const FORBIDDEN_SANDBOX_TOKENS: readonly string[] = Object.freeze([
  'allow-popups',
  'allow-top-navigation',
  'allow-forms',
  'allow-modals',
]);

/**
 * The permissions policy. `fullscreen` is TikTok's own code sample; `autoplay` is what lets the
 * gesture the user just made on our page reach the framed document, which is the difference between
 * `muted=0` autoplay usually working and never working. Neither grants TikTok anything it did not
 * already get by being mounted.
 */
export const PLAYER_IFRAME_ALLOW = 'autoplay; fullscreen';
