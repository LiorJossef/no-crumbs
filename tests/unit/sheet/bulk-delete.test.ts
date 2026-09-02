/**
 * **Multi-select and bulk delete in the library**, and the one rule that makes it safe to ship
 * beside the collection's bulk unlink.
 *
 * `deleteSavedPlaces` shipped written, tested and with **zero callers** (round 3 §8.2). Wiring an
 * irreversible delete to a control the user can press is only half the work; the other half is that
 * `docs/ux-two-removals-one-screen.md` forbids the two bulk removals from looking alike, and a
 * ruling that lives only in prose is one refactor from being gone. `collections/bulk-removal.ts`
 * holds the reversible half; these assertions hold this one, and several of them are written
 * *against that module* so a change to either side fails here.
 *
 * The component half is asserted as source text rather than by rendering: `library-selection.tsx`
 * is a client module whose whole subject is state, and `vitest` runs in `node` with no jsdom, so
 * there is nothing to press. What is checked is the set of properties a reviewer would otherwise
 * have to re-read the file for — Cancel first, Cancel autofocused, every pressable marked
 * `data-vaul-no-drag`, and no bare `await deleteSavedPlaces(`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BULK_DELETE_CONFIRM_LABEL,
  BULK_DELETE_LABEL,
  BULK_DELETE_PENDING_LABEL,
  bulkDeleteBody,
  bulkDeleteOutcomeMessage,
  bulkDeletePrompt,
  ENTER_SELECTION_LABEL,
  LEAVE_SELECTION_LABEL,
  selectAllLabel,
  selectionCountLabel,
} from '@/components/sheet/bulk-delete';
import {
  TAKE_OUT_CONFIRM_LABEL,
  TAKE_OUT_LABEL,
  takeOutOutcomeMessage,
} from '@/components/collections/bulk-removal';

const SELECTION = readFileSync(
  fileURLToPath(new URL('../../../src/components/sheet/library-selection.tsx', import.meta.url)),
  'utf8',
);
const SHEET = readFileSync(
  fileURLToPath(new URL('../../../src/components/sheet/place-sheet.tsx', import.meta.url)),
  'utf8',
);
const PANEL = readFileSync(
  fileURLToPath(new URL('../../../src/components/sheet/place-desktop-panel.tsx', import.meta.url)),
  'utf8',
);

describe('the two removals stay two', () => {
  it('diverges at the first character of the verb, which is the whole defect being avoided', () => {
    // `Remove … / Remove …` is the original confusion. `Delete` against `Take out` is the ruling.
    expect(BULK_DELETE_CONFIRM_LABEL).toBe('Delete');
    expect(TAKE_OUT_CONFIRM_LABEL).toBe('Take out');
    expect(BULK_DELETE_CONFIRM_LABEL[0]).not.toBe(TAKE_OUT_CONFIRM_LABEL[0]);
  });

  it('never lets one label be the other', () => {
    expect(BULK_DELETE_LABEL).not.toBe(TAKE_OUT_LABEL);
    expect(BULK_DELETE_LABEL).toBe('Delete from your places');
    expect(BULK_DELETE_LABEL).not.toMatch(/collection/i);
    expect(TAKE_OUT_LABEL).not.toMatch(/delete/i);
  });

  it('leaves selection with a different word than the collection does', () => {
    // The collection says `Cancel`; nothing is pending here until the confirm is open.
    expect(LEAVE_SELECTION_LABEL).toBe('Done');
  });

  it('says the irreversible thing, which the reversible one must never say', () => {
    for (const count of [1, 6]) {
      expect(bulkDeleteBody(count)).toMatch(/can't be undone/);
    }
    // The unlink's consequence line is about who stops seeing it, and says nothing about finality.
    expect(takeOutOutcomeMessage({ removed: 0, requested: 1 })).not.toMatch(/undone/);
  });

  it('enumerates what is lost, in the singular and the plural, with no `place(s)`', () => {
    expect(bulkDeleteBody(1)).toBe(
      "Your note, your tags and your Been mark go with it, and this can't be undone.",
    );
    expect(bulkDeleteBody(3)).toBe(
      "Your notes, your tags and your Been marks go with them, and this can't be undone.",
    );
  });
});

describe('the words', () => {
  it('names the count in digits and does not say `places` twice', () => {
    expect(bulkDeletePrompt(1)).toBe('Delete 1 place?');
    expect(bulkDeletePrompt(4)).toBe('Delete 4 places?');
    expect(bulkDeletePrompt(4).match(/places/g)).toHaveLength(1);
  });

  it('takes a real ellipsis while it is running and no exclamation mark anywhere', () => {
    expect(BULK_DELETE_PENDING_LABEL).toBe('Deleting…');
    for (const s of [
      ENTER_SELECTION_LABEL,
      LEAVE_SELECTION_LABEL,
      BULK_DELETE_LABEL,
      BULK_DELETE_CONFIRM_LABEL,
      bulkDeletePrompt(2),
      bulkDeleteBody(2),
    ]) {
      expect(s).not.toContain('!');
    }
  });

  it('starts a selection rather than promising a delete', () => {
    expect(ENTER_SELECTION_LABEL).toBe('Select');
  });

  it('counts without repeating the noun the list is made of', () => {
    expect(selectionCountLabel(0)).toBe('None selected');
    expect(selectionCountLabel(3)).toBe('3 selected');
    expect(selectAllLabel(false)).toBe('Select all');
    expect(selectAllLabel(true)).toBe('Clear');
  });

  it('carries no brand name, on a surface the voice doc bans it from', () => {
    for (const s of [BULK_DELETE_LABEL, bulkDeletePrompt(2), bulkDeleteBody(2)]) {
      expect(s).not.toMatch(/no crumbs/i);
    }
  });
});

describe('partial success is reported, because RLS makes it real', () => {
  it('says nothing when the answer is the whole ask — the rows leaving is the confirmation', () => {
    expect(bulkDeleteOutcomeMessage({ deleted: 3, requested: 3 })).toBeNull();
    expect(bulkDeleteOutcomeMessage({ deleted: 0, requested: 0 })).toBeNull();
  });

  it('does not claim success for rows the database refused', () => {
    expect(bulkDeleteOutcomeMessage({ deleted: 0, requested: 1 })).toBe(
      'That place was already gone.',
    );
    expect(bulkDeleteOutcomeMessage({ deleted: 0, requested: 4 })).toBe(
      'Those places were already gone.',
    );
    expect(bulkDeleteOutcomeMessage({ deleted: 2, requested: 3 })).toBe(
      'Deleted 2 places. The other one was already gone.',
    );
    expect(bulkDeleteOutcomeMessage({ deleted: 2, requested: 5 })).toBe(
      'Deleted 2 places. The other 3 were already gone.',
    );
  });

  it('reads differently from the collection`s partial answer, so the two are told apart', () => {
    expect(bulkDeleteOutcomeMessage({ deleted: 0, requested: 1 })).not.toBe(
      takeOutOutcomeMessage({ removed: 0, requested: 1 }),
    );
  });
});

describe('the confirm is the deeper of the two, and the file says so', () => {
  it('puts Cancel before the destructive button and autofocuses it', () => {
    const confirm = SELECTION.slice(SELECTION.indexOf('export function BulkDeleteControl'));
    const cancel = confirm.indexOf('Cancel');
    const destructive = confirm.indexOf('variant="destructive"');
    expect(cancel).toBeGreaterThan(-1);
    expect(destructive).toBeGreaterThan(-1);
    // `InlineConfirm` — the collection's — is the other way round and autofocuses nothing. §2.4
    // makes that inequality the safety mechanism, which is why this does not reuse it.
    expect(cancel).toBeLessThan(destructive);
    expect(confirm).toContain('autoFocus');
  });

  it('does not import the collection`s shallower confirm', () => {
    // Named in the docblock — that is the argument. What must not exist is the import.
    expect(SELECTION).not.toMatch(/import[^;]*InlineConfirm/);
    expect(SELECTION).not.toContain('<InlineConfirm');
  });

  it('refuses to open over an empty selection', () => {
    expect(SELECTION).toContain('disabled={selection.count === 0}');
  });
});

describe('it does not fight the sheet, and it does not fight the row', () => {
  it('marks every pressable so a press is not read as the start of a sheet drag', () => {
    const pressables = [...SELECTION.matchAll(/<(?:button|Button)\b/g)];
    const marked = [...SELECTION.matchAll(/data-vaul-no-drag/g)];
    expect(pressables.length).toBeGreaterThan(0);
    expect(marked.length).toBeGreaterThanOrEqual(pressables.length);
  });

  it('replaces tap-to-open rather than competing with it', () => {
    // No row is both "open me" and "pick me": `onSelect` is withheld while selecting, on both hosts.
    expect(SHEET).toContain('onSelect && !selecting');
    expect(PANEL).toContain('{...(selecting ? {} : { onSelect })}');
  });

  it('says the true thing about a picked row, not `aria-current`', () => {
    expect(SELECTION).toContain('role="checkbox"');
    expect(SELECTION).toContain('aria-checked={checked}');
    expect(SELECTION).not.toContain("'aria-current'");
  });

  it('holds the 44px touch floor on every control it draws', () => {
    for (const control of ['EnterSelectionButton', 'SelectionToolbar', 'BulkDeleteControl']) {
      const body = SELECTION.slice(
        SELECTION.indexOf(`export function ${control}`),
        SELECTION.indexOf('export function ', SELECTION.indexOf(`export function ${control}`) + 1),
      );
      expect(body).toMatch(/min-h-11|h-11/);
    }
  });
});

describe('the action finally has a caller, and it is called safely', () => {
  it('reaches `deleteSavedPlaces`, which had none', () => {
    expect(SELECTION).toContain("from '@/app/actions/saved-places'");
    expect(SELECTION).toContain('deleteSavedPlaces(ids)');
  });

  it('never awaits the action bare, so a rejection cannot reach app/error.tsx', () => {
    expect(SELECTION).not.toMatch(/await\s+deleteSavedPlaces\s*\(/);
    expect(SELECTION).toContain('attemptWrite(() =>');
  });

  it('deletes `saved_places` ids and not pin ids', () => {
    // `savedPlaceId`, never `place.id`: the two are the same value on /map and are not everywhere.
    expect(SHEET).toContain('place.savedPlaceId === undefined ? [] : [place.savedPlaceId]');
    expect(PANEL).toContain('place.savedPlaceId === undefined ? [] : [place.savedPlaceId]');
  });

  it('mounts the same selection on both breakpoints', () => {
    for (const host of [SHEET, PANEL]) {
      expect(host).toContain('useLibrarySelection');
      expect(host).toContain('<SelectionToolbar selection={selection} />');
      expect(host).toContain('<BulkDeleteControl selection={selection} />');
      expect(host).toContain('<EnterSelectionButton onEnter={selection.enter} />');
    }
  });
});
