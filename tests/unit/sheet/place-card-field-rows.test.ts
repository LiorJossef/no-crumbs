/**
 * The place card's one label and its one field row — tasks **H-1** and **H-2** of
 * `docs/ux-place-card-unification-2026-09-02.md`.
 *
 * The audit that produced that spec counted nine actions on one card drawn from **eight** different
 * components, and three spellings of an 11 px label at two letterspacings. The defect is not any
 * one of those shapes; it is that they multiplied silently, one honest local fix at a time. So the
 * assertions here are about *counts and sameness* rather than about any particular class string:
 *
 *  - one class string in `src/` produces the section label, and it shouts at nobody;
 *  - `Collections`, `Category` and `Your note` are the **same row**, differing only in label, value
 *    and trailing glyph;
 *  - an empty field and a filled one are the same component, so writing your first note never
 *    swaps the thing you pressed.
 *
 * Rendered with `react-dom/server` — vitest runs in a `node` environment here with no jsdom and no
 * testing library, and `vitest.config.ts` collects `*.test.ts` only, so components are driven
 * through `createElement`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  removePlaceFromCollection: vi.fn(),
}));

const { PlaceDetail } = await import('@/components/sheet/place-sheet');
const { CollectionsContext } = await import('@/ui/place/collections-context');
const { DETAIL_FIELD_ROW } = await import('@/components/sheet/saved-place-edits');
const { SECTION_LABEL } = await import('@/ui/place/section-label');

import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { Spot } from '@/domain/places/spot';

const OVERLAY: Spot = {
  id: 'saved-1',
  placeId: 'place-1',
  name: 'Sycamore',
  displayNameOverride: null,
  canonicalName: 'Sycamore Vino Cucina',
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 51.47,
  lng: -0.07,
  addressLine: '35 Peckham Rye',
  locality: 'London',
  note: 'Ask for the corner table',
  reason: 'the best pasta in Peckham',
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  visitState: 'want_to_go',
  savedAt: new Date('2026-08-01T10:00:00Z'),
};

const SAVED: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: OVERLAY,
};

/** The same place with nothing written into any of its own fields — the state that used to be
 *  drawn by three components the filled state did not use. */
/** `exactOptionalPropertyTypes` is on, so an empty note is the key's *absence*, not `undefined`
 *  sitting in it — which is also how the read path produces one. */
function withoutNote(spot: Spot): Spot {
  const copy: Record<string, unknown> = { ...spot, category: null };
  delete copy['note'];
  return copy as unknown as Spot;
}
const OVERLAY_WITHOUT_NOTE: Spot = withoutNote(OVERLAY);
const SAVED_EMPTY_FIELDS: DetailPlace = {
  ...SAVED,
  category: null,
  detail: OVERLAY_WITHOUT_NOTE,
};

function render(place: DetailPlace): string {
  return renderToStaticMarkup(
    createElement(
      CollectionsContext.Provider,
      { value: { collections: [], byPlaceId: {} } },
      createElement(PlaceDetail, {
        place,
        savedPlace: { id: 'saved-1', visited: false },
        onClose: () => {},
      }),
    ),
  );
}

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');
}

/** The card's own files. `place-sheet.tsx` is deliberately absent: at the time this was written it
 *  was held by another lane, and its one remaining inline `tracking-[0.14em]` nearby label is a
 *  named, outstanding piece of H-1 rather than something this file can pretend is done. */
const CARD_FILES = [
  'src/components/sheet/saved-place-edits.tsx',
  'src/components/sheet/place-enrichment.tsx',
  'src/components/collections/collection-place-detail.tsx',
  'src/components/collections/share-panel.tsx',
  'src/components/collections/add-to-collection.tsx',
] as const;

describe('the section label — one value, no shouting (H-1)', () => {
  it('is 11 px from the ramp, medium, muted, and neither uppercase nor letterspaced', () => {
    expect(SECTION_LABEL).toContain('text-micro');
    expect(SECTION_LABEL).toContain('font-medium');
    expect(SECTION_LABEL).toContain('text-muted-foreground');
    // The three ways the old value shouted. Uppercase is the one a screen reader also hears.
    expect(SECTION_LABEL).not.toContain('uppercase');
    expect(SECTION_LABEL).not.toContain('tracking-');
    expect(SECTION_LABEL).not.toContain('font-bold');
  });

  it('is the only spelling of itself left in the card files', () => {
    for (const file of CARD_FILES) {
      // `FILTER_KICKER` is the one deliberate survivor: it labels a *filter control*, not a card
      // section, so it keeps its uppercase and its letterspacing (spec §3.2). Dropping its line
      // is narrower than exempting the whole file.
      const source = read(file)
        .split('\n')
        .filter((line) => !line.includes('shrink-0 text-micro font-bold'))
        .join('\n');
      // `text-[11px]` is the same size written a second way, and is literally how the audit came
      // to find "two labels" where the source held one intent.
      expect(source, file).not.toContain('text-[11px]');
      expect(source, file).not.toContain('tracking-[0.1em]');
      expect(source, file).not.toContain('tracking-[0.14em]');
    }
  });

  it('reaches the screen in sentence case, so a screen reader reads words', () => {
    const markup = render(SAVED);
    expect(markup).toContain('Your note');
    expect(markup).not.toContain('YOUR NOTE');
    expect(markup).not.toContain('CATEGORY');
  });
});

describe('the field row — one shape for every field of your own record (H-2)', () => {
  it('draws Collections, Category and Your note as the same row', () => {
    const markup = render(SAVED);
    for (const label of ['Collections', 'Category', 'Your note']) {
      expect(markup, label).toContain(`>${label}</span>`);
    }
    // Three rows, one class string. If a fourth shape is introduced for one of them, this drops.
    expect(markup.split(DETAIL_FIELD_ROW).length - 1).toBe(3);
  });

  it('lets the trailing glyph predict what pressing does', () => {
    const markup = render(SAVED);
    // **One glyph on all three rows, from 2026-09-03.** Every row now opens the same panel in the
    // same place, so the pencil/chevron-right split stopped being true: the pencil promised "type
    // here" on a row that offers a list, and the right-chevron promised "this replaces the pane",
    // which nothing on this card does any more.
    expect(markup.split('lucide-chevron-down').length - 1).toBe(3);
    expect(markup).not.toContain('lucide-chevron-right');
    expect(markup).not.toContain('lucide-pencil');
  });

  it('answers an empty field with the same row and a muted value, never another component', () => {
    const empty = render(SAVED_EMPTY_FIELDS);
    // Same three rows as the filled card. The dashed `+ Add a note` pill and the boxed collection
    // row are gone, so the count cannot be made up by a different shape.
    expect(empty.split(DETAIL_FIELD_ROW).length - 1).toBe(3);
    expect(empty).toContain('Add a note');
    expect(empty).toContain('Not set');
    expect(empty).not.toContain('border-dashed');
  });

  it('keeps every row above the touch floor', () => {
    // 48 px, and the spec's floor is 44. `min-h-12` is what makes a run of rows read as a list
    // rather than as four things that happen to be near each other.
    expect(DETAIL_FIELD_ROW).toContain('min-h-12');
    expect(DETAIL_FIELD_ROW).not.toContain('border');
  });

  it('has no second empty-field shape left in the tree', () => {
    // `ADD_NOTE_PILL` was the eighth component the audit counted, and it existed to make two note
    // fields match each other. The field row makes four fields match, so the pill is deleted
    // rather than kept for one caller — which is the only thing that stops a fifth spelling.
    for (const file of CARD_FILES) {
      // The constant, not the word: this file's own explanation of why it went names it, and so
      // does `DETAIL_FIELD_ROW`'s doc comment.
      expect(read(file), file).not.toMatch(/\bADD_NOTE_PILL[,\s]*[=}]/);
      expect(read(file), file).not.toContain('cn(ADD_NOTE_PILL');
    }
  });
});
