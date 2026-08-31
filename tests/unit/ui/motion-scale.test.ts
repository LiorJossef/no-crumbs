/**
 * **The motion scale, checked as a scale rather than as twelve strings.**
 *
 * `lib/interaction.ts` is the whole of the product's motion vocabulary. The owner asked for
 * animation *"from micro to more dominant"* on every transition, and the failure mode of that
 * request is fourteen durations with no reason for any of them — so what is worth guarding is not
 * that any one constant has a particular value, but that the set of them is still **a scale**:
 * every duration a registered token, every tier distinct, every exit faster than its entrance,
 * every transform behind `motion-safe:`.
 *
 * Three of the four assertions below would have caught a defect this repository has actually
 * shipped:
 *
 *  - **A token that generates no utility.** `--radius-md` was referenced four times in
 *    `button.tsx`, never defined, and four button sizes rounded at the wrong radius for as long as
 *    the file existed — silently, because Tailwind does not error on a missing `@theme` key, it
 *    simply generates nothing. `globals.css`'s own header records the sequel: `--duration-*` is the
 *    wrong namespace for the `duration` utility, which resolves against `--transition-duration`, so
 *    a plausible-looking key registers cleanly and produces no class. **This file compiles the real
 *    stylesheet** with the same `compile()` the PostCSS plugin calls, exactly as
 *    `design-system/design-tokens.test.ts` does, rather than grepping it for strings.
 *  - **A transform that survives `prefers-reduced-motion`.** `chrome-motion.ts`'s header records
 *    the reduced-motion user getting the only broken rendering of the sign-in screen, from variants
 *    that named `opacity` and forgot the transforms.
 *  - **A constant with no call site.** `--ease-exit` was registered in W0 and referenced by nothing
 *    in `src/` until this scale used it: a principle with a token and no implementation.
 *
 * `environment: 'node'` (`vitest.config.ts`), so nothing renders here. That 400 ms with an 8 px
 * rise reads as a screen *arriving* rather than as a screen being slow is a browser at 390×844,
 * and that evidence lives with the task.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import * as interaction from '@/lib/interaction';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GLOBALS = path.join(ROOT, 'src/app/globals.css');

/** Every export of the vocabulary, by name. Read off the module rather than listed, so a
 *  thirteenth constant is covered by every assertion here the moment it is added. */
const SCALE: readonly (readonly [string, string])[] = Object.entries(
  interaction as Record<string, string>,
);

/** Every distinct utility across the whole vocabulary, variants and all. */
const UTILITIES = [...new Set(SCALE.flatMap(([, value]) => value.split(/\s+/)))].filter(Boolean);

/**
 * `@import` resolution, which the PostCSS plugin normally does for us — the same three lines
 * `design-tokens.test.ts` uses, and for the same reason: `tw-animate-css` publishes its stylesheet
 * under the `style` export condition and node's own resolver refuses it outright.
 */
function resolveStylesheet(id: string, base: string): string {
  if (id.startsWith('.')) return path.resolve(base, id);
  const parts = id.split('/');
  const pkg = id.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? id);
  const subpath = id.length > pkg.length ? `.${id.slice(pkg.length)}` : '.';
  const dir = path.join(ROOT, 'node_modules', pkg);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  const entry =
    pkg === 'tailwindcss' && subpath === '.' ? './index.css' : manifest.exports?.[subpath];
  const file = typeof entry === 'string' ? entry : (entry?.style ?? entry?.default);
  if (!file) throw new Error(`no stylesheet export for ${id}`);
  return path.join(dir, file);
}

/** Compile `globals.css` for exactly these candidates, and return the CSS. */
async function build(candidates: readonly string[]): Promise<string> {
  const compiler = await compile(readFileSync(GLOBALS, 'utf8'), {
    base: path.dirname(GLOBALS),
    loadStylesheet: async (id: string, base: string) => {
      const file = resolveStylesheet(id, base);
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') };
    },
    loadModule: async () => {
      throw new Error('globals.css should not load a JS plugin');
    },
  });
  return compiler.build([...candidates]);
}

/** `globals.css` as text, for the token *values* — which `compile()` cannot report, because a
 *  utility's output is `var(--duration-base)` and not `220ms`. Deliberately the whole file rather
 *  than a sliced `:root` block: the first `:root` in this stylesheet is inside a doc comment, and
 *  a slice that starts there reads a paragraph of prose and asserts nothing. */
function tokenSource(): string {
  return readFileSync(GLOBALS, 'utf8');
}

describe('every utility in the vocabulary is a utility', () => {
  /**
   * **The silent failure this repository has already paid for, applied to the whole scale at
   * once.** A misspelled or unregistered class does not error, it renders unstyled — and an
   * unstyled *animation* class is invisible in a way an unstyled colour is not, because the page
   * simply looks like nobody added an animation.
   */
  it('compiles, from the real globals.css', async () => {
    const css = await build(UTILITIES);
    const missing = UTILITIES.filter((utility) => {
      // The generated selector escapes `:` in a variant, and `.` and `/` in a value.
      const selector = utility.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/:/g, '\\\\:');
      return !new RegExp(String.raw`\.${selector}(?![\w-])[^{]*\{`).test(css);
    });
    expect(missing, `these generated no rule at all:\n${missing.join('\n')}`).toEqual([]);
  });

  /**
   * Run rule 6a: after W0 registered the scales, a bracket is a review failure the same way a
   * hard-coded colour is. `K5`'s ratchet counts `duration-[` and `ease-[` among others and sits at
   * its exact measured count, so this is the same rule stated where an author of a *new* constant
   * will read it rather than where a CI failure will point.
   */
  it('carries no arbitrary value anywhere', () => {
    for (const [name, value] of SCALE) expect(value, name).not.toMatch(/\[[^\]]+\]/);
  });

  /**
   * **No bare number, either.** `duration-300` compiles perfectly well and is not an arbitrary
   * value, so `K5` cannot see it — and it is exactly the bypass this file exists to prevent: a
   * timing chosen at a call site instead of taken from the scale. Two of them were in the tree at
   * `c585ce7` (`duration-200` ×3, `duration-140` ×1), each equal to a token that already existed.
   */
  it('names every duration and easing, and numbers none of them', () => {
    for (const utility of UTILITIES) {
      expect(utility, `${utility} is a number, not a name`).not.toMatch(
        /(?:^|:)(?:duration|delay|ease)-\d/,
      );
    }
  });
});

describe('reduced motion is handled once, in the vocabulary', () => {
  /**
   * §3a rule 4's inversion: the un-prefixed state *is* the reduced-motion case, so an author
   * cannot forget to write one. This is the assertion that makes "handled once" a property of the
   * twelve constants rather than a promise about ninety call sites.
   */
  it('puts every transform behind motion-safe, and never uses motion-reduce', () => {
    for (const [name, value] of SCALE) {
      expect(value, name).not.toContain('motion-reduce:');
      for (const utility of value.split(/\s+/)) {
        const moves =
          /(?:^|:)(?:scale|translate|rotate|slide-(?:in|out)|zoom-(?:in|out)|transition(?:$|-transform))/.test(
            utility,
          );
        if (moves) expect(utility, `${utility} in ${name}`).toContain('motion-safe:');
      }
    }
  });

  /**
   * And the other half of the same rule, which is the one that is easy to get backwards: they
   * collapse **to the opacity change alone, not to nothing.** An `animate-in` whose fade was also
   * `motion-safe:` would be a cut under the preference — a screen that simply replaces another
   * with no transition at all, which is what §3a says not to do.
   */
  it('leaves every entrance a fade that survives the preference', () => {
    for (const [name, value] of SCALE) {
      if (!value.includes('animate-in') && !value.includes('animate-out')) continue;
      const fade = value
        .split(/\s+/)
        .find((utility) => /^fade-(?:in|out)-0$/.test(utility));
      expect(fade, `${name} animates but has no un-prefixed fade`).toBeDefined();
    }
  });

  /**
   * **No continuous loop, and this is a guard rather than a note.** §3a bans continuous pin
   * pulsing outright, and the trap is that a loop "collapsed" under `prefers-reduced-motion` into
   * an opacity loop produces precisely what the rule forbids while appearing to obey it. The
   * cheapest way to keep that out of the vocabulary is for the vocabulary to contain no repeat.
   */
  it('defines no repeating animation', () => {
    for (const [name, value] of SCALE) {
      expect(value, name).not.toMatch(/(?:^|:)(?:repeat-|animate-(?:pulse|bounce|ping|spin))/);
    }
  });
});

describe('the tiers are a scale', () => {
  /** The five tiers, in order, with the token each is defined as. A change to one of these numbers
   *  is a change to the product's motion and should read as one in a diff. */
  const TIERS = [
    { token: 'press', ms: 90 },
    { token: 'enter', ms: 140 },
    { token: 'couple', ms: 160 },
    { token: 'cross', ms: 200 },
    { token: 'base', ms: 220 },
    { token: 'surface', ms: 300 },
    { token: 'screen', ms: 440 },
  ] as const;

  /**
   * The values, read out of `globals.css` rather than restated here. This is the pairing
   * `iteration-2-record.md` §5 asks for — a comment tied to the constant it describes — applied to
   * a docblock table that would otherwise be documentation nobody could falsify.
   */
  it('resolves to the seven registered durations, in increasing order', () => {
    const root = tokenSource();
    const values = TIERS.map(({ token, ms }) => {
      expect(root, `--duration-${token}`).toContain(`--duration-${token}: ${ms}ms;`);
      return ms;
    });
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  /**
   * **Exits are faster than entrances**, which is the one principle in this scale that is a rule
   * rather than a number: a thing arriving deserves to be seen, a thing leaving is in the way.
   *
   * Asserted as two properties rather than one, because the second is the part that stops the rule
   * decaying into taste. Every exit is strictly faster than the entrance it answers — and **every
   * exit runs at the same duration**, 140 ms, whatever it is leaving. One exit speed for the whole
   * product is a rule an author can hold; "an exit should feel quicker" is not, and is how a system
   * ends up with an exit per surface.
   */
  it('leaves at one speed, and always faster than it arrived', () => {
    const order = TIERS.map((tier) => tier.token);
    const msOf = (value: string): number => {
      const tier = TIERS.find(({ token }) => value.includes(`duration-${token}`));
      expect(tier, `no known duration in ${value}`).toBeDefined();
      return tier!.ms;
    };
    expect(order.length).toBe(TIERS.length);

    const pairs = [
      ['ENTER_REVEAL', 'LEAVE_REVEAL'],
      ['ENTER_SURFACE', 'LEAVE_SURFACE'],
    ] as const;
    for (const [entrance, exit] of pairs) {
      expect(msOf(interaction[exit]), `${exit} against ${entrance}`).toBeLessThan(
        msOf(interaction[entrance]),
      );
    }

    const exitSpeeds = new Set(
      SCALE.filter(([name]) => name.startsWith('LEAVE_')).map(([, value]) => msOf(value)),
    );
    expect([...exitSpeeds], 'every exit runs at one duration').toEqual([140]);
  });

  /**
   * And the curves that go with them. `--ease-exit` is an accelerating curve and had **no call
   * site anywhere in `src/`** before this scale: the principle above was registered as a token and
   * never implemented. An entrance that reached for it would be a thing arriving in a hurry.
   */
  it('gives entrances a decelerating curve and exits the accelerating one', () => {
    for (const [name, value] of SCALE) {
      if (name.startsWith('LEAVE_')) {
        expect(value, name).toContain('ease-exit');
      } else {
        expect(value, name).not.toContain('ease-exit');
      }
    }
    expect(tokenSource()).toContain('--ease-exit: cubic-bezier(0.3, 0, 1, 1);');
  });
});

describe('the entrances cannot hide anything', () => {
  /**
   * **The constraint the sign-in screen was rebuilt around, applied to every entrance in the
   * product.** Motion writes a variant's initial state into the server HTML, so `/` and `/sign-in`
   * shipped ten and eleven inline `opacity: 0` declarations that only React hydrating removed —
   * measured with scripting *on* and every `.js` request aborted: 0 of 7 controls visible on the
   * product's front door. Content that depends on JavaScript to become visible is content that is
   * conditionally absent.
   *
   * `animate-in` cannot fail that way, and the property that makes it safe is *the absence of a
   * fill mode*: the element's resting state is its natural one and the keyframe is only ever a
   * departure from it. **A `delay-*` would break that** — a delayed animation with `fill-mode:
   * none` renders the finished state, then snaps back to the start when the delay elapses — so the
   * guard is on both halves.
   */
  it('sets no fill mode and no delay, so the resting state is the visible one', () => {
    for (const [name, value] of SCALE) {
      expect(value, name).not.toMatch(/(?:^|:)fill-mode-/);
      expect(value, name).not.toMatch(/(?:^|:)delay-/);
    }
  });

  /**
   * The installed `tw-animate-css`, verified rather than assumed, because the assertion above is
   * only meaningful while `--animate-in`'s own default fill mode is `none`. A minor release that
   * changed it to `both` would make every `ENTER_*` in this product hide its element until the
   * stylesheet ran — the exact regression this scale exists to avoid — and nothing else in the
   * repository would notice.
   */
  it('rides a keyframe whose own default fill mode is none', () => {
    const vendor = readFileSync(
      path.join(ROOT, 'node_modules/tw-animate-css/dist/tw-animate.css'),
      'utf8',
    );
    expect(vendor).toContain('--animate-in: enter var(--tw-animation-duration,var(--tw-duration');
    expect(vendor).toContain('var(--tw-animation-fill-mode,none)');
  });

  /**
   * **`transition-none` on an animated element is not a contradiction, and it is load-bearing.**
   * Tailwind's `duration-*` sets `transition-duration` as well as the `--tw-duration` the keyframe
   * reads, and CSS's initial `transition-property` is `all` — so `animate-in … duration-screen`
   * alone leaves the element with every property transitioning over 440 ms for the rest of its
   * life. A class toggled on that element a minute later would fade instead of switching, which is
   * a side effect nobody wrote and nobody would find.
   */
  it('makes the stray transition-duration inert on every entrance', () => {
    for (const [name, value] of SCALE) {
      if (!value.includes('animate-in') && !value.includes('animate-out')) continue;
      expect(value, name).toContain('transition-none');
    }
  });
});

describe('the vocabulary reaches the product', () => {
  const sources = [
    'src/components/add/add-sheet.tsx',
    'src/components/sheet/place-sheet.tsx',
    'src/components/sheet/saved-place-edits.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/map.tsx',
    'src/components/ui/textarea.tsx',
    'src/app/import/screens/paste-screen.tsx',
    'src/app/import/screens/rail-screen.tsx',
    'src/app/import/screens/no-places-screen.tsx',
    'src/app/import/screens/failure-screen.tsx',
    'src/app/import/screens/review/review-screen.tsx',
    'src/app/import/screens/import-shell.tsx',
  ].map((file) => ({ file, source: readFileSync(path.join(ROOT, file), 'utf8') }));

  /** A constant nothing renders is a constant that will drift — the lesson `--ease-exit` taught by
   *  sitting registered and unused. Every export earns its place by being imported somewhere. */
  it('imports every constant somewhere', () => {
    const everything = sources.map(({ source }) => source).join('\n');
    const orphans = SCALE.map(([name]) => name).filter(
      (name) =>
        !new RegExp(String.raw`\b${name}\b`).test(everything) &&
        // The four press strings predate this scale and are consumed across `collections/`,
        // `nav/`, `map/` and `ui/button.tsx`, which `press-feedback.test.ts` already asserts.
        !name.startsWith('PRESS_') &&
        // `COUPLE_BEAT` is written out in `place-sheet.tsx` rather than imported; the assertion
        // below is its guard, and its docblock says why.
        name !== 'COUPLE_BEAT',
    );
    expect(orphans, `no call site for: ${orphans.join(', ')}`).toEqual([]);
  });

  /**
   * **The drift guard for the one constant that is duplicated rather than imported.**
   *
   * `place-sheet.tsx`'s two leading squares carry `COUPLE_BEAT`'s text as a literal, because
   * `tests/unit/map/row-pin-coupling-row.test.ts` greps that file for those exact class names and
   * routing them through the constant fails three of its assertions on a change that alters no
   * rendered class at all. That file carries another lane's assertions and is not this lane's to
   * edit. Duplication with a guard is the trade this repository has taken before (`palette.ts` and
   * `palette-tokens.test.ts`); duplication without one is how the pair silently diverges.
   */
  it('keeps the row↔pin coupling byte-identical to the couple tier', () => {
    const sheet = readFileSync(path.join(ROOT, 'src/components/sheet/place-sheet.tsx'), 'utf8');
    // Both halves of one row: the leading square scales, the muted line and the distance darken.
    // The second pair is what caught the drift that prompted this guard — they carried the
    // duration and not the easing, so a row's disc moved on `ease-standard` while its own ink
    // faded on the browser default, in the same 160 ms.
    expect(sheet.match(new RegExp(interaction.COUPLE_BEAT, 'g')) ?? []).toHaveLength(2);
    expect(sheet.match(new RegExp(interaction.COUPLE_TINT, 'g')) ?? []).toHaveLength(2);
  });

  /**
   * **The large tier lands on every screen of the import flow, not on some of them.** That flow is
   * the product's one multi-step journey; a screen without the entrance is a hard cut in the middle
   * of a sequence, which reads as a bug rather than as restraint.
   */
  it('gives all five import screens the same arrival', () => {
    const screens = sources.filter(({ file }) => file.includes('import/screens/'));
    const withoutEntrance = screens
      .filter(({ file }) => !file.endsWith('import-shell.tsx'))
      .filter(({ source }) => !source.includes('ENTER_SCREEN'));
    expect(withoutEntrance.map((s) => s.file)).toEqual([]);
  });

  /**
   * **No continuous loop may ignore the preference, on any surface this scale reaches.**
   *
   * `motion-scale.test.ts` already forbids a repeat *in the vocabulary*; this is the other half,
   * because a loop written straight at a call site never passes through `interaction.ts` at all.
   * `ui/map.tsx`'s three loader dots were exactly that — a bare `animate-pulse` on a surface shown
   * on **every** map mount, since the map is `!isLoaded` until its style resolves. §3a bans a
   * continuous pulse outright, and a reduced-motion user was getting three of them.
   */
  it('never loops without motion-safe', () => {
    // Comments are blanked line by line rather than dropped, so the reported line numbers still
    // point at the source. Both forms matter here: the file that failed this guard first also
    // *documents* the fix in a `{/* … */}` block, and a guard that cannot tell a call site from a
    // sentence about a call site is a guard that gets worked around by not writing the sentence —
    // which is the defect `token-call-sites.test.ts` records `K12` having had.
    const withoutComments = (source: string): string =>
      source
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');
    const loops = sources.flatMap(({ file, source }) =>
      withoutComments(source)
        .split('\n')
        .map((line, index) => ({ file, line: line.trim(), number: index + 1 }))
        .filter(({ line }) => /(?<!motion-safe:)\banimate-(?:pulse|bounce|ping|spin)\b/.test(line)),
    );
    expect(loops.map((l) => `${l.file}:${l.number} ${l.line}`)).toEqual([]);
  });

  /**
   * **`motion/react` is gone from the add sheet, and that is a bundle claim as much as a motion
   * one.** This file was the library's only importer on `/map` — `chrome-motion.ts` is imported by
   * nothing in `src/` and `sign-in/page.tsx` is a different entry — so an import here puts the
   * whole of Motion on the product's main route to fade one pane.
   */
  it('animates the add sheet without shipping a motion library to /map', () => {
    const add = sources.find(({ file }) => file.endsWith('add-sheet.tsx'));
    expect(add?.source).not.toContain("from 'motion/react'");
    expect(add?.source).toContain('ENTER_SURFACE');
  });
});
