/**
 * W6-5 — the no-places screen, rebuilt to `docs/spec-no-places-found.md`.
 *
 * ~73% of imports land here. It is a **success state, never an error**, and until now it showed the
 * user nothing: not the post they had just pasted, not the caption we had just read and were making
 * a claim about. So the screen asserted "it doesn't name a place" and gave them no way to check.
 *
 * The spec is authoritative and its strings do not change, so most of this file is the spec's own
 * acceptance criteria turned into assertions that do not need a browser: the three honest cases and
 * their exact copy (§5.1), the honesty bans (§11.6-9), the RTL rules (§11.21) and the things §4.4
 * says are deliberately not on the screen.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SCREEN = readFileSync('src/app/import/screens/no-places-screen.tsx', 'utf8');
const ROUTE = readFileSync('src/app/api/imports/probe/route.ts', 'utf8');

/** The screen's code, with the reasoning comments stripped — those quote what it used to say, and
 *  a ban that fired on its own explanation would teach people to delete the explanation. */
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Only what a user can actually read: the copy table, plus every JSX text node.
 *
 * The spec's honesty bans are about words **on screen**, so they have to be checked against the
 * words on screen. Run over the whole file they fire on `IMPORT_ERROR_ACTION_LABEL` — an identifier
 * containing "ERROR", imported precisely so the two exit labels cannot drift from the identical
 * actions on the failure screens. That is the guard punishing the right thing being done.
 */
const RENDERED = [
  CODE.slice(CODE.indexOf('function copyFor('), CODE.indexOf('export function NoPlacesScreen')),
  // Text between tags, excluding anything inside `{…}` — that is an expression, not a string.
  ...[...CODE.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]!.trim()),
].join('\n');

describe('the three honest cases, verbatim from the spec', () => {
  it('A — no caption at all', () => {
    expect(CODE).toContain("kicker: 'No caption'");
    expect(CODE).toContain("headline: 'This one has no caption.'");
    expect(CODE).toContain(
      'We opened it fine — there’s just no caption to read. Some TikToks only show the place on screen.',
    );
  });

  it('B — the caption named nothing, and it is the floor for anything unknown', () => {
    expect(CODE).toContain("headline: 'No places in this one.'");
    expect(CODE).toContain(
      'We read the caption, and it doesn’t name a place we can put on a map. Some TikToks only show the place on screen.',
    );
    // A `null`/unrecognised reason falls through to B rather than throwing or blanking: a server
    // that predates the field and a cache hit both land there, and "we do not know so we do not
    // claim" is the honest floor.
    expect(CODE).toContain('emptyReason ?? null');
  });

  it('C — an area but no venue, with the city inside `<bdi>`', () => {
    expect(CODE).toContain('We read the caption. It points at');
    expect(CODE).toContain('but doesn’t name the place itself.');
    // It can be Hebrew sitting between English chrome, and the surrounding punctuation would
    // otherwise flip it.
    expect(CODE).toMatch(/<bdi>\{cityHint\}<\/bdi>/);
    // C only fires when there is a city to name — otherwise it would be case B wearing C's words.
    expect(CODE).toContain("emptyReason === 'area_only' && cityHint !== null");
  });

  it('deletes the sentence that edged toward defending the hit rate', () => {
    // `That happens a lot.` shipped alongside `Some TikToks only show the place on screen.` Two
    // normalising sentences is one too many, and the second is the one the owner ruling forbids.
    expect(CODE).not.toContain('That happens a lot');
  });
});

describe('the server derives the case, and sends a conclusion rather than its working', () => {
  it('derives `emptyReason` in the order the spec gives', () => {
    expect(ROUTE).toContain("? 'no_caption'");
    expect(ROUTE).toContain("? 'area_only'");
    expect(ROUTE).toContain("'nothing_named'");
    expect(ROUTE).toContain('caption === null');
    expect(ROUTE).toContain('droppedAreaOnly > 0 && extractionCityHint !== null');
  });

  it('never puts the drop counts on the wire', () => {
    // `PlausibilityResult.dropped` is count-only for logs (`07` §7.1). The response carries one
    // enum. It is the same discipline as "the browser may never send a place fact", in the other
    // direction — and the counts are a measure of our own filter, not a fact about the user's post.
    const responseStart = ROUTE.lastIndexOf('return NextResponse.json({');
    const response = ROUTE.slice(responseStart, ROUTE.indexOf('  } catch (e) {', responseStart));
    expect(response).not.toContain('dropped');
    expect(response).toContain('emptyReason');
    expect(response).toContain('cityHint: extractionCityHint');
  });

  it('does not re-run the filter to reconstruct the case on a cache hit', () => {
    // `filterPlausible` runs in the non-cached branch only, so a cache hit is always
    // `nothing_named`. Reconstructing it would change what the user sees between two identical
    // imports, which is worse than the coarser answer.
    expect((ROUTE.match(/filterPlausible\(/g) ?? []).length).toBe(1);
  });

  it('is derived on the screen from the enum, never re-derived from the candidates', () => {
    expect(CODE).not.toContain('filterPlausible');
    expect(CODE).not.toContain('candidates');
  });
});

describe('the honesty bans (§11.6-9)', () => {
  it('says nothing that reads as a failure', () => {
    // The word "error" appears nowhere, and neither do "sorry", "oops", "failed" or "couldn't" —
    // there is no failure here, and there is no action of the user's that did not work.
    for (const banned of ['error', 'sorry', 'oops', 'failed', 'couldn’t', "couldn't"]) {
      expect(RENDERED.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
  });

  it('offers no way to re-run the same link', () => {
    // §11.7. Re-reading a caption we have already read produces this same screen, and offering it
    // would make the flow's worst loop the easiest thing on screen. `Try another TikTok` clears
    // the link rather than keeping it, which is the opposite of Cancel's rule and deliberately so.
    expect(RENDERED.toLowerCase()).not.toContain('retry');
    expect(RENDERED.toLowerCase()).not.toContain('try again');
    // And no mechanism for it either: nothing here can reach `submit`, and the forward action is
    // read from the shared label map rather than being a second literal.
    expect(CODE).not.toContain('submit');
    expect(CODE).toContain('IMPORT_ERROR_ACTION_LABEL.another_tiktok');
  });

  it('shows no number, percentage, band or count anywhere, including in an aria-label', () => {
    // §11.8. Nothing about our confidence, our hit rate, or how many candidates were discarded.
    // The only digits permitted are Tailwind's own sizes.
    const strings = [...CODE.matchAll(/'([^']{4,})'/g)].map((m) => m[1]!);
    for (const string of strings) {
      if (string.includes('-') || string.startsWith('@/') || string.startsWith('../')) continue;
      expect(string, string).not.toMatch(/\d|%|confiden|hit rate|discard/i);
    }
  });

  it('does not use the shell’s failure live region, or an alert role', () => {
    // §8.2. Announcing this as news of a failure would be precisely the lie the screen exists to
    // avoid. The arrival is announced by the focus move onto the H1 instead.
    expect(CODE).not.toContain('role="alert"');
    expect(CODE).not.toContain('aria-live');
    expect(CODE).toContain('tabIndex={-1}');
    expect(CODE).toContain('aria-describedby={bodyId}');
    expect(CODE).toContain('headingRef.current?.focus()');
  });
});

describe('the post and its caption are on screen', () => {
  it('shows the post, with a thumbnail slot that never collapses', () => {
    // The row must not change shape when the image is absent — backlog §2.19 may yet drop or proxy
    // the hotlinked CDN URL, and a layout that depends on the image existing would break with it.
    expect(CODE).toContain('probe.thumbnailUrl ? (');
    expect(CODE).toContain('size-12 shrink-0');
    expect(CODE).toContain('referrerPolicy="no-referrer"');
  });

  it('names the post through the spec’s fallback chain, and links it exactly once', () => {
    expect(CODE).toContain('`@${probe.authorHandle}’s TikTok`');
    expect(CODE).toContain('`${probe.authorName}’s TikTok`');
    expect(CODE).toContain("'This TikTok'");
    // §4.3: one affordance per action. `Open the original TikTok` is not repeated in the footer,
    // which closes one instance of the four-labels-for-one-action defect.
    expect((CODE.match(/href=\{probe\.canonicalUrl\}/g) ?? []).length).toBe(1);
    expect(CODE).not.toContain('Open the original TikTok');
  });

  it('expands the caption by default and never persists that', () => {
    // The inverse of the review screen's ruling, for the reason that inverts with it: there the
    // candidates are the content; here there are none, so the caption is the only content there is.
    expect(CODE).toContain('useState(true)');
  });

  it('caps the caption so it can never push the actions off the bottom', () => {
    expect(CODE).toContain('max-h-38');
    expect(CODE).toContain('overflow-y-auto');
    expect(CODE).toContain('overscroll-contain');
  });

  it('renders no caption panel at all in case A', () => {
    // Not an empty box and not a placeholder: the layout closes up.
    expect(CODE).toContain('probe.caption !== null && captionOpen');
  });

  it('makes the caption panel reachable by keyboard', () => {
    // A scrollable region no keyboard user can reach is a WCAG 2.1.1 failure, and one extra tab
    // stop is the correct price.
    expect(CODE).toContain('tabIndex={0}');
    expect(CODE).toContain('role="group"');
    expect(CODE).toContain('aria-label="The TikTok’s caption"');
  });
});

describe('what is deliberately not on this screen (§4.4)', () => {
  it('has no illustration, mascot, badge, pill or wrapping card', () => {
    for (const banned of ['rounded-full px-', 'Sparkles', 'Illustration', 'mascot']) {
      expect(CODE, banned).not.toContain(banned);
    }
  });

  it('uses no faded muted text and no bare directional utilities', () => {
    // §8.3 rules `text-muted-foreground/70` below the bar. §11.21: an RTL caption or place name
    // must not be laid out by a left/right utility.
    expect(CODE).not.toContain('text-muted-foreground/70');
    expect(CODE).not.toMatch(/\b(text-left|text-right|[pm][lr]-\d)/);
  });

  it('carries no hard-coded colour and no arbitrary Tailwind value but the tracking', () => {
    expect(CODE).not.toMatch(/#[0-9A-Fa-f]{6}/);
    const brackets = [...CODE.matchAll(/\b[a-z-]+-\[[^\]]+\]/g)].map((m) => m[0]);
    // No tracking scale is registered; everything else is a named token.
    expect(brackets).toEqual(['tracking-[0.14em]']);
  });
});

describe('both ways out, and both point somewhere that works', () => {
  it('clears the link on `Try another TikTok`', () => {
    // A change from `Cancel`, deliberately. Cancel says nothing about the link being wrong so it
    // keeps it; this says the opposite — we read it, there is nothing in it — and a paste screen
    // pre-loaded with a link that produces this same screen again is the flow's worst loop. The
    // call site is the shell's.
    const client = readFileSync('src/app/import/import-page-client.tsx', 'utf8');
    const block = client.slice(client.indexOf('<NoPlacesScreen'), client.indexOf('/>', client.indexOf('<NoPlacesScreen')));
    expect(block).toContain('onRetry={() => reset({ clearUrl: true })}');
  });

  it('renders a second exit, because the ✕ is out of thumb reach', () => {
    // §5.4. With no field in the footer it would otherwise hold one button, and the ✕ is a 36px
    // target in the top-left corner of an 812pt screen. This is the one place "two ways out of one
    // screen" is the right answer rather than a defect, and the reason is reach.
    expect(CODE).toContain('IMPORT_ERROR_ACTION_LABEL.back_to_map');
    expect(CODE).toContain('onClick={onBackToMap}');
  });

  it('shows the manual-add primary only where its destination exists', () => {
    // A recovery only ever points somewhere that works. `null` is not a degradation to hide but
    // the honest state of a surface with no manual add to reach.
    expect(CODE).toContain('{onAddManually && (');
    expect(CODE).toContain("variant={onAddManually ? 'outline' : 'default'}");
    expect(CODE).toContain('onClick={onAddManually}');
  });

  it('takes the post as one object rather than three scalars pulled out of it', () => {
    // `spec-no-places-found.md` §10.1. The three-scalar shape could express none of A/B/C and
    // could not feed the caption panel; copying fields out one at a time is how this screen and
    // the review screen end up disagreeing about the post they are both describing.
    const screenUnion = readFileSync('src/app/import/_lib/screen.ts', 'utf8');
    expect(screenUnion).toContain("{ readonly kind: 'no_places'; readonly probe: ProbeSuccess }");
    expect(screenUnion).not.toContain('hadCaption');
  });
});
