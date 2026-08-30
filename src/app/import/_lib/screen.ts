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
 * **W6-3** adds `PAYOFF_HOLD_MS` beside `RAIL_IDLE`. **W6-5** changes the `no_places` variant to
 * `{ kind: 'no_places'; probe: ProbeSuccess }` (`spec-no-places-found.md` §10.1).
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
  post: null,
};

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
  | {
      readonly kind: 'no_places';
      readonly authorHandle: string | null;
      /** The canonical URL, never the `url` state: a share-sheet paste is a caption with a link
       *  somewhere inside it, and `Open the original TikTok` has to be an href. */
      readonly canonicalUrl: string;
      /** Whether there was a caption to read at all. "We read it and it named nothing" and "there
       *  was nothing to read" are different facts and this screen says which. */
      readonly hadCaption: boolean;
    }
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
   * type system rather than by a default branch. `rawCode` keeps whatever the server actually
   * sent, purely so a support conversation can quote it — the two are identical for all 14 real
   * codes, and differ only when something outside the taxonomy answered.
   */
  | {
      readonly kind: 'probe_error';
      readonly code: DomainErrorCode;
      readonly rawCode: string;
      readonly retryable: boolean;
    };
