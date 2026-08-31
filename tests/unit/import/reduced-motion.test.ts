/**
 * W3-3 in the import flow — the accessible path is the default, not the exception.
 *
 * The whole point of `motion-safe:` over `motion-reduce:` is which way round forgetting fails. With
 * `motion-reduce:` the un-prefixed state is the *animated* one, so an author who omits the modifier
 * ships motion to someone who asked for none. Inverted, the un-prefixed state **is** the reduced
 * case, and the worst an omission can cost is an animation nobody gets.
 *
 * Two shapes this codebase learned the hard way, both asserted below.
 *
 * **A spinner is hidden, not frozen.** `motion-safe:animate-spin` alone leaves a stationary
 * `Loader2` — a three-quarter arc, which at rest reads as a rendering artefact rather than as a
 * paused spinner. `hidden` + `motion-safe:block` is the shape, and it is only safe where something
 * else carries the state: every one of these has live text beside it that never leaves. §3a's
 * "collapse to the opacity change, not to nothing" asks for the state to stay **findable**, not for
 * a glyph to stay on screen.
 *
 * **A bare `transition-*` beside a `motion-safe:` one runs only for the people it should not reach.**
 * That is the inversion failing in exactly the direction it exists to prevent, and it is invisible
 * unless you look for it. Delete rather than prefix where it appears.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importClientFiles } from './import-client-source';

/** Every component in the flow, comments stripped — a comment recording what a class replaced is
 *  not a class, and a guard that fired on its own explanation would teach people to delete it. */
function componentSources(): readonly { readonly path: string; readonly code: string }[] {
  return importClientFiles()
    .filter((path) => path.endsWith('.tsx'))
    .map((path) => ({
      path,
      code: readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    }));
}

/** Every `transition-*` / `animate-*` token, with whatever variant prefix it carries. */
function motionClasses(code: string): readonly string[] {
  return [...code.matchAll(/(?:[a-z-]+:)*(?:transition|animate)-[a-z0-9-]+/g)].map((m) => m[0]);
}

describe('the accessible path is the default', () => {
  it('has no `motion-reduce:` left anywhere in the flow', () => {
    for (const { path, code } of componentSources()) {
      expect(code, path).not.toContain('motion-reduce:');
    }
  });

  it('guards every animation with `motion-safe:`, with none left unprefixed', () => {
    // The exit criterion, stated mechanically. A `transition-colors` or an `animate-spin` with no
    // variant runs for everyone, including the people who asked it not to.
    const unguarded = componentSources().flatMap(({ path, code }) =>
      motionClasses(code)
        .filter((cls) => !cls.startsWith('motion-safe:'))
        .map((cls) => `${path}: ${cls}`),
    );
    expect(unguarded).toEqual([]);
  });

  it('needs no `-none` counterpart, because there is nothing left to turn off', () => {
    // `transition-none` / `animate-none` only exist to undo an unguarded animation. Their absence
    // is the inversion having actually happened rather than having been half-applied.
    for (const { path, code } of componentSources()) {
      expect(code, path).not.toContain('transition-none');
      expect(code, path).not.toContain('animate-none');
    }
  });

  it('never leaves a bare `transition-*` beside a guarded one on the same element', () => {
    /*
     * The shape that fails in the direction the inversion exists to prevent: `motion-safe:transition`
     * supersedes the bare one for everyone who has not asked for reduced motion, so the bare one
     * ends up running **only** for the people who did. Found and deleted once already on a shared
     * button base elsewhere in the tree.
     */
    for (const { path, code } of componentSources()) {
      for (const [, classString] of code.matchAll(/className=(?:\{)?["'`]([^"'`]+)["'`]/g)) {
        const classes = motionClasses(classString ?? '');
        const bare = classes.filter((c) => !c.includes(':'));
        const guarded = classes.filter((c) => c.startsWith('motion-safe:'));
        expect(bare.length > 0 && guarded.length > 0, `${path}: ${String(classString)}`).toBe(false);
      }
    }
  });
});

describe('a spinner is hidden under reduced motion, never frozen', () => {
  it('pairs every `animate-spin` with `hidden` and `motion-safe:block`', () => {
    // A stationary three-quarter arc is a rendering artefact, not a paused spinner.
    for (const { path, code } of componentSources()) {
      for (const [, classString] of code.matchAll(/className=(?:\{)?["'`]([^"'`]+)["'`]/g)) {
        if (!(classString ?? '').includes('animate-spin')) continue;
        expect(classString, path).toContain('hidden');
        expect(classString, path).toContain('motion-safe:block');
      }
    }
  });

  it('keeps live text beside each one, which is what makes hiding it safe', () => {
    // Hiding the glyph is only honest because the state is still announced. Each of these sits
    // next to a label that does not change with the motion preference.
    const byFile = new Map(componentSources().map(({ path, code }) => [path, code]));
    const pairs: readonly (readonly [string, string])[] = [
      ['src/app/import/screens/add-by-name.tsx', 'ADD_PENDING'],
      ['src/app/import/screens/add-by-name.tsx', 'SUBMIT_PENDING'],
      ['src/app/import/screens/rail-screen.tsx', 'label="Working on it"'],
      ['src/app/import/screens/review/review-screen.tsx', "'Saving…'"],
    ];
    for (const [path, label] of pairs) {
      expect(byFile.get(path), `${path} → ${label}`).toContain(label);
    }
  });

  it('gives the rail’s step glyph a reduced form rather than hiding it', () => {
    /*
     * The one spinner that may not simply disappear. Everywhere else a label carries the state;
     * here the glyph *is* the state — check, spinner, dot is a three-way indicator — so hiding it
     * would leave the running step's circle emptier than the pending step's, and the active step
     * would read as *less* marked than the one that has not started.
     *
     * Its reduced form is the dot the system already uses for "not done", inheriting `text-brand`
     * from the active circle rather than `pending`'s muted grey.
     */
    const rail = byPath('src/app/import/screens/rail-screen.tsx');
    expect(rail).toContain('size-1.5 rounded-full bg-current motion-safe:hidden');
    // And the three states stay visually distinct without any motion at all.
    expect(rail).toContain("status === 'done' && 'border-brand bg-brand text-white'");
    expect(rail).toContain("status === 'active' && 'border-brand bg-transparent text-brand'");
    expect(rail).toContain("status === 'pending' && 'border-border bg-transparent text-muted-foreground'");
  });
});

function byPath(path: string): string {
  const found = componentSources().find((f) => f.path === path);
  if (found === undefined) throw new Error(`no such component: ${path}`);
  return found.code;
}
