'use client';

/**
 * The map shell's state: **one** camera focus slot, **one** open place, **one** sheet position.
 *
 * A hook rather than state inside `MapShell`, because the writers live *above* the shell in the
 * tree. `/map`'s eight camera movers are handlers on `map-page-client.tsx`, and a collection's
 * re-fit fires from an effect in `collection-client.tsx`; neither can call into a child component
 * without a ref. The same shape `useNearMe` and `useCreateCollection` already use here: the route
 * calls the hook, uses the writers in its own handlers, and hands the whole object to `MapShell`.
 *
 * ## Why the focus slot is one cell and not three
 *
 * There were three across two routes: `/map`'s `focusPlaceIds` (movers 2, 3, 4, 7) and its
 * `focusBounds` (movers 5, 8), plus `/collections/[id]`'s own `focusPlaceIds` (a membership re-fit
 * and a row tap). The surface keys each flight on the *identity* of what it is given, so whoever
 * writes last wins and a re-render that changes nothing cannot re-fly — but that argument only
 * holds inside one cell. Across two, "last writer wins" is not a property of the state at all; it
 * is a property of the order two independent effects happen to run in.
 *
 * So there is one cell holding a discriminated union, and `MapShell` spreads it back onto the
 * surface's two existing props. `ux-collections-as-scope.md` §5 item 10 asked for this; the surface
 * needs no change.
 */

import { useCallback, useMemo, useState } from 'react';

import type { FocusBoundsRequest } from '@/components/map/types';
import { STOP_TO_SNAP, snapToStop, type SheetStop } from './sheet-geometry';

/**
 * A camera request, in the terms it was asked for.
 *
 * `places` frames a set of pins under a zoom *ceiling*; `bounds` frames a box and comes to rest
 * inside a zoom *range*. They are two arms rather than one because a country tap cannot be
 * expressed as a `fitBounds` — see `map-surface.mapcn.tsx`'s `Framing`, which keeps the same
 * distinction for the same reason.
 */
export type CameraFocus =
  | { readonly kind: 'places'; readonly ids: readonly string[] }
  | { readonly kind: 'bounds'; readonly request: FocusBoundsRequest };

export interface ShellCamera {
  /**
   * Frame exactly these places. A **fresh array every call**, deliberately: the flight is keyed on
   * identity, so re-selecting the place you are already on flies again rather than sitting there
   * doing nothing.
   */
  readonly framePlaces: (ids: readonly string[]) => void;
  /** Frame this box, coming to rest inside its zoom range. Keyed on identity the same way. */
  readonly frameBounds: (request: FocusBoundsRequest) => void;
}

export interface ShellSheet {
  /** Which of the three stops the sheet is at now. */
  readonly stop: SheetStop;
  /** Move it, from anywhere. The pushed panes use this; so does the peek row's expand control. */
  readonly goTo: (stop: SheetStop) => void;
  /** The raw vaul value and its setter. For `MapShell`'s `Drawer.Root` only — everything else
   *  should speak in stops. */
  readonly snap: number | string | null;
  readonly setSnap: (snap: number | string | null) => void;
}

export interface MapShellState {
  readonly focus: CameraFocus | null;
  readonly camera: ShellCamera;
  readonly sheet: ShellSheet;
  /**
   * The **id** of the open place, never the object.
   *
   * Holding the object made the detail a snapshot: a Server Action calls `revalidatePath`, fresh
   * objects arrive, and the open panel goes on rendering the copy it captured when the pin was
   * tapped. Measured 2026-08-28 on `/map`: changing a place's category updated its row to `Bar`
   * while the open panel said `Dessert` until the user reselected it. The scope resolves this id
   * against its own current data on every render, which is what makes an edit visible in the panel
   * it was made in.
   *
   * What the id *means* is the scope's business — a `saved_places` id on `/map`, a collection item
   * id in a collection. The shell only needs to know whether something is open.
   */
  readonly selectedId: string | null;
  readonly setSelectedId: (id: string | null) => void;
}

interface SheetState {
  readonly snap: number | string | null;
  /** The stop to restore when the open place closes — kept in state rather than a ref so the
   *  transition below is computed during render, per React's own "adjust state when a prop
   *  changes" pattern, with no effect and no mid-render ref write. */
  readonly previousStop: SheetStop;
  readonly lastSelectedId: string | null;
}

export function useMapShell({
  restingStop,
}: {
  /** Where this scope's sheet sits when nothing is open. `peek` on `/map`; `half` in a collection,
   *  which is why that route's camera concedes more than a 128 px strip. */
  readonly restingStop: SheetStop;
}): MapShellState {
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({
    snap: STOP_TO_SNAP[restingStop],
    previousStop: restingStop,
    lastSelectedId: null,
  });

  /**
   * Rising to `half` for a newly opened place, and restoring the prior stop when it closes.
   *
   * Lifted verbatim out of `PlaceSheet`, including the null-normalisation: both sides of the guard
   * have to be `string | null`, because comparing an `undefined` against a stored `null` never
   * closes it and the render loop never terminates.
   */
  if (selectedId !== sheet.lastSelectedId) {
    const current = snapToStop(sheet.snap);
    setSheet({
      snap: selectedId === null ? STOP_TO_SNAP[sheet.previousStop] : STOP_TO_SNAP.half,
      previousStop: selectedId !== null && current !== 'half' ? current : sheet.previousStop,
      lastSelectedId: selectedId,
    });
  }

  const camera = useMemo<ShellCamera>(
    () => ({
      framePlaces: (ids) => setFocus({ kind: 'places', ids: [...ids] }),
      frameBounds: (request) => setFocus({ kind: 'bounds', request }),
    }),
    [],
  );

  const setSnap = useCallback(
    (snap: number | string | null) => setSheet((state) => ({ ...state, snap })),
    [],
  );
  const goTo = useCallback((stop: SheetStop) => setSnap(STOP_TO_SNAP[stop]), [setSnap]);

  const stop = snapToStop(sheet.snap);
  const sheetApi = useMemo<ShellSheet>(
    () => ({ stop, goTo, snap: sheet.snap, setSnap }),
    [stop, goTo, sheet.snap, setSnap],
  );

  return { focus, camera, sheet: sheetApi, selectedId, setSelectedId };
}

/**
 * The focus slot as the surface's two props, ready to spread.
 *
 * Exported so it can be tested without a WebGL context, and so the one place that answers "which
 * prop does this focus become" is not inside a JSX attribute list. A conditional spread rather than
 * an explicit `undefined`, because `exactOptionalPropertyTypes` is on and the surface's own
 * already-flown guards early-return on an absent prop.
 */
export function focusProps(focus: CameraFocus | null): {
  focusPlaceIds?: readonly string[];
  focusBounds?: FocusBoundsRequest;
} {
  if (focus === null) return {};
  return focus.kind === 'places' ? { focusPlaceIds: focus.ids } : { focusBounds: focus.request };
}
