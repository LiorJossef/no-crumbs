/**
 * What one field is being asked to do.
 *
 * `ADD-2`'s inline Add sheet has a single text input that has to serve three jobs at once: find a
 * place you already saved, take a TikTok link, and name a place we have never heard of. Which of
 * those is happening is decided here, once, as a pure function — so the field, the results list,
 * the primary action and the Enter key can never disagree about what is in the box.
 *
 * ## Two kinds, not five
 *
 * The owner's ruling (2026-08-29) is that Instagram and YouTube are **not** recognised here. There
 * is deliberately no `unsupported-host` arm: a link we do not read is not special, it is text, and
 * the honest offer against text is "add it manually". Adding a fourth kind later means adding a
 * branch to this union and to `addSubmitIntent`, which is exactly where that decision should be
 * forced to appear.
 *
 * ## It reuses the two helpers that already exist, and adds no third regex
 *
 *  - `extractPastedUrl` pulls the link out of the caption-plus-hashtags blob TikTok's share sheet
 *    actually copies. It is explicitly *not* an SSRF boundary; it only chooses a substring.
 *  - `canonicaliseTikTokUrl` is that boundary — the closed five-host allow-list, no ports, no
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
  /** Trimmed. This is both the search query and the name a manual add would start from. */
  | { readonly kind: 'text'; readonly text: string };

export function universalInput(raw: string): UniversalInput {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const candidate = extractPastedUrl(trimmed);
  if (canonicaliseTikTokUrl(candidate).ok) return { kind: 'tiktok', url: candidate };

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
