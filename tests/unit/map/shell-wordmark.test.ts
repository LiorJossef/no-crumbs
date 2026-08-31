/**
 * **The shell header wordmark** — `I2-8`, `iteration-2-plan.md` §1.2.
 *
 * `voice-and-vocabulary.md` §2 lists six surfaces the product's name may appear on and puts *the
 * shell header wordmark* first. It was specified before iteration 1 started and never built:
 * `PinMark` was imported by `/`, `/sign-in`, `error.tsx`, `not-found.tsx`, `global-error.tsx` and
 * the collection-join screen — **every surface except the product itself**. Sign in and No Crumbs
 * disappeared.
 *
 * The exit criterion has two halves and both are here: the name is present on the signed-in map,
 * **and** the six-surface rule still holds exactly. The second is the one worth a test — a brand
 * word is precisely the thing that erodes a list like that one string at a time (§1).
 *
 * Its *timing* is the entrance's fifth beat (`I2-7`); the clock itself and the other four beats
 * are `post-login-entrance.test.ts`'s.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORDMARK = readFileSync('src/app/map/shell-wordmark.tsx', 'utf8');
const SHELL = readFileSync('src/components/shell/map-shell.tsx', 'utf8');
const MAP_PAGE = readFileSync('src/app/map/page.tsx', 'utf8');

/** Comments removed. Every *negative* assertion below runs against this rather than against the
 *  source, because this file argues in prose about the very things it must not do — its docblock
 *  says the words "face" and "No Crumbs" while the component does neither. A guard that cannot
 *  tell a comment from a call site is a guard that fails on being explained, which is the opposite
 *  of what it is for. */
const WORDMARK_CODE = WORDMARK.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

describe('the shell header wordmark', () => {
  /**
   * **Surface 1 of the six** (`voice-and-vocabulary.md` §2), specified before iteration 1 and never
   * built — `PinMark` reached `/`, `/sign-in`, the three error screens and the join page, and
   * nothing a signed-in user could see.
   */
  it('puts the name on the signed-in map', () => {
    expect(WORDMARK).toContain('No Crumbs');
    expect(MAP_PAGE).toContain('<ShellWordmark />');
  });

  /**
   * **It claims the entrance and never spends it**, which is what lets two components on one page
   * ask independently and agree: `claimEntrance` only reads, and the single `spendEntrance` in
   * `map-page-client.tsx` runs in an effect after both have rendered. Two spenders would be two
   * chances to close the claim before the other reader has asked.
   */
  it('reads the entrance claim without consuming it', () => {
    expect(WORDMARK).toContain('const [entrance] = useState(claimEntrance);');
    expect(WORDMARK_CODE).not.toContain('spendEntrance');
  });

  /**
   * **And the six-surface rule still holds exactly.** The name appears once on this surface and
   * the list does not grow a seventh entry: `/map`'s own header is surface 1, and nothing else
   * under `src/app/map/` or `src/components/map/` says it.
   */
  it('does not leak the name to a seventh surface', () => {
    const others = [
      'src/app/map/page.tsx',
      'src/app/map/map-page-client.tsx',
      'src/components/shell/map-shell.tsx',
      'src/components/map/map-surface.mapcn.tsx',
    ];
    for (const path of others) {
      // The name may be *discussed* in a comment; what may not happen is it reaching the DOM.
      expect(
        readFileSync(path, 'utf8')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, ''),
      ).not.toContain('No Crumbs');
    }
    expect(WORDMARK_CODE.match(/No Crumbs/g)).toHaveLength(1);
  });

  /**
   * **The mark is back, on the owner's ruling of 2026-08-31 — and this guard failed to notice.**
   *
   * What stood here asserted `not.toContain('PinMark')` and `not.toContain('<svg')`, under a
   * docblock whose stated purpose was *"no mark comes back into this lockup without the ruling
   * being reopened."* The ruling was reopened, the mark came back — and **the assertion passed
   * unchanged**, because a `<CrumbMascot>` is neither of the two spellings it knew. It was matching
   * a spelling while being read as matching a decision, which `chrome-tokens.test.ts`'s header
   * names as one bug seen from two ends. Recorded rather than quietly rewritten: the guard did not
   * hold this change back, the ruling is what permitted it, and a guard that would have passed
   * either way was never protecting anything.
   *
   * So it is re-pointed at the decision instead of at two identifiers. **The mark that may be here
   * is the character with its face**; what may not come back is the faceless disc, in any spelling.
   *
   * ## The measurement that removed the old mark is unchanged, and is the argument for this one
   *
   * `PinMark` at 24px was rasterised at 16× and measured at 720 angles, against four known-answer
   * cases that abort the run if any fails: peak-to-peak irregularity **0.547px** on a 10.67px ink
   * radius, s.d. 0.123px, indistinguishable from a true circle to 64px. The silhouette carries no
   * brand at chip size and still does not. **The face is what carries it**, which is §3.1 rule 2 —
   * *"face on chrome, silhouette on data"* — read forwards rather than as a restriction.
   *
   * ## 32px, and it is the second measurement rather than the design system's number
   *
   * Shot at 1:1 CSS pixels in this chip, both themes, at 20 · 22 · 24 · 26 · 28 · 32 · 36 px: the
   * face is a smudge to 24, the eyes separate at 26–28 with the mouth still closed up, and it reads
   * as a character at **32** — `CRUMB_FACE_MIN_PX` exactly. `#wordmark`'s *"at the shell header the
   * mark sits at 22px"* comes from the same paragraph family as `#mark`'s *"legible blob at 16px"*,
   * which `iteration-2-record.md` §5 records as measurably false. The class is asserted because
   * Tailwind cannot read a constant and 32 is the floor, not a preference.
   */
  it('draws the character, and never the faceless disc', () => {
    expect(WORDMARK_CODE).toContain('<CrumbMascot');
    // The face is the whole point: `mono` has none by definition, so it is the one construction
    // this surface may not use — it is the 0.547px disc with a different fill.
    expect(WORDMARK_CODE).not.toContain("construction=\"mono\"");
    // `idle` is a claim about the surface (`#moods`: "header, app icon, resting"), not a default.
    expect(WORDMARK_CODE).toContain('mood="idle"');
    expect(WORDMARK_CODE).toContain('size-8');
    // The disc that was removed does not return under its old name either.
    expect(WORDMARK_CODE).not.toContain('PinMark');
    // The type is still `/` and `/sign-in`'s — the half of the lockup that never changed.
    expect(WORDMARK_CODE).toContain('DISPLAY_WORDMARK_AXES');
    expect(WORDMARK_CODE).toContain('font-display');
  });

  /**
   * **The ruling admits the mascot to one chip on one route, and this is what holds it there.**
   *
   * A condition of the 2026-08-31 ruling, and the reason it is a condition: the argument that made
   * gold safe on this surface is that a *brand chip with its own card ground* is none of the four
   * things ruling 3's fence names. That argument is about **one element**, and it does not
   * generalise to a second — a mascot behind the sheet, beside the account chip, or on the
   * post-import strip would each need the ruling reopened, and none of them would fail
   * `chrome-tokens.test.ts`, whose fence is scoped to `components/map/`, `ui/place/` and `basemap`
   * and deliberately excludes route composition (`:285`, `:339`).
   *
   * So the count is asserted, over the whole directory rather than over this file, because a *new*
   * file under `src/app/map/` is exactly how a second one would arrive — the same reason that other
   * fence is written by directory. Comments stripped, so this docblock's own mentions do not count.
   */
  it('puts the mascot on exactly one surface under src/app/map/', () => {
    const dir = 'src/app/map';
    const uses = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        const code = readFileSync(file, 'utf8')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '');
        return { file, count: (code.match(/<CrumbMascot/g) ?? []).length };
      })
      .filter(({ count }) => count > 0);

    expect(uses).toEqual([{ file: path.join(dir, 'shell-wordmark.tsx'), count: 1 }]);
  });

  /**
   * **No loop in the corner of a map.** `#motion` is explicit that an animation that repeats
   * *"stops being an event and becomes wallpaper"*, and this chip sits over a surface the user is
   * reading. The entrance's fifth beat already gives it the one movement it is entitled to — a
   * fade — and that is asserted separately below.
   *
   * Written against `animation=` rather than against the six names, so a seventh cannot arrive here
   * by being new.
   */
  it('gives the mascot no animation of its own', () => {
    expect(WORDMARK_CODE).not.toContain('animation=');
  });

  /**
   * **The `lg+` offset is the panel's own width, mirrored**, and this is a fix for a collision the
   * chip was photographed making: at 1440×900 a `left-4` chip sat directly on the desktop panel's
   * `3 in Israel` heading, because at `lg+` the panel occupies the left column and "top left" is
   * two different places above and below the breakpoint.
   *
   * Tailwind scans class strings and cannot read a constant, so the clamp is written twice. This is
   * what stops the two drifting — the same shape `sheet-geometry.ts` uses for `PEEK_PX`, which is
   * mirrored into `globals.css` and held together by a test for the same reason.
   */
  it('clears the desktop panel by exactly the panel width', () => {
    expect(SHELL).toContain('w-[clamp(320px,26vw,392px)]');
    expect(WORDMARK_CODE).toContain('lg:left-[calc(clamp(320px,26vw,392px)_+_1rem)]');
  });

  /** Not a link and not a control: `/map` is the shell, and a wordmark that navigated would be a
   *  second door to somewhere the account chip beside it already had to be argued down to one. */
  it('is not a second way out of the map', () => {
    expect(WORDMARK_CODE).not.toContain('href');
    expect(WORDMARK_CODE).not.toContain('onClick');
    expect(WORDMARK).toContain('pointer-events-none');
  });

  /** It is the last beat, so it fades in rather than appearing — and it fades with the product's
   *  one `enter` rule rather than a second one written for the brand. */
  it('arrives on the entrance clock, with the enter rule', () => {
    expect(WORDMARK).toContain('useEntranceBeat(ENTRANCE_BEATS.wordmark, entrance)');
    expect(WORDMARK).toContain('animate-in fade-in-0 duration-enter');
    expect(WORDMARK).toContain('motion-safe:slide-in-from-bottom-1');
  });
});
