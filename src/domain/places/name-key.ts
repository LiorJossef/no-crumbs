/**
 * The identity spelling of a place name: what `places.name_key` already is, available in
 * TypeScript.
 *
 * `places.name_key` is a **generated column** — `place_name_key(name)`, migration 0001 — and it is
 * what the near-duplicate guard in `resolve_place` compares on. The table has therefore had a
 * normalisation for identity since day one. The `llm_guess` provider id did not use it, and that
 * is a measured defect rather than a tidiness point: on the local database on 2026-08-28 the same
 * venue was minted under two ids, `llm:hakosem|tel aviv|israel` and `llm:ha kosem|tel aviv|israel`,
 * because `normalise()` **keeps** the space between words. Two ids means two rows in
 * `place_provider_refs` (its `unique (provider, provider_place_id)` never fires), so two rows in
 * `places`, so `HaKosem` three times in the saved list.
 *
 * ## What it does, and how it differs from the SQL function
 *
 * `normalise()` (this directory) down to letters and digits, then every separator removed:
 * lowercase → NFKD → drop combining marks → drop punctuation and symbols → drop whitespace.
 *
 * It is deliberately **at least as collapsing** as `place_name_key()`, and on two inputs it is
 * strictly more so:
 *
 *   - diacritics. `place_name_key('Café Florentin')` is `caféflorentin` (0001 keeps accents on
 *     purpose: `unaccent()` is not IMMUTABLE and so cannot appear in a generated column). Here it
 *     is `cafeflorentin`, because `normalise()` already NFKD-folds.
 *   - script-specific punctuation `normalise()` keeps inside its Hebrew and CJK ranges — the
 *     gershayim in `ת״א`, for instance — which the final strip removes.
 *
 * That asymmetry is safe **because these two keys are never compared to each other**. `name_key`
 * lives in the database and is compared against other `name_key`s; this function's output is
 * compared only against other outputs of this function, inside an `llm_guess` provider id. Making
 * them byte-identical would mean re-implementing a Postgres locale-dependent `[:alnum:]` in
 * JavaScript, which is a harder promise to keep than the one that actually matters: *the same
 * candidate yields the same key*.
 *
 * ## What it deliberately does NOT do: drop trailing locality or country words
 *
 * The obvious next step is to strip a trailing city or country token, so that `tokii london` in
 * London keys the same as `tokii`. **Measured against the 10,462-row Tel Aviv POI index on
 * 2026-08-28, that over-collapses**, and it over-collapses in the one direction we cannot recover
 * from. Real, distinct POIs in that index include `Loveat tel aviv` alongside `Loveat` (880 m,
 * 1.26 km, 3.0 km and 4.3 km apart — different branches of one chain), `ארומה תל אביב` alongside
 * `ארומה`, `הסושיה - תל אביב` alongside `הסושיה`, and the closest such pair, `Peppertelaviv`
 * against `Pepper`, 522 m apart. A provider id carries **no distance check at all** — it is
 * identity, enforced by a UNIQUE constraint — so collapsing those keys would fuse two genuinely
 * different venues into one row with nothing left to appeal to.
 *
 * The line drawn, and it is the line the whole file rests on: **whitespace, punctuation and
 * diacritics cannot distinguish two venues, so they are removed. Whole word tokens can, so they
 * are kept.** `HaKosem` and `Ha Kosem` are one venue under any reading; `Loveat` and
 * `Loveat tel aviv` are not.
 */
import { normalise } from './normalise';

/** Everything that is not a letter or a digit, in any script. */
const NON_ALNUM = /[^\p{L}\p{N}]+/gu;

export function placeNameKey(input: string | null | undefined): string {
  return normalise(input).replace(NON_ALNUM, '');
}
