/**
 * The Stage 1 acceptance gate — `docs/nls-plan.md` §4.3.
 *
 * Runs the 35 hand-labelled queries in `docs/evidence/extraction/nls-golden-stage1.json` against
 * the live model, through the running dev server, and scores two numbers:
 *
 *   - **no-false-filter >= 90%** — the gate that matters. Inventing a filter is far worse than
 *     returning none, because it silently hides the row the user wanted.
 *   - **exact-intent >= 70%**, Hebrew and English reported separately.
 *
 * ## Why it goes through the server rather than calling the provider directly
 *
 * The API key lives in `.env.local`, which this project's permissions deny to a shell. The dev
 * server has it loaded, so the route is the only door — and driving the route is the better test
 * anyway: it measures the prompt, the schema, the parse and the clamp together, which is what a
 * user actually gets.
 *
 * ## Modes
 *
 *   --probe   the schema bisection. `json-schema.ts` records that this endpoint rejects a schema
 *             it considers too complex with a bare `400 INVALID_ARGUMENT` naming no field, and
 *             flags a 15-value enum on a nested array's `items` as the open, unmeasured risk. The
 *             intent schema walks straight into it, and the failure mode is every search returning
 *             400. One call per variant, strongest first.
 *   --run     the 35 cases.
 *   --clamp   one call proving the clamp: the same query sent twice, once against a full
 *             vocabulary and once against a library that has none of what the model will say.
 *
 * Every mode reports the number of live calls it made. Nothing here writes to the database.
 *
 * Usage:  node scripts/nls-benchmark.mjs --probe --run --clamp [--base http://localhost:3477]
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const GOLDEN = 'docs/evidence/extraction/nls-golden-stage1.json';
const BASE = argValue('--base') ?? 'http://localhost:3477';
const EMAIL = argValue('--email') ?? 'demo@example.com';
const PASSWORD = argValue('--password') ?? 'local-dev-preview-1234';
const OUT = argValue('--out') ?? 'docs/evidence/extraction/nls-stage1-run.json';
/** Seconds between calls. Measured 2026-09-04: 19 calls inside a minute earned a provider 429 on
 *  the free tier, so the set is paced rather than fired flat out. */
const DELAY_MS = Number(argValue('--delay') ?? 6000);
/** A comma-separated list of case ids, for resuming a run the route's own rate limiter cut short.
 *  That limiter is per user and in memory, and it is 20 per ten minutes — correct for a person
 *  and far too tight for a 35-case benchmark, which is a fact about the benchmark and not a reason
 *  to weaken the product. */
const ONLY = argValue('--cases')?.split(',');
/** `--model gemini-3.5-flash-lite` measures the plan's fallback. The route only honours this
 *  outside production and only for the two models §6.1 names. */
const MODEL = argValue('--model');

/** Every value the taxonomy has, so the benchmark measures the MODEL rather than the clamp. The
 *  clamp gets its own mode, where a deliberately narrow vocabulary is the point. */
const FULL_VOCABULARY = {
  categories: ['restaurant', 'cafe', 'bar'],
  tags: [
    'italian', 'japanese', 'asian', 'middle eastern', 'mexican', 'american', 'mediterranean',
    'bakery', 'desserts', 'specialty coffee', 'brunch', 'cocktails', 'wine bar', 'beer pub',
    'speakeasy',
  ],
  visit: ['been', 'not-been'],
  origins: ['import', 'manual'],
};

let liveCalls = 0;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function has(flag) {
  return process.argv.includes(flag);
}

/** The repo's own `normalise()`, reimplemented for a plain-node script that cannot import TS.
 *  Kept byte-identical in behaviour to `src/domain/places/normalise.ts`; the keyword comparison
 *  below is the only thing that depends on it. */
function normalise(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\p{L}\p{N}_\s\u0590-\u05FF\u3000-\u9FFF]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function sameSet(a, b) {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

/** Whether one field of a reply is acceptable. `null` in an accepted list means "no value". */
function accepts(accepted, value) {
  return accepted.some((option) => (option === null ? value === null : option === value));
}

function keywordAccepts(accepted, value) {
  if (accepted === 'ANY') return true;
  return accepted.some((option) =>
    option === null ? value === null : value !== null && normalise(option) === normalise(value),
  );
}

/**
 * The two scores for one case, on the intent the route returned — i.e. after the clamp, which is
 * what a user could see.
 *
 * `noFalseFilter` only ever penalises a value the model **asserted**. Asserting fewer filters than
 * expected is not a failure here, by design: under-filtering shows the user more rows than they
 * asked for, over-filtering hides the row they were looking for and gives them no way to tell why.
 */
function score(expected, intent) {
  const assertedBad = [];
  if (intent.category !== null && !accepts(expected.category, intent.category)) {
    assertedBad.push(`category=${intent.category}`);
  }
  const acceptedTags = new Set(expected.tags.flat());
  for (const tag of intent.tags) {
    if (!acceptedTags.has(tag)) assertedBad.push(`tag=${tag}`);
  }
  if (intent.visit !== 'all' && !accepts(expected.visit, intent.visit)) {
    assertedBad.push(`visit=${intent.visit}`);
  }
  if (intent.origin !== 'all' && !accepts(expected.origin, intent.origin)) {
    assertedBad.push(`origin=${intent.origin}`);
  }
  const exact =
    accepts(expected.category, intent.category) &&
    expected.tags.some((set) => sameSet(set, intent.tags)) &&
    accepts(expected.visit, intent.visit) &&
    accepts(expected.origin, intent.origin) &&
    keywordAccepts(expected.keyword, intent.keyword);
  return { noFalseFilter: assertedBad.length === 0, falseFilters: assertedBad, exact };
}

function pct(n, d) {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function interpret(request, query, vocabulary, schemaVariant) {
  liveCalls += 1;
  const response = await request.post(`${BASE}/api/search/interpret`, {
    data: { query, vocabulary, ...(schemaVariant ? { schemaVariant } : {}), ...(MODEL ? { model: MODEL } : {}) },
    failOnStatusCode: false,
    timeout: 30_000,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = { parseError: (await response.text()).slice(0, 200) };
  }
  return { status: response.status(), body };
}

/**
 * One call, with a single retry reserved for a **provider** 429 — the free tier's per-minute
 * ceiling, which is a fact about how fast we asked and not about the model's answer.
 *
 * This is not a retry in the product: `query-intent.ts` makes exactly one call and never retries,
 * because a retry doubles the latency of the case a user is already waiting through. It exists
 * only so a benchmark that hits a pacing limit measures the model rather than the limit.
 */
async function interpretPaced(request, query, vocabulary, schemaVariant) {
  const first = await interpret(request, query, vocabulary, schemaVariant);
  if (first.status === 429 && first.body?.reason === 'quota') {
    await sleep(45_000);
    const second = await interpret(request, query, vocabulary, schemaVariant);
    return { ...second, retried: true };
  }
  return first;
}

async function main() {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  // Same fill-then-read-back dance as `tests/e2e/_lib/sign-in.ts`: under `next dev` a fill that
  // lands before hydration is silently discarded.
  let signedIn = false;
  for (let attempt = 0; attempt < 4 && !signedIn; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const email = page.getByPlaceholder('you@example.com');
    const password = page.locator('#password');
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    if ((await email.inputValue()) !== EMAIL || (await password.inputValue()) !== PASSWORD) continue;
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL('**/map', { timeout: 20_000 });
      signedIn = true;
    } catch {
      // The click landed pre-hydration. Start over.
    }
  }
  if (!signedIn) throw new Error('could not sign in');

  const report = { base: BASE, startedAt: new Date().toISOString(), probe: null, run: null, clamp: null };

  if (has('--probe')) {
    report.probe = [];
    for (const variant of ['full', 'no-tag-enum', 'no-enums', 'none']) {
      const { status, body } = await interpret(context.request, 'italian restaurant', FULL_VOCABULARY, variant);
      const ok = status === 200 && body.ok === true;
      report.probe.push({ variant, status, ok, reason: body.reason ?? null, intent: body.intent ?? null });
      process.stdout.write(`probe ${variant.padEnd(12)} ${ok ? 'ACCEPTED' : `REJECTED (${status} ${body.reason ?? ''})`}\n`);
      if (ok) break; // Strongest accepted shape found; the weaker ones are not worth the quota.
    }
  }

  if (has('--run')) {
    const variant = argValue('--variant');
    const rows = [];
    for (const c of golden.cases) {
      if (ONLY !== undefined && !ONLY.includes(c.caseId)) continue;
      if (c.query === '') {
        // Submit is disabled until there is text (§6.2) and the route rejects an empty query
        // before the provider. Recorded as "no call was made", which is the correct behaviour.
        rows.push({ ...c, skipped: 'no call — empty submit', noFalseFilter: true, exact: true });
        continue;
      }
      const { status, body, retried } = await interpretPaced(context.request, c.query, FULL_VOCABULARY, variant);
      if (status !== 200 || body.ok !== true) {
        rows.push({ caseId: c.caseId, lang: c.lang, status, failed: body.reason ?? 'unknown', noFalseFilter: false, exact: false });
        process.stdout.write(`${c.caseId} FAILED ${status} ${body.reason ?? ''}\n`);
        continue;
      }
      const s = score(c, body.intent);
      rows.push({
        caseId: c.caseId,
        lang: c.lang,
        query: c.query,
        intent: body.intent,
        dropped: body.dropped,
        elapsedMs: body.meta.elapsedMs,
        retried: retried === true,
        inputTokens: body.meta.inputTokens,
        outputTokens: body.meta.outputTokens,
        ...s,
      });
      process.stdout.write(
        `${c.caseId} ${c.lang.padEnd(7)} nff=${s.noFalseFilter ? 'y' : 'N'} exact=${s.exact ? 'y' : 'N'} ` +
          `${JSON.stringify(body.intent)}${s.falseFilters.length ? ` <-- ${s.falseFilters.join(',')}` : ''}\n`,
      );
      await sleep(DELAY_MS);
    }
    const by = (predicate) => rows.filter(predicate);
    const summarise = (subset) => ({
      n: subset.length,
      noFalseFilter: subset.filter((r) => r.noFalseFilter).length,
      exact: subset.filter((r) => r.exact).length,
    });
    report.run = {
      variant: variant ?? 'route default',
      rows,
      all: summarise(rows),
      en: summarise(by((r) => r.lang === 'en')),
      he: summarise(by((r) => r.lang === 'he')),
      mixed: summarise(by((r) => r.lang === 'mixed')),
      neutral: summarise(by((r) => r.lang === 'neutral')),
      latencyMs: rows.filter((r) => r.elapsedMs).map((r) => r.elapsedMs).sort((a, b) => a - b),
      tokens: {
        input: rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
        output: rows.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
      },
    };
    for (const [label, s] of Object.entries({
      all: report.run.all, en: report.run.en, he: report.run.he,
      mixed: report.run.mixed, neutral: report.run.neutral,
    })) {
      process.stdout.write(
        `${label.padEnd(8)} n=${String(s.n).padStart(2)}  no-false-filter ${pct(s.noFalseFilter, s.n).padStart(6)}  exact ${pct(s.exact, s.n).padStart(6)}\n`,
      );
    }
  }

  if (has('--clamp')) {
    // The proof `nls-plan.md` §4.3 asks for: an intent naming a category the library lacks
    // produces no chip. Same query, same model answer, two vocabularies.
    const query = 'italian restaurants';
    const wide = await interpretPaced(context.request, query, FULL_VOCABULARY, argValue('--variant'));
    await sleep(DELAY_MS);
    const narrow = await interpretPaced(
      context.request,
      query,
      { categories: ['cafe'], tags: ['bakery'], visit: [], origins: [] },
      argValue('--variant'),
    );
    report.clamp = { query, wide: wide.body, narrow: narrow.body };
    process.stdout.write(`clamp wide   ${JSON.stringify(wide.body.intent)}\n`);
    process.stdout.write(`clamp narrow ${JSON.stringify(narrow.body.intent)} dropped=${JSON.stringify(narrow.body.dropped)}\n`);
  }

  report.liveCalls = liveCalls;
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\nlive calls: ${liveCalls}\nwrote ${OUT}\n`);

  await browser.close();
}

main().catch((e) => {
  process.stderr.write(`FAIL ${e instanceof Error ? e.message : String(e)}\n`);
  process.stderr.write(`live calls made before the failure: ${liveCalls}\n`);
  process.exit(1);
});
