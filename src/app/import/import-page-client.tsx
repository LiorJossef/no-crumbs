'use client';

/**
 * S6 `/import` — the paste screen, the three-stage rail, the no-places screen (a success state,
 * never an error), the results/review screen, and the non-TikTok redirect. `docs/mvp-plan.md` §5
 * (L0-F1-T1/T2/T3) and `docs/execution-plan.md` L1-F2-T1/T2 spec this surface; copy strings are
 * `docs/ux-architecture.md` §12.1's deck (C01–C22), quoted verbatim.
 *
 * The real flow: `submit()` calls `POST /api/imports/probe` (real oEmbed fetch + caption
 * extraction + `PlaceExtractor`, no resolver yet — see that route's header) and lands on
 * `caption_preview`; "Done" there calls `POST /api/imports/confirm` via `saveExtractedCandidates`.
 * The `no_places`/`results` `Screen` kinds and their `NoPlacesScreen`/`ResultsScreen` components
 * predate this real wiring and are currently unreachable from this file (no code path sets them);
 * they are kept as the shape L0-F6-T1's real streaming route is expected to drive, rather than
 * deleted ahead of that work.
 *
 * The one piece of real domain logic wired up live beyond the above is `canonicaliseTikTokUrl`
 * (`domain/source/canonicalise-tiktok-url.ts`) against the pasted string, so the paste screen's
 * validation and the non-TikTok redirect are the real classification, not a stub.
 */

import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Check,
  Link2,
  Loader2,
  MapPin,
  Pencil,
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
import type { Candidate, PlaceCandidate } from '@/domain/types';

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
  /** The real, plausibility-filtered candidates from the real `PlaceExtractor` — pre-resolver, so
   *  no `CandidateResolution` exists yet (that's `Candidate`, not `PlaceCandidate`). Empty when
   *  `caption` was null (no LLM call on nothing) or when nothing survived the gate — both are
   *  valid, expected outcomes, not errors. */
  readonly candidates: readonly PlaceCandidate[];
}

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
  | { readonly kind: 'redirect'; readonly reason: 'UNSUPPORTED_HOST' | 'PHOTO_POST' | 'UNSUPPORTED_URL' }
  | { readonly kind: 'rail'; readonly rail: RailState }
  | { readonly kind: 'no_places'; readonly authorHandle: string | null }
  | { readonly kind: 'results'; readonly authorHandle: string | null; readonly candidates: readonly Candidate[] }
  /** The real-fetch slice's landing screen (this task): no LLM has run, so this is deliberately
   *  not `no_places` or `results` — both of those imply extraction happened. Shows the raw
   *  caption plainly, once the real `SourceAdapter` + `ContentExtractor` have run. */
  | { readonly kind: 'caption_preview'; readonly probe: ProbeSuccess }
  /** A thrown `DomainError` from the probe route — minimal-fidelity, honest, non-broken. Not the
   *  real error taxonomy's full copy deck (07 §9); that lands with L0-F6. */
  | { readonly kind: 'probe_error'; readonly code: string; readonly retryable: boolean };

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
  }>({
    saving: false,
    error: null,
    partialNotice: null,
  });

  /** The last save's detail, kept so `continueAfterPartialSave` — which runs on a *later* click,
   *  after the message has been read — can still tell the map what landed. */
  const lastSaveDetail = useRef<SaveOutcomeDetail | null>(null);

  const validation = useMemo(() => canonicaliseTikTokUrl(url), [url]);
  const showInvalid = touched && url.trim().length > 0 && !validation.ok;
  const canSubmit = url.trim().length > 0 && validation.ok;

  function reset() {
    setScreen({ kind: 'paste' });
    setUrl('');
    setTouched(false);
    setCaptionSave({ saving: false, error: null, partialNotice: null });
  }

  async function submit() {
    setTouched(true);
    if (!validation.ok) {
      // UNSUPPORTED_HOST/PHOTO_POST/UNSUPPORTED_URL are all "a recognised link, not a failure" —
      // the non-TikTok redirect, never the inline-invalid state (which is MALFORMED_URL only).
      if (validation.error.code !== 'MALFORMED_URL') {
        setScreen({
          kind: 'redirect',
          reason: validation.error.code as 'UNSUPPORTED_HOST' | 'PHOTO_POST' | 'UNSUPPORTED_URL',
        });
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
    setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } });

    try {
      const fetchPromise = fetch('/api/imports/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      setScreen({
        kind: 'rail',
        rail: { ...RAIL_IDLE, source: 'done', sourceFact: 'Read the TikTok', extract: 'active' },
      });

      const res = await fetchPromise;
      const body = (await res.json()) as ProbeSuccess | ProbeErrorBody;

      if (!res.ok || 'error' in body) {
        const code = 'error' in body ? body.error.code : 'INTERNAL';
        const retryable = 'error' in body ? body.error.retryable : true;
        setScreen({ kind: 'probe_error', code, retryable });
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
      setScreen({ kind: 'probe_error', code: 'INTERNAL', retryable: true });
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
    candidates: readonly PlaceCandidate[],
    extractionId: string | null,
  ): Promise<SaveOutcomeDetail> {
    if (candidates.length === 0) {
      return { saved: 0, skipped: 0, failed: 0, alreadySaved: 0, savedPlaceIds: [] };
    }

    // No persisted extraction means there is nothing the server can derive a save from, and no
    // request this client could send that would be authorised. Reported as failed rather than
    // silently swallowed: the user pressed Done and nothing was saved.
    if (extractionId === null) {
      return { saved: 0, skipped: 0, failed: candidates.length, alreadySaved: 0, savedPlaceIds: [] };
    }

    // The request carries positions, not facts. Which candidate to save is the user's call; what
    // that candidate *is* comes from the extraction row the probe route wrote. The indices line up
    // because the probe route persisted exactly the array it returned — the same
    // plausibility-filtered candidates, in the same order.
    const items = candidates.map((_, candidateIndex) => ({ candidateIndex, note: null }));

    const res = await fetch('/api/imports/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractionId, items }),
    });

    if (!res.ok) {
      return { saved: 0, skipped: 0, failed: items.length, alreadySaved: 0, savedPlaceIds: [] };
    }

    const body = (await res.json()) as {
      results: readonly {
        status: 'saved' | 'already_saved' | 'skipped' | 'failed';
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
    for (const result of body.results) {
      if (result.status === 'saved' || result.status === 'already_saved') {
        saved += 1;
        if (result.status === 'already_saved') alreadySaved += 1;
        // Collected so the map can fly to exactly what this import put in the library —
        // including the already-saved ones, which are just as much "the places from this TikTok".
        if (result.savedPlaceId) savedPlaceIds.push(result.savedPlaceId);
      } else if (result.status === 'skipped') skipped += 1;
      else failed += 1;
    }
    return { saved, skipped, failed, alreadySaved, savedPlaceIds };
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
    candidates: readonly PlaceCandidate[],
    extractionId: string | null,
  ) {
    setCaptionSave({ saving: true, error: null, partialNotice: null });
    try {
      const result = await saveExtractedCandidates(candidates, extractionId);
      lastSaveDetail.current = result;
      const outcome = decideCaptionSaveOutcome(result);
      switch (outcome.kind) {
        case 'proceed':
          backToMapWithFreshData(result);
          reset();
          return;
        case 'skip_only':
        case 'hard_failure':
          setCaptionSave({ saving: false, error: outcome.message, partialNotice: null });
          return;
        case 'partial_failure':
          setCaptionSave({ saving: false, error: null, partialNotice: outcome.message });
          return;
      }
    } catch {
      setCaptionSave({ saving: false, error: "Couldn't save that place — try again.", partialNotice: null });
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
        onClose ? 'absolute inset-0 z-50 h-full' : 'min-h-dvh',
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
        style={{
          background:
            'radial-gradient(130% 110% at 115% -15%, rgba(192,239,229,0.42) 0%, rgba(192,239,229,0) 58%),' +
            'radial-gradient(120% 130% at -15% 118%, rgba(218,245,239,0.28) 0%, rgba(218,245,239,0) 62%),' +
            'radial-gradient(90% 90% at 45% 40%, rgba(241,251,249,0.5) 0%, rgba(241,251,249,0) 70%),' +
            'var(--background)',
        }}
      />
      <div
        className={cn(
          // Mobile: full-bleed thumb-zone column, unchanged.
          'relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]',
          // Desktop (`lg+`), overlay mode only (`onClose` set — the map's "Add a TikTok" flow): a
          // floating card centred over the dimmed map + list, not a docked panel — fixed width,
          // capped height with its own scroll (so a future 3-stage rail grows the card rather than
          // forcing full-viewport height), rounded corners on all sides, hairline border + elevation.
          onClose &&
            'lg:relative lg:mx-0 lg:my-0 lg:w-[clamp(420px,34vw,480px)] lg:max-w-none lg:flex-none lg:max-h-[min(44rem,calc(100vh-5rem))] lg:justify-start lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card lg:px-8 lg:py-10 lg:shadow-[var(--shadow-elevated)]',
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
            onClick={onClose}
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

        {screen.kind === 'redirect' && <RedirectScreen reason={screen.reason} url={url} onBack={reset} />}

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
            onDone={() => finishCaptionPreview(screen.probe.candidates, screen.probe.extractionId)}
            onContinue={continueAfterPartialSave}
          />
        )}

        {screen.kind === 'probe_error' && (
          <ProbeErrorScreen code={screen.code} retryable={screen.retryable} onRetry={reset} />
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
        <p className="text-sm font-medium text-muted-foreground">
          Copy the link in TikTok — Share → Copy link.
        </p>
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
 * Non-TikTok redirect — a recognised link, not a failure (04 §2, brand-and-product-foundation §1).
 * ------------------------------------------------------------------------------------------- */

function RedirectScreen({
  reason,
  url,
  onBack,
}: {
  reason: 'UNSUPPORTED_HOST' | 'PHOTO_POST' | 'UNSUPPORTED_URL';
  url: string;
  onBack: () => void;
}) {
  const copy =
    reason === 'PHOTO_POST'
      ? 'This kind of TikTok post isn’t supported yet.'
      : 'We support TikTok links. Instagram and YouTube aren’t supported yet.';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-[var(--mint-100)] text-[var(--mint-700)]">
          <Pencil className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase">Not TikTok</p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-foreground">
            Add it by hand instead
          </h1>
          <p className="max-w-xs text-sm font-medium text-muted-foreground">{copy}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        <Button type="button" onClick={onBack} className="h-12 w-full rounded-lg text-base font-bold">
          Add manually →
        </Button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-[var(--mint-700)]"
          >
            Open the original link
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <Button type="button" variant="ghost" onClick={onBack} className="h-11 w-full rounded-lg text-sm font-bold">
          Cancel
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
 * Caption preview — this task's real landing screen. Shows exactly what the real
 * `SourceAdapter` + `ContentExtractor` + `PlaceExtractor` + plausibility gate produced: the
 * caption, plainly, and every surviving `PlaceCandidate` with every field the schema carries
 * (`domain/extraction/schema.ts`) — pre-resolver, so there is no `CandidateResolution` yet and no
 * confidence band styling, just the raw candidate as a manual tester needs to see it to verify it
 * by hand against Google Maps.
 * ------------------------------------------------------------------------------------------- */

function CaptionPreviewScreen({
  probe,
  saving,
  error,
  partialNotice,
  onDone,
  onContinue,
}: {
  probe: ProbeSuccess;
  saving: boolean;
  error: string | null;
  /** Set only for a `partial_failure` save outcome — some candidates saved, some didn't. Swaps
   *  the primary action from "Done" (retry the save) to "Continue to map" (the saved ones are
   *  real; there is nothing left to retry here). */
  partialNotice: string | null;
  onDone: () => void;
  onContinue: () => void;
}) {
  const n = probe.candidates.length;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-1 pb-6">
        <ScreenKicker icon={<SearchCheck className="size-3.5" aria-hidden />} label="Review & confirm" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          {probe.caption === null
            ? 'No caption to search'
            : n === 0
              ? 'No places named'
              : n === 1
                ? '1 place found'
                : `${n} places found`}
        </h1>
        {probe.authorHandle && (
          <p className="text-sm font-medium text-muted-foreground">From @{probe.authorHandle}&rsquo;s TikTok</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
          {probe.thumbnailUrl && (
            // A signed, ~6-month-expiry remote thumbnail; not worth a next/image
            // remotePatterns entry for a throwaway route.
            <img
              src={probe.thumbnailUrl}
              alt=""
              className="size-14 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Caption</p>
            <p className="text-sm font-medium text-foreground">
              {probe.caption ?? <span className="text-muted-foreground">No caption text.</span>}
            </p>
          </div>
        </div>

        <a
          href={probe.canonicalUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-[var(--mint-700)]"
        >
          Open the original TikTok
          <ArrowUpRight className="size-4" aria-hidden />
        </a>

        <div className="flex flex-col gap-2" role="status">
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Places</p>
          {n === 0 ? (
            <p className="pt-1 text-sm font-medium text-muted-foreground">
              {probe.caption === null
                ? "This TikTok didn't have a caption to search."
                : "This TikTok didn't call out a specific spot by name. That happens a lot."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {probe.candidates.map((c, i) => (
                <ExtractedCandidateRow key={i} candidate={c} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4">
        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        {partialNotice && (
          <p role="status" className="text-center text-sm font-semibold text-[var(--mint-700)]">
            {partialNotice}
          </p>
        )}
        {partialNotice ? (
          <Button
            type="button"
            onClick={onContinue}
            className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            Continue to map →
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onDone}
            disabled={saving}
            className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
            {saving ? 'Saving…' : 'Done'}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One surviving `PlaceCandidate`, every field the schema carries, laid out with the same
 *  rounded-card/mint-badge language as `CandidateRow` above — this is a pre-resolver row (no
 *  `CandidateResolution`, so no confidence-band pill), built for a manual tester to read every
 *  field at a glance and jump to Google Maps to verify it by hand. */
function ExtractedCandidateRow({ candidate }: { candidate: PlaceCandidate }) {
  // `filterPlausible` caps a hashtag-only candidate's confidence at 0.5 rather than dropping it
  // (`domain/extraction/plausibility.ts`'s `HASHTAG_ONLY_CONFIDENCE_CEILING`) — surfaced here as a
  // calm, informational cue, not a warning: this is a real, if less certain, candidate.
  const isHashtagSourced = candidate.rawName.trim().startsWith('#');

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--mint-700)]/15 text-[var(--mint-700)]"
        >
          <MapPin className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-heading text-sm font-bold text-foreground">{candidate.rawName}</p>
          {candidate.identifiedName && candidate.identifiedName !== candidate.rawName && (
            // The model's own real-world guess (`06` §3.4) — never auto-accepted, shown only as a
            // hint for the human who is about to click through to Google Maps to verify it.
            <p className="truncate text-xs font-semibold text-[var(--mint-700)]">
              Likely: {candidate.identifiedName}
            </p>
          )}
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            {[candidate.cityHint, candidate.countryHint].filter(Boolean).join(', ') || 'Location unknown'}
            {candidate.categoryHint ? ` · ${candidate.categoryHint}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
          {candidate.modelConfidence === null ? 'n/a' : `${Math.round(candidate.modelConfidence * 100)}%`}
        </span>
      </div>

      {candidate.evidence && (
        <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          &ldquo;{candidate.evidence}&rdquo;
        </p>
      )}

      {isHashtagSourced && (
        <p className="text-xs font-medium text-[var(--mint-700)]">
          Only mentioned as a hashtag — confidence capped since there&rsquo;s no other corroboration.
        </p>
      )}

      <a
        href={googleMapsSearchUrl(candidate)}
        target="_blank"
        rel="noreferrer"
        className="flex h-8 items-center gap-1.5 self-start text-xs font-bold text-[var(--mint-700)]"
      >
        Check on Google Maps
        <ArrowUpRight className="size-3.5" aria-hidden />
      </a>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Probe error — a thrown `DomainError` from the throwaway `/api/imports/probe` route. Minimal
 * fidelity: one honest sentence and a way back, not the full `07` §9 copy deck.
 * ------------------------------------------------------------------------------------------- */

function ProbeErrorScreen({
  code,
  retryable,
  onRetry,
}: {
  code: string;
  retryable: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-[var(--mint-700)]">
          <X className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase">
            Couldn&rsquo;t read that TikTok
          </p>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="max-w-xs text-sm font-medium text-muted-foreground">
            {retryable
              ? "We couldn't read this post. Give it another try."
              : "We couldn't read this post."}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground/70">{code}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-8">
        <Button type="button" onClick={onRetry} className="h-12 w-full rounded-lg text-base font-bold">
          Try another link
        </Button>
      </div>
    </div>
  );
}
