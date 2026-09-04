/**
 * Which screen the import flow is showing, and the rail's state while it works.
 *
 * **A client module, despite the `_lib` folder** — see `probe-contract.ts`'s header.
 *
 * Lifted verbatim out of `import-page-client.tsx` (its lines 152-218) by W6-1. This is the union
 * `import-page-client.tsx` routes on and the shape every screen under `../screens/` is handed a
 * slice of; it lives apart from the shell because three of Wave 6's packages widen it and would
 * otherwise all be edits to the same 2,300-line file.
 *
 */

import type { DomainErrorCode } from '@/domain/errors';
import type { PreSubmitErrorCode } from '@/ui/import/import-error-copy';

import type { ProbeSuccess, SourcePreview } from './probe-contract';

/* ------------------------------------------------------------------------------------------- *
 * Local state — modelled after the real event vocabulary so the eventual stream consumer is a
 * drop-in swap.
 * ------------------------------------------------------------------------------------------- */

export type StageStatus = 'pending' | 'active' | 'done';

export interface RailState {
  readonly source: StageStatus;
  readonly extract: StageStatus;
  readonly resolve: StageStatus;
  readonly sourceFact: string | null; // C10
  readonly extractFact: string | null; // C13/C14/C15
  readonly candidateProgress: { readonly index: number; readonly total: number } | null; // C18
  /**
   * The candidate count `extractFact` was built from, or `null` before the probe has answered.
   *
   * Both come from `ui/import/rail-extract-fact.ts` and are set in the same statement, so the
   * sentence and the number the rail counts up to cannot disagree — `1 places found` is the drift
   * this field would otherwise invite, and it is invisible to anyone testing with three candidates.
   */
  readonly extractCount: number | null;
  /**
   * The post itself, once `/api/imports/source-preview` has actually answered — never before, and
   * never inferred from anything (W6-2).
   *
   * This is the field that makes the rail worth watching: oEmbed answers in under a second and the
   * model call behind the probe measured 7-34s, so for that whole wait the screen can show the
   * thumbnail, the `@handle` and the caption of the post the user just pasted. `null` means the
   * preview has not landed — either it is still in flight, or it failed, and a rail with a
   * `source` stage still reading `active` is the honest rendering of both. Nothing here may be
   * filled in from the pasted URL or from a timer.
   */
  readonly post: SourcePreview | null;
}

export const RAIL_IDLE: RailState = {
  source: 'pending',
  extract: 'pending',
  resolve: 'pending',
  sourceFact: null,
  extractFact: null,
  candidateProgress: null,
  extractCount: null,
  post: null,
};

/**
 * How long the settled payoff stays on screen before the landing screen replaces it (W6-3).
 *
 * `3 places found` was computed and overwritten on the next statement, so React batched the two
 * into one commit and **the fact the whole wait was for rendered for zero frames.** This is the
 * dwell that makes it a beat.
 *
 * **It holds a fact the server actually sent**, which is the whole reason it is allowed: nothing
 * about the rail's claims changes, only how long the true one is legible. A timer that *advanced*
 * a stage would be the opposite thing and is forbidden (`facelift-plan.md` §4 decision 4).
 *
 * **It applies at every count, including zero** (`overnight-copy-deck.md` §9.2, binding). The
 * counting component does not mount at zero — a tick from 0 to 0 is the product animating nothing —
 * but the hold does, so the modal outcome of an import arrives on the same beat, at the same pace,
 * as a success, and only the true sentence differs. Rushing to it is how the most common outcome
 * starts reading as the failure mode.
 *
 * 700ms against `count.tick`'s 400ms: the climb finishes with time to be read as a settled result
 * rather than cutting away mid-count.
 */
export const PAYOFF_HOLD_MS = 700;

/** The screens this page can be in. `paste` covers both the empty field and an inline-invalid
 *  field (C06) — that is copy, not a screen change. */
export type Screen =
  | { readonly kind: 'paste' }
  /**
   * The pre-submit verdict: `canonicaliseTikTokUrl` rejected the pasted string on the client, so
   * no request was made. Three of the taxonomy's codes, and they render the **same** copy the
   * server's version of that verdict would (`ui/import/import-error-copy.ts`) — see
   * `PRE_SUBMIT_ERROR_CODES` for why that was not true before.
   */
  | { readonly kind: 'redirect'; readonly reason: PreSubmitErrorCode }
  | { readonly kind: 'rail'; readonly rail: RailState }
  /**
   * The modal outcome of an import — ~73% of them at LEVEL B's hit rate — and a success state,
   * never an error.
   *
   * It carries the **whole** `ProbeSuccess` (`spec-no-places-found.md` §10.1). It used to carry
   * three scalars pulled out of it, which could not express the three honest cases (no caption /
   * nothing named / an area but no venue) and could not feed the caption panel or a search scoped
   * to the city. Every one of those needs a different field of the same response, and copying them
   * out one at a time is how the screen and the review screen end up disagreeing about the post
   * they are both describing. The canonical URL in particular must come from here and never from
   * the `url` state: a share-sheet paste is a caption with a link somewhere inside it.
   */
  | { readonly kind: 'no_places'; readonly probe: ProbeSuccess }
  /** The real-fetch slice's landing screen (this task): no LLM has run, so this is deliberately
   *  not `no_places` or `results` — both of those imply extraction happened. Shows the raw
   *  caption plainly, once the real `SourceAdapter` + `ContentExtractor` have run. */
  | { readonly kind: 'caption_preview'; readonly probe: ProbeSuccess }
  /**
   * A thrown `DomainError` from the probe route, rendered from the one client-side copy map
   * (`ui/import/import-error-copy.ts`) that `07` §9 specifies.
   *
   * `code` is a `DomainErrorCode`, not a `string`, and that is the whole point: it is narrowed
   * once at the fetch seam by `toDomainErrorCode`, so the screen's copy lookup is total by the
   * type system rather than by a default branch.
   *
   * **There was a `rawCode` beside it**, holding whatever the server actually sent, and it existed
   * "purely so a support conversation can quote it" — which the failure screen printed as
   * `Reference: POST_UNAVAILABLE`. That line came off the screen on 2026-08-31 (Q1 finding S6: a
   * raw enum is `voice-and-vocabulary.md` §4's machinery vocabulary, and a code shared by every
   * user who hits that failure correlates to nothing anyway), and the field went with it rather
   * than being kept as data nothing reads. What the server sent is not lost: the route writes one
   * structured `console.error` per failure carrying the code, the stage and the import id, which is
   * where `07` §7.1 puts the correlation id in the first place.
   */
  | {
      readonly kind: 'probe_error';
      readonly code: DomainErrorCode;
      readonly retryable: boolean;
    };
