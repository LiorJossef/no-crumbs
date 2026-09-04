import 'server-only';

// Server-side Supabase client for Server Components, Server Actions and Route Handlers.
// Uses the anon key plus the caller's own session cookies, so RLS applies exactly as it does
// for the browser client — this is not the service-role client. It lives under app/_lib because
// it depends on next/headers (a server-only API) and is part of the composition root: ui/ may
// not import it directly (eslint uiZone), only through a Server Action in app/actions/*.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which cannot set a cookie — it has no response to
            // put one on. Nothing else reaches this branch: a Route Handler and a Server Action
            // both own a response, so `cookieStore.set` succeeds there and they persist their own
            // refreshed session.
            //
            // **Dropping it is only safe because `src/proxy.ts` already wrote it.** The proxy runs
            // ahead of every page render, calls `getUser()`, and puts the refreshed cookies on the
            // response — so by the time a Server Component gets here the token has been saved and
            // this write is the redundant second one.
            //
            // That is a claim about `proxy.ts`'s `config.matcher`, and it was **false** until
            // 2026-08-31, when the matcher was `['/map/:path*']` and six Server Component pages
            // rendered outside it: on those, the refreshed token was silently discarded here and
            // the next request re-presented a spent one. The matcher now covers every path except
            // Route Handlers and static assets, which is what makes the sentence above true. If it
            // is ever narrowed, this comment is wrong again and so is the `catch`.
          }
        },
      },
    },
  );
}
