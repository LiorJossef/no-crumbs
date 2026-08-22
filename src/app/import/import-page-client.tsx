'use client';

/**
 * S6 `/import` — the paste screen, the three-stage rail, the no-places screen (a success state,
 * never an error), the results/review screen, and the non-TikTok redirect. `docs/mvp-plan.md` §5
 * (L0-F1-T1/T2/T3) and `docs/execution-plan.md` L1-F2-T1/T2 spec this surface; copy strings are
 * `docs/ux-architecture.md` §12.1's deck (C01–C22), quoted verbatim.
 *
 * **UI-only slice.** Nothing here calls `runImport`, `POST /api/imports` or the network — the
 * screen is driven by a local reducer over the *real* `ImportEvent`/`ImportOutcome` vocabulary
 * (`domain/import/events.ts`) fed by a scripted demo sequence, so wiring in the real NDJSON stream
 * later means replacing `demoDispatch`'s source with a `fetch` body reader, not touching this
 * component's render logic or its state shape.
 *
 * The one piece of real domain logic wired up live is `canonicaliseTikTokUrl` (`domain/source/
 * canonicalise-tiktok-url.ts`) against the pasted string, so the paste screen's validation and the
 * non-TikTok redirect are the real classification, not a stub.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  SearchCheck,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import type { ImportEvent, PipelineStage } from '@/domain/import/events';
import type { Candidate } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * `/api/imports/probe` — the throwaway route wired in ahead of the real streaming route
 * (L0-F6-T1). Proves the real oEmbed fetch + caption extraction reach this screen: no LLM, no
 * candidates, no `runImport`. See `src/app/api/imports/probe/route.ts`'s header.
 * ------------------------------------------------------------------------------------------- */

interface ProbeSuccess {
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
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
 * Demo fixtures — stand in for a real ImportOutcome until the streaming route exists. Shaped
 * exactly like the real `Candidate`/`CandidateResolution` union (`domain/types.ts`) so the review
 * rows below are the real render path, not a parallel mock shape.
 * ------------------------------------------------------------------------------------------- */

const DEMO_CANDIDATES: readonly Candidate[] = [
  {
    candidate: {
      rawName: 'Anat Bakery',
      cityHint: 'Tel Aviv',
      countryHint: 'IL',
      categoryHint: 'cafe',
      evidence: 'grab the sourdough at anat bakery',
      modelConfidence: 0.81,
    },
    resolution: {
      status: 'resolved',
      confidence: { band: 'preselect', score: 0.91, margin: 0.22 },
      alternates: [],
      place: {
        provider: 'overture',
        providerPlaceId: 'demo-1',
        sourceDataset: 'overture-places',
        regionId: 'tlv',
        name: 'Anat Bakery',
        altNames: [],
        providerCategory: 'bakery',
        addressLine: '3 Shabazi St',
        locality: 'Tel Aviv-Yafo',
        lat: 32.0596,
        lng: 34.7654,
        datasetConfidence: 0.8,
      },
    },
  },
  {
    candidate: {
      rawName: 'Container',
      cityHint: 'Tel Aviv',
      countryHint: 'IL',
      categoryHint: 'bar',
      evidence: 'ended the night at container',
      modelConfidence: 0.64,
    },
    resolution: {
      status: 'ambiguous',
      options: [
        {
          provider: 'overture',
          providerPlaceId: 'demo-2a',
          sourceDataset: 'overture-places',
          regionId: 'tlv',
          name: 'Container',
          altNames: [],
          providerCategory: 'bar',
          addressLine: '43 Retzif Ha’Aliya Hashniya St',
          locality: 'Tel Aviv-Yafo',
          lat: 32.0524,
          lng: 34.7498,
          datasetConfidence: 0.6,
        },
      ],
    },
  },
  {
    candidate: {
      rawName: 'a little place near the port',
      cityHint: 'Tel Aviv',
      countryHint: null,
      categoryHint: null,
      evidence: 'a little place near the port, no name mentioned',
      modelConfidence: 0.3,
    },
    resolution: { status: 'unresolved', reason: 'no_match' },
  },
];

/** One scripted `ImportEvent` sequence per demo scenario — the shape a real NDJSON reader would
 *  hand this page one line at a time. Kept here only for the dev stepper below. */
function scriptFor(scenario: 'results' | 'no_places'): readonly ImportEvent[] {
  const base: ImportEvent[] = [
    { t: 'accepted', importId: 'demo' as never, idempotent: false },
    { t: 'stage', stage: 'source', status: 'started' },
    { t: 'stage', stage: 'source', status: 'done', fact: { authorHandle: 'tlv.eats' } },
    { t: 'stage', stage: 'extract', status: 'started' },
  ];
  if (scenario === 'no_places') {
    return [
      ...base,
      { t: 'stage', stage: 'extract', status: 'done', fact: { candidateCount: 0 } },
      {
        t: 'done',
        outcome: { kind: 'no_places', importId: 'demo' as never, source: DEMO_SOURCE },
      },
    ];
  }
  return [
    ...base,
    { t: 'stage', stage: 'extract', status: 'done', fact: { candidateCount: DEMO_CANDIDATES.length } },
    { t: 'stage', stage: 'resolve', status: 'started' },
    { t: 'candidate', index: 1, total: DEMO_CANDIDATES.length },
    { t: 'candidate', index: 2, total: DEMO_CANDIDATES.length },
    { t: 'candidate', index: 3, total: DEMO_CANDIDATES.length },
    {
      t: 'done',
      outcome: {
        kind: 'ready',
        importId: 'demo' as never,
        source: DEMO_SOURCE,
        candidates: DEMO_CANDIDATES,
        degraded: null,
      },
    },
  ];
}

const DEMO_SOURCE = {
  externalId: '7000000000000000000',
  canonicalUrl: 'https://www.tiktok.com/@tlv.eats/video/7000000000000000000',
  authorHandle: 'tlv.eats',
  thumbnailUrl: null,
};

/** One `ImportEvent` folded into `RailState` — the reducer a real stream consumer reuses verbatim. */
function applyEvent(rail: RailState, event: ImportEvent): RailState {
  switch (event.t) {
    case 'stage': {
      const status: StageStatus = event.status === 'started' ? 'active' : 'done';
      const next: RailState = { ...rail, [event.stage]: status };
      if (event.status === 'done' && event.stage === 'source') {
        const handle = event.fact.authorHandle;
        return { ...next, sourceFact: handle ? `Read @${handle}'s TikTok` : 'Read the TikTok' };
      }
      if (event.status === 'done' && event.stage === 'extract') {
        const n = event.fact.candidateCount;
        return { ...next, extractFact: n === 0 ? 'No places named' : n === 1 ? '1 place found' : `${n} places found` };
      }
      return next;
    }
    case 'candidate':
      return { ...rail, candidateProgress: { index: event.index, total: event.total } };
    default:
      return rail;
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Component
 * ------------------------------------------------------------------------------------------- */

export interface ImportPageClientProps {
  /** Set when this component is rendered as an overlay on top of the persistent map
   *  (`map-page-client.tsx`'s "Add a TikTok" flow) rather than mounted at the standalone `/import`
   *  route. Swaps the full-viewport (`min-h-dvh`) shell for one that fills its (absolutely
   *  positioned) overlay container instead, and swaps the close affordance from a real navigation
   *  (`<Link href="/map">`, which would unmount the map) to a plain state-closer. Omitting this
   *  prop preserves the standalone route's exact behaviour — direct navigation and a mid-import
   *  refresh still land on this same component via `/import`'s page. */
  readonly onClose?: () => void;
}

export function ImportPageClient({ onClose }: ImportPageClientProps = {}) {
  const [screen, setScreen] = useState<Screen>({ kind: 'paste' });
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [script, setScript] = useState<readonly ImportEvent[] | null>(null);
  const [scriptIndex, setScriptIndex] = useState(0);

  const validation = useMemo(() => canonicaliseTikTokUrl(url), [url]);
  const showInvalid = touched && url.trim().length > 0 && !validation.ok;
  const canSubmit = url.trim().length > 0 && validation.ok;

  function reset() {
    setScreen({ kind: 'paste' });
    setUrl('');
    setTouched(false);
    setScript(null);
    setScriptIndex(0);
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

    // A real TikTok link: drive the rail's `source` stage off the real `/api/imports/probe`
    // fetch. `extract`/`resolve` stay pending — no LLM has run yet (that's L0-F4-T2/L0-F6, not
    // this task) — and `caption_preview` is the honest landing screen once the source stage
    // is done, rather than faking `extract`/`resolve` completion.
    setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } });

    try {
      const res = await fetch('/api/imports/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json()) as ProbeSuccess | ProbeErrorBody;

      if (!res.ok || 'error' in body) {
        const code = 'error' in body ? body.error.code : 'INTERNAL';
        const retryable = 'error' in body ? body.error.retryable : true;
        setScreen({ kind: 'probe_error', code, retryable });
        return;
      }

      setScreen({
        kind: 'rail',
        rail: {
          ...RAIL_IDLE,
          source: 'done',
          sourceFact: body.authorHandle ? `Read @${body.authorHandle}'s TikTok` : 'Read the TikTok',
          extract: 'active',
        },
      });
      setScreen({ kind: 'caption_preview', probe: body });
    } catch {
      setScreen({ kind: 'probe_error', code: 'INTERNAL', retryable: true });
    }
  }

  function stepDemo() {
    if (!script) return;
    const event = script[scriptIndex];
    if (!event) return;
    if (screen.kind !== 'rail') return;

    if (event.t === 'done') {
      if (event.outcome.kind === 'no_places') {
        setScreen({ kind: 'no_places', authorHandle: event.outcome.source.authorHandle });
      } else if (event.outcome.kind === 'ready') {
        setScreen({
          kind: 'results',
          authorHandle: event.outcome.source.authorHandle,
          candidates: event.outcome.candidates,
        });
      }
      setScriptIndex((i) => i + 1);
      return;
    }

    setScreen({ kind: 'rail', rail: applyEvent(screen.rail, event) });
    setScriptIndex((i) => i + 1);
  }

  function jumpToNoPlaces() {
    setScript(scriptFor('no_places'));
    setScriptIndex(0);
    setScreen({ kind: 'rail', rail: RAIL_IDLE });
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
          <RailScreen
            rail={screen.rail}
            onCancel={reset}
            devNext={stepDemo}
            devHasNext={script !== null && scriptIndex < script.length}
          />
        )}

        {screen.kind === 'no_places' && (
          <NoPlacesScreen authorHandle={screen.authorHandle} url={url} onRetry={reset} onAddManually={reset} />
        )}

        {screen.kind === 'results' && (
          <ResultsScreen authorHandle={screen.authorHandle} candidates={screen.candidates} onDone={reset} />
        )}

        {screen.kind === 'caption_preview' && <CaptionPreviewScreen probe={screen.probe} onDone={reset} />}

        {screen.kind === 'probe_error' && (
          <ProbeErrorScreen code={screen.code} retryable={screen.retryable} onRetry={reset} />
        )}
      </div>

      {/* Dev-only demo control — temporary, not part of the shipped surface. Lets a reviewer walk
          every state without a real backend. Remove once the streaming route lands (L0-F6-T1). */}
      <DevControls screen={screen} onNoPlaces={jumpToNoPlaces} onReset={reset} />
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
  devNext,
  devHasNext,
}: {
  rail: RailState;
  onCancel: () => void;
  devNext: () => void;
  devHasNext: boolean;
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
        {/* Dev-only: steps the scripted demo event one at a time. Not shipped UI. */}
        <Button
          type="button"
          variant="outline"
          disabled={!devHasNext}
          onClick={devNext}
          className="h-11 w-full gap-1.5 rounded-lg text-sm font-bold"
        >
          <Wand2 className="size-4" aria-hidden />
          Dev: next event
        </Button>
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
  onDone,
}: {
  authorHandle: string | null;
  candidates: readonly Candidate[];
  onDone: () => void;
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
        <Button type="button" onClick={onDone} className="h-12 w-full rounded-lg text-base font-bold">
          Save →
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} className="h-11 w-full rounded-lg text-sm font-bold">
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
 * Caption preview — this task's real landing screen. No LLM has run yet, so this is honest about
 * two things at once: it shows exactly what the real `SourceAdapter` + `ContentExtractor`
 * produced (the caption, plainly), and it reads as the *start* of the review-and-confirm flow
 * (S7 in `docs/brand-and-product-foundation.md` §6) rather than a dead-end viewer — a pending
 * affordance sits where the candidate rows will land once extraction exists, and it settles into
 * a plain "not wired up yet" note instead of faking a result.
 * ------------------------------------------------------------------------------------------- */

function CaptionPreviewScreen({ probe, onDone }: { probe: ProbeSuccess; onDone: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-1 pb-6">
        <ScreenKicker icon={<SearchCheck className="size-3.5" aria-hidden />} label="Review & confirm" />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Looking for places
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

        {/* The pending affordance this task adds: where the candidate rows (`CandidateRow`,
            above) will render once extraction is wired up. `role="status"` carries the honest
            state to a screen reader once, rather than a silent shimmering list. */}
        <div className="flex flex-col gap-2" role="status">
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Places</p>
          <SkeletonCandidateRow />
          <SkeletonCandidateRow />
          <p className="pt-1 text-sm font-medium text-muted-foreground">
            Finding places in a post isn&rsquo;t built yet — this is where they&rsquo;ll show up.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4">
        <Button type="button" onClick={onDone} className="h-12 w-full rounded-lg text-base font-bold">
          Done
        </Button>
      </div>
    </div>
  );
}

/** A `CandidateRow`-shaped skeleton — same size, radius and rhythm as the real review row, so the
 *  eye reads it as "a place card is about to be here" rather than a generic loading bar. The
 *  pulse is the only motion; `motion-reduce` collapses it to a static tinted block, which still
 *  reads as pending without implying progress to a user who has asked for less motion. */
function SkeletonCandidateRow() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5"
    >
      <span className="size-8 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3.5 w-2/3 rounded-full bg-muted motion-safe:animate-pulse" />
        <span className="h-2.5 w-1/3 rounded-full bg-muted motion-safe:animate-pulse" />
      </div>
    </div>
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

/* ------------------------------------------------------------------------------------------- *
 * Dev-only demo control — a state jump list so a reviewer can see every screen without stepping
 * through the whole rail. Clearly separated, easy to delete once the real stream lands.
 * ------------------------------------------------------------------------------------------- */

function DevControls({
  screen,
  onNoPlaces,
  onReset,
}: {
  screen: Screen;
  onNoPlaces: () => void;
  onReset: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-2 border-t border-dashed border-amber-500/50 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-900 backdrop-blur">
      <span className="rounded bg-amber-200 px-1.5 py-0.5 uppercase tracking-wide">dev</span>
      <span className="truncate">screen: {screen.kind}</span>
      <div className="ml-auto flex gap-1.5">
        <button type="button" onClick={onNoPlaces} className="rounded border border-amber-500/50 px-2 py-1 hover:bg-amber-100">
          jump: no places
        </button>
        <button type="button" onClick={onReset} className="rounded border border-amber-500/50 px-2 py-1 hover:bg-amber-100">
          reset
        </button>
      </div>
    </div>
  );
}
