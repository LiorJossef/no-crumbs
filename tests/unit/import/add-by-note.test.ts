/**
 * E2-T2-UI — the recall field on the no-places screen, and the four things about it that a
 * screenshot cannot show.
 *
 * It exists because `docs/evidence/extraction/note-extractor-2026-09-01.md` measured a channel
 * nothing else in the design has: a sentence from the person who watched the video, read by a call
 * of its own. Posts yielding a candidate went 1 of 5 to 3 of 5, with nothing invented on either
 * control — and one of the three is `@emshelx`, which the evidence base filed `futile` because the
 * creator withholds the name in the caption *and* in the audio.
 *
 * What is guarded here, and why each one is a guard rather than a comment:
 *
 *  1. **§11.7 is amended, not broken.** That criterion banned any gesture that re-runs the same
 *     URL, and this control re-runs it. The rule it protects — *no read on inputs that have not
 *     changed* — is enforced by a disabled submit, and if that enforcement is ever deleted the ban
 *     is silently gone with it. Asserted in both directions.
 *  2. **One read per submit.** The route spends a model call against a hard daily ceiling. Type-
 *     ahead, a debounce, a submit on blur, or a second submit landing while one is in flight would
 *     each turn one recovery into several calls.
 *  3. **The copy names the act, never the object.** `note` is already the review screen's word for
 *     a *different* thing two steps down this same flow (`Add a note` / `Your note`, kept on the
 *     saved place forever). One word, two meanings, two screens apart is what
 *     `voice-and-vocabulary.md` §3 exists to stop.
 *  4. **It is one line, and it stays one line.** `ux-architecture` §5.1 forbids a field for post
 *     text on this screen *"or behind any disclosure on it"*, and the ban is on the shape as much
 *     as the content.
 *
 * Source guards, which is the instrument this directory already uses for its screens — there is no
 * DOM renderer in this suite. The behaviour was driven in a browser instead, at 390×844 and
 * 1440×900, and what that measured is recorded in `spec-no-places-found.md` §4.5.3 and §6.9.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const BLOCK = readFileSync('src/app/import/screens/add-by-note.tsx', 'utf8');
const SCREEN = readFileSync('src/app/import/screens/no-places-screen.tsx', 'utf8');
const RUN = readFileSync('src/app/import/_lib/use-import-run.ts', 'utf8');
const SPEC = readFileSync('docs/spec-no-places-found.md', 'utf8');

/** Source with comments removed — this codebase documents the copy and the rules it replaced, and a
 *  guard that fired on its own explanation would teach people to delete the explanation. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const BLOCK_CODE = code(BLOCK);
const RUN_CODE = code(RUN);

/** Only what a person can read: the string table at the top of the file, plus every JSX text node. */
const RENDERED = [
  BLOCK_CODE.slice(BLOCK_CODE.indexOf('const OFFER ='), BLOCK_CODE.indexOf('const MAX_LENGTH')),
  ...[...BLOCK_CODE.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]!.trim()),
].join('\n');

describe('§11.7 is amended rather than broken', () => {
  it('refuses to re-read a sentence it has already read', () => {
    /*
     * The whole basis on which this control is allowed to exist. §11.7 banned "no button, link, or
     * gesture re-runs the same URL"; §6.9.1 replaces that with the rule it was protecting — no
     * affordance may re-run a read whose *inputs* have not changed — and this is where the
     * replacement is enforced rather than asserted.
     *
     * Delete these two lines and the screen offers exactly the loop §1 calls the flow's worst: press
     * the same button twice, get the same nothing twice.
     */
    expect(BLOCK_CODE).toContain("const alreadyRead = phase.kind === 'settled' && phase.read === typed;");
    expect(BLOCK_CODE).toContain("if (typed === '' || inFlight.current || alreadyRead) return;");
    expect(BLOCK_CODE).toContain("disabled={pending || typed === '' || alreadyRead}");
  });

  it('records the sentence it read, so "unchanged" is a fact rather than a guess', () => {
    // `read` is only non-empty on the outcome that actually consumed a sentence. A failure or an
    // offline submit stores `''`, because neither of those was a read of anything and re-submitting
    // after one is not a retry of an unchanged input.
    expect(BLOCK_CODE).toContain("setPhase({ kind: 'settled', message: NOTHING, read: typed })");
    expect(BLOCK_CODE).toContain("setPhase({ kind: 'settled', message: UNAVAILABLE, read: '' })");
    expect(BLOCK_CODE).toContain("setPhase({ kind: 'settled', message: OFFLINE, read: '' })");
  });

  it('is amended in the document too, with the old wording struck rather than deleted', () => {
    // A spec that does not move disagrees with the code from the first commit, and a criterion
    // quietly rewritten loses the record of what was decided. §11.7 keeps both.
    expect(SPEC).toContain('**Amended 2026-09-01 (§6.9.1):** no button, link or gesture re-runs a read whose **inputs');
    expect(SPEC).toContain('~~No button, link, or gesture re-runs the same\n   URL.~~');
  });
});

describe('one read per submit, and never any other way', () => {
  it('issues nothing itself — the read is the hook’s, called from the submit handler alone', () => {
    // No `fetch` in this file at all: the request lives in `use-import-run.ts`, where the abort
    // controller and the screen-ownership gate are. No type-ahead, no debounce, no submit on
    // keystroke, blur or paste.
    expect(BLOCK_CODE).not.toContain('fetch(');
    expect(BLOCK_CODE).not.toContain('useEffect');
    expect(BLOCK_CODE).not.toContain('setTimeout');
    expect(BLOCK_CODE).not.toContain('onBlur');
    expect(BLOCK_CODE).not.toContain('onPaste');
    expect((BLOCK_CODE.match(/onRead\(/g) ?? []).length).toBe(1);
  });

  it('refuses a second submit while one is in flight, rather than queueing or restarting it', () => {
    // A ref set synchronously before the first `await`, so a burst dispatched inside one task finds
    // it held — `inFlightProbe`'s shape, for `inFlightProbe`'s reason.
    expect(BLOCK_CODE).toContain('const inFlight = useRef(false)');
    expect(BLOCK_CODE).toContain('inFlight.current = true');
    expect(BLOCK_CODE).toContain('inFlight.current = false');
  });

  it('is guarded a second time in the hook, by the ref the ✕ already aborts', () => {
    const fn = RUN_CODE.slice(
      RUN_CODE.indexOf('async function submitNote('),
      RUN_CODE.indexOf('function submitSeed('),
    );
    expect(fn).toContain("if (inFlightProbe.current !== null) return 'abandoned';");
    expect(fn).toContain('const stillCurrent = () => inFlightProbe.current === probe;');
    // Offline is checked before the request is issued, so an offline submit costs nothing.
    expect(fn.indexOf('navigator.onLine === false')).toBeLessThan(fn.indexOf('await fetch('));
    // One round trip. The post is already on screen; re-fetching it would be a second call to
    // TikTok for something in hand.
    expect((fn.match(/fetch\(/g) ?? []).length).toBe(1);
    expect(fn).not.toContain('source-preview');
  });

  it('sends the link and the sentence, and nothing else', () => {
    const fn = RUN_CODE.slice(
      RUN_CODE.indexOf('async function submitNote('),
      RUN_CODE.indexOf('function submitSeed('),
    );
    expect(fn).toContain('JSON.stringify({ url, note: text })');
  });
});

describe('what happens to the screen, and what deliberately does not', () => {
  it('moves to the review beat only when the read produced candidates', () => {
    const fn = RUN_CODE.slice(
      RUN_CODE.indexOf('async function submitNote('),
      RUN_CODE.indexOf('function submitSeed('),
    );
    expect(fn).toContain("if (body.candidates.length === 0) return 'nothing';");
    expect(fn).toContain("setScreen({ kind: 'caption_preview', probe: body });");
    // And it is the *only* `setScreen` in the function. Re-setting `no_places` on a read that found
    // nothing would remount the screen and take the person's sentence, the caption's open state and
    // the message with it — a screen resetting itself under someone who just typed into it.
    expect((fn.match(/setScreen\(/g) ?? []).length).toBe(1);
  });

  it('shows no rail for the second read', () => {
    // The post is read and the caption is read; the only open question is whether the new sentence
    // names somewhere. A progress rail over a cached read is theatre, and `facelift-plan.md` §5
    // forbids a stage claim the server did not send.
    const fn = RUN_CODE.slice(
      RUN_CODE.indexOf('async function submitNote('),
      RUN_CODE.indexOf('function submitSeed('),
    );
    expect(fn).not.toContain("kind: 'rail'");
    expect(fn).not.toContain('RAIL_IDLE');
  });

  it('collapses the caption on submit, exactly as the sibling search does', () => {
    // §6.5, applied unchanged: on reveal the caption stays open because the person may still be
    // reading it; on submit it has done its job.
    expect(BLOCK_CODE).toContain('onSubmitted();');
    expect(code(SCREEN)).toContain('<AddByNote className="pt-1" onRead={onReadNote} onSubmitted={() => setCaptionOpen(false)} />');
  });

  it('sits under the name search rather than over it', () => {
    // Ordered by strength of outcome (§4.5.1): a person who has the name outright gets an exact
    // provider result with no model in the path, and nothing about this field improves that path.
    const screen = code(SCREEN);
    expect(screen.indexOf('<AddByName')).toBeLessThan(screen.indexOf('<AddByNote'));
  });
});

describe('the copy names the act and never the object', () => {
  it('never says "note", because the review screen already means something else by it', () => {
    /*
     * `voice-and-vocabulary.md` §3 ratifies **note** as "the user's own sentence about a place", and
     * `review/candidate-card.tsx` spends it two steps down this same flow on `Add a note` / `Your
     * note` — a note kept on the saved place forever. This one is read once and discarded. One word,
     * two meanings, two screens apart is the drift §3's one-word-per-thing rule exists to stop.
     *
     * The *wire* field is still `note`, because that is what the route calls it; a wire name is not
     * a string, which is why this reads `RENDERED` and not the whole file.
     */
    expect(RENDERED.toLowerCase()).not.toContain('note');
    expect(RENDERED.toLowerCase()).not.toContain('comment');
    expect(RENDERED.toLowerCase()).not.toContain('description');
  });

  it('quotes §5.5 verbatim, and composes no sentence at a call site', () => {
    for (const line of [
      'Tell us what you saw, in your own words.',
      'The bakery is called Pita Lila',
      'Read it →',
      'Reading…',
      'We read that too, and it doesn’t name a place either.',
      'Reading isn’t working right now. Try again in a moment.',
      'You’re offline. Check your connection and try again.',
    ]) {
      expect(BLOCK_CODE, line).toContain(line);
      expect(SPEC, line).toContain(line);
    }
  });

  it('says nothing that reads as a failure or as an apology', () => {
    // §11.6's four words. `Couldn't` is permitted only on a real failure of an action the user took,
    // and nothing here is one: a sentence that named no place is a result.
    for (const banned of ['error', 'sorry', 'oops', 'failed', 'couldn’t', "couldn't"]) {
      expect(RENDERED.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
  });

  it('names none of our machinery', () => {
    // `voice-and-vocabulary.md` §4's banned list, and `reading` is the ratified word for what this
    // does — never *fetching*, *processing*, *analysing* or *extracting*.
    for (const banned of ['extract', 'parse', 'model', ' AI ', 'LLM', 'confidence', 'metadata', 'pipeline']) {
      expect(RENDERED.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
    expect(RENDERED).toContain('Reading…');
  });

  it('shows no number, percentage or count anywhere, including in an aria-label', () => {
    // §11.8, inherited from the screen this block lives on. The only digits permitted are the
    // route's own character bound, which is a `maxLength` rather than a string.
    const strings = [...BLOCK_CODE.matchAll(/'([^']{4,})'/g)].map((m) => m[1]!);
    for (const string of strings) {
      if (string.includes('-') || string.startsWith('@/') || string.startsWith('./')) continue;
      expect(string, string).not.toMatch(/\d|%|confiden|hit rate|discard/i);
    }
  });
});

describe('one line, and it stays one line', () => {
  it('is an input rather than a textarea, at every breakpoint', () => {
    // `ux-architecture` §5.1 forbids a field for post text on this screen "or behind any disclosure
    // on it", and the ban is on the shape as much as the content: a multi-line box is an invitation
    // to paste the post's own words back at us, which is the premise failure.
    expect(BLOCK_CODE).not.toContain('textarea');
    expect(BLOCK_CODE).not.toContain('Textarea');
    expect(BLOCK_CODE).toContain('type="text"');
    expect(BLOCK_CODE).toContain('maxLength={MAX_LENGTH}');
    expect(BLOCK_CODE).toContain('const MAX_LENGTH = 500;');
  });

  it('invites the person’s own words and never the post’s', () => {
    for (const banned of ['paste', 'caption text', 'copy the', 'the text of']) {
      expect(RENDERED.toLowerCase(), banned).not.toContain(banned);
    }
  });

  it('bounds the sentence at the same number the route does', () => {
    const route = readFileSync('src/app/api/imports/probe/route.ts', 'utf8');
    expect(route).toContain('.trim().slice(0, 500)');
  });
});

describe('the disclosure, the keyboard and RTL', () => {
  it('is closed on arrival and opens on a deliberate tap', () => {
    expect(BLOCK_CODE).toContain("useState<Phase>({ kind: 'closed' })");
    expect(BLOCK_CODE).toContain('aria-expanded={open}');
    expect(BLOCK_CODE).toContain('aria-controls={panelId}');
  });

  it('takes focus on reveal, which is the opposite of §6.3’s ban rather than an exception to it', () => {
    /*
     * §6.3 bans the *search* field autofocusing **on arrival**, because three in four imports land
     * here and nobody asked for a keyboard. Opening this disclosure is a deliberate tap.
     *
     * `autoFocus` on a field that mounts inside the tap's own update, rather than a ref and a
     * deferred `.focus()`: iOS raises no software keyboard for a programmatic focus outside the
     * gesture, so the deferred form moves the caret and leaves the keyboard shut — the worst of
     * both.
     */
    expect(BLOCK_CODE).toContain('autoFocus');
    expect(BLOCK_CODE).not.toContain('requestAnimationFrame');
  });

  it('renders a Hebrew sentence in its own direction', () => {
    // Tel Aviv is a target city and this is free prose. Measured in a browser: `direction: rtl` with
    // Hebrew in the field. Verified at 390×844.
    expect(BLOCK_CODE).toContain('dir="auto"');
  });

  it('uses no bare directional utility and no faded muted text', () => {
    // §11.21 and §8.3, inherited from the screen. An RTL sentence must not be laid out by a
    // left/right utility.
    expect(BLOCK_CODE).not.toContain('text-muted-foreground/70');
    expect(BLOCK_CODE).not.toMatch(/\b(text-left|text-right|[pm][lr]-\d)/);
  });

  it('carries no hard-coded colour and no arbitrary Tailwind value', () => {
    expect(BLOCK_CODE).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect([...BLOCK_CODE.matchAll(/\b[a-z-]+-\[[^\]]+\]/g)].map((m) => m[0])).toEqual([]);
  });

  it('announces its outcome from a region that was already mounted', () => {
    // A live region created in the same commit as its first message is not reliably announced —
    // the pattern the sibling already uses. Polite, never `alert`: a sentence that named no place
    // is a result, not a failure.
    expect(BLOCK_CODE).toContain('role="status" aria-live="polite" className="sr-only"');
    expect(BLOCK_CODE).not.toContain('role="alert"');
    expect(BLOCK_CODE).not.toContain('aria-live="assertive"');
  });

  it('keeps the pending label beside a spinner that is hidden rather than frozen', () => {
    // A stationary three-quarter arc reads as a rendering artefact, not a paused spinner. Hiding it
    // is only honest because `Reading…` never leaves. Measured with `prefers-reduced-motion:
    // reduce`: the label reads `Reading…` and no spinner node renders at all.
    expect(BLOCK_CODE).toContain('hidden size-4 motion-safe:block motion-safe:animate-spin');
    expect(BLOCK_CODE).toContain('{pending ? SUBMIT_PENDING : SUBMIT}');
  });
});
