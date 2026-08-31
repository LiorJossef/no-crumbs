/**
 * **The row half of the row↔pin coupling** — `W3-2`, the DOM side of what
 * `row-pin-coupling.test.ts` covers on the canvas side.
 *
 * The two halves carry one idea across a rendering boundary: pins are painted into a WebGL canvas
 * and have no nodes, so `group-hover:` reaches the row's own children and a lifted state prop
 * reaches the pins. This file is the source-level guard on the DOM half, in the same style
 * `camera-library-shapes.test.ts` Rule 5 uses and for the same reason — this suite runs in **node**
 * with no DOM and no renderer, and `place-sheet.tsx` cannot be imported here at all.
 *
 * **K8 rides on this** (`group-hover:` above zero *with the coupling working*), so the assertions
 * are about the mechanism rather than about the spelling of a class.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SHEET = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
const SHELL = readFileSync('src/components/shell/map-shell.tsx', 'utf8');

describe('a row reports where the pointer is', () => {
  /**
   * **The single most likely defect in this package, guarded first.** A touch tap emits
   * `pointerenter` *before* `click`, so without this check every tap on a phone would dim the whole
   * map for the frame between the finger landing and the camera starting to fly — invisible on a
   * desktop, and ruinous on the device this product was designed for first.
   */
  it('only treats a mouse as a pointer that can rest somewhere', () => {
    expect(SHEET).toContain("if (event.pointerType === 'mouse') onHover?.(place.id);");
  });

  /**
   * And `pointerleave` is deliberately **not** guarded. It clears state, so running it for a touch
   * that never set anything costs nothing — while skipping it after a pointer type changes
   * mid-session would strand a highlight on the map with nothing to clear it.
   */
  it('clears on leave for every pointer type', () => {
    expect(SHEET).toContain('onPointerLeave={() => onHover?.(null)}');
  });

  /** Focus is the keyboard's pointer: a user arrowing down the list gets the same coupling a mouse
   *  user gets, which is the difference between the map being a picture beside the list and the map
   *  being the other half of it. */
  it('treats focus as pointing, and blur as leaving', () => {
    expect(SHEET).toContain('onFocus={() => onHover?.(place.id)}');
    expect(SHEET).toContain('onBlur={() => onHover?.(null)}');
  });
});

describe('the row lights up as one object', () => {
  /** **A named group, never a bare `group`.** These rows nest inside other grouped containers on
   *  `/collections`, and an unnamed group would let a parent's hover light up every row inside it. */
  it('uses a named group so a parent cannot light the whole list', () => {
    expect(SHEET).toContain("'group/row'");
    expect(SHEET.match(/group-hover\/row:/g)?.length).toBeGreaterThanOrEqual(3);
    // The bare form would match `group-hover:` too, so this is asserted as the *absence* of an
    // unnamed hover group in this file rather than as a count.
    expect(SHEET).not.toMatch(/[^/]group-hover:/);
  });

  /** The three children the matrix names, and the one it deliberately excludes: the name is already
   *  `text-foreground`, so brightening it would be a change with nowhere to go. */
  it('lifts the disc, the muted line and the distance', () => {
    expect(SHEET).toContain('group-hover/row:scale-110');
    expect(SHEET).toContain('group-hover/row:text-foreground/80');
    expect(SHEET).toContain('group-hover/row:text-foreground"');
  });

  /** Both arms of the row's leading square — a thumbnail and the category pin — behave the same
   *  way, because a row has one leading square whichever of the two it happens to be drawing. */
  it('lifts the leading square whether it is a still or a pin', () => {
    expect(SHEET.match(/group-hover\/row:scale-110/g) ?? []).toHaveLength(2);
  });

  /** Every one of them is `motion-safe:` and none is a bare `transition-all`. The reduced arm is the
   *  un-prefixed state, so an author cannot forget to write one (§3a rule 4). */
  it('guards every transition it adds, and adds no transition-all', () => {
    for (const cls of ['motion-safe:transition-transform', 'motion-safe:transition-colors']) {
      expect(SHEET).toContain(cls);
    }
    expect(SHEET).not.toContain('motion-safe:transition-all');
  });

  /** The coupling's duration is the token, not a number: `--duration-couple` is 160 ms and is the
   *  same value the pin layer's `icon-opacity-transition` uses, so the two halves ramp together.
   *  (W0 registered it as `couple`; `ux-overnight-specs.md` §2.0 calls it `--duration-link`.) */
  it('runs at the registered coupling duration', () => {
    expect(SHEET).toContain('motion-safe:duration-couple');
    expect(readFileSync('src/app/globals.css', 'utf8')).toContain('--duration-couple: 160ms;');
  });
});

describe('the open place is drawn as the open place', () => {
  /** `aria-current` is the accessible fact **and** the hook the styling reads, so the state is
   *  announced and drawn from one source rather than two that can fall out of step. */
  it('says aria-current and styles from it, not from a second flag', () => {
    expect(SHEET).toContain("{...(selected ? { 'aria-current': 'true' as const } : {})}");
    expect(SHEET).toContain('aria-[current=true]:bg-primary/8');
    expect(SHEET).not.toContain('selected &&');
  });

  /** The mint rule sits on the **inline-start** edge, never the left one: this list renders Hebrew
   *  names, and the rule belongs on the edge the text starts at — the same reason the distance uses
   *  `ms-auto` rather than `ml-auto`. */
  it('puts the rule on the inline-start edge, for an RTL list', () => {
    expect(SHEET).toContain('aria-[current=true]:before:start-0');
    expect(SHEET).not.toContain('aria-[current=true]:before:left-0');
  });
});

describe('the two Clear controls are distinguishable', () => {
  /**
   * **A real accessibility defect, and one that cost a peer two build cycles.** Two controls could
   * be on screen at once carrying the identical accessible name `Clear search`: the search field's
   * icon ×, and `ClearSearchEscape`. They do different things — one clears the field, the other
   * clears the search *and* the scope — so a screen-reader user tabbing heard the same name twice
   * with nothing to choose between them, and a Playwright locator silently resolved to whichever
   * came first.
   *
   * Only the `aria-label` is fixed. The visible string is `product-lead`'s call and had not reached
   * `overnight-copy-deck.md`, so it is left exactly as it is rather than invented.
   */
  it('does not give two different controls one name', () => {
    expect(SHEET).toContain('aria-label="Clear the search field"');
    expect(SHEET).not.toContain('aria-label="Clear search"');
    // The visible string is untouched — this is the one the copy deck still owns.
    expect(SHEET).toContain('Clear search');
  });

  /** Both the sheet and the desktop panel render a `ClearSearchEscape`, with CSS hiding one per
   *  breakpoint. Recorded here because a locator without `:visible` resolves to the hidden node and
   *  times out looking exactly like a product bug. */
  it('renders that control on both surfaces, which a locator has to know', () => {
    const PANEL = readFileSync('src/components/sheet/place-desktop-panel.tsx', 'utf8');
    expect(SHEET).toContain('ClearSearchEscape');
    expect(PANEL).toContain('ClearSearchEscape');
  });
});

describe('the type scale is reached for by name', () => {
  /** Four stranded brackets, run rule 6a. `--radius-lg` **is** `var(--radius)`
   *  (`globals.css:64`), so that one is a rename with no computed-value change; the three 11px
   *  sites join the two `text-micro` uses this file already had. */
  it('has no arbitrary type or radius left in it', () => {
    expect(SHEET).not.toContain('text-[11px]');
    expect(SHEET).not.toContain('rounded-[var(--radius)]');
    expect(readFileSync('src/app/globals.css', 'utf8')).toContain('--radius-lg: var(--radius);');
  });
});

describe('the hover crosses to the canvas', () => {
  /** The whole path, in order. Each link is a place the coupling could silently stop, and the
   *  canvas half is dead code without every one of them. */
  it('reaches both list surfaces, not just the phone one', () => {
    const PANEL = readFileSync('src/components/sheet/place-desktop-panel.tsx', 'utf8');
    // **1440×900 renders the desktop panel, not the sheet**, so a coupling wired only into
    // `PlaceSheet` cannot fire at one of the two gate viewports — which is exactly what happened,
    // and why K8's browser criterion could not be met while the DOM half provably worked.
    expect(PANEL).toContain('readonly onHover?: (placeId: string | null) => void;');
    expect(PANEL).toContain('{...(onHover ? { onHover } : {})}');
    expect(PANEL).toContain('selected={selectedId === place.id}');
    expect(PAGE).toContain('onHover={setHoveredId}');
    // Both call sites, one state cell: two surfaces over one library must not disagree about
    // which place is being pointed at.
    expect(PAGE.match(/onHover=\{setHoveredId\}/g) ?? []).toHaveLength(2);
  });

  /** The same rule for the sort control: a facet that exists on one gate viewport and not the
   *  other is a half-finished surface, and it is the same shared component in both. */
  it('offers the sort control on both surfaces, from one component', () => {
    const PANEL = readFileSync('src/components/sheet/place-desktop-panel.tsx', 'utf8');
    const SHEET_SRC = readFileSync('src/components/sheet/place-sheet.tsx', 'utf8');
    expect(SHEET_SRC).toContain('export function SortControl(');
    expect(PANEL).toContain('<SortControl order={sortOrder} orders={sortOrders} onChange={onChangeSort} />');
    expect(PAGE.match(/onChangeSort=\{chooseOrder\}/g) ?? []).toHaveLength(2);
  });

  it('runs list → page → shell → surface', () => {
    expect(SHEET).toContain('onHover?: (placeId: string | null) => void;');
    expect(PAGE).toContain('const [hoveredId, setHoveredId] = useState<string | null>(null);');
    expect(PAGE).toContain('onHover={setHoveredId}');
    expect(PAGE).toContain('hoveredPlaceId={hoveredId}');
    expect(SHELL).toContain('readonly hoveredPlaceId?: string | null;');
    expect(SHELL).toContain('{...(hoveredPlaceId === undefined ? {} : { hoveredPlaceId })}');
  });

  /**
   * **And it is not a ninth camera mover.** The page's docblock enumerates eight, and the rule that
   * keeps that list worth having is that anything moving the camera is on it. Pointing at a row is
   * not asking to go there, and a map that flew whenever a pointer crossed a row would be unusable
   * with a mouse.
   */
  it('moves no camera', () => {
    const hover = PAGE.slice(PAGE.indexOf('const [hoveredId'), PAGE.indexOf('const [hoveredId') + 400);
    for (const mover of ['camera.frame', 'framePlaces', 'frameBounds']) {
      expect(hover).not.toContain(mover);
    }
    expect(PAGE).toContain('onHover={setHoveredId}');
  });
});
