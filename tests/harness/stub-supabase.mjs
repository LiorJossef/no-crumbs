/**
 * A stand-in for GoTrue + PostgREST, good for exactly one job: letting `next start` render the
 * signed-in screens in a checkout that has no credentials and no Docker.
 *
 * ## Why this exists rather than a local Supabase
 *
 * `docs/current-state.md` item 14 records that this checkout cannot run the app. Confirmed at
 * commit 55698ae: there is no `.env.local`, so `createServerClient(undefined!, undefined!)` throws
 * and `/map`, `/import`, `/collections` and `/profile` all return 500. The normal fix — a local
 * Supabase — needs Docker, which is not running, and `npm run db:reset`, which agents may not run
 * (`docs/agent-guardrails.md`). Creating or reading an `.env` file is forbidden outright.
 *
 * What is left is the observation that a Supabase server client is an HTTP client. `getSpots()` is
 * `GET ${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/saved_places?select=...` and `getUser()` is
 * `GET ${url}/auth/v1/user`. Point that URL at this process — as an inline environment variable on
 * the `next start` command, touching no file — and the real Next server renders the real
 * components against fixture rows.
 *
 * Note that Playwright's `page.route()` cannot do this. Those requests are server-to-Supabase and
 * never cross the browser, so the browser has no interception point. This is the only seam.
 *
 * ## What a screenshot taken through this proves, and what it does not
 *
 * It proves rendering: layout at a viewport, the zero state, the camera fit at 30 places, whether
 * a button's radius is what the spec says. **It proves nothing about the database** — not a query,
 * not a join, not an RLS policy, not the shape of a real row beyond the hand-written mirror in
 * `fixtures.mjs`. Any evidence produced with this must say "stub-backed" on it. It is a way to
 * *see* the product, not a way to verify it end to end.
 *
 * ## Fidelity, stated plainly
 *
 * PostgREST's query language is not implemented. `select=`, embedded resources, `eq.`, `order` and
 * `limit` are all parsed only far enough to answer the handful of queries this app makes; the
 * fixture rows are pre-shaped to match each select instead. An unknown table returns `[]`, which
 * is the failure mode we want — a surface renders empty rather than the page 500ing and hiding
 * every other screen behind one missing fixture.
 */

import { createServer } from 'node:http';
import { savedPlaceRows, profileRow, userRecord, sessionPayload, DEMO_USER_ID } from './fixtures.mjs';

/** Tables the app reads (`grep -rn "\.from('" src/`), each with a fixture supplier. */
function tableFixtures(placeCount) {
  return {
    saved_places: () => savedPlaceRows(placeCount),
    profiles: () => [profileRow()],
    // Collections exist and have shipped, but the screenshot gates are written against the map,
    // the import flow and the zero state. An empty index is a real, reachable product state, so
    // this renders the collections zero screen rather than inventing collaborator fixtures whose
    // shape nobody has checked.
    collection_members: () => [],
    collections: () => [],
    collection_items: () => [],
    collection_invites: () => [],
    sources: () => [],
    imports: () => [],
    extractions: () => [],
    poi_regions: () => [],
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

/**
 * Start the stub.
 *
 * @param {{ port?: number, places?: number, email?: string, onRequest?: (method: string, url: string) => void }} options
 * @returns {Promise<{ url: string, port: number, setPlaceCount: (n: number) => void, requests: string[], close: () => Promise<void> }>}
 */
export function startStubSupabase(options = {}) {
  let placeCount = options.places ?? 0;
  const email = options.email ?? 'demo@example.com';
  /** Every path the app actually asked for, so an unhandled one is visible rather than silent. */
  const requests = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push(`${req.method} ${url.pathname}`);
    options.onRequest?.(req.method ?? 'GET', url.pathname + url.search);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      });
      res.end();
      return;
    }

    // ---- GoTrue -----------------------------------------------------------------
    if (url.pathname === '/auth/v1/user') {
      // The bearer token is not checked. The stub's whole security model is that it listens on
      // loopback, holds no real data, and is started and killed by the harness.
      json(res, 200, userRecord(email));
      return;
    }
    if (url.pathname === '/auth/v1/token') {
      json(res, 200, sessionPayload(email));
      return;
    }
    if (url.pathname === '/auth/v1/logout') {
      res.writeHead(204).end();
      return;
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      json(res, 200, {});
      return;
    }

    // ---- PostgREST --------------------------------------------------------------
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length);
      const fixtures = tableFixtures(placeCount);
      const supplier = fixtures[table];
      if (!supplier) {
        // Deliberately not a 404. An unmapped table is a gap in this stub, not a bug in the app,
        // and an empty result keeps the rest of the screen visible so the gap is *seen*.
        json(res, 200, []);
        return;
      }
      let rows = supplier();
      // `single()`/`maybeSingle()` send Accept: application/vnd.pgrst.object+json and expect an
      // object, not an array. `/profile` uses `maybeSingle()` on `profiles`.
      const accept = req.headers.accept ?? '';
      if (accept.includes('vnd.pgrst.object')) {
        json(res, 200, rows[0] ?? null);
        return;
      }
      json(res, 200, rows);
      return;
    }

    json(res, 404, { message: `stub-supabase: unhandled ${req.method} ${url.pathname}` });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        setPlaceCount: (n) => {
          placeCount = n;
        },
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

export { DEMO_USER_ID };

// CLI: `node tests/harness/stub-supabase.mjs --port 54331 --places 3`
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const stub = await startStubSupabase({
    port: Number(arg('--port', '54331')),
    places: Number(arg('--places', '0')),
    onRequest: (method, url) => console.log(`[stub] ${method} ${url}`),
  });
  console.log(`[stub] listening on ${stub.url}`);
}
