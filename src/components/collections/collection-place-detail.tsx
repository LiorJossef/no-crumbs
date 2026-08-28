'use client';

/**
 * One place, as seen from inside a collection.
 *
 * **What is on this screen is the whole privacy claim of the feature, made concrete.** It shows the
 * shared identity of the place (name, category, address), the note written *for the collection*,
 * and who put it there. It does not show — and cannot, because no policy grants it — the adder's
 * own note, their been / not-been mark, their tags, or the TikTok they saved it from. That is why
 * the sentence on the share panel is checkable rather than a reassurance.
 *
 * The one thing it says about the *caller's* own library is whether they already have this place,
 * which is their own row and nobody else's.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ExternalLink, MapPin, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/collections/collection-content';
import { canEdit, memberLabel, FORMER_MEMBER_LABEL } from '@/domain/collections/collection';
import { categoryDisplay, categoryLocalityLine } from '@/ui/place/category-display';
import { savedPlaceMapsUrl } from '@/ui/place/maps-link';
import {
  removeCollectionItem,
  saveCollectionPlace,
  updateCollectionItemNote,
} from '@/app/actions/collections';
import type { CollectionPlace } from '@/app/collections/_lib/get-collections';
import type { CollectionRole } from '@/domain/collections/collection';

export function CollectionPlaceDetail({
  collectionId,
  place,
  role,
  currentUserId,
  onBack,
}: {
  collectionId: string;
  place: CollectionPlace;
  role: CollectionRole;
  currentUserId: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const category = categoryDisplay(place.category);
  const editable = canEdit(role);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-4 pb-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the collection"
          onClick={onBack}
          data-vaul-no-drag
          className="-ml-2 size-11 shrink-0 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            style={{ backgroundColor: `${category.color}1F`, color: category.color }}
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <MapPin className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold leading-tight">
              <bdi>{place.name}</bdi>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <bdi>{categoryLocalityLine(place.category, place.locality)}</bdi>
            </p>
          </div>
        </div>

        {place.addressLine ? (
          <p dir="auto" className="mt-3 text-sm text-muted-foreground">
            {place.addressLine}
          </p>
        ) : null}

        {/* Attribution is shown only when it was not you: a twelve-row collection where every line
            reads "Added by you" is noise dressed as information. */}
        {place.addedBy !== currentUserId ? (
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <span>Added by</span>
            <span className="font-medium">
              {place.addedBy === null
                ? FORMER_MEMBER_LABEL
                : memberLabel({ displayName: place.addedByName, isYou: false })}
            </span>
          </p>
        ) : null}

        <SharedNote
          collectionId={collectionId}
          itemId={place.itemId}
          note={place.note}
          editable={editable}
        />

        <div className="mt-5 flex flex-col gap-2">
          <Button
            render={
              <a
                href={savedPlaceMapsUrl({
                  name: place.name,
                  addressLine: place.addressLine,
                  locality: place.locality,
                  lat: place.lat,
                  lng: place.lng,
                })}
                target="_blank"
                rel="noreferrer noopener"
              />
            }
            variant="outline"
            size="lg"
            className="h-11 w-full justify-between"
          >
            Open in Google Maps
            <ExternalLink className="size-4" aria-hidden />
          </Button>

          {/* The loop that makes a shared collection worth something: somebody adds a place, and
              everyone else can take it. It saves as `origin = 'manual'` because that is true — the
              recommendation came from a person, not from a TikTok this user imported. */}
          {place.savedByMe ? (
            <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <Check className="size-4" aria-hidden />
              Already in your places
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full justify-between"
              disabled={pending}
              data-vaul-no-drag
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await saveCollectionPlace(place.placeId);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  router.refresh();
                })
              }
            >
              Save to your places
              <Plus className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {editable ? (
          <div className="mt-8 border-t border-border/70 pt-4">
            {confirming ? (
              <InlineConfirm
                prompt="Remove from this collection?"
                confirmLabel="Remove"
                pending={pending}
                error={error}
                onCancel={() => setConfirming(false)}
                onConfirm={() =>
                  startTransition(async () => {
                    const result = await removeCollectionItem(collectionId, place.itemId);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    router.refresh();
                    onBack();
                  })
                }
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11 w-full justify-start px-1 text-destructive"
                onClick={() => setConfirming(true)}
                data-vaul-no-drag
              >
                Remove from this collection
              </Button>
            )}
            {/* Both strings say "from this collection" so it is never mistaken for deleting the
                place out of anyone's own library, which this does not do. */}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The shared note. Saves on blur rather than behind an Edit mode — the field is the control. */
function SharedNote({
  collectionId,
  itemId,
  note,
  editable,
}: {
  collectionId: string;
  itemId: string;
  note: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!editable) {
    // Absent when empty, never "No note yet": a viewer has nothing to do about it.
    if (!note) return null;
    return (
      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Shared note
        </p>
        <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <label
        htmlFor={`shared-note-${itemId}`}
        className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        Shared note
      </label>
      <textarea
        id={`shared-note-${itemId}`}
        dir="auto"
        value={value}
        maxLength={500}
        rows={3}
        data-vaul-no-drag
        placeholder="Add a note everyone here can see"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if ((value.trim() || null) === note) return;
          startTransition(async () => {
            const result = await updateCollectionItemNote(collectionId, itemId, value);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setError(null);
            router.refresh();
          });
        }}
        className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
