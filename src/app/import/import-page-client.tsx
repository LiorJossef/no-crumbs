'use client';

/**
 * S6 `/import` — the paste screen, the three-stage rail, the no-places screen (a success state,
 * never an error), the results/review screen, and the non-TikTok redirect. `docs/mvp-plan.md` §5
 * (L0-F1-T1/T2/T3) and `docs/execution-plan.md` L1-F2-T1/T2 spec this surface; copy strings are
 * `docs/ux-architecture.md` §12.1's deck (C01–C22), quoted verbatim.
 *
 * The real flow: `submit()` calls `POST /api/imports/probe` (real oEmbed fetch + caption
 * extraction + `PlaceExtractor` + the real `PlaceResolver` — see that route's header) and lands on
 * `caption_preview`; "Done" there calls `POST /api/imports/confirm` via `saveExtractedCandidates`.
 * Each candidate arrives with the resolver's stored shortlist attached, and the review screen's
 * picker (`ui/import/candidate-resolution-view.ts`) is how a `confirm`-band candidate gets an
 * answer — without it, that whole band silently saved the model's guessed coordinate.
 * The `no_places`/`results` `Screen` kinds and their `NoPlacesScreen`/`ResultsScreen` components
 * predate this real wiring and are currently unreachable from this file (no code path sets them);
 * they are kept as the shape L0-F6-T1's real streaming route is expected to drive, rather than
 * deleted ahead of that work.
 *
 * The one piece of real domain logic wired up live beyond the above is `canonicaliseTikTokUrl`
 * (`domain/source/canonicalise-tiktok-url.ts`) against the pasted string, so the paste screen's
 * validation and the non-TikTok redirect are the real classification, not a stub.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  Crosshair,
  EyeOff,
  ImageOff,
  Link2,
  Link2Off,
  Loader2,
  LockKeyhole,
  MapPin,
  MapPinOff,
  MessageSquareOff,
  RotateCcw,
  SearchCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import type { PipelineStage } from '@/domain/import/events';
import { googleMapsSearchUrl } from '@/domain/places/google-maps-search-url';
import { decideCaptionSaveOutcome, type CaptionSaveResult } from '@/domain/import/caption-save-outcome';
import {
  LOCATION_CAVEAT,
  candidateMeta,
  candidateProvenance,
  candidateTitle,
  isHashtagOnly,
  isSaveable,
  locationLine,
  saveButtonLabel,
  showsEvidence,
  skippedNotice,
} from '@/domain/import/candidate-presentation';
import type { StoredResolution } from '@/domain/import/resolution-record';
import {
  effectivePick,
  pickRequiredNotice,
  resolutionChip,
  resolutionExplanation,
  resolutionHeadline,
  resolutionOptions,
  resolutionView,
  resolverPinLine,
  willSave,
  type CandidateResolutionView,
} from '@/ui/import/candidate-resolution-view';
import type { Candidate, PlaceCandidate } from '@/domain/types';
import type { DomainErrorCode } from '@/domain/errors';
import {
  COPY_LINK_INSTRUCTION,
  IMPORT_ERROR_ACTION_LABEL,
  IMPORT_ERROR_COPY,
  importErrorActions,
  toDomainErrorCode,
  type ImportErrorAction,
  type ImportErrorIcon,
  type PreSubmitErrorCode,
} from '@/ui/import/import-error-copy';

/* ------------------------------------------------------------------------------------------- *
 * `/api/imports/probe` — the throwaway route wired in ahead of the real streaming route
 * (L0-F6-T1). Proves the real oEmbed fetch + caption extraction reach this screen: no LLM, no
 * candidates, no `runImport`. See `src/app/api/imports/probe/route.ts`'s header.
 * ------------------------------------------------------------------------------------------- */

interface ProbeSuccess {
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
type ProbeCandidate = PlaceCandidate & { readonly resolution: StoredResolution | null };

interface ProbeErrorBody {
  readonly error: { readonly code: string; readonly retryable: boolean };
}

/* ------------------------------------------------------------------------------------------- *
 * Local state — modelled after the real event vocabulary so the eventual stream consumer is a
 * drop-in swap.
 * ------------------------------------------------------------------------------------------- */

type StageStatus = 'pending' | 'active' | 'done';

interface RailState {
  readonly source: StageStatus;
  readonly extract: StageStatus;
  readonly resolve: StageStatus;
  readonly sourceFact: string | null; // C10
  readonly extractFact: string | null; // C13/C14/C15
  readonly candidateProgress: { readonly index: number; readonly total: number } | null; // C18
}

const RAIL_IDLE: RailState = {
  source: 'pending',
  extract: 'pending',
  resolve: 'pending',
  sourceFact: null,
  extractFact: null,
  candidateProgress: null,
};

/** The screens this page can be in. `paste` covers both the empty field and an inline-invalid
 *  field (C06) — that is copy, not a screen change. */
type Screen =
  | { readonly kind: 'paste' }
  /**
   * The pre-submit verdict: `canonicaliseTikTokUrl` rejected the pasted string on the client, so
   * no request was made. Three of the taxonomy's codes, and they render the **same** copy the
   * server's version of that verdict would (`ui/import/import-error-copy.ts`) — see
   * `PRE_SUBMIT_ERROR_CODES` for why that was not true before.
   */
  | { readonly kind: 'redirect'; readonly reason: PreSubmitErrorCode }
  | { readonly kind: 'rail'; readonly rail: RailState }
  | { readonly kind: 'no_places'; readonly authorHandle: string | null }
  | { readonly kind: 'results'; readonly authorHandle: string | null; readonly candidates: readonly Candidate[] }
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

/* ------------------------------------------------------------------------------------------- *
 * Component
 * ------------------------------------------------------------------------------------------- */

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

export interface ImportPageClientProps {
  /** Set when this component is rendered as an overlay on top of the persistent map
   *  (`map-page-client.tsx`'s "Add a TikTok" flow) rather than mounted at the standalone `/import`
   *  route. Swaps the full-viewport (`min-h-dvh`) shell for one that fills its (absolutely
   *  positioned) overlay container instead, and swaps the close affordance from a real navigation
   *  (`<Link href="/map">`, which would unmount the map) to a plain state-closer. Omitting this
   *  prop preserves the standalone route's exact behaviour — direct navigation and a mid-import
   *  refresh still land on this same component via `/import`'s page. */
  readonly onClose?: () => void;
  /** Called once, just before this overlay closes, when a "Done" actually saved something. The
   *  map owner (`map-page-client.tsx`) uses it to frame the new pins and confirm the save. */
  readonly onSaved?: (detail: SaveOutcomeDetail) => void;
}

export function ImportPageClient({ onClose, onSaved }: ImportPageClientProps = {}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: 'paste' });
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  /** The caption-preview screen's own save-in-flight state (the real "Done" path, this task).
   *  Kept out of `Screen` itself: a save failure re-shows the *same* `caption_preview` screen with
   *  an inline error, never a screen transition — `Screen`'s union is about which layout renders,
   *  not this one screen's transient network state. */
  const [captionSave, setCaptionSave] = useState<{
    readonly saving: boolean;
    readonly error: string | null;
    /** Set only for `partial_failure` (some candidates saved, some didn't) — the screen stays put
     *  with this notice and an explicit "Continue to map" action rather than auto-navigating, so
     *  the which/how-many-failed message is never lost to an immediate unmount. */
    readonly partialNotice: string | null;
    /** Set alongside `partialNotice`: which card ended up where, so "2 couldn't be saved" can be
     *  read off the list instead of leaving the user to guess which two. */
    readonly statusByIndex: ReadonlyMap<number, ItemStatus> | null;
  }>({
    saving: false,
    error: null,
    partialNotice: null,
    statusByIndex: null,
  });

  /** The last save's detail, kept so `continueAfterPartialSave` — which runs on a *later* click,
   *  after the message has been read — can still tell the map what landed. */
  const lastSaveDetail = useRef<SaveOutcomeDetail | null>(null);

  const validation = useMemo(() => canonicaliseTikTokUrl(url), [url]);
  /**
   * Which of the canonicaliser's four verdicts the pasted string got, or `null` if it is valid.
   *
   * `07` §9 splits these two ways and the screen must too: **`MALFORMED_URL` alone** is F1 inline
   * field copy (C06, "That doesn't look like a TikTok link."); `UNSUPPORTED_HOST`,
   * `UNSUPPORTED_URL` and `PHOTO_POST` each get their own screen, because they are *recognised*
   * links carrying different news.
   *
   * This used to be one boolean, and it produced two bugs at once. `canSubmit` required
   * `validation.ok`, so the `Add →` button was **disabled** for all four verdicts — which made
   * `submit()`'s entire redirect branch dead code, and with it the three pre-submit screens. And
   * `showInvalid` fired on all four, so pasting an Instagram link, a TikTok profile link or a
   * photo post put "That doesn't look like a TikTok link." under the field. An Instagram URL does
   * look like a link, and a TikTok profile URL is unambiguously a TikTok link; C06 is the one
   * sentence that is false for every one of those three.
   */
  const invalidCode = validation.ok ? null : validation.error.code;
  const showInvalid = touched && url.trim().length > 0 && invalidCode === 'MALFORMED_URL';
  // Anything non-empty may be submitted. `submit()` already routes all four verdicts correctly —
  // inline for `MALFORMED_URL`, a screen for the other three, the network for a valid link.
  const canSubmit = url.trim().length > 0;

  /**
   * The probe request currently in flight, or `null`. A ref rather than state, and it does three
   * jobs that all turned out to be the same bug:
   *
   *  - **`Cancel` actually cancels.** `RailScreen`'s `Cancel` was `reset()`, which cleared the
   *    field and went back to paste while the request carried on running. It then resolved and
   *    took the screen — a `1 place found` review for an import the user had already abandoned,
   *    or a failure screen for one they no longer cared about.
   *  - **A response that lost its race is not news.** Every `setScreen` below is now gated on this
   *    ref still pointing at *this* request. Cancel, then paste an Instagram link: the correct
   *    "That link isn't a TikTok." screen used to be replaced a second later by the previous
   *    TikTok's results.
   *  - **One paste costs at most one request.** Set synchronously, before the first `await`, so a
   *    burst of clicks dispatched inside a single task — which `Add →` and `Retry` were both
   *    reachable by — finds it non-null and returns. A rendering accident (the paste screen
   *    unmounting) was the only thing stopping a second fire before, and this route spends a model
   *    call against a hard 500/day ceiling.
   *
   * Deliberately a guard that *refuses* a concurrent submit rather than one that aborts the
   * previous and starts a new one: five clicks would still dispatch five requests that way, four
   * of them cancelled server-side too late to matter.
   */
  const inFlightProbe = useRef<AbortController | null>(null);

  /** Cancels the probe request, if any, and gives up ownership of the screen for it. Both halves
   *  matter: the abort stops the work, and clearing the ref is what makes the in-flight handlers
   *  below fall through without setting state. */
  function abortInFlightProbe() {
    inFlightProbe.current?.abort();
    inFlightProbe.current = null;
  }

  function reset() {
    abortInFlightProbe();
    setScreen({ kind: 'paste' });
    setUrl('');
    setTouched(false);
    setCaptionSave({ saving: false, error: null, partialNotice: null, statusByIndex: null });
  }

  async function submit() {
    setTouched(true);
    if (!validation.ok) {
      // UNSUPPORTED_HOST/PHOTO_POST/UNSUPPORTED_URL are all "a recognised link, not a failure" —
      // their own screen, sharing the server's copy for the same verdict. MALFORMED_URL stays on
      // the paste screen: `setTouched(true)` above is what reveals C06 under the field, which is
      // `07` §9's F1-inline treatment and the only code that gets it.
      if (validation.error.code !== 'MALFORMED_URL') {
        setScreen({ kind: 'redirect', reason: validation.error.code as PreSubmitErrorCode });
      }
      return;
    }

    // A real TikTok link: `/api/imports/probe` is one round trip that now runs the real oEmbed
    // fetch, the real caption extraction *and* the real `PlaceExtractor` call before it responds
    // (`route.ts`'s header) — there is no server-sent boundary between "source done" and
    // "extraction started". oEmbed + caption parsing is sub-second next to a real local-model
    // call (7-34s measured), so the honest approximation is: show `source` active for the
    // request's very first tick, then flip to `source: done, extract: active` right after the
    // fetch is *issued* (not after it resolves) — the rail's `extract` step then genuinely spans
    // the real, multi-second wall-clock time the request is in flight, rather than flashing for
    // 0ms after the response already arrived.
    // The in-flight guard. Synchronous, and ahead of every `await` in this function, so a second
    // call dispatched in the same task sees it — see `inFlightProbe`.
    if (inFlightProbe.current !== null) return;
    const probe = new AbortController();
    inFlightProbe.current = probe;

    /** Is this call still the one that owns the screen? False after a `Cancel` (which aborts and
     *  clears the ref) and after any later submit took over. A response that lost its race must
     *  set no state at all — not a screen, not an error. */
    const stillCurrent = () => inFlightProbe.current === probe;

    setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } });

    try {
      const fetchPromise = fetch('/api/imports/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: probe.signal,
      });

      setScreen({
        kind: 'rail',
        rail: { ...RAIL_IDLE, source: 'done', sourceFact: 'Read the TikTok', extract: 'active' },
      });

      const res = await fetchPromise;
      const body = (await res.json()) as ProbeSuccess | ProbeErrorBody;
      if (!stillCurrent()) return;

      if (!res.ok || 'error' in body) {
        const rawCode = 'error' in body ? body.error.code : 'INTERNAL';
        const retryable = 'error' in body ? body.error.retryable : true;
        setScreen({ kind: 'probe_error', code: toDomainErrorCode(rawCode), rawCode, retryable });
        return;
      }

      const n = body.candidates.length;
      setScreen({
        kind: 'rail',
        rail: {
          ...RAIL_IDLE,
          source: 'done',
          sourceFact: body.authorHandle ? `Read @${body.authorHandle}'s TikTok` : 'Read the TikTok',
          extract: 'done',
          extractFact: n === 0 ? 'No places named' : n === 1 ? '1 place found' : `${n} places found`,
        },
      });
      setScreen({ kind: 'caption_preview', probe: body });
    } catch {
      // A user pressing Cancel is not an internal error. An abort lands here as a DOMException,
      // and so does any response that arrived after this call stopped owning the screen — both
      // are `!stillCurrent()`, and both must leave the screen exactly as the user left it.
      if (!stillCurrent()) return;
      // The network layer failed before any `DomainError` existed — no code came off the wire, so
      // `INTERNAL` is ours to assert (`07` §9's floor), not a fallback for an unrecognised code.
      setScreen({ kind: 'probe_error', code: 'INTERNAL', rawCode: 'INTERNAL', retryable: true });
    } finally {
      // Only if we still own it: a `Cancel` or a later submit has already replaced the ref, and
      // clearing it here would unlock a guard that is legitimately held by someone else.
      if (stillCurrent()) inFlightProbe.current = null;
    }
  }

  /**
   * The real save path (`POST /api/imports/confirm`, L0-F4-T3) wired onto `ResultsScreen`'s
   * "Save →" button — currently unreachable, see this file's header. Only `status: 'resolved'`
   * candidates have a single `ResolvedPlace` to confirm
   * — `ambiguous` (pick one of several options) and `unresolved` (nothing to save) are not this
   * task's scope and are silently skipped here, matching `ConfirmImportRequestSchema`'s own
   * comment that a candidate with no single place never reaches this endpoint.
   *
   * `sourceId: null`: this path (and the `results`/`no_places` screens it serves) predates the real
   * streaming route and currently has no live caller in this file — there is no real `sources.id`
   * row to link. Passing `null` is the honest state of the data available here — `save_place`
   * treats it as a manual save — rather than inventing a fake uuid that would fail the `sources`
   * foreign key. Real provenance linking arrives with L0-F6-T1, when this screen's candidates come
   * from an actual import.
   */
  async function saveConfirmedCandidates(candidates: readonly Candidate[]) {
    const items = candidates
      .filter((c) => c.resolution.status === 'resolved')
      .map((c) => {
        const { place, confidence } = c.resolution as Extract<Candidate['resolution'], { status: 'resolved' }>;
        const countryHint = c.candidate.countryHint;
        return {
          provider: place.provider,
          providerPlaceId: place.providerPlaceId,
          sourceDataset: place.sourceDataset,
          name: place.name,
          category: c.candidate.categoryHint,
          providerCategory: place.providerCategory,
          addressLine: place.addressLine,
          locality: place.locality,
          countryCode: countryHint && /^[A-Z]{2}$/.test(countryHint) ? countryHint : null,
          lat: place.lat,
          lng: place.lng,
          resolutionScore: confidence.score,
          note: null,
        };
      });

    if (items.length === 0) return;

    try {
      await fetch('/api/imports/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: null, items }),
      });
    } catch {
      // Best-effort for this not-yet-live path: no dedicated error UI exists here yet (the same
      // minimal-fidelity gap `ProbeErrorScreen`'s header notes for the real flow). A failed save
      // is not silently claimed as a success anywhere else in this file, but there is no "confirm
      // failed" state wired up here either — a follow-up, once this path is fed by the real
      // streaming route (L0-F6-T1) instead of sitting unreachable.
    }
  }

  /**
   * The real caption-preview screen's "Done" save (this task, L0-F4-T3 follow-up). Unlike
   * `saveConfirmedCandidates` above, these `PlaceCandidate`s never went through `PlaceResolver` —
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
   * manual entry, which this screen never produces (`saveConfirmedCandidates` above is the
   * currently-unreachable path without a real source yet).
   */
  async function saveExtractedCandidates(
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

  /** After a successful (or nothing-to-save) "Done": land on/near the map with the save visible.
   *  `router.refresh()` re-runs `MapPage`'s server component and its `getSpots()` query — the
   *  overlay case (`onClose` set) is already mounted on `/map`, so refreshing *is* how the newly
   *  saved place reaches `MapPageClient`'s props; the standalone `/import` route case additionally
   *  needs the navigation itself. Doing both, in both cases, is cheap and avoids depending on
   *  which one this render happens to be. */
  function backToMapWithFreshData(detail: SaveOutcomeDetail | null) {
    // Handed up *before* the overlay unmounts, so the map can frame the new pins and say what
    // landed. Without this the import was invisible: eight London places saved into a Tel Aviv
    // library left the camera untouched and nothing on screen to say the save had happened.
    if (detail && detail.saved > 0) onSaved?.(detail);
    if (onClose) {
      router.refresh();
      onClose();
    } else {
      router.push('/map');
      router.refresh();
    }
  }

  /** Leaving the flow with nothing to save — the failure screens' way out. Same two cases as
   *  `backToMapWithFreshData` (overlay closes in place, standalone route navigates), without the
   *  `router.refresh()`: no save happened, so there is no new server data to pull. */
  function backToMap() {
    leaveImport();
  }

  /**
   * Every way out of this flow that is not `reset()`: the overlay's ✕ and the failure screens'
   * `Back to the map`. It aborts first, for the same reason `Cancel` does — the ✕ is reachable
   * during the rail, and an overlay that unmounts while its request is still running leaves that
   * request to resolve into a component that is no longer on screen.
   */
  function leaveImport() {
    abortInFlightProbe();
    if (onClose) onClose();
    else router.push('/map');
  }

  /**
   * `decideCaptionSaveOutcome` (`domain/import/caption-save-outcome.ts`) turns the raw
   * `{ saved, skipped, failed }` counts into exactly one disposition — see that module's header
   * for why all four cases exist and what each one covers. `partial_failure` deliberately does
   * *not* navigate here: some of the save is real, persisted data, and the failed count would be
   * lost the instant this screen unmounts, so it stays put with `continueAfterPartialSave` as the
   * explicit next step, mirroring the same on-screen-with-a-message pattern `hard_failure` (and,
   * before this fix, only `hard_failure`) already used.
   */
  async function finishCaptionPreview(
    picks: readonly CandidatePick[],
    extractionId: string | null,
  ) {
    setCaptionSave({ saving: true, error: null, partialNotice: null, statusByIndex: null });
    try {
      const result = await saveExtractedCandidates(picks, extractionId);
      lastSaveDetail.current = result;
      const outcome = decideCaptionSaveOutcome(result);
      switch (outcome.kind) {
        case 'proceed':
          backToMapWithFreshData(result);
          reset();
          return;
        case 'skip_only':
        case 'hard_failure':
          setCaptionSave({ saving: false, error: outcome.message, partialNotice: null, statusByIndex: null });
          return;
        case 'partial_failure':
          setCaptionSave({
            saving: false,
            error: null,
            partialNotice: outcome.message,
            statusByIndex: result.statusByIndex,
          });
          return;
      }
    } catch {
      setCaptionSave({
        saving: false,
        error: "Couldn't save that place — try again.",
        partialNotice: null,
        statusByIndex: null,
      });
    }
  }

  /** The explicit "Continue to map" action shown only after a `partial_failure` — the successful
   *  saves are real, so this proceeds exactly like a clean success once the user has seen the
   *  which/how-many-failed message. */
  function continueAfterPartialSave() {
    backToMapWithFreshData(lastSaveDetail.current);
    reset();
  }

  return (
    <main
      className={cn(
        'relative flex w-full flex-col overflow-hidden',
        // z-50: above `PlaceSheet`'s vaul-portaled drawer (`z-40`, appended to `document.body`
        // after this tree, so it would otherwise paint on top of an equal z-index regardless of
        // JSX order) and above `PlaceDesktopPanel` (`z-20`) — the overlay must win the stack on
        // both surfaces, not just the one that happens to share DOM order with it.
        // `h-dvh`, not `min-h-dvh`, on the standalone route too: the review screen keeps its
        // primary action in a footer pinned to the bottom of this column, and a column that grows
        // with its content pushes that action off the bottom of a phone. A bounded height makes
        // the candidate list the only scrolling region, which is the whole point of the layout.
        onClose ? 'absolute inset-0 z-50 h-full' : 'h-dvh',
        // Desktop (`lg+`) in overlay mode: this is no longer a right-docked full-height panel —
        // it is a dimming scrim over the *whole* viewport (map + the always-visible places list
        // both read as backgrounded context) with a single centred, capped-height card floating
        // on top. `<main>` itself becomes the flex-centring context and the scrim; the inner div
        // below is the card. Mobile is untouched — these are all `lg:` additions.
        onClose && 'lg:flex lg:items-center lg:justify-center lg:overflow-y-auto lg:bg-foreground/35 lg:p-10 lg:backdrop-blur-[2px]',
      )}
    >
      {/* The gradient backdrop, split out from `<main>` itself: at `lg+` in overlay mode
          (`onClose` set), this must NOT paint over the whole viewport, or it hides the live map
          this screen is supposed to float over. Hidden at `lg:` only when `onClose` (overlay) —
          `<main>` supplies its own dim scrim above instead. The mobile takeover and the standalone
          `/import` route (no map behind it, `onClose` unset) keep the full-bleed gradient. */}
      <div
        aria-hidden
        className={cn('absolute inset-0 -z-10', onClose && 'lg:hidden')}
        // `--brand-wash` (globals.css) rather than the gradient literal that used to be inlined
        // here. It was byte-identical to sign-in's and to the landing page's; three copies of one
        // surface decision is three places to miss when the dark-mode repass lands.
        style={{ background: 'var(--brand-wash)' }}
      />
      {/* Failure replaces the whole screen with news the user did not ask for. Announced the way
          `/map` already announces its filtered result count (`useResultAnnouncement` → one
          `sr-only` polite region): rendered here, once, and always mounted — a live region created
          in the same commit as its first message is not reliably announced. It carries the body
          sentence only; the headline is read by the focus move onto it inside
          `ImportFailureScreen`, so nothing is said twice.

          Both failure screens, not just the async one: the pre-submit redirect swaps the page just
          as completely, and a screen-reader user got nothing at all from it before. */}
      <p role="status" aria-live="polite" className="sr-only">
        {screen.kind === 'probe_error' || screen.kind === 'redirect'
          ? IMPORT_ERROR_COPY[screen.kind === 'probe_error' ? screen.code : screen.reason].body
          : ''}
      </p>
      <div
        className={cn(
          // Mobile: full-bleed thumb-zone column, unchanged.
          // `min-h-0` is load-bearing: without it this flex child refuses to shrink below its
          // content, so the inner `overflow-y-auto` list never scrolls and the footer is pushed
          // off the bottom of the viewport instead.
          'relative z-10 mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          // Desktop (`lg+`), overlay mode only (`onClose` set — the map's "Add a TikTok" flow): a
          // floating card centred over the dimmed map + list, not a docked panel — fixed width,
          // capped height with its own scroll (so a future 3-stage rail grows the card rather than
          // forcing full-viewport height), rounded corners on all sides, hairline border + elevation.
          onClose &&
            'lg:relative lg:mx-0 lg:my-0 lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-[min(52rem,calc(100vh-4rem))] lg:justify-start lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-10 lg:shadow-[var(--shadow-elevated)]',
          // Desktop (`lg+`), standalone `/import` route (`onClose` unset — no map behind it, no
          // scrim on `<main>` to centre against): the original flush right-docked, full-height
          // panel, unchanged from before the centred-card overlay treatment existed.
          !onClose &&
            'lg:absolute lg:inset-y-0 lg:left-auto lg:right-0 lg:mx-0 lg:w-[clamp(400px,32vw,480px)] lg:max-w-none lg:flex-none lg:justify-center lg:border-l lg:border-border/70 lg:bg-card lg:px-8 lg:py-10 lg:shadow-[var(--shadow-elevated)]',
        )}
      >
        {onClose ? (
          <button
            type="button"
            onClick={leaveImport}
            aria-label="Close and return to map"
            className="absolute left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-9 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)] transition-colors hover:bg-[var(--mint-100)]/80 lg:left-6 lg:top-6"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <Link
            href="/map"
            aria-label="Close and return to map"
            className="absolute left-5 top-[calc(env(safe-area-inset-top)+2rem)] z-20 flex size-9 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)] transition-colors hover:bg-[var(--mint-100)]/80 lg:left-6 lg:top-6"
          >
            <X className="size-4" aria-hidden />
          </Link>
        )}
        {/* Clearance below the close button, not just a same-height spacer: at `h-9` (36px) this
            div was exactly the button's own height (`size-9`), so the heading that follows sat
            flush against the button's bottom edge with zero gap. `h-14` (56px) leaves ~20px of
            breathing room between the button and the kicker/heading below it, on both widths. */}
        <div className="h-14 shrink-0" aria-hidden />

        {screen.kind === 'paste' && (
          <PasteScreen
            url={url}
            setUrl={setUrl}
            setTouched={setTouched}
            showInvalid={showInvalid}
            canSubmit={canSubmit}
            onSubmit={submit}
          />
        )}

        {screen.kind === 'redirect' && (
          // Same component, same words, one difference that is real: nothing was sent, so there is
          // no server-side record for a `Reference:` line to point at, and there is nothing to
          // retry (`importErrorActions` withholds `retry` on all three of these codes anyway).
          <ImportFailureScreen
            code={screen.reason}
            rawCode={null}
            retryable={false}
            url={url}
            onRetrySameUrl={() => void submit()}
            onTryAnother={reset}
            onBackToMap={backToMap}
            onSignIn={() => router.push('/sign-in')}
          />
        )}

        {screen.kind === 'rail' && (
          <RailScreen rail={screen.rail} onCancel={reset} />
        )}

        {screen.kind === 'no_places' && (
          <NoPlacesScreen authorHandle={screen.authorHandle} url={url} onRetry={reset} onAddManually={reset} />
        )}

        {screen.kind === 'results' && (
          <ResultsScreen
            authorHandle={screen.authorHandle}
            candidates={screen.candidates}
            onSave={async () => {
              await saveConfirmedCandidates(screen.candidates);
              reset();
            }}
            onCancel={reset}
          />
        )}

        {screen.kind === 'caption_preview' && (
          <CaptionPreviewScreen
            probe={screen.probe}
            saving={captionSave.saving}
            error={captionSave.error}
            partialNotice={captionSave.partialNotice}
            statusByIndex={captionSave.statusByIndex}
            onSave={(picks) => finishCaptionPreview(picks, screen.probe.extractionId)}
            onRetry={reset}
            onContinue={continueAfterPartialSave}
          />
        )}

        {screen.kind === 'probe_error' && (
          <ImportFailureScreen
            code={screen.code}
            rawCode={screen.rawCode}
            retryable={screen.retryable}
            url={url}
            onRetrySameUrl={() => void submit()}
            onTryAnother={reset}
            onBackToMap={backToMap}
            onSignIn={() => router.push('/sign-in')}
          />
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Shared header treatment — the sign-in screen's visual personality (mint icon mark, small-caps
 * kicker, extrabold heading) carried onto every screen of this flow. Colours/type only; this
 * flow keeps its own thumb-zone composition rather than adopting sign-in's two-panel layout.
 * ------------------------------------------------------------------------------------------- */

function ScreenKicker({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)]">
        {icon}
      </span>
      <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * F0/F1 — paste screen
 * ------------------------------------------------------------------------------------------- */

function PasteScreen({
  url,
  setUrl,
  setTouched,
  showInvalid,
  canSubmit,
  onSubmit,
}: {
  url: string;
  setUrl: (v: string) => void;
  setTouched: (v: boolean) => void;
  showInvalid: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-2 pb-8">
        <ScreenKicker icon={<Link2 className="size-3.5" aria-hidden />} label="Add a place" />
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
          Add a TikTok
        </h1>
        {/* C03, from the same module the failure copy comes from — `MALFORMED_URL`'s body is
            this exact sentence, and one of the two would eventually be edited alone. */}
        <p className="text-sm font-medium text-muted-foreground">{COPY_LINK_INSTRUCTION}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          inputMode="url"
          placeholder="Paste a TikTok link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showInvalid || undefined}
          className={cn(
            'h-12 rounded-lg border-2 px-4 text-base font-medium',
            showInvalid ? 'border-destructive' : 'border-input',
          )}
        />
        {showInvalid && (
          <p className="text-sm font-semibold text-destructive">
            That doesn&rsquo;t look like a TikTok link.
          </p>
        )}
      </div>

      {/* Sticky thumb-zone primary action — bottom of the flex column, not fixed, so it sits above
          the home indicator on a short viewport without extra plumbing at this fidelity. */}
      <div className="mt-auto flex flex-col gap-2 pt-10">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="h-12 w-full rounded-lg text-base font-bold"
        >
          Add →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * F2–F5 — the three-stage rail
 * ------------------------------------------------------------------------------------------- */

const STAGE_LABEL: Record<PipelineStage, string> = {
  source: 'Reading the TikTok',
  extract: 'Finding the places',
  resolve: 'Matching locations',
};

function RailScreen({
  rail,
  onCancel,
}: {
  rail: RailState;
  onCancel: () => void;
}) {
  const stages: readonly PipelineStage[] = ['source', 'extract', 'resolve'];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-1 pb-10">
        <ScreenKicker icon={<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />} label="Working on it" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Adding your TikTok
        </h1>
        <p className="text-sm font-medium text-muted-foreground">
          This usually takes a few seconds.
        </p>
      </div>

      <ol className="flex flex-col gap-0">
        {stages.map((stage, i) => (
          <RailStep
            key={stage}
            stage={stage}
            status={rail[stage]}
            fact={
              stage === 'source' ? rail.sourceFact : stage === 'extract' ? rail.extractFact : null
            }
            progress={stage === 'resolve' ? rail.candidateProgress : null}
            isLast={i === stages.length - 1}
          />
        ))}
      </ol>

      <div className="mt-auto flex flex-col gap-2 pt-10">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 w-full rounded-lg text-sm font-bold">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RailStep({
  stage,
  status,
  fact,
  progress,
  isLast,
}: {
  stage: PipelineStage;
  status: StageStatus;
  fact: string | null;
  progress: { readonly index: number; readonly total: number } | null;
  isLast: boolean;
}) {
  const activeCopy =
    status === 'active'
      ? progress
        ? `Matching locations… ${progress.index} of ${progress.total}`
        : `${STAGE_LABEL[stage]}…`
      : null;

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            status === 'done' && 'border-[var(--mint-700)] bg-[var(--mint-700)] text-white',
            status === 'active' && 'border-[var(--mint-700)] bg-transparent text-[var(--mint-700)]',
            status === 'pending' && 'border-border bg-transparent text-muted-foreground',
          )}
        >
          {status === 'done' && <Check className="size-4" aria-hidden />}
          {status === 'active' && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {status === 'pending' && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
        </span>
        {!isLast && (
          <span
            className={cn(
              'my-1 w-0.5 flex-1 transition-colors',
              status === 'done' ? 'bg-[var(--mint-700)]' : 'bg-border',
            )}
            aria-hidden
          />
        )}
      </div>
      <div className="flex min-h-8 flex-col gap-0.5 pb-7">
        <p
          className={cn(
            'text-sm font-bold',
            status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {STAGE_LABEL[stage]}
        </p>
        {status === 'done' && fact && <p className="text-sm font-medium text-muted-foreground">{fact}</p>}
        {status === 'active' && activeCopy && (
          <p className="text-sm font-medium text-[var(--mint-700)]">{activeCopy}</p>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * "No places found" — the modal outcome (~73% at LEVEL B), a success screen, never an error.
 * ------------------------------------------------------------------------------------------- */

function NoPlacesScreen({
  authorHandle,
  url,
  onRetry,
  onAddManually,
}: {
  authorHandle: string | null;
  url: string;
  onRetry: () => void;
  onAddManually: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-[var(--mint-700)]">
          <MapPin className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase">All done</p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-foreground">
            No places named
          </h1>
          <p className="max-w-xs text-sm font-medium text-muted-foreground">
            {authorHandle ? `@${authorHandle}'s TikTok` : 'This TikTok'} didn&rsquo;t call out a specific
            spot by name. That happens a lot — add it yourself in a few seconds.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        <Button type="button" onClick={onAddManually} className="h-12 w-full rounded-lg text-base font-bold">
          Add manually →
        </Button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-[var(--mint-700)]"
          >
            Open the original TikTok
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="h-11 w-full gap-1.5 rounded-lg text-sm font-bold"
        >
          <RotateCcw className="size-4" aria-hidden />
          Try another link
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Review/results — reuses PlaceRow's visual language (place-sheet.tsx) for candidate rows.
 * ------------------------------------------------------------------------------------------- */

function ResultsScreen({
  authorHandle,
  candidates,
  onSave,
  onCancel,
}: {
  authorHandle: string | null;
  candidates: readonly Candidate[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const n = candidates.length;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-1 pb-6">
        <ScreenKicker icon={<SearchCheck className="size-3.5" aria-hidden />} label="Review & confirm" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          {n === 1 ? '1 place found' : `${n} places found`}
        </h1>
        {authorHandle && (
          <p className="text-sm font-medium text-muted-foreground">From @{authorHandle}&rsquo;s TikTok</p>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
        {candidates.map((c, i) => (
          <CandidateRow key={i} candidate={c} />
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-4">
        <Button type="button" onClick={onSave} className="h-12 w-full rounded-lg text-base font-bold">
          Save →
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 w-full rounded-lg text-sm font-bold">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const { candidate: c, resolution } = candidate;

  const band =
    resolution.status === 'resolved'
      ? { label: 'Ready to check', tone: 'confident' as const, place: resolution.place }
      : resolution.status === 'ambiguous'
        ? { label: 'A few options', tone: 'confirm' as const, place: resolution.options[0] ?? null }
        : { label: 'Not matched', tone: 'unresolved' as const, place: null };

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          band.tone === 'confident' && 'bg-[var(--mint-700)]/15 text-[var(--mint-700)]',
          band.tone === 'confirm' && 'bg-muted text-muted-foreground',
          band.tone === 'unresolved' && 'bg-muted text-muted-foreground/70',
        )}
      >
        <MapPin className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate font-heading text-sm font-bold text-foreground">{c.rawName}</p>
        <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {band.place?.locality ?? c.cityHint ?? 'Location unknown'}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
          band.tone === 'confident' && 'bg-[var(--mint-700)]/15 text-[var(--mint-700)]',
          band.tone === 'confirm' && 'bg-muted text-foreground',
          band.tone === 'unresolved' && 'bg-muted text-muted-foreground',
        )}
      >
        {band.label}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Caption preview — the real landing screen. Shows exactly what the real `SourceAdapter` +
 * `ContentExtractor` + `PlaceExtractor` + plausibility gate produced: the caption, plainly, and
 * every surviving `PlaceCandidate` with every field the schema carries
 * (`domain/extraction/schema.ts`), plus the resolver's shortlist for it.
 *
 * The shortlist is a control, not a readout. A `preselect` candidate shows its match and lets the
 * user override it; a `confirm` candidate shows the options and refuses to choose for them; and
 * every other state renders exactly as it did before the picker existed.
 * ------------------------------------------------------------------------------------------- */

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

function CaptionPreviewScreen({
  probe,
  saving,
  error,
  partialNotice,
  statusByIndex,
  onSave,
  onContinue,
  onRetry,
}: {
  probe: ProbeSuccess;
  saving: boolean;
  error: string | null;
  /** Set only for a `partial_failure` save outcome — some candidates saved, some didn't. Swaps
   *  the primary action to "Continue to map" (the saved ones are real; there is nothing left to
   *  retry here) and freezes the list, with each card carrying its own outcome. */
  partialNotice: string | null;
  statusByIndex: ReadonlyMap<number, ItemStatus> | null;
  onSave: (picks: readonly CandidatePick[]) => void;
  onContinue: () => void;
  /** Back to an empty paste field. The primary action when nothing was found — which is the
   *  *modal* import outcome at this hit rate, so "try another link" is the main path through this
   *  screen, not an error recovery. */
  onRetry: () => void;
}) {
  const n = probe.candidates.length;
  const captionId = useId();
  const headingId = useId();
  const [captionOpen, setCaptionOpen] = useState(false);

  /**
   * Which candidates the user wants. Indices, because that is literally what the confirm request
   * takes (`ConfirmImportRequestSchema`'s `items: [{ candidateIndex, note }]`) — the endpoint has
   * always accepted a subset, the screen simply never offered one, and "Done" saved all eight
   * whether you wanted them or not.
   *
   * Preselected rather than empty: the primary path is "save what this TikTok gave me", and an
   * empty selection greets the user with a dead button that reads like a validation error. A
   * candidate the model could not place can never enter the set — not added-then-filtered — so
   * the count on the button is always the number of places that will actually be written.
   */
  /**
   * Which shortlist entry the user picked for each candidate, keyed by candidate index. Only
   * *explicit* picks live here — a `matched` candidate the user never touched stays absent, so
   * the request carries `optionIndex: null` and the server's own auto-accept decides. Recording a
   * `0` we invented would make the row read as a human choice it never was.
   */
  const [picks, setPicks] = useState<ReadonlyMap<number, number>>(() => new Map());

  /** The resolver's answer per candidate, derived once. `resolutionView` is the only mapping —
   *  the band itself comes from `deriveResolution`, the same function the confirm route uses. */
  const views = useMemo(
    () => probe.candidates.map((c) => resolutionView(c.resolution)),
    [probe.candidates],
  );

  /**
   * The candidates a Save would actually write.
   *
   * This used to be `isSaveable(c)` alone — "did the *model* give a coordinate?" — which hid every
   * candidate the resolver had matched but the model had failed to place, even though the server
   * derives that save's coordinate from the stored shortlist and would have written it happily.
   * `willSave` asks the server's question instead: a user pick, or a `preselect` auto-accept, or a
   * model coordinate. It is recomputed as picks change, because picking an option is exactly what
   * turns an unsaveable `ambiguous` candidate into a saveable one.
   */
  const saveableIndices = useMemo(
    () =>
      probe.candidates
        .map((c, i) => (willSave(isSaveable(c), views[i]!, picks.get(i) ?? null) ? i : -1))
        .filter((i) => i >= 0),
    [probe.candidates, views, picks],
  );
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () =>
      new Set(
        probe.candidates
          .map((c, i) => (willSave(isSaveable(c), views[i]!, null) ? i : -1))
          .filter((i) => i >= 0),
      ),
  );

  /** Picking an option is a decision about *this* place, so it selects the card too — otherwise a
   *  user who picks the right branch of a chain and presses Save saves nothing, and the screen
   *  never said why. Changing a pick on an already-selected card leaves the selection alone. */
  function pick(candidateIndex: number, optionIndex: number) {
    setPicks((current) => new Map(current).set(candidateIndex, optionIndex));
    setSelected((current) => (current.has(candidateIndex) ? current : new Set(current).add(candidateIndex)));
  }

  // Counted over the saveable set rather than `selected.size`, so the number on the button is
  // always the number of places the request will actually write — never a card that is ticked but
  // has nothing to save.
  const selectedCount = saveableIndices.filter((i) => selected.has(i)).length;
  // Only the candidates that genuinely have nowhere to go: no map options *and* no model pin.
  // A candidate that is merely waiting for a pick has a location — several — and counting it as
  // "no location" contradicted the "Pick one of these to save it." on its own card.
  const unsaveableCount = probe.candidates.filter(
    (c, i) => !isSaveable(c) && resolutionOptions(views[i]!).length === 0,
  ).length;
  const allSelected = selectedCount === saveableIndices.length && saveableIndices.length > 0;
  const frozen = statusByIndex !== null || saving;

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 pb-4">
        <ScreenKicker icon={<SearchCheck className="size-3.5" aria-hidden />} label="Review & confirm" />
        <h1 id={headingId} className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          {probe.caption === null
            ? 'No caption to search'
            : n === 0
              ? 'No places named'
              : n === 1
                ? '1 place found'
                : `${n} places found`}
        </h1>
      </div>

      {/* The source row. The thumbnail slot never collapses — its presence is the provenance
          promise, and an empty square reads better than a row that changes shape per post. */}
      <div className="flex shrink-0 items-center gap-3 pb-3">
        {probe.thumbnailUrl ? (
          // A signed, ~6-month-expiry remote TikTok CDN URL; not worth a next/image
          // remotePatterns entry.
          <img src={probe.thumbnailUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Link2 className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <a
            href={probe.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-sm font-semibold text-[var(--mint-700)]"
          >
            {probe.authorHandle ? `@${probe.authorHandle}’s TikTok` : 'This TikTok'}
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
          </a>
          {probe.caption !== null && (
            <button
              type="button"
              aria-expanded={captionOpen}
              aria-controls={captionId}
              onClick={() => setCaptionOpen((open) => !open)}
              className="flex h-6 items-center gap-1 text-[13px] font-medium text-muted-foreground"
            >
              {captionOpen ? 'Hide the caption' : 'Show the caption'}
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform motion-reduce:transition-none',
                  captionOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>

      {/* Collapsed by default, and hard-capped when open. The caption is screen-level evidence for
          a rarer question ("what did this post actually say?") than the one each card already
          answers with its own verbatim fragment. Left expanded and uncapped — which is what this
          screen used to do — a thousand characters of ad copy, promo code included, pushed every
          place below the fold. The cap means an expanded caption can never do that again. */}
      {probe.caption !== null && captionOpen && (
        <div
          id={captionId}
          className="mb-3 max-h-38 shrink-0 overflow-y-auto overscroll-contain rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed font-medium text-muted-foreground"
        >
          {probe.caption}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {n === 0 ? (
          <p className="pt-1 text-sm font-medium text-muted-foreground">
            {probe.caption === null
              ? "This TikTok didn't have a caption to search."
              : "This TikTok didn't call out a specific spot by name. That happens a lot."}
          </p>
        ) : (
          <>
            {n >= 2 && statusByIndex === null && (
              <div className="flex shrink-0 items-center justify-between">
                <p className="text-[13px] font-medium text-muted-foreground">
                  {selectedCount} of {saveableIndices.length} selected
                </p>
                <button
                  type="button"
                  disabled={frozen}
                  onClick={() => setSelected(allSelected ? new Set() : new Set(saveableIndices))}
                  className="flex h-11 items-center text-[13px] font-bold text-[var(--mint-700)] disabled:opacity-50"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            )}

            {/* Said once, at screen level, because our honest position is the same on every
                candidate. This is what replaced the per-card "95%": a percentage the model
                assigns to itself, measured against reality as 65-470 m of error. */}
            <p className="shrink-0 text-xs font-medium text-muted-foreground">{LOCATION_CAVEAT}</p>

            <ul
              aria-labelledby={headingId}
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1"
            >
              {probe.candidates.map((c, i) => (
                <ExtractedCandidateRow
                  key={i}
                  candidate={c}
                  view={views[i]!}
                  pick={picks.get(i) ?? null}
                  selected={selected.has(i)}
                  frozen={frozen}
                  status={statusByIndex?.get(i) ?? null}
                  onToggle={() => toggle(i)}
                  onPick={(optionIndex) => pick(i, optionIndex)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/70 pt-4">
        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {partialNotice && (
          <p role="status" className="text-center text-sm font-semibold text-foreground">
            {partialNotice}
          </p>
        )}
        {!partialNotice && skippedNotice(unsaveableCount) !== null && (
          <p className="text-center text-xs font-medium text-muted-foreground">
            {skippedNotice(unsaveableCount)}
          </p>
        )}

        {partialNotice ? (
          <Button
            type="button"
            onClick={onContinue}
            className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            Continue to map →
          </Button>
        ) : n === 0 || saveableIndices.length === 0 ? (
          <>
            <Button
              type="button"
              onClick={onRetry}
              className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              Try another link →
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onContinue}
              className="h-11 w-full rounded-lg text-sm font-bold"
            >
              {IMPORT_ERROR_ACTION_LABEL.back_to_map}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={() =>
                onSave(
                  saveableIndices
                    .filter((i) => selected.has(i))
                    .map((candidateIndex) => ({
                      candidateIndex,
                      optionIndex: picks.get(candidateIndex) ?? null,
                    })),
                )
              }
              disabled={saving || selectedCount === 0}
              className="h-14 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {saving ? 'Saving…' : saveButtonLabel(selectedCount)}
            </Button>
            {selectedCount === 0 && (
              // The only state with a dead primary is the one state that most needs a
              // thumb-reachable way out — the ✕ is a 36px target in the top-left corner.
              <Button
                type="button"
                variant="ghost"
                onClick={onContinue}
                className="h-11 w-full rounded-lg text-sm font-bold"
              >
                {IMPORT_ERROR_ACTION_LABEL.back_to_map}
              </Button>
            )}
            <p className="text-center text-xs font-medium text-muted-foreground">
              Nothing is saved until you tap Save.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Post-save outcome chips. Shown only after a partial failure, when the user stays on this screen
 *  and every card has to say what became of it — including `already_saved`, which a re-import used
 *  to report as a fresh save it had not made. */
const STATUS_CHIP: Record<ItemStatus, { readonly label: string; readonly className: string }> = {
  saved: { label: 'Saved', className: 'bg-[var(--mint-100)] text-[var(--mint-700)]' },
  already_saved: { label: 'Already on your map', className: 'bg-muted text-muted-foreground' },
  skipped: { label: 'No location', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Couldn’t save', className: 'bg-destructive/10 text-destructive' },
};

/**
 * One candidate, as a decision rather than a readout.
 *
 * Two zones separated by a hairline: above it, what we believe this place is; below it, how sure
 * we are about *where* it is and the one tap that settles it. That structure is the
 * extracted-versus-inferred story without a legend to learn.
 *
 * The Google Maps link is a sibling of the toggle, not a child — an `<a>` inside a `<button>` is
 * invalid and needs event-propagation tricks to behave. This shape needs none.
 */
function ExtractedCandidateRow({
  candidate,
  view,
  pick,
  selected,
  frozen,
  status,
  onToggle,
  onPick,
}: {
  candidate: PlaceCandidate;
  /** What the resolver made of this candidate, already derived (`ui/import/candidate-resolution-view.ts`). */
  view: CandidateResolutionView;
  /** The user's explicit shortlist choice, or `null` for "they haven't chosen". */
  pick: number | null;
  selected: boolean;
  frozen: boolean;
  status: ItemStatus | null;
  onToggle: () => void;
  onPick: (optionIndex: number) => void;
}) {
  const title = candidateTitle(candidate);
  // Not `isSaveable(candidate)`: a candidate the resolver matched is saveable even with no model
  // coordinate, because the server derives the pin from the stored shortlist entry.
  const saveable = willSave(isSaveable(candidate), view, pick);
  const chip = status === null ? null : STATUS_CHIP[status];
  const options = resolutionOptions(view);
  const chosen = effectivePick(view, pick);
  const needsPick = pickRequiredNotice(isSaveable(candidate), view, pick);
  const optionsId = useId();
  const badge = resolutionChip(view, pick);

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <div className="flex items-baseline gap-2">
        <p className="truncate font-heading text-[15px] font-bold text-foreground">{title}</p>
        {chip ? (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', chip.className)}>
            {chip.label}
          </span>
        ) : (
          // The resolver's state, in the same slot the post-save outcome uses — never both, and
          // never the same colour: a matched candidate is the only one that gets the mint accent,
          // so an ambiguous one can never be mistaken for a settled one at a glance.
          badge !== null && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                badge.tone === 'settled'
                  ? 'bg-[var(--mint-100)] text-[var(--mint-700)]'
                  : 'bg-muted text-foreground',
              )}
            >
              {badge.label}
            </span>
          )
        )}
      </div>
      <p className="truncate text-xs font-medium text-muted-foreground">
        {candidateProvenance(candidate)}
      </p>
      <p className="truncate text-[13px] font-medium text-muted-foreground">
        {candidateMeta(candidate)}
      </p>
      {showsEvidence(candidate) && (
        <p className="mt-1 border-l-2 border-border pl-2.5 text-xs font-medium text-muted-foreground">
          &ldquo;{candidate.evidence}&rdquo;
        </p>
      )}
      {isHashtagOnly(candidate) && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">Only mentioned in a hashtag.</p>
      )}
    </div>
  );

  return (
    <li
      className={cn(
        'flex shrink-0 flex-col rounded-xl border',
        !saveable
          ? 'border-dashed border-border/70 bg-muted/40'
          : selected
            ? 'border-border/70 bg-card'
            : 'border-border/50 bg-muted/50',
        status === 'failed' && 'border-destructive/40 bg-card',
      )}
    >
      {saveable && status === null ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          disabled={frozen}
          onClick={onToggle}
          className="flex w-full items-start gap-3 rounded-t-xl px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-ring-offset-2 disabled:cursor-default"
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors motion-reduce:transition-none',
              selected
                ? 'border-[var(--mint-700)] bg-[var(--mint-700)] text-white'
                : 'border-border bg-transparent',
            )}
          >
            {selected && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          {body}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3 px-4 py-3.5">
          {/* Not a disabled checkbox: a control that cannot be operated is worse than no control.
              The text stays at full contrast — this is a stated outcome, not a degraded one. */}
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          >
            {status === 'saved' || status === 'already_saved' ? (
              <Check className="size-4" />
            ) : (
              <MapPinOff className="size-4" />
            )}
          </span>
          {body}
        </div>
      )}

      {/* The shortlist. Rendered outside the toggle button on purpose — a radio inside a checkbox
          is invalid markup and needs propagation tricks to behave. Only `matched` and `ambiguous`
          have options; every other state renders exactly what it rendered before this existed. */}
      {options.length > 0 && status === null && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 px-4 pt-2.5 pb-1">
          <div className="flex flex-col gap-0.5">
            <p
              id={`${optionsId}-label`}
              className={cn(
                'text-[11px] font-bold tracking-[0.08em] uppercase',
                view.kind === 'matched' ? 'text-[var(--mint-700)]' : 'text-foreground',
              )}
            >
              {resolutionHeadline(view)}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{resolutionExplanation(view)}</p>
          </div>
          <ul role="radiogroup" aria-labelledby={`${optionsId}-label`} className="flex flex-col gap-1">
            {options.map((option) => {
              const isChosen = chosen === option.index;
              return (
                <li key={option.index}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isChosen}
                    disabled={frozen}
                    onClick={() => onPick(option.index)}
                    className={cn(
                      // min-h-11 rather than a fixed height: the address wraps to two lines on a
                      // 390px viewport far more often than it fits on one, and a clipped address
                      // is the one thing this control exists to show.
                      'flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                      isChosen ? 'border-[var(--mint-700)] bg-[var(--mint-100)]/40' : 'border-border/60 bg-background',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                        isChosen ? 'border-[var(--mint-700)]' : 'border-border',
                      )}
                    >
                      {isChosen && <span className="size-2 rounded-full bg-[var(--mint-700)]" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-bold text-foreground">{option.name}</span>
                      {/* The address, not the name, is what tells two branches of a chain apart —
                          so it wraps rather than truncating. */}
                      <span className="text-xs font-medium break-words text-muted-foreground">
                        {option.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {needsPick && (
            <p className="text-xs font-semibold text-foreground">{needsPick}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-1.5">
        <span className="flex items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
          <Crosshair className="size-3.5 shrink-0" aria-hidden />
          {resolverPinLine(view, pick, isSaveable(candidate)) ?? locationLine(candidate)}
        </span>
        <a
          href={googleMapsSearchUrl(candidate)}
          target="_blank"
          rel="noreferrer"
          aria-label={
            saveable
              ? `Check “${title}” on Google Maps`
              : `Find “${title}” on Google Maps`
          }
          className="flex h-11 shrink-0 items-center gap-1 text-xs font-bold text-[var(--mint-700)]"
        >
          {saveable ? 'Check on Google Maps' : 'Find on Google Maps'}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * The one failure screen — every `DomainErrorCode`, rendered from `07` §9's one client-side copy
 * map. Used for both moments a failure can arrive in:
 *
 *   - **pre-submit** (`kind: 'redirect'`), where `canonicaliseTikTokUrl` rejected the pasted
 *     string on the client and nothing was sent;
 *   - **post-attempt** (`kind: 'probe_error'`), where the route threw a `DomainError`.
 *
 * They were two components with two sets of words. That is how the drift happened: the pre-submit
 * screen said "This kind of TikTok **post** isn't supported yet" and collapsed `UNSUPPORTED_HOST`
 * and `UNSUPPORTED_URL` — an Instagram link and a TikTok profile link — into one sentence, while
 * the copy map said something else and never rendered for those three codes at all.
 *
 * They are one component because the layout was already identical and, more importantly, because
 * the three pre-submit codes say nothing about an attempt: "That link isn't a TikTok", "That's a
 * TikTok link, but not a post", "This kind of TikTok isn't supported yet" are all true whether or
 * not we tried. The codes whose copy *does* claim an attempt ("We couldn't read this TikTok yet")
 * are exactly the ones the client can never reach pre-submit. A test pins that property.
 *
 * The two real differences are props, not forks: `rawCode` is `null` pre-submit (nothing was sent,
 * so there is no server-side record for a support reference to point at), and `retryable` is
 * `false` there for the same reason.
 *
 * What this replaced on the post-attempt side: one screen for all fourteen codes, headed
 * "Couldn't read that TikTok / Something went wrong" with the raw code in 11px grey and one
 * action, "Try another link". Everything the user reads now comes from
 * `ui/import/import-error-copy.ts`; this component owns only the layout, the mark, the wiring of
 * each action, and the accessibility behaviour.
 *
 * One thing deliberately gone with it: the pre-submit screen's primary action read `Add manually →`
 * under the headline `Add it by hand instead`, and it called `reset()` — back to an empty paste
 * field. S8 manual add is `L1-F7-T1` and does not exist, so that button named a destination it
 * could not reach. The action it actually performs is `Try another TikTok`, and that is now what it
 * says.
 * ------------------------------------------------------------------------------------------- */

/** The mark for each `ImportErrorIcon` key. Kept here rather than in the copy map so that module
 *  stays React-free and testable as plain data. */
const IMPORT_ERROR_ICON: Record<ImportErrorIcon, typeof Link2Off> = {
  'link-off': Link2Off,
  'post-unavailable': EyeOff,
  photo: ImageOff,
  waiting: Clock,
  'no-caption': MessageSquareOff,
  'our-side': RotateCcw,
  locked: LockKeyhole,
};

function ImportFailureScreen({
  code,
  rawCode,
  retryable,
  url,
  onRetrySameUrl,
  onTryAnother,
  onBackToMap,
  onSignIn,
}: {
  code: DomainErrorCode;
  /** What the server actually sent. Equal to `code` for all 14 real codes; shown small, for a
   *  support conversation, never as the user's explanation. `null` when no request was made — a
   *  reference to nothing helps nobody. */
  rawCode: string | null;
  retryable: boolean;
  /** The URL the user pasted — still in state, which is what makes `Retry` (same link) and
   *  `Open the TikTok` (here is your thing back, §5.1) possible without asking the server. */
  url: string;
  onRetrySameUrl: () => void;
  onTryAnother: () => void;
  onBackToMap: () => void;
  onSignIn: () => void;
}) {
  const copy = IMPORT_ERROR_COPY[code];
  const Icon = IMPORT_ERROR_ICON[copy.icon];
  /**
   * Already in render order, and already reconciled with the server's `retryable` — see
   * `importErrorActions`. This component picks no actions of its own; the one thing it contributes
   * is a precondition the copy map cannot see.
   *
   * **`Retry` re-runs the pasted URL, so with no pasted URL there is nothing to re-run.** That is
   * the same sentence `retryable` already means, which is why it folds in here rather than
   * becoming a third parameter. An action whose precondition is unmet should not render: the
   * alternative is a mint primary button that does nothing when pressed, which is exactly the dead
   * end this screen exists to remove. `Open the TikTok` / `Open the original link` drop themselves
   * on the same condition further down.
   *
   * With the abort in `submit()` this is now belt-and-braces — `reset()` is the only thing that
   * empties `url` and it cancels the request that could otherwise land here — but it is one line
   * and it holds regardless of how a future caller reaches this screen.
   */
  const actions = importErrorActions(code, retryable && url.trim().length > 0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The button that submitted has just unmounted, so keyboard focus would otherwise fall back to
  // `<body>` and a screen-reader user would be told nothing about why the screen changed. Moving
  // it to the headline both restores a sensible tab position and reads the headline; the page's
  // polite live region carries the sentence under it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [code]);

  function run(action: ImportErrorAction) {
    switch (action) {
      case 'retry':
        onRetrySameUrl();
        return;
      case 'another_tiktok':
        onTryAnother();
        return;
      case 'back_to_map':
        onBackToMap();
        return;
      case 'sign_in':
        onSignIn();
        return;
      case 'open_tiktok':
      case 'open_link':
        return; // rendered as an anchor, never routed through here
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)]">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase">
            {copy.kicker}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-xl font-extrabold tracking-tight text-foreground outline-none"
          >
            {copy.headline}
          </h1>
          <p className="max-w-xs text-sm font-medium text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        {actions.map((action) => {
          const label = IMPORT_ERROR_ACTION_LABEL[action];
          // `Open the TikTok` is a real navigation to a third-party page, so it is an anchor with
          // the same affordance as everywhere else in this flow, not a button that calls
          // `window.open`. When the field is somehow empty there is nothing to open, and the
          // action is dropped rather than rendered dead.
          //
          // Two weights, because the two specs ask for two: §5.1 makes it the second 44px
          // secondary on F9 (bordered, in the button rhythm), §5.3 makes it the tertiary text
          // link on F10. "Is it last?" is exactly that distinction on this screen.
          if (action === 'open_tiktok' || action === 'open_link') {
            if (!url) return null;
            const tertiary = action === actions[actions.length - 1];
            return (
              <a
                key={action}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold',
                  tertiary
                    ? 'text-[var(--mint-700)]'
                    : 'border border-input bg-background text-foreground',
                )}
              >
                {label}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            );
          }
          // §5.1's 56px primary / 44px secondary hierarchy, expressed in this flow's existing
          // h-12 / h-11 sizes.
          return action === actions[0] ? (
            <Button
              key={action}
              type="button"
              onClick={() => run(action)}
              className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
            >
              {action === 'retry' && <RotateCcw className="size-4" aria-hidden />}
              {label}
            </Button>
          ) : (
            <Button
              key={action}
              type="button"
              variant={action === 'back_to_map' ? 'ghost' : 'outline'}
              onClick={() => run(action)}
              className="h-11 w-full gap-1.5 rounded-lg text-sm font-bold"
            >
              {label}
            </Button>
          );
        })}
        {/* Support handle, not an explanation. Small, muted, last, and never the thing that tells
            the user what happened — which is exactly what it was before this screen had copy.
            Omitted pre-submit: no request was made, so there is nothing on the other end to look
            up, and a code with no record behind it is noise. */}
        {rawCode !== null && (
          <p className="pt-1 text-center text-[11px] font-medium text-muted-foreground/70">
            Reference: {rawCode}
          </p>
        )}
      </div>
    </div>
  );
}
