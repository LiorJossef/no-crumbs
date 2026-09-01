/**
 * **Every user-facing string on the embed surface, in one object, so the voice rules can be
 * asserted rather than hoped for.**
 *
 * `docs/voice-and-vocabulary.md` is binding and `tests/unit/embed/playback-copy.test.ts` runs its
 * mechanical half over this object: sentence case, no exclamation marks, no banned word, no brand
 * name (this is not one of the six surfaces that may carry it), and TikTok used as an adjective
 * rather than as a noun (§3.1 — `a TikTok video`, never `a TikTok`).
 *
 * ## The one sentence this whole feature turns on
 *
 * `standing`. `security-ruling-embed-playback-2026-08-31.md` §2 measured the cookie lifetimes — a
 * year and 180 days — and drew the conclusion in as many words: *"if a user says 'Play here' once,
 * that is not a one-time cost that resets — it is a standing grant good for up to a year, which is
 * exactly why the first-press disclosure has to be accurate about what is being granted rather than
 * soft-pedalled as 'just this once.'"*
 *
 * So the copy says **`This choice lasts until you change it, not just for this video.`** and the
 * negative half of that sentence is doing the work. Without it, `Play here` reads as a per-video
 * decision, which is the reading a reasonable person would take from a button next to one video,
 * and it would be wrong by roughly a year. The clause is the difference between a disclosure and a
 * dark pattern, and it is not a candidate for a copy trim.
 *
 * ## What the two disclosure lines say, and what they carefully do not
 *
 * `cookie` and `device` state the two measured facts from
 * `docs/evidence/tiktok/10-embed-playback-2026-08-31.md` §4.1–§4.2 in the words a person uses: a
 * cookie that lasts up to a year, and a player that can recognise this device on other sites. They
 * do **not** name `ttwid`, `tt_chain_token`, `webmssdk.js` or a byte count. Those are true and they
 * belong in `docs/security.md`; on the surface they would be our machinery leaking into the user's
 * sentence, which `voice-and-vocabulary.md` §7 item 3 rules out — and a person deciding whether to
 * press a button is not helped by a cookie's name.
 *
 * `refusal` is the other half of an informed choice and it is the reason the choice is real:
 * **`Opening on TikTok instead loads nothing here.`** That sentence is a claim about behaviour, and
 * it is the one claim on this surface that a test can and does check by counting requests.
 *
 * ## Why `stopPlayingHere` says *stop* and not *undo*
 *
 * Clearing the stored answer stops this product from loading TikTok's player again. It does not
 * delete a cookie on `tiktok.com` and it does not unsend a device signal that has already gone —
 * see `playback-consent.ts`'s `clearStoredChoice`. A label promising to undo the grant would be the
 * one false sentence on a screen built to tell the truth.
 */

export const PLAYBACK_COPY = Object.freeze({
  /* The first press in a browser: the disclosure and the trigger are one interaction. */

  /** The heading. States what the button on the left actually does, before it does it. */
  title: 'Playing here loads TikTok’s player.',
  /** Measured: `ttwid` at 1 year, `SameSite=None` (`10` §4.1). */
  cookie: 'TikTok sets a cookie in this browser that lasts up to a year.',
  /** Measured: a 224,360-byte ByteDance device-fingerprint SDK on document load (`10` §4.2). */
  device: 'It can recognise this device on other sites too.',
  /** The clause the ruling made a condition. See the header. */
  standing: 'This choice lasts until you change it, not just for this video.',
  /** The claim the network trace has to back up. */
  refusal: 'Opening on TikTok instead loads nothing here.',

  /* The two co-equal actions. Same element, same size, same weight, same one press each —
     `tiktok-playback-panel.tsx` renders them from one array so they cannot drift apart. */

  playHere: 'Play here',
  /** Verbatim the string already shipped on the place detail, the review screen and the failure
   *  screen. A second wording for the same destination would be a second thing to learn. */
  openOnTikTok: 'Open on TikTok',

  /* Revisiting the answer, from either side. */

  /** Shown with the player. Says what it does — stops future loads — and claims no more. */
  stopPlayingHere: 'Stop playing videos here',
  /** Shown beside the link when this browser chose to open on TikTok. */
  playHereInstead: 'Play here instead',
  /** The current setting, stated once, above the link. */
  linkOnly: 'Videos open on TikTok.',

  /* The player's own states. `import-error-copy.ts`'s rule applies: blameless, and every one of
     them leaves `Open on TikTok` on screen, so no state here is a dead end. */

  loading: 'Starting the video…',
  /** TikTok error 3002 `AUTOPLAY_ERROR`. The next move first, the reason second: the control is
   *  already on screen and the sentence's job is to send the user to it. */
  blocked: 'Press play to start the video. Your browser stopped it from starting on its own.',
  /** TikTok error 1001 `INVALID_VIDEO`. */
  unavailable: 'TikTok has no video at this link.',
  /** 2001, 3001, an unrecognised code, or no `onPlayerReady` inside the timeout. */
  failed: 'The video did not load.',
} as const);

export type PlaybackCopyKey = keyof typeof PLAYBACK_COPY;

/**
 * The iframe's accessible name. `@handle`'s form is the one `platform-mark.tsx` already names as
 * permitted and attributed — *"the word, the `@handle` and the link back"* — and an iframe with no
 * title is an unlabelled frame in every screen reader's frame list.
 */
export function playerFrameTitle(authorLabel: string | null | undefined): string {
  const handle = typeof authorLabel === 'string' ? authorLabel.trim() : '';
  return handle.length > 0 ? `${handle}’s TikTok video` : 'TikTok video';
}
