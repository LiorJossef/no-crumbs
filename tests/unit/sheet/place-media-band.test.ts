/**
 * **The two places this product draws a picture, and the seam the video player will land in.**
 *
 * Three defects and one new affordance, each pinned to the smallest fact that would have caught it.
 * All of them were found by measuring the running app at 1440x900 and 390x844; none of them would
 * have been caught by anything that was already asserted, and two of them are invisible in a diff.
 *
 *  1. **The row's leading square used to change size.** `RowMedia` carried `group-hover/row:
 *     scale-110` on the 44 px box itself, so on hover it became 48.4 px at x=21.8 against a row
 *     ground and a panel gutter that both start at x=24 — the picture stood 2.2 px outside the row
 *     it belonged to, on the edge every other row aligns against. The growth now lives on the
 *     contents. The box's footprint is the thing the whole list's left edge is made of, so the
 *     assertion is *the box carries no scale utility at all*, not *the box is 44 px*.
 *  2. **The detail view's picture collapsed to nothing inside the map popover.** Measured:
 *     wrapper `height: 0px`, its `<img>` `height: 160px`, loaded, `naturalWidth` 720. `PlaceDetail`
 *     is a column flex container, the popover is the one host that gives it a definite height, and
 *     `overflow-hidden` sets a flex item's automatic minimum size to zero — so of all the card's
 *     children exactly one could absorb the overflow. `shrink-0` is the fix and it is asserted
 *     here because nothing about it is legible from the markup it produces.
 *  3. **A picture that is gone must cost nothing** — no `<img>`, no reserved band, no placeholder.
 *     Signed TikTok URLs live ~47 hours, so this is the majority state of any library older than
 *     two days, not an error path.
 *  4. **The play affordance is a button and a slot, and must stay that.**
 *     `docs/archive/security-ruling-embed-playback-2026-08-31.md` §6 permits the embed only behind a
 *     first-press disclosure that another lane owns. The last `describe` below is the line that
 *     says this file has not quietly grown a player.
 *
 * What this file cannot claim: there is no layout and no CSS in a static string, so nothing here is
 * evidence that the picture *looks* right — that is the screenshots. It is evidence about which
 * elements exist and which classes and attributes they carry.
 *
 * The Server Action modules are mocked exactly as `place-detail.test.ts` and
 * `thumbnail-refresh.test.ts` mock them: importing them pulls in `@/app/_lib/supabase/server`,
 * which imports `server-only`, which throws by design outside a React Server Component.
 */
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

const { PlaceDetail, PlaceRow, PLAY_SOURCE_LABEL } = await import('@/components/sheet/place-sheet');

import type { DetailPlace } from '@/components/sheet/place-sheet';
import type { MapPlace } from '@/components/map/types';

const STILL = 'https://cdn.example/still.jpg?x-expires=1791000000';

const PLACE: DetailPlace = {
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  sourceUrl: 'https://www.tiktok.com/@someone/video/1',
  detail: {
    placeId: 'place-1',
    source: {
      id: 'src-1',
      platform: 'tiktok',
      canonicalUrl: 'https://www.tiktok.com/@someone/video/1',
      media: { kind: 'image', url: STILL, expiresAt: null },
    },
  },
};

/** The same place with no picture behind it at all — no joined `sources` row, no `0016` frozen
 *  copy. Two of this database's own nine saves are in exactly this state. */
const PLACE_WITHOUT_PICTURE: DetailPlace = {
  ...PLACE,
  detail: { placeId: 'place-1' },
};

function detail(place: DetailPlace, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(PlaceDetail, { place, savedPlace: null, onClose: () => {}, ...props }),
  );
}

/** The element that wraps the still — matched by the one class it must never lose rather than by
 *  position, so a reordering of the card does not silently pass. */
function bandOf(markup: string): string | null {
  return markup.match(/<div class="[^"]*\bshrink-0\b[^"]*\boverflow-hidden\b[^"]*"/)?.[0] ?? null;
}

const ROW_PLACE: MapPlace = {
  id: 'saved-1',
  name: 'Sycamore',
  category: 'restaurant',
  lat: 51.47,
  lng: -0.07,
  visited: false,
  note: '',
  sourceUrl: undefined,
  detail: {
    id: 'saved-1',
    placeId: 'place-1',
    name: 'Sycamore',
    displayNameOverride: null,
    canonicalName: 'Sycamore',
    category: 'restaurant',
    categoryIsOverridden: false,
    lat: 51.47,
    lng: -0.07,
    locality: 'London',
    visitState: 'want_to_go',
    savedAt: new Date('2026-08-01T10:00:00Z'),
  },
};

function row(place: MapPlace): string {
  return renderToStaticMarkup(createElement(PlaceRow, { place, onSelect: () => {} }));
}

/** The `<span>` the row's text column starts after — the picture arm or the pin arm, whichever
 *  this place renders. Both are `size-11` and that is the point: one x for every row. */
function leadingSquareOf(markup: string): string {
  return markup.match(/<span[^>]*\bsize-11\b[^>]*>/)?.[0] ?? '';
}

describe("the row's leading square keeps its footprint in every state", () => {
  // The defect, stated as a number: with the scale on the box, hover took it from 44 px at x=24 to
  // 48.4 px at x=21.8, so one row's picture sat 2.2 px outside the panel's 24 px gutter and outside
  // its own hover ground. A vertical list has no more visible defect than one row's leading edge
  // disagreeing with every other row's.
  it('draws no scale utility on the box that carries a picture', () => {
    const square = leadingSquareOf(row({ ...ROW_PLACE, detail: { ...ROW_PLACE.detail!, sourceThumbnailUrl: STILL } }));
    expect(square).toContain('size-11');
    expect(square).not.toContain('scale-110');
  });

  it('draws no scale utility on the box that carries the pin either', () => {
    // The fallback arm is the same box at the same size, and a list whose two arms move differently
    // is a list with two left edges.
    const square = leadingSquareOf(row(ROW_PLACE));
    expect(square).toContain('size-11');
    expect(square).not.toContain('scale-110');
  });

  it('keeps the hover growth, on the picture inside the box', () => {
    // Removing the leak must not have removed the gesture: the row↔pin coupling is a shipped
    // behaviour and the 160 ms beat is shared with the map's own pin lift.
    const markup = row({ ...ROW_PLACE, detail: { ...ROW_PLACE.detail!, sourceThumbnailUrl: STILL } });
    const image = markup.match(/<img\b[^>]*>/)?.[0] ?? '';
    expect(image).toContain('group-hover/row:scale-110');
    expect(image).toContain('motion-safe:transition-transform');
  });

  it('keeps the hover growth on the pin glyph when there is no picture', () => {
    const markup = row(ROW_PLACE);
    expect(markup).toContain('group-hover/row:scale-110');
  });

  it('never draws the growth on an element with no reduced-motion guard beside it', () => {
    // The shipped convention on this pair is that the *transition* carries `motion-safe:` and the
    // target state does not, so under the preference the growth becomes a hard cut rather than an
    // animation. That is now strictly quieter than it was: the thing that cuts is a crop inside a
    // fixed mask, not a box that moves. The assertion is therefore "the two always travel
    // together" — a `scale-110` that lost its guarded transition would animate on every reader who
    // asked not to be animated at.
    for (const markup of [
      row(ROW_PLACE),
      row({ ...ROW_PLACE, detail: { ...ROW_PLACE.detail!, sourceThumbnailUrl: STILL } }),
    ]) {
      const carriers = (markup.match(/class="[^"]*scale-110[^"]*"/g) ?? []);
      expect(carriers.length).toBeGreaterThan(0);
      for (const carrier of carriers) expect(carrier).toContain('motion-safe:transition-transform');
    }
  });
});

describe("the detail view's picture survives a host that caps the column's height", () => {
  it('carries shrink-0 on the band', () => {
    // Measured before this line existed: 0 px tall inside the map popover, with a fully loaded
    // 160 px image inside it. `overflow-hidden` zeroes a flex item's automatic minimum size, so
    // this band was the only child of a column flex container that could absorb 268 px of overflow.
    expect(bandOf(detail(PLACE, { variant: 'popover' }))).not.toBeNull();
    expect(bandOf(detail(PLACE))).not.toBeNull();
  });

  it('is full-bleed and square-cornered only in the popover', () => {
    // The popover's shell supplies the gutter and the radius; every other host gives this column a
    // gutter of its own, where a picture running edge to edge would be the one element that does.
    expect(bandOf(detail(PLACE, { variant: 'popover' }))).toContain('rounded-none');
    expect(bandOf(detail(PLACE))).toContain('rounded-lg');
    expect(bandOf(detail(PLACE, { variant: 'hosted' }))).toContain('rounded-lg');
  });

  it('still tells TikTok nothing about the page being viewed', () => {
    // Re-asserted on the rewritten element rather than trusted to the older test that covers the
    // same attribute: this change replaced the whole component, and the reason for the attribute
    // is privacy — without it TikTok's CDN can correlate its own signed URLs with the device
    // asking for them, which is "which posts this person saved".
    for (const variant of ['sheet', 'popover', 'hosted'] as const) {
      const images = detail(PLACE, { variant }).match(/<img\b[^>]*>/g) ?? [];
      expect(images.length).toBeGreaterThan(0);
      for (const image of images) expect(image).toMatch(/referrerpolicy="no-referrer"/i);
    }
  });
});

describe('a picture that is gone costs the card nothing', () => {
  // Signed TikTok URLs live ~47 hours, so this is the ordinary state of anything saved more than
  // two days ago — not an error path, and not a state that earns a placeholder.
  it('renders no image element and no band', () => {
    const markup = detail(PLACE_WITHOUT_PICTURE, { variant: 'popover' });
    expect(markup).not.toContain('<img');
    expect(bandOf(markup)).toBeNull();
  });

  it('still renders a complete card', () => {
    // The absence has to be invisible rather than merely non-fatal: the name is the first thing,
    // and nothing above it reserves height that would make the card jump if a refresh landed late.
    const markup = detail(PLACE_WITHOUT_PICTURE, { variant: 'popover' });
    expect(markup).toContain('Sycamore');
    expect(markup).toContain('Open on TikTok');
  });

  it('offers no play glyph, even when a handler is wired', () => {
    // The owner ruled the affordance is *on the thumbnail*. With no thumbnail there is nothing to
    // put it on, and the card keeps the `Open on TikTok` link it already has — which is the
    // zero-disclosure path the security ruling names as the alternative that already ships.
    const markup = detail(PLACE_WITHOUT_PICTURE, { onPlaySource: () => {} });
    expect(markup).not.toContain(PLAY_SOURCE_LABEL);
  });
});

describe('the play affordance — a button and a slot, and nothing behind them', () => {
  it('draws no glyph until a host supplies a handler', () => {
    // Not a disabled button and not a glyph that opens something else: a control that expresses an
    // intent nothing acts on teaches the wrong thing about what pressing it will do.
    expect(detail(PLACE)).not.toContain(PLAY_SOURCE_LABEL);
    expect(detail(PLACE, { variant: 'popover' })).not.toContain(PLAY_SOURCE_LABEL);
  });

  it('draws a named button on the picture once one is', () => {
    const markup = detail(PLACE, { onPlaySource: () => {} });
    const button = markup.match(new RegExp(`<button[^>]*${PLAY_SOURCE_LABEL}[^>]*>`))?.[0] ?? '';
    expect(button).toContain('type="button"');
    // Positioned against the band, which is the element that carries `relative`. A glyph that is
    // not absolutely placed lands under the picture rather than on it.
    expect(button).toContain('absolute');
  });

  it('names itself with the adjective form of the source', () => {
    // `voice-and-vocabulary.md` §3.1: the name is an adjective, never a bare noun, and §3's
    // bare-*video* anaphor clause is unavailable to an `aria-label`, which is read with nothing
    // before it to refer back to.
    expect(PLAY_SOURCE_LABEL).toContain('TikTok video');
    expect(PLAY_SOURCE_LABEL).not.toMatch(/\ba TikTok\b(?! video)/);
  });

  it('lets a host that has its own wording pass it', () => {
    const markup = detail(PLACE, { onPlaySource: () => {}, playSourceLabel: 'Watch it here' });
    expect(markup).toContain('Watch it here');
    expect(markup).not.toContain(PLAY_SOURCE_LABEL);
  });

  it('gives the slot the same band the picture had, and drops the glyph', () => {
    // Swapping a picture for a player must not be a layout change, and the transport controls stop
    // being ours the moment there is a player: two play buttons on one surface is the defect this
    // assertion exists to prevent.
    const markup = detail(PLACE, {
      onPlaySource: () => {},
      sourcePlayer: createElement('div', { 'data-testid': 'player' }, 'the player lane renders here'),
    });
    expect(markup).toContain('data-testid="player"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain(PLAY_SOURCE_LABEL);
    expect(bandOf(markup)).not.toBeNull();
  });

  it('mounts no player of its own, in any state this file can produce', () => {
    // `docs/archive/security-ruling-embed-playback-2026-08-31.md` §0: the embed is a conditional permit,
    // and §6.1–6.4 are the gate. The press must reach a host that owns the first-press disclosure.
    // This is the assertion that says the seam has not been closed from the wrong side — an
    // iframe, a script tag or a TikTok host appearing anywhere under this component fails here,
    // whoever added it and for whatever reason.
    for (const props of [
      {},
      { onPlaySource: () => {} },
      { variant: 'popover' as const, onPlaySource: () => {} },
    ]) {
      const markup = detail(PLACE, props);
      expect(markup).not.toContain('<iframe');
      expect(markup).not.toContain('<script');
      expect(markup).not.toContain('tiktok.com/player');
      expect(markup).not.toContain('embed.tiktok.com');
    }
  });
});
