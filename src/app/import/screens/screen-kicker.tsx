'use client';

/**
 * The kicker every screen of the import flow wears above its H1.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 827-842) by W6-1, and deliberately
 * **not** collected into a `shared/` bucket with `STATUS_CHIP` and `IMPORT_ERROR_ICON`: those two
 * have one consumer each and belong beside it. This one has three, which is what makes it a file.
 */

import type { ReactNode } from 'react';

/* ------------------------------------------------------------------------------------------- *
 * Shared header treatment — the sign-in screen's visual personality (mint icon mark, small-caps
 * kicker, extrabold heading) carried onto every screen of this flow. Colours/type only; this
 * flow keeps its own thumb-zone composition rather than adopting sign-in's two-panel layout.
 * ------------------------------------------------------------------------------------------- */

export function ScreenKicker({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-accent text-brand">
        {icon}
      </span>
      <p className="text-micro font-bold tracking-[0.14em] text-brand uppercase">{label}</p>
    </div>
  );
}
