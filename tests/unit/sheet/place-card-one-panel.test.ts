/**
 * **The card gives one answer to "what does editing look like here."**
 *
 * Until 2026-09-03 it gave three: the category committed with an 11 px mint `Done` over a
 * radiogroup of grey filled chips, the note committed with a button pair inside the only bordered
 * box on the card, and the collections row did not commit at all — it replaced the whole detail
 * pane. That is the "patches" in the owner's round-4 feedback, and it is what
 * `docs/ux-place-card-design-2026-09-03.md` §1.2 diagnoses.
 *
 * The rule now: **every field row keeps its place, rotates its chevron, and opens the house
 * `InlinePanel` underneath it.** These assertions are about *sameness and absence* rather than
 * about any one class string — the four vocabularies that went are the four the owner pointed at,
 * and a fifth spelling reintroduced later is exactly what nobody would catch by eye.
 *
 * Source-matched rather than rendered for the deletions: a constant that still exists but is
 * unused would pass a markup assertion and then come back in the next honest local fix.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL('../../../src/' + rel, import.meta.url)), 'utf8');

/** Prose is not code. Both files explain in comments what was deleted and why — naming the
 *  constant that went — so a bare substring match would fail on the explanation rather than on a
 *  regression. Every "this is gone" assertion below runs against the source with its comments
 *  stripped; every "this is still here" assertion runs against the whole file. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const EDITS = read('components/sheet/saved-place-edits.tsx');
const PICKER = read('components/collections/add-to-collection.tsx');
const EDITS_CODE = code(EDITS);
const PICKER_CODE = code(PICKER);
const CARD = [EDITS, PICKER] as const;

describe('one open-row pattern', () => {
  it('opens all three rows with the shared panel material and nothing else', () => {
    for (const source of CARD) {
      expect(source).toContain("from '@/components/ui/inline-menu'");
      expect(source).toContain('<InlinePanel');
      expect(source).toContain('MENU_ROW_PAINT');
    }
    // The note is free text, so it is the one row that is not a list — and it gets the same
    // container anyway. Two panels in this file, one per row that owns one.
    expect(EDITS.split('<InlinePanel').length - 1).toBe(2);
  });

  it('raises the sheet before a panel takes room in the column', () => {
    // `useDetailPanelOpen()` is optional by design: hosts that provide nothing — the desktop
    // popover, the `lg+` panel, `/collections/[id]` — get today's behaviour.
    for (const source of CARD) {
      expect(source).toContain("useDetailPanelOpen } from '@/ui/place/detail-panel-open'");
      expect(source).toContain('raiseSheet?.()');
    }
  });
});

describe('the four vocabularies that went', () => {
  it('has no 11 px mint word left to commit with', () => {
    // `DETAIL_FIELD_DONE`, deleted. A choice commits itself, so there was nothing left for it to
    // close — and `Done` is the library header's word for leaving multi-select, ~150 px away on
    // the same phone.
    for (const source of [EDITS_CODE, PICKER_CODE]) {
      expect(source).not.toContain('DETAIL_FIELD_DONE');
    }
  });

  it('has no grey filled chip group', () => {
    // The chips were the only grey fill on the card. Their replacement is a menu row with the tick
    // in the indicator column and no fill anywhere.
    expect(EDITS_CODE).not.toContain('bg-muted text-foreground hover:bg-accent');
    expect(EDITS_CODE).not.toContain('flex flex-wrap gap-1.5');
  });

  it('draws no box around the note field — the panel is the surface', () => {
    // A bordered field inside a bordered panel is the patch. The textarea keeps `text-base` (the
    // iOS zoom floor) and loses the border, the radius and its own ring.
    const textarea = EDITS.slice(EDITS.indexOf('<textarea'), EDITS.indexOf('</div>', EDITS.indexOf('<textarea')));
    expect(textarea).not.toContain('border-input');
    expect(textarea).not.toContain('rounded-lg');
    expect(textarea).toContain('text-base');
  });

  it('never navigates away to edit one field', () => {
    // The picker's `ArrowLeft`, its `Add to…` heading and its bespoke bordered-bottom rows all go
    // with the navigation. Nothing on this card replaces the pane, so there can never be a second
    // back-shaped control (`ux-collections-as-scope.md` §2.2).
    expect(PICKER_CODE).not.toContain('ArrowLeft');
    expect(PICKER_CODE).not.toContain('Add to…');
    expect(PICKER_CODE).not.toContain('border-b border-border/70');
  });
});

describe('`Been here` — the card’s one act', () => {
  it('wears the house trigger paint rather than a pill that exists nowhere else', () => {
    expect(EDITS).toContain('TRIGGER_PAINT');
    expect(EDITS).toContain('TRIGGER_TARGET');
    // `DETAIL_ACTION_PILL` — `min-h-11 rounded-full border px-4 text-sm font-bold` — was a bordered
    // bold slab on a card where nothing else is bordered, which is Charter §6's generic outline
    // button. Deleted rather than restyled, so it cannot come back by import.
    expect(EDITS_CODE).not.toContain('DETAIL_ACTION_PILL');
  });

  it('reports the state in the same paint the badge reports it in', () => {
    // `BeenBadge` is `bg-accent text-brand` (`visit-state.tsx`). The control that sets the state
    // and the badge that reports it are one object at two sizes.
    expect(EDITS).toContain('border-transparent bg-accent text-brand');
  });
});

describe('what the ruling deliberately does not touch', () => {
  it('keeps TikTok and Google Maps explicit and labelled', () => {
    // Owner ruling, closed 2026-09-03: a clickable creator name does not tell you it opens TikTok.
    // The weight changed; the words did not.
    expect(EDITS).toContain('DETAIL_OUT_LINK');
  });

  it('keeps every string on the card', () => {
    for (const [source, strings] of [
      [EDITS, ['Why did you save this?', 'Add a note', 'Not set', 'Automatic', 'Remove from your places']],
      [PICKER, ['New collection', 'Create and add']],
    ] as const) {
      for (const s of strings) expect(source).toContain(s);
    }
  });

  it('keeps every write inside `attemptWrite`, and only the collection toggle optimistic', () => {
    for (const source of CARD) expect(source).toContain('attemptWrite');
    expect(EDITS_CODE).not.toContain('useOptimistic');
    expect(PICKER).toContain('useOptimistic');
  });

  it('keeps the drag-gesture opt-outs on every control inside the sheet', () => {
    for (const source of CARD) {
      // A press that begins on a control inside the vaul sheet is otherwise read as a drag and the
      // tap is swallowed. Every interactive node in these two files carries the attribute.
      const controls = source.split(/<(?:button|textarea|form|Input)\b/).length - 1;
      const optOuts = source.split('data-vaul-no-drag').length - 1;
      expect(optOuts).toBeGreaterThanOrEqual(controls - 2);
    }
  });
});
