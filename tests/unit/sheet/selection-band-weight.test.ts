/**
 * **The selection band has exactly one loud element, and it is the action.**
 *
 * `docs/ux-select-control-2026-09-03.md` §2. The band shipped with its hierarchy inverted: `Done`
 * and `Select all` were `font-semibold` near-black while the one irreversible control on the
 * screen was grey text at `disabled:opacity-50`, so the two lowest-stakes controls present were
 * the loudest things on it and the delete read as a permanently dead control. The owner filed it
 * as *"it feels off"*; these are the three checks that make the fix falsifiable, plus the two
 * things the spec could not verify and handed to the build.
 *
 * Source text rather than rendering, for the reason `bulk-delete.test.ts` gives: `vitest` runs in
 * `node` with no jsdom, and what is being defended here is a set of class tokens a reviewer would
 * otherwise have to re-read three files for. The browser half — computed colours on hover, no
 * horizontal scroll at either width — is not assertable here and was checked in a real browser.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../src/${path}`, import.meta.url)), 'utf8');

/**
 * Comments out, before anything is matched against.
 *
 * These files argue for their class tokens in prose directly above the class token, so a rule of
 * the form *"the toolbar carries no `font-semibold`"* is otherwise failed by the sentence
 * explaining that it no longer does. The assertions are about what ships to the browser.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SELECTION = read('components/sheet/library-selection.tsx');
const SHEET = read('components/sheet/place-sheet.tsx');
const PANEL = read('components/sheet/place-desktop-panel.tsx');
const COLLECTION = read('components/collections/collection-content.tsx');
const SELECTION_CODE = code(SELECTION);

/** One exported component's body, so a rule about *the band* is not satisfied by a class that
 *  happens to live in the confirm or in a row three hundred lines away. */
function block(source: string, opener: string): string {
  const start = source.indexOf(opener);
  expect(start, `${opener} not found`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport function ', start + opener.length);
  return source.slice(start, next === -1 ? source.length : next);
}

/** The collection keeps its own copy of the toolbar — see the comment above it. This is the copy. */
const COLLECTION_TOOLBAR = (() => {
  const start = COLLECTION.indexOf('{selecting ? (\n          <div className="mt-2 flex animate-in items-center gap-2');
  expect(start, 'the collection toolbar moved').toBeGreaterThan(-1);
  return code(COLLECTION.slice(start, start + 2400));
})();

const TOOLBAR = code(block(SELECTION, 'export function SelectionToolbar'));
const EXIT = code(block(SELECTION, 'export function LeaveSelectionButton'));
const TRIGGER = code(block(SELECTION, 'export function EnterSelectionButton'));
const BULK = code(block(SELECTION, 'export function BulkDeleteControl'));
/** The resting trigger only. The confirm below it is a different control with different rules. */
const BULK_RESTING = BULK.slice(0, BULK.indexOf('{selection.error &&'));

describe('C1 — exactly one element in the band is font-semibold, and it is the bulk action', () => {
  it('leaves no semibold on either toolbar button', () => {
    expect(TOOLBAR).not.toMatch(/font-semibold/);
    expect(COLLECTION_TOOLBAR).not.toMatch(/font-semibold/);
  });

  it('puts font-semibold on the bulk delete trigger, once', () => {
    expect(BULK_RESTING.match(/font-semibold/g)).toHaveLength(1);
    expect(BULK_RESTING).toMatch(/text-destructive/);
  });

  it('draws the exit and the convenience at font-medium', () => {
    expect(EXIT).toMatch(/text-sm font-medium text-foreground/);
    expect(EXIT).not.toMatch(/font-semibold|font-bold/);
    expect(TOOLBAR).toMatch(/-me-3 h-11 px-3 text-sm font-medium text-muted-foreground/);
    expect(COLLECTION_TOOLBAR).toMatch(/-me-3 h-11 px-3 text-sm font-medium text-muted-foreground/);
  });
});

describe('C2 — nothing ranked below the action outranks it once something is picked', () => {
  it('gives the count its emphasis from its content and never from chrome', () => {
    // `text-foreground` at >0, muted at 0 — and never bold, never contained.
    expect(TOOLBAR).toMatch(
      /selection\.count === 0 \? 'text-muted-foreground' : 'text-foreground'/,
    );
    expect(COLLECTION_TOOLBAR).toMatch(
      /selected\.length === 0 \? 'text-muted-foreground' : 'text-foreground'/,
    );
  });

  it('contains the action and nothing else in the band', () => {
    // The action is the only element with a border. A `border-` token anywhere else in the band
    // would be the card soup §"Not asked for" 4 rejects.
    expect(TOOLBAR).not.toMatch(/border-/);
    expect(BULK_RESTING).toMatch(/border-destructive\/30/);
  });
});

describe('C3 — Select before and Done after differ by one step, not three', () => {
  it('keeps the same size and the same weight across the mode change', () => {
    expect(TRIGGER).toMatch(/text-sm font-medium text-muted-foreground/);
    expect(EXIT).toMatch(/text-sm font-medium text-foreground/);
  });

  it('is the same box in the same slot — one ink token apart and nothing else', () => {
    // The two components are rendered into one slot by one conditional, so they must be trivially
    // diffable. Strip the colour and the class strings are identical, character for character.
    const shape = (block: string) =>
      (block.match(/'-me-2 flex min-h-11[^']*'/) ?? [''])[0]
        .replace('text-muted-foreground', '·')
        .replace('text-foreground outline-none', '· outline-none');
    expect(shape(TRIGGER)).not.toBe('');
    expect(shape(EXIT)).toBe(shape(TRIGGER));
  });

  it('changes only the ink — muted to foreground', () => {
    expect(TRIGGER).not.toMatch(/font-semibold|font-bold|text-base|text-lg/);
    expect(EXIT).not.toMatch(/font-bold/);
  });
});

describe('the trailing control cancels its trailing padding', () => {
  it('gives `Select` `-me-2` and drops the `ms-auto` that was deciding nothing', () => {
    expect(TRIGGER).toMatch(/'-me-2 flex min-h-11 shrink-0/);
    expect(TRIGGER).not.toMatch(/ms-auto/);
  });

  it('keeps the leading `px-2`, which faces a truncating heading', () => {
    expect(TRIGGER).toMatch(/rounded-lg px-2/);
  });

  it('is logical and never `-mr-2`, because half the library is Hebrew', () => {
    expect(SELECTION_CODE).not.toMatch(/-mr-2/);
    expect(COLLECTION_TOOLBAR).not.toMatch(/-mr-2/);
  });
});

describe('the delete trigger is a container with destructive ink, in both themes', () => {
  it('is the outline variant and not the confirm`s filled destructive', () => {
    expect(BULK_RESTING).toMatch(/variant="outline"/);
    expect(BULK_RESTING).not.toMatch(/variant="destructive"/);
    // The confirm below it still is, which is the escalation the trigger must not flatten.
    expect(BULK).toMatch(/variant="destructive"/);
  });

  it('overrides the outline variant`s mint hover on all three properties', () => {
    expect(BULK_RESTING).toMatch(/hover:border-destructive\/50/);
    expect(BULK_RESTING).toMatch(/hover:bg-destructive\/10/);
    expect(BULK_RESTING).toMatch(/hover:text-destructive/);
  });

  it('overrides the variant`s separately-modified dark arm as well', () => {
    // `dark:hover:bg-input/50` and `hover:bg-destructive/10` are different tailwind-merge keys, so
    // a light-only override leaves a delete button hovering grey in dark. Each has a `dark:` twin.
    expect(BULK_RESTING).toMatch(/dark:border-destructive\/40/);
    expect(BULK_RESTING).toMatch(/dark:hover:border-destructive\/60/);
    expect(BULK_RESTING).toMatch(/dark:hover:bg-destructive\/20/);
    expect(BULK_RESTING).toMatch(/dark:bg-transparent/);
  });

  it('stays compact and self-start, so the two bulk removals keep three axes of difference', () => {
    expect(BULK_RESTING).toMatch(/h-11 gap-1\.5 self-start px-3/);
    expect(BULK_RESTING).not.toMatch(/w-full/);
  });

  it('does not fork the matrix`s disabled step at one call site', () => {
    expect(BULK_RESTING).not.toMatch(/disabled:opacity-/);
  });
});

describe('focus is handed forward and back across the mode change', () => {
  it('moves focus to the exit when the mode opens, for every host at once', () => {
    // The control that needs the focus owns the move, so no host can forget it — which is what
    // happened to the desktop panel while the effect lived in a host.
    expect(EXIT).toMatch(/exit\.focus\(\{ preventScroll: true \}\)/);
    expect(code(COLLECTION)).not.toMatch(/cancelSelectionRef/);
  });

  it('guards the focus move on visibility, because each library is in the document twice', () => {
    expect(EXIT).toMatch(/exit\?\.checkVisibility\(\)/);
  });

  it('returns focus to `Select` when the mode ends, in all three hosts', () => {
    // Quote-agnostic. `place-sheet.tsx` is double-quoted and the other two hosts are single-quoted,
    // so a `'button'` literal matched two files out of three and the sheet — the host this guard
    // most exists for — went unchecked (found 2026-09-03). Same claim, same three hosts.
    const QUERY_SELECT_SLOT = /selectSlotRef\.current\?\.querySelector\(["']button["']\)/;
    for (const host of [SHEET, PANEL]) {
      expect(host).toMatch(/wasSelecting/);
      expect(host).toMatch(QUERY_SELECT_SLOT);
    }
    expect(COLLECTION).toMatch(
      /selectSlotRef\.current\?\.querySelector\(["']button["']\)\?\.focus\(\)/,
    );
  });
});

describe('the exit stands in the slot `Select` vacates', () => {
  it('is one conditional over one slot in all three hosts', () => {
    for (const host of [SHEET, PANEL]) {
      expect(host).toMatch(/\{selecting \? \(\s*<LeaveSelectionButton onLeave=\{selection\.leave\}/);
    }
    // The collection wraps both arms of the conditional in the same `-my-1.5 flex items-center`
    // layout span (`715a9aa`), so the exit is one element deeper than in the two Places hosts. The
    // slot is still one slot and the conditional still one conditional — this tolerates that one
    // shared wrapper and nothing else: any *control* standing between the branch and the exit
    // still drops this.
    expect(COLLECTION).toMatch(
      /\{selecting \? \(\s*(?:<span[^>]*>\s*)?<LeaveSelectionButton onLeave=/,
    );
  });

  it('keeps the collection`s own word', () => {
    expect(COLLECTION).toContain('label="Cancel"');
  });
});

describe('§4 — the Places heading demotes while selecting, and the collection`s does not', () => {
  it('drops to the caption step in both Places hosts', () => {
    for (const host of [SHEET, PANEL]) {
      // Quote-agnostic: `place-sheet.tsx` is double-quoted, `place-desktop-panel.tsx` single.
      expect(host).toMatch(
        /selecting\s*\?\s*["']text-caption font-medium text-muted-foreground["']/,
      );
      // It keeps its text and its `key`: the line is the only thing naming what `Select all` acts
      // on, so §4 demotes it rather than deleting it.
      expect(host).toMatch(/key=\{activeAreaId \?\? ["']no-area["']\}/);
    }
  });

  it('leaves the collection heading alone, because it is an identity and not a status', () => {
    expect(COLLECTION).toMatch(
      /className="min-w-0 flex-1 line-clamp-2 font-heading text-base font-bold outline-none"/,
    );
    expect(COLLECTION).not.toMatch(/text-caption font-medium text-muted-foreground/);
  });
});
