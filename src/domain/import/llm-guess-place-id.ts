/**
 * A deterministic, provider-shaped id for a candidate saved off `PlaceCandidate.coordinates`
 * alone — no `PlaceResolver` match behind it (the caption-preview "Done" save path, L0-F4-T3
 * follow-up, 2026-08-23). `resolve_place`'s identity is `(provider, providerPlaceId)`
 * (`place_provider_refs`'s unique constraint, migration 0005): this function's whole job is
 * producing the *same* string for the *same* candidate every time, so pasting the same TikTok
 * twice converges on one `places` row (D3's "no duplicate on repeat paste") instead of minting a
 * fresh `llm_guess` alias — and therefore a fresh `places` row — on every save.
 *
 * Not cryptographic and not collision-proof across two different real places that happen to share
 * a normalised name/city/country — an LLM guess is unverified recall already (`06` §3.4); two
 * guesses landing on the same key means they converge on one `places` row, which is the correct
 * outcome here, not a bug to guard against.
 *
 * ## Why the key is `rawName`, not `identifiedName`
 *
 * It used to be `identifiedName ?? rawName`, and that broke the one property this function exists
 * to provide. `identifiedName` is the model's *inference* — the field `types.ts` explicitly
 * exempts from the verbatim discipline — and it is not stable across runs. Measured on one real
 * caption, imported twice: "Kiaans Tooting" came back as `identifiedName: "Kiaans"` the first
 * time and `"Kiaans Tooting"` the second; "Sycamore Restaurant" as `"Sycamore Vino Cucina"` then
 * `"Sycamore Cucina & Bar"`. Two different keys, so two `places` rows for one venue — and the
 * library grew by two every time the same link was re-pasted.
 *
 * `rawName` is copied out of the caption, so for one post it is the same string on every run.
 * Identity therefore comes from what the *source* said, which is checkable; the model's
 * identification is still what gets *displayed* and written to `places.name`, because it is the
 * more useful answer. That split — verifiable thing decides identity, inferred thing decides
 * presentation — is the same rule `docs/working-agreement.md` §4 states for the product at large.
 *
 * The cost is real and smaller: two different captions naming one venue differently ("Kiaans" in
 * one post, "Kiaans Tooting" in another) still produce two rows. That is a resolver's job to
 * merge (`resolve_place`'s near-duplicate guard, L0-F2/F3), and it is strictly better than the
 * previous behaviour, where a *single* caption produced new rows indefinitely.
 *
 * ## Why the key is `placeNameKey`, not `normalise`
 *
 * `normalise()` keeps the space between words, so the same venue spelled two ways in two captions
 * minted two ids and therefore two `places` rows. Measured on the local database, 2026-08-28:
 * `llm:hakosem|tel aviv|israel` and `llm:ha kosem|tel aviv|israel` are two rows whose `name_key`
 * is the identical `hakosem`. `placeNameKey` (`domain/places/name-key.ts`) removes every
 * separator, so both spellings key the same and converge on one row.
 *
 * That file's own header carries the line this one inherits: **whitespace, punctuation and
 * diacritics cannot distinguish two venues, so they are removed; whole word tokens can, so they
 * are kept.** So `Tokii` and `Tokii London` still key apart, and deliberately — collapsing a
 * trailing locality token over-collapses against real distinct branches (`Loveat` and
 * `Loveat tel aviv`, 522 m apart, measured against the 10 462-row Tel Aviv index).
 *
 * ## What this does NOT fix, and where the real answer is
 *
 * Four of the sixteen `llm_guess` refs on the local database are duplicate pairs this key cannot
 * merge, because the two captions genuinely wrote different word tokens: `Tokii`/`Tokii London`
 * (85 m apart), `La Nonna`/`La Nonna Brixton` (91 m), `Kiaans`/`Kiaans Tooting`,
 * `Sycamore Vino Cucina`/`Sycamore Cucina & Bar`. `resolve_place`'s near-duplicate guard should
 * catch them on distance and does not: its radius is 75 m and these sit past it.
 *
 * Widening the radius has already been refused on evidence, and the measurement says why it would
 * not work anyway: **these are `llm_guess` coordinates, 65-470 m out and drifting a median 327 m
 * between two runs of the same caption.** A distance guard cannot deduplicate points whose noise
 * is four times its own radius. The merge signal has to come from somewhere other than the
 * model's geometry — a canonical provider place id, which is exactly what resolving through
 * Google gives us, and why the upgrade path off `llm_guess` has to be able to merge two existing
 * rows rather than only relabel one.
 */
import { placeNameKey } from '@/domain/places/name-key';
import type { PlaceCandidate } from '@/domain/types';

export function llmGuessProviderPlaceId(
  candidate: Pick<PlaceCandidate, 'rawName' | 'cityHint' | 'countryHint'>,
): string {
  const name = placeNameKey(candidate.rawName);
  const city = placeNameKey(candidate.cityHint);
  const country = placeNameKey(candidate.countryHint);
  const key = `llm:${name}|${city}|${country}`;
  // `place_provider_refs.provider_place_id` is `check (length(btrim(...)) between 1 and 200)` —
  // truncate defensively rather than let a long caption-derived name overflow the column's cap.
  return key.slice(0, 200);
}
