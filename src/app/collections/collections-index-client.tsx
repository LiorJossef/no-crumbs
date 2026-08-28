'use client';

/**
 * The collections index: everything the user is in, and the one control that makes a new one.
 *
 * Rows with hairline dividers rather than a card each — a bordered box per collection is card soup
 * at four collections, and `docs/ux-collections.md` §1.1 rules it out for that reason. The create
 * control is a full-width primary in the thumb zone, and it opens a one-field composer in place
 * rather than navigating or opening a dialog: a dialog for a single text input costs a focus trap,
 * an escape handler and a backdrop in exchange for nothing.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CollectionCover } from '@/components/collections/collection-cover';
import { memberLabel } from '@/domain/collections/collection';
import { createCollection } from '@/app/actions/collections';
import type { CollectionSummary } from './_lib/get-collections';

export function CollectionsIndexClient({
  collections,
  libraryIsEmpty,
}: {
  collections: readonly CollectionSummary[];
  libraryIsEmpty: boolean;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldRef = useRef<HTMLInputElement>(null);

  const mine = collections.filter((collection) => collection.role === 'owner');
  const shared = collections.filter((collection) => collection.role !== 'owner');

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCollection(name, '');
      if (!result.ok) {
        setError(result.message);
        fieldRef.current?.focus();
        return;
      }
      // Straight into it: a new empty collection you cannot see is a dead end.
      router.push(`/collections/${result.id}` as `/collections/${string}`);
    });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Button
          render={<Link href="/map" />}
          nativeButton={false}
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the map"
          className="size-11 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h1 className="font-heading text-lg font-bold tracking-tight">Collections</h1>
      </header>

      <div className="mx-auto w-full max-w-[560px] flex-1 px-4 pb-4">
        {collections.length === 0 ? (
          <EmptyIndex libraryIsEmpty={libraryIsEmpty} />
        ) : (
          <>
            {mine.length > 0 ? <Section title="Yours" collections={mine} /> : null}
            {shared.length > 0 ? <Section title="Shared with you" collections={shared} /> : null}
          </>
        )}
      </div>

      {/* Sticky at the bottom on a phone (thumb zone), static once there is room. */}
      <div className="sticky bottom-0 mx-auto w-full max-w-[560px] border-t border-border/70 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur lg:static lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none">
        {composing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor="new-collection-name" className="text-sm font-medium">
              Name this collection
            </label>
            <Input
              id="new-collection-name"
              ref={fieldRef}
              autoFocus
              dir="auto"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Tel Aviv food"
              enterKeyHint="done"
              autoCapitalize="sentences"
              maxLength={80}
              aria-invalid={error !== null}
              aria-describedby={error ? 'new-collection-error' : undefined}
              className="h-12 text-base"
            />
            {error ? (
              <p id="new-collection-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="h-14 w-full text-base"
              disabled={pending || name.trim().length === 0}
            >
              {pending ? 'Creating…' : 'Create'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-muted-foreground"
              onClick={() => {
                setComposing(false);
                setError(null);
                setName('');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => setComposing(true)}
          >
            <Plus className="size-4" aria-hidden />
            New collection
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyIndex({ libraryIsEmpty }: { libraryIsEmpty: boolean }) {
  return (
    <div className="py-10 text-center">
      <p className="font-heading text-base font-bold">Nothing collected yet.</p>
      {libraryIsEmpty ? (
        <>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Save some places first, then group them here.
          </p>
          <Button
            render={<Link href="/map" />}
            nativeButton={false}
            variant="outline"
            size="lg"
            className="mt-5 h-11"
          >
            Go to your map
          </Button>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          A collection is a set of places you can share with one other person.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  collections,
}: {
  title: string;
  collections: readonly CollectionSummary[];
}) {
  return (
    <section className="mb-6">
      <h2 className="px-1 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul>
        {collections.map((collection) => (
          <li key={collection.id} className="border-b border-border/70 last:border-b-0">
            <Link
              href={`/collections/${collection.id}` as `/collections/${string}`}
              // The accessible name carries every fact the colour strip cannot (§8.4).
              aria-label={rowAccessibleName(collection)}
              className="flex min-h-[76px] items-center gap-3 rounded-lg px-1 py-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/* Two bidi rules, and they are separable. `<bdi>` isolates the name's own
                    direction *without* flipping the row: `dir="auto"` on the paragraph would make
                    an all-Hebrew name right-align while the count line beside it stayed left, so a
                    mixed list would have a ragged left edge. And `line-clamp-2` rather than
                    `truncate`, because an ellipsis on an RTL string inside an LTR box clips the
                    *beginning* — the identifying half. */}
                <p className="line-clamp-2 font-heading text-base font-bold">
                  <bdi>{collection.name}</bdi>
                </p>
                {/* Never one interpolated string: a count and an RTL name on one line reorder. */}
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span>{placeCountLabel(collection.placeCount)}</span>
                  {secondFact(collection) ? (
                    <>
                      <span aria-hidden>·</span>
                      <bdi>{secondFact(collection)}</bdi>
                    </>
                  ) : null}
                </p>
                <CollectionCover categories={collection.categories} className="mt-0.5" />
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The second half of the count line. On your own collection it is how many people are in it (and
 *  nothing at all when it is only you); on a shared one it is who it came from. */
function secondFact(collection: CollectionSummary): string | null {
  if (collection.role !== 'owner') {
    // "From Maya", never "Maya's collection": a possessive apostrophe on a Hebrew name renders on
    // the wrong side and reads as a typo.
    return `From ${memberLabel({ displayName: collection.ownerName, isYou: false })}`;
  }
  if (collection.memberCount > 1) return `${collection.memberCount} people`;
  return null;
}

function placeCountLabel(count: number): string {
  if (count === 0) return 'No places yet';
  return `${count} place${count === 1 ? '' : 's'}`;
}

function rowAccessibleName(collection: CollectionSummary): string {
  const parts = [collection.name, placeCountLabel(collection.placeCount).toLowerCase()];
  const second = secondFact(collection);
  if (second) parts.push(second);
  if (collection.role === 'viewer') parts.push('view only');
  return parts.join(', ');
}
