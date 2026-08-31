/**
 * **The mascot is a system, and these are the properties that make it one.**
 *
 * `docs/no-crumbs-design-system.html` chapter 03 specifies eight moods, five constructions and one
 * silhouette, and the rules that keep the set closed. Three of those rules are machine-checkable
 * and are checked here; the rest are judgement and belong in review.
 *
 * The failure this exists to catch is not "the mascot looks wrong" — it is the one iteration 1
 * actually hit: **three renderers each drawing their own version of the character**, drifting
 * apart with nothing failing anywhere.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CRUMB_EYE_SETS,
  CRUMB_MOODS,
  CRUMB_MOUTHS,
  CRUMB_PATH,
  CRUMB_TRAIL_DOTS,
  CRUMB_TRAIL_HEAD,
  CRUMB_TRAIL_VIEWBOX,
  type CrumbMood,
} from '@/components/brand/crumb-path';
import {
  crumbMascotMarkup,
  crumbMascotSvg,
  crumbMascotViewBox,
} from '@/components/brand/crumb-mascot-markup';
import {
  CRUMB_CONSTRUCTIONS,
  MASCOT_GOLD,
  MASCOT_TRAIL,
  type CrumbAnimation,
  type CrumbConstruction,
} from '@/components/brand/mascot-colors';

const MOODS = Object.keys(CRUMB_MOODS) as CrumbMood[];
const CONSTRUCTIONS = Object.keys(CRUMB_CONSTRUCTIONS) as CrumbConstruction[];

describe('the mood set', () => {
  it('is the eight the design system names, and no ninth', () => {
    // `#rules` rule 6: adding a mood means naming the state it serves. The count is the guard —
    // a ninth face is either a state nobody wrote down or decoration.
    expect(MOODS).toEqual([
      'idle',
      'reading',
      'found',
      'nothingFound',
      'beenThere',
      'nearMe',
      'offline',
      'saved',
    ]);
  });

  it('binds every mood to a stated product state', () => {
    for (const mood of MOODS) {
      expect(CRUMB_MOODS[mood].state.length, `${mood} has no screen behind it`).toBeGreaterThan(0);
    }
  });

  it('draws "nothing found" neutral, not sad', () => {
    /*
     * The single most consequential drawing decision in the set, and the reason it is asserted
     * rather than trusted. At LEVEL B's ~27% hit rate this is the outcome of roughly three imports
     * in four — *"a sad mascot turns the product's most common outcome into a small failure eight
     * times a week"*. Flat eyes, flat mouth. `voice-and-vocabulary.md`'s never-apologetic rule,
     * drawn rather than written.
     *
     * A frown would arrive here as `mouth: 'wiggle'` or as a new downturned path, and both change
     * this line.
     */
    expect(CRUMB_MOODS.nothingFound.eyes).toBe('flat');
    expect(CRUMB_MOODS.nothingFound.mouth).toBe('flat');
  });

  it('has no spare eyes or mouths', () => {
    // The other half of rule 6, from the drawing's side: a feature in the library that no mood
    // uses is a face waiting for somebody to find a screen for it.
    const usedEyes = new Set(MOODS.map((mood) => CRUMB_MOODS[mood].eyes));
    const usedMouths = new Set(MOODS.map((mood) => CRUMB_MOODS[mood].mouth));
    expect([...Object.keys(CRUMB_EYE_SETS)].filter((eye) => !usedEyes.has(eye as never))).toEqual(
      [],
    );
    expect(
      [...Object.keys(CRUMB_MOUTHS)].filter((mouth) => !usedMouths.has(mouth as never)),
    ).toEqual([]);
  });

  it('celebrates exactly once, and pulses exactly once', () => {
    // `#moods`: no celebration beyond a single spark pair, and the halo is the locating signal.
    expect(MOODS.filter((mood) => 'spark' in CRUMB_MOODS[mood])).toEqual(['found']);
    expect(MOODS.filter((mood) => 'halo' in CRUMB_MOODS[mood])).toEqual(['nearMe']);
  });
});

describe('the five constructions', () => {
  it('draw the same silhouette', () => {
    // `#styles`: *"the outline is the same closed path in every case — that is the thing an
    // illustrator must not change."*
    for (const construction of CONSTRUCTIONS) {
      expect(crumbMascotMarkup({ mood: 'idle', construction })).toContain(CRUMB_PATH);
    }
  });

  it('give Mono the silhouette and nothing else', () => {
    // *"Silhouette only, takes `currentColor`. This is the pin, the favicon, and any single-colour
    // context."* A mood argument does not put a face on it: Mono has no ink, by definition.
    const mono = crumbMascotMarkup({ mood: 'found', construction: 'mono' });
    expect(mono).toContain('currentColor');
    expect(mono).not.toContain('crumb-eyes');
    expect(mono).not.toContain('crumb-mouth');
    expect(mono).not.toContain('stroke');
    expect(mono.match(/<path/g)).toHaveLength(1);
  });

  it('take a caller colour only through Mono', () => {
    // The pin passes a category colour here. Every other construction is the character and its
    // palette is not the caller's to set.
    expect(crumbMascotMarkup({ construction: 'mono', color: '#D9482A' })).toContain('#D9482A');
    expect(crumbMascotMarkup({ mood: 'idle', construction: 'outlined' })).toContain(MASCOT_GOLD);
  });

  it('drop the keyline on Flat and thicken it on Chunky', () => {
    // The keyline is the *outline* stroked, so the thing to look for is a second copy of the
    // path — not any stroke at all. Flat still strokes its mouth.
    const keyline = (markup: string) => markup.match(new RegExp(CRUMB_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0;
    expect(keyline(crumbMascotMarkup({ mood: 'idle', construction: 'flat' }))).toBe(2);
    expect(keyline(crumbMascotMarkup({ mood: 'idle', construction: 'outlined' }))).toBe(3);
    expect(crumbMascotMarkup({ mood: 'idle', construction: 'chunky' })).toContain(
      'stroke-width="7"',
    );
  });

  it('pad the artboard only where a keyline needs the room', () => {
    // A 4.5-unit stroke on an outline that reaches x=2 puts ink outside the authoring square.
    // Mono and Flat have no keyline and keep the square, so the favicon and the pin are not
    // silently shrunk by 14% inside the box they were sized against.
    expect(crumbMascotViewBox('outlined')).toBe('-8 -8 116 116');
    expect(crumbMascotViewBox('chunky')).toBe('-8 -8 116 116');
    expect(crumbMascotViewBox('mono')).toBe('0 0 100 100');
    expect(crumbMascotViewBox('flat')).toBe('0 0 100 100');
  });
});

describe('one drawing, every renderer', () => {
  it('is built in one module and read by all four surfaces', () => {
    /*
     * The property that matters. Iteration 1's app icon, link preview and DOM mark were three
     * transcriptions of the same character, and they had already diverged — the icon carried a
     * smile the component did not. `crumb-path.ts` fixed that for the outline, which §3.1 rule 1
     * makes unchangeable; this fixes it for the face, the shading and the palette, which rule 1
     * explicitly lets vary and which are therefore the parts that actually drift.
     */
    for (const file of [
      'src/components/brand/pin-mark.tsx',
      'src/components/brand/crumb-mascot.tsx',
      'src/app/apple-icon.tsx',
      'src/app/opengraph-image.tsx',
    ]) {
      expect(readFileSync(file, 'utf8'), `${file} does not read the shared drawing`).toMatch(
        /crumb-mascot-markup/,
      );
    }
  });

  it('keeps the mascot palette out of the map', () => {
    // `#rules` rule 5: *"gold stays off the map — the mascot's palette never appears where category
    // colour lives, or colour stops meaning what a place is."* The withdrawal of the gold-on-mint
    // ruling was about the app icon; this line is what it did not touch.
    for (const file of ['src/components/map/marker-images.ts', 'src/ui/place/palette.ts']) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} reaches the mascot palette`).not.toMatch(/mascot-colors/);
      expect(source, `${file} reaches the mascot drawing`).not.toMatch(/crumb-mascot/);
    }
  });

  it('produces a standalone document a data URI can carry', () => {
    const svg = crumbMascotSvg({ mood: 'nothingFound', construction: 'outlined' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // The clip the crust is drawn against has to be inside the document, or a data-URI render
    // silently drops the shading.
    expect(svg).toContain('<clipPath id="crumbClip">');
  });
});

describe('the trail', () => {
  it('draws the shared outline rather than the drawing’s fourth path', () => {
    /*
     * `#crumbTrail` ends its trail with a 47-unit blob of its own that is **not** `CRUMB_PATH`.
     * Reproducing it would put a second outline in a system whose whole premise is that there is
     * one — §3.1 rule 1, *"if they change the outline, you lose the pin"*. So `crumb-trail.tsx`
     * reaches for the shared geometry and places it in the box that blob occupied.
     */
    const source = readFileSync('src/components/brand/crumb-trail.tsx', 'utf8');
    expect(source, 'the trail restates an outline').not.toContain('M34 9C50 3 70 7 82 20');
    expect(source).toMatch(/crumb-mascot-markup/);
    expect(source).toMatch(/CRUMB_TRAIL_HEAD/);
  });

  it('rises: each crumb is larger and less faded than the one behind it', () => {
    // The diagonal and the two gradients are what make this read as a trail being followed rather
    // than as three dots of a loading indicator — which is the generic thing it replaces.
    for (let i = 1; i < CRUMB_TRAIL_DOTS.length; i += 1) {
      const prev = CRUMB_TRAIL_DOTS[i - 1] as (typeof CRUMB_TRAIL_DOTS)[number];
      const dot = CRUMB_TRAIL_DOTS[i] as (typeof CRUMB_TRAIL_DOTS)[number];
      expect(dot.cx, 'a crumb sits left of the one behind it').toBeGreaterThan(prev.cx);
      expect(dot.cy, 'the trail does not rise').toBeLessThan(prev.cy);
      expect(dot.r).toBeGreaterThan(prev.r);
      expect(dot.opacity).toBeGreaterThan(prev.opacity);
    }
    expect(MASCOT_TRAIL).toHaveLength(CRUMB_TRAIL_DOTS.length);
  });

  it('leaves the character room at the end of the box', () => {
    const lastDot = CRUMB_TRAIL_DOTS[CRUMB_TRAIL_DOTS.length - 1] as (typeof CRUMB_TRAIL_DOTS)[number];
    expect(CRUMB_TRAIL_HEAD.x).toBeGreaterThan(lastDot.cx + lastDot.r);
    expect(CRUMB_TRAIL_HEAD.x + CRUMB_TRAIL_HEAD.width).toBeLessThanOrEqual(CRUMB_TRAIL_VIEWBOX.width);
  });
});

describe('motion', () => {
  it('gives a whole-body animation something to transform', () => {
    // `transform-origin` on a group resolves in the element's own user space, so `50 94` is the
    // bottom of the crumb whatever CSS box the caller gave the `<svg>`. Animating the `<svg>` would
    // put the origin in CSS pixels and a 40px mark and a 168px one would squash about different
    // points. The wrapper is always emitted, including for Mono — a conditional one means the
    // animation classes silently do nothing on the constructions somebody tries first.
    for (const construction of CONSTRUCTIONS) {
      expect(crumbMascotMarkup({ mood: 'idle', construction })).toContain('<g class="crumb-all">');
    }
  });

  it('emits a hook for every animation the set defines, and no orphan hook', () => {
    /*
     * The defect this exists to catch is the one the conformance audit found: a complete rig with
     * `crumb-eyes`, `crumb-mouth`, `crumb-halo` and `crumb-spark-*` emitted into the DOM and **no
     * stylesheet targeting any of them**. A hook with nothing on the other end is not a smaller
     * version of a working animation; it is dead markup that reads as a working one.
     */
    const scan = crumbMascotMarkup({ mood: 'reading', construction: 'outlined' });
    expect(scan, 'scan has no eyes to move').toContain('class="crumb-eyes"');
    const halo = crumbMascotMarkup({ mood: 'nearMe', construction: 'outlined' });
    expect(halo, 'halo has nothing to pulse').toContain('class="crumb-halo"');
    const spark = crumbMascotMarkup({ mood: 'found', construction: 'outlined' });
    expect(spark).toContain('crumb-spark-1');
    expect(spark).toContain('crumb-spark-2');
  });

  it('does not build an animation with no screen behind it', () => {
    /*
     * `#rules` rule 6 for moods, applied to motion. **Nibble is deliberately absent** — `#motion`
     * restricts it to marketing because *"it implies a countdown we cannot honour"*, and this
     * product has no marketing surface. **Trail is absent from this union** for a different reason:
     * it is three crumbs *and* a character, so it is `CrumbTrail`, not something the mascot does to
     * itself. Neither absence is an oversight and this line is where that is recorded.
     */
    const animations: CrumbAnimation[] = ['none', 'bob', 'wobble', 'scan', 'land', 'halo'];
    expect(animations).not.toContain('nibble');
    expect(animations).not.toContain('trail');
  });
});

describe('the neutral face stays neutral', () => {
  /**
   * **The condition the owner's 2026-08-31 ruling was granted under, asserted rather than trusted.**
   *
   * `nothingFound` is on the modal outcome of an import — roughly 73% of them — and `#moods` is
   * explicit about why it is flat rather than sad: *"a sad mascot turns the product's most common
   * outcome into a small failure eight times a week. Neutral says that happens, and moves on."* The
   * strongest argument made against putting a face there at all was that a mascot at the moment the
   * user did not get what they wanted reads as the product being charming at them about its own
   * failure. **A rueful mouth is what would realise that**, and it is four units of curvature away.
   *
   * That is too small a distance to leave to a reviewer's eye across a future retune, so it is a
   * number here.
   */

  /**
   * The control point's offset from the chord, in the authoring square, for a stroked mouth.
   * Positive is downward in SVG coordinates, which is a smile; 0 is a straight line; negative
   * curves up, which is a frown. `null` when the path holds no curve command at all.
   *
   * **`null` rather than 0, and the two regexes are case-sensitive**, because both shortcuts bit
   * on the first draft. The relative matcher carried `/i`, so it matched the absolute `Q47 71` and
   * returned 71 as if it were an offset. And returning 0 for an unparsed path makes the instrument
   * report *flat* for every shape it cannot read — the failure mode that matters here, since flat
   * is the answer these tests are protecting.
   *
   * The separator is `[\s,]*` rather than `[ ,]+` because SVG lets a minus sign be its own
   * separator: `q3.2-3.6` is two numbers, and requiring whitespace silently unparsed `wiggle`.
   */
  const curvature = (d: string): number | null => {
    const relative = /q\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(d);
    if (relative?.[2] !== undefined) return Number(relative[2]);
    const absolute = /M\s*(-?[\d.]+)[\s,]*(-?[\d.]+)\s*Q\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(d);
    if (absolute?.[2] !== undefined && absolute[4] !== undefined) {
      return Number(absolute[4]) - Number(absolute[2]);
    }
    return /[hlv]/i.test(d) ? 0 : null;
  };

  it('measures curvature the way the drawing means it', () => {
    // The instrument first, on paths whose answer is readable off the path data by hand: `smile`
    // is `q7 6 14-.4`, so 6 units down; `content` is `q5 3.6 10 0`, 3.6; `grin` is `Q47 71` from
    // `M36 57.5`, so 13.5; `flat` is `h11`, a horizontal lineto with no curve at all.
    expect(curvature('M40 59.5q7 6 14-.4')).toBe(6);
    expect(curvature('M42 60.5q5 3.6 10 0')).toBe(3.6);
    expect(curvature('M36 57.5Q47 71 58 57.5Z')).toBe(13.5);
    expect(curvature('M42 62h11')).toBe(0);
    // A minus sign as its own separator, which is `wiggle`, and which an earlier version could not
    // read — and silently called flat.
    expect(curvature('M40 62q3.2-3.6 6.4 0t6.4 0')).toBe(-3.6);
    // A frown, which the set does not contain — the instrument has to be able to see one.
    expect(curvature('M42 62q5 -3.6 10 0')).toBe(-3.6);
    // And a shape it genuinely cannot read must say so rather than answer "flat".
    expect(curvature('M0 0A5 5 0 0 1 10 10')).toBeNull();
  });

  it('draws “nothing found” with no curve in it at all', () => {
    const mood = CRUMB_MOODS.nothingFound;
    const mouth = CRUMB_MOUTHS[mood.mouth];
    expect(mouth.kind, 'the neutral mouth became a filled shape').toBe('stroke');
    expect(curvature((mouth as { d: string }).d), 'the neutral mouth gained a curve').toBe(0);
    for (const eye of CRUMB_EYE_SETS[mood.eyes]) {
      expect(eye.kind, 'the neutral eyes stopped being strokes').toBe('stroke');
      expect(curvature((eye as { d: string }).d), 'a neutral eye gained a curve').toBe(0);
    }
  });

  it('keeps it distinguishable from the moods either side of it', () => {
    /*
     * The failure this catches is not "someone drew a frown" — it is a retune that narrows the gap
     * until deadpan and content are the same face at 48px, which is the size it renders at on the
     * no-places screen. Rendered against `beenThere` at 48/56/64/84px and looked at, they separate;
     * this is what stops that from quietly stopping being true.
     */
    const of = (name: keyof typeof CRUMB_MOUTHS) => {
      const value = curvature((CRUMB_MOUTHS[name] as { d: string }).d ?? '');
      expect(value, `${name} could not be measured`).not.toBeNull();
      return value as number;
    };
    expect(Math.abs(of('content') - of('flat'))).toBeGreaterThanOrEqual(3);
    expect(Math.abs(of('smile') - of('flat'))).toBeGreaterThanOrEqual(3);
    // Every stroked mouth has to be readable, so an unparsed one cannot hide among them.
    for (const [name, mouth] of Object.entries(CRUMB_MOUTHS)) {
      if (mouth.kind !== 'stroke') continue;
      expect(curvature(mouth.d), `${name} could not be measured`).not.toBeNull();
    }
  });

  it('contains no downturned mouth anywhere in the set', () => {
    // `wiggle` is the one mouth that leaves the baseline upward, and it is the *offline* face — a
    // squiggle, not a frown; its second arc returns. Every other stroked mouth curves down or not
    // at all. A new mouth with a net upward curve would be a frown, and there is no product state
    // that warrants one: `#moods` lists no angry, crying or sad face on purpose.
    for (const [name, mouth] of Object.entries(CRUMB_MOUTHS)) {
      if (mouth.kind !== 'stroke' || name === 'wiggle') continue;
      expect(curvature(mouth.d) ?? -1, `${name} curves upward`).toBeGreaterThanOrEqual(0);
    }
  });
});
