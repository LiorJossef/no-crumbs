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
 */
import { normalise } from '@/domain/places/normalise';
import type { PlaceCandidate } from '@/domain/types';

export function llmGuessProviderPlaceId(
  candidate: Pick<PlaceCandidate, 'rawName' | 'cityHint' | 'countryHint'>,
): string {
  const name = normalise(candidate.rawName);
  const city = normalise(candidate.cityHint);
  const country = normalise(candidate.countryHint);
  const key = `llm:${name}|${city}|${country}`;
  // `place_provider_refs.provider_place_id` is `check (length(btrim(...)) between 1 and 200)` —
  // truncate defensively rather than let a long caption-derived name overflow the column's cap.
  return key.slice(0, 200);
}
