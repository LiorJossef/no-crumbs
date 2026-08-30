/**
 * The `/api/imports/probe` wire contract, declared client-side.
 *
 * **A client module, despite the `_lib` folder.** Everywhere else in `src/app/`, `_lib` means
 * server-only; here it means "not a route, and colocated with the one screen that uses it". Nothing
 * in this directory carries `import 'server-only'` and nothing in it may.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 105-150) by W6-1. **W6-2 edits this
 * file next**: it splits the source fetch into its own sub-second request, which wants a
 * `SourcePreview` type here — `ProbeSuccess` minus `extractionId` and `candidates` — with
 * `ProbeSuccess` extending it, so the two responses are provably the same fields.
 */

import type { StoredResolution } from '@/domain/import/resolution-record';
import type { PlaceCandidate } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * `/api/imports/probe` — the throwaway route wired in ahead of the real streaming route
 * (L0-F6-T1). Proves the real oEmbed fetch + caption extraction reach this screen: no LLM, no
 * candidates, no `runImport`. See `src/app/api/imports/probe/route.ts`'s header.
 * ------------------------------------------------------------------------------------------- */

export interface ProbeSuccess {
  /** The real `sources.id` row this probe fetched/cached — carried through so a later save (even
   *  with zero candidates) links this source instead of silently sending `sourceId: null`. */
  readonly sourceId: string;
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
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
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
}

/** A probe candidate: what the model extracted, plus what the resolver made of it. Matches the
 *  route's `StoredCandidateRow` — the shortlist itself stays on the server; this is a read-only
 *  copy for the screen, and a confirm may still only send *positions* into it. */
export type ProbeCandidate = PlaceCandidate & { readonly resolution: StoredResolution | null };

export interface ProbeErrorBody {
  readonly error: { readonly code: string; readonly retryable: boolean };
}
