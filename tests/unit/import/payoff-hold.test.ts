/**
 * W6-3 — the payoff beat, and the ruling that keeps it honest at zero.
 *
 * `3 places found` was computed and overwritten on the next statement. Both sat in the same `async`
 * continuation, so React batched them into one commit and **the fact the whole 7-34s wait was for
 * rendered for zero frames.** The fix is an awaited hold between the two `setScreen` calls, which
 * is what ends the batch.
 *
 * A hold is only allowed because of what it holds: a fact the server actually sent. Nothing about
 * what the rail claims changes, only how long the true claim is legible. A timer that *advanced* a
 * stage would be the opposite thing and is what `facelift-plan.md` §4 decision 4 forbids. So this
 * file pins both halves — that the beat exists, and that it stays a delay rather than becoming a
 * claim.
 *
 * And the zero case, which is the one that matters most here. `overnight-copy-deck.md` §9.2 is
 * binding: **the count beat does not execute at N = 0.** A tick from 0 to 0 is the product
 * animating nothing, and `No places named` staged as a payoff presents a non-event in the register
 * of an event. What zero *does* get is the same hold, so the modal outcome of an import — ~73% of
 * them — is arrived at on the same beat, at the same pace, as a success. That is what makes it a
 * destination rather than a failure, and it is a graded gate (§8a Q2's "honest beat").
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { COUNT_TICK_MS } from '@/app/import/screens/count-tick';
import { PAYOFF_HOLD_MS } from '@/app/import/_lib/screen';
import { railExtractFact, railExtractFactParts } from '@/ui/import/rail-extract-fact';

const RUN = readFileSync('src/app/import/_lib/use-import-run.ts', 'utf8');
const RAIL = readFileSync('src/app/import/screens/rail-screen.tsx', 'utf8');
const GLOBALS = readFileSync('src/app/globals.css', 'utf8');

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** From the payoff `setScreen` to the end of `submit` — everything the hold gates. */
function afterThePayoff(): string {
  const body = code(RUN);
  const start = body.indexOf('extractCount: n');
  expect(start, 'the payoff setScreen').toBeGreaterThan(-1);
  return body.slice(start, body.indexOf('} catch {', start));
}

describe('the payoff is not overwritten in the same batch', () => {
  it('awaits a hold between the two setScreen calls', () => {
    // The package's own exit criterion. Without the `await` both statements land in one React
    // commit and the settled rail never paints.
    const after = afterThePayoff();
    expect(after).toContain('await hold(PAYOFF_HOLD_MS, probe.signal)');
    expect(after.indexOf('await hold(')).toBeLessThan(after.indexOf('setScreen('));
  });

  it('re-checks ownership after the hold, not only before it', () => {
    // A Cancel during those 700ms must leave the screen where the user left it. Without the
    // re-check the landing screen arrives after the user has gone back to paste — which is
    // `import-cancel-stale-response.spec.ts`'s bug class with a new window to fire in.
    const after = afterThePayoff();
    const holdAt = after.indexOf('await hold(');
    const landingAt = after.indexOf('setScreen(');
    expect(after.slice(holdAt, landingAt)).toContain('if (!stillCurrent()) return;');
  });

  it('changes no stage after the hold, so the delay never becomes a claim', () => {
    // The Q3 guard. A hold that promoted `source` or `extract` would be a timer advancing a stage
    // the server did not send, which is a failed package rather than a partial one.
    const after = afterThePayoff();
    const holdAt = after.indexOf('await hold(');
    const tail = after.slice(holdAt);
    expect(tail).not.toMatch(/\b(source|extract|resolve):\s*'(pending|active|done)'/);
    expect(tail).not.toContain('extractFact');
  });

  it('cancels the timer on abort rather than leaving it to resolve into an unmounted tree', () => {
    const holdSource = readFileSync('src/app/import/_lib/hold.ts', 'utf8');
    expect(code(holdSource)).toContain('clearTimeout(timer)');
    expect(code(holdSource)).toContain("signal.removeEventListener('abort', finish)");
    // Resolves rather than rejects: a rejection lands in `submit`'s catch, which renders the
    // `INTERNAL` failure screen — so pressing Cancel would show an error about our servers.
    expect(code(holdSource)).not.toContain('reject');
  });
});

describe('the count beat does not execute at zero', () => {
  it('has no parts to count at zero, so no counting component can mount', () => {
    // The gate is a pure function, so this is an assertion about state rather than about pixels —
    // which is what §9.2's acceptance line asks for.
    expect(railExtractFactParts(0)).toBeNull();
    expect(railExtractFactParts(1)).toEqual({ count: 1, rest: 'place found' });
    expect(railExtractFactParts(3)).toEqual({ count: 3, rest: 'places found' });
  });

  it('is the only thing gating the tick in the rail', () => {
    // `CountTick` renders under `countParts === null ? … : …` and nowhere else, so the zero case
    // cannot acquire a counter by some other route.
    expect(code(RAIL)).toContain('countParts === null');
    expect(code(RAIL).match(/<CountTick/g) ?? []).toHaveLength(1);
    expect(code(RAIL)).toContain('railExtractFactParts(rail.extractCount ?? 0)');
  });

  it('still holds at zero — the same beat, at the same pace', () => {
    // The half of §9.2 that is easy to lose: zero is not rushed past. The hold is unconditional in
    // `submit`, taken before the branch that chooses the landing screen.
    const after = afterThePayoff();
    const holdAt = after.indexOf('await hold(');
    const branchAt = after.indexOf("n === 0");
    expect(branchAt).toBeGreaterThan(holdAt);
    expect(after.slice(0, holdAt)).not.toContain('n === 0');
  });

  it('says the shipped sentence at zero, and the right plural everywhere else', () => {
    // C15 / C14 / C13, unchanged. `spec-no-places-found.md` §6.1 keeps the zero sentence
    // deliberately: it is what makes the transition read as a result rather than a jump.
    expect(railExtractFact(0)).toBe('No places named');
    expect(railExtractFact(1)).toBe('1 place found');
    expect(railExtractFact(3)).toBe('3 places found');
  });

  it('cannot let the sentence and the counted number disagree', () => {
    // `1 places found` is the drift this shape exists to prevent, and it is invisible to anyone
    // testing with three candidates. The sentence is composed from the parts, so for every count
    // the two are the same fact by construction.
    for (let n = 1; n <= 12; n += 1) {
      const parts = railExtractFactParts(n);
      expect(parts, String(n)).not.toBeNull();
      expect(railExtractFact(n)).toBe(`${String(parts?.count)} ${String(parts?.rest)}`);
    }
  });
});

describe('the timings are the design system’s, not invented ones', () => {
  it('ticks for exactly `--duration-tick`', () => {
    // `count.tick` is 400ms on `facelift-plan.md`'s closed list, and `--duration-tick` in
    // `globals.css` is the token. `COUNT_TICK_MS` is a JS constant because a count-up is a sequence
    // of rendered values rather than a CSS transition between two — there is nothing for a
    // `transition-*` class to interpolate. This assertion is what keeps it a token anyway.
    const declared = /--duration-tick:\s*(\d+)ms/.exec(GLOBALS)?.[1];
    expect(declared, '--duration-tick in globals.css').toBeDefined();
    expect(COUNT_TICK_MS).toBe(Number(declared));
  });

  it('holds for longer than it ticks, so the climb is never cut off', () => {
    expect(PAYOFF_HOLD_MS).toBeGreaterThan(COUNT_TICK_MS);
  });

  it('adds no new dependency for it', () => {
    // §7c gate 1. SmoothUI's animation layer is Motion *and GSAP*; `gsap` is not in
    // `package.json` and agents may not install one.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies['gsap']).toBeUndefined();
    expect(pkg.devDependencies['gsap']).toBeUndefined();
    expect(pkg.dependencies['@number-flow/react']).toBeUndefined();
  });

  it('has a reduced-motion arm that is the number rather than a shorter climb', () => {
    const tick = readFileSync('src/app/import/screens/count-tick.tsx', 'utf8');
    expect(code(tick)).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(code(tick)).toContain('setShown(value)');
  });

  it('hard-codes no colour and no duration in the tick', () => {
    // K5 and K12 count these wherever they land, including in a component vendored or adapted from
    // elsewhere. The only number in this file is the one pinned to `--duration-tick` above.
    const tick = code(readFileSync('src/app/import/screens/count-tick.tsx', 'utf8'));
    expect(tick).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(tick).not.toMatch(/\bclassName=(["'])[^"']*\[[^"']*\]/);
  });
});
