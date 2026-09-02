/**
 * **Guards against the two real defects `docs/rtl-audit-2026-08-31.md` found in `PlaceDetail`, and
 * the one thing that made them cheap to introduce: a missing attribute rather than a wrong one.**
 *
 * Nobody typed a wrong value in either case — someone didn't type anything, and nothing noticed
 * until Hebrew rows were driven through the running app. That is the exact failure shape a
 * rendered-markup assertion catches (finding 1 and finding 2 below) and the exact failure shape
 * `platform-mark.test.ts` was written to catch for the platform mark: a property that holds today
 * only because everyone who has touched the file so far remembered it. This file follows that one
 * for guard shape — one assertion per defect, each proved against a reintroduced copy of the bug it
 * guards (see the header of each `describe` block) — and `collections-index-list.test.ts` for how a
 * single component is driven through `react-dom/server` here: vitest runs in a `node` environment,
 * there is no jsdom and no testing library, so nothing below can click, type, or open the note's
 * `editing` state — only read the markup a first paint produces.
 *
 * **Finding 1 — the note.** `saved-place-edits.tsx`'s read paragraph and its edit `<textarea>` both
 * need `dir="auto"`, matching `collection-place-detail.tsx`'s identical field, which already had it
 * right. The read paragraph renders on `PlaceDetail`'s first paint whenever a note is present, so
 * it is reachable the same way every other assertion in `place-detail.test.ts` reaches `PlaceDetail`
 * — through `renderToStaticMarkup`. The `<textarea>` is not: it sits behind `NoteEditor`'s own
 * `editing` state, which starts `false` and has no prop to force it, so a single static render can
 * never paint it. That half is checked the way `platform-mark.test.ts`'s "one file, every surface"
 * block checks properties a render cannot reach: against the component's own source, comments
 * stripped, narrowed to the one `<textarea>` this file owns.
 *
 * **Finding 2 — the address row.** `place-sheet.tsx`'s address line needs the text isolated in
 * `<bdi>`, not `dir="auto"` on the icon-and-text row that holds it — `dir="auto"` there let a
 * Hebrew address flip the whole row to `rtl`, which drags the `MapPin` icon, fixed chrome, from the
 * left edge to the right. Guarding this needs two assertions, not one: that the address text is
 * inside a `<bdi>`, and — the one that actually matters, because this specific regression comes
 * back by someone *adding* `dir="auto"` to the row, which reads as a fix — that the row itself
 * carries no `dir` attribute at all.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { Spot } from '@/domain/places/spot';

/** Real Hebrew content, the shape `docs/rtl-audit-2026-08-31.md` drove through the running app:
 *  `אבו חסן` / `רחוב שיף 1` / `הכי טעים בעיר, חובה לחזור` — a pure-Hebrew name, address and note,
 *  seeded and removed during that audit and reproduced here as a fixture rather than a live row. */
const NAME_HE = 'אבו חסן';
const ADDRESS_HE = 'רחוב שיף 1';
const NOTE_HE = 'הכי טעים בעיר, חובה לחזור';

const OVERLAY: Spot = {
  id: 'saved-1',
  placeId: 'place-1',
  name: NAME_HE,
  displayNameOverride: null,
  canonicalName: NAME_HE,
  category: 'restaurant',
  categoryIsOverridden: false,
  lat: 32.0517,
  lng: 34.7519,
  addressLine: ADDRESS_HE,
  locality: 'Tel Aviv-Yafo',
  note: NOTE_HE,
  visitState: 'want_to_go',
  savedAt: new Date('2026-08-31T10:00:00Z'),
};

const SAVED: DetailPlace = {
  name: NAME_HE,
  category: 'restaurant',
  lat: 32.0517,
  lng: 34.7519,
  // `sourceUrl` is `string | undefined` (never optional) on `DetailPlace`, so `undefined` must be
  // written explicitly rather than omitted — `place-detail.test.ts`'s `UNSAVED` fixture does the
  // same. `Spot.sourceUrl` above is genuinely optional (`?`), where `exactOptionalPropertyTypes`
  // forbids the same explicit `undefined` and the key is left out instead.
  sourceUrl: undefined,
  detail: OVERLAY,
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

/** The `<tag …>text</tag>` (or `<tag …><bdi>text</bdi></tag>`) that directly wraps `text` in
 *  `markup`, as its own opening tag's attribute string — `null` if `text` is not found inside one.
 *  Scoped to the nearest enclosing element rather than the whole document, because `dir="auto"`
 *  legitimately appears elsewhere on this screen (the category/locality line) and a blanket search
 *  across the full markup would not tell one block from another.
 *
 *  `tag` is a parameter because the note's resting block became a `<span>` when it moved into the
 *  card's field row (`ux-place-card-unification-2026-09-02.md` §4.2). The *invariant* this file
 *  guards — the note carries its own reading direction — is about the attribute, not the element,
 *  and a helper hard-wired to `<p>` would have reported the fix as a regression. */
function attributesOfBlockContaining(markup: string, text: string, tag = 'p'): string | null {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `(?=[\s>])` rather than `<p([^>]*)>`: the bare version also matches `<path …>`, the SVG
  // element every icon in this markup uses, because "path" starts with "p" too and its `d`
  // attribute string contains no `>` to stop the class at. The lookahead requires the character
  // right after the name to be whitespace or the tag's own close, which `path` never satisfies.
  const match = markup.match(
    new RegExp(
      `<${tag}(?=[\\s>])([^>]*)>(?:(?!</${tag}>)[\\s\\S])*?${escaped}(?:(?!</${tag}>)[\\s\\S])*?</${tag}>`,
    ),
  );
  return match ? match[1]! : null;
}

/** Comments blanked, line numbers kept — `platform-mark.test.ts`'s `withoutComments`, copied
 *  rather than imported for the same reason it states: `vitest.config.ts` collects `*.test.ts`
 *  only, so there is nowhere shared to put it. */
function withoutComments(source: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
}

const SAVED_PLACE_EDITS_SOURCE = withoutComments(
  readFileSync(
    fileURLToPath(new URL('../../../src/components/sheet/saved-place-edits.tsx', import.meta.url)),
    'utf8',
  ),
);

/** The same place with a Latin name and a Hebrew note — the fixture that tells the card's
 *  direction scope apart from the note's. Everything on the card follows the place; the note is
 *  the one block that follows what the user typed. */
const LATIN_WITH_HE_NOTE: DetailPlace = {
  ...SAVED,
  name: 'Abu Hassan',
  detail: { ...OVERLAY, name: 'Abu Hassan', canonicalName: 'Abu Hassan', addressLine: 'Shivtei Israel 1' },
};

const PLACE_SHEET_SOURCE = withoutComments(
  readFileSync(
    fileURLToPath(new URL('../../../src/components/sheet/place-sheet.tsx', import.meta.url)),
    'utf8',
  ),
);

describe('the card resolves one reading direction, and the note resolves the other', () => {
  it('puts the place\'s direction on the whole scroll column', () => {
    expect(render(SAVED)).toMatch(/^<div[^>]*\bdir="rtl"/);
    expect(render(LATIN_WITH_HE_NOTE)).toMatch(/^<div[^>]*\bdir="ltr"/);
  });

  it('leaves no block inside the card resolving a direction of its own', () => {
    // The defect the owner reported: six blocks each running `dir="auto"` flipped one Hebrew
    // card's start edge six times down a single column. `<bdi>` stays — that is ordering, which
    // the audit found correct — but nothing inside the card may resolve its own *alignment*.
    expect(PLACE_SHEET_SOURCE.slice(PLACE_SHEET_SOURCE.indexOf('export function PlaceDetail'))).not.toMatch(
      /\bdir="auto"/,
    );
    expect(SAVED_PLACE_EDITS_SOURCE).not.toMatch(/\bdir="auto"/);
  });
});

describe('the note carries its own reading direction (rtl audit finding 1)', () => {
  it('resolves the note block from the note, not from the place, through a real render', () => {
    // Latin place, Hebrew note: the column is `ltr` (asserted above) and the note must still be
    // `rtl`, which is the whole reason the note is the one scope that opts out.
    const markup = render(LATIN_WITH_HE_NOTE);
    expect(markup, markup).toContain('dir="rtl"');

    // …and the value line itself carries no direction — it inherits the wrapper's, which is what
    // stops the block jumping when the editor opens over it.
    const attrs = attributesOfBlockContaining(markup, NOTE_HE, 'span');
    expect(attrs, markup).not.toBeNull();
    expect(attrs, markup).not.toMatch(/\bdir=/);

    // Proves the assertion above is not vacuous: with a Latin note there is no `rtl` anywhere.
    const latinNote = render({
      ...LATIN_WITH_HE_NOTE,
      detail: { ...OVERLAY, name: 'Abu Hassan', canonicalName: 'Abu Hassan', note: 'best in town' },
    });
    expect(latinNote).not.toContain('dir="rtl"');
  });

  it('gives the resting row and the open editor the same resolved value — source, not a render', () => {
    // `NoteEditor`'s edit branch is gated on local `editing` state with no prop to force it, so no
    // single `renderToStaticMarkup` pass ever paints the `<textarea>`. What matters there is that
    // both states take *one* value: a note that re-resolved per state would jump sides the moment
    // the editor opened.
    const uses = SAVED_PLACE_EDITS_SOURCE.match(/dir=\{noteDirection\}/g) ?? [];
    expect(uses.length, SAVED_PLACE_EDITS_SOURCE).toBe(2);
    expect(SAVED_PLACE_EDITS_SOURCE).toMatch(/const noteDirection = textDirection\(note\)/);
  });
});

describe('the address row keeps its icon fixed regardless of the address language (rtl audit finding 2)', () => {
  it('isolates the address text in <bdi>, and puts no dir on the row that holds the pin icon', () => {
    const markup = render(SAVED);
    const attrs = attributesOfBlockContaining(markup, ADDRESS_HE);
    expect(attrs, markup).not.toBeNull();

    // The regression that matters most: the row must carry no `dir` attribute at all. It comes
    // back by someone *adding* `dir="auto"` here, which reads as a fix for exactly this class of
    // defect and is the bug — so this asserts absence, not a specific wrong value.
    expect(attrs, markup).not.toMatch(/\bdir=/);

    // The text itself must still be isolated, or a mixed-script address (a Latin street number
    // beside a Hebrew city, `docs/rtl-audit-2026-08-31.md`'s Rothschild fixture) reorders with
    // whatever the row's own inherited direction happens to be.
    const addressTag = markup.match(new RegExp(`<bdi>${ADDRESS_HE}</bdi>`));
    expect(addressTag, markup).not.toBeNull();
  });

  it('is proved against the reintroduced defect: dir="auto" back on the row reads as a fix and is the bug', () => {
    const markup = render(SAVED);
    // Simulates the exact regression named above — someone "helpfully" restoring `dir="auto"` on
    // the row — by adding it back to the rendered markup and re-running the same absence check.
    // `class`, not `className`: `renderToStaticMarkup` writes the DOM attribute name, not the JSX
    // prop name.
    // Matched on the `<p>` that holds the `MapPin`, not on its exact class string: the row gained
    // `flex-wrap` when the approximate mark moved onto it (lane B-T2), and a literal class match
    // is a proof that quietly stops proving anything the next time the row is restyled.
    const regressed = markup.replace(
      /(<p class="flex flex-wrap items-start[^"]*")(>)/,
      '$1 dir="auto"$2',
    );
    const attrs = attributesOfBlockContaining(regressed, ADDRESS_HE);
    expect(attrs, regressed).toMatch(/\bdir="auto"/);
  });
});
