/**
 * The sign-up form's name rule (`r2-names-ui`).
 *
 * `0035_names_at_sign_up.sql` makes both name columns nullable **permanently** and says so in R2:
 * a `not null` there fires inside the `auth.users` INSERT and turns a missing metadata key into a
 * failed account creation. So the database refuses nothing, and required-ness lives entirely in
 * `signUpNames`. These assertions are the whole of that enforcement — there is no second line of
 * defence behind them, which is the reason to pin them rather than trust the form.
 *
 * The second half of the file is about `options.data` reaching GoTrue at all. That argument is
 * pinned by reading the source, not by mocking `supabase.auth.signUp`: the failure mode this
 * product actually had for its entire life was **an argument that was never passed**, and a mock
 * of a call that is not made asserts nothing. See the `describe` below for what it does instead.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NAME_MAX_LENGTH, signUpNames } from '@/app/sign-in/name-fields';

describe('signUpNames — the first name is required and the form is what refuses', () => {
  it('accepts a first name on its own', () => {
    expect(signUpNames({ firstName: 'Maya', lastName: '' })).toEqual({
      ok: true,
      data: { first_name: 'Maya' },
    });
  });

  it('refuses an empty first name with copy that states what is missing', () => {
    expect(signUpNames({ firstName: '', lastName: 'Levi' })).toEqual({
      ok: false,
      message: 'Enter your first name.',
    });
  });

  it('refuses a first name that is only whitespace', () => {
    // `required` on the input does not catch this, and the form is `noValidate` in any case.
    expect(signUpNames({ firstName: '   ', lastName: '' }).ok).toBe(false);
  });

  it('does not refuse an empty last name — it is optional and the form says so', () => {
    // `0035`'s own column comment: `last_name` is "stored, and read by nothing today". Requiring a
    // field with no consumer is friction with no return, and it is wrong for anyone with one name.
    expect(signUpNames({ firstName: 'Maya', lastName: '' }).ok).toBe(true);
  });

  it('omits `last_name` rather than sending an empty one', () => {
    // Equivalent to the trigger, which `nullif(btrim(…), '')`s both — but an absent key says "not
    // given" where an empty string says "given, and empty", and only one of those is true.
    const result = signUpNames({ firstName: 'Maya', lastName: '   ' });
    expect(result.ok && Object.hasOwn(result.data, 'last_name')).toBe(false);
  });

  it('carries both names when both were given', () => {
    expect(signUpNames({ firstName: 'Maya', lastName: 'Levi' })).toEqual({
      ok: true,
      data: { first_name: 'Maya', last_name: 'Levi' },
    });
  });
});

describe('signUpNames — normalisation, against the constraints the database will apply', () => {
  it('trims the ends, as `normalise_profile_names` does on write', () => {
    expect(signUpNames({ firstName: '  Maya  ', lastName: '  Levi ' })).toEqual({
      ok: true,
      data: { first_name: 'Maya', last_name: 'Levi' },
    });
  });

  it('collapses inner whitespace, which the database does not', () => {
    // `updateDisplayName` (`actions/collections.ts`) already does this to the peer-visible label;
    // the private name gets the same treatment so `Maya  Levi` is one name rather than two.
    expect(signUpNames({ firstName: 'Maya', lastName: 'van   der  Berg' })).toEqual({
      ok: true,
      data: { first_name: 'Maya', last_name: 'van der Berg' },
    });
  });

  it('clamps to the length `profile_names_first_name_check` allows', () => {
    // 80, which is `profiles_display_name_check`'s bound (`0002:9`). Over it, the CHECK raises
    // 23514 from inside the `auth.users` trigger — an unexplained failed sign-up.
    const long = 'a'.repeat(NAME_MAX_LENGTH + 40);
    const result = signUpNames({ firstName: long, lastName: long });
    expect(result.ok && result.data.first_name).toHaveLength(NAME_MAX_LENGTH);
    expect(result.ok && result.data.last_name).toHaveLength(NAME_MAX_LENGTH);
  });

  it('keeps a non-Latin name intact', () => {
    // The local database's own display name is `מאיה`. Nothing here may normalise it away.
    expect(signUpNames({ firstName: 'מאיה', lastName: 'לוי' })).toEqual({
      ok: true,
      data: { first_name: 'מאיה', last_name: 'לוי' },
    });
  });
});

/**
 * **The plumbing assertion, and why it reads the file.**
 *
 * `handle_new_user()` can only see `auth.users.raw_user_meta_data`, and the only thing that writes
 * that column is `options.data` on `signUp`. Until 2026-09-01 the call passed `emailRedirectTo`
 * alone, so the column was `{}` on every account this product ever created and the entire trigger
 * was inert — correctly and silently. That is a bug of **omission**: nothing threw, nothing logged,
 * and no unit test could have failed, because the code under test was the code that was not there.
 *
 * A mock of `supabase.auth.signUp` would not have caught it either — it would have recorded that a
 * call happened with whatever arguments were passed, which is the thing in question. So this reads
 * the source. It is a blunt instrument and it is aimed at exactly one regression: somebody
 * simplifying the options object back to what it was.
 */
describe('sign-in-client passes the names to signUp', () => {
  const source = readFileSync(
    new URL('../../../src/app/sign-in/sign-in-client.tsx', import.meta.url),
    'utf8',
  );
  // Comments stripped, because that file explains all of this at length and an assertion aimed at
  // the code must not be satisfiable — or broken — by the prose around it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('sends the validated names on the signUp options, not `emailRedirectTo` alone', () => {
    expect(code).toMatch(/signUp\(\{[\s\S]*?emailRedirectTo:/);
    expect(code).toMatch(/signUp\(\{[\s\S]*?data:\s*names\.data/);
  });

  it('does not send a display_name — that column is the peer-visible label', () => {
    // `0035` deliberately adds no new route into `profiles.display_name`, and `handle_new_user`
    // still reads it from the metadata. Sending one here would put a name given for personalisation
    // in front of collection peers who were never shown it.
    expect(code).not.toMatch(/display_name/);
  });

  it('validates before it calls, so a missing name costs no round trip', () => {
    expect(code.indexOf('signUpNames({')).toBeLessThan(code.indexOf('supabase.auth.signUp'));
  });
});
