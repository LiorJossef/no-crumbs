/**
 * RECOG-METRICS-1 — lift `ResolveQuery.textVariants` out of the local extraction cache and into a
 * committed file, so the scoreboard replay can reproduce the *exact* query each recorded provider
 * answer was scored against.
 *
 * ## Why this exists
 *
 * `tiktok-recognition-run{,.google}.json` record `queryText` but **not** `textVariants`. The
 * variants are half the query: `scorePlace` scores the best form over `queryForms(text, variants)`,
 * so a replay that drops them scores a different question than the run did.
 * `docs/evidence/places/resolution-confidence-2026-08-28.md` §2 states that limitation explicitly
 * — `קוהי` replayed at 0.718 where the live run scored 0.919 — and this closes it.
 *
 * The variants are the extractor's own output (`identifiedName` + `nameVariants`, composed by
 * `buildResolveQuery`'s `dedupeVariants`). They contain no provider content, so unlike the Google
 * rows they are safe to keep in the repository indefinitely.
 *
 * ## Input
 *
 * `docs/evidence/.local/tiktok-recognition-cache/` — gitignored, machine-local. Keyed exactly as
 * the harness keys it: `extract-<version>-<promptVersion>-<sha256(caption)[0..16]>.json`. Keying on
 * the caption matters: three corpus cases extract the identical `rawName` (`האחים`) with three
 * different variant lists, so a rawName-keyed map would silently pick one.
 *
 *   node tests/manual/recognition-variants-from-cache.mjs
 *
 * Re-run it after a prompt-version change. If the cache is absent the script says so and writes
 * nothing rather than emitting an empty map that would look like "this candidate has no variants".
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const cacheDir = `${repo}docs/evidence/.local/tiktok-recognition-cache`;
const out = `${repo}docs/evidence/places/recognition-query-variants.json`;

if (!existsSync(cacheDir)) {
  console.error(`[variants] no extraction cache at ${cacheDir} — nothing written.`);
  process.exit(1);
}

const sha = (t) => createHash('sha256').update(t).digest('hex');
const safeKey = (t) => t.replace(/[^\w.-]+/gu, '_').slice(0, 60);

/** `buildResolveQuery`'s `dedupeVariants`, reproduced — the only copy of it outside the domain. */
function dedupeVariants(text, raw) {
  const seen = new Set([text.trim().toLowerCase()]);
  const list = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const trimmed = String(v).trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(trimmed);
  }
  return list;
}

const runs = ['tiktok-recognition-run.json', 'tiktok-recognition-run.google.json']
  .map((f) => `${repo}docs/evidence/places/${f}`)
  .filter((p) => existsSync(p))
  .map((p) => JSON.parse(readFileSync(p, 'utf8')));

const byUrl = {};
let hits = 0;
let misses = 0;

for (const run of runs) {
  const { version, promptVersion } = run.extractor ?? {};
  for (const kase of run.cases ?? []) {
    if (typeof kase.caption !== 'string' || kase.caption === '') continue;
    const file = `${cacheDir}/extract-${safeKey(version)}-${safeKey(promptVersion)}-${sha(kase.caption).slice(0, 16)}.json`;
    if (!existsSync(file)) {
      misses += 1;
      continue;
    }
    const extraction = JSON.parse(readFileSync(file, 'utf8'));
    const entry = (byUrl[kase.url] ??= { promptVersion, candidates: {} });
    for (const c of extraction.candidates ?? []) {
      entry.candidates[c.rawName] = dedupeVariants(c.rawName, [c.identifiedName, ...(c.nameVariants ?? [])]);
      hits += 1;
    }
  }
}

writeFileSync(
  out,
  `${JSON.stringify(
    {
      _comment:
        'RECOG-METRICS-1. ResolveQuery.textVariants per corpus URL and rawName, lifted from the local extraction cache by tests/manual/recognition-variants-from-cache.mjs. The run JSONs do not record variants and the replay needs them; see that script for why. Extractor output only — no provider content.',
      generated_at: new Date().toISOString(),
      urls: byUrl,
    },
    null,
    2,
  )}\n`,
);

console.error(`[variants] ${String(Object.keys(byUrl).length)} url(s), ${String(hits)} candidate(s), ${String(misses)} caption(s) with no cache entry -> ${out}`);
