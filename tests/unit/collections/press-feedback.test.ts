import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PRESS_BEAT, PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';

/**
 * **Every pressable thing on the collections surfaces acknowledges a press.**
 *
 * W3-1's exit criterion, and until now the collections tab met none of it:
 * `grep -rn 'PRESS_\|active:' src/app/collections/ src/components/collections/` returned nothing,
 * while an independent verifier driving CDP-forced `:active` found 12 of 12 controls on
 * `/collections` and 11 of 19 on `/collections/[id]` with no acknowledgement at all. On a phone
 * there is no hover and no `focus-visible`, so a tap on a collection row was confirmed only by the
 * next screen arriving.
 *
 * The regression this guards is not "somebody deletes a press" — it is **a new control added
 * without one**, which is how the gap appeared in the first place. So the assertion is shaped
 * around what a new control looks like: a raw `<button>` or `<Link>` in these two directories.
 * `<Button>` is exempt because `buttonVariants` already carries `PRESS_BEAT` and `PRESS_BUTTON`;
 * that is asserted here too, so the exemption cannot go quiet.
 */

const DIRS = ['src/app/collections', 'src/components/collections'];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => `${dir}/${name}`);
}

/**
 * The file with its comments removed.
 *
 * Both assertions below are about *class strings*, and the comments explaining them necessarily
 * quote the things they forbid — the third time in this run a source-text guard has been tripped by
 * the prose written to justify it (K12's hex literals, K5's bracketed classes, now this). Reading
 * code rather than prose is the fix; rewording the comment is not.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** A control counts as acknowledged if its own 16-line opening block reaches a press constant,
 *  directly or through one of the two shared class strings that carry one. */
const CARRIERS = ['PRESS_ROW', 'PRESS_CHIP', 'PRESS_BUTTON', 'TEXT_ACTION'];

function unacknowledged(): string[] {
  const found: string[] = [];
  for (const dir of DIRS) {
    for (const file of tsxFiles(dir)) {
      const lines = code(file).split('\n');
      lines.forEach((line, index) => {
        if (!/^\s*<(button|Link)\b/.test(line)) return;
        const block = lines.slice(index, index + 16).join('\n');
        if (!CARRIERS.some((carrier) => block.includes(carrier))) {
          found.push(`${file}:${index + 1}`);
        }
      });
    }
  }
  return found;
}

describe('press feedback on the collections surfaces', () => {
  it('reaches every raw button and link', () => {
    expect(unacknowledged()).toEqual([]);
  });

  it('leaves no bare transition beside a motion-safe press', () => {
    // The shape to watch for, learned elsewhere in this run: once `PRESS_BEAT`'s
    // `motion-safe:transition` is on an element, an un-prefixed `transition-colors` beside it is
    // reachable *only* by the users who asked for less motion — a hover fade that exists for
    // exactly the audience that did not want it. The fix is to delete it, not to prefix it.
    for (const dir of DIRS) {
      for (const file of tsxFiles(dir)) {
        for (const [index, line] of code(file).split('\n').entries()) {
          if (!/\btransition-colors\b/.test(line)) continue;
          expect(
            line.includes('motion-safe:'),
            `${file}:${index + 1} has a bare transition-colors`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps the exemption honest — Button still carries its own press', () => {
    const button = readFileSync('src/components/ui/button.tsx', 'utf8');
    expect(button).toContain('PRESS_BEAT');
    expect(button).toContain('PRESS_BUTTON');
  });

  it('uses the shared beat rather than a hand-written active state', () => {
    // Run rule 6a: press is a variant on a shared class string, never assembled in a ternary.
    expect(PRESS_ROW.startsWith(PRESS_BEAT)).toBe(true);
    expect(PRESS_CHIP.startsWith(PRESS_BEAT)).toBe(true);
    for (const dir of DIRS) {
      for (const file of tsxFiles(dir)) {
        expect(code(file), `${file} hand-writes an active: state`).not.toMatch(
          /(?<!motion-safe:)active:scale/,
        );
      }
    }
  });
});
