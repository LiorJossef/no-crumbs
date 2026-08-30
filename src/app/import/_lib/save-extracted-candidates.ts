/**
 * The confirm request — what "Done" on the review screen actually sends, and the vocabulary of what
 * comes back.
 *
 * **A client module, despite the `_lib` folder** — see `probe-contract.ts`'s header.
 *
 * Lifted verbatim out of `import-page-client.tsx` by W6-1: `SaveOutcomeDetail` from its lines
 * 97-119, `saveExtractedCandidates` from 451-548, `ItemStatus` and `CandidatePick` from 829-845.
 * The function was a closure inside the component and closed over nothing, which is why it could
 * move at all; de-indenting it is the only edit any of these lines took.
 *
 * `import-page-client.tsx` re-exports all three types, because `map-page-client.tsx` imports
 * `SaveOutcomeDetail` from there and dropping a public export is a contract change this
 * restructure has no mandate for.
 */

import type { CaptionSaveResult } from '@/domain/import/caption-save-outcome';

/** Per-candidate outcome after a save that did not fully succeed, keyed by `candidateIndex`. Only
 *  populated for a partial failure — the one case where the user stays on this screen and needs to
 *  see which card is which. */
export type ItemStatus = 'saved' | 'already_saved' | 'skipped' | 'failed';

/**
 * One line of the confirm request, as the review screen assembles it: *which* candidate, and
 * *which* of that candidate's stored shortlist entries the user chose. Both are positions.
 *
 * This is the whole shape of what the browser is permitted to say about a place — no name, no
 * coordinate, no provider id (`domain/import/candidate-place.ts`'s header). `optionIndex: null`
 * means "the user made no explicit choice", which leaves the server's own policy in charge.
 */
export interface CandidatePick {
  readonly candidateIndex: number;
  readonly optionIndex: number | null;
}

/**
 * What one "Done" actually put in the library, handed to the caller so the map can respond to it.
 *
 * `savedPlaceIds` is the point: without it, a successful import is silent — the pins exist, the
 * camera never moves, and the only feedback is a list the user has to go looking through.
 * `alreadySaved` is carried separately from `saved` so a re-import can say "already in your
 * library" instead of claiming a fresh save it did not make.
 */
export interface SaveOutcomeDetail extends CaptionSaveResult {
  readonly alreadySaved: number;
  /**
   * `saved_places.id` values — the id the map keys pins on (`Spot.id` → `MapPlace.id`), **not**
   * `places.id`. The confirm response carries both and they are both uuids, so picking the wrong
   * one fails silently: the camera simply matches nothing and never moves, which is exactly what
   * happened the first time this shipped.
   */
  readonly savedPlaceIds: readonly string[];
  /** What became of each confirmed candidate, keyed by its index in `probe.candidates`. Only read
   *  on a partial failure, where the user stays on the review screen and every card has to say
   *  what happened to it — the response has always carried `candidateIndex`; the client used to
   *  throw it away and count. */
  readonly statusByIndex: ReadonlyMap<number, ItemStatus>;
}

/**
 * The real caption-preview screen's "Done" save (this task, L0-F4-T3 follow-up). These
 * `PlaceCandidate`s never went through `PlaceResolver` —
 * `/api/imports/probe` stops after extraction (this file's header) — so there is no
 * `CandidateResolution`/`ResolvedPlace` to confirm. The only coordinate available here is the
 * model's own best guess, `PlaceCandidate.coordinates` (`domain/types.ts`'s doc comment on that
 * field): used as-is, marked with the `llm_guess`/`llm-guess` provenance pair so it is never
 * confused with a real Overture/Nominatim match, and never silently dropped — a candidate with
 * no coordinates at all is not sent to `save_place` (which requires a `lat`/`lng`), and is
 * counted as `skipped` rather than pretended-saved.
 *
 * `resolutionScore: null`: `places.resolution_score` free-text-documents a genuine
 * `PlaceResolver` score (`ports.ts`); a save with no resolution at all leaves it unset rather
 * than inventing a number that would misread as resolver confidence later.
 *
 * `sourceId`: the real `sources.id` this screen's probe fetched (`ProbeSuccess.sourceId`) — a
 * TikTok link was pasted and actually fetched, so even a zero-candidate ("no places found")
 * manual save still links back to that source. `null` stays reserved for a true no-source
 * manual entry, which this screen never produces.
 */
export async function saveExtractedCandidates(
  picks: readonly CandidatePick[],
  extractionId: string | null,
): Promise<SaveOutcomeDetail> {
  const empty: SaveOutcomeDetail = {
    saved: 0,
    skipped: 0,
    failed: 0,
    alreadySaved: 0,
    savedPlaceIds: [],
    statusByIndex: new Map(),
  };

  if (picks.length === 0) return empty;

  // No persisted extraction means there is nothing the server can derive a save from, and no
  // request this client could send that would be authorised. Reported as failed rather than
  // silently swallowed: the user pressed Save and nothing was saved.
  if (extractionId === null) {
    return { ...empty, failed: picks.length };
  }

  // The request carries positions, not facts. Which candidates to save is the user's call — and
  // now genuinely so: this is the selection, not every candidate on screen. What each one *is*
  // comes from the extraction row the probe route wrote. The indices line up because the probe
  // route persisted exactly the array it returned — the same plausibility-filtered candidates,
  // in the same order.
  const items = picks.map(({ candidateIndex, optionIndex }) => ({
    candidateIndex,
    // A position in the shortlist the *server* stored for this candidate, never a place fact.
    // `null` leaves the server's own policy in charge: auto-accept under `preselect`, and the
    // unchanged `llm_guess` path under `confirm` (`chooseResolvedPlace`).
    optionIndex,
    note: null,
  }));

  const res = await fetch('/api/imports/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extractionId, items }),
  });

  if (!res.ok) {
    return { ...empty, failed: items.length };
  }

  const body = (await res.json()) as {
    results: readonly {
      status: ItemStatus;
      candidateIndex: number;
      savedPlaceId?: string;
    }[];
  };

  // `skipped` is now the server's verdict (the model gave this candidate no coordinates), not a
  // client-side filter. `already_saved` counts as saved: the place is in the library either way,
  // and `decideCaptionSaveOutcome` is about whether the save succeeded, not about novelty. It is
  // still counted separately, because "3 saved, 5 were already there" is the honest sentence for
  // a re-import and "8 saved" is not.
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  let alreadySaved = 0;
  const savedPlaceIds: string[] = [];
  const statusByIndex = new Map<number, ItemStatus>();
  for (const result of body.results) {
    statusByIndex.set(result.candidateIndex, result.status);
    if (result.status === 'saved' || result.status === 'already_saved') {
      saved += 1;
      if (result.status === 'already_saved') alreadySaved += 1;
      // Collected so the map can fly to exactly what this import put in the library —
      // including the already-saved ones, which are just as much "the places from this TikTok".
      if (result.savedPlaceId) savedPlaceIds.push(result.savedPlaceId);
    } else if (result.status === 'skipped') skipped += 1;
    else failed += 1;
  }
  return { saved, skipped, failed, alreadySaved, savedPlaceIds, statusByIndex };
}
