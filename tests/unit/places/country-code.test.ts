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
