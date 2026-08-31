/**
 * **The post-login entrance** — `I2-7`, `iteration-2-plan.md` §2.2 ruling 2.
 *
 * `pins.land` (`W6-6`) and the reveal-into-flight (`W6-7`) existed and were wired to import-confirm
 * alone, so a fresh sign-in arrived on a map that had already finished arriving. This pins the
 * rules of pointing the same choreography at the sign-in.
 *
 * ## What this file is evidence of, and what it is not
 *
 * The clock (`entrance.ts`) is React-free and free of `server-only`, so it is **exercised** rather
 * than mirrored — the assertions below run the real functions. The three surfaces that read it are
 * not: `map-surface.mapcn.tsx` transitively imports `server-only` and cannot be imported from a
 * unit test at all (`framing-replay.test.ts` measured that), so the rules about *how* they read the
 * clock are asserted against their source, with the same disclaimer that file carries.
 *
 * **It cannot say the entrance looks like an arrival.** `tests/harness/measure-motion.mjs` answers
 * whether anything visibly happened after the map painted and what the frame budget cost, against a
 * real browser and against a before — which is how `W6-6` was closed, and it is the standard here.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ENTRANCE_BEATS,
  ENTRANCE_CLOCK_FLOOR_MS,
  ENTRANCE_DESCENT_MS,
  ENTRANCE_ZOOM_LIFT,
} from '@/components/map/entrance';
import {
  LAND_SETTLE_FALLBACK_MS,
  LAND_STAGGER_MS,
  LAND_WAVES,
  pinOpacityExpression,
  VISITED_PIN_OPACITY,
} from '@/components/map/marker-style';
import { AREA_BAND_MAX, AREA_BAND_MIN } from '@/components/map/zoom-bands';

const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
const LAYER = readFileSync('src/components/map/place-marker-layer.tsx', 'utf8');
const SHELL = readFileSync('src/components/shell/map-shell.tsx', 'utf8');
const PAGE_CLIENT = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
/** A fresh module instance, because the clock and the once-per-load flag are module state and the
 *  whole point of both is that they are spent. */
async function freshEntrance() {
  vi.resetModules();
  return import('@/components/map/entrance');
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  vi.useRealTimers();
});

describe('the beats are the owner ruling, and derived from one table', () => {
  /** The table in `iteration-2-plan.md` §2.2 ruling 2, verbatim. If a beat moves, it moves here
   *  and the document moves with it — this is the only place any of the five numbers is written. */
  it('is the owner table', () => {
    expect(ENTRANCE_BEATS).toEqual({
      camera: 200,
      ground: 600,
      pins: 700,
      sheet: 900,
      wordmark: 1100,
    });
  });

  /** The descent's duration is the gap between the camera starting and the ground settling, not a
   *  second number that could disagree with the table. */
  it('derives the descent from the table rather than restating it', () => {
    expect(ENTRANCE_DESCENT_MS).toBe(ENTRANCE_BEATS.ground - ENTRANCE_BEATS.camera);
    expect(readFileSync('src/components/map/entrance.ts', 'utf8')).toContain(
      'ENTRANCE_BEATS.ground - ENTRANCE_BEATS.camera',
    );
  });

  /** In order, and every beat after the camera's. A sheet that rose before the ground settled
   *  would be a list over a blank map. */
  it('runs in the order the choreography states', () => {
    const beats = [
      ENTRANCE_BEATS.camera,
      ENTRANCE_BEATS.ground,
      ENTRANCE_BEATS.pins,
      ENTRANCE_BEATS.sheet,
      ENTRANCE_BEATS.wordmark,
    ];
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
  });

  /**
   * **The whole sequence, including the pin landing it starts, stays inside the arrival budget.**
   * `LAND_WAVES * LAND_STAGGER_MS` is the 480 ms the landing takes for any library size, and the
   * last thing it can finish after is the pin beat. Past about a second and a half an entrance
   * stops reading as arrival and starts reading as lag.
   */
  it('is over inside the arrival budget', () => {
    const lastBeat = Math.max(
      ENTRANCE_BEATS.wordmark,
      ENTRANCE_BEATS.pins + LAND_WAVES * LAND_STAGGER_MS,
    );
    expect(lastBeat).toBeLessThanOrEqual(1500);
  });

  /**
   * **Under two zoom bands of lift, and enough to read as travel.** Two bands would put a one-city
   * library out over open sea on the way in, which is the map claiming a geography it does not
   * have.
   *
   * It deliberately does **not** assert that a boundary is crossed. Whether one is is a property of
   * where the library rests, not of this constant: the 30-place fixture rests at z11.605 and lifts
   * to z9.005, both in the pin band, so nothing is crossed — an earlier version of the constant's
   * own docblock claimed otherwise and the filmstrip disproved it.
   */
  it('lifts under two bands, and enough to read as travel', () => {
    const band = AREA_BAND_MAX - AREA_BAND_MIN;
    expect(ENTRANCE_ZOOM_LIFT).toBeGreaterThan(1);
    expect(ENTRANCE_ZOOM_LIFT).toBeLessThan(2 * band);
  });
});

describe('once per page load, not once per mount', () => {
  /** Two readers in one render — `map-page-client.tsx` and `shell-wordmark.tsx` — have to get the
   *  same answer, which is why `claimEntrance` only reads and `spendEntrance` is what writes. */
  it('answers every reader in the same render identically', async () => {
    const entrance = await freshEntrance();
    expect(entrance.claimEntrance()).toBe(true);
    expect(entrance.claimEntrance()).toBe(true);
  });

  /** And a later mount gets nothing: coming back to `/map` from `/collections` remounts the page,
   *  and a choreographed arrival on a surface you are *returning* to is a nag that also delays it. */
  it('is spent for the rest of the document once recorded', async () => {
    const entrance = await freshEntrance();
    expect(entrance.claimEntrance()).toBe(true);
    entrance.spendEntrance();
    expect(entrance.claimEntrance()).toBe(false);
  });

  /**
   * **The claim is read during render and recorded in an effect**, and the split is the whole of
   * why it is safe on the server: module scope there is per-process and shared across requests, so
   * consuming it during render would let one visitor's request decide what the next visitor's HTML
   * says — a hydration mismatch on the product's main surface, caused by somebody else.
   */
  it('records the claim from an effect and never during render', () => {
    expect(PAGE_CLIENT).toContain('const [entrance] = useState(claimEntrance);');
    expect(PAGE_CLIENT).toContain('useEffect(spendEntrance, []);');
  });
});

describe('one clock, and where its zero is', () => {
  /** Idempotent, because two things can legitimately try to start it: the camera, which is the
   *  right zero, and the page's floor, which is insurance. */
  it('starts once and ignores a second start', async () => {
    const entrance = await freshEntrance();
    vi.useFakeTimers();
    entrance.startEntranceClock();
    vi.advanceTimersByTime(300);
    entrance.startEntranceClock();
    // Still measured from the first start: 300 ms of the 900 ms sheet beat has already gone.
    expect(entrance.entranceDelayMs(ENTRANCE_BEATS.sheet)).toBeLessThanOrEqual(600);
    expect(entrance.entranceDelayMs(ENTRANCE_BEATS.sheet)).toBeGreaterThan(0);
  });

  /** A surface that mounts after a beat has passed gets it immediately rather than replaying the
   *  sequence from its own arrival. */
  it('never asks a late surface to wait for a beat that has gone', async () => {
    const entrance = await freshEntrance();
    vi.useFakeTimers();
    entrance.startEntranceClock();
    vi.advanceTimersByTime(5000);
    for (const beat of Object.values(ENTRANCE_BEATS)) {
      expect(entrance.entranceDelayMs(beat)).toBe(0);
    }
  });

  /** A listener added after the clock started fires immediately, so nothing can miss the start by
   *  mounting late. */
  it('tells a late subscriber the clock is already running', async () => {
    const entrance = await freshEntrance();
    let calls = 0;
    entrance.whenEntranceStarts(() => {
      calls += 1;
    });
    expect(calls).toBe(0);
    entrance.startEntranceClock();
    expect(calls).toBe(1);
    entrance.whenEntranceStarts(() => {
      calls += 1;
    });
    expect(calls).toBe(2);
  });

  /** Unsubscribing before the start means never being called — an unmounted surface must not set
   *  state. */
  it('lets a surface unsubscribe before the clock starts', async () => {
    const entrance = await freshEntrance();
    let calls = 0;
    const off = entrance.whenEntranceStarts(() => {
      calls += 1;
    });
    off();
    entrance.startEntranceClock();
    expect(calls).toBe(0);
  });

  /**
   * **The zero is the first frame the ground is drawn in, and this was measured rather than
   * reasoned.**
   *
   * The first version started the clock at framing time — `whenReady`, which fires on `styledata`
   * and `sourcedata`, long before a tile is drawn. Filmed at 390×844 against the local harness, the
   * sheet rose at its 900 ms beat over a **blank map** and the map did not paint until ~2.6 s: the
   * entire choreography ran out before there was anything to choreograph. That is W6-6's lesson
   * arriving through a different door, and it takes W6-6's answer — `idle`, MapLibre's own
   * statement that the camera has stopped and every requested tile is in.
   */
  it('starts on the first idle after the lift, not on the framing', () => {
    const descent = SURFACE.slice(
      SURFACE.indexOf('const beginEntranceDescent'),
      SURFACE.indexOf('Camera mover 1: the home framing'),
    );
    expect(descent).toContain("map.once('idle', arm);");
    // The lift is applied at framing time — the ground has to already be at altitude in the frame
    // it first appears in — and the clock starts only once that frame exists.
    expect(descent.indexOf('map.jumpTo')).toBeLessThan(descent.indexOf("map.once('idle', arm);"));
    expect(descent.indexOf('startEntranceClock();')).toBeLessThan(
      descent.indexOf('entranceDelayMs(ENTRANCE_BEATS.camera)'),
    );
    // …and a floor under that, or a tile that never resolves parks the camera at altitude for the
    // life of the page.
    expect(descent).toContain('setTimeout(arm, ENTRANCE_CLOCK_FLOOR_MS)');
  });

  /**
   * **And a floor under it.** The sheet and the wordmark are *withheld* until their beats, so a
   * clock that never starts is a map with no list and no brand on it for the life of the page — and
   * the camera can fail to frame: `fitTo`'s docblock records an impossible fit that silently does
   * nothing. The same 4 s as the landing's own floor, against the same measured settle times.
   */
  it('starts anyway if the camera never frames', () => {
    expect(PAGE_CLIENT).toContain('setTimeout(startEntranceClock, ENTRANCE_CLOCK_FLOOR_MS)');
    expect(ENTRANCE_CLOCK_FLOOR_MS).toBe(LAND_SETTLE_FALLBACK_MS);
    expect(ENTRANCE_CLOCK_FLOOR_MS).toBeGreaterThan(2500);
  });

  /** No beat is ever due in the past, and none is due before the clock exists — a surface asking
   *  early waits for the start rather than firing on mount. */
  it('never answers with a negative delay', async () => {
    const entrance = await freshEntrance();
    expect(entrance.entranceDelayMs(ENTRANCE_BEATS.wordmark)).toBe(0);
    entrance.startEntranceClock();
    expect(entrance.entranceDelayMs(0)).toBe(0);
    expect(entrance.entranceDelayMs(ENTRANCE_BEATS.wordmark)).toBeGreaterThan(0);
  });
});

describe('reduced motion collapses the sequence, not the surfaces', () => {
  /** §3a's rule is that the nine collapse *to the opacity change, not to nothing*. Every beat
   *  becoming due at once is that collapse: the sheet, the panel and the wordmark still fade in
   *  over `--duration-enter`, together, and nothing is withheld. */
  it('makes every beat due at once', async () => {
    const entrance = await freshEntrance();
    Reflect.set(globalThis, 'window', { matchMedia: () => ({ matches: true }) });
    entrance.startEntranceClock();
    for (const beat of Object.values(ENTRANCE_BEATS)) {
      expect(entrance.entranceDelayMs(beat)).toBe(0);
    }
  });

  /**
   * **The camera skips the flight rather than shortening it, and that is correctness rather than
   * taste.** MapLibre's `easeTo` sets its own duration to 0 under `prefers-reduced-motion` unless
   * the caller passes `essential`, so a lift followed by an instantaneous return would be a hard
   * cut to altitude and back — motion, and worse motion than the descent it replaced.
   */
  it('does not lift the camera at all under reduced motion', () => {
    const descent = SURFACE.slice(
      SURFACE.indexOf('const beginEntranceDescent'),
      SURFACE.indexOf('Camera mover 1: the home framing'),
    );
    const reduced = descent.slice(
      descent.indexOf('if (prefersReducedMotion()) {'),
      descent.indexOf('const center = map.getCenter();'),
    );
    // The reduced branch starts the clock and returns, *before* anything touches the camera — so
    // the sheet, the panel and the wordmark still arrive and the flight simply does not happen.
    expect(reduced).toContain('startEntranceClock();');
    expect(reduced).toContain('return;');
    expect(reduced).not.toContain('map.jumpTo');
    expect(descent.indexOf('if (prefersReducedMotion()) {')).toBeLessThan(
      descent.indexOf('map.jumpTo'),
    );
    // …and it is not made `essential`, which would opt the flight back out of the user's setting.
    expect(descent).not.toContain('essential');
  });
});

describe('the camera lands where the real framing puts it', () => {
  /**
   * **The honesty constraint, and it is structural rather than a promise.** The honest fit runs
   * first, the resting camera is read back off the map, and the descent's destination is that
   * reading — so the entrance has no opportunity to decide where to land. An entrance that landed
   * somewhere prettier would be an entrance that lies about the library.
   */
  it('reads its destination back off the settled camera', () => {
    const descent = SURFACE.slice(
      SURFACE.indexOf('const beginEntranceDescent'),
      SURFACE.indexOf('Camera mover 1: the home framing'),
    );
    expect(descent).toContain('const center = map.getCenter();');
    expect(descent).toContain('const zoom = map.getZoom();');
    expect(descent).toContain('map.easeTo({ center, zoom, duration: ENTRANCE_DESCENT_MS });');
    // Nothing here computes a camera of its own. `cameraForBounds`, `fitBounds` and `settleZoom`
    // are camera mover 1's, and the descent is a prelude to its answer rather than a second one.
    expect(descent).not.toContain('cameraForBounds');
    expect(descent).not.toContain('fitBounds');
    expect(descent).not.toContain('settleZoom');
  });

  /** After the framing, never instead of it: `frameHome` records the framing and *then* descends,
   *  so the recorded `{ kind: 'home' }` a resize replays is the honest fit either way. */
  it('descends after the home framing has already run', () => {
    const frameHome = SURFACE.slice(
      SURFACE.indexOf('const frameHome = (request: FocusBoundsRequest)'),
      SURFACE.indexOf('// Nothing saved: there is no library to fit'),
    );
    expect(frameHome.indexOf('frameBounds(map, request, false);')).toBeLessThan(
      frameHome.indexOf('beginEntranceDescent(map);'),
    );
    expect(frameHome.indexOf("framing.current = { kind: 'home' };")).toBeLessThan(
      frameHome.indexOf('beginEntranceDescent(map);'),
    );
  });

  /** Spent on the first framing, so a `ResizeObserver` re-fit — which re-decides the home view and
   *  runs `frameHome` again — cannot replay the descent later in the session. */
  it('is spent by the first framing', () => {
    const descent = SURFACE.slice(
      SURFACE.indexOf('const beginEntranceDescent'),
      SURFACE.indexOf('Camera mover 1: the home framing'),
    );
    expect(descent).toContain('if (!entrancePending.current) return;');
    expect(descent).toContain('entrancePending.current = false;');
  });

  /** It is not a ninth camera mover, and the mechanism is what says so: no `flyTo`, and nothing
   *  that could leave the camera anywhere but the reading above. */
  it('adds no camera command beyond the lift and the return', () => {
    const descent = SURFACE.slice(
      SURFACE.indexOf('const beginEntranceDescent'),
      SURFACE.indexOf('Camera mover 1: the home framing'),
    );
    expect(descent).not.toContain('flyTo');
    expect(descent.match(/map\.(jumpTo|easeTo)/g)).toEqual(['map.jumpTo', 'map.easeTo']);
  });
});

describe('the pins that land are the real pins', () => {
  /**
   * `-1` is *nothing has landed yet*, and it needs no branch in the expression: every `landOrder`
   * is `>= 0`, so the gate is false for all of them and every pin sits at 0 until its wave.
   */
  it('holds every pin back at the entrance gate', () => {
    const held = pinOpacityExpression(VISITED_PIN_OPACITY, null, -1);
    expect(held[0]).toBe('*');
    expect(held[2]).toEqual(['case', ['<=', ['coalesce', ['get', 'landOrder'], 0], -1], 1, 0]);
    for (let wave = 0; wave < LAND_WAVES; wave += 1) {
      // The gate arm is `landOrder <= through`; at -1 no wave satisfies it.
      expect(wave <= -1).toBe(false);
    }
  });

  /** Wave 0 is withheld during the entrance and painted immediately otherwise — an eighth of the
   *  library appearing part-way down the descent reads as pins arriving twice. */
  it('withholds wave 0 only while the entrance is playing', () => {
    expect(LAYER).toContain('paint(entrance ? -1 : 0);');
    expect(LAYER).toContain('for (let wave = entrance ? 0 : 1; wave < LAND_WAVES; wave += 1)');
  });

  /**
   * **`idle` stays the trigger and the pin beat is a floor under it, in the other direction.**
   * `idle` cannot answer *"and the descent has finished"*: the descent is scheduled 200 ms out, so
   * a warm tile cache can idle the map in the gap before it starts and the waves would run under a
   * moving camera — W6-6's measured defect, reached by a different route.
   */
  it('will not start the waves before the ground has settled', () => {
    const code = LAYER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toContain("map.once('idle', start)");
    expect(code).toContain('entranceDelayMs(ENTRANCE_BEATS.pins)');
    // Hung off the shared clock rather than off this `idle`, and that is not belt-and-braces: the
    // two `idle` listeners are registered independently, so this one can win the race and read a
    // clock that has not started — which answers 0 and starts the landing under a moving camera.
    expect(code).toContain('unsubscribeClock = whenEntranceStarts(');
    // …and it costs nothing for a surface with no entrance, which still runs the moment it idles.
    expect(code).toContain('if (!entrance) {');
    // An unsubscribe on unmount, so a landing that never started cannot set paint on a dead layer.
    expect(code).toContain('unsubscribeClock?.();');
  });

  /** The features are the library's own, stamped by `withPinFeatureProps` — no placeholder pins,
   *  no extra pins, nothing that arrives and then rearranges. */
  it('lands the library rather than a stand-in', () => {
    expect(LAYER).toContain('const labelled = useMemo(() => withPinFeatureProps(data), [data]);');
    const landing = LAYER.slice(LAYER.indexOf('const hasLanded = useRef(false);'));
    expect(landing).not.toContain('setData');
  });
});

describe('what the entrance may not delay', () => {
  /** The shell's JSX, with the file header cut off. Every assertion below is about what the
   *  component *renders*; the header discusses the defect these tests exist to pin, by name, and a
   *  `not.toContain` run over the whole file would be matching prose. */
  const SHELL_BODY = SHELL.slice(SHELL.indexOf('export function MapShell('));

  /** Navigation is not part of the show. Holding a way out of a surface back for the sake of a
   *  flourish is the one thing an entrance may not do. */
  it('never withholds the bottom nav', () => {
    const guarded = SHELL_BODY.slice(
      SHELL_BODY.indexOf('{overlay ? null : ('),
      SHELL_BODY.indexOf('{modalSlot}'),
    );
    expect(guarded).toContain('<BottomNav');
    expect(guarded.slice(0, guarded.indexOf('<BottomNav'))).not.toContain('sheetArrived');
  });

  /**
   * **Mount versus reveal.** A beat may govern where a surface is; it may never govern whether the
   * surface exists. Both list surfaces were behind `{listArrived && …}` until 2026-08-31, and
   * because this clock's zero is the camera framing, the 900 ms beat put the desktop place list
   * into the document at 2467 / 2613 / 2509 ms at 1440×900 (against `5c3d3a9`).
   *
   * The sheet's rise is still vaul's own snap-point transition — not a second animation this file
   * invents, which the drag gesture would then have to share the transform with. What changed is
   * that the transition is bought by withholding the **snap point** rather than the mount:
   * `useControllableState` treats a `null` prop as a controlled null (`vaul/dist/index.mjs:485`),
   * and the CSS resting transform is keyed on `data-vaul-snap-points`, which is `isOpen &&
   * hasSnapPoints` (`:1402`) and so does not depend on the active point.
   */
  it('mounts the sheet at first paint and rises it by its snap point at the beat', () => {
    expect(SHELL_BODY).toContain('useEntranceBeat(ENTRANCE_BEATS.sheet, entrance)');
    expect(SHELL_BODY).toContain('activeSnapPoint={sheetArrived ? shell.sheet.snap : null}');
    // The mount itself is unguarded — no beat stands between the render and `<Drawer.Root`.
    const beforeDrawer = SHELL_BODY.slice(
      SHELL_BODY.indexOf('{overlay ? null : ('),
      SHELL_BODY.indexOf('<Drawer.Root'),
    );
    expect(beforeDrawer).not.toMatch(/\{sheetArrived && \($/m);
  });

  /**
   * **The `lg+` panel takes no beat at all**, and that is the ruling read literally rather than a
   * concession. Beat 4 is *"the sheet rises to its stop"*; `Drawer.Content` is `lg:hidden`, so at
   * `lg+` beat 4 has no subject — and what the synthesised desktop copy of it actually governed was
   * the only surface a desktop user can read their library on. `iteration-2-plan.md` §2.2 ruling
   * 2's own last sentence: *"it may not delay the map being usable."*
   */
  it('never withholds the desktop panel', () => {
    const panel = SHELL_BODY.slice(SHELL_BODY.indexOf('{modalSlot}'));
    expect(panel).toContain('{panelContent}');
    expect(panel).not.toContain('sheetArrived');
  });

  /** Every scope that is not playing an entrance renders exactly as it did — `/collections/[id]`
   *  mounts this same shell and passes nothing. */
  it('is off by default for every other scope', () => {
    expect(SHELL).toContain('entrance = false,');
    expect(SURFACE).toContain('entrance = false,');
    expect(LAYER).toContain('entrance = false,');
    expect(
      readFileSync('src/app/collections/[id]/collection-client.tsx', 'utf8'),
    ).not.toContain('entrance');
  });
});
