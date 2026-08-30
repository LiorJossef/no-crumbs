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
export async function startApp(appDir, port, env = {}) {
  // `detached: true` puts the server in its own process group, and `stop()` below signals the
  // whole group. Without it, `npx` spawns `npm exec`, which spawns `next`, and killing the pid we
  // hold leaves the wrapper alive — one was found idling after a run on 2026-08-31, which under
  // concurrency means a stray port holder nobody can account for.
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      throw new Error(`next start did not answer on ${url} within 90s:\n${log.join('')}`);
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
    } catch {
      // The group is already gone, which is the outcome we wanted.
    }
  };

  return {
    url,
    log,
    stop: () =>
      new Promise((done) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          done();
        };
        child.once('exit', finish);
        signalGroup('SIGTERM');
        setTimeout(() => {
          signalGroup('SIGKILL');
          finish();
        }, 5000);
      }),
  };
}

export function hasNodeModules(dir) {
  return existsSync(join(dir, 'node_modules'));
}
