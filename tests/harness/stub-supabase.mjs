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
 * ## Identity
 *
 * Any credentials are accepted — but **the email that is accepted is the email that comes back**,
 * on the session, on `/auth/v1/user`, and on the `profiles` row `/profile` renders. See the GoTrue
 * block below for what that fixed and why it mattered.
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
import {
  savedPlaceRows,
  profileRow,
  userRecord,
  sessionPayload,
  DEMO_EMAIL,
  collectionMemberRows,
  collectionDetailRows,
  collectionInviteRows,
  collectionItemRows,
  invitePreviewRows,
  DEMO_USER_ID,
} from './fixtures.mjs';

/** Tables the app reads (`grep -rn "\.from('" src/`), each with a fixture supplier. */
function tableFixtures(placeCount, email) {
  return {
    saved_places: () => savedPlaceRows(placeCount),
    profiles: () => [profileRow(email)],
    // Collections were `[]` until 2026-08-31, on the grounds that inventing fixtures whose shape
    // nobody had checked was worse than an admitted gap. The shapes are now **established from the
    // code** — `SUMMARY_SELECT`, `DETAIL_SELECT` and their hand-written row interfaces in
    // `src/app/collections/_lib/get-collections.ts` — which is the difference between a mirror and
    // a guess, and it closes two of Q1's three holes.
    collection_members: () => collectionMemberRows(placeCount),
    collections: () => collectionDetailRows(placeCount),
    collection_invites: () => collectionInviteRows(),
    // Not read by any page — `/collections/[id]` gets its items through `DETAIL_SELECT`'s embed on
    // `collections`. Mirrored anyway so a future direct read is not silently empty; see the
    // function's header in `fixtures.mjs`.
    collection_items: () => collectionItemRows(placeCount),
    sources: () => [],
    imports: () => [],
    extractions: () => [],
    poi_regions: () => [],
  };
}

/**
 * The JSON body of a request, or `{}`. `POST /auth/v1/token` is the only place the stub has ever
 * needed to *read* what the app sent, and it is the whole of the identity fix: the email is in
 * there and nowhere else.
 */
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * The `email` claim out of an `Authorization: Bearer <jwt>` header, or `null`.
 *
 * Per-request and therefore **authoritative over anything the process remembers**: the browser can
 * hold a session cookie that outlives this process (restart the stub, the cookie survives), and a
 * remembered variable would then answer with the default while the token in hand says otherwise.
 * The token is the only thing that travels with the request.
 *
 * `null` on anything that is not a three-part JWT with a string `email` — which is the common case,
 * because supabase-js sends the anon key in this header when there is no session, and the anon key
 * here is the literal string `stub-anon-key-not-a-secret`.
 */
function identityFromBearer(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof claims.email === 'string' && claims.email !== '' ? claims.email : null;
  } catch {
    return null;
  }
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
 *   `email` is the **default** identity, used only for requests that state none of their own.
 * @returns {Promise<{ url: string, port: number, setPlaceCount: (n: number) => void, requests: string[], close: () => Promise<void> }>}
 */
export function startStubSupabase(options = {}) {
  let placeCount = options.places ?? 0;
  /**
   * The identity a request gets when it carries no token of its own — a cookie-seeding harness, or
   * the first paint before anyone has signed in. `options.email` overrides it for a whole run.
   */
  const defaultEmail = options.email ?? DEMO_EMAIL;
  /**
   * Who signed in through the form, most recently.
   *
   * This exists **only** as the fallback for a request whose bearer token carries no email;
   * `identityFromBearer` wins wherever it can answer. A stub that trusted this variable alone would
   * be right about the last person to submit the form rather than about the request in front of it,
   * which is the same class of error as the bug it is here to fix — a right answer to a
   * neighbouring question (`iteration-2-record.md` §3.1).
   */
  let signedInEmail = defaultEmail;
  /** Every path the app actually asked for, so an unhandled one is visible rather than silent. */
  const requests = [];

  /** Who this request is for: its own token first, the last form submission second. */
  const identityFor = (req) => identityFromBearer(req) ?? signedInEmail;

  const server = createServer(async (req, res) => {
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
    //
    // **The identity submitted to the form is the identity returned, everywhere.** The stub used to
    // accept any credentials and then answer with `demo@example.com` regardless, so `/profile` —
    // which reads `user.email` off the real session, correctly — showed a person smoke-testing
    // somebody else's address after they had typed their own. It was reported as a product bug and
    // it never was one. Fixture *places* are meant to look invented; the signed-in identity is not,
    // because a rig that misreports who you are costs the reader their trust in every other thing
    // it shows them.
    if (url.pathname === '/auth/v1/user') {
      // The token's signature is still not checked — the stub's security model is that it listens
      // on loopback, holds no real data, and is started and killed by the harness. Its `email`
      // claim is read, which is a different thing from trusting it.
      json(res, 200, userRecord(identityFor(req)));
      return;
    }
    if (url.pathname === '/auth/v1/token' || url.pathname === '/auth/v1/signup') {
      // `grant_type=password` and `signup` both carry `{ email, password }`. `refresh_token` does
      // not carry an email at all, and must not reset the identity to the default — hence the
      // fallback rather than an assignment.
      const body = await readJson(req);
      const submitted = typeof body.email === 'string' ? body.email.trim() : '';
      if (submitted !== '') signedInEmail = submitted;
      json(res, 200, sessionPayload(signedInEmail));
      return;
    }
    if (url.pathname === '/auth/v1/logout') {
      // Back to the default, so the next person through the form is not silently answered with the
      // last one's address.
      signedInEmail = defaultEmail;
      res.writeHead(204).end();
      return;
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      json(res, 200, {});
      return;
    }

    // ---- PostgREST --------------------------------------------------------------
    // PostgREST exposes a SECURITY DEFINER function as `POST /rest/v1/rpc/<name>`. The join screen
    // is the only caller: `preview_collection_invite` (migration `0024`), whose five-column result
    // is deliberately narrower than the collection itself.
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.slice('/rest/v1/rpc/'.length);
      if (fn === 'preview_collection_invite') {
        json(res, 200, invitePreviewRows());
        return;
      }
      json(res, 200, []);
      return;
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length);
      const fixtures = tableFixtures(placeCount, identityFor(req));
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
