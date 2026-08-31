'use client';

/**
 * "Add to a collection", from a place you have saved.
 *
 * Two states in one component: a row that reports which collections this place is in, and — when
 * opened — the picker that replaces the detail's content in place. The picker is **not** a dialog
 * stacked over the sheet, for the reason `use-non-modal-background.ts` records: a second overlay
 * over the vaul drawer is how `<main>` gets marked `aria-hidden` and the map page disappears from
 * the accessibility tree.
 *
 * Toggling writes immediately and optimistically. There is no Save button, so the back control is
 * the only exit and nothing is ever left pending behind it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight, FolderPlus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addToCollectionLabel, useCollections } from '@/ui/place/collections-context';
import {
  addPlacesToCollection,
  createCollection,
  removePlaceFromCollection,
} from '@/app/actions/collections';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';

/** One pane's back control, drawn by whoever hosts the pane. */
export interface HostedPaneBackControl {
  readonly label: string;
  readonly onBack: () => void;
}

/**
 * A host that already draws a back-shaped control in its own header, and will draw this pane's
 * instead of letting it draw a second one.
 *
 * `/collections/[id]` is the case: the place detail there is hosted under a `Back to the
 * collection` arrow, so a picker with its own arrow puts two of them on screen at once — which
 * `docs/ux-collections-as-scope.md` §2.2 forbids outright. `/map` provides nothing, its host
 * affordance is an `×`, and the picker keeps its own arrow there.
 */
export const HostedPaneBackContext = createContext<{
  readonly setBack: (back: HostedPaneBackControl | null) => void;
} | null>(null);

export function AddToCollection({ placeId }: { placeId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const collections = useCollections();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Stable, because a host may hold onto it: see `HostedPaneBackContext`.
  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back to what opened it; a back control that drops focus at the top of the
    // document strands a keyboard user mid-task.
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  // No provider, or a place we cannot identify (a row not built from a real saved place): show
  // nothing rather than a control that cannot work.
  if (!collections || placeId === undefined) return null;

  const inIds = collections.byPlaceId[placeId] ?? [];
  const names = collections.collections
    .filter((collection) => inIds.includes(collection.id))
    .map((collection) => collection.name);
  const { text, name } = addToCollectionLabel(names);

  if (open) {
    return <CollectionPicker placeId={placeId} onBack={close} />;
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      data-vaul-no-drag
      className={cn(
        // The bare `transition-colors` goes rather than gaining a prefix — `PRESS_BEAT` carries
        // colour and transform together, so an un-prefixed one beside it would reach only the
        // users who asked for less motion.
        'flex min-h-12 w-full items-center gap-2.5 rounded-lg px-1 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      <FolderPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 items-baseline gap-1">
        <span className="shrink-0">{text}</span>
        {name ? <bdi className="min-w-0 truncate">{name}</bdi> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** Named once: the host that borrows this control announces it with the same words. */
const BACK_LABEL = 'Back to the place';

/** Exported for the test that holds the one-back-control invariant: the picker opens on a press,
 *  and there is no DOM in this suite to press with. */
export function CollectionPicker({ placeId, onBack }: { placeId: string; onBack: () => void }) {
  const router = useRouter();
  const collections = useCollections();
  const serverIn = useMemo(
    () => collections?.byPlaceId[placeId] ?? [],
    [collections, placeId],
  );

  const [optimisticIn, toggleOptimistic] = useOptimistic(
    serverIn,
    (current: readonly string[], collectionId: string) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId],
  );

  const [failed, setFailed] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [, startTransition] = useTransition();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const host = useContext(HostedPaneBackContext);

  useEffect(() => {
    if (!host) return;
    host.setBack({ label: BACK_LABEL, onBack });
    return () => host.setBack(null);
  }, [host, onBack]);

  function toggle(collectionId: string) {
    const wasIn = optimisticIn.includes(collectionId);
    startTransition(async () => {
      toggleOptimistic(collectionId);
      setFailed(null);
      const result = wasIn
        ? await removePlaceFromCollection(collectionId, placeId)
        : await addPlacesToCollection(collectionId, [placeId]);
      if (!result.ok) {
        setFailed(collectionId);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 pb-1">
        {/* Nothing here when the host draws it: two back-shaped controls on one screen is the
            ambiguity `ux-collections-as-scope.md` §2.2 exists to forbid. */}
        {host ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={BACK_LABEL}
            onClick={onBack}
            data-vaul-no-drag
            className="-ms-2 size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        )}
        <p ref={headingRef} tabIndex={-1} className="font-heading text-sm font-bold outline-none">
          Add to…
        </p>
      </div>

      {composing ? (
        <form
          className="flex flex-col gap-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const created = await createCollection(name, '');
              if (!created.ok) return;
              await addPlacesToCollection(created.id, [placeId]);
              setName('');
              setComposing(false);
              router.refresh();
            });
          }}
        >
          <Input
            autoFocus
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Tel Aviv food"
            maxLength={80}
            className="h-11 text-base"
            data-vaul-no-drag
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="lg"
              className="h-11 flex-1"
              disabled={name.trim().length === 0}
              data-vaul-no-drag
            >
              Create and add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => setComposing(false)}
              data-vaul-no-drag
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          data-vaul-no-drag
          className={cn(
            'flex min-h-11 items-center gap-2.5 border-b border-border/70 px-1 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            PRESS_ROW,
          )}
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          New collection
        </button>
      )}

      {collections && collections.collections.length > 0 ? (
        <ul>
          {collections.collections.map((collection) => {
            const isIn = optimisticIn.includes(collection.id);
            return (
              <li key={collection.id} className="border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isIn}
                  onClick={() => toggle(collection.id)}
                  data-vaul-no-drag
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 px-1 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    PRESS_ROW,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border',
                      isIn ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {isIn ? <Check className="size-3" /> : null}
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">
                    {collection.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {collection.placeCount}
                  </span>
                </button>
                {failed === collection.id ? (
                  <p role="alert" className="pb-1.5 pl-8 text-xs text-destructive">
                    Couldn&apos;t change that. Try again.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-4 text-sm text-muted-foreground">
          You don&apos;t have any collections yet.
        </p>
      )}
    </div>
  );
}
