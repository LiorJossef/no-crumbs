/**
 * What one field is being asked to do.
 *
 * `ADD-2`'s inline Add sheet has a single text input that has to serve three jobs at once: find a
 * place you already saved, take a TikTok link, and name a place we have never heard of. Which of
 * those is happening is decided here, once, as a pure function — so the field, the results list,
 * the primary action and the Enter key can never disagree about what is in the box.
 *
 * ## Three kinds — and the third one arrived by an owner reversal, so the history stays
 *
 * This file used to carry the opposite ruling, and it is recorded rather than deleted because the
 * reasoning was good and the reversal is what makes the current shape make sense.
 *
 * **The 2026-08-29 ruling** was that Instagram and YouTube are *not* recognised here: "a link we do
 * not read is not special, it is text, and the honest offer against text is 'add it manually'".
 * It also predicted its own undoing — "adding a fourth kind later means adding a branch to this
 * union and to `addSubmitIntent`, which is exactly where that decision should be forced to appear".
 * This is that branch.
 *
 * **Superseded 2026-08-31** (`overnight-run-plan.md` W1-5, growth defect G4). What the earlier
 * ruling missed is that filing a link as text does not merely decline to recognise it — it feeds
 * the URL to `manualAddLabel`, which quoted it back as `Add "https://www.instagram.com/reel/D…"
 * manually`. That is an offer to **name a place after a URL**, and it is a thing the product says
 * that is not true. Meanwhile `/import` handled the identical URL correctly, so the two ways into
 * the product disagreed. The reversal also restores what `brand-and-product-foundation.md` §1 has
 * said since 2026-08-20: a pasted Instagram or YouTube link is *recognised by name* and answered
 * with the manual-add path, never with a failure.
 *
 * ## What counts as a link, and the line this deliberately does not cross
 *
 * `unsupported-link` means the canonicaliser **recognised a host and rejected it** —
 * `UNSUPPORTED_HOST` (a real URL somewhere that is not TikTok) or `UNSUPPORTED_URL` (a TikTok URL
 * that is not a post, such as a profile). Both are parseable absolute URLs.
 *
 * A **schemeless** bare domain stays `text`, and that is a decision rather than an omission.
 * `canonicaliseTikTokUrl('kolamba.co.uk')` returns `MALFORMED_URL` — byte-identical to what it
 * returns for `Kolamba`, because without a scheme there is nothing to parse. Separating them would
 * mean guessing that a dot makes a string a URL, and that guess fails in the direction that costs
 * the user something real: a place genuinely called `Ben & Jerry's` or `St. John` would stop being
 * addable by name. The product may decline to read a link; it may not decide a place name is one.
 *
 * ## It reuses the two helpers that already exist, and adds no third regex
 *
 *  - `extractPastedUrl` pulls the link out of the caption-plus-hashtags blob TikTok's share sheet
 *    actually copies. It is explicitly *not* an SSRF boundary; it only chooses a substring.
 *  - `canonicaliseTikTokUrl` is that boundary — the closed six-host allow-list, no ports, no
 *    userinfo, no IP literals, and the path shapes that are actually posts.
 *
 * So `kind: 'tiktok'` means "the import pipeline will accept this", not "this string contains the
 * letters tiktok". A TikTok *profile* or hashtag URL is `text`, because it is not a post and no
 * amount of UI can make it one.
 */

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { extractPastedUrl } from '@/domain/source/extract-pasted-url';

export type UniversalInput =
  | { readonly kind: 'empty' }
  /** `url` is the link **as extracted from the surrounding text**, not the whole paste — it is what
   *  gets handed to the import pipeline, and it is what the field shows once the user pastes. */
  | { readonly kind: 'tiktok'; readonly url: string }
  /**
   * A link we recognised and cannot read: Instagram, YouTube, anywhere else, or a TikTok URL that
   * is not a post. Carries the URL so a caller can offer to open it — never so it can be named as
   * a place.
   */
  | { readonly kind: 'unsupported-link'; readonly url: string }
  /** Trimmed. This is both the search query and the name a manual add would start from. */
  | { readonly kind: 'text'; readonly text: string };

/** The two canonicaliser verdicts that mean "this is a link, just not one we read". `MALFORMED_URL`
 *  is deliberately absent — see the header: it is also what a plain place name returns. */
const RECOGNISED_LINK_CODES: ReadonlySet<string> = new Set(['UNSUPPORTED_HOST', 'UNSUPPORTED_URL']);

export function universalInput(raw: string): UniversalInput {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const candidate = extractPastedUrl(trimmed);
  const canonical = canonicaliseTikTokUrl(candidate);
  if (canonical.ok) return { kind: 'tiktok', url: candidate };
  if (RECOGNISED_LINK_CODES.has(canonical.error.code)) {
    return { kind: 'unsupported-link', url: candidate };
  }

  return { kind: 'text', text: trimmed };
}

/**
 * What pressing Enter / the phone keyboard's **Go** does.
 *
 * Separated from the component and from the classifier because it is the fix for backlog item 2.1
 * — the import field was a bare `<Input>` with no form, so Enter and Go both did nothing at all —
 * and a behaviour that regressed once should be asserted somewhere a test can reach without a DOM.
 *
 * The `'select'` arm is the judgement call: with text typed and at least one saved place matching,
 * Go opens the first match. The alternative was Go doing nothing while a list sat on screen, which
 * is the bug this exists to prevent. `'manual'` is what is left when nothing matches, and it is the
 * honest answer — the place is not in the library, so the next step is to add it.
 */
export type AddSubmitIntent =
  | { readonly kind: 'none' }
  | { readonly kind: 'tiktok'; readonly url: string }
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'manual'; readonly text: string };

export function addSubmitIntent(
  input: UniversalInput,
  firstResultId: string | null,
): AddSubmitIntent {
  switch (input.kind) {
    // Go on an empty field is an accident, not a request to add a nameless place. The manual-add
    // row is still on screen and is one tap away; this refuses to guess.
    case 'empty':
      return { kind: 'none' };
    case 'tiktok':
      return { kind: 'tiktok', url: input.url };
    /*
     * Go on a link we cannot read opens manual add, **blank**.
     *
     * The first draft of this arm returned `none`, on the reasoning that the screen is already
     * telling the user this is not a TikTok and the manual-add row is right there. The test named
     * "never returns `none` while there is something in the field" rejected it, and it was right
     * to: a dead Enter key is the exact regression this module was written to prevent (backlog
     * 2.1 — the import field was a bare `<Input>` with no form, so Enter and the phone keyboard's
     * Go both did nothing at all). A new kind must not quietly reopen it.
     *
     * Blank, not seeded, is what keeps this from being defect G4 wearing a different coat:
     * `manualAddSeed` returns `''` for every kind that is not `text`, so the form opens empty and
     * the URL is never offered as a place name. Go therefore does the one thing the screen offers,
     * which is what Go is for.
     */
    case 'unsupported-link':
      return { kind: 'manual', text: manualAddSeed(input) };
    case 'text':
      return firstResultId === null
        ? { kind: 'manual', text: input.text }
        : { kind: 'select', id: firstResultId };
  }
}

/** How much of what was typed the manual-add row quotes back. Long enough to recognise a place
 *  name, short enough that a pasted paragraph cannot turn a 44 px row into a wall of text. */
const MANUAL_LABEL_MAX = 32;

/**
 * The manual-add row's label. Always offered — with an empty field it is the generic invitation,
 * with text it quotes what you typed so the row is visibly about *your* place. Against a TikTok
 * link it goes back to the generic wording: `Add "https://vm.tiktok.com/…" manually` would be
 * offering to name a place after a URL.
 */
export function manualAddLabel(input: UniversalInput): string {
  if (input.kind !== 'text') return 'Add a place manually';
  const text =
    input.text.length > MANUAL_LABEL_MAX
      ? `${input.text.slice(0, MANUAL_LABEL_MAX).trimEnd()}…`
      : input.text;
  return `Add “${text}” manually`;
}

/**
 * What the manual add starts from. Only free text seeds a name; a link seeds nothing, so the
 * manual form opens blank rather than prefilled with a URL. `''` is a legal value — the caller
 * offers the row regardless of what is in the field.
 */
export function manualAddSeed(input: UniversalInput): string {
  return input.kind === 'text' ? input.text : '';
}
