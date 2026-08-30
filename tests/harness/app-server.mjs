/**
 * Builds and starts the app from a **named commit**, in a scratch directory of its own.
 *
 * Two rules force this shape rather than "run `npm run build` in the repo".
 *
 * **`docs/agent-guardrails.md` rule 31 and `working-agreement.md` §2: evidence names a commit,
 * never the working tree.** Several agents write to this tree at once, so a screenshot taken from
 * it is a picture of some blend of everybody's half-finished work and is attributable to nobody.
 * `git archive <sha> | tar -x` gives a clean tree that is exactly one commit, with no `git`
 * mutation of any kind — no worktree, no checkout, no stash, nothing another agent could notice.
 *
 * **`.next/` is a shared mutable resource.** Building in the repo root would race any other build
 * running in it and would leave a production build sitting in a tree where someone else expects a
 * dev one.
 *
 * `node_modules` is copied with `cp -Rc`, an APFS clone: 797 MB in about 8 seconds and almost no
 * disk. A symlink does not work — Turbopack rejects it outright with `Symlink [project]/node_modules
 * is invalid, it points out of the filesystem root`, which is how this was found.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}):\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

/** Materialise `commitish` into `targetDir`, with a cloned `node_modules`. Returns the full SHA. */
export function exportCommit(repoDir, commitish, targetDir) {
  const sha = run('git', ['rev-parse', commitish], { cwd: repoDir }).trim();
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  run('bash', [
    '-c',
    `git -C ${JSON.stringify(repoDir)} archive ${sha} | tar -x -C ${JSON.stringify(targetDir)}`,
  ]);
  run('cp', ['-Rc', join(repoDir, 'node_modules'), join(targetDir, 'node_modules')]);
  return sha;
}

export function buildApp(appDir, env = {}) {
  const result = spawnSync('npx', ['next', 'build'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

/**
 * `next start` on `port`, resolved once the server answers.
 *
 * The env vars are passed inline on the command, never written to a file: `.env` of any kind is
 * off limits to agents (`docs/overnight-run-plan.md` §7b rule 8, and the harness deny list makes
 * even *reading* one impossible), and there is no reason a throwaway pointer at a loopback stub
 * needs to be persisted anywhere.
 */
/**
 * Start the app on `port` and resolve once it answers.
 *
 * `options.dev` runs `next dev` instead of `next start`, and it exists for exactly one reason:
 * `src/app/import/_lib/dev-screen.ts` guards its `?state=` seam on a literal
 * `process.env.NODE_ENV !== 'production'`, which the bundler folds so the branch is *eliminated*
 * from a production build — the difference between "unreachable" and "not shipped". `next build`
 * pins `NODE_ENV=production`, so the seam is correctly invisible to the production path this
 * harness normally uses. Running dev is how the harness meets that guard rather than weakening it,
 * and weakening it was never on the table: a seam reachable in production would be a second way
 * into a screen a real user can reach.
 *
 * A dev-mode capture is **not the same artefact** as a production-build one — no minification,
 * React in development mode, different bundling, different timing. Fine for layout and copy, which
 * is what Q1 asks of these screens. Not fine for anything timing-related, so the motion
 * measurements stay on the production path.
 *
 * Dev compiles routes on demand, so the readiness timeout is longer and the first navigation to any
 * route is slow.
 */
export async function startApp(appDir, port, env = {}, options = {}) {
  // `detached: true` puts the server in its own process group, and `stop()` below signals the
  // whole group. Without it, `npx` spawns `npm exec`, which spawns `next`, and killing the pid we
  // hold leaves the wrapper alive — one was found idling after a run on 2026-08-31, which under
  // concurrency means a stray port holder nobody can account for.
  // `-H localhost` in dev, and the URL below is `localhost` to match. This is not cosmetic.
  //
  // Next 16's dev server refuses cross-origin requests for its own client chunks. Driving
  // `next dev` at `http://127.0.0.1:<port>` returns **403 on every `_next/static/chunks/*` file**,
  // so React never hydrates and the page sits there as inert server-rendered HTML — no effects, no
  // event handlers, no client state. It looks completely fine in a screenshot, which is how it cost
  // an hour: ten captures of five different `?state=` values that were all the same idle screen,
  // because `useDevScreen`'s effect had never run. Host and requested origin have to agree.
  //
  // Production is left on `127.0.0.1`: `next start` serves its chunks without the check, that path
  // is the one every measurement so far was taken on, and `localhost` can resolve to `::1` on a
  // machine where the server bound IPv4.
  const child = spawn('npx', options.dev ? ['next', 'dev', '-p', String(port), '-H', 'localhost'] : ['next', 'start', '-p', String(port)], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  const url = options.dev ? `http://localhost:${port}` : `http://127.0.0.1:${port}`;
  const deadline = Date.now() + (options.dev ? 180_000 : 90_000);
  for (;;) {
    if (Date.now() > deadline) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      throw new Error(
        `next ${options.dev ? 'dev' : 'start'} did not answer on ${url} in time:\n${log.join('')}`,
      );
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {
      return false; // the group is already gone, which is the outcome we wanted
    }
  };

  const groupIsGone = () => !signalGroup(0);

  return {
    url,
    log,
    /**
     * Stop the server, and do not resolve until the process group is actually gone.
     *
     * The first fix — detach, then SIGTERM the group — was not enough, and a wrapper was found
     * still running after a `measure-motion` run. `npx` becomes `npm exec` becomes `next`, and
     * `npm` does not reliably die on SIGTERM; the escalation to SIGKILL was on a 5 s timer, but the
     * promise had already resolved on the direct child's `exit`, so the harness exited first and
     * took the timer with it. Anything that resolves before the thing it is stopping has stopped is
     * not a stop.
     *
     * So: SIGTERM, then poll. SIGKILL the group after a grace period, and keep polling until
     * `kill(-pid, 0)` says there is nothing left to signal.
     */
    stop: async () => {
      signalGroup('SIGTERM');
      const graceUntil = Date.now() + 3000;
      const hardUntil = Date.now() + 10_000;
      while (!groupIsGone()) {
        if (Date.now() > hardUntil) {
          throw new Error(
            `next start (pid ${child.pid}) would not die; something is still holding ${url}`,
          );
        }
        if (Date.now() > graceUntil) signalGroup('SIGKILL');
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}

export function hasNodeModules(dir) {
  return existsSync(join(dir, 'node_modules'));
}
