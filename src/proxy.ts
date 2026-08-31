import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Server-side route protection (task 4 of the pre-L1 vertical slice): an unauthenticated visitor
// hitting /map is redirected to /sign-in before any React renders.
//
// Redirecting is the narrow job. The wider one is refreshing the Supabase session cookies, which
// is the official @supabase/ssr middleware pattern and the only place a **Server Component** page
// can have a refreshed token persisted — see `config.matcher` at the foot of this file, and
// `app/_lib/supabase/server.ts`, which depends on that being true.
const PROTECTED_PREFIXES = ['/map'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) validates the token against the auth server rather than only
  // trusting the cookie payload — the pattern Supabase's own docs require for server code.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const signInUrl = new URL('/sign-in', request.url);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

/**
 * **Every page, and nothing else.**
 *
 * This was `['/map/:path*']`, which made the session refresh above run on one route. Six Server
 * Component pages sat outside it — `/`, `/import`, `/profile`, `/collections`,
 * `/collections/join/[token]` and `/auth/new-password` — and a Server Component cannot write a
 * cookie: `app/_lib/supabase/server.ts` catches that failure and drops the refreshed token. So a
 * visit to any of those returned a session that had been refreshed and not saved, and the next
 * request re-presented a refresh token that had already been spent. Inside GoTrue's reuse interval
 * that is forgiven and returns the same session; past it, it is a signed-out user who did nothing
 * wrong. That page's comment asserted this file already covered it, which is the shape of bug
 * where the comment is the defect.
 *
 * Written as a negative lookahead rather than a list of routes on purpose: a list is a thing
 * someone has to remember to add a page to, and the failure when they forget is silent, delayed,
 * and looks like a random sign-out. This way a new page is covered the day it is created.
 *
 * ## What is excluded, and why each one
 *
 * The cost being managed is real: every matched request now makes a `getUser()` call to the auth
 * server before anything renders. That is the documented price of the @supabase/ssr pattern, and
 * it should not be paid by anything that has no session to refresh.
 *
 *  - `api/` and `auth/callback` are **Route Handlers**, and a Route Handler owns a response, so
 *    `cookies().set()` succeeds there and it refreshes its own session. `/auth/callback` in
 *    particular is mid-exchange of a one-use code; it needs no help and wants no interference.
 *  - `healthz` is the deploy check. It must answer without depending on the auth server being up —
 *    a liveness probe that fails when a third party does is not a liveness probe.
 *  - `_next/static`, `_next/image`, and anything whose last path segment contains a dot
 *    (`favicon.ico`, `icon.svg`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`) are assets.
 *    No route in this product has a dot in its path — a collection token is a uuid.
 *  - `opengraph-image` and `apple-icon` are generated metadata images. They have no extension in
 *    their URL, so the dot rule misses them; they are crawler and add-to-home-screen traffic, and
 *    an auth round trip per request is pure waste.
 *
 * `/sign-in` and `/auth/reset` are *not* excluded. They are cheap, a signed-in visitor can reach
 * both, and carving out pages that merely usually have no session is how the list-shaped version
 * of this bug comes back.
 *
 * The literal is inline because Next requires it: matchers are read statically at build time and a
 * variable is ignored. `tests/unit/proxy-matcher.test.ts` compiles *this* value with Next's own
 * `getMiddlewareMatchers` and checks both halves of the list.
 */
export const config = {
  matcher: ['/((?!api/|healthz|auth/callback|opengraph-image|apple-icon|_next/static|_next/image|.*\\.[^/]*$).*)'],
};
