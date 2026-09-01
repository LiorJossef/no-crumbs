/**
 * **The drawer's view swap, driven through every transition it can make.**
 *
 * `components/ui/view-swap.tsx` exists because a React `key` change unmounts the outgoing subtree
 * in the same commit as it mounts the incoming one, so a view switch had nothing on screen to carry
 * the eye — the collections list faded up over the sheet's own empty card. The component's answer
 * is to hold the outgoing subtree for one exit beat, and **holding the wrong thing is the failure
 * mode**: the wrong node, the wrong direction, a layer that never gets dropped, or a layer dropped
 * by the wrong `animationend`.
 *
 * None of that is checkable by rendering. `vitest.config.ts` runs a `node` environment with no DOM,
 * and `renderToStaticMarkup` renders once while a swap is by definition two renders. So the whole
 * of the logic is `nextSwapState` and `withoutLeaving`, exported for exactly this, and what is left
 * in the component is markup and two class lookups.
 *
 * The alternative — grepping the component's source for class names — is the *"asserting a proxy
 * instead of an invariant"* species `iteration-2-record.md` §8.1 names: it would pass on a version
 * that captured the wrong layer and fail on a rename that changed nothing.
 */

import { describe, expect, it } from 'vitest';

import {
  nextSwapState,
  withoutLeaving,
  type SwapState,
} from '@/components/ui/view-swap';

/** Stand-ins for the rendered views. `nextSwapState` is deliberately opaque to what a node is —
 *  it compares by identity and never reads one — so a string is a truthful `ReactNode` here. */
const PLACES = 'places-list';
const INDEX = 'collections-index';
const ONE = 'collection-one';
const ONE_REFRESHED = 'collection-one-after-an-edit';

function atIndex(): SwapState {
  return { key: 'index', node: INDEX, direction: 'forward', arrival: 'swap', leaving: null };
}

describe('a swap holds the view it is replacing', () => {
  it('captures the outgoing node, not just its key', () => {
    const after = nextSwapState(atIndex(), {
      key: 'collection:c1',
      node: ONE,
      direction: 'forward',
    });

    expect(after.key).toBe('collection:c1');
    expect(after.node).toBe(ONE);
    // The point of the whole component: the list the user was reading is still in the tree.
    expect(after.leaving).toEqual({ key: 'index', node: INDEX, direction: 'forward' });
  });

  /**
   * The outgoing view's data is gone by the time the swap renders — the router has already
   * re-rendered the page and `detail` is a different collection — so the *element from the previous
   * render* is the only copy of what was on screen. A version that rebuilt it from props would
   * render the new collection twice.
   */
  it('holds the previous render, so the leaving layer is not the arriving one', () => {
    const after = nextSwapState(atIndex(), { key: 'collection:c1', node: ONE, direction: 'forward' });
    expect(after.leaving?.node).not.toBe(after.node);
  });

  it('carries the direction of this swap onto both layers', () => {
    const back = nextSwapState(
      { key: 'collection:c1', node: ONE, direction: 'forward', arrival: 'swap', leaving: null },
      { key: 'index', node: INDEX, direction: 'back' },
    );
    expect(back.direction).toBe('back');
    expect(back.leaving?.direction).toBe('back');
  });
});

describe('everything that is not a swap', () => {
  /**
   * **The identity bail-out, and it is load-bearing rather than an optimisation.** The component
   * calls this during render and only calls `setState` when the result differs; returning a fresh
   * object every time would put it in a render loop.
   */
  it('returns the same object when nothing changed at all', () => {
    const state = atIndex();
    expect(nextSwapState(state, { key: 'index', node: INDEX, direction: 'forward' })).toBe(state);
  });

  /**
   * A `router.refresh()` after an edit inside a collection hands down fresh children for the view
   * that is already on screen. That is not a swap and must not animate: the user renamed a place,
   * they did not navigate.
   */
  it('takes fresh children for the same view without starting a transition', () => {
    const after = nextSwapState(
      { key: 'collection:c1', node: ONE, direction: 'forward', arrival: 'swap', leaving: null },
      { key: 'collection:c1', node: ONE_REFRESHED, direction: 'back' },
    );
    expect(after.node).toBe(ONE_REFRESHED);
    expect(after.leaving).toBeNull();
    // And the direction it arrived in is not re-read. A caller may go on handing down the
    // direction of the last swap for as long as that view is on screen.
    expect(after.direction).toBe('forward');
  });

  it('lets a layer that is already leaving go on leaving through a refresh', () => {
    const mid = nextSwapState(atIndex(), { key: 'collection:c1', node: ONE, direction: 'forward' });
    const refreshed = nextSwapState(mid, {
      key: 'collection:c1',
      node: ONE_REFRESHED,
      direction: 'forward',
    });
    expect(refreshed.leaving).toBe(mid.leaving);
  });
});

describe('dropping the held layer', () => {
  it('drops it when its own exit ends', () => {
    const mid = nextSwapState(atIndex(), { key: 'collection:c1', node: ONE, direction: 'forward' });
    expect(withoutLeaving(mid, 'index').leaving).toBeNull();
  });

  /**
   * **Keyed, because a second switch can arrive mid-exit** — the switch is two links a finger can
   * hit twice. Without the key the first layer's `animationend`, which fires *after* the second
   * swap has begun, would remove the second swap's outgoing view and produce exactly the empty
   * frame this component removes.
   */
  it('ignores an animation end from a layer that has already been replaced', () => {
    const first = nextSwapState(atIndex(), { key: 'collection:c1', node: ONE, direction: 'forward' });
    const second = nextSwapState(first, { key: 'places', node: PLACES, direction: 'back' });
    expect(second.leaving?.key).toBe('collection:c1');

    const stale = withoutLeaving(second, 'index');
    expect(stale).toBe(second);
    expect(stale.leaving?.key).toBe('collection:c1');
  });

  it('is a no-op when nothing is leaving', () => {
    const state = atIndex();
    expect(withoutLeaving(state, 'index')).toBe(state);
  });
});

/**
 * **The places list is a view like the other two, and until 2026-09-01 the mounting said otherwise.**
 *
 * `nextSwapState` never knew the difference — it compares keys and holds nodes — so nothing here is
 * a change to it. What these cases pin is the contract the *host* has to satisfy, because the
 * defect was entirely one of where the component was mounted: `collections-scope.tsx` owned it and
 * returns `null` on the places view, so on `places → collections` there was no host in the document
 * to hold the outgoing list. Measured at `a468fb1` per frame at 1440×900: no leaving layer in any
 * frame of either direction, and the incoming layer at `opacity 0.000` over an empty card.
 *
 * These fail on a regression that puts the swap back below the branch, because a host that only
 * exists on the collections side can never produce the first of them.
 */
describe('places is a peer view, not the thing the swap happens beside', () => {
  it('holds the places list on the way into collections', () => {
    const after = nextSwapState(
      { key: 'places', node: PLACES, direction: 'forward', arrival: 'mount', leaving: null },
      { key: 'index', node: INDEX, direction: 'forward' },
    );
    expect(after.leaving).toEqual({ key: 'places', node: PLACES, direction: 'forward' });
  });

  it('holds the collections index on the way back to places, going the other way', () => {
    const after = nextSwapState(atIndex(), { key: 'places', node: PLACES, direction: 'back' });
    expect(after.leaving).toEqual({ key: 'index', node: INDEX, direction: 'back' });
    expect(after.direction).toBe('back');
  });

  it('holds a collection on the way straight out to places', () => {
    // `Places` is reachable from inside a collection — the switch is in the drawer at every depth —
    // so `collection → places` is a real transition and skips the index.
    const after = nextSwapState(
      { key: 'collection:c1', node: ONE, direction: 'forward', arrival: 'swap', leaving: null },
      { key: 'places', node: PLACES, direction: 'back' },
    );
    expect(after.leaving?.node).toBe(ONE);
    expect(after.leaving?.direction).toBe('back');
  });
});

/**
 * **The first view a host shows plays no entrance**, which is what stopped hoisting the swap from
 * putting a 300 ms slide-from-the-right on the product's main screen at every cold load of `/map`.
 *
 * A cold arrival already has the shell's own five beats. `drawer-view.ts`'s `swapDirection` has
 * called that case *"an arrival rather than a swap"* since it was written; `arrival` is what makes
 * the component agree, and the direction it seeds with animates nothing.
 */
describe('the mount is an arrival, not a swap', () => {
  const mounted: SwapState = {
    key: 'places',
    node: PLACES,
    direction: 'forward',
    arrival: 'mount',
    leaving: null,
  };

  it('stays a mount through fresh children for the same view', () => {
    const refreshed = nextSwapState(mounted, {
      key: 'places',
      node: 'places-list-after-a-save',
      direction: 'forward',
    });
    expect(refreshed.arrival).toBe('mount');
  });

  it('becomes a swap at the first key change', () => {
    expect(nextSwapState(mounted, { key: 'index', node: INDEX, direction: 'forward' }).arrival).toBe(
      'swap',
    );
  });

  it('never goes back to being a mount', () => {
    const first = nextSwapState(mounted, { key: 'index', node: INDEX, direction: 'forward' });
    const back = nextSwapState(first, { key: 'places', node: PLACES, direction: 'back' });
    expect(back.arrival).toBe('swap');
    // Including on the return to the very view the host mounted with — that is a swap the user
    // performed, and it is the one this whole finding was about.
    expect(back.leaving?.key).toBe('index');
  });
});
