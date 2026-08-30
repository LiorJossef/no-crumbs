/**
 * The bar's two heavy children stay behind a dynamic import — and what that is *actually* worth.
 *
 * `bottom-nav.tsx` loads `AddSheetHost` and `ImportPageClient` through `next/dynamic`. Its comment
 * gives the reason as `server-only`: that a static import here "drags the server actions behind
 * them into every module that reads that constant", `place-sheet.tsx` being one.
 *
 * **That reason is false, and this file records the measurement rather than the belief.**
 * `walk()` below follows every static edge out of `bottom-nav.tsx` *as if the two dynamic imports
 * were static*, and finds `server-only` on no path — because every route into server code passes
 * through `src/app/actions/manual-add.ts`, a `'use server'` module, which is a boundary a client
 * component is allowed to import across. `map-page-client.tsx` proves the same thing by existing:
 * it imports both components statically and the app builds.
 *
 * So the dynamic import is a **bundle-weight** decision, not a correctness one, and this test holds
 * it as that. It fails if either import goes static — which is a real regression, because
 * `place-sheet.tsx` imports this file for `BOTTOM_NAV_HEIGHT_PX` and would then pull the import
 * screen into its chunk. It also fails if `server-only` ever *does* become reachable, which would
 * make the comment true and this test's second assertion wrong; either way somebody has to look.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'components/nav/bottom-nav.tsx');

function resolveSpec(spec: string, fromFile: string): string | null {
  if (!spec.startsWith('@/') && !spec.startsWith('.')) return null;
  const base = spec.startsWith('@/')
    ? path.join(SRC, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

interface Edges {
  readonly static: readonly string[];
  readonly dynamic: readonly string[];
}

function edgesOf(file: string): Edges {
  const source = readFileSync(file, 'utf8');
  const dynamic = [...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]!);
  const dynamicSet = new Set(dynamic);
  // `import type` is erased by the compiler and costs a bundle nothing, so it is not an edge for
  // the question this file asks.
  const statics = [
    ...[...source.matchAll(/^\s*(?:import|export)(?!\s+type\s)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
      .map((m) => m[1]!),
    ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!),
  ];
  return { static: statics.filter((spec) => !dynamicSet.has(spec)), dynamic };
}

/** `'use server'` is a bundler boundary: the module is replaced by a proxy in the client graph, so
 *  nothing it imports is in the client bundle. Traversal stops there, exactly as webpack does. */
function isServerActionModule(file: string): boolean {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]use server['"]/.test(readFileSync(file, 'utf8'));
}

/** Every module reachable from `entry`, plus the chains that reach `server-only`. */
function walk(entry: string, followDynamic: boolean): { reached: Set<string>; serverOnly: string[] } {
  const reached = new Set<string>();
  const serverOnly: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (reached.has(file)) continue;
    reached.add(file);
    const edges = edgesOf(file);
    for (const spec of followDynamic ? [...edges.static, ...edges.dynamic] : edges.static) {
      if (spec === 'server-only') {
        serverOnly.push(file);
        continue;
      }
      const resolved = resolveSpec(spec, file);
      if (resolved === null || isServerActionModule(resolved)) continue;
      queue.push(resolved);
    }
  }
  return { reached, serverOnly };
}

const rel = (file: string): string => path.relative(ROOT, file);

describe('bottom-nav.tsx keeps its two heavy children off the first paint', () => {
  it('imports AddSheetHost and ImportPageClient dynamically, never statically', () => {
    const edges = edgesOf(ENTRY);
    expect(edges.dynamic).toContain('@/components/add/add-sheet-host');
    expect(edges.dynamic).toContain('@/app/import/import-page-client');
    expect(edges.static).not.toContain('@/components/add/add-sheet-host');
    expect(edges.static).not.toContain('@/app/import/import-page-client');
  });

  it('is a bundle-weight boundary and nothing more: the static graph is tiny', () => {
    const { reached } = walk(ENTRY, false);
    // Three modules that ship code: itself, the metrics constant, and `lib/utils`. Anything larger
    // means somebody hung real work off the bar — and `place-sheet.tsx` imports this file for one
    // number, so whatever lands here lands there too.
    expect([...reached].map(rel).sort()).toEqual([
      'src/components/nav/bottom-nav-metrics.ts',
      'src/components/nav/bottom-nav.tsx',
      'src/lib/utils.ts',
    ]);
  });
});

describe("the comment's stated reason, measured", () => {
  it('reaches no server-only module even with the dynamic imports treated as static', () => {
    // If this ever fails, the dynamic import has become load-bearing for correctness rather than
    // for weight, and the second assertion in the test above is no longer the whole story.
    const { serverOnly } = walk(ENTRY, true);
    expect(serverOnly.map(rel)).toEqual([]);
  });

  it('and map-page-client imports both statically, which is why the app still builds', () => {
    const mapClient = edgesOf(path.join(SRC, 'app/map/map-page-client.tsx'));
    expect(mapClient.static).toContain('@/components/add/add-sheet-host');
    expect(mapClient.static).toContain('@/app/import/import-page-client');
  });
});
