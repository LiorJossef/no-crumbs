'use client';

/**
 * `AddSheet` with its wiring — the query, the library matches, the manual-add call and the
 * collection call — so the sheet itself stays presentational and every surface that grows a `＋`
 * gets the same behaviour instead of a second copy of it.
 *
 * The split is the one `add-sheet.tsx` asks for in its own header: that file owns which pane is
 * showing and nothing else, because that is the only state that dies with the sheet. Everything
 * here outlives it or reaches the server.
 *
 * ## The quota rule, which is the whole shape of this component
 *
 * Google Places is 100 lookups/day. So:
 *
 *  - **typing** runs `libraryResults`, which is `Array.prototype.filter` over the places already in
 *    memory. No request, no debounce, no pending state, nothing to spend;
 *  - **the manual-add row** — an explicit press — calls `addPlaceManually`, which is the only
 *    provider lookup on this path.
 *
 * There is deliberately no `useEffect` in this file. An effect on `query` is exactly how a
 * per-keystroke provider search gets added by accident later, so there is no place for one to be
 * added *to*: the open-reset below is React's own render-phase "adjust state when a prop changes"
 * pattern, the same one `AddSheet` uses for its pane.
 */

import { useMemo, useState, useTransition } from 'react';

import { addPlaceManually, type ManualAddResult } from '@/app/actions/manual-add';
import { useCreateCollection } from '@/components/collections/use-create-collection';
import type { MapPlace } from '@/components/map/types';
import { AddSheet } from './add-sheet';
import { libraryResults } from './library-results';

/** What the caller is told about a save that happened. The success arm of `ManualAddResult`,
 *  narrowed — the caller never sees a failure, because a failure keeps the sheet open. */
export type ManualAddSaved = Extract<ManualAddResult, { ok: true }>;

export interface AddSheetHostProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The library to search. The same array the map and the list are drawn from, so a match here is
   *  a pin there. */
  readonly places: readonly MapPlace[];
  /** A saved place was picked out of the matches. The sheet is already closed; the caller opens it
   *  however it opens places. */
  readonly onSelectPlace: (id: string) => void;
  /** A TikTok link was submitted. The sheet is already closed. */
  readonly onSubmitTikTok: (url: string) => void;
  /** A place was written. The sheet is already closed and `/map` has been revalidated, so the row
   *  is either on its way or already here. */
  readonly onManualSaved: (saved: ManualAddSaved) => void;
}

export function AddSheetHost({
  open,
  onOpenChange,
  places,
  onSelectPlace,
  onSubmitTikTok,
  onManualSaved,
}: AddSheetHostProps) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const collection = useCreateCollection();

  // A fresh open starts clean. Computed during render rather than in an effect, per React's own
  // "adjusting some state when a prop changes" pattern — and on *open* rather than on close, so
  // nothing changes underneath the drawer while it animates out.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setQuery('');
      setError(null);
      collection.clearError();
    }
  }

  // Free, and it has to stay free: see the header.
  const results = useMemo(() => libraryResults(places, query), [places, query]);

  return (
    <AddSheet
      open={open}
      onOpenChange={onOpenChange}
      value={query}
      onValueChange={(value) => {
        setQuery(value);
        // A message about the last submit is not about what is being typed now.
        setError(null);
      }}
      results={results}
      onSelectResult={(id) => {
        onOpenChange(false);
        onSelectPlace(id);
      }}
      onSubmitTikTok={(url) => {
        onOpenChange(false);
        onSubmitTikTok(url);
      }}
      onAddManually={(text) => {
        setError(null);
        startTransition(async () => {
          const result = await addPlaceManually(text);
          if (!result.ok) {
            // The sheet stays open with the field intact. "We couldn't find that place" is a
            // sentence about the words in the box, so taking the box away with it would leave the
            // user nothing to correct.
            setError(result.message);
            return;
          }
          onOpenChange(false);
          onManualSaved(result);
        });
      }}
      placeBusy={pending}
      placeError={error}
      onCreateCollection={(name) => {
        void collection.create(name).then((created) => {
          // `useCreateCollection` navigates into the new collection on success; closing as well is
          // what stops the sheet riding along on top of the page it just pushed.
          if (created) onOpenChange(false);
        });
      }}
      collectionPending={collection.pending}
      collectionError={collection.error}
    />
  );
}
