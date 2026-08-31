/**
 * **There is one shell, and this is what stops a second one growing back.**
 *
 * `ux-collections-as-scope.md` §5 items 8–11 deleted a hand-built copy of the map shell from
 * `/collections/[id]`: a second `Drawer.Root`, a second `MapSurface` call site, a second desktop
 * panel and a second declaration of every geometry constant. Eleven deletions stay deleted only if
 * something fails when they come back, and the cheapest thing that can fail is a source read.
 *
 * Source text, not behaviour, and deliberately coarse — the technique
 * `tests/unit/map/pin-band-floor.test.ts` already uses for exactly the same reason: the statements
 * being guarded are JSX that needs a WebGL context and a DOM to execute, and `vitest.config.ts`
 * sets `environment: 'node'`. This proves where the shell is *written*. That it renders is a
 * browser at four viewports, and that evidence lives with the task.
 *
 * Comments are stripped before matching. Every file involved in this refactor explains the
 * deletion in its own header, and a whole-file grep would match the explanation rather than the
 * code — which would make the guard fire on the documentation of its own success.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

/** The one directory allowed to compose a shell. */
const SHELL = 'components/shell/';

/**
 * The map's own implementation tree. It is where `MapSurface` is *defined* and where the surface
 * declares its own camera defaults (`FLOATING_TOP_CHROME_PX`, `SHEET_PEEK_PX`); those are the port,
 * not a second copy of the shell, and `tests/unit/shell/sheet-geometry.test.ts` is what holds the
 * peek mirror to the same number.
 */
const MAP = 'components/map/';

/**
 * The create menu's drawer, and the one legitimate second `Drawer.Root` in the product.
 *
 * It is a **modal** drawer one layer above the shell — it is what `MapShell`'s `modalSlot` holds —
 * so it is not a second sheet competing for the same gesture surface. `add-sheet.tsx`'s own header
 * records why there is exactly one of it.
 */
const MODAL_DRAWER = 'components/add/add-sheet.tsx';

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (name) => name.endsWith('.ts') || name.endsWith('.tsx'),
  );
}

/** `const NAME`, and nothing that merely reads or aliases it. */
function declaration(constant: string): RegExp {
  return new RegExp(String.raw`\b(?:const|let|var)\s+${constant}\b`);
}

function code(relative: string): string {
  return readFileSync(SRC + relative, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('one Drawer.Root', () => {
  it('is composed in the shell, and nowhere else but the modal create sheet', () => {
    for (const name of sourceFiles()) {
      if (name.startsWith(SHELL) || name === MODAL_DRAWER) continue;
      expect(code(name), name).not.toContain('<Drawer.Root');
    }
  });

  it('is actually in the shell — a guard nothing can satisfy is not a guard', () => {
    expect(code(`${SHELL}map-shell.tsx`)).toContain('<Drawer.Root');
  });
});

describe('one MapSurface call site', () => {
  it('is the shell, and no route mounts the map itself', () => {
    for (const name of sourceFiles()) {
      if (name.startsWith(SHELL) || name.startsWith(MAP)) continue;
      expect(code(name), name).not.toContain('<MapSurface');
    }
  });

  /**
   * **The call site moved inside the shell directory on 2026-08-31 and did not leave it.**
   *
   * `persistent-map.tsx` renders `MapSurface` once, from the root layout, so that a tab change
   * stops destroying the MapLibre instance — measured at `9a95444` as one new WebGL context and
   * 13-16 re-requested tiles per `/map` <-> `/collections` hop. `MapShell` now renders the slot
   * that borrows it.
   *
   * The guard above is unchanged and still says what it always said: no route mounts the map. This
   * one keeps the other half honest — that the single call site exists, and is in `components/shell/`
   * — and it names both halves so neither can quietly disappear.
   */
  it('is actually in the shell, as the one surface the shell mounts for every route', () => {
    expect(code(`${SHELL}persistent-map.tsx`)).toContain('<MapSurface');
    expect(code(`${SHELL}map-shell.tsx`)).toContain('<PersistentMapSlot');
  });
});

describe('one declaration of the sheet geometry', () => {
  /**
   * The numbers a second shell needs in order to exist. `PEEK_PX` is the load-bearing one — it is
   * mirrored in `globals.css` as a CARTO/OSM attribution condition — but a route that re-declares
   * any of these has, by that fact, stopped using the shell's.
   */
  const NAMES = [
    'PEEK_PX',
    'HALF_FRACTION',
    'SNAP_POINTS',
    'STOP_TO_SNAP',
    'STOP_TO_CONTENT_HEIGHT',
    'RESTING_SHEET_FRACTION',
    'FLOATING_TOP_CHROME_PX',
  ];

  it('is sheet-geometry.ts, for every one of them', () => {
    for (const name of sourceFiles()) {
      if (name === `${SHELL}sheet-geometry.ts` || name.startsWith(MAP)) continue;
      const source = code(name);
      for (const constant of NAMES) {
        // A *declaration*, not a mention: every file in the shell reads these constants, and
        // requiring `const` immediately before the name is also what keeps a prefixed one out —
        // `SHEET_HALF_FRACTION` in `place-sheet.tsx` is a one-line alias of the shell's value, and
        // `SHEET_PEEK_PX` is the camera mirror `sheet-geometry.test.ts` already pins.
        expect(source, `${name} declares ${constant}`).not.toMatch(declaration(constant));
      }
    }
  });

  it('declares all of them there', () => {
    const geometry = code(`${SHELL}sheet-geometry.ts`);
    for (const constant of ['PEEK_PX', 'HALF_FRACTION', 'SNAP_POINTS', 'STOP_TO_SNAP']) {
      expect(geometry, constant).toMatch(declaration(constant));
    }
  });

  it('left no private copy behind on the collection route', () => {
    // The file §5 item 8 names by path. Asserted as an absence rather than as a `not.toContain`,
    // because a re-created module would pass every check above by simply re-exporting.
    const collections = readdirSync(`${SRC}app/collections/`, {
      recursive: true,
      encoding: 'utf8',
    });
    expect(collections).not.toContain('[id]/sheet-geometry.ts');
  });
});

describe('no scope chip over a collections map', () => {
  /**
   * `floatingTopChromePx={0}` on both `/collections` routes is the mechanical enforcement of a UX
   * ruling, not a style choice: §3 forbids a scope chip over the map *so that* this number can stay
   * 0, and `L2-COLL-CAM-2` measured what a phantom 100 px band did to the fit at 640×360 — 394 px
   * of padding in a 360 px container, and the lowest pin coming to rest under the sheet.
   */
  it('is no longer passed at all, because the chrome is now really there', () => {
    /**
     * **This assertion inverted on 2026-08-31 and the ruling it enforces did not.**
     *
     * §3 forbids a *scope chip* over a collection's map so that this number can stay honest, and
     * `L2-COLL-CAM-2` measured what a phantom 100 px did to the fit at 640×360 — 394 px of padding
     * in a 360 px container, and the lowest pin coming to rest under the sheet. `0` was the honest
     * number while the collections routes were their own segments with nothing floating over them.
     *
     * All three views are now one mount on `/map`, and `/map` draws `ShellWordmark` — `h-11`, no
     * breakpoint, over the top edge — on every one of them. So the chrome *is* there, and the
     * honest number is `/map`'s own default. Passing `0` would be the same lie L2-COLL-CAM-2 was,
     * told from the other side.
     *
     * What still binds is the ruling: no scope chip. That is checked by its absence from the
     * client, not by a number.
     */
    const client = code('app/map/map-page-client.tsx');
    expect(client).not.toContain('floatingTopChromePx');
    expect(code('app/map/collections-scope.tsx')).not.toContain('floatingTopChromePx');
  });
});

describe('the collections index is the sheet, not a page', () => {
  const index = code('app/map/collections-index-list.tsx');
  const drawer = code('app/map/map-page-client.tsx');

  /** §5 item 1: the standalone document layout. */
  it('has no page column, no full-height document wrapper and no header element', () => {
    expect(index).not.toContain('min-h-dvh');
    expect(index).not.toContain('max-w-[560px]');
    expect(index).not.toContain('<header');
    expect(index).not.toContain('<h1');
  });

  /** §5 items 2 and 4: the two controls that pointed at a map the shell now renders behind them. */
  it('offers no way back to a map that is already on screen', () => {
    expect(index).not.toContain('Back to the map');
    expect(index).not.toContain('Go to your map');
  });

  /** §5 item 9's other half: the bar is the shell's, mounted once. */
  it('does not mount its own bottom bar', () => {
    expect(index).not.toContain('<BottomNav');
  });

  it('renders through the shell instead', () => {
    expect(drawer).toContain('<MapShell');
  });

  /**
   * **The index and a collection are one segment, and `[id]` is a redirect.**
   *
   * This is the structural claim the whole 2026-08-31 change rests on: a sibling segment change
   * unmounts the drawer, so the two views cannot be two segments. Asserted here rather than only
   * in `_lib/drawer-view.test.ts` because the failure mode is somebody re-creating a real page at
   * `[id]` — which would pass every unit test of the parsing while quietly restoring the remount.
   */
  it('leaves nothing behind at either old segment but a redirect', () => {
    for (const shim of ['app/collections/page.tsx', 'app/collections/[id]/page.tsx']) {
      expect(code(shim), shim).toContain('redirect(');
      expect(code(shim), shim).not.toContain('MapShell');
    }
    const files = readdirSync(`${SRC}app/collections/`, { recursive: true, encoding: 'utf8' });
    for (const gone of [
      '[id]/collection-client.tsx',
      '[id]/loading.tsx',
      'collections-index-client.tsx',
      'collections-drawer-client.tsx',
      'loading.tsx',
    ]) {
      expect(files, gone).not.toContain(gone);
    }
  });
});
