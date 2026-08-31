/**
 * The one client-side copy map for the import error taxonomy.
 *
 * `07` §9 fixes the wire format at `DomainErrorView = { code, retryable, importId? }` — a code and
 * two booleans, no prose — and states in the same paragraph that **copy lives in one client-side
 * map**. This is that map. Nothing here asks the server for more information, and nothing here
 * invents a distinction the taxonomy does not draw (private / deleted / region-locked are
 * indistinguishable from oEmbed, VERIFIED in `04` §5, so `POST_UNAVAILABLE` does not guess between
 * them and `ux-architecture` §5.4's `This TikTok isn't public…` row is deliberately unused).
 *
 * Why a `Record<DomainErrorCode, …>` and not a lookup with a default: the previous screen rendered
 * one apologetic template for all fourteen codes, so `NO_CAPTION` (we read the post perfectly well;
 * it has no caption) and `UNSUPPORTED_URL` (a profile link, which can never work) both told the
 * user we couldn't read their TikTok and offered them a retry. A total record makes a fifteenth
 * code a **compile error** rather than a silent regression to that generic screen.
 *
 * Voice: `brand-and-product-foundation` §4 — state, don't perform; concrete over technical; never
 * cute, never apologetic, never blaming the post. The banned-vocabulary list in `ux-architecture`
 * §12 stands verbatim, which is why the old screen's literal "Something went wrong" headline is
 * gone. Every string below is either quoted from `ux-architecture` §12.4 / §5.1 / §5.3 / §5.4 (the
 * `C##` ids in the comments), quoted from `07` §9's table, or reuses wording already shipping in
 * `import-page-client.tsx` and `domain/errors.ts`. Strings marked `NEW` are compositions in that
 * same vocabulary that §12.4 has no id for yet — they need a copy-deck id from `ux-interaction`.
 *
 * **Recovery actions only ever point somewhere that works.** `ux-architecture` §5.1 and §5.3 both
 * list `Add a place you know` → S8 manual add. S8 does not exist (`L1-F7-T1`), so it appears
 * nowhere in this file; linking to a route that 404s would be a worse failure than the one being
 * reported. When S8 lands, the `actions` arrays below are the single place it gets added.
 */

import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@/domain/errors';

/**
 * C03, `ux-architecture` §12.1 — "the only instruction in the product".
 *
 * Exported because it is legitimately one string in two places: F0's helper line under the paste
 * field, and `MALFORMED_URL`'s body (the same advice, arriving after the fact). Two literals would
 * be the same drift this module exists to stop, in miniature.
 */
export const COPY_LINK_INSTRUCTION = 'Copy the link in TikTok — Share → Copy link.';

/**
 * A recovery a failure screen may offer. Behaviour lives in the component; this module only says
 * *which* recoveries belong to *which* news.
 *
 *  - `retry` re-runs **the same URL** (`ux-architecture` §5.1: "`Retry` re-runs the same URL").
 *    That is not the same thing as `another_tiktok`, and conflating the two — which the old screen
 *    did, offering only "Try another link" — silently threw away the URL on every retryable code.
 *  - `open_tiktok` opens the pasted link. §5.1 calls this "the honesty move — we failed, here is
 *    your thing", so it is offered wherever the link is known to lead somewhere real.
 *  - `open_link` is the same move for `UNSUPPORTED_HOST`, where calling it "the TikTok" would be a
 *    lie — the whole point of that screen is that the link is an Instagram/YouTube/other link. Same
 *    behaviour, different label, because the label is the honest part.
 *  - `another_tiktok` returns to F0 with an empty, focused field (§5.3).
 *  - `sign_in` goes to `/sign-in`. `back_to_map` returns to `/map`. Both routes exist today.
 */
export type ImportErrorAction =
  | 'retry'
  | 'open_tiktok'
  | 'open_link'
  | 'another_tiktok'
  | 'sign_in'
  | 'back_to_map';

/** The label each action carries. `Retry` and `Open on TikTok` are C62; `Try another TikTok link` is
 *  C71; `Back to the map` is already this screen's wording for the same move; `Sign in →` follows
 *  the brand doc's primary-CTA rule (the trailing arrow is part of the label, not an icon). */
export const IMPORT_ERROR_ACTION_LABEL: Record<ImportErrorAction, string> = {
  retry: 'Retry',
  open_tiktok: 'Open on TikTok',
  // `RedirectScreen`'s existing wording, kept: it is the right label for a link that parsed but
  // is not TikTok's, and the user still gets their content back.
  open_link: 'Open the original link',
  another_tiktok: 'Try another TikTok link',
  sign_in: 'Sign in →',
  // Also `CaptionPreviewScreen`'s escape hatch: same action, same words, so it reads this rather
  // than carrying a second copy of the string.
  back_to_map: 'Back to the map',
};

/** Which mark the screen shows. A key, not a component, so this module stays free of React and can
 *  be unit-tested as data (the repo's test runner has no DOM). */
export type ImportErrorIcon = 'link-off' | 'post-unavailable' | 'photo' | 'waiting' | 'no-caption' | 'our-side' | 'locked';

/** One code's screen: the kicker, the headline, the one honest sentence, and the recoveries that
 *  actually apply. `actions[0]` is the primary; the rest are secondary in order. */
export interface ImportErrorCopy {
  readonly kicker: string;
  readonly headline: string;
  readonly body: string;
  readonly icon: ImportErrorIcon;
  /** Non-empty by construction: every failure screen offers at least one way out. */
  readonly actions: readonly [ImportErrorAction, ...ImportErrorAction[]];
}

/**
 * The map. Total over `DomainErrorCode` — see the header for why that is the point.
 *
 * Two groups deliberately read identically, and `07` §9 says so in as many words:
 * `UPSTREAM_TIMEOUT` / `RATE_LIMITED_UPSTREAM` ("same copy as timeout"; the second has never been
 * observed from TikTok and exists so a future change surfaces as its own log code), and
 * `EXTRACTOR_UNAVAILABLE` / `EXTRACTOR_INVALID_OUTPUT` (both are our own step failing after the
 * TikTok was read fine, and `domain/errors.ts` already gives them one shared message). Every other
 * pair must read differently, and a test enforces exactly that.
 */
export const IMPORT_ERROR_COPY: Record<DomainErrorCode, ImportErrorCopy> = {
  /** `07` §9: F1 inline / "We support TikTok links". Body is the string `RedirectScreen` already
   *  ships for the same news (brand doc §1: a recognised redirect, never a failure). */
  UNSUPPORTED_HOST: {
    kicker: 'Not TikTok',
    headline: 'That link isn’t from TikTok.', // NEW — §12.4 has no id for this headline
    body: 'We support TikTok links. Instagram and YouTube aren’t supported yet.',
    icon: 'link-off',
    // `open_link`, not `open_tiktok`: the whole news is that this link is not from TikTok. The affordance
    // itself comes from the screen this entry now also drives — the pre-submit redirect already
    // shipped an "Open the original link" escape and it was right to.
    actions: ['another_tiktok', 'open_link', 'back_to_map'],
  },

  /** `07` §9: F1 inline. Headline is C06 verbatim; body is C03 verbatim (the only instruction in
   *  the product). Reached from the server only when the client-side canonicaliser was bypassed. */
  MALFORMED_URL: {
    kicker: 'Check the link',
    headline: 'That doesn’t look like a TikTok link.', // C06
    body: COPY_LINK_INSTRUCTION, // C03
    icon: 'link-off',
    actions: ['another_tiktok', 'back_to_map'],
  },

  /** `07` §9: "That's a profile, not a post". Headline reuses `unsupportedUrl`'s own message in
   *  `domain/errors.ts`. No retry: a profile, tag, music or live link can never resolve to a post,
   *  and offering a retry sends the user round a loop that cannot end. `Open on TikTok` still
   *  applies — the link is real, it just isn't a video. */
  UNSUPPORTED_URL: {
    kicker: 'Not a video',
    headline: 'That’s a TikTok link, but not a video.',
    body: 'Profiles, hashtags and sounds don’t have a video for us to read. Open one video and copy the link from there.', // NEW
    icon: 'link-off',
    actions: ['another_tiktok', 'open_tiktok'],
  },

  /** `07` §9: "This share link has expired" — used verbatim as the headline. No `Open on TikTok`
   *  here on purpose: the `vm./vt./t/` hop is what failed, so we have positive evidence the link
   *  does not lead to the user's video, and an "Open on TikTok" that lands on the TikTok homepage
   *  is a broken promise rather than a recovery. */
  SHORT_LINK_UNRESOLVED: {
    kicker: 'Link expired',
    headline: 'This share link has expired.',
    body: 'Short TikTok links stop working after a while. Open the video in TikTok and copy the link from there.', // NEW
    icon: 'link-off',
    actions: ['another_tiktok', 'back_to_map'],
  },

  /** `07` §9: **F9**, the single honest state. C60 headline, C61 body, C62 actions minus the manual
   *  add that has no destination. The word "yet" is load-bearing (§5.1) and stays. */
  POST_UNAVAILABLE: {
    kicker: 'Couldn’t read it',
    headline: 'We couldn’t read this TikTok video yet.', // C60
    body: 'Some TikTok videos don’t share enough for us to work with. It’s worth a retry.', // C61
    icon: 'post-unavailable',
    actions: ['retry', 'open_tiktok', 'another_tiktok'], // C62
  },

  /** `07` §9: F9 with `Retry` primary. Headline states what actually happened (our own abort on
   *  TikTok's response), body borrows C61's closing sentence. */
  UPSTREAM_TIMEOUT: {
    kicker: 'TikTok didn’t answer',
    headline: 'TikTok took too long to answer.', // NEW, from `upstreamTimeout`'s own message
    body: 'That usually clears up on its own. It’s worth a retry.', // second half is C61
    icon: 'waiting',
    actions: ['retry', 'another_tiktok'],
  },

  /** `07` §9: "same copy as timeout". Identical on purpose — the distinction is a log code for a
   *  TikTok behaviour that has never been observed (`04` §E5), not news for the user. */
  RATE_LIMITED_UPSTREAM: {
    kicker: 'TikTok didn’t answer',
    headline: 'TikTok took too long to answer.',
    body: 'That usually clears up on its own. It’s worth a retry.',
    icon: 'waiting',
    actions: ['retry', 'another_tiktok'],
  },

  /** §5.4's rate-limit row, C67 verbatim as the body: no numbers, no "429". **No retry button** —
   *  §5.4 is explicit, and a retry would only hit the same limiter. `another_tiktok` is withheld
   *  for the same reason: the limit is per user, not per link, so the next link fails identically.
   *  The one honest move left is to leave and come back, so that is the only action. */
  RATE_LIMITED_LOCAL: {
    kicker: 'One moment',
    headline: 'Give it a few minutes.', // from C68
    body: 'You’ve added a lot of TikTok links in the last few minutes. Try again shortly.', // C67
    icon: 'waiting',
    actions: ['back_to_map'],
  },

  /** `07` §9 routes this to an **F10 variant**, not F9: "This post has no caption to read". Nothing
   *  is broken — we opened the post fine. So the primary action is forward (§5.3: "retrying the
   *  same URL will produce the same answer and offering it would be a lie about our capability"),
   *  and the closing sentence is C70's capability disclosure verbatim. */
  NO_CAPTION: {
    kicker: 'No caption',
    headline: 'No caption in this one.', // NEW, echoes C69's shape
    body: 'We opened it fine — there’s just no caption for us to read a place out of. Some TikTok videos only show the place on screen.', // tail is C70
    icon: 'no-caption',
    actions: ['another_tiktok', 'open_tiktok'], // C71 order, minus the manual add
  },

  /** `07` §9: F9 with `Retry` — "cheap, the source is cached". The headline's job is to stop
   *  blaming the TikTok for something our own step did. */
  EXTRACTOR_UNAVAILABLE: {
    kicker: 'On our side',
    headline: 'We read it, but couldn’t work out the places.', // NEW
    body: 'That one’s on us, not on the video. We’ve already got it, so a retry is quick.', // NEW
    icon: 'our-side',
    actions: ['retry', 'another_tiktok'],
  },

  /** `07` §9: F9. Same news as `EXTRACTOR_UNAVAILABLE` — our step failed after a clean read — and
   *  `domain/errors.ts` already gives both the one message. The two stay distinct codes for the
   *  logs, not for the screen. */
  EXTRACTOR_INVALID_OUTPUT: {
    kicker: 'On our side',
    headline: 'We read it, but couldn’t work out the places.',
    body: 'That one’s on us, not on the video. We’ve already got it, so a retry is quick.',
    icon: 'our-side',
    actions: ['retry', 'another_tiktok'],
  },

  /** `07` §9: "redirect to sign-in, pasted URL preserved". C76 as the headline. The body does not
   *  promise to preserve the link, because a full navigation to `/sign-in` unmounts this component
   *  and the URL is not preserved across it today — `Open on TikTok` is offered instead so the
   *  user leaves with their link rather than with a promise we don't keep. */
  NOT_AUTHENTICATED: {
    kicker: 'Signed out',
    headline: 'Sign in again to finish adding this.', // C76
    body: 'You were signed out. Sign in and paste the link again.', // NEW
    icon: 'locked',
    actions: ['sign_in', 'open_tiktok'],
  },

  /** `07` §9: "F9 generic. An `INTERNAL` in the logs is a bug report, always." The old screen's
   *  headline here was literally "Something went wrong", which §12 bans by name. */
  INTERNAL: {
    kicker: 'On our side',
    headline: 'That didn’t work on our side.', // NEW
    body: 'That one’s on us, not on the video. It’s worth a retry.', // second half is C61
    icon: 'our-side',
    actions: ['retry', 'another_tiktok'],
  },
};

/**
 * The boundary narrowing. The wire type says `DomainErrorCode`, but the response is JSON parsed
 * from a network call, so the client cannot *know* the string is in the union — a stale deploy, a
 * proxy, or an error body from something that isn't our route can all put an unknown string here.
 *
 * Narrowing once, at the seam, is what lets the render be exhaustive by the type system: past this
 * function there is no unknown code, so `IMPORT_ERROR_COPY[code]` needs no default branch and a
 * fifteenth code cannot quietly fall through to a generic screen. The `INTERNAL` fallback is
 * therefore only ever reached by something outside the taxonomy — never by one of the 14.
 */
export function toDomainErrorCode(raw: string): DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(raw) ? (raw as DomainErrorCode) : 'INTERNAL';
}

/**
 * The actions for one failure, **in render order**, with the server's `retryable` honoured over
 * the table. `[0]` is the primary; the last one is the tertiary.
 *
 * Two things happen here rather than in the component, so both are testable as data:
 *
 * 1. **The server's `retryable` wins.** The map's `actions` already encode `07` §9's retryable
 *    column (a `retry` appears on exactly the retryable codes, asserted against
 *    `DOMAIN_ERROR_CONSTRUCTORS` in the tests). This is the belt-and-braces: if the server ever
 *    sends `retryable: false` for a code the table calls retryable — a stage that has spent its
 *    one retry — we do not put a button on screen the server has already said will not work. Not
 *    symmetric: `retryable: true` never *adds* a retry to a code whose news makes retrying
 *    pointless (`NO_CAPTION`, `UNSUPPORTED_URL`, `RATE_LIMITED_LOCAL`).
 * 2. **A link out of the product is never the primary.** `open_tiktok` / `open_link` are honesty,
 *    not recovery. No entry leads with one, but dropping a `retry` can promote one —
 *    `POST_UNAVAILABLE` with `retryable: false` is exactly that case — so the first real recovery
 *    is pulled to the front.
 */
/** The two actions that hand the user back to somewhere that is not this product. Never a
 *  primary — see `importErrorActions`. */
const LEAVES_THE_PRODUCT: ReadonlySet<ImportErrorAction> = new Set(['open_tiktok', 'open_link']);

export function importErrorActions(
  code: DomainErrorCode,
  retryable: boolean,
): readonly [ImportErrorAction, ...ImportErrorAction[]] {
  const { actions } = IMPORT_ERROR_COPY[code];
  const kept = retryable ? [...actions] : actions.filter((action) => action !== 'retry');
  // Non-empty by construction and by test: every entry that offers `retry` offers at least one
  // other action, so dropping the retry can never empty the list. Expressed as a fallback rather
  // than a cast so "no failure screen is a dead end" stays a type-level fact.
  const primary = kept.find((action) => !LEAVES_THE_PRODUCT.has(action)) ?? kept[0] ?? actions[0];
  return [primary, ...kept.filter((action) => action !== primary)];
}

/**
 * The codes `canonicaliseTikTokUrl` produces on the client, before the route is ever called, that
 * get a **whole screen** rather than inline field copy.
 *
 * This exists because the fix above was only half true when it was first written. `/import` runs
 * the canonicaliser client-side and routes these three to their own screen without asking the
 * server, so their entries in the map above were unreachable — and the screen that *did* render
 * carried a second, hard-coded set of words that had already drifted (it collapsed
 * `UNSUPPORTED_HOST` and `UNSUPPORTED_URL` into one sentence, and its "This kind of TikTok post"
 * differed from this map's by a word). Two maps, and the one `07` §9 specifies was the one nobody
 * saw. Both screens now read from here.
 *
 * `MALFORMED_URL` is the fourth code the canonicaliser can return and is deliberately **not** in
 * this list: `07` §9 makes it inline field copy (C06), not a screen. Its entry above is what the
 * server's copy of the same verdict renders.
 *
 * A test pins this list against `canonicaliseTikTokUrl`'s actual behaviour, so a new pre-submit
 * verdict cannot appear without landing here.
 */
export const PRE_SUBMIT_ERROR_CODES = ['UNSUPPORTED_HOST', 'UNSUPPORTED_URL'] as const;

/** The three codes above, as a type — what `/import`'s pre-submit redirect screen may carry. */
export type PreSubmitErrorCode = (typeof PRE_SUBMIT_ERROR_CODES)[number];
