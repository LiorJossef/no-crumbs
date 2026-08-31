/**
 * Q1 findings S6 and S7 — two places where a screen said something that was not news.
 *
 * **S6.** The import failure screen printed `Reference: POST_UNAVAILABLE` — a raw SCREAMING_SNAKE
 * enum shown to a person as if it were information for them. `voice-and-vocabulary.md` §4 bans
 * machinery vocabulary outright.
 *
 * It was kept on the grounds that a user could quote it in a support message, and that did not
 * survive contact with what it actually was: **a class, not an instance.** Every user who hits that
 * failure quotes the same eleven characters, so it correlates to nothing, while the headline above
 * it already says the same thing in English. The value that *would* correlate is the `importId`,
 * which the route deliberately keeps off the wire because "the correlation id lives in the log
 * line" (`07` §7.1). So it was for us, we already have it, and it is off the screen.
 *
 * **S7.** The rail's second step read `Finding the places` above `Finding the places…` — a slot
 * filled rather than a fact reported. Step one is the contrast that makes it obvious:
 * `Reading the TikTok` above `Read @demo's TikTok` tells the user *which* TikTok and that it is
 * done, which the label could not. This is the rule W6-2 is built on, one line down — **the rail
 * may claim no stage the server did not send** — and a line restating its own label is decoration
 * standing where a claim goes.
 *
 * Both are about the same thing: a slot that must carry news or carry nothing.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES } from '@/domain/errors';

import { importClientFiles, importClientSource } from './import-client-source';

const FAILURE = readFileSync('src/app/import/screens/failure-screen.tsx', 'utf8');
const RAIL = readFileSync('src/app/import/screens/rail-screen.tsx', 'utf8');

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('S6 — no machinery vocabulary reaches the screen', () => {
  it('renders no `Reference:` line', () => {
    expect(code(FAILURE)).not.toContain('Reference:');
    expect(code(importClientSource({ stripComments: true }))).not.toContain('Reference:');
  });

  it('names no error code in any component that renders', () => {
    /*
     * The general form of the finding, so it cannot come back wearing a different label. Scoped to
     * `screens/`, which is where text reaches a person: `_lib/use-import-run.ts` legitimately
     * *branches* on `'MALFORMED_URL'` and asserts `'INTERNAL'` as `07` §9's floor, and a condition
     * is not a sentence. A component naming a code is either printing it or re-deriving a mapping
     * that `ui/import/import-error-copy.ts` owns, and neither is allowed.
     */
    const screens = code(
      importClientFiles()
        .filter((f) => f.startsWith('src/app/import/screens/'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n'),
    );
    for (const errorCode of DOMAIN_ERROR_CODES) {
      expect(screens, errorCode).not.toContain(errorCode);
    }
  });

  it('carries no `rawCode` on the screen state or as a prop', () => {
    // Keeping it as data nothing reads would be the half-fix: the screen stops saying it and a dead
    // field records it forever. The local in `use-import-run.ts` stays — it is the un-narrowed
    // string on its way into `toDomainErrorCode`, which is the narrowing this taxonomy depends on.
    // What the server sent is not lost either: the route writes one structured `console.error` per
    // failure carrying the code, the stage and the import id.
    expect(code(readFileSync('src/app/import/_lib/screen.ts', 'utf8'))).not.toContain('rawCode');
    for (const file of importClientFiles().filter((f) => f.startsWith('src/app/import/screens/'))) {
      expect(code(readFileSync(file, 'utf8')), file).not.toContain('rawCode');
    }
  });

  it('drops the one call site still using the faded muted text', () => {
    // `spec-no-places-found.md` §8.3 rules `text-muted-foreground/70` below the bar, and the
    // `Reference:` line was where it lived on this screen.
    expect(code(FAILURE)).not.toContain('text-muted-foreground/70');
  });
});

describe('S7 — the rail’s fact slot carries news or nothing', () => {
  it('never falls back to restating the step’s own label', () => {
    expect(code(RAIL)).not.toContain('`${STAGE_LABEL[stage]}…`');
    expect(code(RAIL)).toContain("status === 'active' && progress");
  });

  it('keeps the one active fact that is a fact', () => {
    // A count *is* something the server sent. It arrives with the streaming route, which is also
    // when `resolve` rejoins `stages` — so the branch is kept rather than deleted with the
    // fallback it sat beside.
    expect(code(RAIL)).toContain('progress.index');
    expect(code(RAIL)).toContain('progress.total');
  });

  it('still reports a settled step’s real fact', () => {
    // Step one's `Read @demo's TikTok` is the thing this rule protects, not a casualty of it: it
    // names *which* TikTok, which the label cannot, and it comes off the server's response.
    expect(code(RAIL)).toContain("status === 'done' && fact");
  });

  it('leaves the running indication to the spinner, which is not a claim', () => {
    // An empty fact slot beside a spinning label is honest — something is running and we have
    // nothing to report about it yet. That is the state the fallback was papering over.
    expect(code(RAIL)).toContain("status === 'active' && <Loader2");
  });
});
