import 'server-only';

// The trusted-server Supabase client. Holds the service-role key (bypasses RLS,
// `08` §5 / `0012_places_column_grant_and_service_role_matrix.sql`'s "part 2"). Lives in
// `integrations/` because it is the vendor-SDK edge an adapter is allowed to touch directly — the
// domain layer never imports `@supabase/*` (`eslint.config.mjs`'s domain zone).
//
// Review rule this client's callers must hold to (docs/security.md §4, restated in `0012`'s
// header): a service-role query never filters by `user_id`. The only rows this client's callers
// touch are the global `sources` cache, which has no user column at all.
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function serviceRoleClient(): SupabaseClient {
  if (cached !== null) {
    return cached;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || url === '' || key === undefined || key === '') {
    throw new Error(
      'serviceRoleClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.',
    );
  }
  cached = createSupabaseClient(url, key, { auth: { persistSession: false } });
  return cached;
}
