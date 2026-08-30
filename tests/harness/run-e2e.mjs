#!/usr/bin/env node
/**
 * Run the existing Playwright suite against a **commit**, on a stub-backed server.
 *
 * `npm run test:e2e` builds and starts the *working tree* on port 3000. Under concurrency that is
 * the wrong thing twice: the tree is five agents' half-finished work, and port 3000 plus `.next/`
 * are shared resources with no lock on them. This does the same job against a named commit in a
 * scratch directory on a kernel-assigned port, so a result is attributable and races nobody.
 *
 * ## Read the result carefully — this is not CI
 *
 * With no `E2E_PASSWORD` the signed-in tier skips, exactly as `tests/e2e/global-setup.ts` describes
 * for its environment 2 (CI against a deployment). **A green run here therefore covers the
 * signed-out tier and nothing else**, and the whole point of `global-setup.ts` is that a green tick
 * under those conditions once claimed far more than it had earned. The summary printed at the end
 * gives passed/failed/skipped separately so the number cannot be read as coverage.
 *
 * Passing `--password <p>` points the sign-in form at the stub, which answers
 * `/auth/v1/token` with a session and lets the signed-in tier actually execute. That is an
 * **experiment, not a test run**: any spec that needs a real TikTok, a real LLM or a real database
 * write will fail for reasons that say nothing about the product. Use it to learn which specs are
 * exercisable without a database, never to claim a pass.
 *
 *   node tests/harness/run-e2e.mjs --from-commit HEAD
 *   node tests/harness/run-e2e.mjs --from-commit HEAD --project gate-mobile
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startStubSupabase } from './stub-supabase.mjs';
import { exportCommit, buildApp, startApp } from './app-server.mjs';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

const commitish = arg('--from-commit', 'HEAD');
const project = arg('--project', null);
const password = arg('--password', null);
const places = Number(arg('--places', '3'));

const appDir = join(process.env.TMPDIR ?? '/tmp', `no-crumbs-e2e-${process.pid}`);
process.stderr.write(`[e2e] exporting ${commitish} to ${appDir}\n`);
const sha = exportCommit(REPO_DIR, commitish, appDir);

const stub = await startStubSupabase({ port: 0, places });
const env = {
  NEXT_PUBLIC_SUPABASE_URL: stub.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
};

process.stderr.write('[e2e] building\n');
const build = buildApp(appDir, env);
if (!build.ok) {
  process.stderr.write(build.output);
  await stub.close();
  process.exit(1);
}

const server = await startApp(appDir, await findFreePort(), env);
process.stderr.write(`[e2e] ${sha} serving at ${server.url}; running the suite\n\n`);

const result = spawnSync(
  'npx',
  ['playwright', 'test', ...(project ? [`--project=${project}`] : []), '--reporter=list'],
  {
    cwd: REPO_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: server.url,
      ...(password ? { E2E_PASSWORD: password } : {}),
    },
  },
);

await server.stop();
await stub.close();

process.stderr.write(
  `\n[e2e] commit ${sha}, stub-backed at ${places} places, ` +
    `${password ? 'E2E_PASSWORD SET (an experiment — see the header of this file)' : 'no E2E_PASSWORD: the signed-in tier skipped'}\n`,
);
process.exit(result.status ?? 1);
