/**
 * **The mascot's awareness of the pointer** — owner, 2026-08-31: *"hovering it should make him
 * notice, maybe follow with eyes?"*
 *
 * Almost nothing here can be checked by executing the component: this repository's unit tier is
 * `environment: 'node'` with no jsdom, and a pointer-driven transform is a browser behaviour end to
 * end. It was driven in one — 15 checks at 1440×900 and 390×844 covering deflection in both
 * directions, the return to centre, touch, and reduced motion — and that run found a real defect no
 * test in this file could have.
 *
 * What belongs here is the **arithmetic**, because that is what silently regressed once already and
 * would again.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SENSE_INSET, TRAVEL_X, TRAVEL_Y } from '@/components/brand/crumb-aware';
import { CRUMB_ARTBOARD } from '@/components/brand/crumb-path';

const AWARE = readFileSync('src/components/brand/crumb-aware.tsx', 'utf8');
const CODE = AWARE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const GLOBALS = readFileSync('src/app/globals.css', 'utf8');
const STAGE = readFileSync('src/components/brand/chrome-stage.tsx', 'utf8');
const CHROME_MARK = readFileSync('src/components/brand/chrome-mark.tsx', 'utf8');
const WORDMARK = readFileSync('src/app/map/shell-wordmark.tsx', 'utf8');

/** The smaller of the two sizes `chrome-stage.tsx` renders the mark at, taken from its class string
 *  rather than written here — a travel that is legible at 56px and not at 44px is a bug at 44px. */
const SMALLEST_MARK_PX = 44;

describe('how far the eyes travel', () => {
  /**
   * **The regression this file exists for.** Travel is expressed in the mascot's own user units so
   * it scales with the mark; the trap is that the artboard is 116 units wide, so a unit is *less
   * than half a CSS pixel* at chrome sizes. The first version used 2.4 — which sits comfortably
   * inside Scan's own `-2.6 … 3.2` sweep and looks entirely reasonable — and produced **0.91 CSS
   * px** of deflection at a 44px mark. Photographed at both extremes, the frames were
   * indistinguishable.
   *
   * Scan is not a precedent for a *static* offset even though the numbers look alike: it sweeps
   * continuously, so motion carries it, while a glance has to be legible while standing still.
   *
   * One whole CSS pixel is the floor — below it the deflection cannot survive rasterisation on a 1×
   * display — and 1.5 is asserted so there is margin rather than a value sitting exactly on the
   * boundary of its own justification.
   */
  it('crosses a whole CSS pixel at the smallest size the mark is drawn', () => {
    const perUnit = SMALLEST_MARK_PX / CRUMB_ARTBOARD.size;
    expect(STAGE, 'the 44px assumption must come from the stage').toContain('size-11 lg:size-14');
    expect(TRAVEL_X * perUnit).toBeGreaterThanOrEqual(1.5);
    expect(TRAVEL_Y * perUnit).toBeGreaterThanOrEqual(1);
  });

  /** And not so far that a glance becomes a stare. The eyes sit at cx 36 and 58 with rx 5.4; past
   *  roughly a third of the gap between them they stop reading as *looking* and start reading as
   *  *sliding*. Vertical is deliberately tighter — there is less room above and below, and equal
   *  travel in both axes reads as startled rather than attentive. */
  it('stays a glance rather than a stare', () => {
    expect(TRAVEL_X).toBeLessThanOrEqual(7);
    expect(TRAVEL_Y).toBeLessThan(TRAVEL_X);
  });

  /** The sensing box is larger than the mark, so the character notices you approaching rather than
   *  at the instant of contact — a mark that only reacts when the cursor is on it reads as a button. */
  it('notices the pointer before it arrives', () => {
    expect(SENSE_INSET).toBeGreaterThanOrEqual(20);
  });
});

describe('what it refuses to do', () => {
  /** `pointermove` on `window` is the version of this that ships as a performance bug: on `/map` it
   *  would fire through every frame of a map drag. Every listener is on the element's own box. */
  it('attaches no document- or window-level listener', () => {
    expect(CODE).not.toMatch(/(?:window|document)\.addEventListener\(\s*['"]pointer/);
    expect(CODE).toContain("node.addEventListener('pointermove'");
  });

  /** A React state update per pointer event is sixty renders a second of a subtree holding an
   *  inlined SVG. The write is two `setProperty` calls inside one coalesced frame. */
  it('never re-renders to move an eye', () => {
    expect(CODE).not.toContain('useState');
    expect(CODE).toContain('requestAnimationFrame');
    expect(CODE).toContain("style.setProperty('--crumb-eye-x'");
  });

  /**
   * **The bug the browser found, pinned.** `schedule` coalesces with
   * `frame.current ??= requestAnimationFrame(…)`, so a ref left holding a cancelled id means the
   * condition never fires again and the eyes never move for the rest of the session. The teardown
   * calls `detach()`, which centres the eyes, which schedules a frame — so it *always* left a stale
   * id behind, and React's development double-mount made it happen before the first pointer
   * arrived. Cancelling without nulling is the whole defect.
   */
  it('clears the frame ref rather than only cancelling it', () => {
    expect(CODE).toMatch(/cancelAnimationFrame\(frame\.current\);\s*frame\.current = null;/);
  });

  /** A tap fires `pointerenter` and then nothing, so a touch user would get one glance that froze —
   *  a character staring fixedly off to one side, which reads as broken rather than as absent. */
  it('ignores every pointer that is not a mouse', () => {
    const guards = CODE.match(/pointerType !== 'mouse'/g) ?? [];
    expect(guards.length, 'enter, move and leave each need the guard').toBeGreaterThanOrEqual(3);
  });
});

describe('reduced motion', () => {
  /**
   * **Two mechanisms, because they fail differently.** The stylesheet holds if the script never
   * runs; the component holds by not doing the work rather than by hiding its result. WCAG 2.2 SC
   * 2.3.3 covers motion triggered by interaction and requires it be disableable unless essential — a
   * mascot's glance is decorative by definition, so "but you moved the mouse" is not consent.
   */
  it('is switched off in the stylesheet and never attached in the component', () => {
    const reduce = GLOBALS.slice(GLOBALS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toContain('.crumb-aware .crumb-eyes');
    expect(CODE).toContain("'(prefers-reduced-motion: reduce)'");
    // Subscribed, not sampled: a mid-session change takes effect without a reload.
    expect(CODE).toContain("media.addEventListener('change', sync)");
  });
});

describe('where it is allowed', () => {
  /**
   * **Chrome only, and the map's exclusion is a consequence rather than a preference.** The shell
   * chip is `pointer-events-none` so the map stays draggable through the corner it occupies, which
   * `shell-wordmark.test.ts` asserts. Sensing a hover requires pointer events, and enabling them
   * would punch a 32px hole in the drag surface of this product's main gesture.
   */
  it('is on the front door and not on the map', () => {
    expect(CHROME_MARK).toContain('<CrumbAware>');
    expect(CHROME_MARK).toContain('crumb-aware');
    expect(WORDMARK).not.toContain('CrumbAware');
    expect(WORDMARK).toContain('pointer-events-none');
  });
});
