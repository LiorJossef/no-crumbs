/**
 * Stand the product up locally, for a person to click through.
 *
 * Every other harness in this directory drives the app and exits. This one starts it and stays
 * up, because the thing it is for is a human smoke test rather than a measurement.
 *
 * ## What is real here and what is not
 *
 * **Real:** the Next server, every React component, the MapLibre canvas and its CARTO tiles, the
 * camera, the sheet and its gesture arbitration, every string, the whole design system in both
 * themes. This is the product, not a mock of it.
 *
 * **Stubbed:** the data layer. `NEXT_PUBLIC_SUPABASE_URL` points at `stub-supabase.mjs`, which
 * answers the PostgREST and GoTrue routes the app actually calls, out of `fixtures.mjs`. So the
 * screens are honest and the *rows behind them are invented* — deliberately and visibly so, which
 * is why the fixture places are named `Sabich Counter No. 1` rather than after real venues.
 *
 * **Absent:** anything that leaves the machine. A real TikTok fetch, the model call, and the
 * write that follows them need credentials this checkout does not have — there is no `.env.local`
 * here, only `.env.example`. Pasting a link will reach the import screen and then fail at the
 * network boundary, honestly, on the failure screen built for exactly that. That gap is the run
 * report's `Q2`, and closing it needs a deployment rather than a harness.
 *
 * ## Why dev mode rather than `next start`
 *
 * The `?state=` seam on `/import` is guarded on a literal `NODE_ENV !== 'production'` that the
 * bundler folds, so a production build eliminates it — correctly, since it must be unreachable in
 * production. Dev mode is therefore the only way to look at the review, no-places and failure
 * screens without credentials, and those are most of what is worth reviewing. Pass `--prod` for
 * the production path instead; the seam goes away with it.
 *
 * `-H localhost` and a `localhost` URL are not cosmetic: Next 16's dev server refuses cross-origin
 * requests for its own client chunks, so driving it at `127.0.0.1` returns 403 on every chunk,
 * React never hydrates, and the page sits there as inert server-rendered HTML that looks fine.
 * `app-server.mjs` handles this; the note is here because it cost an hour once.
 *
 * ## Usage
 *
 *   node tests/harness/serve-local.mjs                # 3 places, dev
 *   node tests/harness/serve-local.mjs --places 30
 *   node tests/harness/serve-local.mjs --prod         # production build, no ?state= seam
 *
 * Ctrl-C stops both servers and does not resolve until the process group is actually gone.
 */

import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp, startApp } from './app-server.mjs';
import { startStubSupabase } from './stub-supabase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(name);

const places = Number(flag('--places', '3'));
const appPort = Number(flag('--port', '4311'));
const ctlPort = Number(flag('--control-port', '4312'));
const dev = !has('--prod');

const b = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const mint = (s) => `[36m${s}[0m`;

async function main() {
  console.log(`\n${mint('No Crumbs')} ${dim('— local smoke test')}\n`);

  const stub = await startStubSupabase({ places });
  console.log(`${dim('stub data layer')}  ${stub.url}  ${dim(`(${places} places)`)}`);

  // A control plane for the one variable worth changing while clicking around. The product is a
  // different product at 0, at 3 and at 300, and the run report's top finding is about the last of
  // those — so switching between them without a restart is the point of this endpoint.
  let current = places;
  const control = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const m = /^\/places\/(\d+)$/.exec(url.pathname);
    res.setHeader('access-control-allow-origin', '*');
    if (m) {
      current = Number(m[1]);
      stub.setPlaceCount(current);
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`places = ${current}\nreload the app to see it\n`);
      console.log(`${dim('→ library size now')} ${b(String(current))} ${dim('· reload the app')}`);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`places = ${current}\nGET /places/<n> to change it\n`);
  });
  await new Promise((r) => control.listen(ctlPort, '127.0.0.1', r));

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: stub.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
  };

  if (!dev) {
    console.log(dim('building (production path)…'));
    buildApp(REPO, env);
  }

  console.log(dim(dev ? 'starting next dev…' : 'starting next start…'));
  const app = await startApp(REPO, appPort, env, { dev });

  const line = '─'.repeat(64);
  console.log(`\n${line}`);
  console.log(`  ${b('Open')}   ${mint(app.url)}`);
  console.log(`  ${b('Sign in')} any email and password — the stub accepts anything,`);
  console.log(`           ${dim('and signs you in as the address you typed, not as a fixture')}`);
  console.log(`${line}`);
  console.log(`
  ${b('Worth looking at')}
    ${app.url}/                    the landing page, and the mark with its face
    ${app.url}/map                 the run's whole point — pins at rest
    ${app.url}/collections
    ${app.url}/profile
`);
  if (dev) {
    console.log(`  ${b('Import screens')} ${dim('(dev-only seam, folded out of production)')}
    ${app.url}/import?state=review
    ${app.url}/import?state=no-places      ${dim('the modal outcome, ~73% of imports')}
    ${app.url}/import?state=no-places-a    ${dim('no caption')}
    ${app.url}/import?state=no-places-c    ${dim('area only')}
    ${app.url}/import?state=rail
`);
  }
  console.log(`  ${b('Change the library size')} ${dim('without restarting, then reload')}
    curl ${dim(`http://127.0.0.1:${ctlPort}`)}/places/0     ${dim('the demo dies here')}
    curl ${dim(`http://127.0.0.1:${ctlPort}`)}/places/3
    curl ${dim(`http://127.0.0.1:${ctlPort}`)}/places/30
    curl ${dim(`http://127.0.0.1:${ctlPort}`)}/places/300   ${dim('the product dies here')}

  ${b('Dark mode')} follows your OS setting. There is no toggle, deliberately —
  the palette is measured but unsigned, which is decision 4 in the report.

  ${dim('The data is fixtures. A real import needs credentials this checkout does not have,')}
  ${dim('so pasting a link reaches the import screen and then fails honestly at the network.')}

  ${dim('Ctrl-C to stop.')}
`);

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${dim(`${signal} — stopping…`)}`);
    try {
      await app.stop();
    } catch (e) {
      console.error(String(e && e.message ? e.message : e));
    }
    await new Promise((r) => control.close(r));
    await stub.close();
    console.log(dim('stopped. nothing left running.\n'));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
