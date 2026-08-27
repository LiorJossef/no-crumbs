/**
 * The `/api/imports/confirm` request contract.
 *
 * This schema used to carry the place itself — `provider`, `providerPlaceId`, `name`, `lat`, `lng`,
 * `category`, `countryCode` — and the route passed those values to `resolve_place` on a
 * service-role client. That made the browser the authority on shared `places` rows and was
 * exploitable: see `candidate-place.ts`'s header for the confirmed attack and the reasoning.
 *
 * The contract is now a **reference plus the user's own contribution**, and nothing else:
 *
 *  - `extractionId` — the `extractions` row the server wrote during the probe. The route
 *    authorises it by requiring the caller to own an `imports` row for that extraction's source,
 *    which is checked through the *user's* client so RLS enforces it rather than application code.
 *  - `candidateIndex` — a position in that row's stored `candidates` array. Every place fact is
 *    derived from `candidates[candidateIndex]` by `derivePlaceSave`.
 *  - `optionIndex` — a position in *that candidate's* stored resolver shortlist, added by
 *    TLV-RESOLVE-T3. Also a reference and never a fact; see the field's own comment.
 *  - `note` — genuinely the user's, the one field they author.
 *
 * A malicious body can now do exactly two things: name an extraction it does not own (rejected),
 * or name an index — candidate or option — that does not exist (rejected per item). Neither can
 * write a fact.
 *
 * The 20-item cap is unchanged and stays below `ExtractionResultSchema`'s own 12-candidate ceiling,
 * so it can never be the binding limit — it is there to bound the request, not the extraction.
 */

import { z } from 'zod';

const ConfirmItemSchema = z.object({
  /**
   * Index into the stored extraction's `candidates` array. The upper bound mirrors
   * `ExtractionResultSchema`'s `max(12)` — an index of 12 or more cannot address a stored
   * candidate under any extraction this system can produce, so it is a schema error rather than a
   * per-item failure.
   */
  candidateIndex: z.number().int().min(0).max(11),
  /**
   * Which entry of that candidate's **stored** resolver shortlist to save, or `null` for "use the
   * server's own default".
   *
   * Still a reference, not a fact, and that is the whole design: the shortlist lives in
   * `extractions.candidates` where only a service-role write can have put it
   * (`import/resolution-record.ts`), so this number selects among options the server already
   * committed to. It cannot introduce a name, a coordinate or a provider id, which is the property
   * the request contract exists to keep.
   *
   * It exists because a `confirm`-band resolution is deliberately **not** auto-accepted: the
   * shortlist is real but the scorer cannot separate the entries, and taking the top one silently
   * is the uncertainty-into-certainty failure this product cannot afford. Sending nothing keeps
   * today's behaviour exactly — `preselect` auto-accepts its top entry, everything else falls back
   * to the model's own coordinate with `llm_guess` provenance.
   *
   * The bound mirrors `ResolveQuery.maxResults`' default of 5, doubled: no shortlist this system
   * produces is longer, so an index past it is a schema error rather than a per-item failure.
   */
  optionIndex: z.number().int().min(0).max(9).nullable().default(null),
  /** The user's own note. The only field in this request the user authors. */
  note: z.string().max(2000).nullable(),
});

export const ConfirmImportRequestSchema = z.object({
  extractionId: z.string().uuid(),
  items: z.array(ConfirmItemSchema).min(1).max(20),
});

export type ConfirmImportRequest = z.infer<typeof ConfirmImportRequestSchema>;
export type ConfirmItem = z.infer<typeof ConfirmItemSchema>;
