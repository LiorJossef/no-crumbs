/**
 * **The map is uncovered *into* the post-import flight, not before it** — `W6-7`, the last beat of
 * the demo and the one §8a Q2 would judge if the flow could be run end to end here.
 *
 * ## The sequence this replaces
 *
 * `ImportPageClient`'s `backToMapWithFreshData` calls `onSaved`, `router.refresh()` and `onClose`
 * one after another, synchronously. So the overlay unmounted immediately — but the flight could
 * not happen yet: `focusPlaceIds` is guarded on the ids being present in `places`
 * (`map-surface.mapcn.tsx`), and `places` only changes when the refresh's server round trip lands.
 *
 * The user therefore saw three beats where the product means one: confirm, a still map sitting
 * exactly where it had been, and then — a few hundred milliseconds later — a flight.
 *
 * Source assertions, for the reason `zero-state-first-screen.test.ts` states: this suite runs in
 * node with no renderer and `map-page-client.tsx` cannot be imported at all.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
const IMPORT = readFileSync('src/app/import/import-page-client.tsx', 'utf8');

describe('the overlay waits for the flight it is covering', () => {
  /** A save arms the hold; the ids are the same ones handed to the camera, so there is no second
   *  idea of what the import produced. */
  it('holds the ids the camera was given', () => {
    expect(PAGE).toContain('camera.framePlaces(outcome.savedPlaceIds);');
    expect(PAGE).toContain('pendingRevealRef.current = outcome.savedPlaceIds;');
    expect(PAGE).toContain('setPendingReveal(outcome.savedPlaceIds);');
  });

  /**
   * **A ref *and* state, and both are load-bearing.** `onClose` fires in the same synchronous
   * handler as `onSaved`, before React re-renders, so a close that read state would always see
   * `null` and would always close — the hold would never engage. The state exists because the
   * release has to re-run when `places` changes, which a ref cannot do.
   */
  it('reads the hold synchronously and releases it reactively', () => {
    expect(PAGE).toContain('if (pendingRevealRef.current === null) setShowImport(false);');
    expect(PAGE).toContain('}, [pendingReveal, places]);');
  });

  /**
   * **The release condition is the surface's own**, which is the whole mechanism: both wait for the
   * saved ids to appear in `places`, and React runs effects children-first, so on that commit the
   * surface flies and *then* this page uncovers it. Neither knows about the other.
   */
  it('waits for exactly what the flight waits for', () => {
    expect(PAGE).toContain('pendingReveal.some((id) => places.some((place) => place.id === id))');
    // The surface's half of the same condition, quoted so a change to it fails here too.
    expect(SURFACE).toContain('const wanted = new Set(focusPlaceIds);');
    expect(SURFACE).toContain('if (!target) return; // The refreshed places have not arrived yet');
  });

  /**
   * **A floor under the hold, for the same reason the pin landing has one.** `router.refresh()` is
   * a server round trip: it can be slow, fail, or return rows that do not contain what was saved.
   * Without a timeout the confirm screen would sit there for the life of the page and an import
   * that had *succeeded* would look hung.
   */
  it('uncovers the map anyway if the rows never arrive', () => {
    expect(PAGE).toContain('const timer = setTimeout(release, REVEAL_HOLD_MAX_MS);');
    expect(PAGE).toContain('return () => clearTimeout(timer);');
    expect(PAGE).toMatch(/const REVEAL_HOLD_MAX_MS = \d+;/);
  });

  /**
   * **Closing by hand always closes.** Only a *save* defers. The ✕ is reachable throughout the
   * flow, and a close button that sometimes does nothing is worse than any beat it might buy.
   */
  it('never defers a close the user asked for', () => {
    const onClose = PAGE.slice(PAGE.indexOf('onClose={() => {'), PAGE.indexOf('onAddManually'));
    expect(onClose).toContain('setShowImport(false)');
    // `onAddManually` is the no-places recovery and must also leave at once — it is going
    // somewhere else, not watching a flight.
    expect(PAGE).toContain('onAddManually={() => {\n                      setShowImport(false);');
  });

  /** The sequence being fixed, quoted from the file that produces it, so a change there surfaces
   *  here rather than silently making this package a no-op. */
  it('is built against the import flow that actually exists', () => {
    expect(IMPORT).toContain('if (detail && detail.saved > 0) onSaved?.(detail);');
    expect(IMPORT).toContain('router.refresh();');
    expect(IMPORT).toContain('onClose();');
  });
});
