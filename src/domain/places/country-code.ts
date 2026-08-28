/**
 * Country name → ISO-3166-1 alpha-2, for the one seam where a mismatch was silently costing us
 * every country code in the database.
 *
 * The problem this fixes. `prompt.ts` asks the model for a country **name** ("If the caption names
 * a city, neighbourhood or country, put it in `cityHint`/`countryHint`"), and captions say
 * "Israel", "Japan", "Czechia" — never "IL". The confirm seam then required
 * `/^[A-Z]{2}$/` and mapped everything else to `null`. So `places.country_code` was NULL on every
 * imported row, verified on the live local database. That is not cosmetic: `resolve_place`'s
 * near-duplicate guard (migration 0014) compares `country_code is not distinct from
 * p_country_code`, so a NULL on one side of a later re-resolution misses the match and writes a
 * **second `places` row for one physical venue** — charter invariant 4, failing quietly.
 *
 * Why `Intl.DisplayNames` rather than a hand-maintained table of 250 countries: the ICU data ships
 * with Node and stays current, and a table we maintain ourselves is a table that goes stale. Two
 * things ICU alone gets wrong for our input, both handled below:
 *
 *  - **Deprecated and exceptionally-reserved codes collide with real ones.** Brute-forcing all
 *    676 two-letter combinations finds `FX` (Metropolitan France) and `UK` (an alias) alongside
 *    `FR` and `GB`, and `VD` (North Vietnam) alongside `VN`. Alphabetically-first resolves `FR`
 *    and `GB` correctly but picks `VD` over `VN`, so alphabetical order is a partial fix at best
 *    and the `ALIASES` table below is what actually settles the ambiguous ones.
 *  - **ICU tracks official renames; captions do not.** ICU's display name for `TR` is "Türkiye",
 *    so a caption saying "Turkey" misses entirely.
 *  - **A caption is not written in English, and neither is the hint taken from it.** The prompt
 *    tells the model to copy location words as the caption writes them, so a Hebrew caption yields
 *    `countryHint: "ישראל"`. Measured on this database: that row's `country_code` is NULL, which
 *    is exactly the failure this module was written to stop — one physical venue, three `places`
 *    rows, because the dedup guard's `country_code is not distinct from` never matched. The index
 *    is therefore built over every locale in `INDEX_LOCALES`, not over English alone.
 *
 * Everything here is a pure function over its input plus ICU data, so this belongs in `domain/`.
 */

import { normalise } from './normalise';

/**
 * Names ICU either resolves to the wrong code or does not resolve at all, plus the informal names
 * real captions actually use. Keys are `normalise()`d. Deliberately short: this is the list of
 * *known* ICU gaps, not a second country table — anything ICU already gets right must not appear
 * here, or the two sources of truth start drifting.
 *
 * England/Scotland/Wales/Northern Ireland are not ISO-3166-1 countries at all, but a caption that
 * says "England" means GB, and returning `null` there would cost the dedup guard the same way an
 * unmapped name does.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  // ICU resolves these to a deprecated or exceptionally-reserved code.
  ['vietnam', 'VN'],
  ['viet nam', 'VN'],
  // ICU uses the current official name only.
  ['turkey', 'TR'],
  ['czech republic', 'CZ'],
  ['swaziland', 'SZ'],
  ['macedonia', 'MK'],
  ['burma', 'MM'],
  ['cape verde', 'CV'],
  ['ivory coast', 'CI'],
  // Informal and abbreviated forms.
  ['usa', 'US'],
  ['u s a', 'US'],
  ['united states of america', 'US'],
  ['america', 'US'],
  ['uk', 'GB'],
  ['great britain', 'GB'],
  ['britain', 'GB'],
  ['england', 'GB'],
  ['scotland', 'GB'],
  ['wales', 'GB'],
  ['northern ireland', 'GB'],
  ['holland', 'NL'],
  ['korea', 'KR'],
  ['south korea', 'KR'],
  ['north korea', 'KP'],
  ['uae', 'AE'],
  ['russia', 'RU'],
  ['emirates', 'AE'],
  // The same informal names in Hebrew. ICU's `he` data covers the official ones (ישראל, יפן,
  // בריטניה, ארצות הברית all resolve); these are the four a caption is likelier to use than the
  // official form, plus both spellings of the abbreviation. `normalise()` keeps the gershayim
  // (U+05F4 is inside the Hebrew block it preserves) but drops an ASCII quote to a space, so the
  // two ways of typing "ארה״ב" normalise differently and both have to be listed.
  ['אנגליה', 'GB'],
  ['סקוטלנד', 'GB'],
  ['ויילס', 'GB'],
  ['אמריקה', 'US'],
  ['ארה״ב', 'US'],
  ['ארה ב', 'US'],
]);

/**
 * ICU's region list is wider than ISO-3166-1's country list: it also carries supranational
 * entities, a placeholder, and CLDR's own test pseudo-regions, all of which have display names and
 * would otherwise be accepted as countries. `'ZZ'` is the dangerous one — it is literally
 * "Unknown Region", so accepting it would write a code that asserts a place's country is unknown
 * while looking exactly like a real answer to `resolve_place`'s dedup guard.
 *
 * The genuinely-reserved-but-real territories ICU also knows (`AC`, `IC`, `XK`, …) are left in:
 * they are places a caption can plausibly name, and none of them collide with a country.
 */
const NOT_A_COUNTRY: ReadonlySet<string> = new Set(['ZZ', 'QO', 'EU', 'EZ', 'UN', 'XA', 'XB']);

/**
 * `normalise(displayName) → alpha-2`, built once from ICU. Alphabetically-first wins so that the
 * canonical code beats a later alias sharing its display name (`FR` before `FX`, `GB` before
 * `UK`); `ALIASES` is consulted first and overrides this map wherever the two disagree.
 */
function buildIcuIndex(): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const locale of INDEX_LOCALES) {
    let display: Intl.DisplayNames;
    try {
      display = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      continue; // A runtime built without this locale's data. English is always present.
    }
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first) + String.fromCharCode(second);
        if (NOT_A_COUNTRY.has(code)) continue;
        let name: string | undefined;
        try {
          name = display.of(code);
        } catch {
          continue; // Not a region ICU knows about.
        }
        // ICU echoes the input back for an unknown code; that is not a name.
        if (name === undefined || name === code) continue;
        const key = normalise(name);
        // First writer wins, and English is first, so an English name can never be displaced by a
        // collision with some other language's word for a different country.
        if (key !== '' && !index.has(key)) index.set(key, code);
      }
    }
  }
  return index;
}

/**
 * The languages a `countryHint` can arrive in.
 *
 * English first, always: it is the language of every fallback in this file and the one locale
 * every runtime ships data for, and building it first means an English name wins any collision.
 * Hebrew because it is the product's second language (`docs/brand-and-product-foundation.md`) and
 * the one that produced the measured NULL. This is a short list on purpose — every locale added
 * is 676 more ICU lookups at first use and one more chance that some language's word for one
 * country is another language's word for a different one.
 */
const INDEX_LOCALES = ['en', 'he'] as const;

/** Built lazily and once — 676 `Intl` lookups per locale is not work to repeat per candidate. */
let icuIndex: ReadonlyMap<string, string> | null = null;

/**
 * Returns the ISO-3166-1 alpha-2 code for `input`, or `null` when it cannot be resolved.
 *
 * Accepts an already-valid alpha-2 code (`'IL'`, `'il'`) and passes it through uppercased, so the
 * function is idempotent and safe to apply to a value that may already have been normalised.
 * Returns `null` — never a guess — for anything else: a wrong country code is worse than a missing
 * one, because the dedup guard treats it as a positive statement about the place.
 */
export function toCountryCode(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;

  const trimmed = input.trim();
  if (trimmed === '') return null;

  // `ALIASES` is consulted first, before the alpha-2 shortcut, because two of its keys are
  // themselves two letters: `'UK'` must become `'GB'` and not be mistaken for a code ICU can
  // confirm (it cannot — ICU's display name for the `UK` alias is claimed by `GB`), and `'US'`
  // must resolve whichever branch sees it first.
  const key = normalise(trimmed);
  const alias = ALIASES.get(key);
  if (alias !== undefined) return alias;

  icuIndex ??= buildIcuIndex();

  // Already an alpha-2 code — accepted only when ICU recognises it as a region, so an arbitrary
  // two-letter string cannot become a country. A real code that happens to read as an English
  // word (`'AT'`, `'IN'`, `'IT'`) is still a country: the model is asked for a country here, and
  // rejecting valid codes to guard against a hypothetical stray word would lose more than it saves.
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    for (const code of icuIndex.values()) if (code === upper) return upper;
    for (const code of ALIASES.values()) if (code === upper) return upper;
    return null;
  }

  return icuIndex.get(key) ?? null;
}
