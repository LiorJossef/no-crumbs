/**
 * **Run something once the map has stopped moving** — the opening gate for the desktop place card.
 *
 * The card used to mount in the same commit as the selection, which is *before* the camera movers'
 * effects have finished animating. MapLibre's popup derives its anchor from the pin's current
 * screen position and re-derives it on every `move` event, so a card that opens mid-animation
 * flips from below the pin to above it as the pin crosses the vertical midpoint. Waiting for rest
 * removes the flip because the anchor is only ever computed once, at the position it will keep.
 *
 * `moveend`, not `idle`: `idle` additionally waits for every tile to finish loading, which is long
 * after the camera has settled and would read as the card being slow. The cost of `moveend` is that
 * it fires per camera command, and one commit can issue more than one — `easeTo`/`flyTo` both call
 * `stop()`, which fires a `moveend` for the command they are cancelling before their own begins.
 * Hence the re-check: on `moveend` we defer to a microtask (by which point any synchronously
 * chained command has already set the map moving again) and only act if the map is still at rest.
 * If it is not, the listener stays attached and the next `moveend` is asked the same question.
 */
export interface AtRestMap {
  isMoving(): boolean;
  on(type: 'moveend', listener: () => void): unknown;
  off(type: 'moveend', listener: () => void): unknown;
}

/**
 * Calls `action` immediately if the map is already at rest — the common path, since several
 * selections move no camera at all — otherwise on the first settled `moveend`. Returns a cancel
 * function that detaches the listener and guarantees `action` will not run afterwards; calling it
 * after `action` has already run is a no-op.
 */
export function whenAtRest(
  map: AtRestMap,
  action: () => void,
  defer: (fn: () => void) => void = queueMicrotask
): () => void {
  if (!map.isMoving()) {
    action();
    return () => {};
  }

  let settled = false;
  const stop = () => {
    if (settled) return;
    settled = true;
    map.off('moveend', onMoveEnd);
  };
  const check = () => {
    if (settled) return;
    // A second camera command started while the first was ending; keep waiting for its `moveend`.
    if (map.isMoving()) return;
    stop();
    action();
  };
  const onMoveEnd = () => defer(check);

  map.on('moveend', onMoveEnd);
  return stop;
}
