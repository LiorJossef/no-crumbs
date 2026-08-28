import { describe, expect, it } from 'vitest';

import { toCountryCode } from '@/domain/places/country-code';

describe('toCountryCode', () => {
  it('resolves the country names real captions actually use', () => {
    // Every one of these is a country an imported TikTok has named or plausibly will; before this
    // function existed each of them became `null` and cost the dedup guard its country term.
    expect(toCountryCode('Israel')).toBe('IL');
    expect(toCountryCode('Japan')).toBe('JP');
    expect(toCountryCode('France')).toBe('FR');
    expect(toCountryCode('Italy')).toBe('IT');
    expect(toCountryCode('Spain')).toBe('ES');
    expect(toCountryCode('Thailand')).toBe('TH');
    expect(toCountryCode('Mexico')).toBe('MX');
    expect(toCountryCode('Portugal')).toBe('PT');
  });

  it('prefers the canonical code over a deprecated or reserved one sharing its display name', () => {
    // ICU knows `FX` (Metropolitan France) and `UK` (an alias) as well as `FR`/`GB`, and `VD`
    // (North Vietnam) as well as `VN`. Getting these wrong writes a real but wrong country code.
    expect(toCountryCode('France')).toBe('FR');
    expect(toCountryCode('United Kingdom')).toBe('GB');
    expect(toCountryCode('Vietnam')).toBe('VN');
  });

  it('does not answer a live country with the code of a state that no longer exists', () => {
    // Found 2026-08-29 by the round-trip test below, in English, on the commonest of them:
    // `'Germany'` returned `'DD'` — the German Democratic Republic — because `DD` sorts before
    // `DE` and ICU gives it the same display name. Six more behaved the same way. A wrong code is
    // the failure mode this whole module exists to avoid, so each one is pinned by name.
    expect(toCountryCode('Germany')).toBe('DE');
    expect(toCountryCode('גרמניה')).toBe('DE');
    expect(toCountryCode('Serbia')).toBe('RS');
    expect(toCountryCode('Yemen')).toBe('YE');
    expect(toCountryCode('Zimbabwe')).toBe('ZW');
    expect(toCountryCode('Vanuatu')).toBe('VU');
    expect(toCountryCode('Curaçao')).toBe('CW');
    expect(toCountryCode('Myanmar')).toBe('MM');
    // Hebrew was unprotected where English had an alias entry: `וייטנאם` returned `VD`.
    expect(toCountryCode('וייטנאם')).toBe('VN');
  });

  it('canonicalises a deprecated alpha-2 code rather than passing it through', () => {
    // A stored `'DD'` from before the fix, or a model that emits an alias directly. Returning the
    // alias unchanged would keep the wrong code alive on every later pass.
    expect(toCountryCode('DD')).toBe('DE');
    expect(toCountryCode('UK')).toBe('GB');
    expect(toCountryCode('VD')).toBe('VN');
    expect(toCountryCode('FX')).toBe('FR');
  });

  it('round-trips every ICU region display name back to that region, in both indexed locales', () => {
    // The measurement that found the seven above, kept as a permanent guard. Every canonical
    // region ICU knows, in `en` and `he`: its own display name must resolve to its own code.
    // Aliases are excluded because their names belong to the region they alias, which is the
    // whole point; `NOT_A_COUNTRY` codes are excluded because they are deliberately unresolvable.
    const notACountry = new Set(['ZZ', 'QO', 'EU', 'EZ', 'UN', 'XA', 'XB']);
    const wrong: Record<string, string | null> = {};
    for (const locale of ['en', 'he']) {
      const display = new Intl.DisplayNames([locale], { type: 'region' });
      for (let first = 65; first <= 90; first += 1) {
        for (let second = 65; second <= 90; second += 1) {
          const code = String.fromCharCode(first) + String.fromCharCode(second);
          if (notACountry.has(code)) continue;
          if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
          let name: string | undefined;
          try {
            name = display.of(code);
          } catch {
            continue;
          }
          if (name === undefined || name === code) continue;
          const got = toCountryCode(name);
          if (got !== code) wrong[`${locale}:${code}:${name}`] = got;
        }
      }
    }
    expect(wrong).toEqual({});
  });

  it('accepts the official rename and the name captions still use', () => {
    expect(toCountryCode('Türkiye')).toBe('TR');
    expect(toCountryCode('Turkiye')).toBe('TR');
    expect(toCountryCode('Turkey')).toBe('TR');
    expect(toCountryCode('Czechia')).toBe('CZ');
    expect(toCountryCode('Czech Republic')).toBe('CZ');
  });

  it('accepts informal and abbreviated forms', () => {
    expect(toCountryCode('USA')).toBe('US');
    expect(toCountryCode('United States')).toBe('US');
    expect(toCountryCode('UK')).toBe('GB');
    expect(toCountryCode('England')).toBe('GB');
    expect(toCountryCode('Holland')).toBe('NL');
    expect(toCountryCode('South Korea')).toBe('KR');
    expect(toCountryCode('UAE')).toBe('AE');
  });

  it('is case- and accent-insensitive, and tolerates surrounding whitespace', () => {
    expect(toCountryCode('  israel  ')).toBe('IL');
    expect(toCountryCode('ISRAEL')).toBe('IL');
    expect(toCountryCode('cote d’ivoire')).toBe('CI');
  });

  it('treats a real alpha-2 code that reads as an English word as the country', () => {
    // `AT`/`IN`/`IT` are Austria, India and Italy. The field is documented as a country, so a
    // valid code wins over the word reading; rejecting them to guard against a hypothetical stray
    // word would lose real country codes.
    expect(toCountryCode('AT')).toBe('AT');
    expect(toCountryCode('IN')).toBe('IN');
    expect(toCountryCode('IT')).toBe('IT');
  });

  it('passes an already-valid alpha-2 code straight through, uppercased', () => {
    // Idempotence matters: the confirm seam may apply this to a value another layer already
    // normalised, and a second pass must not turn `'IL'` into `null`.
    expect(toCountryCode('IL')).toBe('IL');
    expect(toCountryCode('il')).toBe('IL');
    expect(toCountryCode('GB')).toBe('GB');
    expect(toCountryCode(toCountryCode('Israel'))).toBe('IL');
  });

  it('returns null rather than guessing', () => {
    // A wrong country code is worse than a missing one: `resolve_place`'s near-duplicate guard
    // reads it as a positive statement about the place.
    expect(toCountryCode(null)).toBeNull();
    expect(toCountryCode(undefined)).toBeNull();
    expect(toCountryCode('')).toBeNull();
    expect(toCountryCode('   ')).toBeNull();
    expect(toCountryCode('Atlantis')).toBeNull();
    expect(toCountryCode('Tel Aviv')).toBeNull();
    // A two-letter string ICU does not know as a region must not become a country.
    expect(toCountryCode('Xq')).toBeNull();
    expect(toCountryCode('Zz')).toBeNull();
  });
});

describe('a hint in the caption\'s own language', () => {
  // The prompt asks the model to copy location words as the caption writes them, so a Hebrew
  // caption produces a Hebrew `countryHint`. Measured on this database before the index covered
  // `he`: `countryHint: "ישראל"` stored `country_code` NULL, which is the exact input that turns
  // `resolve_place`'s dedup guard off and lets one venue become three rows.
  it('resolves the official Hebrew name of a country', () => {
    expect(toCountryCode('ישראל')).toBe('IL');
    expect(toCountryCode('יפן')).toBe('JP');
    expect(toCountryCode('בריטניה')).toBe('GB');
    expect(toCountryCode('ארצות הברית')).toBe('US');
    expect(toCountryCode('איטליה')).toBe('IT');
  });

  it('resolves the informal Hebrew names a caption is likelier to use', () => {
    expect(toCountryCode('אנגליה')).toBe('GB');
    expect(toCountryCode('סקוטלנד')).toBe('GB');
    expect(toCountryCode('אמריקה')).toBe('US');
  });

  it('takes either way of typing the abbreviation', () => {
    // U+05F4 survives `normalise()`; an ASCII quote does not. Two spellings, one country.
    expect(toCountryCode('ארה״ב')).toBe('US');
    expect(toCountryCode('ארה"ב')).toBe('US');
  });

  it('resolves the Hebrew spellings ICU does not carry', () => {
    // Measured returning `null` on 2026-08-29. `צ׳כיה` (Hebrew geresh) is ICU's own spelling and
    // already worked; an ASCII apostrophe normalises to a space, and the mark is often dropped.
    expect(toCountryCode('צ׳כיה')).toBe('CZ');
    expect(toCountryCode("צ'כיה")).toBe('CZ');
    expect(toCountryCode('צכיה')).toBe('CZ');
    expect(toCountryCode('שוויץ')).toBe('CH');
    expect(toCountryCode('דרום קוריאה')).toBe('KR');
    expect(toCountryCode('הממלכה המאוחדת')).toBe('GB');
  });

  it('still refuses a Hebrew city, which is not a country', () => {
    expect(toCountryCode('תל אביב')).toBeNull();
    expect(toCountryCode('פלורנטין')).toBeNull();
  });

  it('does not let a second language displace an English name', () => {
    expect(toCountryCode('Israel')).toBe('IL');
    expect(toCountryCode('Turkey')).toBe('TR');
    expect(toCountryCode('England')).toBe('GB');
  });
});
