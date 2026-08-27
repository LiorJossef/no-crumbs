/**
 * The paste screen's "or try one of these" seeds (S6/F0).
 *
 * **Why this exists.** `/import` at zero places is a heading, a paste field and a disabled button.
 * A first-time user has nothing to paste and has to leave the product to find a TikTok, which is
 * the worst possible first minute for a product that is worth nothing until it holds a few places.
 * These are two or three real TikToks the user can tap to see the whole loop run.
 *
 * **What a seed is not.** It is not a demo, a fixture, or a shortcut. Tapping one sets the paste
 * field and calls the *same* `submit` a paste calls — same probe route, same LLM call, same
 * review-and-confirm step, same failure screens. Nothing reaches `places`/`saved_places` without
 * the user confirming on the review screen, and that stays true for seeds: onboarding speed is not
 * worth trading a confirm step for. A seed that has since been deleted or made private lands on
 * the ordinary `probe_error` screen like any other dead link, because it *is* any other dead link.
 *
 * **Cost.** Each uncached tap spends one Gemini call against a hard 500/day budget shared with
 * every agent and the owner, so nothing here may ever be prefetched, warmed, or fired on mount.
 * A seed costs exactly what the user asked for, only when they ask for it.
 *
 * **Editing this list.** This is the single place. Swapping a URL is a one-line edit, and
 * `tests/unit/import/seed-links.test.ts` re-checks every entry against the real
 * `canonicaliseTikTokUrl` — so a swapped-in Instagram link, profile URL or typo fails the build
 * rather than shipping a seed that dead-ends the first thing a new user ever taps.
 *
 * **Labels describe the video, never the result.** No entry names a venue: extraction is ~27% at
 * LEVEL B, so a label reading "Cafe Levinsky" would be a promise the pipeline cannot keep three
 * times out of four, and a broken promise on first run is worse than no promise at all.
 */

export interface ImportSeedLink {
  /** Two or three plain words about the video. Never a venue name — see the file header. */
  readonly label: string;
  /** A real, public TikTok URL. Short (`vt.tiktok.com`) and full forms are both fine; the
   *  canonicaliser and the source adapter handle both. */
  readonly url: string;
}

/**
 * The seeds, in render order. Keep it at three or fewer: this row is a quiet aside under the paste
 * field, and a fourth chip starts competing with the field it is meant to support.
 *
 * These three are corpus links already used by the recognition harness, so they are known to be
 * real TikToks rather than links invented for a screenshot. Which places (if any) each yields is
 * whatever the real pipeline says on the day — that is the point of running the real path.
 */
export const IMPORT_SEED_LINKS: readonly ImportSeedLink[] = [
  { label: 'Coffee in Tel Aviv', url: 'https://vt.tiktok.com/ZSVphhEg6/' },
  { label: 'Brunch in Tel Aviv', url: 'https://vt.tiktok.com/ZSVprwmjy/' },
  // NOTE, 2026-08-28: the URL handed over for this slot was `.../video/725901084555898397` — 18
  // digits, one short of the corpus link `.../video/7259010845558983978`. It canonicalises (the
  // id band is 17-20 digits) and then 404s: driven live it returned `POST_UNAVAILABLE` and the
  // chip dead-ended on the failure screen. Restored to the 19-digit corpus link, which is the
  // same video and is verified working. Flagged to the owner rather than assumed.
  { label: 'Restaurants in Tel Aviv', url: 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978' },
];
