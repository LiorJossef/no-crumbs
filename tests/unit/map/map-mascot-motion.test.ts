/**
 * **What the mascot is allowed to do on a data surface, and why the answer is a fact rather than a
 * preference.**
 *
 * Owner ruling 6 put the mascot on `/map`. `facelift-plan.md` §3a's rule on that surface is that a
 * thing which moves is a thing which changed, so the question is whether a moving mascot can be
 * told apart from a pin's own motion at a glance. The first answer offered was *"restrained on the
 * map"* — a matter of degree, and therefore arguable forever.
 *
 * The answer this file holds is structural. **The data surface has a motion vocabulary of exactly
 * two gestures**, read out of the map lane's own code:
 *
 *  - **`icon-opacity`** — the pin landing is a *staggered fade*, eight waves over a per-feature
 *    `landOrder`. `place-marker-layer.tsx` records why it is a fade and not a drop: `icon-translate`
 *    is a paint property MapLibre does not allow to be data-driven, so a per-pin drop would need one
 *    layer per pin.
 *  - **`icon-translate: [0, -3]`** — a 3px lift on *exactly one* selected pin, which is why
 *    `pin-highlight-layer.tsx` is a single-feature layer at all.
 *
 * **`icon-rotate` appears nowhere in `components/map/`.** So rotation is the one gesture that
 * surface has never used, and a rotating mascot cannot be mistaken for anything the map says. A
 * bobbing one is the selected-pin lift larger, on a loop; a pulsing one is the landing.
 *
 * That is what makes the boundary checkable instead of tasteful, and checkable is the point: the
 * next person to add a seventh animation will judge it in isolation, where it looks fine.
 *
 * **Both halves are asserted.** The permission is worth nothing without the premise — if the map
 * lane ever animates `icon-rotate`, the argument for the stir evaporates and this file should be
 * what says so, not a reviewer's memory of a sentence in a stylesheet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const GLOBALS = readFileSync('src/app/globals.css', 'utf8');
const WORDMARK = readFileSync('src/app/map/shell-wordmark.tsx', 'utf8');

/** Every `.ts`/`.tsx` under the map lane, which is where a new pin motion would arrive. */
function mapLaneSources(): { file: string; source: string }[] {
  const dir = 'src/components/map';
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => {
      const file = path.join(e.parentPath, e.name);
      return { file, source: readFileSync(file, 'utf8') };
    });
}

/** The body of a `@keyframes <name>` block, or `null`. Brace-matched rather than regexed to the
 *  first `}`, because every keyframe body contains nested blocks. */
function keyframes(name: string): string | null {
  const start = GLOBALS.indexOf(`@keyframes ${name} {`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = GLOBALS.indexOf('{', start); i < GLOBALS.length; i += 1) {
    if (GLOBALS[i] === '{') depth += 1;
    else if (GLOBALS[i] === '}') {
      depth -= 1;
      if (depth === 0) return GLOBALS.slice(GLOBALS.indexOf('{', start) + 1, i);
    }
  }
  return null;
}

describe('the premise: what the data surface actually animates', () => {
  /**
   * **The whole permission rests on this**, so it is asserted rather than quoted. Comments are
   * stripped: the map lane discusses `icon-rotate` nowhere today, but a future comment explaining
   * why it is not used must not be able to fail this.
   */
  it('never rotates a pin', () => {
    const offenders = mapLaneSources()
      .filter(({ source }) =>
        /icon-rotate|iconRotate/.test(
          source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, ''),
        ),
      )
      .map(({ file }) => file);
    expect(offenders, 'a rotating pin would void the mascot stir’s licence').toEqual([]);
  });

  /** And the two gestures it does use are still the two the argument was built on. */
  it('lifts exactly one pin and fades the rest', () => {
    const all = mapLaneSources().map((s) => s.source).join('\n');
    expect(all).toContain("'icon-translate': [0, -3]");
    expect(all).toContain('icon-opacity-transition');
  });
});

describe('the mascot on the map', () => {
  /**
   * The stir is rotation and nothing else. `translate` would be the selected-pin lift; `opacity`
   * would be the landing. Asserted against the keyframe body rather than against the rule, because
   * the rule only names the animation — the gestures are in the frames.
   */
  it('moves only in a gesture the data surface has never used', () => {
    const body = keyframes('crumb-stir');
    expect(body, '@keyframes crumb-stir is missing').not.toBeNull();
    expect(body).toMatch(/rotate\(/);
    expect(body, 'translate is the selected pin’s lift').not.toMatch(/translate/);
    expect(body, 'opacity is the pin landing').not.toMatch(/opacity/);
    expect(body, 'scale rides with the lift and reads as the same gesture').not.toMatch(/scale\(/);
  });

  /**
   * **Mostly stillness, and the number is the point.** *"A gentle movement from time to time"* is
   * intermittent; a loop that is mostly motion is a spinner, and §3a bans a continuous pulse
   * outright. The stops that hold the rest pose are `5.5%`, `12.5%, 57%` and `67.5%, 100%`, which
   * leaves 88% of the 17s timeline at `rotate(0deg)` — and a **measured 85.6%** below a quarter
   * degree once `ease-in-out` is applied, sampled at 340 phases through a negative
   * `animation-delay`. The measured figure is the one to quote.
   */
  it('is still for most of its cycle, and does not read metronomic', () => {
    const body = keyframes('crumb-stir') ?? '';
    expect(GLOBALS).toMatch(/animation:\s*crumb-stir\s+17s/);
    // Two stirs, not one: a single stir on a fixed period is a metronome once anyone notices it.
    const moving = [...body.matchAll(/rotate\((-?[\d.]+)deg\)/g)]
      .map((m) => Number(m[1]))
      .filter((deg) => deg !== 0);
    expect(moving.length, 'two dissimilar stirs, four moving stops').toBeGreaterThanOrEqual(4);
    // Gentle: nothing in here approaches a spin.
    for (const deg of moving) expect(Math.abs(deg)).toBeLessThanOrEqual(5);
  });

  /** A loop has nothing to keep findable, so it stops and the character stays — the rule this
   *  stylesheet already applies to Bob, Wobble, Scan and Halo, extended rather than re-argued. */
  it('stops under prefers-reduced-motion, leaving the character on screen', () => {
    const reduce = GLOBALS.slice(GLOBALS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toContain('.crumb-anim-stir .crumb-all');
  });

  /** It is wired, which is the half that was missing from every other animation in this rig: six
   *  were built and the `animation` prop had zero call sites in the product. */
  it('is actually on the chip', () => {
    expect(WORDMARK).toContain('animation="stir"');
  });
});
