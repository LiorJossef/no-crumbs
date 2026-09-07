/**
 * `docs/archive/ux-collection-actions-2026-09-03.md`, held in markup and in source.
 *
 * The screen was speaking a control language the rest of the product retired: an unlabelled `⋯`
 * hiding a mode switch beside two destructions inside a bespoke container (`rounded-lg border
 * bg-muted/40`, bordered 44 px rows) that existed nowhere else, and — with two contributors — a
 * horizontally scrolling strip of mint-filled radio chips, which is exactly the chip wall
 * `library-filter-bar.tsx` deleted on 2026-09-02.
 *
 * Two of the spec's rows are **not** built and their absence is asserted here, because both are
 * owner rulings against the document rather than work left undone:
 *
 *  - §7.5 is **rejected**: `Add places` stays the screen's mint primary at both call sites.
 *  - §7.6 is **undecided**: `Leave collection`'s tone at rest is one module-level boolean, and the
 *    committed value is today's behaviour.
 *
 * Half source scan, half `react-dom/server`: a menu that is closed at rest has no markup to read,
 * and vitest is a `node` environment here with no DOM to press.
 */

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/map',
}));
vi.mock('@/app/actions/collections', () => ({
  addPlacesToCollection: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  removeCollectionItem: vi.fn(),
  removeCollectionItems: vi.fn(),
  removeMember: vi.fn(),
  removePlaceFromCollection: vi.fn(),
  saveCollectionPlace: vi.fn(),
  updateCollection: vi.fn(),
  updateCollectionItemNote: vi.fn(),
}));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceName: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));

const { CollectionContent } = await import('@/components/collections/collection-content');

import type { CollectionDetail } from '@/app/collections/_lib/get-collections';
import type { MapPlace } from '@/components/map/map-surface';

const SOURCE = readFileSync('src/components/collections/collection-content.tsx', 'utf8');
const FILTER_BAR = readFileSync('src/components/sheet/library-filter-bar.tsx', 'utf8');
const INLINE_MENU = readFileSync('src/components/ui/inline-menu.tsx', 'utf8');
const MENU_MATERIAL = readFileSync('src/ui/menu-material.ts', 'utf8');

function item(id: string, name: string, addedBy: string | null) {
  return {
    itemId: id,
    placeId: `p-${id}`,
    id,
    name,
    lat: 51.5,
    lng: -0.1,
    category: 'restaurant',
    addedBy,
    addedByName: addedBy === 'u2' ? 'Maya' : null,
  };
}

const PLACES = [
  item('i1', 'Kiaans', 'u1'),
  item('i2', 'Tokii', 'u2'),
  item('i3', 'MBER', null),
];

const COLLECTION = {
  id: 'c1',
  name: 'London 2026',
  description: null,
  ownerId: 'u1',
  role: 'owner',
  members: [
    { userId: 'u1', displayName: 'You', role: 'owner', joinedAt: '2026-01-01' },
    { userId: 'u2', displayName: 'Maya', role: 'editor', joinedAt: '2026-01-02' },
  ],
  places: PLACES,
  invite: null,
} as unknown as CollectionDetail;

const SOLO = { ...COLLECTION, places: [PLACES[0]] } as unknown as CollectionDetail;

function markup(collection: CollectionDetail): string {
  return renderToStaticMarkup(
    createElement(CollectionContent, {
      collection,
      currentUserId: 'u1',
      library: [],
      pins: collection.places as unknown as readonly MapPlace[],
      view: 'list' as const,
      onViewChange: () => {},
      selectedItemId: null,
      onSelectItem: () => {},
    }),
  );
}

/** §2.1 and §7.1 — the mode switch is a control on the heading, not a row in an object menu. */
describe('Select is promoted onto the heading row', () => {
  it('draws it between the name and the ⋯, in that order', () => {
    const html = markup(COLLECTION);
    const heading = html.indexOf('<bdi>London 2026</bdi>');
    const select = html.indexOf('>Select<');
    const options = html.indexOf('aria-label="Collection options"');
    expect(heading).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(heading);
    expect(options).toBeGreaterThan(select);
  });

  it('reuses the library’s own controls rather than restyling a second pair', () => {
    // Both halves of the mode come from the library's module now, not just the entry: the exit
    // moved into the slot `Select` vacates (`ux-select-control-2026-09-03.md` §3.1), and the two
    // must be one component each or the collection and the library drift into two words for one
    // act. The import is multi-line since `LeaveSelectionButton` joined it.
    expect(SOURCE).toContain("} from '@/components/sheet/library-selection';");
    expect(SOURCE).toMatch(
      /import \{[\s\S]*EnterSelectionButton,[\s\S]*LeaveSelectionButton,[\s\S]*\} from '@\/components\/sheet\/library-selection';/,
    );
  });

  it('deletes the string it replaced', () => {
    // The menu row's label. `Select places to add` further down is the picker's own heading and a
    // different string.
    expect(SOURCE).not.toContain('label="Select places"');
  });

  it('does not draw it on an empty collection', () => {
    const html = markup({ ...COLLECTION, places: [] } as unknown as CollectionDetail);
    expect(html).not.toContain('>Select<');
    // The `⋯` stays: `Share`, `Edit` and `Delete collection` all still apply to an empty one.
    expect(html).toContain('aria-label="Collection options"');
  });
});

/** §2.1 and §7.4 — the material the owner filed the request about. */
describe('the ⋯ menu wears the product’s one menu material', () => {
  it('imports the shared surface instead of re-declaring it', () => {
    expect(SOURCE).toContain("} from '@/components/ui/inline-menu';");
    // A third copy of these strings is how we get back here.
    expect(SOURCE).not.toContain('bg-popover p-1 shadow-raised');
  });

  it('has no bespoke container and no bordered rows left', () => {
    // The menu's own container, which existed nowhere else in the product. The edit form and
    // `InlineConfirm` keep their `bg-muted/40` panel — those are not menus and did not change.
    expect(SOURCE).not.toContain('flex flex-col rounded-lg border border-border bg-muted/40');
    expect(SOURCE).not.toContain('not-last:border-b');
  });

  it('steps the rows to 14 px, and only that', () => {
    // The library's 12 px is calibrated for a twelve-row options list with a count column; this is
    // a three-row command list where one row is irreversible.
    expect(SOURCE).toMatch(/MENU_ROW_PAINT, 'text-sm'/);
  });

  it('is an anchored popup at lg+ and an inline panel in the sheet', () => {
    expect(SOURCE).toContain('side="bottom" align="end" sideOffset={6}');
    expect(SOURCE).toMatch(/const surface: FilterSurface = stop === undefined \? 'popover' : 'inline'/);
  });

  it('is hidden while selecting', () => {
    // None of its rows is available or sensible mid-selection, and an open options menu over a
    // live selection is a state with no defined behaviour.
    expect(SOURCE).toMatch(/\{selecting \? null : \(\s*<CollectionOptionsTrigger/);
  });
});

/** §7.2 and §7.3 — the retired chip vocabulary, and the string that named it. */
describe('the added-by filter is a MenuAxis, not a chip strip', () => {
  it('deletes both chip components and the scrolling strip', () => {
    expect(SOURCE).not.toContain('function AddedByFilter');
    expect(SOURCE).not.toContain('function AddedByChip');
    expect(SOURCE).not.toContain('-mx-4 mt-2 flex gap-2 overflow-x-auto');
    expect(SOURCE).not.toContain('Show places added by');
  });

  it('draws the axis trigger with the library’s own accessible sentence', () => {
    const html = markup(COLLECTION);
    expect(html).toContain('aria-label="Added by, showing all"');
    expect(html).not.toContain('role="radiogroup"');
  });

  it('draws nothing at all for a solo collection', () => {
    expect(markup(SOLO)).not.toContain('Added by');
  });

  it('keeps the pure half untouched', () => {
    // `addersIn` still groups, orders and labels; `adderFilterIsUseful` is still the gate.
    expect(SOURCE).toContain("from '@/components/collections/added-by'");
    expect(SOURCE).toContain('adderFilterIsUseful(adders)');
  });

  it('keeps the trigger on screen while a filter is set, even at one adder', () => {
    // The clause `showVisit` and `showCategories` already carry: a control that disappears when
    // you use it would strand the narrowing it applied.
    expect(SOURCE).toContain('adderFilterIsUseful(adders) || addedBy !== null');
  });

  it('gives the unattributed bucket a value of its own', () => {
    // It used to key on `null`, which is `Everyone` — so the bucket was unselectable and its chip
    // looked chosen whenever `Everyone` was.
    expect(SOURCE).toContain("const NO_ADDER_VALUE = 'no-adder'");
    expect(SOURCE).toContain('?? NO_ADDER_VALUE) === addedBy');
  });
});

/** §5 — the shape of selection mode, which was already right. */
describe('selection mode', () => {
  it('still says Cancel, not Done', () => {
    // `bulk-delete.ts` rules the divergence: two multi-select surfaces with two different removals
    // do not present one identical escape. The word survived the exit moving into the heading
    // slot — it is now `LeaveSelectionButton`'s one caller-supplied label rather than a `<Button>`
    // body, and `ux-select-control-2026-09-03.md` §6 records that the divergence is thin and that
    // unifying it would be the owner's call, not a refactor's.
    expect(SOURCE).toContain('label="Cancel"');
    expect(SOURCE).not.toMatch(/label="Done"/);
  });

  it('drops both narrowings on the way in', () => {
    expect(SOURCE).toMatch(/function enterSelection\(\) \{[\s\S]*setQuery\(''\);[\s\S]*setAddedBy\(null\);[\s\S]*setSelecting\(true\);/);
  });

  it('hands focus back to the control that opened it', () => {
    expect(SOURCE).toContain('leaveSelection({ returnFocus: true })');
    expect(SOURCE).toContain("selectSlotRef.current?.querySelector('button')?.focus()");
  });
});

/** §6, and the two owner rulings that override the spec. */
describe('destructive tone', () => {
  it('keeps Leave’s tone behind one flag, defaulted to today’s behaviour', () => {
    // OPEN owner decision, 2026-09-03. Flipping the constant is the whole change.
    expect(SOURCE).toContain('const LEAVE_IS_DESTRUCTIVE_AT_REST = true;');
    expect(SOURCE).toContain('destructive={LEAVE_IS_DESTRUCTIVE_AT_REST}');
  });

  it('keeps Delete collection red at rest unconditionally', () => {
    expect(SOURCE).toMatch(/label="Delete collection"[\s\S]{0,220}\n\s+destructive\n/);
  });

  it('keeps Add places mint at both call sites — §7.5 is rejected', () => {
    // Owner, 2026-09-03: the screen's principal action stays the primary. `variant="secondary"`
    // appearing on either button is the regression this guards.
    const footer = SOURCE.indexOf('Add places');
    expect(footer).toBeGreaterThan(-1);
    expect(SOURCE).not.toMatch(/variant="secondary"[\s\S]{0,400}Add places/);
  });

  it('keeps Take out of this collection out of red at rest', () => {
    expect(SOURCE).toMatch(/variant="outline"[\s\S]{0,400}\{TAKE_OUT_LABEL\}/);
  });
});

/** §8 — a press that begins on a control must not be read as the start of a sheet drag. */
describe('the sheet cannot swallow a press on these controls', () => {
  it('marks the panel itself, not only its rows', () => {
    expect(INLINE_MENU).toMatch(/ref=\{panelRef\}\s*\n\s*data-vaul-no-drag/);
  });

  it('marks every row and both triggers', () => {
    const html = markup(COLLECTION);
    expect(html).toMatch(/aria-label="Collection options"[^>]*data-vaul-no-drag|data-vaul-no-drag[^>]*aria-label="Collection options"/);
    expect(html).toMatch(/data-vaul-no-drag[^>]*aria-label="Added by, showing all"/);
    expect(SOURCE).toMatch(/<button type="button" onClick=\{onClick\} data-vaul-no-drag/);
  });
});

/**
 * The extraction itself. `PANEL_SURFACE`, `MENU_POPUP`, `INLINE_PANEL`, `MENU_ROW`,
 * `MENU_ROW_PAINT`, `CLEAR_LABEL` and `InlinePanel` moved out of `library-filter-bar.tsx` so the
 * two menus cannot drift; the filter bar imports them back rather than keeping a copy.
 */
describe('one menu material, one file', () => {
  it('is declared once and imported twice', () => {
    for (const name of ['MENU_POPUP', 'INLINE_PANEL']) {
      expect(INLINE_MENU).toContain(`export const ${name} =`);
      expect(FILTER_BAR).not.toContain(`const ${name} =`);
    }
    // `PANEL_SURFACE`, `MENU_ROW` and `MENU_ROW_PAINT` moved one file further out on 2026-09-03,
    // into the plain module `@/ui/menu-material`, because a Server Component reading a constant
    // out of a `'use client'` file gets a client reference and `cn()` drops it. `inline-menu.tsx`
    // re-exports them, so the filter bar's import is unchanged and still must not hold a copy.
    for (const name of ['PANEL_SURFACE', 'MENU_ROW', 'MENU_ROW_PAINT']) {
      expect(MENU_MATERIAL).toContain(`export const ${name} =`);
      expect(INLINE_MENU).toContain(name);
      expect(FILTER_BAR).not.toContain(`const ${name} =`);
    }
    expect(INLINE_MENU).toContain('export function InlinePanel(');
    expect(FILTER_BAR).toContain("} from '@/components/ui/inline-menu';");
  });

  it('omits the kicker line for a menu with no axis', () => {
    // An action menu has no axis and no value, and the collection's `⋯` opens under a heading that
    // is already naming the object.
    expect(INLINE_MENU).toContain('axis?: string;');
    expect(INLINE_MENU).toContain('{(axis !== undefined || axisClear !== null) && (');
  });
});
