/**
 * **`GET /auth/callback` — the route the product did not have, and the reason two things were
 * broken at once.**
 *
 * `@supabase/ssr` forces `flowType: 'pkce'`. It is not a default: in the installed 0.12.4 the line
 * sits *after* the caller's options spread in both `createBrowserClient.js` and
 * `createServerClient.js`, so nothing in this codebase can select any other flow. Every email link
 * this product can send therefore comes back carrying a `?code=`, and a code is worth nothing until
 * something calls `exchangeCodeForSession` on it. Before this file, `exchangeCodeForSession`
 * appeared nowhere in `src/`, and there was no route under `src/app` matching `auth`, `callback` or
 * `confirm`. The consequences were two, and they looked unrelated:
 *
 *  - **No password recovery at all.** A forgotten password was permanent loss of the map.
 *  - **Sign-up landing nowhere wherever confirmation is on.** `security.md` A§2.5 has it on in
 *    production. The link went to `site_url`, `/`, which is a Server Component holding no Supabase
 *    client; the code arrived somewhere with nothing to hand it to and was dropped.
 *
 * One route fixes both, which is why `product-review-2026-08-31-r1.md` ranks them as one finding.
 *
 * ## Why the exchange is here and not in the browser
 *
 * The PKCE code verifier is written through the same storage adapter as the session, and in
 * `@supabase/ssr` that storage is **cookies** — `cookies.js` applies a `-code-verifier` key to the
 * cookie jar the moment auth-js sets it, precisely so a server can complete a flow a browser
 * started. So the verifier the browser wrote when it asked for the link is on the request that
 * carries the code back, and this handler can finish the flow without shipping the code to a client
 * component first.
 *
 * That matters beyond tidiness. A recovery code is a **credential**: it is one exchange away from a
 * live session on somebody's account. Handling it server-side means it is never handed to React,
 * never a prop, never in a `router.push`, and never survives in the address bar — the browser
 * follows a 302 to a clean path, so the code is not in the history entry the user is left on and
 * not in the `Referer` of whatever they click next. It is also never logged: a failure here logs
 * that an exchange failed and nothing about what failed to exchange.
 *
 * **The one behaviour to know about, because it is a support question and not a bug:** PKCE binds
 * the link to the browser that requested it. Open the email on your phone after asking from your
 * laptop and the verifier is not there, the exchange fails, and this route sends you back to ask
 * again. `/auth/reset`'s copy says so before you leave the screen.
 *
 * ## What this route refuses
 *
 * It never redirects to a destination it was given. `callback-destination.ts` maps the request to
 * one of a closed set of our own paths and that module's header carries the argument. The
 * `next` parameter is re-checked against `safeReturnPath` **here**, on arrival, rather than trusted
 * for having been checked before it went out in an email — a link that has been out of our hands
 * for a day is untrusted input, whoever wrote it originally.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';

import { callbackCarriesError, callbackDestination } from '../_lib/callback-destination';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const code = params.get('code');

  // `NextResponse.redirect` needs an absolute URL. It is built from **this request's** origin and a
  // path this file chose, so there is no arrangement of query parameters that sends anyone to
  // another host.
  const to = (outcome: 'exchanged' | 'failed') =>
    NextResponse.redirect(new URL(callbackDestination(params, outcome), url.origin));

  if (callbackCarriesError(params) || code === null) {
    return to('failed');
  }

  const supabase = await createClient();
  /*
   * **`sb_flow_id`, and leaving it out is a bug that only appears when two links are outstanding.**
   *
   * auth-js keeps one verifier slot per in-flight PKCE flow plus a single fixed key that every
   * flow overwrites. It reads the flow id off `window.location` — *in a browser*. On a server
   * `isBrowser()` is false, so with no `flowId` the lookup falls back to that fixed key, which
   * holds whichever flow started last. One pending link and it is right by luck; a reset asked for
   * while a sign-up confirmation is still unclicked and the older link exchanges against the newer
   * link's verifier and fails, with nothing in the failure saying why. The library's own
   * `exchangeCodeForSession` docblock shows this exact call shape for the callback case.
   *
   * The parameter is auth-js's (`PKCE_FLOW_ID_PARAM`), written into the redirect by
   * `_maybeAppendFlowIdToRedirect` when the flow starts, and it is validated against the library's
   * own id pattern before use — an id that does not match fails the exchange fast rather than
   * borrowing a different flow's verifier.
   */
  const flowId = params.get('sb_flow_id');
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId === null ? undefined : { flowId },
  );

  if (error) {
    // The code itself is never logged, and neither is the provider's message: one is a credential
    // and the other is copy we have already ruled must not reach a user. `error.code` is a short
    // enumerated string and is what makes a real failure distinguishable from an expired link in
    // our own logs.
    console.error('auth callback exchange failed', { code: error.code });
    return to('failed');
  }

  return to('exchanged');
}
