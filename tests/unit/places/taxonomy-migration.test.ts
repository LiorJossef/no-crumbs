/**
 * The anti-drift guard between `domain/places/taxonomy.ts` and the one-off data alignment in
 * `supabase/migrations/0028_align_tags_to_taxonomy.sql`.
 *
 * SQL cannot import TypeScript, so the migration restates the whitelist and the alias table. A
 * restated list is a copy, and a copy drifts **silently and in one direction**: the application
 * gains an alias, the migration does not, and nothing anywhere fails — the tags simply stop being
 * aligned and nobody finds out until a filter chip is empty. That is the same shape as the
 * `MEMBER_NAME_MAX_LENGTH` trapdoor found on 2026-08-29, where a test asserted on the domain
 * constant while the component rendered its own copy of the same number.
 *
 * This parses the migration rather than trusting a comment in it. The migration is a historical
 * artefact once applied, so if the vocabulary later grows this test is the thing that says out
 * loud: "the new entry needs its own migration, this one has already run."
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SUB_TAG_ALIAS_PAIRS, SUB_TAG_KEYS, isSubTag } from '@/domain/places/taxonomy';

const MIGRATION = readFileSync('supabase/migrations/0028_align_tags_to_taxonomy.sql', 'utf8');

/** Pulls one `name(...) as (values ('a'), ('b', 'c'), ...)` CTE out of the migration and returns
 *  its rows as string tuples. Deliberately narrow: it understands exactly the shape this migration
 *  is written in, and throws rather than guessing if that shape changes. */
function cteRows(name: string): readonly (readonly string[])[] {
  const start = MIGRATION.indexOf(`${name}(`);
  if (start === -1) throw new Error(`no CTE named "${name}" in the migration`);
  const valuesAt = MIGRATION.indexOf('values', start);
  const end = MIGRATION.indexOf('\n)', valuesAt);
  if (valuesAt === -1 || end === -1) throw new Error(`CTE "${name}" is not the expected shape`);
  const body = MIGRATION.slice(valuesAt + 'values'.length, end);
  return [...body.matchAll(/\(([^()]*)\)/g)].map((row) =>
    (row[1] ?? '')
      .split(',')
      .map((cell) => cell.trim().replace(/^'(.*)'$/s, '$1'))
      .filter((cell) => cell.length > 0)
  );
}

describe('0028_align_tags_to_taxonomy.sql', () => {
  it('restates exactly the whitelist the taxonomy defines', () => {
    const inSql = cteRows('whitelist').map(([key]) => key);
    expect([...inSql].sort()).toEqual([...SUB_TAG_KEYS].sort());
  });

  it('restates exactly the alias table the taxonomy defines', () => {
    const inSql = cteRows('alias').map(([src, dst]) => `${src} -> ${dst}`);
    const inCode = SUB_TAG_ALIAS_PAIRS.map(([src, dst]) => `${src} -> ${dst}`);
    // Both directions, deliberately. A missing entry leaves a tag unaligned in the library; an
    // extra one is a rule the application does not have and cannot explain.
    expect([...inSql].sort()).toEqual([...inCode].sort());
  });

  it('maps every legacy phrase onto a real whitelist entry', () => {
    // These two are the migration's own, and correctly not in the alias table — the closed
    // vocabulary cannot produce them again. What still has to hold is that they land somewhere
    // real, or the alignment would write a tag the whitelist does not contain.
    const phrases = cteRows('legacy_phrase');
    expect(phrases.length).toBeGreaterThan(0);
    for (const [, dst] of phrases) expect(isSubTag(dst)).toBe(true);
  });

  it('has no mapping target outside the whitelist', () => {
    for (const [, dst] of [...cteRows('alias'), ...cteRows('legacy_phrase')]) {
      expect(isSubTag(dst)).toBe(true);
    }
  });

  it('never maps a whitelisted tag onto a different one', () => {
    // An alias whose *source* is itself a listed tag would silently rewrite good data: a place
    // tagged `Bakery` becoming `Desserts` because someone added a plausible-looking row.
    for (const [src] of [...cteRows('alias'), ...cteRows('legacy_phrase')]) {
      expect(isSubTag(src)).toBe(false);
    }
  });
});
