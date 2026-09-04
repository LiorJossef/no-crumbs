/**
 * One-shot repair for `public.places` rows whose `locality` / `country_code` are NULL although
 * Google had already told us both, in the same response we still hold cached.
 *
 * WHY. Before 2026-09-02 the Google adapter dropped address components it had in hand: `localityOf`
 * only read the `locality` component (Google returns none at all for Prague — it is `sublocality` +
 * `administrative_area_level_*`), and `candidate-place.ts` preferred the caption's country over
 * Google's. `7e27ad9` and `5053555` fixed the adapter; the rows written before them are still wrong.
 * The user-visible symptoms are "4 places in this area" for four Prague saves, and a countryless
 * city surfacing as its own top-level row in "Where you save".
 *
 * The repair needs no network, no geocoder, no quota and no migration: every affected row's raw
 * Google response is in `public.place_lookups`, matched by `places.source_dataset_id` against the
 * Google `id` inside `response->'rows'`. This script re-runs the CURRENT `localityOf` /
 * `countryCodeOf` over those cached components and fills in only the columns that are NULL.
 *
 * SAFETY RULES, all enforced below and again in the SQL:
 *   - dry run by default; nothing is written without `--apply`;
 *   - a column is only ever written when it is currently NULL (`... and locality is null` is in the
 *     UPDATE too, so a concurrent writer cannot be clobbered), so a second run is a no-op;
 *   - the row set is DERIVED (`source_dataset = 'google-places'` with a NULL in either column), not
 *     a hardcoded id list;
 *   - a row whose cached response is missing, or whose derived value is empty, or whose several
 *     cached copies disagree, is SKIPPED and reported — never guessed at, never written as NULL.
 *     That matters because production is a different population and its cache coverage is unknown.
 *
 * Run:
 *   node scripts/backfill-place-geography.mjs                  # dry run against the local database
 *   node scripts/backfill-place-geography.mjs --apply          # write
 *   DATABASE_URL=... node scripts/backfill-place-geography.mjs # any other database
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_URL;
const APPLY = process.argv.includes('--apply');

function die(message) {
  process.stderr.write(`FAIL ${message}\n`);
  process.exit(1);
}

/**
 * `localityOf` / `countryCodeOf` are imported from the adapter itself, never reimplemented: a
 * second copy of the fallback chain would drift from the one that writes new rows, and the drift
 * would be silent. The adapter is TypeScript behind `@/` aliases and `server-only`, so it is loaded
 * through jiti (already in node_modules) with those two resolved.
 */
async function loadDerivers() {
  const require = createRequire(path.join(ROOT, 'package.json'));
  let createJiti;
  try {
    ({ createJiti } = require('jiti'));
  } catch {
    die('cannot load `jiti` from node_modules — run `npm install` first');
  }
  const jiti = createJiti(path.join(ROOT, 'package.json'), {
    alias: {
      '@': path.join(ROOT, 'src'),
      'server-only': path.join(ROOT, 'node_modules/server-only/empty.js'),
    },
  });
  const mod = await jiti.import(path.join(ROOT, 'src/integrations/google/place-resolver.ts'));
  if (typeof mod.localityOf !== 'function' || typeof mod.countryCodeOf !== 'function') {
    die('place-resolver.ts no longer exports localityOf/countryCodeOf');
  }
  return mod;
}

function psql(sql) {
  try {
    return execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (error) {
    die(`psql failed: ${error.message}`);
  }
}

/**
 * The candidate set and its cached components in one query. `jsonb_agg(distinct ...)` collapses the
 * repeated cache entries for the same Google id (one venue can sit in several lookups) so that the
 * disagreement check below sees one entry per distinct component array, not one per lookup row.
 */
const SELECT_CANDIDATES = `
with candidates as (
  select p.id, p.name, p.locality, p.country_code, p.source_dataset_id
  from public.places p
  where p.source_dataset = 'google-places'
    and (p.locality is null or p.country_code is null)
),
cached as (
  select c.id, jsonb_agg(distinct r->'addressComponents') as component_sets
  from candidates c
  join public.place_lookups l on l.provider = 'google'
  join lateral jsonb_array_elements(l.response->'rows') r on r->>'id' = c.source_dataset_id
  where r ? 'addressComponents'
  group by c.id
)
select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)::text
from (
  select c.id, c.name, c.locality, c.country_code, c.source_dataset_id,
         coalesce(k.component_sets, '[]'::jsonb) as component_sets
  from candidates c left join cached k on k.id = c.id
) x`;

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function updateStatement(row, changes) {
  // Every assignment carries its own `is null` guard: the statement is idempotent on its own, and
  // it cannot overwrite a value another writer set between the SELECT and the UPDATE.
  const sets = changes.map(([column, value]) => `${column} = ${quote(value)}`);
  const guards = changes.map(([column]) => `${column} is null`);
  return `update public.places set ${sets.join(', ')} where id = ${quote(row.id)} and ${guards.join(' and ')};`;
}

async function main() {
  const { localityOf, countryCodeOf } = await loadDerivers();
  const rows = JSON.parse(psql(SELECT_CANDIDATES).trim() || '[]');

  const planned = [];
  const skipped = [];

  for (const row of rows) {
    const sets = row.component_sets ?? [];
    if (sets.length === 0) {
      skipped.push([row, 'no cached Google response holds this source_dataset_id']);
      continue;
    }

    const derived = sets.map((components) => ({
      locality: localityOf(components),
      countryCode: countryCodeOf(components),
    }));
    const disagrees = derived.some(
      (d) => d.locality !== derived[0].locality || d.countryCode !== derived[0].countryCode,
    );
    if (disagrees) {
      skipped.push([row, `${sets.length} cached responses derive different values`]);
      continue;
    }

    const changes = [];
    const misses = [];
    if (row.locality === null) {
      if (derived[0].locality === null) misses.push('locality');
      else changes.push(['locality', derived[0].locality]);
    }
    if (row.country_code === null) {
      if (derived[0].countryCode === null) misses.push('country_code');
      else changes.push(['country_code', derived[0].countryCode]);
    }

    if (changes.length === 0) {
      skipped.push([row, misses.length > 0
        ? `cached response yields no ${misses.join(' and ')}`
        : 'nothing is NULL any more']);
      continue;
    }
    planned.push({ row, changes, misses });
  }

  const header = APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)';
  process.stdout.write(`backfill-place-geography — ${header}\n`);
  process.stdout.write(`database: ${DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@')}\n`);
  process.stdout.write(`candidates (source_dataset='google-places', locality or country_code NULL): ${rows.length}\n`);
  process.stdout.write(`to change: ${planned.length}    to skip: ${skipped.length}\n\n`);

  for (const { row, changes, misses } of planned) {
    process.stdout.write(`  ${row.id.slice(0, 8)}  ${row.name}\n`);
    for (const [column, value] of changes) {
      process.stdout.write(`      ${column.padEnd(12)} NULL -> ${JSON.stringify(value)}\n`);
    }
    for (const column of misses) {
      process.stdout.write(`      ${column.padEnd(12)} NULL -> NULL (cache yields none; left alone)\n`);
    }
    for (const column of ['locality', 'country_code']) {
      if (row[column] !== null) {
        process.stdout.write(`      ${column.padEnd(12)} ${JSON.stringify(row[column])} (already set; untouched)\n`);
      }
    }
  }

  if (skipped.length > 0) {
    process.stdout.write('\n  skipped:\n');
    for (const [row, reason] of skipped) {
      process.stdout.write(`    ${row.id.slice(0, 8)}  ${row.name} — ${reason}\n`);
    }
  }

  if (planned.length === 0) {
    process.stdout.write('\nNothing to do.\n');
    return;
  }

  const statements = planned.map(({ row, changes }) => updateStatement(row, changes));
  process.stdout.write(`\n${APPLY ? 'SQL executed' : 'SQL that --apply would execute'}:\n`);
  process.stdout.write('  begin;\n');
  for (const statement of statements) process.stdout.write(`  ${statement}\n`);
  process.stdout.write('  commit;\n');

  if (!APPLY) {
    process.stdout.write('\nNo changes were made. Re-run with --apply to write.\n');
    return;
  }

  psql(`begin;\n${statements.join('\n')}\ncommit;`);
  process.stdout.write(`\nApplied ${statements.length} update(s).\n`);
}

await main();
