/**
 * **Every TikTok link behind one saved place** — the words and the arithmetic, kept out of the
 * renderer so both can be asserted without mounting a card.
 *
 * `saved_place_sources` is many-to-many (`08 §3.6`) and `save_place` (`0034`) inserts a second
 * link with `on conflict do nothing`, so saving the same place from a second TikTok link keeps
 * both rows. `getSpots` has returned all of them as `sources` (earliest-linked first) since
 * round 3 lane G's data half shipped; nothing rendered them, so the card showed the post that
 * *first* justified the save and every later one was invisible. This is the render half's
 * vocabulary.
 *
 * ## Three rules this module exists to hold
 *
 * 1. **One source gains no chrome.** `extraSources` is `sources.slice(1)`, so a place with one
 *    link — the common case — produces an empty array and the card is byte-identical to what it
 *    was. A list of one is not a list; it is the thing the card already draws at the top.
 * 2. **Earliest-linked first, matching `sources`' own order.** Newest-first was the alternative and
 *    it was rejected for a structural reason rather than a taste one: the card's headline
 *    attribution — the still, the caption quote, the creator credit and the `Open on TikTok` pill —
 *    is `sources[0]`, so reversing the tail would put the list out of step with the head it
 *    continues. `added_at` is a fact about the rows; "most recent" would be a second ordering
 *    nobody could see the key for.
 * 3. **Attribution is an obligation.** Developer Terms III.3(n) forbids deleting *"author
 *    attributions … or other labels of origins or source of material"*
 *    (`docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` §5.1). Every row this
 *    module labels carries the creator and links back to the post; the third part of TikTok's own
 *    definition — the description — is per-*save* rather than per-source in our schema
 *    (`saved_places.extracted_reason`), so it stays where it already is, on the headline source's
 *    quote. Nothing here is permitted to render a source without its creator *and* its link.
 *
 * **No TikTok mark is named here and none may be.** §7.1 of the same document: the word, the
 * `@handle`, the link and a neutral glyph of our own drawing are the whole permitted palette, and
 * §10.5 makes `TikTok` an adjective — `1 more TikTok video`, never `1 more TikTok`.
 */

import type { SpotSource } from '@/domain/places/spot';

/**
 * The sources the card does not already show at its top, in `sources`' own order.
 *
 * Total on purpose: `undefined` is what a collection peer's `SharedOnlyPlaceFacts` carries (a
 * collection never receives this array — migration `0024` refused the read policy), and a manual
 * save carries `[]`. Both mean "nothing extra to draw".
 */
export function extraSources(
  sources: readonly SpotSource[] | undefined,
): readonly SpotSource[] {
  return sources === undefined ? [] : sources.slice(1);
}

/**
 * `Also saved from 2 more TikTok videos`, and the singular that is not `1 place(s)`.
 *
 * `more` is load-bearing: the first one is already on screen above this line, so a count without it
 * would contradict the still and the credit directly above.
 */
export function moreSourcesLine(count: number): string {
  return count === 1
    ? 'Also saved from 1 more TikTok video'
    : `Also saved from ${count} more TikTok videos`;
}

/**
 * What one extra source is called on screen: the creator, and only the creator.
 *
 * `@handle` first because that is what a person recognises and what TikTok's own attribution
 * definition names; `author_name` is the display name and is the fallback the oEmbed schema
 * already models. When both are null the label is the artefact rather than an invented credit —
 * `SpotSource`'s own caveat is that the degradation is *no credit*, never a generic one, and
 * `TikTok video` claims nothing about who made it. Measured at 16/16 posts oEmbed returned both
 * (`01-oembed-field-inventory.md`), so this arm is theoretical rather than observed.
 */
export function sourceCreatorLabel(source: SpotSource): string {
  if (source.authorHandle) return `@${source.authorHandle}`;
  if (source.authorName) return source.authorName;
  return 'TikTok video';
}

/**
 * The link's accessible name. `Open on TikTok` is the ratified sentence
 * (`voice-and-vocabulary.md` §3, `place-sheet.tsx`'s pill); this is the same sentence with the
 * creator in it, because a list of three links all announced `Open on TikTok` names no destination.
 */
export function openSourceLabel(source: SpotSource): string {
  const creator = sourceCreatorLabel(source);
  return creator === 'TikTok video' ? 'Open on TikTok' : `Open ${creator} on TikTok`;
}
