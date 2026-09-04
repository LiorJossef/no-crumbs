/**
 * **An error code with no producer is a capability claim the product cannot honour.**
 *
 * A closed union whose members the product claims to handle must have, for every member, at least
 * one producer **in shipped code**. `import-error-copy.ts` writes a screen for each of them,
 * `error-reporting.ts` gives each of them an HTTP status, and both of those are promises: if
 * nothing under `src/` ever constructs the value, the screen and the status describe a state the
 * product cannot reach, and anyone reading the taxonomy — or a green test suite — reads a shipped
 * capability that is not there.
 *
 * ## Why the rest of the suite cannot see this
 *
 * `tests/unit/errors.test.ts` and `tests/unit/import/pipeline.test.ts` both exercise codes by
 * **throwing them themselves**, through a fake port. That is the correct way to test a *handler*,
 * and it says nothing whatsoever about the *producer* — *a probe that cannot fire looks exactly
 * like a probe that found nothing.* Where a suite must construct a value to exercise a handler, a
 * separate guard has to assert that shipped code constructs it too. This is that guard
 * (`product-ruling-quota-copy-2026-08-31.md` §6).
 *
 * ## Five details, each of which is the difference between a guard and a decoration
 *
 * 1. **The scan is `src/`, not the repo.** Scanning `tests/` too would make every code pass on the
 *    strength of the tests that construct it, which is the exact blindness above.
 * 2. **`src/domain/errors.ts` is excluded.** It holds the definitions and the
 *    `DOMAIN_ERROR_CONSTRUCTORS` map, so including it makes every code pass trivially.
 * 3. **Match `name(`, not `name`.** A re-export, a type position, an import specifier or a mention
 *    in the constructors map is not a producer. The lookbehind additionally rejects `x.internal(`
 *    and `markInternal(` — a method call on something else is not our constructor.
 * 4. **Comments are stripped per file, before matching.** This codebase documents its decisions in
 *    prose and routinely names a constructor it deliberately does *not* call. A guard that fires
 *    on its own explanation is worse than none — and this is not hypothetical here: see the
 *    positive control below.
 * 5. **One dated exception, pinned to a count.** `product-ruling-quota-copy-2026-08-31.md` §6
 *    asked for no allow-list at all, on the premise that after its change every code would have a
 *    producer. That premise was wrong — this guard found a second producerless code on its first
 *    run — so the mechanism is the narrowest thing that keeps the guard honest instead of green:
 *    a single named entry, with its date and its reason, **and a test that the list has exactly
 *    one member**. A list that cannot grow without a test failing is not the allow-list §6
 *    forbade: the next person who wants an exemption has to change a number and explain
 *    themselves in a diff, which is exactly the cost §6 wanted an exemption to carry.
 *
 * One union, one guard. `ProviderFailureReason`, the resolution failure reasons and `ImportOutcome`
 * have the same exposure and are named as the obvious next candidates — deliberately not
 * generalised here, because a guard written for four unions at once is a guard nobody reads the
 * failure of.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@/domain/errors';

/** The shipped tree. Not `.`, and not `tests/` — see detail 1. */
const SRC_DIR = 'src';

/** The definition site, excluded — see detail 2. */
const TAXONOMY_FILE = 'src/domain/errors.ts';

function sourceFiles(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Per file, before any matching — detail 4. Joining first would let one unterminated block
 *  comment swallow the top of the next file. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const SHIPPED: readonly (readonly [string, string])[] = sourceFiles(SRC_DIR)
  .filter((file) => file !== TAXONOMY_FILE)
  .map((file) => [file, stripComments(readFileSync(file, 'utf8'))] as const);

/**
 * The one code exempted from the rule below, and it is a **finding, not a dispensation**.
 *
 * `RATE_LIMITED_UPSTREAM` (added 2026-08-31) has no producer and never has: `git log -S` for
 * `rateLimitedUpstream(` over `integrations/tiktok/oembed-source-adapter.ts` returns nothing, and
 * the line long cited as its call site is a *comment* saying, in as many words, that the code
 * *"stays reserved for the day TikTok's behaviour actually changes"*.
 *
 * It is exempted rather than fixed because retiring it or building its producer both reach into
 * the TikTok adapter and need their own thinking, not this lane's. It is **not** merely a reserved
 * log constant, which is why it is recorded here rather than waved through: it has a written
 * failure screen (`import-error-copy.ts`) and an HTTP status (`error-reporting.ts`), so it is the
 * same capability claim this guard exists to catch — pre-existing, and now visible instead of
 * silent.
 *
 * **Open finding.** Resolve it by giving the code a producer or by retiring the code with its
 * screen and its status in one commit — and then delete the entry, which the count below forces.
 */
const EXEMPT: readonly DomainErrorCode[] = ['RATE_LIMITED_UPSTREAM'];

/** Every shipped file that **calls** `identifier`. Detail 3. */
function filesCalling(identifier: string): readonly string[] {
  const call = new RegExp(`(?<![\\w$.])${identifier}\\s*\\(`);
  return SHIPPED.filter(([, source]) => call.test(source)).map(([file]) => file);
}

/**
 * The constructor's identifier for a code — `EXTRACTOR_QUOTA_EXHAUSTED` → `extractorQuotaExhausted`.
 *
 * Derived rather than read off the function, because `makeConstructor` returns an arrow expression
 * and `Function.prototype.name` is therefore `''` for all thirteen: there is no runtime handle on
 * the identifier at all. A derivation could silently be wrong for a code whose export was named by
 * hand, so `pins every derived identifier to a real export` below asserts each derived name against
 * the definition site's own source. Both halves are needed: the derivation makes the guard total,
 * the pin makes the derivation honest.
 */
function constructorIdentifier(code: DomainErrorCode): string {
  return code.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase());
}

describe('the producer guard itself', () => {
  it('resolved the glob to real files', () => {
    expect(SHIPPED.length).toBeGreaterThan(50);
    expect(SHIPPED.map(([file]) => file)).not.toContain(TAXONOMY_FILE);
  });

  /**
   * **Positive control.** Proves the matcher fires on a real call site.
   *
   * `product-ruling-quota-copy-2026-08-31.md` §6 specified `rateLimitedUpstream(` in
   * `oembed-source-adapter.ts` for this. That control is wrong and had to be replaced: that
   * identifier has **never** been called anywhere in `src/` (`git log -S"rateLimitedUpstream("`
   * over that file returns nothing), and the line the ruling cites is a *comment* which says, in
   * as many words, *"a non-2xx here is POST_UNAVAILABLE, never RATE_LIMITED_UPSTREAM — that code
   * stays reserved"*. A control that matches an explanation of why the call is absent is the exact
   * defect detail 4 exists to prevent, in the one place it would have been invisible.
   *
   * `postUnavailable(` is a genuine call in the same file, three times over, so it proves the same
   * two things the ruling wanted proven: the glob resolved, and the match works.
   */
  it('finds a producer that is really there (positive control)', () => {
    expect(filesCalling('postUnavailable')).toContain('src/integrations/tiktok/oembed-source-adapter.ts');
  });

  /** **Negative control.** Proves the matcher can return false — without it, a guard that has
   *  quietly stopped matching anything passes forever. */
  it('does not find a producer that does not exist (negative control)', () => {
    expect(filesCalling('__notAProducer')).toEqual([]);
  });

  /** Detail 4, asserted rather than assumed: a call written only inside a comment is not a
   *  producer. */
  it('ignores a call that appears only in a comment', () => {
    expect(stripComments('// throw internal();\n/* internal(); */\nconst x = 1;')).not.toMatch(
      /(?<![\w$.])internal\s*\(/,
    );
  });

  /** Detail 3, asserted: a method call on something else, and a longer identifier ending in the
   *  same word, are both rejected. */
  it('does not mistake a method call or a longer name for the constructor', () => {
    const call = /(?<![\w$.])internal\s*\(/;
    expect(call.test('reporter.internal()')).toBe(false);
    expect(call.test('markInternal()')).toBe(false);
    expect(call.test('throw internal();')).toBe(true);
  });

  it('pins every derived identifier to a real export in the taxonomy', () => {
    const taxonomy = readFileSync(TAXONOMY_FILE, 'utf8');
    for (const code of DOMAIN_ERROR_CODES) {
      const identifier = constructorIdentifier(code);
      expect(
        taxonomy.includes(`export const ${identifier} = makeConstructor(`),
        `${code} derives to \`${identifier}\`, which ${TAXONOMY_FILE} does not export`,
      ).toBe(true);
    }
  });
});

describe('every DomainErrorCode has a producer in shipped code', () => {
  /**
   * The pin that makes the exception above an exception rather than a mechanism. Without it the
   * list quietly absorbs the next producerless code and the guard reports a clean run about a
   * union it has stopped checking — the going-quiet failure this whole file is against.
   */
  it('carries exactly one exception, and it is the one that was argued for', () => {
    expect(EXEMPT).toEqual(['RATE_LIMITED_UPSTREAM']);
    expect(EXEMPT).toHaveLength(1);
  });

  it('exempts nothing that actually has a producer — the exception expires on its own', () => {
    // If someone builds the producer, the entry stops being true and this says so, rather than
    // leaving a permanent hole where a temporary one was argued for.
    for (const code of EXEMPT) {
      expect(
        filesCalling(constructorIdentifier(code)),
        `${code} now has a producer — delete it from EXEMPT`,
      ).toEqual([]);
    }
  });

  it('constructs every code somewhere under src/, outside the taxonomy file', () => {
    const producerless = DOMAIN_ERROR_CODES.filter(
      (code) => !EXEMPT.includes(code) && filesCalling(constructorIdentifier(code)).length === 0,
    );
    expect(
      producerless,
      producerless.length === 0
        ? ''
        : `no shipped code under ${SRC_DIR}/ ever constructs: ${producerless.join(', ')}. ` +
          `Each of these has a written failure screen and an HTTP status — a capability claim the ` +
          `product cannot honour. Build the producer, or retire the code with its screen and its ` +
          `status in the same commit.`,
    ).toEqual([]);
  });
});
