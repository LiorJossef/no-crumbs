/**
 * W6-5 part 2 — the add-by-name recovery, and the two rules that make it safe to ship.
 *
 * It is what closes finding 10: the standalone `/import` route silently withheld the no-places
 * screen's primary recovery, because the only one on offer opened a `＋` sheet that exists on
 * `/map` and nowhere else. A field on the screen has no host to be missing.
 *
 * Two things about it are load-bearing and neither is visible in a screenshot:
 *
 *  1. **One provider lookup per submit.** Google Places is 100/day on this project. Type-ahead,
 *     a debounce, a search on blur, or a second submit landing while one is in flight would each
 *     turn one recovery into several lookups. `spec-no-places-found.md` §6.4 calls this a design
 *     rule rather than an optimisation, and it is the same guard `inFlightProbe` implements one
 *     screen earlier.
 *  2. **The browser sends a string it typed and a position, never a place fact.**
 *     `domain/import/candidate-place.ts` carries the confirmed exploit that rule closes: a
 *     client-supplied name or coordinate lets one person rename and relocate a place other people
 *     have saved, because `places` rows are shared and `resolve_place` refreshes them.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const BLOCK = readFileSync('src/app/import/screens/add-by-name.tsx', 'utf8');
const ROUTE = readFileSync('src/app/api/imports/place-search/route.ts', 'utf8');

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const BLOCK_CODE = code(BLOCK);
const ROUTE_CODE = code(ROUTE);

describe('one lookup per submit, and never any other way', () => {
  it('issues a request from the submit handler and from nowhere else', () => {
    // No type-ahead, no debounce, no search on keystroke, blur or paste. Every `fetch` in this file
    // is inside `submit` or `add`, both of which are called from an explicit press.
    expect((BLOCK_CODE.match(/fetch\(/g) ?? []).length).toBe(2);
    expect(BLOCK_CODE).not.toContain('useEffect');
    expect(BLOCK_CODE).not.toContain('setTimeout');
    expect(BLOCK_CODE).not.toContain('onBlur');
    expect(BLOCK_CODE).not.toContain('onPaste');
  });

  it('refuses a second submit while one is in flight, rather than queueing or restarting it', () => {
    // A ref set synchronously before the first `await`, so a burst dispatched inside one task finds
    // it held — `inFlightProbe`'s shape, for `inFlightProbe`'s reason. Five taps must not become
    // five lookups.
    expect(BLOCK_CODE).toContain('const inFlight = useRef(false)');
    expect(BLOCK_CODE).toContain('if (text === \'\' || inFlight.current) return;');
    expect(BLOCK_CODE).toContain('inFlight.current = true');
    expect(BLOCK_CODE).toContain('inFlight.current = false');
  });

  it('checks offline before issuing anything, so an offline submit costs nothing', () => {
    const submit = BLOCK_CODE.slice(BLOCK_CODE.indexOf('async function submit()'), BLOCK_CODE.indexOf('async function add('));
    expect(submit.indexOf('navigator.onLine === false')).toBeLessThan(submit.indexOf('fetch('));
  });

  it('never autofocuses the field', () => {
    // Three in four imports land on this screen. Raising the keyboard uninvited over the caption
    // the user needs to read is the single worst thing it could do — the opposite of F0's paste
    // field, where arriving means you already have a link.
    expect(BLOCK_CODE).not.toContain('autoFocus');
  });

  it('discards a stale result set on an edit rather than issuing a fresh lookup', () => {
    // The rows on screen answered a different string. Clearing them costs nothing; re-searching
    // for them would be a lookup nobody asked for.
    const onChange = BLOCK_CODE.slice(BLOCK_CODE.indexOf('onChange={(e) => {'), BLOCK_CODE.indexOf('className="h-12 flex-1'));
    expect(onChange).toContain("setPhase({ kind: 'idle' })");
    expect(onChange).not.toContain('submit');
  });
});

describe('the browser says which, never what', () => {
  it('sends a typed string and a position, and no place fact', () => {
    const bodies = [...BLOCK_CODE.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]!);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      for (const banned of ['lat', 'lng', 'coordinates', 'providerPlaceId', 'address']) {
        expect(body, banned).not.toContain(banned);
      }
    }
  });

  it('sends the shown name only as a check, and the server treats it as one', () => {
    // `expectedName` is compared against the server's own freshly-resolved row and then discarded.
    // It is never passed to `resolve_place` and never becomes part of what is written — if it were
    // an input, this would be exactly the exploit `candidate-place.ts` documents.
    expect(BLOCK_CODE).toContain('expectedName: chosen.name');
    expect(ROUTE_CODE).toContain('shown.name !== body.expectedName');
    const confirmAt = ROUTE_CODE.indexOf('confirmPlace(');
    const save = ROUTE_CODE.slice(confirmAt, ROUTE_CODE.indexOf('} catch (e) {', confirmAt));
    expect(save).not.toContain('expectedName');
    expect(save).toContain('place: chosen.place');
  });

  it('returns the fresh list when the choice went stale, rather than saving the wrong row', () => {
    expect(ROUTE_CODE).toContain('reason: STALE_CHOICE');
    expect(BLOCK_CODE).toContain("setPhase({ kind: 'results', results: body.results, query: searched })");
  });
});

describe('what a save from here writes', () => {
  it('links the TikTok it came from', () => {
    // The product's "which post made me save this?" question must have a real answer here, and it
    // is the reason inlining the search beats routing to a standalone add screen.
    expect(BLOCK_CODE).toContain('sourceId,');
    expect(ROUTE_CODE).toContain("sourceId: typeof body.sourceId === 'string' ? body.sourceId : null");
  });

  it('claims no caption-derived provenance', () => {
    // There *is* a caption and it still did not name this place — the user did. No
    // `extracted_reason`, no tags, no `why_go`, no dishes; `enrichment: null` is what stops
    // `apply_saved_place_extraction` being called at all.
    expect(ROUTE_CODE).toContain('extractedReason: null');
    expect(ROUTE_CODE).toContain('enrichment: null');
  });

  it('reports an already-saved place as already saved', () => {
    // `save_place` is idempotent, so the alternative is claiming a fresh save for a place the user
    // already had.
    expect(ROUTE_CODE).toContain('alreadySaved: saved.alreadySaved');
    expect(BLOCK_CODE).toContain('alreadySaved: body.alreadySaved');
  });
});

describe('the states, and the one that is not an error', () => {
  it('never auto-selects, even at one result', () => {
    // Charter §3 invariant 2 is uniform across both save paths. A single result is still a result
    // to choose, not a decision already made.
    expect(BLOCK_CODE).not.toContain('results.length === 1 &&');
    expect(BLOCK_CODE).toContain("setPhase({ kind: 'confirm'");
  });

  it('renders zero results in the same register as the screen around it', () => {
    // Designed, not an error: muted body text, no destructive colour, no icon, and the query stays
    // in the field so it can be edited rather than retyped.
    const empty = BLOCK_CODE.slice(
      BLOCK_CODE.indexOf('phase.results.length === 0'),
      BLOCK_CODE.indexOf("{phase.kind === 'failed' &&"),
    );
    expect(empty).toContain('text-muted-foreground');
    expect(empty).not.toContain('destructive');
    expect(empty).toContain('No places match');
  });

  it('keeps red for a failed add, which is a real failure of something the user did', () => {
    expect(BLOCK_CODE).toContain('text-destructive');
    const destructiveAt = BLOCK_CODE.indexOf('text-destructive');
    expect(BLOCK_CODE.slice(destructiveAt - 400, destructiveAt)).toContain("save_failed");
  });

  it('uses no alert role and no assertive live region anywhere', () => {
    expect(BLOCK_CODE).not.toContain('role="alert"');
    expect(BLOCK_CODE).not.toContain('assertive');
    // Announced once, politely, from a region that is always mounted — one created in the same
    // commit as its first message is not reliably announced.
    expect(BLOCK_CODE).toContain('role="status" aria-live="polite"');
  });

  it('gives every result a distinct accessible name', () => {
    // Five buttons all reading "Add" is the exact defect `ux-import-review-screen.md` §1.7 found on
    // the sibling surface, and a chain returns five rows with one name where the address is the
    // whole difference.
    expect(BLOCK_CODE).toContain('aria-label={`${result.name}, ${result.address}`}');
  });

  it('has a reduced-motion equivalent for the pending state rather than nothing', () => {
    // Suppressing the spinner alone would leave a reduced-motion user with no pending indicator.
    // The label carries it instead.
    expect(BLOCK_CODE).toContain('motion-reduce:hidden');
    expect(BLOCK_CODE).toContain('SUBMIT_PENDING');
  });
});

describe('the copy and the markup obey the screen’s rules', () => {
  it('uses the spec’s strings, as constants rather than inline literals', () => {
    for (const string of [
      'Know where this one is? Add it by name.',
      'Search for a place',
      'Search →',
      'Searching…',
      'You’re offline. Check your connection and try again.',
      'Search isn’t working right now. Try again in a moment.',
      'Try a different name.',
      'Add to my map →',
      'Adding…',
      'We’ll link it to this TikTok.',
      'Back to results',
      'Search everywhere instead',
    ]) {
      expect(BLOCK_CODE, string).toContain(string);
    }
  });

  it('scopes the search only to a city the caption named, never to the map’s viewport', () => {
    // "Where you happen to be looking" is not something the user said, and it would silently
    // narrow away a Lisbon restaurant typed while looking at Tel Aviv. The chip is visible and
    // removable, and its remove control says what it does rather than being a bare ✕.
    expect(BLOCK_CODE).not.toContain('viewport');
    expect(BLOCK_CODE).not.toContain('bounds');
    expect(BLOCK_CODE).toContain('aria-label={REMOVE_SCOPE}');
    expect(ROUTE_CODE).toContain('cityHint,');
  });

  it('carries no hard-coded colour, no arbitrary value and no directional utility', () => {
    expect(BLOCK_CODE).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect([...BLOCK_CODE.matchAll(/\b[a-z-]+-\[[^\]]+\]/g)].map((m) => m[0])).toEqual([]);
    // `text-start`, not `text-left`: an RTL result must not be laid out by a left/right utility.
    expect(BLOCK_CODE).not.toMatch(/\b(text-left|text-right|[pm][lr]-\d)/);
    expect(BLOCK_CODE).toContain('text-start');
  });
});

describe('the route keeps its own end of the bargain', () => {
  it('requires a session before touching the service-role client', () => {
    const authAt = ROUTE_CODE.indexOf('if (!user) return');
    expect(authAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(ROUTE_CODE.indexOf('serviceRoleClient()'));
  });

  it('caps the list at five', () => {
    // A sixth pushes the confirm step below the fold at 375px, and a list nobody scrolls to the
    // end of is a list that made the choice for them.
    expect(ROUTE_CODE).toContain('const MAX_RESULTS = 5');
    expect(ROUTE_CODE).toContain('slice(0, MAX_RESULTS)');
  });

  it('makes exactly one resolver call per request', () => {
    // The `add` op re-resolves rather than trusting the client, and that repeat is served from
    // `place_lookups` rather than from quota — the property `manual-add.ts`'s header records.
    expect((ROUTE_CODE.match(/\.resolve\(/g) ?? []).length).toBe(1);
  });

  it('puts no query, place name or coordinate in a failure log line', () => {
    /*
     * `ports.ts`'s `Logger`: codes and scalars only (charter R9). A query is the most sensitive
     * thing on this path — it is a place someone is looking for — and it must not reach a log
     * drain.
     *
     * Scoped to the route's own failure lines rather than every `console.*` in the file: the
     * shared `routeCtx` logger forwards `{ event: name, ...fields }`, where `name` is the event's
     * name and the ban would fire on the parameter rather than on a place.
     */
    const logs = [...ROUTE_CODE.matchAll(/console\.error\(([\s\S]*?)\n\s*\);/g)].map((m) => m[1]!);
    expect(logs).toHaveLength(2);
    for (const line of logs) {
      for (const banned of ['query', 'chosen', 'place.name', 'lat', 'lng', 'caption', 'expectedName']) {
        expect(line, banned).not.toContain(banned);
      }
      // What they do carry: an event code and a `DomainErrorCode`.
      expect(line).toContain("event: 'import.place_search'");
    }
  });
});
