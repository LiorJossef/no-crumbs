/**
 * The `/api/imports/probe` wire contract, declared client-side.
 *
 * **A client module, despite the `_lib` folder.** Everywhere else in `src/app/`, `_lib` means
 * server-only; here it means "not a route, and colocated with the one screen that uses it". Nothing
 * in this directory carries `import 'server-only'` and nothing in it may.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 105-150) by W6-1, and widened by W6-2
 * into the two round trips an import now makes: `SourcePreview` (the post, sub-second) and
 * `ProbeSuccess` (the places, 7-34s), the second extending the first.
 */

import type { PriorSave } from '@/domain/import/prior-saves';
import type { StoredResolution } from '@/domain/import/resolution-record';
import type { PlaceCandidate } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * `/api/imports/probe` — the throwaway route wired in ahead of the real streaming route
 * (L0-F6-T1). Proves the real oEmbed fetch + caption extraction reach this screen: no LLM, no
 * candidates, no `runImport`. See `src/app/api/imports/probe/route.ts`'s header.
 *
 * Since W6-2 it is the **second** of two round trips. `/api/imports/source-preview` answers first
 * with the post alone; this one answers with the places. There is still no stream anywhere —
 * `overnight-run-plan.md` §9 leaves `L0-F6` unfunded and `facelift-plan.md` §4 decision 4 forbids
 * shipping a more convincing fake in its place.
 * ------------------------------------------------------------------------------------------- */

/**
 * What `POST /api/imports/source-preview` returns: the post itself, and nothing about places.
 *
 * The sub-second half of an import. oEmbed answers in under a second while the model call behind
 * the probe measured 7-34s, so this is what the rail can put on screen — the thumbnail, the
 * `@handle`, the caption — while extraction runs underneath.
 *
 * **`ProbeSuccess` extends it rather than repeating its fields**, so the two responses are provably
 * the same shape and a screen written against one cannot be handed the other and silently miss a
 * field. Everything the probe adds is about *places*, which is exactly the axis the split is on.
 */
export interface SourcePreview {
  /** The real `sources.id` row this fetch cached — carried through so a later save (even with zero
   *  candidates) links this source instead of silently sending `sourceId: null`. */
  readonly sourceId: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
}

export interface ProbeSuccess extends SourcePreview {
  /**
   * The `extractions` row the probe route persisted for this source. Every place fact a save
   * writes is derived server-side from that row, so this id — not a payload of names and
   * coordinates — is what "Done" sends (`src/app/api/imports/confirm/route.ts`).
   *
   * `null` when the extraction could not be persisted (or there was no caption to extract from).
   * A save is impossible then, and the screen must say so rather than post a request that cannot
   * be authorised.
   */
  readonly extractionId: string | null;
  /**
   * The real, plausibility-filtered candidates from the real `PlaceExtractor`, each carrying the
   * resolver's answer for it (`resolution`). Empty when `caption` was null (no LLM call on
   * nothing) or when nothing survived the gate — both are valid, expected outcomes, not errors.
   *
   * `resolution` is `null` for a candidate that was **never put to the resolver**: an extraction
   * row written before the resolver was wired in, or a candidate past `MAX_CANDIDATES`. That is
   * deliberately not the same value as "we looked and found nothing"
   * (`domain/import/resolution-record.ts`), and the screen must not say the same thing for both.
   */
  readonly candidates: readonly ProbeCandidate[];
  /**
   * Why this import produced no candidates. Non-null only when `candidates` is empty.
   *
   * Derived server-side (`api/imports/probe/route.ts`), and deliberately an enum rather than the
   * drop counts it comes from: `PlausibilityResult.dropped` is count-only for logs, and the
   * response carries the conclusion, not the working. One enum is the same discipline as "the
   * browser may never send a place fact", in the other direction (`spec-no-places-found.md` §3.4).
   *
   * `null` from a server that predates the field, which reads as case B — the honest floor.
   */
  readonly emptyReason?: 'no_caption' | 'nothing_named' | 'area_only' | null;
  /** The extraction's own city hint: the only thing we know about *where* when we know nothing
   *  about *what*. Null on a cache hit, where nothing persists it. */
  readonly cityHint?: string | null;
  /**
   * The places this user has **already added from this same source**, oldest first.
   *
   * The measured cause of round-3 feedback §6.1 is re-adding one video, not two candidates of one
   * extraction — `domain/import/prior-saves.ts` carries the rows. Empty on the common path, and
   * empty on any read failure: it is a notice, never a gate.
   *
   * Absent from a server that predates the field, which reads as "never added before" — the
   * honest floor, the same one `emptyReason` takes.
   */
  readonly priorSaves?: readonly PriorSave[];
}

/** A probe candidate: what the model extracted, plus what the resolver made of it. Matches the
 *  route's `StoredCandidateRow` — the shortlist itself stays on the server; this is a read-only
 *  copy for the screen, and a confirm may still only send *positions* into it. */
export type ProbeCandidate = PlaceCandidate & { readonly resolution: StoredResolution | null };

export interface ProbeErrorBody {
  readonly error: { readonly code: string; readonly retryable: boolean };
}
