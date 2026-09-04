/**
 * **A country name in a query, answered from the user's own library and nothing else.**
 * `docs/nls-plan.md` §5.1 step 1 — Stage 2's second slice, and the sibling of `locality-match.ts`.
 *
 * The model still returns a free-text `keyword` copied verbatim out of the sentence. No schema
 * bump, no prompt change, no re-run of the Stage 1 gate, and **nothing about the user's geography
 * leaves the device** — which is the §5.5 ruling's own observation about this slice: countries
 * were already solved locally by `toCountryCode()` (ICU over `en` and `he`), so sending them would
 * be "disclosure for zero function".
 *
 * ## What it answers, and what it refuses to
 *
 * `Italy` resolves to `IT`, and then to **the rows this user has in `IT`**. A country they have
 * nothing in resolves to `null`: not an empty filter, not a flight to an empty map — nothing at
 * all, the same shape `resolveLocality` uses and for the same reason (§5.1 step 4, §5.6). It is
 * not a geocoder and cannot say where Italy is; it can only say whether you saved anything there.
 *
 * ## Two guards that are not decoration
 *
 * **A two-letter keyword is not a country.** `toCountryCode` deliberately accepts a bare alpha-2
 * code, because its own caller is a model asked for a country. Here the input is a fragment of an
 * ordinary sentence, and essentially every two-letter English word is somebody's ISO code —
 * measured: `it`→IT, `in`→IN, `at`→AT, `no`→NO, `is`→IS, `be`→BE, `to`→TO, `me`→ME, `us`→US.
 * Accepting them would turn the commonest words in the language into a geography filter on any
 * library that happens to hold a row there. `uk` and `us` are the two forms a person really does
 * write in a sentence, so they are named; nothing else two letters long resolves.
 *
 * **Hebrew fuses its preposition onto the name.** §5.6 requires `in Italy` and `באיטליה` to agree,
 * and `באיטליה` is `ב` + `איטליה` in one token — ICU has no entry for it. So a single leading
 * `ב`/`ל`/`מ` is stripped **only after the whole word has failed, and only if the remainder
 * resolves**, which is what keeps `בורקס` from becoming a country. The full form is always tried
 * first, so `בהוטן` (Bhutan) answers as itself rather than as a prefixed `הוטן`.
 *
 * The same fusion applies to city names (`בלונדון`), and `locality-match.ts` does **not** strip it.
 * That asymmetry is deliberate and reported rather than quietly fixed: the locality rungs were
 * measured as they stand, and widening them is its own change with its own measurement.
 */
import { toCountryCode, toCountryName } from '@/domain/places/country-code';
import { normalise } from '@/domain/places/normalise';

/** The least a row has to be for this to reason about it — structural, so `domain/` never learns
 *  about `MapPlace`. The same projection-by-argument shape `locality-match.ts` uses. */
export interface CountryRow {
  readonly id: string;
  readonly countryCode: string | null | undefined;
}

export interface CountryMatch {
  /** ISO-3166-1 alpha-2, as `places.country_code` stores it. */
  readonly code: string;
  /**
   * What to call it. `toCountryName` is the same function the flag discs and the `Elsewhere`
   * country rows already use, so a chip cannot name a country differently from the map beside it.
   *
   * §5.3's "the library's own spelling" has nothing to quote here — a country is stored as a
   * two-letter code, never as a word — so the product's existing English name for that code *is*
   * the library's own vocabulary for it, and `toCountryName`'s own header records the ruling that
   * a country name in this position is interface rather than content.
   */
  readonly label: string;
  /** The rows in that country: what the filter is. */
  readonly memberIds: readonly string[];
  /**
   * **How many rows of the whole library carry no country code at all** — reported, never
   * silently dropped (§5.6). Those rows cannot be in any country's answer and cannot be shown to
   * be outside one either; a caller that hides the number is asserting a completeness it does not
   * have. It is a property of the library, not of this match, so it is the same number whichever
   * country resolved.
   */
  readonly unplaceable: number;
}

/** The Hebrew prepositional prefixes that fuse onto a place name: in, to, from. `ה` (the) and `ו`
 *  (and) are left out — neither introduces a country in a search sentence, and each one added is
 *  another word whose tail might accidentally be a country. */
const HEBREW_PREFIXES = ['ב', 'ל', 'מ'] as const;

/** The only two-letter keywords accepted, because they are the only two a person writes in a
 *  sentence rather than in a database column. Normalised, lower-case. */
const SHORT_FORMS: ReadonlySet<string> = new Set(['uk', 'us']);

/** The alpha-2 code for a keyword, or `null` — `toCountryCode` with the two guards above. */
export function keywordCountryCode(keyword: string | null | undefined): string | null {
  const text = (keyword ?? '').trim();
  if (text === '') return null;

  const key = normalise(text);
  if (key === '') return null;
  if (key.length < 3 && !SHORT_FORMS.has(key)) return null;

  const direct = toCountryCode(text);
  if (direct !== null) return direct;

  // Only now, and only for a form that is otherwise unreadable: `באיטליה` → `איטליה` → `IT`.
  for (const prefix of HEBREW_PREFIXES) {
    if (!key.startsWith(prefix) || key.length < 4) continue;
    const stripped = toCountryCode(key.slice(1));
    if (stripped !== null) return stripped;
  }
  return null;
}

/**
 * Resolve a keyword to one of the countries the user actually has places in, or to nothing.
 *
 * `null` means *this is not the name of a country in this library* — either it is not a country
 * name at all, or it is one the user has saved nothing in. The two are deliberately the same
 * answer: both leave the keyword as text and neither moves the camera, and telling them apart on
 * screen would be this product volunteering that it knows where Italy is while showing you
 * nothing (§5.4).
 */
export function resolveCountry(
  keyword: string | null | undefined,
  rows: readonly CountryRow[],
): CountryMatch | null {
  const code = keywordCountryCode(keyword);
  if (code === null) return null;

  const memberIds: string[] = [];
  let unplaceable = 0;
  for (const row of rows) {
    // Canonicalised through the same function that read the query, so a stored deprecated code
    // and a queried current name meet on one value rather than missing each other.
    const stored = toCountryCode(row.countryCode);
    if (stored === null) unplaceable += 1;
    else if (stored === code) memberIds.push(row.id);
  }

  // Nothing saved there is not an empty filter — it is no filter. §5.6: "a country the user has
  // nothing in produces no filter and no flight."
  if (memberIds.length === 0) return null;

  return { code, label: toCountryName(code) ?? code, memberIds, unplaceable };
}
