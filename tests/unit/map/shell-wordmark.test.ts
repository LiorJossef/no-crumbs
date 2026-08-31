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
import { readFileSync } from 'node:fs';
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

  /** No face: §3.1 rule 2 is *face on chrome, silhouette on data*, and it names the four surfaces
   *  that get one — the app icon, the splash, sign-in and the link preview. A wordmark floating
   *  over the map is on none of them, so it takes `PinMark`'s faceless default. */
  it('takes the faceless mark', () => {
    expect(WORDMARK_CODE).toContain('<PinMark className="size-6" />');
    expect(WORDMARK_CODE).not.toContain('face');
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
