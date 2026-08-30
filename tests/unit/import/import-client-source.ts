/**
 * The import client's source, as one string — for the guards in this directory that assert a fact
 * about the code rather than about a value.
 *
 * ## Why this is a glob and not a path
 *
 * Three tests here read `src/app/import/import-page-client.tsx` directly and assert things about
 * it: that no error string is hard-coded back into it, that exactly one effect spends a model
 * call, that the resolver's band literals stay in `ui/import/`. W6-1 splits that file into a shell,
 * six screens and four `_lib` modules. **Every one of those assertions would keep passing after the
 * split while reading a file that no longer contains its subject** — a guard that cannot fail is
 * not a guard, and its going quiet is invisible in a green run.
 *
 * So the unit of the scan is the *directory*, which is what the assertions were always about. It
 * follows the code wherever the decomposition puts it, and a new file under `src/app/import/` is
 * covered the day it is written rather than the day someone remembers to add it.
 *
 * Each caller keeps its own self-test ("the guard above actually catches a re-hardcoded string"),
 * because that is the only thing that proves the glob resolved to anything at all.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const IMPORT_CLIENT_DIR = 'src/app/import';

/** Every `.ts`/`.tsx` file under `src/app/import/`, in a stable order. */
export function importClientFiles(dir: string = IMPORT_CLIENT_DIR): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...importClientFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Those files, joined.
 *
 * `stripComments` is applied **per file, before joining**, because that is what
 * `import-error-copy.test.ts` has always done and joining first would let an unterminated block
 * comment in one file swallow the top of the next. Comments are where this codebase documents the copy it replaced, and a
 * string quoted in a comment is by definition not rendered — matching on it would make a guard
 * fire on its own explanation.
 */
export function importClientSource(options?: {
  readonly stripComments?: boolean;
  /** File paths to leave out, by exact path. See `DEV_ONLY_FILES`. */
  readonly exclude?: readonly string[];
}): string {
  return importClientFiles()
    .filter((file) => !(options?.exclude ?? []).includes(file))
    .map((file) => {
      const source = readFileSync(file, 'utf8');
      return options?.stripComments === true
        ? source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        : source;
    })
    .join('\n');
}

/**
 * The one file that defines `functionName`, as source — and it asserts that exactly one file
 * does.
 *
 * This replaces the slice-from-here-to-the-next-`function` idiom the callers used, and it is
 * strictly stronger in two ways: a rename makes it throw rather than silently yielding an empty
 * string that every `not.toContain` passes against, and a second definition of the same component
 * (the way a decomposition duplicates a screen) fails here instead of being invisible.
 */
export function fileDefining(functionName: string): string {
  const needle = `function ${functionName}(`;
  const hits = importClientFiles().filter((file) => readFileSync(file, 'utf8').includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one file under ${IMPORT_CLIENT_DIR}/ to define \`${needle}\`, found ${String(hits.length)}: ${hits.join(', ')}`,
    );
  }
  return readFileSync(hits[0]!, 'utf8');
}

/**
 * Just the body of one top-level function, from its `function X(` to the next top-level
 * `function `.
 *
 * The narrowing is what the callers were always doing by hand; what is new is that it runs over
 * `fileDefining`'s single file rather than over the whole concatenated directory. Both halves are
 * load-bearing: after W6-1 the file *is* the component and the slice is a no-op, and before it the
 * slice is what keeps a docblock several hundred lines above the function from being read as part
 * of it.
 */
export function functionSource(functionName: string): string {
  return fileDefining(functionName)
    .slice(fileDefining(functionName).indexOf(`function ${functionName}(`))
    .split('\nfunction ')[0]!;
}

/**
 * The files in this directory that exist **only** outside production, and are therefore allowed to
 * contain things the shipped screens may not.
 *
 * There is exactly one, and its whole content is fixture data for the screenshot gates
 * (`src/app/import/_lib/dev-screen.ts`). It legitimately holds a `ConfidenceBand` literal, because
 * building a `ResolveResult` requires one — which the band-literal guard in
 * `one-result-collapse.test.ts` otherwise bans across this directory, for the good reason that a
 * second copy of `deriveResolution`'s mapping in the UI is how the screen and the server end up
 * disagreeing about what was saved.
 *
 * **The exclusion is by name and it is pinned.** `assertDevOnlyFilesAreGuarded` below asserts that
 * every excluded file really is folded out of a production build, so the list cannot quietly become
 * a way to opt a shipped file out of a guard.
 */
export const DEV_ONLY_FILES = ['src/app/import/_lib/dev-screen.ts'] as const;

/** Every file in `DEV_ONLY_FILES` carries the literal `NODE_ENV` comparison the bundler folds. */
export function assertDevOnlyFilesAreGuarded(expect: (actual: unknown) => { toBe: (v: unknown) => void }): void {
  for (const file of DEV_ONLY_FILES) {
    expect(readFileSync(file, 'utf8').includes("process.env.NODE_ENV !== 'production'")).toBe(true);
  }
}
