/**
 * `ImportEvent` — the event sequence one pipeline run emits (`07` §5, §10; L0-F1-T1). Pure
 * domain code: `runImport` (L0-F1-T3) is an `AsyncGenerator<ImportEvent>` and the streaming route
 * (L0-F6-T1) serialises each event as one NDJSON line. Nothing here knows about `fetch`,
 * `ReadableStream` or Next.js — that translation belongs to `app/api/imports/route.ts`.
 *
 * The shape follows `07` §5's wire diagram exactly, not a superset of it: three real stages
 * (`source`, `extract`, `resolve`), a `started`/`done` pair per stage with the *fact* the rail
 * settles into, one `candidate` progress tick per resolved candidate, `heartbeat`s to keep the
 * connection productive, and exactly one terminal `done` event carrying the whole
 * `ImportOutcome`. There is no `resolve`/`done` stage-event: resolution's completion *is* the
 * terminal `done` event, because `07` §5 never shows one and inventing an unobserved event here
 * is exactly the "speculative abstraction" this vocabulary must not add.
 */

import type { DomainErrorView } from '../errors';
import type { Candidate, ImportId, PlaceId, SourceView } from '../types';

/** The three stages the rail renders (`07` §4). Not `07 §10`'s `imports.stage` DB column, which
 *  also has a `'done'` value for the terminal row state — that is a persistence concept; this is
 *  a wire-event concept, and the two are deliberately not the same type. */
export type PipelineStage = 'source' | 'extract' | 'resolve';

/** The fact each stage settles into, supplied by the server, never a status string (`07` §4):
 *  `Read @handle's video`, `3 places found`. Keyed by stage so a `source`-done event cannot
 *  accidentally carry an `extract` fact. */
export interface StageFact {
  readonly source: { readonly authorHandle: string | null };
  readonly extract: { readonly candidateCount: number };
}

/**
 * Partial success is a shape in the success payload, not a separate outcome kind (`07` §8):
 * exactly one place in the type system expresses "some worked, some didn't".
 *
 * **`kind: 'no_places'` is `NO_PLACES_FOUND` — the modal outcome (~73%, `04` §4), not an error.**
 * It is structurally a member of this union, never of `DomainErrorCode`: nothing about it can be
 * constructed via `domain/errors.ts`, and a `switch` over `DomainErrorCode` that omits it still
 * compiles, because the two unions do not share a type.
 */
export type ImportOutcome =
  | {
      readonly kind: 'ready';
      readonly importId: ImportId;
      readonly source: SourceView;
      readonly candidates: readonly Candidate[];
      /** Set only when every attempted lookup failed with a transport error (`07` §8 rule 3). It
       *  never blocks saving and is not an error. */
      readonly degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null;
    }
  | {
      /** `NO_PLACES_FOUND`: extraction returned zero candidates. A success, not a failure. */
      readonly kind: 'no_places';
      readonly importId: ImportId;
      readonly source: SourceView;
    }
  | { readonly kind: 'already_saved'; readonly importId: ImportId; readonly placeIds: readonly PlaceId[] }
  | { readonly kind: 'failed'; readonly importId: ImportId; readonly error: DomainErrorView };

/**
 * One line of the NDJSON stream. `t` is the wire discriminant (`07` §5 uses `"t"`, not `"type"`,
 * on every example line — kept verbatim so the client and server share one literal).
 */
export type ImportEvent =
  | { readonly t: 'accepted'; readonly importId: ImportId; readonly idempotent: boolean }
  | { readonly t: 'stage'; readonly stage: 'source'; readonly status: 'started' }
  | { readonly t: 'stage'; readonly stage: 'source'; readonly status: 'done'; readonly fact: StageFact['source'] }
  | { readonly t: 'stage'; readonly stage: 'extract'; readonly status: 'started' }
  | { readonly t: 'stage'; readonly stage: 'extract'; readonly status: 'done'; readonly fact: StageFact['extract'] }
  | { readonly t: 'stage'; readonly stage: 'resolve'; readonly status: 'started' }
  /** `Matching locations… {index} of {total}` (UX C18). The denominator is known the instant
   *  extraction returns, so it never guesses (`07` §4). Progress only — the resolved candidate's
   *  data arrives once, in the terminal `done` event's `ImportOutcome`, per `07` §3's "Not chosen,
   *  deliberately": the review surface renders once, on completion. */
  | { readonly t: 'candidate'; readonly index: number; readonly total: number }
  /** Emitted every 2 s to keep the response non-idle (`07` §5, Vercel's HTTP/1.1 note). Carries
   *  no data — it is a liveness signal, distinct from "stage still running". */
  | { readonly t: 'heartbeat' }
  | { readonly t: 'done'; readonly outcome: ImportOutcome };
