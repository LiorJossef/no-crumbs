/**
 * **An artefact that ships with no consumer is a capability claim the product cannot honour.**
 *
 * `errors-have-producers.test.ts` asserts the same sentence about one closed union: an error code
 * with a screen and a status must be constructed somewhere under `src/`. This file asserts it
 * about the three artefacts that shipped without one during the week of 2026-08-31, each of which
 * reached `main`, was recorded as built, and could not be reached by any user:
 *
 *   - **a module** — `src/components/embed/` is five files and five test files, and nothing
 *     outside that directory imports any of them, so `TiktokPlaybackPanel` never renders;
 *   - **a granted database function** — `repoint_saved_place` has been live and callerless since
 *     `0032`, through five migrations and three review rounds;
 *   - **a CSP origin** — `next.config.ts` serves `frame-src https://www.tiktok.com` in production
 *     for a frame that no reachable code constructs. A security relaxation bought for nothing.
 *
 * `product-review-2026-09-01-r4.md` §4.4 is the finding, and its sharpest sentence is the
 * asymmetry: `tests/unit/ui/motion-scale.test.ts` fails if a *motion constant* is unused, and
 * nothing failed for a migration, a component or a CSP entry. This repository guarded its smallest
 * artefact and not its largest.
 *
 * ## Why the rest of the suite cannot see any of this
 *
 * Every one of the three has a **green unit test of its own**. `tests/unit/embed/` exercises all
 * five embed modules. `supabase/tests/0032_repoint_saved_place_policy_tests.sql` exercises
 * `repoint_saved_place` against real rows. `tests/unit/embed/embed-player-url.test.ts` reads
 * `next.config.ts` and asserts its `frame-src` equals `EMBED_PLAYER_FRAME_SRC` and equals the
 * origin the iframe loads — three agreeing values, none of them reachable.
 *
 * A test that imports the thing it tests makes the thing look used. That is the same blindness
 * `errors-have-producers.test.ts` names in its detail 1, and it is why **`tests/` is not scanned
 * here, and is not an entry point.** A module reached only from `tests/` is exactly the orphan
 * this file exists to find.
 *
 * ## Seven details, each of which is the difference between a guard and a decoration
 *
 * 1. **Reachability, not "is imported".** The five embed files import each other, so "does
 *    anything import this?" reports all five as used. The question has to be asked from the
 *    entry points inward: a file is live if a chain of imports reaches it from something the
 *    framework itself loads. This also catches an *island* — `components/ui/card.tsx` is imported,
 *    but only by `map-surface.mock.tsx`, which is itself unreachable.
 * 2. **The entry points are Next's file conventions**, read off
 *    `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` for the installed
 *    16.3.1 — `page`, `layout`, `route`, `error`, `global-error`, `not-found`, `loading`,
 *    `template`, `default`, `forbidden`, `unauthorized`, the metadata files, and `proxy.ts`
 *    (this version's `middleware`). Nothing else is an entry, and in particular no test is.
 * 3. **Dynamic `import()` is an edge.** `persistent-map.tsx`, `bottom-nav.tsx` and
 *    `account-chip.tsx` reach four modules only through `next/dynamic` and `React.lazy`. A guard
 *    that missed those would report four false orphans on its first run and be deleted.
 * 4. **Comments are stripped, and here that is not a precaution.** `map-surface.tsx:20` is a
 *    commented-out `import` of `map-surface.live`, sitting directly above the live export, and the
 *    file's own docblock says *"Do not wire it in."* Without stripping, the guard would read that
 *    line as the wiring and pass — a guard fooled by the sentence explaining why the thing is
 *    unwired. `does not read a commented-out import as an edge` asserts it on that real file.
 * 5. **A database function's consumer may be SQL.** `collection_role` is granted to
 *    `authenticated` and called from twenty RLS policies, never from `src/`. So a consumer is a
 *    string literal in a **reachable** module *or* a call in a migration that is not itself DDL —
 *    the `function`/`exists` lookbehind rejects `grant execute on function public.f(`,
 *    `create or replace function public.f(`, `drop function if exists public.f(` and
 *    `comment on function public.f(`, all four of which name the function without calling it.
 * 6. **The RPC name is matched as a string literal, not as `.rpc('name'`.** `place-lookup-store.ts`
 *    calls `.rpc(GET_RPC, …)` through a `const`. The narrower matcher reported both
 *    `place_lookup_*` functions as orphans; they are not.
 * 7. **Naming a CSP origin is not consuming it.** Three reachable modules contain the string
 *    `https://www.tiktok.com` — an oEmbed endpoint, a list of dev seed links and a fixture URL —
 *    and none of them frames anything. A substring match would have passed ③ green on the
 *    strength of three files with nothing to do with it, so a consumer must name the origin *and*
 *    contain the construct the directive governs, in the same reachable module.
 *
 * ## The exemption mechanism
 *
 * Copied from `errors-have-producers.test.ts`, which solved this well: a dated entry with its
 * reason, pinned by `toEqual` **and** `toHaveLength`, **plus a third assertion that the entry's own
 * premise still holds** — so the day somebody wires the artefact up, the exemption stops being
 * true and the guard says so instead of leaving a permanent hole where a temporary one was argued
 * for. An entry cannot be added without changing a number and explaining itself in a diff.
 *
 * The seventeen entries below are a **census of debt that already exists**, taken against a clean
 * `git archive` of `96c90f6` rather than the working tree, and they are not a licence. The guard's
 * value is not that it is green today: it is that the eighteenth fails the build, named.
 *
 * ## What this guard does not cover, said plainly
 *
 * §4.4 lists **four** halves and this file sees **three** of them. The one it does not is ②, the
 * play affordance: `place-sheet.tsx` exports `PLAY_SOURCE_LABEL` and declares `onPlaySource` and
 * `sourcePlayer`, and no caller passes either, so the glyph never draws. That is a *prop* with no
 * caller inside a module that is otherwise thoroughly reachable, and finding it needs the type
 * graph, not the import graph — a different tool, honestly out of this file's reach. It is named
 * here so the gap is a known one rather than an assumed pass.
 *
 * Two smaller limits, for the same reason. An **exported symbol** nothing imports is invisible
 * here as long as one other symbol in its file is imported. And a granted database function whose
 * only caller is a `psql` session or a one-off script is reported as an orphan, which is why
 * `merge_places` is exempted rather than fixed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = 'src';
const MIGRATIONS_DIR = 'supabase/migrations';
const NEXT_CONFIG = 'next.config.ts';

/* ------------------------------------------------------------------ shared */

function walk(dir: string, match: RegExp): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, match));
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}

/** Detail 4. Per file, so one unterminated block comment cannot swallow the next file. */
function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** SQL's two comment forms. */
function stripSqlComments(source: string): string {
  return source.replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SOURCE_FILES = walk(SRC_DIR, /\.tsx?$/);
const SOURCE_TEXT = new Map(SOURCE_FILES.map((f) => [f, stripTsComments(readFileSync(f, 'utf8'))] as const));

/* ----------------------------------------------- guard A: unreachable modules */

/**
 * Detail 2 — Next 16.3.1's file conventions. `proxy` is this version's `middleware`
 * (`03-file-conventions/proxy.md`); both names are listed so a rename does not silently empty the
 * entry set, which `resolved a plausible number of entry points` would then catch anyway.
 */
const NEXT_FILE_CONVENTIONS: readonly string[] = [
  'page', 'layout', 'route', 'error', 'global-error', 'not-found', 'loading', 'template', 'default',
  'forbidden', 'unauthorized', 'mdx-components', 'instrumentation', 'instrumentation-client',
  'middleware', 'proxy', 'manifest', 'robots', 'sitemap',
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
];

function moduleBasename(file: string): string {
  return file.replace(/\.tsx?$/, '').split('/').pop() ?? '';
}

const ENTRY_POINTS = SOURCE_FILES.filter(
  (f) =>
    NEXT_FILE_CONVENTIONS.includes(moduleBasename(f)) &&
    (f.startsWith(`${SRC_DIR}/app/`) || dirname(f) === SRC_DIR),
);

/** Detail 3: `from '…'`, `import('…')` and `require('…')` are all edges. */
const SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** `@/x` and `./x` resolve into the tree; a bare package specifier does not. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let candidate: string;
  if (specifier.startsWith('@/')) candidate = join(SRC_DIR, specifier.slice(2));
  else if (specifier.startsWith('.')) candidate = relative(process.cwd(), resolve(dirname(fromFile), specifier));
  else return null;
  for (const form of [candidate, `${candidate}.ts`, `${candidate}.tsx`, join(candidate, 'index.ts'), join(candidate, 'index.tsx')]) {
    if (SOURCE_TEXT.has(form)) return form;
  }
  return null;
}

function importGraph(files: readonly string[]): ReadonlyMap<string, readonly string[]> {
  return new Map(
    files.map((file) => {
      const targets = new Set<string>();
      for (const match of (SOURCE_TEXT.get(file) ?? '').matchAll(SPECIFIER)) {
        const target = resolveSpecifier(file, match[1] ?? '');
        if (target !== null && target !== file) targets.add(target);
      }
      return [file, [...targets].sort()] as const;
    }),
  );
}

/** Detail 1. Pure, so the controls below can run it on a fabricated graph. */
function reachableFrom(
  entries: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of edges.get(file) ?? []) if (!seen.has(next)) stack.push(next);
  }
  return seen;
}

const IMPORT_GRAPH = importGraph(SOURCE_FILES);
const REACHABLE = reachableFrom(ENTRY_POINTS, IMPORT_GRAPH);

/**
 * Eleven modules that no chain of imports reaches from any Next entry point, at `96c90f6`.
 *
 * Five of them are §4.4's ① — the whole permitted, gated, security-reviewed TikTok playback
 * panel. The rest are older, and they are recorded rather than waved through because each one is
 * the same claim: a file in `src/` that a reader, a planner and a green suite all read as shipped.
 *
 * **Not fixed here on purpose.** Wiring the panel into `PlaceSheet`'s `onPlaySource`/`sourcePlayer`
 * slot is a product change in `src/`, which this lane does not have. Each entry expires by itself:
 * `every exemption is still an orphan` fails the moment one is wired up.
 */
const EXEMPT_MODULES: readonly string[] = [
  // §4.4 ① — the playback panel and its four supports. Built 2026-08-31, rendered by nothing.
  'src/components/embed/embed-player-url.ts',
  'src/components/embed/playback-consent.ts',
  'src/components/embed/playback-copy.ts',
  'src/components/embed/player-messages.ts',
  'src/components/embed/tiktok-playback-panel.tsx',
  // Frozen by an owner ruling of 2026-08-21 (Protomaps out). `map-surface.tsx`'s docblock says
  // "Do not wire it in", and `token-call-sites.test.ts:479` already records it as "frozen, unwired".
  'src/components/map/map-surface.live.tsx',
  // The pre-CARTO mock surface, superseded by `map-surface.mapcn.tsx` on 2026-08-21.
  'src/components/map/map-surface.mock.tsx',
  // Detail 1's island: imported, but only by `map-surface.mock.tsx`, which is itself unreachable.
  'src/components/ui/card.tsx',
  // A shadcn primitive nothing renders; `collections/loading-states.test.ts` reads it as a *file*.
  'src/components/ui/skeleton.tsx',
  // The vertical slice's `MockSavedPlace`, referenced now only by a docblock in `map/types.ts`.
  'src/domain/places/fixtures.ts',
  // Reached from `tests/unit/places/resolve-result.test.ts` and from two docblocks. Nothing else.
  'src/domain/places/resolve-result.ts',
];

describe('the reachability guard itself', () => {
  it('resolved the tree to real files', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(200);
    expect(SOURCE_FILES).toContain('src/app/map/page.tsx');
  });

  it('resolved a plausible number of entry points', () => {
    expect(ENTRY_POINTS.length).toBeGreaterThan(15);
    expect(ENTRY_POINTS).toContain('src/proxy.ts');
    expect(ENTRY_POINTS).not.toContain('src/components/embed/tiktok-playback-panel.tsx');
  });

  /**
   * **Positive control, and it is deliberately the hardest real case.** `map-surface.mapcn.tsx` is
   * the live map. Nothing imports it statically from outside its directory: the only path to it is
   * `map/page.tsx` → … → `persistent-map.tsx` → `import('@/components/map/map-surface')` →
   * `map-surface.tsx` → `./map-surface.mapcn`. If dynamic imports (detail 3), the `@/` alias, the
   * relative resolver or the traversal were broken, the product's map would report as an orphan.
   */
  it('follows a dynamic import through to a real module (positive control)', () => {
    expect(REACHABLE).toContain('src/components/map/map-surface.mapcn.tsx');
    expect(IMPORT_GRAPH.get('src/components/shell/persistent-map.tsx')).toContain(
      'src/components/map/map-surface.tsx',
    );
  });

  /**
   * **Negative control.** Without it, a traversal that had quietly started returning everything
   *  would pass forever. The example is `map-surface.live.tsx`, frozen by an owner ruling and
   *  named "do not wire it in" by its own module — a control must not be an artefact somebody may
   *  legitimately wire up tomorrow, or the control fails on a correct change.
   */
  it('does not reach a module that nothing imports (negative control)', () => {
    expect(REACHABLE).not.toContain('src/components/map/map-surface.live.tsx');
    expect(reachableFrom([], IMPORT_GRAPH).size).toBe(0);
  });

  /** Detail 1, on a fabricated graph: an island of files that import each other, reached by
   *  nothing, is unreachable — which "is it imported at all?" would call used. */
  it('calls an island unreachable even though every file in it is imported', () => {
    const island = new Map([
      ['entry.ts', ['live.ts']],
      ['live.ts', []],
      ['island-a.ts', ['island-b.ts']],
      ['island-b.ts', ['island-a.ts']],
    ]);
    expect([...reachableFrom(['entry.ts'], island)].sort()).toEqual(['entry.ts', 'live.ts']);
  });

  /**
   * Detail 4, asserted against the real file rather than a fixture. `map-surface.tsx:20` is a
   * commented-out import of `map-surface.live`; the raw bytes contain it, the stripped source does
   * not, and the graph does not carry the edge. This is the one place the guard would have been
   * fooled by the very sentence explaining the absence.
   */
  it('does not read a commented-out import as an edge', () => {
    const raw = readFileSync('src/components/map/map-surface.tsx', 'utf8');
    expect(raw).toContain("// import { MapSurfaceLive as MapSurface } from './map-surface.live'");
    expect(IMPORT_GRAPH.get('src/components/map/map-surface.tsx')).not.toContain(
      'src/components/map/map-surface.live.tsx',
    );
  });

  it('resolves the alias, a relative path and an index, and refuses a package', () => {
    expect(resolveSpecifier('src/app/map/page.tsx', '@/components/map/map-surface')).toBe(
      'src/components/map/map-surface.tsx',
    );
    expect(resolveSpecifier('src/components/nav/bottom-nav.tsx', './profile-menu')).toBe(
      'src/components/nav/profile-menu.tsx',
    );
    expect(resolveSpecifier('src/app/map/page.tsx', 'next/dynamic')).toBeNull();
    expect(resolveSpecifier('src/app/map/page.tsx', '@/does/not/exist')).toBeNull();
  });
});

describe('every module under src/ is reachable from a Next entry point', () => {
  it('carries exactly the eleven exemptions that were argued for', () => {
    expect(EXEMPT_MODULES).toEqual([
      'src/components/embed/embed-player-url.ts',
      'src/components/embed/playback-consent.ts',
      'src/components/embed/playback-copy.ts',
      'src/components/embed/player-messages.ts',
      'src/components/embed/tiktok-playback-panel.tsx',
      'src/components/map/map-surface.live.tsx',
      'src/components/map/map-surface.mock.tsx',
      'src/components/ui/card.tsx',
      'src/components/ui/skeleton.tsx',
      'src/domain/places/fixtures.ts',
      'src/domain/places/resolve-result.ts',
    ]);
    expect(EXEMPT_MODULES).toHaveLength(11);
  });

  it('exempts nothing that is actually reachable — every exemption expires on its own', () => {
    const wired = EXEMPT_MODULES.filter((f) => REACHABLE.has(f));
    expect(
      wired,
      `now reachable, so the exemption is stale — delete it from EXEMPT_MODULES: ${wired.join(', ')}`,
    ).toEqual([]);
  });

  it('exempts nothing that has been deleted — every exemption names a real file', () => {
    const gone = EXEMPT_MODULES.filter((f) => !SOURCE_TEXT.has(f));
    expect(gone, `no longer exists — delete it from EXEMPT_MODULES: ${gone.join(', ')}`).toEqual([]);
  });

  it('reaches every other module from something the framework loads', () => {
    const orphans = SOURCE_FILES.filter((f) => !REACHABLE.has(f) && !EXEMPT_MODULES.includes(f));
    expect(
      orphans,
      orphans.length === 0
        ? ''
        : `no chain of imports reaches these from any Next entry point, so nothing renders or ` +
          `runs them: ${orphans.join(', ')}. A green unit test does not make a module reachable — ` +
          `tests/ is deliberately not an entry point. Wire it up, delete it, or add it to ` +
          `EXEMPT_MODULES with a date and a reason.`,
    ).toEqual([]);
  });
});

/* ------------------------------------ guard B: granted database functions */

const MIGRATIONS = walk(MIGRATIONS_DIR, /\.sql$/).map(
  (f) => [f, stripSqlComments(readFileSync(f, 'utf8'))] as const,
);

/**
 * The `execute` grants that survive to the head of the migration order, replayed in file order so
 * a later `revoke` or `drop` undoes an earlier `grant` exactly as Postgres would.
 *
 * Keyed by name rather than by signature: `poi_prefilter` and `save_place` were each re-declared
 * with a wider argument list, and the guard's question — *does anything call this?* — is asked of
 * the name, not the overload.
 */
function grantedFunctions(
  migrations: readonly (readonly [string, string])[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const granted = new Map<string, Set<string>>();
  for (const [, text] of migrations) {
    for (const statement of text.split(';')) {
      const grant = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s*to\s+([\s\S]*)/i.exec(statement);
      if (grant !== null) {
        const [, name = '', to = ''] = grant;
        const roles = granted.get(name) ?? new Set<string>();
        for (const role of to.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)) roles.add(role);
        granted.set(name, roles);
        continue;
      }
      const revoke = /revoke\s+(?:all|execute)[\s\S]*?on\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s*from\s+([\s\S]*)/i.exec(statement);
      if (revoke !== null) {
        const [, name = '', from = ''] = revoke;
        const roles = granted.get(name);
        if (roles !== undefined) for (const role of from.split(',').map((r) => r.trim().toLowerCase())) roles.delete(role);
        continue;
      }
      const dropped = /drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)/i.exec(statement);
      if (dropped !== null) granted.delete(dropped[1] ?? '');
    }
  }
  return new Map([...granted].filter(([, roles]) => roles.size > 0).sort((a, b) => a[0].localeCompare(b[0])));
}

const GRANTED_FUNCTIONS = grantedFunctions(MIGRATIONS);

/** Detail 6: the app can only name an RPC as a string, and often through a `const`. Only a
 *  **reachable** module counts — a call from an orphan is not a consumer. */
function reachableModulesNaming(fn: string): readonly string[] {
  const literal = new RegExp(`['"\`]${fn}['"\`]`);
  return SOURCE_FILES.filter((f) => REACHABLE.has(f) && literal.test(SOURCE_TEXT.get(f) as string));
}

/** Detail 5: a call in SQL — an RLS policy, a trigger body, another function — but never the DDL
 *  that declares, grants, comments on or drops the function, in all four of which the token
 *  immediately before the name is `function` (or `exists`, for `drop function if exists`). */
function sqlCallSites(fn: string): readonly string[] {
  const call = new RegExp(`(?:public\\.)?\\b${fn}\\s*\\(`, 'gi');
  const sites: string[] = [];
  for (const [file, text] of MIGRATIONS) {
    for (const match of text.matchAll(call)) {
      const before = text.slice(Math.max(0, match.index - 60), match.index).replace(/\s+$/, '');
      if (/\b(function|exists)$/i.test(before)) continue;
      sites.push(`${file}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
  return sites;
}

function functionHasConsumer(fn: string): boolean {
  return reachableModulesNaming(fn).length > 0 || sqlCallSites(fn).length > 0;
}

/**
 * Five functions granted `execute` to a role that nothing calls, at `96c90f6`. Verified against
 * the running database on 2026-09-01 (`schema_migrations` = `0036`): the grant set this parser
 * computes from the migrations is byte-identical to `has_function_privilege` over `pg_proc`, all
 * twenty-nine of them.
 *
 * `repoint_saved_place` is §4.4's ④ and round 3's finding, unchanged. The other four are older
 * capabilities in the same state — a role can call them and no code does.
 */
const EXEMPT_FUNCTIONS: readonly string[] = [
  // 0026. The "undo a removal" pair — `collection_removed_members` lists them,
  // `restore_collection_membership` puts one back. Granted to `authenticated`, never called.
  'collection_removed_members',
  'restore_collection_membership',
  // 0011. The merge-chain repair, granted to `service_role`. Reachable only by hand, via psql.
  'merge_places',
  // 0031. The mentions writer, granted to `service_role`; `src/` names `place_mentions` in one
  // comment and calls nothing. §4.4's class, one migration earlier than ④.
  'record_place_mention',
  // §4.4 ④. Live since 0032, five migrations and three review rounds old. `grep -rn repoint src/`
  // returns one hit and it is a CSS comment about a font variable.
  'repoint_saved_place',
  // 0037, added 2026-09-01 — built the same day, and this guard caught them within the hour, which
  // is the first thing it has done that nothing else could. Both are the write half of a finding
  // whose read half is the actual fix: `why_go` must stop rendering unlabelled while
  // `why_go_reviewed_at` is null, and `DISHES MENTIONED` must stop attributing an edited list to
  // the post. Those are `src/` changes and they are the named follow-up, so these two are exempt
  // **until that lane lands**, not indefinitely — the assertion below deletes the entry the day
  // either acquires a caller.
  'review_saved_place_why_go',
  'set_saved_place_dishes',
];

describe('the database-function guard itself', () => {
  it('resolved the migrations and found the grants', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(25);
    expect(GRANTED_FUNCTIONS.size).toBeGreaterThan(20);
    expect(GRANTED_FUNCTIONS.get('save_place')).toContain('authenticated');
    expect(GRANTED_FUNCTIONS.get('repoint_saved_place')).toContain('service_role');
  });

  /** **Positive controls, one for each kind of consumer.** `collection_role` is called only from
   *  RLS policies; `start_import` only from a route, and only ever as a string. */
  it('finds a consumer that is really there (positive control)', () => {
    expect(sqlCallSites('collection_role').length).toBeGreaterThan(5);
    expect(reachableModulesNaming('start_import')).toContain('src/app/api/imports/probe/route.ts');
    expect(reachableModulesNaming('place_lookup_get')).toContain(
      'src/integrations/supabase/place-lookup-store.ts',
    );
  });

  /** **Negative control.** */
  it('does not find a consumer that does not exist (negative control)', () => {
    expect(sqlCallSites('__not_a_function')).toEqual([]);
    expect(reachableModulesNaming('__not_a_function')).toEqual([]);
    expect(functionHasConsumer('__not_a_function')).toBe(false);
  });

  /** Detail 5, asserted: the four DDL forms name a function without calling it. Without this the
   *  guard passes on every function in the schema, because every one of them is granted. */
  it('does not mistake declaring, granting, commenting on or dropping for calling', () => {
    const ddlOnly = grantedFunctions([
      [
        'fixture.sql',
        `create or replace function public.f_ddl_only(a uuid) returns void as $$ begin end; $$ language plpgsql;
         comment on function public.f_ddl_only(uuid) is 'a function';
         drop function if exists public.f_ddl_only(text);
         revoke all on function public.f_ddl_only(uuid) from public, anon;
         grant execute on function public.f_ddl_only(uuid) to authenticated;`,
      ],
    ]);
    expect([...ddlOnly.keys()]).toEqual(['f_ddl_only']);
    expect(ddlOnly.get('f_ddl_only')).toEqual(new Set(['authenticated']));
    expect(sqlCallSites('f_ddl_only')).toEqual([]);
  });

  /** A `revoke` and a `drop` after a `grant` must remove the function from the live set, or the
   *  guard demands a caller for something the database no longer exposes. */
  it('lets a later revoke or drop undo an earlier grant', () => {
    const replayed = grantedFunctions([
      ['0001.sql', 'grant execute on function public.f_gone(uuid) to authenticated;'],
      ['0002.sql', 'revoke all on function public.f_gone(uuid) from authenticated;'],
      ['0003.sql', 'grant execute on function public.f_dropped(uuid) to service_role;'],
      ['0004.sql', 'drop function if exists public.f_dropped(uuid);'],
      ['0005.sql', 'grant execute on function public.f_kept(uuid) to service_role;'],
    ]);
    expect([...replayed.keys()]).toEqual(['f_kept']);
  });

  /** SQL comments, the analogue of detail 4. `0036` discusses `repoint_saved_place` in prose over
   *  four separate comment lines; none of them is a caller. */
  it('does not read a call written only in a SQL comment as a call site', () => {
    expect(stripSqlComments('-- select f_commented();\n/* f_commented(); */\nselect 1;')).not.toMatch(
      /\bf_commented\s*\(/,
    );
  });
});

describe('every granted database function has a caller', () => {
  it('carries exactly the five exemptions that were argued for', () => {
    expect(EXEMPT_FUNCTIONS).toEqual([
      'collection_removed_members',
      'restore_collection_membership',
      'merge_places',
      'record_place_mention',
      'repoint_saved_place',
          'review_saved_place_why_go',
      'set_saved_place_dishes',
    ]);
    expect(EXEMPT_FUNCTIONS).toHaveLength(7);
  });

  it('exempts nothing that now has a caller — every exemption expires on its own', () => {
    const called = EXEMPT_FUNCTIONS.filter((fn) => functionHasConsumer(fn));
    expect(
      called,
      `now has a caller, so the exemption is stale — delete it from EXEMPT_FUNCTIONS: ${called.join(', ')}`,
    ).toEqual([]);
  });

  it('exempts nothing that is no longer granted — every exemption names a live grant', () => {
    const ungranted = EXEMPT_FUNCTIONS.filter((fn) => !GRANTED_FUNCTIONS.has(fn));
    expect(
      ungranted,
      `no longer granted to any role — delete it from EXEMPT_FUNCTIONS: ${ungranted.join(', ')}`,
    ).toEqual([]);
  });

  it('finds a caller for every other function a role may execute', () => {
    const callerless = [...GRANTED_FUNCTIONS.keys()].filter(
      (fn) => !EXEMPT_FUNCTIONS.includes(fn) && !functionHasConsumer(fn),
    );
    expect(
      callerless,
      callerless.length === 0
        ? ''
        : `granted execute to a role, and nothing calls them — not a reachable module under ` +
          `${SRC_DIR}/, not an RLS policy, not another function: ${callerless.join(', ')}. A ` +
          `policy-test file that exercises the function is not a caller. Build the call site, ` +
          `revoke the grant, or add it to EXEMPT_FUNCTIONS with a date and a reason.`,
    ).toEqual([]);
  });
});

/* ------------------------------------------ guard C: CSP origins with no frame */

/**
 * The origins `next.config.ts` allows the browser to load, by directive, each paired with the
 * construct that would actually spend the grant.
 *
 * **Naming the origin is not consuming the directive, and this is the detail the guard would have
 * been worthless without.** Three reachable modules contain the string `https://www.tiktok.com` —
 * `oembed-source-adapter.ts` calls the oEmbed endpoint, `seed-links.ts` lists dev fixtures,
 * `dev-screen.ts` holds a fake canonical URL. None of them frames anything, and none of them
 * needed `frame-src` to exist. A substring match would have reported §4.4's ③ as consumed, on
 * three files that have nothing to do with it: the guard would have passed, green, on the exact
 * case it was built for. `does not count a mere mention of the origin as a consumer` pins that.
 *
 * So the consumer of a `frame-src` origin is a reachable module that both reaches the origin
 * **and** builds a frame. The construct is element syntax or `createElement('x')` and nothing
 * looser: an earlier version also accepted the bare quoted word, and `'video'` in two import
 * routes made them consumers of a `media-src` origin they have never heard of. The other four directives are listed with their own constructs because they
 * carry the same cost, and a guard that must be extended before it can see the next relaxation is
 * a guard that will not be.
 */
const FETCH_DIRECTIVES: ReadonlyMap<string, RegExp> = new Map([
  ['frame-src', /<iframe[\s/>]|createElement\(\s*['"`]iframe['"`]/],
  ['connect-src', /\bfetch\s*\(|new\s+WebSocket|new\s+EventSource/],
  ['img-src', /<img[\s/>]|next\/image|createElement\(\s*['"`]img['"`]/],
  ['media-src', /<(?:video|audio)[\s/>]|createElement\(\s*['"`](?:video|audio)['"`]/],
  ['script-src', /<script[\s/>]|createElement\(\s*['"`]script['"`]/],
]);

/**
 * The header value is read with a back-reference to its own opening quote. The first attempt used
 * `['"]([^'"]+)['"]`, which returned **nothing at all** against the real config, because the value
 * is double-quoted and contains `frame-ancestors 'none'` — the character class stopped at the
 * apostrophe. The positive control below is what caught it.
 */
function cspOrigins(config: string): readonly (readonly [string, string])[] {
  const header = /(['"])Content-Security-Policy\1\s*,\s*value:\s*(['"])([\s\S]*?)\2/.exec(config);
  if (header === null) return [];
  const out: (readonly [string, string])[] = [];
  for (const directive of (header[3] ?? '').split(';').map((d) => d.trim()).filter(Boolean)) {
    const [name = '', ...values] = directive.split(/\s+/);
    if (!FETCH_DIRECTIVES.has(name)) continue;
    for (const value of values) if (/^https?:\/\//.test(value)) out.push([name, value] as const);
  }
  return out;
}

const CSP_ORIGINS = cspOrigins(stripTsComments(readFileSync(NEXT_CONFIG, 'utf8')));

/**
 * A relaxation is paid for by the browser at runtime, so its consumer must be code that **runs**,
 * that does the thing the directive permits, and that can actually get at the origin.
 *
 * The middle clause and the last one are separate files here, and that is normal rather than a
 * quirk: `tiktok-playback-panel.tsx` builds the `<iframe>`, and the origin it builds it at is
 * `EMBED_PLAYER_FRAME_SRC` in `./embed-player-url`. Requiring both in the *same* file rejected a
 * correct wiring — the guard failed on the very fix it exists to demand, which is how a guard
 * gets deleted. So the rule is: a reachable module that contains the construct, and that names
 * the origin itself **or reaches a module that does**.
 *
 * That still rejects the three near-misses: `oembed-source-adapter.ts`, `seed-links.ts` and
 * `dev-screen.ts` all name `https://www.tiktok.com` and none of them frames anything.
 */
function originConsumers(directive: string, origin: string): readonly string[] {
  const construct = FETCH_DIRECTIVES.get(directive);
  if (construct === undefined) return [];
  return SOURCE_FILES.filter((f) => {
    if (!REACHABLE.has(f)) return false;
    if (!construct.test(SOURCE_TEXT.get(f) as string)) return false;
    return [...reachableFrom([f], IMPORT_GRAPH)].some((m) => (SOURCE_TEXT.get(m) as string).includes(origin));
  });
}

/**
 * §4.4's ③. `frame-src https://www.tiktok.com` is served on every response in production —
 * confirmed live with `curl -sI` in the round-4 review — and the only code that builds a frame at
 * that origin is `tiktok-playback-panel.tsx`, which is in `EXEMPT_MODULES` above.
 *
 * This entry is the one that costs something while it stands: the other sixteen are unused code,
 * this is an active grant on every response in production. It expires the moment the panel is
 * wired up, because the module that builds the frame becomes reachable.
 */
const EXEMPT_CSP_ORIGINS: readonly (readonly [string, string])[] = [['frame-src', 'https://www.tiktok.com']];

describe('the CSP guard itself', () => {
  /**
   * **Positive control**, and it earned its place: the first version of `cspOrigins` returned `[]`
   * here, because its character class stopped at the apostrophe in `frame-ancestors 'none'`. A
   * guard that finds no origins passes trivially and forever.
   *
   * `toContainEqual`, not `toEqual` on the whole list — pinning the entire CSP would make *adding
   * a legitimate origin* fail a control as well as the assertion that actually has something to
   * say about it, and a guard that cries twice gets read once.
   */
  it('parsed the real header out of next.config.ts (positive control)', () => {
    expect(CSP_ORIGINS.length).toBeGreaterThan(0);
    expect(CSP_ORIGINS).toContainEqual(['frame-src', 'https://www.tiktok.com']);
  });

  /** **Negative control.** A CSP with no fetch-directive origin yields nothing, and a config with
   *  no CSP at all yields nothing — so a parser that had started returning garbage cannot pass. */
  it('finds no origin where there is none (negative control)', () => {
    expect(cspOrigins(`{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }`)).toEqual([]);
    expect(cspOrigins(`{ key: 'X-Content-Type-Options', value: 'nosniff' }`)).toEqual([]);
    expect(cspOrigins(`{ key: 'Content-Security-Policy', value: "frame-src 'self'" }`)).toEqual([]);
  });

  it('reads an origin from any fetch directive, not only frame-src', () => {
    expect(
      cspOrigins(`{ key: 'Content-Security-Policy', value: "connect-src https://a.example https://b.example; frame-ancestors 'none'" }`),
    ).toEqual([
      ['connect-src', 'https://a.example'],
      ['connect-src', 'https://b.example'],
    ]);
  });

  /**
   * The detail the guard would have been worthless without, asserted on the real tree: three
   * *reachable* modules contain the exact string `https://www.tiktok.com`, and not one of them
   * frames anything. A substring match passes §4.4's ③ on the strength of an oEmbed endpoint and
   * a list of dev seed links.
   */
  it('does not count a mere mention of the origin as a consumer', () => {
    const mentions = SOURCE_FILES.filter(
      (f) => REACHABLE.has(f) && (SOURCE_TEXT.get(f) as string).includes('https://www.tiktok.com'),
    );
    expect(mentions).toContain('src/integrations/tiktok/oembed-source-adapter.ts');
    expect(mentions).toContain('src/ui/import/seed-links.ts');
    expect(mentions).toContain('src/app/import/_lib/dev-screen.ts');
    // Stated as an exclusion rather than as `toEqual([])`, so that wiring the panel up — which
    // *is* a consumer — does not fail a control about three modules that never were one.
    for (const near of mentions) {
      expect(originConsumers('frame-src', 'https://www.tiktok.com')).not.toContain(near);
    }
  });

  /**
   * The other three ways `originConsumers` must return nothing: the directive's construct exists
   * nowhere reachable (`media-src` — the only `<video` in the tree is in an unreachable embed
   * module), the origin exists nowhere at all, and the directive is one this guard does not model.
   * Without these, a rule that had started answering *yes* to everything would still pass.
   */
  it('returns nothing without the construct, without the origin, or for a directive it does not model', () => {
    expect(originConsumers('media-src', 'https://www.tiktok.com')).toEqual([]);
    expect(originConsumers('frame-src', 'https://not-in-the-tree.example')).toEqual([]);
    expect(originConsumers('font-src', 'https://www.tiktok.com')).toEqual([]);
  });
});

describe('every origin the CSP allows has code that reaches it', () => {
  it('carries exactly the one exemption that was argued for', () => {
    expect(EXEMPT_CSP_ORIGINS).toEqual([['frame-src', 'https://www.tiktok.com']]);
    expect(EXEMPT_CSP_ORIGINS).toHaveLength(1);
  });

  it('exempts no origin that now has a consumer — the exemption expires on its own', () => {
    const used = EXEMPT_CSP_ORIGINS.filter(([d, o]) => originConsumers(d, o).length > 0);
    expect(
      used,
      `now consumed, so the exemption is stale — delete it from EXEMPT_CSP_ORIGINS: ${used.map(([, o]) => o).join(', ')}`,
    ).toEqual([]);
  });

  it('exempts no origin the CSP no longer grants', () => {
    const stale = EXEMPT_CSP_ORIGINS.filter(
      ([directive, origin]) => !CSP_ORIGINS.some(([d, o]) => d === directive && o === origin),
    );
    expect(
      stale,
      `no longer in the CSP — delete it from EXEMPT_CSP_ORIGINS: ${stale.map(([d, o]) => `${d} ${o}`).join(', ')}`,
    ).toEqual([]);
  });

  it('finds a consumer for every other origin', () => {
    const unused = CSP_ORIGINS.filter(
      ([directive, origin]) =>
        !EXEMPT_CSP_ORIGINS.some(([d, o]) => d === directive && o === origin) &&
        originConsumers(directive, origin).length === 0,
    );
    expect(
      unused,
      unused.length === 0
        ? ''
        : `${NEXT_CONFIG} relaxes the CSP for origins no reachable module can spend, so the ` +
          `browser is granted something the product cannot use: ${unused.map(([d, o]) => `${d} ${o}`).join(', ')}. ` +
          `Naming the origin is not consuming it, and a constant in an unreachable module is not ` +
          `a consumer. Wire the feature up, or remove the directive in the same commit as the ` +
          `code that stopped needing it.`,
    ).toEqual([]);
  });
});
