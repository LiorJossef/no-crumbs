/**
 * The caption-preview "Done" save's outcome classification (L0-F4-T3 follow-up, QA fix
 * 2026-08-23). `saveExtractedCandidates` (`import-page-client.tsx`) returns `{ saved, skipped,
 * failed }` over the candidates it attempted; this function turns those three counts into exactly
 * one of four dispositions so the UI never has to re-derive the distinction inline (and never
 * again silently drops `skipped`, which is how the original bug shipped — see the review that
 * added this file).
 *
 * The four cases, in order of how `finishCaptionPreview` must react:
 *  - `proceed`: either nothing was attempted at all (an empty candidate list — as legitimate as
 *    `no_places`) or everything attempted saved cleanly. Navigate to the map immediately, exactly
 *    as before this fix.
 *  - `skip_only`: every extracted candidate had `coordinates: null` (a plausible LLM outcome, not
 *    an error) and so nothing was ever sent to `save_place`. Distinct from both `proceed` (which
 *    covers the *empty-list* case) and `hard_failure` (a real save attempt that came back
 *    unsuccessful) — conflating this with either one is exactly the bug this type exists to
 *    prevent.
 *  - `hard_failure`: at least one save was attempted and none of them succeeded.
 *  - `partial_failure`: a mix — some candidates saved (real, persisted data) and at least one
 *    did not. The caller must not hide the saved ones behind a failure message, but must also not
 *    silently treat this as a full success.
 */
export type CaptionSaveOutcome =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'skip_only'; readonly message: string }
  | { readonly kind: 'hard_failure'; readonly message: string }
  | { readonly kind: 'partial_failure'; readonly message: string };

export interface CaptionSaveResult {
  readonly saved: number;
  readonly skipped: number;
  readonly failed: number;
}

export function decideCaptionSaveOutcome(result: CaptionSaveResult): CaptionSaveOutcome {
  const { saved, skipped, failed } = result;

  if (failed > 0 && saved === 0) {
    return { kind: 'hard_failure', message: "Couldn't save that place — try again." };
  }

  if (failed > 0 && saved > 0) {
    const total = saved + failed;
    return {
      kind: 'partial_failure',
      message: `Saved ${saved} of ${total} places — ${failed} couldn't be saved.`,
    };
  }

  if (saved === 0 && failed === 0 && skipped > 0) {
    return {
      kind: 'skip_only',
      message: "Couldn't pin a location for the place(s) found — nothing was saved.",
    };
  }

  return { kind: 'proceed' };
}
