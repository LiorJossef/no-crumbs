import { redirect } from 'next/navigation';
import { createClient } from '@/app/_lib/supabase/server';
import { ImportPageClient } from './import-page-client';

// S6, `docs/ux-architecture.md` §12.1 / `docs/mvp-plan.md` §5 (L0-F1-T1/T2/T3) /
// `docs/execution-plan.md` L1-F2-T1/T2. Same belt-and-suspenders auth check as `/map`
// (`src/app/map/page.tsx`): the middleware already redirects an unauthenticated visitor, but every
// page that renders user-scoped UI still calls `getUser()` itself.
//
// This page is UI-only for now (see `import-page-client.tsx`'s header) — no real
// `POST /api/imports` call, no `runImport` invocation. The client component owns every visual
// state and a dev-only stepper to walk through them.
export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  return <ImportPageClient />;
}
