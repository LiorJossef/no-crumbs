/**
 * Jaro and Jaro-Winkler similarity — a port of the prototype's `jw()`
 * (`docs/evidence/places/resolve-overture-scored.py`), which was **DuckDB's**
 * `jaro_winkler_similarity`, not a textbook.
 *
 * Why the fuss: the 44-case benchmark in `06` §6.3 was measured with DuckDB, and its tight cases
 * have top1−top2 margins of 0.000–0.048 (The Dove 0.000, 猿田彦珈琲 0.001, AFURI 0.002, Kiln 0.048)
 * against a `margin ≥ 0.05` gate. A plausible-looking Jaro-Winkler that differs in the fourth
 * decimal moves those cases across that gate, silently, in the direction of auto-accepting the
 * wrong branch of a chain — and at a 0.000 margin even a one-ulp difference can swap which row is
 * top-1. So this is not "an implementation of Jaro-Winkler"; it is a port of *DuckDB's*, and every
 * choice below was measured rather than reasoned from the algorithm's definition.
 *
 * **VERIFIED.** 2 153/2 153 pairs bit-identical to DuckDB 1.5.5 — every whole-string and token pair
 * the 44-case benchmark actually evaluated, 30 adversarial pairs, and 1 500 seeded fuzz pairs over
 * Latin, Hebrew and CJK alphabets. Generator: `docs/evidence/places/measure-jaro-winkler.py`.
 * Table: `docs/evidence/places/jaro-winkler-duckdb.json`. Replayed as a test in
 * `tests/unit/places/jaro-winkler.test.ts`, which is the regression guard on all of it.
 *
 * Four things the measurement decided that a textbook port gets wrong. Each was a wrong answer
 * first, then a diff against the table, then this comment:
 *
 *  1. **DuckDB compares UTF-8 bytes, not characters** — and this only shows up on the non-Latin
 *     rows `06` §7.1 is about. `jaro_similarity('猿田彦珈琲','猿田彦珈琲 渋谷')` = 0.893939…, which is
 *     `(1 + 15/22 + 1)/3`: 15 and 22 are **byte** lengths. On characters (5 and 8) it would be
 *     0.875. The Hebrew pair `('קפה לוינסקי','קפה לוינסקי 41')` = 0.958333… = `(1 + 21/24 + 1)/3`,
 *     byte lengths again. So the match window, the transposition scan and the prefix cap are all
 *     counted in bytes; a UTF-16 port diverges on exactly the Hebrew and Japanese names the
 *     resolver most needs.
 *  2. **Transpositions are floor-divided, not halved.** `('port said','potion bar')` has three
 *     order-mismatched matched bytes; DuckDB's answer, 0.7000000000000001, is `t = 1`, not
 *     `t = 1.5`. An odd count is possible because greedy matching is not symmetric, and the C++
 *     original divides an integer. Getting this wrong cost ~0.008 of score on 46 of the benchmark's
 *     pairs — far more than the margin gate can absorb.
 *  3. **The prefix boost has a 0.7 gate.** `('abcdefgh','abcdxxxx')` has a four-byte common prefix
 *     and gets **no** boost (jw = jaro = 0.666667); `('abcdefg','abcdxxx')` at jaro 0.714286 gets
 *     the full four-byte boost. Scale is 0.1 and the cap is 4 bytes: the implied prefix length
 *     `(jw − jaro)/(0.1·(1 − jaro))` is exactly 4.000 for every pair whose common prefix is ≥ 4
 *     (e.g. `abcdefgh`/`abcdefzz`, prefix 6, implies 4).
 *  4. **The boost is a fused multiply-add.** With the plain expression
 *     `jaro + prefix*0.1*(1 - jaro)`, 12 of the 666 real pairs came out exactly one ulp low —
 *     `('brat','basta')` gave 0.8049999999999999 where DuckDB says 0.805. The intermediate product
 *     is rounded twice in JavaScript and once in the C++ (the compiler contracts it into an FMA).
 *     `fma()` below reproduces the single rounding, and with it the table matches to the bit.
 *     One ulp is immaterial to the bands *by itself*; it is not immaterial to sort order at a
 *     0.000 margin, and it is what stands between task 4's golden file passing and "close enough".
 *
 * The arithmetic is grouped exactly as written. Float addition is not associative and the test
 * demands bit-identity, not closeness — do not "simplify" these expressions.
 *
 * The empty string scores **0, including against itself** (`jaro_winkler_similarity('','')` is
 * `0.0`, not `1.0`). The scorer never asks — `nameScore` returns early on an empty normalised
 * string — but it is pinned in the test, because "identical strings score 1" is precisely the
 * assumption a later refactor makes.
 */

/**
 * Fixed by DuckDB compatibility, **not** calibration — which is why they are here and not in
 * `SCORING` (`scoring-constants.ts`), whose stated purpose is to be re-fit against a larger golden
 * set (`06` §6.3). Changing one of these does not tune the resolver, it breaks the equivalence with
 * the numbers the benchmark was measured in. That `> 0.7` is strict rather than `>= 0.7` is
 * **ASSUMED** and unreachable in practice: a search over 60 000 random pairs found none whose Jaro
 * is the double `0.7` exactly (the nearest, `0.7000000000000001`, is above the gate either way).
 */
const PREFIX_SCALE = 0.1;
const PREFIX_MAX_BYTES = 4;
const BOOST_THRESHOLD = 0.7;

const UTF8 = new TextEncoder();

/** `2^27 + 1`, Dekker's splitting constant for exact double multiplication. */
const DEKKER_SPLIT = 134217729;

/**
 * `a*b + c` with a single rounding — what the C++ compiler emits for the boost step (header
 * note 4) and what JavaScript has no operator for.
 *
 * Dekker/Veltkamp: split each operand into two 26-bit halves so the product is exact as an
 * unevaluated sum `p + e`, then add `c` with a two-sum and round once at the end. Exact for our
 * inputs, which are all in `[0, 1]` — no overflow in the splitting step, which is the only case
 * where this technique is delicate.
 */
function fma(a: number, b: number, c: number): number {
  const product = a * b;
  const ca = DEKKER_SPLIT * a;
  const aHi = ca - (ca - a);
  const aLo = a - aHi;
  const cb = DEKKER_SPLIT * b;
  const bHi = cb - (cb - b);
  const bLo = b - bHi;
  const productError = (aHi * bHi - product + aHi * bLo + aLo * bHi) + aLo * bLo;

  const sum = c + product;
  const shifted = sum - c;
  const sumError = (c - (sum - shifted)) + (product - shifted);
  return sum + (sumError + productError);
}

/**
 * Classic Jaro over UTF-8 bytes (header note 1). Returns 0 if either side is empty.
 *
 * The match window is `max(0, floor(max(l1,l2)/2) − 1)`. The `max(0, …)` is not cosmetic: for two
 * one-byte strings the raw expression is −1, and a negative window makes `('a','a')` score 0 where
 * DuckDB returns 1. It must also floor at 0 rather than 1, because DuckDB returns 0 for
 * `('ab','ba')` — with a window of 1 that pair would score 0.666667.
 */
export function jaroSimilarity(a: string, b: string): number {
  const s1 = UTF8.encode(a);
  const s2 = UTF8.encode(b);
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const matched1 = new Uint8Array(l1);
  const matched2 = new Uint8Array(l2);

  let matches = 0;
  for (let i = 0; i < l1; i += 1) {
    const from = Math.max(0, i - window);
    const to = Math.min(l2 - 1, i + window);
    for (let j = from; j <= to; j += 1) {
      if (matched2[j] === 1 || s1[i] !== s2[j]) continue;
      matched1[i] = 1;
      matched2[j] = 1;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  // Matched bytes that occupy a different relative position on each side, counted then floored —
  // header note 2. The count can be odd, so the floor is observable.
  let mismatchedOrder = 0;
  let k = 0;
  for (let i = 0; i < l1; i += 1) {
    if (matched1[i] !== 1) continue;
    while (matched2[k] !== 1) k += 1;
    if (s1[i] !== s2[k]) mismatchedOrder += 1;
    k += 1;
  }
  const transpositions = Math.floor(mismatchedOrder / 2);

  return (matches / l1 + matches / l2 + (matches - transpositions) / matches) / 3;
}

/**
 * Jaro with Winkler's common-prefix boost: gated at 0.7, scale 0.1, prefix capped at four bytes,
 * boost fused (header notes 3 and 4).
 *
 * This is the function the scorer calls. `jaroSimilarity` is exported only so the DuckDB comparison
 * test can pin both halves independently, which is what localises a future divergence to the Jaro
 * core or to the boost.
 */
export function jaroWinklerSimilarity(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  if (jaro <= BOOST_THRESHOLD) return jaro;

  const s1 = UTF8.encode(a);
  const s2 = UTF8.encode(b);
  const limit = Math.min(PREFIX_MAX_BYTES, Math.min(s1.length, s2.length));
  let prefix = 0;
  while (prefix < limit && s1[prefix] === s2[prefix]) prefix += 1;

  return fma(prefix * PREFIX_SCALE, 1 - jaro, jaro);
}
