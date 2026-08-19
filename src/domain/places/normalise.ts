/**
 * The one normalisation. `poi_index.name_norm` is written by the loader and compared against a
 * query normalised by the resolver; if those two ever differ, matching degrades **quietly** —
 * no error, just a coverage drop that reads as bad data (`10` §4).
 *
 * **It lives in `domain/`, not `integrations/places/normalise.ts` as `10` §4.1 says.** That is not
 * a preference: the scorer is `domain/places/`, `domain/` may not import `integrations/`
 * (`eslint.config.mjs`, `no-restricted-imports`, proved by `scripts/check-layer-guard.sh`), and
 * the scorer's first step is to normalise. As written, `10` §4.1 was an ESLint error. It is also
 * the right layer on its own merits: this function is pure, has no vendor in it, and is the
 * definition of a domain concept — what two place names being "the same name" means.
 *
 * The ingest loader (`scripts/`, `10` §7 step 3) imports it from here too. That is the point of
 * §4.1's "one implementation" and it survives the move: `scripts/` is not a layer with a zone.
 *
 * Ported from `norm()` in `docs/evidence/places/resolve-overture-scored.py`, which produced the
 * 44-case benchmark. Any deliberate divergence is listed below and nowhere else.
 */

/**
 * Bumped whenever anything in this file changes the output of `normalise()`.
 *
 * Written into `poi_regions.norm_version` (`smallint check (norm_version > 0)`, migration 0010) by
 * the loader. The resolver asserts that every loaded region's `norm_version` equals this constant
 * and **refuses to serve** on a mismatch rather than serving quietly degraded results: a
 * normalisation change means a reload, and this makes forgetting loud.
 */
export const NORM_VERSION = 1;

/**
 * Everything that is *not* dropped. Deliberately not a literal port of the Python
 * `[^\w\s\u0590-\u05FF\u3000-\u9FFF]+` (its literals written here as escapes), because `\w` is
 * Unicode-aware in Python and ASCII-only in JavaScript unless you say otherwise — a literal port
 * strips **every Hebrew and Japanese character**, breaking precisely the cases `06` §7.1 is about,
 * and it fails as silent coverage loss rather than as an exception (`10` §4, "the known porting trap").
 *
 *  - `\p{L}\p{N}` with the `u` flag is Python's `\w` for letters and numbers in any script.
 *  - `_` because Python's `\w` includes it.
 *  - `\s` is whitespace, kept here and collapsed in the next step. `\s` includes U+3000
 *    IDEOGRAPHIC SPACE in both Python and JavaScript, so the prototype's explicit U+3000 literal
 *    is not a special case.
 *  - `\u0590-\u05FF` (Hebrew) and `\u3000-\u9FFF` (CJK punctuation, kana, CJK ideographs) are
 *    kept verbatim from the prototype. They are all but redundant given `\p{L}`; they are
 *    retained because the benchmark numbers were produced with them, and because they also keep
 *    Hebrew punctuation (maqaf, geresh) and CJK punctuation, which `\p{L}\p{N}` would drop.
 */
const DROP = /[^\p{L}\p{N}_\s\u0590-\u05FF\u3000-\u9FFF]+/gu;

/**
 * Combining marks, stripped after NFKD so `café` and `cafe` are one name.
 *
 * **Known bounded divergence from the prototype.** Python tests `unicodedata.combining(ch)`, i.e.
 * a non-zero canonical combining class; JavaScript exposes no combining-class data, so this is
 * `\p{Mn}` (non-spacing marks). The two sets differ only on non-spacing marks whose combining
 * class is 0 — Thai, Lao, Khmer and some Indic vowel signs — which we strip and Python keeps. No
 * such character appears in a Tel Aviv, Tokyo or London extract, so the byte-identity test in
 * `10` §4.3 is unaffected. And it cannot cause the silent drift §4 is about: after MS5 the Python
 * is gone, both the loader and the resolver call *this* function, and a change to it bumps
 * `NORM_VERSION` and forces a reload. `\p{Mc}` (spacing marks) and `\p{Me}` are **not** stripped,
 * which matches Python, whose combining class for those is 0.
 */
const COMBINING = /\p{Mn}/gu;

const WHITESPACE = /\s+/gu;

/**
 * NFKD → strip combining marks → drop punctuation and symbols → collapse whitespace → trim.
 *
 * Lowercasing happens **before** NFKD, as in the prototype. The order is observable: some
 * `toLowerCase()` results themselves decompose (`İ` → `i` + U+0307), and doing it the other way
 * round would leave a mark behind that the strip step has already run past.
 *
 * Never strips non-Latin ranges (`06` §6.1 step 1). Non-Latin querying has a real, measured
 * limitation (`06` §7.1) and it is not this function's to fix — dropping the script would hide it.
 */
export function normalise(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(DROP, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * The prototype's `toks()`: normalise, then split on whitespace, empties dropped.
 *
 * Here rather than in the scorer because it is the same decision as `normalise()` — what counts
 * as one token of a place name — and because the loader wants it too. Which tokens are
 * *distinctive* is a scoring decision (the `GENERIC` set) and belongs to the scorer's constants
 * object, not here.
 */
export function tokenise(input: string | null | undefined): string[] {
  const normalised = normalise(input);
  return normalised === '' ? [] : normalised.split(' ');
}
