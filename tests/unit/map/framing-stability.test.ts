/**
 * **The camera may not be re-framed by a prop changing under a live map.**
 *
 * This file exists because of a defect that was inert for as long as it was written and became
 * reachable the moment somebody changed a lifetime assumption — the category is worth naming, since
 * nothing in the suite catches it: `components/shell/persistent-map.tsx` made one MapLibre instance
 * outlive the route that borrowed it, and a chain of `useCallback`s in `map-surface.mapcn.tsx` that
 * had never mattered started firing on every tab hop.
 *
 * The chain: `floatingTopChromePx` was `paddingFor`'s only dependency; `paddingFor` reaches
 * `frameBounds` -> `fitTo` -> `fitToBounds` -> `refitFramed` -> `attachMapRef`. React detaches and
 * re-attaches a callback ref whose identity changes, and the re-attach re-ran the home framing past
 * `hasFramedOnce` — which guarded the sibling effect and not the attach-time call. `/map` omits
 * that prop and `/collections` passes `0`, so every hop tripped it, and it read the arriving route's
 * chrome with the departing route's `sheetFractionRef` (written from a passive effect that had not
 * run yet). Traced at 390x844: `/map` came back at **z10.46** where first load rested at **z11.60**.
 *
 * Source text, not behaviour, and deliberately coarse — the technique `tests/unit/shell/one-shell.test.ts`
 * and `tests/unit/map/pin-band-floor.test.ts` already use, for the same reason: the statements being
 * guarded need a WebGL context to execute and `vitest.config.ts` sets `environment: 'node'`. That
 * the camera actually rests where it did is a browser, and that evidence lives with the task —
 * `/map` after a round trip through `/collections` byte-identical to `/map` on first load.
 *
 * **The nine lines fixed today's instance; these assertions are what stop the chain growing back.**
 * A future dependency added to `paddingFor` would restore the whole defect, silently, and the only
 * symptom would be a camera that rests differently depending on where you have been.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PATH = fileURLToPath(new URL('../../../src/components/map/map-surface.mapcn.tsx', import.meta.url));

/** Comments stripped, because this file explains the defect at length in the very function being
 *  guarded — a whole-file grep would match the explanation rather than the code. */
const CODE = readFileSync(PATH, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * The body of a `const NAME = useCallback(` through its closing `);`, by brace/paren depth rather
 * than by regex — the callbacks here are 80 lines long and contain every bracket there is.
 */
function callbackBody(name: string): string {
  const start = CODE.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} is no longer a useCallback — the chain this file guards has changed shape`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = CODE.indexOf('(', start); i < CODE.length; i += 1) {
    const char = CODE[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return CODE.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced parens reading ${name}`);
}

/** The dependency array of a `useCallback`, as written — the last `[...]` before its closing `)`. */
function dependencies(name: string): string {
  const body = callbackBody(name);
  const match = body.match(/,\s*(\[[^[\]]*\])\s*\)$/);
  expect(match, `${name} has no readable dependency array`).not.toBeNull();
  return (match?.[1] ?? '').replace(/\s+/g, '');
}

describe('the fit padding has no dependencies', () => {
  it('leaves paddingFor with an empty dependency array', () => {
    // The load-bearing assertion. Anything in here propagates to `attachMapRef` and turns a prop
    // change into a ref re-attach into a re-framed camera. If you are here because you need a new
    // value in `paddingFor`, read it through a ref the way the six above it are read.
    expect(dependencies('paddingFor')).toBe('[]');
  });

  it('reads the top chrome through a ref rather than off the prop', () => {
    expect(callbackBody('paddingFor')).toContain('topChromeRef.current');
    expect(callbackBody('paddingFor')).not.toContain('floatingTopChromePx');
  });

  it('reads the sheet fraction through a ref too, which it always did', () => {
    // Named so the pair cannot drift: these are the two occlusion inputs, and a fit that reads one
    // from a ref and one from a prop is exactly how the mixed budget happened.
    expect(callbackBody('paddingFor')).toContain('sheetFractionRef.current');
  });

  it('never reads the prop from inside any callback in the chain', () => {
    // Stated over the chain rather than as an occurrence count, because the module-level
    // `fitBoundsPadding` takes the same value as a *parameter* and is right to — it is a pure
    // function of what it is handed. What must not happen is a **closure** capturing the prop,
    // because that is what gives the callback a new identity when the prop changes.
    for (const name of ['paddingFor', 'frameBounds', 'fitTo', 'fitToBounds', 'refitFramed', 'attachMapRef']) {
      expect(callbackBody(name), `${name} closes over floatingTopChromePx`).not.toContain(
        'floatingTopChromePx',
      );
    }
    expect(CODE).toContain('topChromeRef.current = floatingTopChromePx;');
  });
});

describe('the home framing happens once', () => {
  it('guards the attach-time fit with hasFramedOnce, as its sibling effect does', () => {
    // The asymmetry that let the re-attach through. Both call sites now ask the same question.
    const attach = callbackBody('attachMapRef');
    expect(attach).toContain('whenReady(instance, () => {');
    expect(attach).toContain('if (hasFramedOnce.current) return;');
  });

  it('keeps the guard on the effect that frames when bounds arrive late', () => {
    // The half that was always right, pinned so a future tidy-up cannot "unify" the two by
    // deleting this one instead of the other.
    expect(CODE).toContain('if (hasFramedOnce.current) return;');
    expect(CODE.match(/if \(hasFramedOnce\.current\) return;/g) ?? []).toHaveLength(2);
  });
});

describe('the callbacks between the padding and the ref stay stable', () => {
  /**
   * Each link in the chain, and what it is allowed to depend on: only other members of the chain,
   * all of which are now stable. A name from outside this set is a new way for a prop to reach
   * `attachMapRef`, which is the defect.
   */
  const CHAIN: Record<string, readonly string[]> = {
    frameBounds: ['paddingFor'],
    fitTo: ['paddingFor'],
    fitToBounds: ['beginEntranceDescent', 'frameBounds', 'paddingFor'],
    refitFramed: ['fitTo', 'fitToBounds', 'frameBounds'],
  };

  for (const [name, allowed] of Object.entries(CHAIN)) {
    it(`${name} depends only on ${allowed.join(', ')}`, () => {
      const deps = dependencies(name).slice(1, -1).split(',').filter(Boolean);
      expect(deps.sort()).toEqual([...allowed].sort());
    });
  }

  it('beginEntranceDescent, the one link that is not derived from the padding, takes nothing', () => {
    expect(dependencies('beginEntranceDescent')).toBe('[]');
  });
});
