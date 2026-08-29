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

/**
 * Every migration that carries a piece of the alias table. Listed rather than globbed, so adding
 * one is a deliberate edit here: an alignment migration nobody registered is exactly the drift this
 * file exists to catch.
 */
const ALIGNMENT_MIGRATIONS = [
  'supabase/migrations/0028_align_tags_to_taxonomy.sql',
  'supabase/migrations/0029_breakfast_is_brunch.sql',
] as const;

const SOURCES = new Map(
  ALIGNMENT_MIGRATIONS.map((path) => [path, readFileSync(path, 'utf8')] as const)
);

const MIGRATION = SOURCES.get(ALIGNMENT_MIGRATIONS[0]) ?? '';

/** Pulls one `name(...) as (values ('a'), ('b', 'c'), ...)` CTE out of a migration and returns its
 *  rows as string tuples. Deliberately narrow: it understands exactly the shape these migrations
 *  are written in, and throws rather than guessing if that shape changes. */
function cteRowsIn(sql: string, name: string): readonly (readonly string[])[] {
  const start = sql.indexOf(`${name}(`);
  if (start === -1) return [];
  // Balance from the `(` that opens the CTE body, rather than looking for a `\n)`. The two
  // migrations format their CTEs differently — one across many lines, one on a single line — and a
  // parser that keyed on the layout read the whole rest of the file as `values` and "found" 36
  // aliases, five of them fragments of the surrounding SQL.
  const open = sql.indexOf('(', sql.indexOf(' as ', start));
  if (open === -1) throw new Error(`CTE "${name}" is not the expected shape`);
  let depth = 0;
  let close = -1;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`CTE "${name}" is not closed`);
  const valuesAt = sql.indexOf('values', open);
  if (valuesAt === -1 || valuesAt > close) throw new Error(`CTE "${name}" has no VALUES`);
  const body = sql.slice(valuesAt + 'values'.length, close);
  return [...body.matchAll(/\(([^()]*)\)/g)].map((row) =>
    (row[1] ?? '')
      .split(',')
      .map((cell) => cell.trim().replace(/^'(.*)'$/s, '$1'))
      .filter((cell) => cell.length > 0)
  );
}

/** The same CTE, out of the first migration — the one that carries the whole whitelist. */
function cteRows(name: string): readonly (readonly string[])[] {
  const rows = cteRowsIn(MIGRATION, name);
  if (rows.length === 0) throw new Error(`no CTE named "${name}" in the migration`);
  return rows;
}

/** Every alias pair applied by any alignment migration, which is what has to equal the code. */
function allAppliedAliases(): readonly string[] {
  return [...SOURCES.values()].flatMap((sql) =>
    cteRowsIn(sql, 'alias').map(([src, dst]) => `${src} -> ${dst}`)
  );
}

describe('the tag alignment migrations', () => {
  it('restates exactly the whitelist the taxonomy defines', () => {
    const inSql = cteRows('whitelist').map(([key]) => key);
    expect([...inSql].sort()).toEqual([...SUB_TAG_KEYS].sort());
  });

  it('applies exactly the alias table the taxonomy defines, across every alignment migration', () => {
    const inSql = allAppliedAliases();
    const inCode = SUB_TAG_ALIAS_PAIRS.map(([src, dst]) => `${src} -> ${dst}`);
    // Both directions, deliberately. A missing entry leaves a tag unaligned in the library — the
    // code would map it on the next import while the rows already saved kept the old spelling; an
    // extra one is a rule the application does not have and cannot explain.
    //
    // The union, not one file: an applied migration is history and must not be edited, so a new
    // alias arrives as a *new* migration and this is what says so out loud.
    expect([...inSql].sort()).toEqual([...inCode].sort());
    expect(new Set(inSql).size).toBe(inSql.length); // no alias applied twice
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
