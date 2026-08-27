/**
 * Reading `extractions.candidates` back out of `jsonb`, across two schema versions.
 *
 * ## Why this is not one `z.array(RawPlaceCandidateSchema).safeParse(...)`
 *
 * Schema v2 (`extraction/schema.ts`) added `areaHint`, `tags`, `dishes` and `whyGo` with **no
 * `.default()` on any of them**, deliberately: a v1 row must *fail* to parse rather than be
 * silently read as "a v2 extraction that happened to find nothing". That is the right call, and it
 * has a consequence this file exists to handle.
 *
 * `PROMPT_VERSION` moved to `p7-s2`, so the extraction *cache* can never serve a v1 row under a v2
 * key — the probe route looks a row up by `(source_id, model, prompt_version)` and simply misses.
 * `/api/imports/confirm` does not: it looks the row up **by id**, and the id comes from the client,
 * which may be holding one from a probe that ran before the version moved. There are four such rows
 * on the local database right now. Under a single strict parse, every one of them turns the whole
 * confirm request into a 500 — the user presses Save on a review screen they are looking at and
 * loses the lot.
 *
 * So the read is version-aware, and the version is a *result*, not a guess: v2 first, v1 as the
 * fallback, per candidate. Order matters and is not interchangeable — Zod strips unknown keys, so a
 * v2 candidate parses cleanly against the v1 shape (losing the enrichment silently), while a v1
 * candidate cannot parse against v2 at all. Trying v2 first is what makes the fallback safe.
 *
 * ## What a v1 candidate becomes, and the honesty problem in it
 *
 * `PlaceCandidate` has no optional fields, so a v1 candidate must be given `areaHint: null`,
 * `tags: []`, `dishes: []`, `whyGo: null` to exist at all — which is indistinguishable, *in the
 * candidate*, from a v2 extraction whose caption supported nothing. That is exactly the misreading
 * the missing `.default()` was protecting against, and it is why the version does not live in the
 * candidate: `StoredCandidate.schemaVersion` carries it alongside, the confirm route branches on
 * it, and nothing infers "no enrichment available" from an empty array.
 *
 * The rule the rest of the pipeline follows from that:
 *
 *  - **v2** — write whatever enrichment there is; empty is a real, recorded answer.
 *  - **v1** — write no enrichment at all, and say `unavailable_v1` in the response rather than
 *    reporting an empty success. The place is still saved: an old extraction id is a reason to lose
 *    the extras, never a reason to lose the save.
 */

import { z } from 'zod';

import { RawPlaceCandidateSchema, toPlaceCandidate } from '../extraction/schema';
import type { PlaceCandidate } from '../types';

/**
 * Which shape the stored row actually had. Not `EXTRACTION_SCHEMA_VERSION`'s counterpart by
 * coincidence — it is the same number, and when v3 lands this union gains a member and every
 * `switch` on it that forgot to grows a compile error.
 */
export type StoredSchemaVersion = 1 | 2;

/** One stored candidate plus the schema it was written under. The pairing is the point: see this
 *  file's header for why the version cannot be inferred from the candidate's own fields. */
export interface StoredCandidate {
  readonly candidate: PlaceCandidate;
  readonly schemaVersion: StoredSchemaVersion;
}

/**
 * The v1 candidate shape, derived from the v2 one by removing exactly the four fields v2 added.
 *
 * Derived rather than restated so there is no second copy of `rawName`'s bounds, the category
 * enum, or the coordinate ranges to drift. A hand-written v1 schema would be a frozen fork of a
 * file that is still moving.
 */
const V1RawCandidateSchema = RawPlaceCandidateSchema.omit({
  areaHint: true,
  tags: true,
  dishes: true,
  whyGo: true,
});

export type StoredCandidatesOutcome =
  | { readonly kind: 'ok'; readonly candidates: readonly StoredCandidate[] }
  /** Neither shape parsed. The row is corrupt or from a future schema — an internal fault, not a
   *  caller fault, and the confirm route answers 500 rather than saving something half-understood. */
  | { readonly kind: 'invalid'; readonly cause: unknown };

/**
 * Parses one stored `candidates` array. `null`/absent is a legal, empty extraction (the "no places
 * found" outcome, which `mvp-plan.md` calls the modal one) and yields `kind: 'ok'` with no
 * candidates — not an error.
 *
 * Per element rather than per array: a mixed array should not exist (the cache key pins the version
 * for the whole row), but "should not exist" is not a reason for one odd element to cost the user
 * every other save in the request.
 */
export function parseStoredCandidates(raw: unknown): StoredCandidatesOutcome {
  const asArray = z.array(z.unknown()).safeParse(raw ?? []);
  if (!asArray.success) return { kind: 'invalid', cause: asArray.error };

  const candidates: StoredCandidate[] = [];

  for (const element of asArray.data) {
    const v2 = RawPlaceCandidateSchema.safeParse(element);
    if (v2.success) {
      candidates.push({ candidate: toPlaceCandidate(v2.data), schemaVersion: 2 });
      continue;
    }

    const v1 = V1RawCandidateSchema.safeParse(element);
    if (v1.success) {
      candidates.push({
        // Through the same `toPlaceCandidate` every other read path uses: the four v2 fields are
        // filled with their empty values *here*, at the one seam that knows they are absent rather
        // than measured, and `schemaVersion: 1` beside them is what stops that being a lie.
        candidate: toPlaceCandidate({ ...v1.data, areaHint: null, tags: [], dishes: [], whyGo: null }),
        schemaVersion: 1,
      });
      continue;
    }

    // Report the *v2* failure. It is the one a developer needs: "this row is not v2 either" is
    // noise once we already know it is not v1.
    return { kind: 'invalid', cause: v2.error };
  }

  return { kind: 'ok', candidates };
}
