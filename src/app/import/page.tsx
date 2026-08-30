import { redirect } from 'next/navigation';
import { createClient } from '@/app/_lib/supabase/server';
import { ImportPageClient } from './import-page-client';

// S6, `docs/ux-architecture.md` §12.1 / `docs/mvp-plan.md` §5 (L0-F1-T1/T2/T3) /
// `docs/execution-plan.md` L1-F2-T1/T2. Same belt-and-suspenders auth check as `/map`
// (`src/app/map/page.tsx`): the middleware already redirects an unauthenticated visitor, but every
// page that renders user-scoped UI still calls `getUser()` itself.
//
// The client component owns every visual state. There was never a dev-only stepper to walk through
// them, and "UI-only, no real `POST /api/imports` call" stopped being true when the probe route
// shipped: `submit()` runs a real oEmbed fetch, a real caption extraction, a real `PlaceExtractor`
// call and a real `PlaceResolver` pass. What replaced the stepper on 2026-08-31 is a
// **development-only** URL seam — `/import?state=review|no-places|rail|error-<CODE>` — that exists
// so the quality gates can photograph the screens an import otherwise only reaches by spending a
// model call. It is folded out of a production build entirely; `_lib/dev-screen.ts` says how, and
// `tests/unit/import/dev-screen.test.ts` asserts it.
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
