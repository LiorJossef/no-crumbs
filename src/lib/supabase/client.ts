// Browser Supabase client. Only ever holds the anon key (public by design — RLS is the
// authorisation boundary, not secrecy of this key). Safe to import from a client component.
// This file is deliberately outside src/app/_lib (server-only secrets), src/domain (no vendor
// SDK) and src/integrations (adapters behind a port) — it is the one vendor-SDK edge the UI is
// allowed to touch directly, per the official @supabase/ssr Next.js App Router pattern.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
