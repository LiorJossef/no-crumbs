/**
 * The other half of "derive every place fact server-side": the three columns migration `0019`
 * added to `saved_places`, computed from the stored extraction and from nothing else.
 *
 * ## Why this is a separate file from `candidate-place.ts`
 *
 * They look like the same job and they are not, and the difference is a privilege boundary.
 * `derivePlaceSave` produces the facts that reach **`places`** — a table shared across users,
 * written only by `resolve_place` under `service_role`. This produces the facts that reach **one
 * user's own `saved_places` row**, written only by `apply_saved_place_extraction`, also under
 * `service_role` but for a different reason: those three columns carry no `INSERT` or `UPDATE`
 * grant for `authenticated` at all, so a browser POSTing straight to `/saved_places` is refused
 * 42501 by Postgres rather than by anything we wrote. Two tables, two writers, two failure
 * consequences — one file each.
 *
 * ## The request never contributes here
 *
 * This function takes a `PlaceCandidate` — a candidate the server read back out of its own
 * `extractions` row — and returns column values. There is no parameter through which a client could
 * reach these columns, which is the same invariant `candidate-place.ts` was written to restore
 * after the `resolve_place` hole, applied to the fields `0019` added. `tags`, `dishes` and `whyGo`
 * are place facts; the note is the only thing the user authors.
 *
 * ## Empty is `null`, and that conversion happens exactly here
 *
 * `PlaceCandidate.tags` is `readonly string[]`, empty-means-empty. `saved_places.tags` has one
 * empty state and it is `NULL` — the normalising trigger collapses `'{}'` to it, and `0019`'s
 * header names two spellings of "no labels" as the bug it is avoiding. Rather than let each caller
 * remember, the whole function returns `null` when there is nothing at all to write, so
 * "should I call the writer?" is a null check and not three.
 *
 * ## What is deliberately not normalised here
 *
 * `tags` arrive already `normalise()`d (`extraction/tags.ts` — the repo's single answer to "are
 * these the same text?", and a fixed point of the database's own `normalize_tag`, so nothing is
 * rewritten on write). `dishes` and `whyGo.text` arrive **as written**: a dish name and a sentence
 * are prose to read, not keys to match on, and folding `crème brûlée`'s accents would cost
 * information for no gain. `0019`'s trigger lowercases and NFKC-folds them on the way in, which is
 * hygiene, not identity. Doing it twice, differently, on this side is precisely the second
 * normalisation rule `current-state.md` §4 warns against.
 */

import type { PlaceCandidate, SavedPlaceEnrichment } from '../types';

/** Empty array to `null`, and nothing else — the bounds and the normalisation are the database's
 *  (`0019` §1, deliberately rejecting rather than truncating an over-long list, so a schema bug
 *  surfaces as a failed write instead of as quietly discarded model output). */
function listOrNull(values: readonly string[]): readonly string[] | null {
  return values.length === 0 ? null : values;
}

/**
 * The enrichment for one candidate, or `null` when the caption supported none of it — which is a
 * normal and frequent outcome, not a failure. `null` means "do not call the writer"; it does not
 * mean "this extraction had no enrichment *available*". That distinction belongs to
 * `StoredCandidate.schemaVersion` (`stored-candidates.ts`) and is kept out of this return type on
 * purpose: a v1 candidate and a v2 candidate over a bare caption both produce `null` here, and only
 * the caller knows which it is holding.
 */
export function deriveSavedPlaceEnrichment(candidate: PlaceCandidate): SavedPlaceEnrichment | null {
  const tags = listOrNull(candidate.tags);
  const dishes = listOrNull(candidate.dishes);
  // `whyGo.text` only. `whyGo.groundedIn` is the verbatim caption fragment that licenses it, and it
  // is written to a *different* column — see `candidate-place.ts`'s `extractedReason`. Splitting
  // the pair across two differently-named columns is the whole point of the mapping: the
  // extracted-vs-inferred distinction becomes schema instead of a convention a reader has to know.
  const whyGo = candidate.whyGo === null ? null : candidate.whyGo.text;

  if (tags === null && dishes === null && whyGo === null) return null;

  return { tags, whyGo, dishes };
}
