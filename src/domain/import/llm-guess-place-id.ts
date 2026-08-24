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
 */
import { normalise } from '@/domain/places/normalise';
import type { PlaceCandidate } from '@/domain/types';

export function llmGuessProviderPlaceId(
  candidate: Pick<PlaceCandidate, 'rawName' | 'identifiedName' | 'cityHint' | 'countryHint'>,
): string {
  const name = normalise(candidate.identifiedName ?? candidate.rawName);
  const city = normalise(candidate.cityHint);
  const country = normalise(candidate.countryHint);
  const key = `llm:${name}|${city}|${country}`;
  // `place_provider_refs.provider_place_id` is `check (length(btrim(...)) between 1 and 200)` —
  // truncate defensively rather than let a long caption-derived name overflow the column's cap.
  return key.slice(0, 200);
}
