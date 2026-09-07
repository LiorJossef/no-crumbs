/**
 * **Guards the five saved-place controls against the defect `docs/archive/product-review-2026-09-01-r5.md`
 * §2 finding 1 measured: a Server Action `await`ed bare inside `startTransition`, so an offline
 * press rejected, React escalated the rejection to `app/error.tsx`, and the map went from seven
 * pins to none — taking the note the user had just typed with it.**
 *
 * The bug was invisible to every existing check. It type-checks, it lints, it passes a static
 * render, and it survives a production build; `grep -c catch` returning **0** on a 750-line file is
 * the only signal it ever gave. So this guard is a source guard, deliberately, and it asserts the
 * property that actually held the screen together: **the only thing this file `await`s is
 * `attemptWrite`.** That phrasing is the point — a sixth control added next month is covered by
 * construction, where a list of five action names would silently exempt it.
 *
 * `vitest.config.ts` runs `node`: there is no DOM, nothing here can click, and the offline states
 * below cannot be entered by rendering. They were entered for real instead, with
 * `context.setOffline(true)` at 390×844 and 1440×900 — that measurement is the evidence this
 * works, and this file is what stops it coming back. Each block therefore proves itself against a
 * reintroduced copy of the bug rather than only asserting the fixed shape, the idiom
 * `rtl-safety.test.ts` established on this same component.
 *
 * The per-control rulings are asserted here too, because each is a decision that would otherwise
 * live only in a comment:
 *
 *  - the note and the name pass `keepsDraft`, and the other three do not;
 *  - the note editor closes **only** on `ok`, which is the whole of "the note survives";
 *  - the delete collapses its confirmation **only** on `refused`, so silence leaves the retry one
 *    press away;
 *  - and both delete branches can render an error, since one of them can now stay open through a
 *    failure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Comments blanked, line numbers kept — `rtl-safety.test.ts`'s `withoutComments`, copied rather
 *  than imported for the reason it states: `vitest.config.ts` collects `*.test.ts` only, so there
 *  is nowhere shared to put it. Load-bearing here, since this component's header now *describes*
 *  the bug in prose and an unstripped search would find `await setSavedPlaceVisited` in a sentence
 *  explaining why it must not exist. */
function withoutComments(source: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
}

const SOURCE = withoutComments(
  readFileSync(
    fileURLToPath(new URL('../../../src/components/sheet/saved-place-edits.tsx', import.meta.url)),
    'utf8',
  ),
);

/** Everything this source `await`s, as the identifier that follows the keyword. */
function awaitedIdentifiers(source: string): string[] {
  return [...source.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!);
}

/** The balanced-brace body that follows `header`, so an assertion can be scoped to one function
 *  rather than to a 750-line file where `setEditing(false)` legitimately appears three times. */
function bodyOf(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `${header} is not in the source`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${header}`);
}

/** One exported component's source, from its `export function` to the next one or the end of file.
 *  `bodyOf` cannot do this: the first balanced brace pair after `export function Name(` is the
 *  destructured props object, so it returns the parameter list rather than the component. */
function componentSource(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start, `${name} is not exported from the source`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/**
 * The actions this component file calls. **`updateSavedPlaceName` is deliberately not here**: the
 * rename pencil left the UI on 2026-09-02 (lane B-T4) and the action, the column and its grant all
 * stayed, so there is nothing in this file for it to be awaited bare *in*. Adding a UI for it again
 * puts the name back on this list and back inside the four assertions below.
 */
const ACTIONS = [
  'setSavedPlaceVisited',
  'updateSavedPlaceCategory',
  'updateSavedPlaceNote',
  'deleteSavedPlace',
] as const;

describe('no Server Action is awaited bare', () => {
  it('awaits nothing but attemptWrite', () => {
    // The one assertion that would have caught the original defect, and the only one whose
    // coverage does not decay: a control added later is inside it without anyone remembering.
    expect(awaitedIdentifiers(SOURCE)).toEqual(['attemptWrite', 'attemptWrite', 'attemptWrite', 'attemptWrite']);
  });

  it('catches the bug put back', () => {
    // Proof the assertion above discriminates: this is the exact line that shipped until
    // 2026-09-01, restored into a copy of the source.
    const reverted = SOURCE.replace(
      'await attemptWrite(() => updateSavedPlaceNote(savedPlaceId, draft), {',
      'await updateSavedPlaceNote(savedPlaceId, draft); void ({',
    );
    expect(reverted).not.toEqual(SOURCE);
    expect(awaitedIdentifiers(reverted)).toContain('updateSavedPlaceNote');
  });

  it('routes all four actions through attemptWrite, each exactly once', () => {
    for (const action of ACTIONS) {
      const calls = [...SOURCE.matchAll(new RegExp(`\\b${action}\\s*\\(`, 'g'))];
      const wrapped = [...SOURCE.matchAll(new RegExp(`attemptWrite\\(\\(\\) =>\\s*${action}\\s*\\(`, 'g'))];
      // One call site per action, and it is the wrapped one. Counting both sides rather than only
      // the wrapped one is what stops a second, unwrapped call slipping in beside it — the shape
      // of the original bug was five call sites, not one.
      expect(calls, `${action} call sites`).toHaveLength(1);
      expect(wrapped, `${action} inside attemptWrite`).toHaveLength(1);
    }
  });
});

describe('keepsDraft is on exactly the one control that holds text', () => {
  it('the note passes it; the toggle, the category and the delete do not', () => {
    // It was two until the rename editor left the UI. The rule did not change — a control that
    // holds a draft says so on failure — the file simply has one such control now.
    const noteSave = bodyOf(SOURCE, 'function save() {');

    expect(noteSave).toContain('keepsDraft: true');

    // Not a matter of taste: `keepsDraft` chooses between *Try again* and *What you typed is still
    // here*, and promising a draft on a toggle would be a claim about something that does not
    // exist.
    expect(bodyOf(SOURCE, 'function toggle() {')).not.toContain('keepsDraft');
    expect(bodyOf(SOURCE, 'function choose(next: ProductCategory | null) {')).not.toContain('keepsDraft');
    expect(bodyOf(SOURCE, 'function remove() {')).not.toContain('keepsDraft');

    // And nowhere else in the file, so the count is the ruling rather than a coincidence of where
    // the two happen to sit.
    expect([...SOURCE.matchAll(/keepsDraft/g)]).toHaveLength(1);
  });
});

describe('the note survives a failed save', () => {
  const noteSave = bodyOf(SOURCE, 'function save() {');

  it('closes the editor only on ok', () => {
    // The whole of "the note survives": the `<textarea>` stays mounted, so `draft` — plain
    // `useState` — is still holding the user's words. Anything that ran `setEditing(false)` on a
    // failure would unmount the field and drop them, which is a second way to lose the note that
    // has nothing to do with the error boundary.
    const okBranch = noteSave.slice(noteSave.indexOf("outcome.kind === 'ok'"));
    expect(noteSave).toContain("if (outcome.kind === 'ok') {");
    expect([...noteSave.matchAll(/setEditing\(false\)/g)]).toHaveLength(1);
    expect(okBranch).toContain('setEditing(false)');
    // The failure path sets a message and touches nothing else.
    expect(noteSave).toContain('setError(outcome.message)');
    expect(noteSave).not.toContain('setDraft(');
  });

  it('catches a close-on-failure put back', () => {
    const reverted = noteSave.replace(
      'setError(outcome.message);',
      'setEditing(false);\n      setError(outcome.message);',
    );
    expect([...reverted.matchAll(/setEditing\(false\)/g)]).toHaveLength(2);
  });
});

describe('the rename editor is gone from the UI and the write path is not', () => {
  it('leaves no rename control behind in this file', () => {
    // Lane B-T4 removed `RenameTrigger` and `NameEditor`. The assertion is on the component file
    // only: `updateSavedPlaceName`, `saved_places.display_name` and `domain/places/display-name.ts`
    // are deliberately untouched, so a renamed row keeps its name and restoring the control is a
    // component rather than a migration.
    expect(SOURCE).not.toContain('export function NameEditor');
    expect(SOURCE).not.toContain('export function RenameTrigger');
    expect(SOURCE).not.toContain('Rename this place');
    expect(SOURCE).not.toContain('updateSavedPlaceName');
  });
});

describe('the delete tells silence from refusal', () => {
  const remove = bodyOf(SOURCE, 'function remove() {');

  it('collapses the confirmation only on refused', () => {
    // Silence settles nothing: the place is still there and still the one the user meant, so the
    // two-step gesture must not have to be repeated because of a two-second signal drop.
    expect(remove).toContain("if (outcome.kind === 'refused') setConfirming(false)");
    expect([...remove.matchAll(/setConfirming\(false\)/g)]).toHaveLength(1);
  });

  it('can render its message in both states', () => {
    // The failure this one nearly introduced: keeping the confirm step open through an unreachable
    // delete set a message into a branch that had no `role="alert"` to paint it — a silent failure
    // inside the fix for a silent failure.
    const component = componentSource(SOURCE, 'RemoveSavedPlace');
    expect([...component.matchAll(/role="alert"/g)]).toHaveLength(2);
  });
});

describe('nothing here became optimistic', () => {
  it('still writes no local copy of the place before the server answers', () => {
    // The wrong lesson to draw from this finding is that the controls should revert optimistically.
    // They were never optimistic — the screen died because a rejection escaped, not because a flip
    // had to be undone — and `revalidatePath('/map')` remains the only thing that moves a pin.
    expect(SOURCE).not.toContain('useOptimistic');
    // `visited` is a prop and stays one. A local mirror of it is the shape optimism would take
    // here, and it would let the screen disagree with the database about where someone has been.
    expect(SOURCE).not.toMatch(/useState\(\s*visited\s*\)/);
  });
});
