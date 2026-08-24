// Browser Supabase client. Only ever holds the anon key (public by design — RLS is the
// authorisation boundary, not secrecy of this key). Safe to import from a client component.
// This file is deliberately outside src/app/_lib (server-only secrets), src/domain (no vendor
// SDK) and src/integrations (adapters behind a port) — it is the one vendor-SDK edge the UI is
// allowed to touch directly, per the official @supabase/ssr Next.js App Router pattern.
import { createBrowserClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';

// "Remember me" (sign-in page) needs auth cookies that die with the browser session instead of
// the library's default 400-day Max-Age. @supabase/ssr 0.12.4 doesn't expose this: cookieOptions
// passed to createBrowserClient only lets you rename cookies, not resize their lifetime — its
// internal setItem/removeItem always rewrites maxAge to DEFAULT_COOKIE_OPTIONS (400 days) right
// before handing cookies to whatever getAll/setAll it's given (see
// node_modules/@supabase/ssr/dist/main/cookies.js, createStorageFromOptions -> setItem). The one
// remaining seam is supplying our own getAll/setAll cookie adapter, which receives the same
// options object but is free to write a different Set-Cookie string. That's what this does: a
// drop-in replacement for the library's own document.cookie fallback, minus persistence when
// "remember me" is off.
// Matches the resilience of @supabase/ssr's own `cookie` package: a single malformed cookie
// elsewhere on the origin must not throw and take down every session read with it.
function decodeCookiePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function readCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return [];
  return document.cookie
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return { name: decodeCookiePart(name), value: decodeCookiePart(value) };
    });
}

function writeCookie(name: string, value: string, options: CookieOptions, persistent: boolean) {
  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  // maxAge === 0 is the library deleting a cookie — always honour that regardless of "remember
  // me" (this app's own sign-out goes through the server client's separate cookie path today, so
  // this branch isn't exercised there, but createBrowserClient can still request a deletion, e.g.
  // on an invalid/expired session, and that must not get skipped when "remember me" was off). Any
  // other maxAge is the 400-day default, which we only keep when the user opted in; dropping it
  // entirely makes the cookie session-only (cleared when the browser closes, per the HTTP cookie
  // spec — session-restore features can outlive that, see the sign-in page copy).
  if (typeof options.maxAge === 'number' && (persistent || options.maxAge === 0)) {
    segments.push(`Max-Age=${options.maxAge}`);
  }
  segments.push(`Path=${options.path ?? '/'}`);
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.sameSite) {
    // sameSite can be the boolean `true` (legacy shorthand for "Strict") — normalize it so we
    // never emit the literal, invalid `SameSite=true`.
    const sameSite = options.sameSite === true ? 'Strict' : options.sameSite;
    segments.push(`SameSite=${sameSite}`);
  }
  if (options.secure) segments.push('Secure');
  document.cookie = segments.join('; ');
}

export function createClient(opts: { rememberMe?: boolean } = {}) {
  const rememberMe = opts.rememberMe ?? true;

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The "remember me" choice is baked into the cookie adapter closure below, so this can't
      // be the library's cached browser singleton (it would keep serving the first choice made
      // this page load). This file has exactly one call site today (the sign-in form), so giving
      // up the singleton costs nothing; a second call site would need to share one client again.
      isSingleton: false,
      cookies: {
        getAll: () => readCookies(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            writeCookie(name, value, options, rememberMe);
          }
        },
      },
    },
  );
}
