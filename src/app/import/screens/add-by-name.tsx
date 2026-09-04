'use client';

/**
 * The add-by-name recovery on the no-places screen — `spec-no-places-found.md` §5.2, and the half
 * of that screen that makes it a destination rather than a dead end.
 *
 * The user watched the video. They know the place. Four taps and one word of typing from a screen
 * they did not ask for: tap the field, type, `Search →`, tap a result, `Add to my map →`.
 *
 * **This is also what closes finding 10.** The standalone `/import` route silently withheld the
 * screen's primary recovery, because the only one on offer was `onAddManually`, which opens a `＋`
 * sheet that exists on `/map` and nowhere else. A field here depends on no host, so the recovery is
 * present on every entry point by construction rather than by a prop somebody remembered to thread.
 *
 * ## The cost rule, and it is a design rule rather than an optimisation (§6.4)
 *
 * **No type-ahead, no debounce, no search on keystroke, blur or paste.** One lookup happens when,
 * and only when, the user submits. A second submit while one is in flight is **refused** — not
 * queued and not aborted-and-restarted — which is the same shape as `inFlightProbe` and for the
 * same reason: five taps must not become five lookups against a 100/day provider ceiling.
 *
 * It is also the better interaction. Type-ahead over a global place index produces a flickering
 * list that punishes typing, and the person here is entering a name they already know.
 *
 * ## The field never autofocuses
 *
 * Three in four imports land on this screen. Raising the software keyboard uninvited on three in
 * four imports, over the caption the user needs to read, is the single worst thing it could do.
 * That is the opposite of F0's paste field, which *should* autofocus — arriving there means you
 * already have a link.
 *
 * ## Offline is checked before the request, not after it (§6.7)
 *
 * So an offline submit costs nothing and says the true thing immediately, rather than surfacing as
 * a generic failure a moment later.
 *
 * ## Zero results is designed, not an error (§6.6)
 *
 * Muted body text in the same register as the screen around it — no destructive colour, no icon —
 * and the query stays in the field so it can be edited rather than retyped. No suggestions engine
 * and no "did you mean": a wrong suggestion here costs more than no suggestion. Red is reserved for
 * a failed *add*, which is a real failure of an action the user took.
 *
 * ## It never auto-selects, even at N = 1
 *
 * Charter §3 invariant 2 is uniform across both save paths: the save is one explicit press. A
 * single result is still a result to choose, not a decision already made.
 */

import { useId, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** What a completed add hands back, so the host can close the flow and fly the camera exactly as it
 *  does after a confirm. A save from here is not a lesser save. */
export interface AddByNameOutcome {
  readonly savedPlaceId: string;
  readonly name: string;
  readonly alreadySaved: boolean;
}

interface SearchResult {
  readonly index: number;
  readonly name: string;
  readonly address: string;
}

/** `spec-no-places-found.md` §5.2, verbatim. Nothing below composes a sentence at its call site. */
const OFFER = 'Know where this one is? Add it by name.';
const PLACEHOLDER = 'Search for a place';
const SUBMIT = 'Search →';
const SUBMIT_PENDING = 'Searching…';
const OFFLINE = 'You’re offline. Check your connection and try again.';
const UNAVAILABLE = 'Search isn’t working right now. Try again in a moment.';
const TRY_ANOTHER_NAME = 'Try a different name.';
const ADD = 'Add to my map →';
const ADD_PENDING = 'Adding…';
const ADD_PROVENANCE = 'We’ll link it to this TikTok video.';
const BACK_TO_RESULTS = 'Back to results';
const REMOVE_SCOPE = 'Search everywhere instead';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'results'; readonly results: readonly SearchResult[]; readonly query: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'confirm'; readonly results: readonly SearchResult[]; readonly query: string; readonly chosen: SearchResult }
  | { readonly kind: 'saving'; readonly chosen: SearchResult }
  | { readonly kind: 'save_failed'; readonly results: readonly SearchResult[]; readonly query: string; readonly chosen: SearchResult };

export function AddByName({
  className,
  sourceId,
  cityHint,
  onSubmitted,
  onAdded,
}: {
  /** The caller pins this block to the bottom of its column (`mt-auto`), which is §4.1's whole
   *  point: the primary control belongs in the thumb zone, it rises with the software keyboard's
   *  own scroll-into-view rather than ending up under it, and a field in the action zone under a
   *  sentence naming what it is for reads as an offer rather than as a form. */
  className?: string;
  /** The `sources.id` this import fetched. A place added here is linked to the TikTok it came
   *  from — the product's "which post made me save this?" question must have a real answer, and
   *  this is the reason inlining the search beats routing to a standalone add screen. */
  sourceId: string;
  /** Case C's scope, and only case C's: a city the caption actually named, which the user can see
   *  and remove. Never the map's viewport — "where you happen to be looking" is not something they
   *  said, and it would silently narrow a Lisbon restaurant typed while looking at Tel Aviv. */
  cityHint: string | null;
  /** The caption panel collapses on submit (§6.5): it has done its job, and keeping it open would
   *  leave ~150px of read text between the query and its answer. */
  onSubmitted: () => void;
  onAdded: (outcome: AddByNameOutcome) => void;
}) {
  const fieldId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [scoped, setScoped] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /**
   * The lookup in flight, if any. A ref rather than state, and set synchronously before the first
   * `await`, so a burst of submits dispatched inside a single task finds it held and returns —
   * exactly `inFlightProbe`'s shape, for exactly its reason.
   */
  const inFlight = useRef(false);

  const scope = scoped ? cityHint : null;

  async function submit() {
    const text = query.trim();
    if (text === '' || inFlight.current) return;
    // Checked here rather than after the request, so an offline submit costs nothing and says the
    // true thing immediately.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase({ kind: 'failed', message: OFFLINE });
      return;
    }
    inFlight.current = true;
    setPhase({ kind: 'pending' });
    onSubmitted();
    try {
      const res = await fetch('/api/imports/place-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'search', query: text, cityHint: scope }),
      });
      const body = (await res.json()) as
        | { ok: true; results: readonly SearchResult[] }
        | { ok: false; message?: string };
      if (!res.ok || !body.ok) {
        setPhase({ kind: 'failed', message: ('message' in body && body.message) || UNAVAILABLE });
        return;
      }
      // An empty list is a result, not a failure — see this file's header.
      setPhase({ kind: 'results', results: body.results, query: text });
    } catch {
      setPhase({ kind: 'failed', message: UNAVAILABLE });
    } finally {
      inFlight.current = false;
    }
  }

  async function add(chosen: SearchResult, results: readonly SearchResult[], searched: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: 'saving', chosen });
    try {
      const res = await fetch('/api/imports/place-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'add',
          query: searched,
          cityHint: scope,
          // A position and the name we showed. The name is a **check** the server compares and
          // discards, never an input — the browser may not say what a place is.
          optionIndex: chosen.index,
          expectedName: chosen.name,
          sourceId,
        }),
      });
      const body = (await res.json()) as
        | { ok: true; savedPlaceId: string; name: string; alreadySaved: boolean }
        | { ok: false; reason?: string; results?: readonly SearchResult[]; message?: string };
      if (res.ok && body.ok) {
        onAdded({ savedPlaceId: body.savedPlaceId, name: body.name, alreadySaved: body.alreadySaved });
        return;
      }
      // The provider's answer moved under the user while they were choosing. Not their failure and
      // not a message: the fresh list is the answer, and they choose again.
      if ('results' in body && body.results !== undefined) {
        setPhase({ kind: 'results', results: body.results, query: searched });
        return;
      }
      setPhase({ kind: 'save_failed', results, query: searched, chosen });
    } catch {
      setPhase({ kind: 'save_failed', results, query: searched, chosen });
    } finally {
      inFlight.current = false;
    }
  }

  const pending = phase.kind === 'pending';
  const saving = phase.kind === 'saving';

  return (
    <div className={cn('flex min-h-0 shrink-0 flex-col gap-2 border-t border-border/70 pt-4', className)}>
      {/*
        Announced once, politely, from a region that is always mounted — a live region created in
        the same commit as its first message is not reliably announced. Never `assertive`, and
        never `role="alert"`: nothing here is an alert, including a search that found nothing.
      */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {phase.kind === 'results'
          ? phase.results.length === 1
            ? `1 place matches “${phase.query}”.`
            : `${String(phase.results.length)} places match “${phase.query}”.`
          : ''}
      </p>

      {/* The results occupy the region above the field (§6.5), so the answer is never below the
          thing that asked for it and the keyboard cannot cover it. */}
      {phase.kind === 'results' && phase.results.length > 0 && (
        <ul className="flex max-h-56 min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain">
          {phase.results.map((result) => (
            <li key={result.index}>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'confirm', results: phase.results, query: phase.query, chosen: result })}
                // Name **and** address, because five rows all reading "Add" is the exact defect
                // `ux-import-review-screen.md` §1.7 found on the sibling surface — and because a
                // chain returns five rows with one name and the address is the whole difference.
                aria-label={`${result.name}, ${result.address}`}
                className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="line-clamp-1 text-caption font-bold text-foreground">
                  <bdi>{result.name}</bdi>
                </span>
                {/* Wraps rather than truncating: an ellipsis on an RTL string clips the start,
                    which is the half that identifies it. */}
                <span className="text-micro font-medium break-words text-muted-foreground">
                  <bdi>{result.address}</bdi>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {phase.kind === 'results' && phase.results.length === 0 && (
        // Muted body text, not destructive red, and no icon. The query stays in the field.
        <p className="text-caption font-medium text-muted-foreground">
          No places match “{phase.query}.” {TRY_ANOTHER_NAME}
        </p>
      )}

      {phase.kind === 'failed' && (
        <p className="text-caption font-medium text-muted-foreground">{phase.message}</p>
      )}

      {(phase.kind === 'confirm' || phase.kind === 'saving' || phase.kind === 'save_failed') && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3">
          <p className="line-clamp-2 text-caption font-bold text-foreground">
            <bdi>{phase.chosen.name}</bdi>
          </p>
          <p className="text-micro font-medium break-words text-muted-foreground">
            <bdi>{phase.chosen.address}</bdi>
          </p>
          {/* The one provenance claim this path may make, and it is true: the user found this place
              because of that post, and the save records it. It does not claim the caption named it. */}
          <p className="text-micro font-medium text-muted-foreground">{ADD_PROVENANCE}</p>
          {phase.kind === 'save_failed' && (
            <p role="status" className="text-caption font-semibold text-destructive">
              Couldn’t add that one. Try again.
            </p>
          )}
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              if (phase.kind === 'saving') return;
              void add(phase.chosen, phase.results, phase.query);
            }}
            className="h-12 w-full gap-1.5 rounded-lg text-base font-bold"
          >
            {/* `hidden` + `motion-safe:block`, never a bare `motion-safe:animate-spin`: prefixing
                alone leaves a stationary three-quarter arc under `prefers-reduced-motion`, which
                reads as a rendering artefact rather than as a paused spinner. `Adding…` beside it
                never leaves, so the state stays findable — which is the requirement, not that a
                glyph stays on screen. */}
            {saving && (
              <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
            )}
            {saving ? ADD_PENDING : ADD}
          </Button>
          {phase.kind !== 'saving' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPhase({ kind: 'results', results: phase.results, query: phase.query })}
              className="h-11 w-full rounded-lg text-sm font-bold"
            >
              {BACK_TO_RESULTS}
            </Button>
          )}
        </div>
      )}

      {/* A real `<form>`, so Enter and the phone keyboard's Search key both submit — the paste
          field's own fix is the precedent. */}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
          {OFFER}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={fieldId}
            type="search"
            // Never `autoFocus`: three in four imports land here, and raising the keyboard
            // uninvited over the caption the user needs to read is the worst thing this could do.
            enterKeyHint="search"
            // A proper noun, not a URL — the opposite of the paste field on both counts.
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            placeholder={PLACEHOLDER}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Returning to `idle` on an edit, and **not** issuing anything. The results on screen
              // answered a different string and would be a stale answer to a live question.
              if (phase.kind !== 'idle') setPhase({ kind: 'idle' });
            }}
            className="h-12 flex-1 rounded-lg border-2 border-input px-4 text-base font-medium"
          />
          <Button
            type="submit"
            disabled={pending || query.trim() === ''}
            className="h-12 shrink-0 gap-1.5 rounded-lg px-4 text-base font-bold"
          >
            {/* The spinner is the full-motion form; with reduced motion it is removed and
                `Searching…` alone carries the pending state, which is a complete equivalent rather
                than a shorter animation. Written as `hidden motion-safe:block` rather than
                `motion-reduce:hidden` so the un-prefixed state **is** the reduced one — forgetting
                the modifier can then only cost someone an animation, never impose one. */}
            {pending && (
              <Loader2 className="hidden size-4 motion-safe:block motion-safe:animate-spin" aria-hidden />
            )}
            {pending ? SUBMIT_PENDING : SUBMIT}
          </Button>
        </div>
        {cityHint !== null && scoped && (
          <span className="flex w-fit items-center gap-1 rounded-full bg-card-2 px-3 py-1 text-micro font-bold text-foreground">
            Near <bdi>{cityHint}</bdi>
            <button
              type="button"
              onClick={() => setScoped(false)}
              // Never a bare "✕": the label says what removing it does.
              aria-label={REMOVE_SCOPE}
              className="flex size-11 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        )}
      </form>
    </div>
  );
}
