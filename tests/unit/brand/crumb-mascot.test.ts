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
