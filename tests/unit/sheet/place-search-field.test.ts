/**
 * **`PlaceSearchField` — the clear button's centring, the field's ground, and what the label says.**
 *
 * All three come from one owner report, 2026-09-04 (`SEARCH-1`), and the first is the reason this
 * file exists at all.
 *
 * ## Why a class assertion is the right test here, and what it cannot prove
 *
 * The bug was: *"you typed something and click the X, it slips away the first time and only the
 * second time it works."* The mechanism is CSS, not React. `buttonVariants` carries
 * `active:not-aria-[haspopup]:translate-y-px`, and in Tailwind v4 that and `-translate-y-1/2` write
 * the **same** `--tw-translate-y` custom property — so holding the button replaced the `-50%` that
 * centred it with `1px`, and the × fell by half its own height. Measured in Chromium at 1280x900:
 * `y` 242 at rest, 263.7 while held, `document.elementFromPoint` at the press coordinates returning
 * the `INPUT`, and the field still holding its text after a full press. The handler was never
 * reached, because `mouseup` landed on a different element than `mousedown`.
 *
 * So the regression this file guards is **"the button is centred by a mechanism the press beat
 * cannot touch"** — margins, not transforms. `renderToStaticMarkup` sees exactly that, and sees it
 * cheaply. What it cannot see is the geometry: a browser measured the 21.7px drop and a browser is
 * what proved one press now clears. Read this file as the guard, not as the evidence.
 *
 * `environment: 'node'` — `react-dom/server` markup, per `sheet-motion.test.ts`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// `place-sheet.tsx` reaches `saved-place-edits.tsx`, which imports the server-only Supabase client;
// the same mocks `sheet-motion.test.ts` installs, and for the same reason.
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

const { PlaceSearchField } = await import('@/components/sheet/place-sheet');

function render(props: { value: string; label?: string }): string {
  return renderToStaticMarkup(
    createElement(PlaceSearchField, { ...props, onChange: () => {} }),
  );
}

/** The clear button's own class attribute, or `null` when the button is not rendered. */
function clearButtonClasses(markup: string): string | null {
  const tag = markup.match(/<button[^>]*aria-label="Clear the search field"[^>]*>/);
  if (tag === null) return null;
  return tag[0].match(/class="([^"]*)"/)?.[1] ?? '';
}

describe('PlaceSearchField — the clear button does not move out from under the pointer', () => {
  it('centres the × with auto margins, never with a transform', () => {
    const classes = clearButtonClasses(render({ value: 'cafe' }));

    expect(classes).not.toBeNull();
    // The fix: `top:0; bottom:0` plus auto vertical margins. No transform is involved, so
    // `active:translate-y-px` can only ever add its intended 1px.
    expect(classes).toContain('inset-y-0');
    expect(classes).toContain('my-auto');
    // The defect, named so a well-meaning tidy-up cannot quietly restore it. `-translate-y-1/2` and
    // the button's own press translate share `--tw-translate-y`; the second wins on `:active`.
    expect(classes).not.toContain('-translate-y-1/2');
    expect(classes).not.toContain('top-1/2');
  });

  it('renders the × only while there is something to clear', () => {
    expect(clearButtonClasses(render({ value: '' }))).toBeNull();
    // Whitespace is not a search (`isSearchActive`), so it gets no clear button either.
    expect(clearButtonClasses(render({ value: '   ' }))).toBeNull();
    expect(clearButtonClasses(render({ value: 'a' }))).not.toBeNull();
  });
});

describe('PlaceSearchField — the field has a ground', () => {
  it('paints `--card` in both themes rather than sitting transparent over the map', () => {
    const markup = render({ value: '' });
    const input = markup.match(/<input[^>]*>/)?.[0] ?? '';

    expect(input).toContain('bg-card');
    // The `dark:` copy exists to displace `Input`'s own `dark:bg-input/30` in `cn`; without it the
    // field is 30%-alpha in dark and the map shows through the desktop panel's translucent ground.
    expect(input).toContain('dark:bg-card');
    expect(input).not.toContain('dark:bg-input/30');
  });
});

describe('PlaceSearchField — the label says what the field actually searches', () => {
  it('names more than the place name, and uses the ratified words', () => {
    const markup = render({ value: '' });

    // Placeholder and accessible name are deliberately one string, so they cannot disagree.
    expect(markup).toContain('placeholder="Search places, cities and notes"');
    expect(markup).toContain('aria-label="Search places, cities and notes"');
    // `note` and `tag` are `voice-and-vocabulary.md` §3's words for two of the six searchable
    // fields; the banned synonyms are what a rewrite would reach for.
    expect(markup).not.toMatch(/placeholder="[^"]*\b(comment|description|memo|label|keyword)\b/i);
  });

  it('still lets a host name its own scope', () => {
    const markup = render({ value: '', label: 'Search this collection' });

    expect(markup).toContain('placeholder="Search this collection"');
    expect(markup).toContain('aria-label="Search this collection"');
  });
});
