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
            // Called from a Server Component that cannot set cookies (no request/response
            // round-trip). The middleware below refreshes the session on every request, so this
            // is safe to ignore here.
          }
        },
      },
    },
  );
}
