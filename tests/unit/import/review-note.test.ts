/**
 * R1-4 — the review screen is the one moment the user knows *why* they are saving, and it had
 * nowhere to write it down.
 *
 * The plumbing was finished and the last two inches were missing. `ConfirmImportRequestSchema` has
 * always taken `items: [{ candidateIndex, note }]`, and `domain/import/confirm.ts` calls that field
 * *"the only field in this request the user authors"* — while the client hardcoded `note: null` and
 * the screen rendered no input. The word "note" appeared on that surface exactly once, in a comment
 * describing the field it did not fill.
 *
 * **The defect these guards exist to catch is "renders but does not persist."** A note the user can
 * type and the request then drops is the original bug wearing a textarea, and it is invisible in a
 * screenshot. So the first block below sends a real request through `saveExtractedCandidates` with
 * a stubbed `fetch` and reads the body — the one assertion here that is about behaviour rather than
 * about source text.
 *
 * The rest are source guards, which is the instrument this directory already uses for its screens
 * (there is no DOM renderer in this suite). Each one pins a decision that a later edit could undo
 * without breaking anything visible: the field stays a disclosure, the note keeps its own rule
 * rather than a second copy of the limit, and the deselect ruling stays written on the card.
 */
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmImportRequestSchema } from '@/domain/import/confirm';
import { NOTE_MAX_LENGTH } from '@/domain/places/note';
import { saveExtractedCandidates } from '@/app/import/_lib/save-extracted-candidates';

const CARD_PATH = 'src/app/import/screens/review/candidate-card.tsx';
const SCREEN_PATH = 'src/app/import/screens/review/review-screen.tsx';
const REQUEST_PATH = 'src/app/import/_lib/save-extracted-candidates.ts';

/** Source with comments removed — this codebase documents the copy it replaced, and a guard that
 *  fired on its own explanation would teach people to delete it. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The confirm body that one `saveExtractedCandidates` call actually put on the wire. */
async function confirmBody(picks: Parameters<typeof saveExtractedCandidates>[0]): Promise<unknown> {
  let sent: unknown;
  vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body);
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          results: picks.map((p) => ({
            status: 'saved',
            candidateIndex: p.candidateIndex,
            savedPlaceId: '11111111-1111-4111-8111-111111111111',
          })),
        }),
    });
  });
  await saveExtractedCandidates(picks, '22222222-2222-4222-8222-222222222222');
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the note the user typed is the note the request carries', () => {
  it('puts it on the wire, per candidate, and the server schema accepts it', async () => {
    // The measured defect, restated as a test: this used to be `note: null` for every item no
    // matter what, on a schema that had accepted the field since the day it was written.
    const body = await confirmBody([
      { candidateIndex: 0, optionIndex: null, note: 'get the pistachio croissant, before 10' },
      { candidateIndex: 2, optionIndex: 1, note: null },
    ]);

    const parsed = ConfirmImportRequestSchema.parse(body);
    expect(parsed.items).toEqual([
      { candidateIndex: 0, optionIndex: null, note: 'get the pistachio croissant, before 10' },
      { candidateIndex: 2, optionIndex: 1, note: null },
    ]);
  });

  it('still sends `null` when nothing was written, rather than an empty string', async () => {
    // `saved_places.note` is nullable and `Spot.note` is `undefined` when absent, so `''` would be
    // a second representation of "no note" — the state `domain/places/note.ts` exists to prevent.
    const body = await confirmBody([{ candidateIndex: 0, optionIndex: null, note: null }]);
    expect(ConfirmImportRequestSchema.parse(body).items[0]?.note).toBeNull();
  });

  it('no longer hardcodes the field away', () => {
    // The literal that was the whole bug. Comments stripped, so the header explaining it does not
    // keep this passing after a regression.
    expect(code(REQUEST_PATH)).not.toContain('note: null');
    expect(code(REQUEST_PATH)).toContain('readonly note: string | null;');
  });
});

describe('the screen normalises through the one note rule, not a second copy of it', () => {
  const screen = code(SCREEN_PATH);

  it('uses `validateNote` rather than restating the limit', () => {
    expect(screen).toContain("from '@/domain/places/note'");
    expect(screen).toContain('validateNote(raw)');
    // The number itself may only arrive as the imported constant. A `2000` typed into this screen
    // is how the UI and the database start disagreeing about what fits.
    expect(screen).not.toMatch(/\b2000\b/);
  });

  it('sends the normalised note rather than the raw draft', () => {
    expect(screen).toContain('note: confirmedNote(notes.get(candidateIndex) ?? \'\')');
  });
});

describe('the field is a disclosure, because this screen has no room for a stack of textareas', () => {
  const card = code(CARD_PATH);

  it('keeps the note closed until asked for', () => {
    // `ui-review-2026-08-31.md` finding 11 already names this the least responsive surface in the
    // product. An always-open field per candidate would make the worst screen worse.
    expect(card).toContain('const [noteOpen, setNoteOpen] = useState(false);');
    const opened = card.indexOf('{noteOpen ? (');
    const textarea = card.indexOf('<textarea');
    const closed = card.indexOf(') : (', opened);
    expect(opened, 'the open branch').toBeGreaterThan(-1);
    expect(textarea, 'the textarea inside it').toBeGreaterThan(opened);
    expect(textarea, 'and not after the branch closes').toBeLessThan(closed);
  });

  it('rides the named beats rather than inventing timings', () => {
    // `src/lib/interaction.ts` is the vocabulary; a bracketed duration is the bypass its own K5
    // note says the scale cannot see. The reduced-motion half is carried by those constants:
    // `ENTER_REVEAL`'s opacity arm is deliberately unprefixed, so the panel fades for everyone and
    // travels for nobody who asked it not to.
    expect(card).toContain("from '@/lib/interaction'");
    for (const beat of ['REVEAL_BEAT', 'LEAVE_REVEAL', 'ENTER_REVEAL', 'TINT_BEAT']) {
      expect(card, beat).toContain(beat);
    }
    expect(card).not.toMatch(/duration-\[/);
  });

  it('caps the field at the database’s own limit instead of validating after the fact', () => {
    expect(card).toContain('maxLength={NOTE_MAX_LENGTH}');
    expect(NOTE_MAX_LENGTH).toBe(2000);
  });

  it('does not zoom an iPhone on focus', () => {
    // iOS Safari zooms the viewport for any field under 16px. `text-base` up to `md`, the same
    // shape the place sheet's editor uses.
    expect(card).toMatch(/<textarea[\s\S]{0,2000}?text-base[\s\S]{0,400}?md:text-sm/);
  });
});

describe('the note and the tickbox do not fight', () => {
  const card = code(CARD_PATH);
  const screen = code(SCREEN_PATH);

  it('ticks the place on the first character, and only then', () => {
    // Same rule `pick()` already applies to choosing a shortlist entry: an authored decision about
    // a card that left it unticked would be silently discarded at Save. Bounded to the empty →
    // non-empty transition, so a user who deliberately unticks an annotated card can keep editing
    // without the tick springing back.
    expect(screen).toContain("const wasEmpty = (notes.get(candidateIndex) ?? '').trim() === '';");
    expect(screen).toContain("if (wasEmpty && value.trim() !== '') {");
  });

  it('never clears what was written when the place is unticked', () => {
    // `toggle` is the only thing that changes selection by hand, and it may not touch `notes`.
    const toggle = screen.slice(screen.indexOf('function toggle(index: number)'));
    expect(toggle.slice(0, toggle.indexOf('\n  }'))).not.toContain('setNotes');
  });

  it('says so on the card, instead of leaving it to be discovered at Save', () => {
    expect(card).toContain('Select this place to save your note.');
    expect(card).toContain("{!selected && noteText !== '' && (");
  });
});

describe('the copy obeys the vocabulary', () => {
  const card = readFileSync(CARD_PATH, 'utf8');

  it('calls it a note, never a comment, a description or a memo', () => {
    // `voice-and-vocabulary.md` §3: "A note is the user's own sentence about a place."
    expect(card).toContain('Add a note');
    expect(card).toContain('Your note');
    for (const banned of ['Comment', 'Description', 'Memo']) {
      expect(card, banned).not.toContain(`>${banned}`);
      expect(card, banned).not.toContain(`'${banned}`);
    }
  });
});
