/**
 * **A ratchet on how components are allowed to reach for colour.**
 *
 * Two groups. The first is the ramp — a component that writes `text-[var(--mint-700)]` has reached
 * past the role layer, and the cost lands later and elsewhere: the dark-mode pass that was still
 * owed could not move a colour 44 files named directly. There were 75 such call sites; there are
 * none. The second is **composition**, which iteration 1 never tokenised at all and which `K12` was
 * structurally unable to see.
 *
 * A ceiling test is only worth having if raising it is harder than fixing the code, so:
 * **raising any number here is the regression this file exists to catch.** A call site that
 * genuinely needs one gets a comment saying why, and the number moves in the same commit with the
 * reason in the body.
 *
 * Source text, in a node environment, following `tests/unit/shell/one-shell.test.ts`: what is being
 * asserted is a property of what is *written*, not of what renders.
 *
 * ## What this file got wrong, twice, and it is the same mistake both times
 *
 * **A guard reports a correct number to a narrower question than its name implies, and the number
 * being correct is what stops anybody checking.** Measured by a lane that did not build it:
 *
 *  - the composition guard matched the **word** `white`, so `bg-white/55` failed and
 *    `bg-[rgba(255,255,255,0.55)]` — the identical composite — passed;
 *  - `K5`, named *the arbitrary-value class count*, counted **13 of 68**, with `tracking-[` alone
 *    bigger than everything it saw, against a ceiling of 96;
 *  - `K12` sat at **25 of 26**, so the same appended line failed at one commit and passed at the
 *    next, and **10 of those 25 lines were comments**.
 *
 * Three properties follow, and they are the standing requirement on anything added here. **Match
 * the pigment, not the spelling** — `pigmentOf()` resolves six notations rather than grepping for
 * two English words. **State what each assertion cannot see, beside its budget** — every ceiling
 * below names its blind spot in its own comment. **Prove a guard fails before trusting it** — every
 * assertion here has been run against a deliberately reintroduced defect, appended to a real
 * component and restored, and the ones that did not fail were rewritten until they did.
 *
 * `docs/overnight-run-plan.md` §4's numbers for `K5` and `K12` no longer describe the same
 * quantities as the assertions named after them; both changed on measurement, and the docs are not
 * this package's to edit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

/**
 * Comments removed, **line numbers kept**.
 *
 * Four guards in this repository have now been fooled by prose, and every one is the same shape: a
 * regex over raw source cannot tell a comment from a call site. `bg-white/55` quoted in a file
 * header tripped the composition guard; four mascot hex literals quoted in a doc comment pushed
 * `K12` from 26 to 27; `chrome-tokens.test.ts` tripped on a token being *named in the comment
 * explaining why it was removed*; and `K12`'s own budget of 26 turns out to be counting **10 lines
 * of prose out of 25** (measured, and see its assertion below).
 *
 * The cost of not doing this is not a false failure — it is worse. The clearest thing a comment can
 * say about a removed value is its name, so a guard that fires on documentation teaches authors to
 * describe class names in words. Two files in `src/` already do exactly that.
 *
 * Comment bodies become spaces rather than disappearing, so a failure can still name a line number
 * that a reader can open. Deliberately narrow, the same narrowness `chrome-tokens.test.ts` declares:
 * block comments (which covers the JSX `{...}` form) and `//` to end of line, with `//` left alone
 * when it follows a `:` or a quote so a `https://` inside a string survives. Over-stripping can only
 * make an assertion weaker on a line that is not a call site.
 */
function withoutComments(source: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
}

function componentSources(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ path: name, source: withoutComments(readFileSync(SRC + name, 'utf8')) }));
}

/**
 * `.ts` as well as `.tsx`, and only the composition assertions below use it.
 *
 * A Tailwind class string does not have to live in a component: `add-sheet.tsx` keeps
 * `MENU_ROW_CLASS` at module scope and `place-sheet.tsx` keeps several, and any one of them could
 * move to a plain `.ts` sibling tomorrow — `ui/place/category-display.ts` already holds a
 * `color-mix()` expression, which is a composition value in a file this suite's `.tsx`-only reader
 * cannot see. The ramp assertions above stay on `.tsx` because their numbers were measured there
 * and a ceiling test whose denominator moves is not a ceiling.
 */
function allSources(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => ({ path: name, source: withoutComments(readFileSync(SRC + name, 'utf8')) }));
}

/** Every match of `pattern` across `src/**` `.tsx`, with the file it came from — the file is what
 *  makes a failure actionable rather than a number that went up. */
function matches(pattern: RegExp, files = componentSources()): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const { path, source } of files) {
    for (const match of source.matchAll(pattern)) found.push({ path, text: match[0] });
  }
  return found;
}

/** Where a Tailwind utility's colour goes. `text-` is deliberately absent from the surface list
 *  below and present here, because the two cases are opposites — see the second assertion. */
const SURFACE_UTILITIES = 'bg|border|from|to|via|ring|fill|stroke|outline|divide|shadow|accent|caret|decoration';

/* -------------------------------------------------------------------------------------------- *
 * The pigment resolver.
 *
 * **The first version of this file matched the word `white`, not the colour white**, and an
 * independent lane measured the gap: `bg-white/55` failed and `bg-[rgba(255,255,255,0.55)]` passed.
 * They are the same composite, the same theme-blindness, six characters of syntax apart. The header
 * below states the class correctly — *a pigment and an alpha are not a colour* — and what the code
 * implemented was a search for two English words.
 *
 * So: parse the notation, resolve it to sRGB, and compare. Six notations, and the list is the
 * boundary a reader should be able to find, so it is written out rather than implied:
 *
 *   `#fff` `#ffff` `#ffffff` `#ffffffff`   hex, 3/4/6/8 digits
 *   `rgb()` / `rgba()`                     numbers or percentages, comma or space separated
 *   `hsl()` / `hsla()`                     L = 100% is white and L = 0% is black at any H and S
 *   `oklch()` / `lch()`                    L at the top of the range with C = 0
 *   `oklab()` / `lab()`                    L at the top of the range with a = b = 0
 *   the keywords `white` and `black`
 *
 * **What it does not resolve, deliberately:** `color()` in an arbitrary colour space,
 * `light-dark()`, a `var()` (which is the token layer working correctly), and `currentColor`. Each
 * would need a resolver of its own and none appears in `src/`. A seventh notation arriving is a
 * hole, and the way it gets closed is by being added here.
 *
 * Alpha 0 is **not** a pigment: `rgba(0, 0, 0, 0)` is `transparent` spelled long, and `ui/map.tsx`
 * uses it twice as exactly that. Reading it as "black" is the mirror image of the bug being fixed —
 * matching a spelling instead of a colour.
 * -------------------------------------------------------------------------------------------- */

/** Tailwind writes a space as `_` inside an arbitrary value, so `hsl(0_0%_100%_/_55%)` has to
 *  become `hsl(0 0% 100% / 55%)` before anything can parse it. */
function normalise(literal: string): string {
  return literal.replace(/_/g, ' ').trim();
}

/** A number or a percentage, as its numeric value — `55%` is `0.55`, `100%` is `1`. */
function scalar(part: string): number {
  return part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part);
}

/** `'white'`, `'black'`, or `null` for a colour that is neither, an alpha of 0, or a notation this
 *  does not read. `null` is also what an unparseable string gets: a guard that guesses is worse
 *  than one whose boundary is written down. */
function pigmentOf(literal: string): 'white' | 'black' | null {
  const value = normalise(literal);

  if (/(?<![\w-])white(?![\w-])/.test(value)) return 'white';
  if (/(?<![\w-])black(?![\w-])/.test(value)) return 'black';

  const hex = /^#([0-9A-Fa-f]{3,8})$/.exec(value);
  if (hex?.[1] !== undefined) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    if (digits.length === 8 && parseInt(digits.slice(6, 8), 16) === 0) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    if (r === 255 && g === 255 && b === 255) return 'white';
    if (r === 0 && g === 0 && b === 0) return 'black';
    return null;
  }

  const call = /^([a-z]+)\(([\s\S]*)\)$/.exec(value);
  if (call?.[1] === undefined || call[2] === undefined) return null;
  const [, fn, argsRaw] = call;
  const [channelsRaw, alphaRaw] = argsRaw.split('/');
  const parts = (channelsRaw ?? '').split(/[\s,]+/).filter(Boolean);
  const alpha = alphaRaw === undefined ? undefined : scalar(alphaRaw.trim());
  if (alpha === 0) return null;

  if (fn === 'rgb' || fn === 'rgba') {
    if (parts.length < 3) return null;
    if (parts.length > 3 && scalar(parts[3] as string) === 0) return null;
    const channels = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    if (channels.every((c) => c === 255)) return 'white';
    if (channels.every((c) => c === 0)) return 'black';
    return null;
  }

  if (fn === 'hsl' || fn === 'hsla') {
    if (parts.length < 3) return null;
    if (parts.length > 3 && scalar(parts[3] as string) === 0) return null;
    const lightness = scalar(parts[2] as string);
    if (lightness >= 1) return 'white';
    if (lightness <= 0) return 'black';
    return null;
  }

  if (fn === 'oklch' || fn === 'lch' || fn === 'oklab' || fn === 'lab') {
    if (parts.length < 1) return null;
    // `oklab`/`oklch` run L from 0 to 1; `lab`/`lch` from 0 to 100. Only a *neutral* is white or
    // black — `oklch(1 0.2 30)` is out of gamut, not white.
    const top = fn.startsWith('ok') ? 1 : 100;
    const lightness = scalar(parts[0] as string);
    const isPolar = fn === 'oklch' || fn === 'lch';
    const neutral = isPolar
      ? parts.length < 2 || scalar(parts[1] as string) === 0
      : parts.slice(1, 3).every((p) => scalar(p) === 0);
    if (!neutral) return null;
    if (lightness >= top) return 'white';
    if (lightness <= 0) return 'black';
    return null;
  }

  return null;
}

/** Every colour literal in a source, in any of the notations above, with its line. */
function colourLiterals(source: string): { text: string; line: number }[] {
  const candidate = new RegExp(
    [
      String.raw`#[0-9A-Fa-f]{3,8}\b`,
      String.raw`\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\((?:[^()]|\([^()]*\))*\)`,
      String.raw`(?<![\w-])(?:white|black)(?![\w-])`,
    ].join('|'),
    'g',
  );
  return [...source.matchAll(candidate)].map((m) => ({
    text: m[0],
    line: source.slice(0, m.index).split('\n').length,
  }));
}

describe('components reach for roles, not for the ramp', () => {
  it('has no raw var(--mint-N) call site left', () => {
    // The run's K6, whose target is <= 10. It is 0, and 0 is what is asserted: a role exists for
    // every use the product has, so the next one to appear is an author who did not look.
    const raw = matches(/var\(--mint-[0-9]+\)/g);
    expect(raw.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });

  it('does not grow the count of colour-bearing arbitrary values', () => {
    /*
     * The run's K5, and **it was measuring 13 against a ceiling of 96 — 83 free brackets.** Its own
     * comment said *"Waves 2-7 take this the rest of the way down. Lower the ceiling when they
     * did"*; they did, and nobody lowered it. A ratchet with that much slack is a number, not a
     * gate: every one of the seven theme-blind literals could have been written as a bracket and
     * this would not have moved.
     *
     * Re-tensioned to the measured count. The pattern is unchanged, so the number stays comparable
     * to the 166 → 96 the run reported.
     *
     * **What it does not see, stated because that is the whole finding of this session:** eight of
     * the property namespaces below carry an arbitrary value and none is in this list —
     * `tracking-[` alone is 15, larger than everything counted here. The assertion under it is the
     * honest total. This one is deliberately the *colour-bearing* subset, because that subset is
     * what the token layer exists for and what a ratchet on it protects.
     */
    const arbitrary = matches(/\b(?:bg|text|border|shadow|rounded|ring|duration|ease)-\[[^\]]+\]/g);
    expect(arbitrary.length, arbitrary.map((m) => `${m.path}: ${m.text}`).join('\n')).toBeLessThanOrEqual(13);
  });

  it('does not grow the total arbitrary-value count either', () => {
    /*
     * **The quantity K5's name describes**, which K5 was never measuring: 68, of which it sees 13.
     * Largest uncounted first — `tracking` 15, `pb` 9, `text` 7, `w` 6, `top` 5, `shadow` 5,
     * `max-h` 5, `max-w` 4. The token layer has a tracking scale and a spacing scale; a bracket in
     * either is the same bypass a `bg-[…]` is, and until now nothing counted it.
     *
     * **Arbitrary *variants* are excluded, and that is not an oversight.** `aria-[current=true]:`,
     * `data-[state=open]:`, `has-data-[…]:` and `max-[…]:` are arbitrary *selectors* — the normal
     * and correct way to write a state variant in Tailwind v4, with no token layer to bypass. There
     * are 33 of them and counting them would produce exactly the kind of number this session is
     * about: correct, and answering a narrower question than its name implies. The `(?![:/])`
     * lookahead is what separates the two, `/` because a named group writes `group-data-[x]/card:`.
     */
    const values = matches(/(?<![\w[-])[a-z][a-z0-9-]*-\[[^\]\s]+\](?![:/])/g);
    expect(values.length, values.map((m) => `${m.path}: ${m.text}`).join('\n')).toBeLessThanOrEqual(68);
  });

  it('does not add a hard-coded colour', () => {
    /*
     * The run's K12: the count may only go down. Each remaining line is a decision —
     * `map-surface.live.tsx` is frozen dead code, `global-error.tsx` renders without the stylesheet
     * by construction, and `basemap-tint-layer.tsx` feeds MapLibre, which cannot read a custom
     * property (see `ui/place/palette.ts`).
     *
     * **Two things about this number changed, and both were measured.**
     *
     * *It was one slot from its ceiling*, at 25 of 26 — and that made it **nondeterministic across
     * unrelated commits**. The same appended `bg-[#ffffff]` failed at `6499777` and passed at
     * `853b6a0`, because one hex literal left the tree in between and freed the slot. A ratchet with
     * one slot left does not gate the next colour; it gates whoever happens to be holding the file
     * when the 26th arrives.
     *
     * *And 10 of those 25 lines were comments.* `componentSources()` now strips them, which is what
     * takes the real code count to 15 and the ceiling with it. The old budget was partly a budget
     * for prose: `chrome-tokens.test.ts` records this KPI going 26 → 27 on four hex values quoted in
     * a *doc comment*, and the workaround the repo adopted was to stop naming colours in comments.
     * That is a guard making the codebase worse.
     *
     * **Stripping comments here reverses an explicit earlier ruling, so the reasoning is recorded
     * rather than left to be re-litigated from it.** The ruling was that a guard asserting *a thing
     * is not used* should strip comments, but `K12` is a budget on *authored colour*, where quoting
     * a hex in prose is the author's choice and citing a token name is better prose anyway. The
     * boundary was drawn deliberately and it does not survive the measurement: **10 of the 25 lines
     * this counted were comments**, so the authored-colour budget was 40% documentation — a KPI
     * measuring authored colour *plus prose about colour* while being read as the first. That is
     * the same defect the rest of this file fixes, sitting inside the one guard exempted from the
     * fix.
     *
     * The concern behind the ruling is real: a hex quoted in a comment can rot away from the value
     * it describes. **The answer to that is a drift guard tying the comment to the constant, not a
     * budget that counts prose** — this repository now has three of those
     * (`palette-tokens.test.ts`, and the halo and keyline guards in `chrome-tokens.test.ts`), and a
     * comment is the cheapest place a measurement can live where the next reader will find it.
     * Overturned on the measurement, 2026-08-31.
     *
     * **This is a change to what K12 measures**, so the number here and the 26 in
     * `overnight-run-plan.md` §4 no longer describe the same quantity. The docs are not this
     * package's to edit; the discrepancy is reported rather than silently absorbed.
     */
    const lines = componentSources().flatMap(({ path, source }) =>
      source
        .split('\n')
        .map((line, index) => ({ path, line, number: index + 1 }))
        .filter(({ line }) => /#[0-9A-Fa-f]{6}/.test(line)),
    );
    expect(
      lines.length,
      lines.map((l) => `${l.path}:${l.number} ${l.line.trim()}`).join('\n'),
    ).toBeLessThanOrEqual(15);
  });
});

/**
 * **The half `K12` was structurally unable to see.**
 *
 * K12 above counts `#rrggbb`, and every one of the seven literals iteration 2 opened with —
 * `bg-white/55` ×2, `bg-black/40` ×2, `text-white` ×2, `border-white` — contains no hex at all. Nor
 * does `color-mix(in oklab, var(--category-cafe) 12%, transparent)`. So a run whose stated job was
 * to tokenise colour finished with a **1.18:1 sign-in panel** and a near-black category disc, with
 * every colour assertion green throughout (`iteration-2-plan.md` §1).
 *
 * The class is one thing said three ways: **a pigment and an alpha are not a colour.** `white`,
 * `black`, and a percentage inside a colour function all name something that has to be composited
 * before it means anything, and what it composites against changes with the theme. A token can
 * carry two values; a literal cannot carry one that is right in both.
 */
describe('composition is tokenised, not only colour', () => {
  it('compiles no white or black through Tailwind, in any notation', () => {
    /*
     * **Hard zero, and it now matches the pigment rather than the word.**
     *
     * The first version of this assertion matched `-white` and `-black` as strings. An independent
     * lane appended one line at a time to a real component and measured what that actually caught:
     *
     *   bg-white/55                                    fails    <- the word
     *   border-white                                   fails    <- the word
     *   bg-white/[0.55]                                fails    <- the word
     *   bg-[color-mix(in_oklab,white_55%,transparent)] fails    <- the word
     *   bg-[rgba(255,255,255,0.55)]                    PASSED
     *   bg-[#fff]  /  bg-[#ffffff]                     PASSED
     *   bg-[hsl(0_0%_100%_/_55%)]                      PASSED
     *
     * Reproduced here before this was rewritten, and the pattern is exact: **everything caught
     * contained the English word, everything missed named the same colour numerically.**
     * `bg-[rgba(255,255,255,0.55)]` *is* `bg-white/55` — the same composite, the same 1.18:1 panel,
     * six characters of syntax apart.
     *
     * So the match is now: a colour utility, in any variant chain, whose value resolves to white or
     * black — named (`bg-white/55`), or bracketed in any notation `pigmentOf` reads. Every one of
     * the nine rows above fails, and each was re-run against a real appended line rather than
     * reasoned about.
     *
     * `text-` is included here and excluded from `SURFACE_UTILITIES` below, because the two
     * assertions ask opposite questions: white *ink* is as theme-blind as a white *surface*, while
     * `--foreground` at an alpha is only wrong on a surface.
     */
    const utilities = new RegExp(
      String.raw`(?<![\w[])(?:${SURFACE_UTILITIES}|text)-(?:(?:white|black)(?:/(?:\d+|\[[^\]]+\]))?|\[[^\]\s]+\])`,
      'g',
    );
    const compiled = matches(utilities, allSources()).filter((m) => {
      const bracket = /-\[([^\]]+)\]$/.exec(m.text);
      /*
       * A bracketed utility is resolved from its contents; a named one already says which it is.
       *
       * **`-white` here, not `pigmentOf`'s word test**, and the difference cost a regression caught
       * by re-running the matrix: `pigmentOf` excludes a preceding `-` so that the phrase
       * *near-white* in a string is not a colour, and a Tailwind utility is spelled `bg-white`
       * — with the hyphen. Resolving the utility name through the literal resolver silently
       * un-caught the four cases this file was written for.
       */
      return bracket?.[1] === undefined
        ? /-(?:white|black)\b/.test(m.text)
        : pigmentOf(bracket[1]) !== null;
    });
    expect(compiled.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });

  it('assigns no white or black to a CSS colour property in an inline style', () => {
    /*
     * The ninth row of the same matrix, and the one that bypasses Tailwind entirely:
     * `style={{ background: 'rgba(255,255,255,0.55)' }}` passed every assertion in this file.
     * `place-sheet.tsx` paints the row disc through exactly this seam, so it is a live path and not
     * a hypothetical one.
     *
     * Matched on the **property**, not on the element: a colour literal assigned to a CSS colour
     * property in an object literal, wherever that object is written. That deliberately covers a
     * `const style = { … }` declared away from its JSX, which is the shape a brace-matching scan of
     * `style={{` would miss.
     *
     * It does **not** match `'text-color': '#ffffff'` — a MapLibre paint key is quoted and kebab, so
     * the quote sits between the name and the colon — nor `ctx.fillStyle = '#000000'`, which is an
     * assignment rather than a property. Both are real, both are in the allowlist below with their
     * reasons, and both are genuinely unable to read a custom property. The overlap is worth stating
     * plainly: if a MapLibre default ever lands under a key named `fill` or `color`, it will fail
     * here and belongs in the allowlist with a sentence, not in an exception to this pattern.
     */
    const CSS_COLOUR_PROPERTIES = [
      'background', 'backgroundColor', 'color', 'borderColor', 'borderTopColor',
      'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke',
      'boxShadow', 'textShadow', 'caretColor', 'accentColor', 'textDecorationColor',
      'columnRuleColor', 'WebkitTextFillColor',
    ].join('|');
    const assignment = new RegExp(
      String.raw`(?<![\w'"\`-])(?:${CSS_COLOUR_PROPERTIES})\s*:\s*(['"\`])([^'"\`]*)\1`,
      'g',
    );
    const painted: string[] = [];
    for (const { path, source } of allSources()) {
      for (const match of source.matchAll(assignment)) {
        const value = match[2];
        if (value === undefined) continue;
        // Every colour *inside* the value, not the value as a whole. `boxShadow: '0 1px 2px
        // rgba(0,0,0,.4)'` is a shadow token bypassed, and the first draft of this assertion missed
        // it because it asked whether the entire string parsed as a colour. Found by running the
        // matrix rather than by reading the regex.
        for (const literal of colourLiterals(value)) {
          if (pigmentOf(literal.text) !== null) painted.push(`${path}: ${match[0]}`);
        }
      }
    }
    expect(painted).toEqual([]);
  });

  it('keeps every other white and black pigment on a named, reasoned list', () => {
    /*
     * **The rest of the pigments, which are not a hole and are not free either.**
     *
     * Thirteen white or black literals live in `src/`, none of them reachable by CSS, and every one
     * is a decision someone made for a stated reason. A hard zero here would be a lie; an unbounded
     * count would be the hole the previous version had. So: a list, by file, with the count and the
     * reason, and a new one anywhere fails until somebody writes down why it is there.
     *
     * The common thread is that **none of these seven files can resolve a custom property.** A
     * MapLibre paint expression is evaluated by the GL renderer, a canvas `fillStyle` by the 2D
     * context, and an SVG string by the parser — `var(--x)` is an unparseable string to all three.
     * That is the same argument `ui/place/palette.ts` makes at length for existing at all.
     *
     * Counts, not just filenames, so that adding a fourth white to a file that already has three
     * still fails.
     */
    const ALLOWED: Record<string, { count: number; because: string }> = {
      // The mascot's catchlight. Brand illustration rather than a UI surface, and its own comment
      // says why it does not follow the keyline into Flat's warmer brown: it is a highlight, not
      // ink. A highlight is white in both themes on purpose.
      'components/brand/crumb-mascot-markup.ts': { count: 1, because: 'MASCOT_SHINE, the catchlight' },
      'components/brand/mascot-colors.ts': { count: 1, because: 'MASCOT_SHINE, declared' },
      // White is the *input* to `tintColor()`, which is theme-aware. The literal is not what paints
      // — in light the tint is uncapped so it stays white, and at night it follows `labelHalo`
      // toward black.
      'components/map/basemap-tint-layer.tsx': { count: 1, because: 'the untinted halo, before tintFor()' },
      // One `TOKEN_FALLBACK` surface for when the document's custom properties cannot be read, and
      // two `ctx.fillStyle` values used to *probe* glyph coverage on a scratch canvas. The probes
      // are never painted to screen; they are a measurement.
      'components/map/country-flag-image.ts': { count: 3, because: 'canvas probe ink and the token fallback' },
      // Frozen dead code, exactly as K12's own note says.
      'components/map/map-surface.live.tsx': { count: 2, because: 'frozen, unwired' },
      // Vendor scaffolding defaults for the GeoJSON and cluster layers this wrapper ships and
      // nothing in `src/` mounts. `Marker` is imported nowhere either.
      'components/ui/map.tsx': { count: 4, because: 'unmounted MapLibre layer defaults' },
      // `ON_CATEGORY_INK`, the light half of `--on-category`, duplicated for the GL renderer. The
      // dark half is `#131312` and is not a pigment.
      'ui/place/palette.ts': { count: 1, because: 'the GL copy of --on-category' },
    };

    const found = new Map<string, string[]>();
    for (const { path, source } of allSources()) {
      for (const literal of colourLiterals(source)) {
        if (pigmentOf(literal.text) === null) continue;
        found.set(path, [...(found.get(path) ?? []), `${literal.line}: ${literal.text}`]);
      }
    }
    for (const [path, hits] of found) {
      const allowed = ALLOWED[path];
      expect(allowed, `${path} has a white/black literal and no entry saying why: ${hits.join(', ')}`).toBeDefined();
      expect(hits.length, `${path} (${allowed?.because}) — ${hits.join(', ')}`).toBeLessThanOrEqual(allowed?.count ?? 0);
    }
    // The list may only shrink: an entry for a file that no longer has one is a stale exemption,
    // and a stale exemption is how a hole reopens quietly.
    for (const path of Object.keys(ALLOWED)) {
      expect(found.has(path), `${path} is exempted and no longer needs to be — delete the entry`).toBe(true);
    }
  });

  it('does not paint a surface in --foreground at an alpha', () => {
    /*
     * The eighth instance of the same class, found while photographing the seventh, and the worst
     * of them by area: `import-shell.tsx` scrims the desktop import overlay with
     * `lg:bg-foreground/35`. Measured in Chromium — light `oklab(0.2217 … / 0.35)`, dark
     * `oklab(0.9610 … / 0.35)`. It is a dark ink scrim in daylight and a **near-white veil over the
     * entire 1440x900 viewport** at night, which is `bg-white/55`'s bug with a token's name on it.
     *
     * `--foreground` and `--background` are the two tokens that swap ends of the ramp between
     * themes, so an alpha on either is the sharpest form of this defect. **`text-foreground/70` is
     * fine** and is deliberately not matched: dimming *ink* toward the ground is correct in both
     * themes, because the ground is what it is being dimmed toward. Painting a *surface* in the ink
     * colour is the inversion. `bg-background/50` is likewise correct and likewise unmatched — a
     * veil in the page's own ground fades the right way in both themes — which is why this names
     * `foreground` rather than "any theme token".
     *
     * A ceiling of one rather than zero because the fix is in a file this package was not given.
     * Two assertions rather than one so that *replacing* the known instance with a new one
     * elsewhere still fails: the first catches a new file, the second a second occurrence.
     * **When `import-shell.tsx` is fixed, delete `KNOWN` and leave the empty-array assertion** —
     * that is the ratchet, and it only turns one way.
     */
    const KNOWN = ['app/import/screens/import-shell.tsx'];
    const found = matches(
      new RegExp(String.raw`\b(?:${SURFACE_UTILITIES})-foreground/\d+`, 'g'),
      allSources(),
    );
    expect(found.filter((m) => !KNOWN.includes(m.path)).map((m) => `${m.path}: ${m.text}`)).toEqual([]);
    expect(found.length, found.map((m) => `${m.path}: ${m.text}`).join(', ')).toBeLessThanOrEqual(
      KNOWN.length,
    );
  });

  it('does not write a literal percentage inside a color-mix()', () => {
    /*
     * The row disc's `12%`, which is where iteration 2's third measured defect lived. A percentage
     * in a colour function is an alpha: 12% of a colour is a soft wash on a near-white card and a
     * dark olive on a near-black one, and no single number is right in both. `--tint-strength` is
     * that number, and `ui/place/category-display.ts`'s `categoryTintVar()` is the one place the
     * expression is written.
     *
     * **This is the assertion that has to be worded carefully**, because the instrument that
     * preceded it was wrong in the mirror-image way: `overnight-run-report.md` §7 records a guard
     * that grepped raw markup for `\d+%` and tripped on this very `color-mix(… 12%, transparent)`
     * while it was still correct. So the match is scoped to the inside of a `color-mix()` — where
     * a percentage genuinely is an alpha — and a `w-[80%]` or a `translate-y-1/2` is not this bug
     * and is not matched.
     *
     * `globals.css` is not read here on purpose: a percentage *defining* the token is exactly where
     * one belongs.
     */
    const mixes = matches(/color-mix\([^;\n]{0,160}?\d+(?:\.\d+)?%\s*[,)]/g, allSources());
    expect(mixes.map((m) => `${m.path}: ${m.text}`)).toEqual([]);
  });
});
