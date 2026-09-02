/**
 * Lane H — the same TikTok video, added twice.
 *
 * Round-3 feedback §6.1 reported one video saved twice, "once using a caption-derived candidate and
 * once using the Google Maps-derived match". The work plan blamed a missing dedupe between two
 * candidates of one extraction. **That is not what the rows say.**
 *
 * Measured read-only on the local container (applied head `0027`) on 2026-09-02:
 *
 * ```sql
 * select s.platform_source_id, sps.user_id,
 *        count(distinct i.id) imports, count(distinct sps.saved_place_id) saved
 *   from sources s
 *   join saved_place_sources sps on sps.source_id = s.id
 *   left join imports i on i.source_id = s.id and i.user_id = sps.user_id
 *  group by 1, 2 having count(distinct sps.saved_place_id) > 1;
 * ```
 *
 * | video | imports | saved places |
 * |---|---|---|
 * | 7346702347491446049 | 16 | 18 |
 * | 7479087881743633671 | 1 | 8 |
 * | 7679186936916921622 | 1 | 3 |
 * | 7532812892819721479 | 3 | 2 |
 *
 * The 7532… pair is the reported one: **one** extraction, **one** candidate, two saved places —
 * `רגאצי` at 32.0853,34.8878 (`llm-guess`) and `רגאצי` at 32.0864,34.8583 (`google-places`,
 * `resolution_score` 0.8), written 29 s apart by two different imports. Same `name_key`, 2.7 km
 * apart, so `resolve_place`'s 75 m + `name_key` guard cannot merge them.
 *
 * The 7346… video has five `name_key` collisions outright, and they are this fixture's other half:
 * `kiaans`, `lanonnabrixton`, `thelaughingyak`, `thelifegoddess`, `tokii`.
 *
 * The names below are those rows.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALREADY_ADDED_LINE,
  alreadyAddedFromSource,
  emptyImportPriorSaveNotice,
  priorSaveKeys,
  priorSaveNotice,
  type PriorSave,
} from '@/domain/import/prior-saves';

const save = (placeName: string, label = placeName): PriorSave => ({ placeName, label });

/** The two saved places source `7532812892819721479` really holds, by name. */
const RAGATZI = [save('רגאצי')];

/** Five of the eighteen on `7346702347491446049`, the ones that collide by `name_key`. */
const LONDON = [
  save('Kiaans'),
  save('La Nonna Brixton'),
  save('The Laughing Yak'),
  save('The Life Goddess'),
  save('Tokii'),
];

describe('what is already on the map from this video', () => {
  it('catches the exact reported duplicate: one name, two providers, one video', () => {
    // The second import resolved the same caption name to Google and would have written a second
    // `רגאצי`. With the first save in hand, the card marks itself instead of arriving ticked.
    expect(alreadyAddedFromSource(priorSaveKeys(RAGATZI), 'רגאצי')).toBe(true);
  });

  it('matches through the normalisation `places.name_key` already uses, not on the raw string', () => {
    const keys = priorSaveKeys(LONDON);
    // Spacing, case and punctuation cannot distinguish two venues — `domain/places/name-key.ts`.
    expect(alreadyAddedFromSource(keys, 'the laughing yak')).toBe(true);
    expect(alreadyAddedFromSource(keys, 'LaNonna  Brixton')).toBe(true);
    expect(alreadyAddedFromSource(keys, 'Tokii!')).toBe(true);
  });

  it('says nothing about a re-spelled venue, which is the honest limit', () => {
    // `PROMPT_VERSION` moved p16 → p17 in `771d593`, invalidating every cached extraction, so a
    // re-paste re-extracts and the model can rename the venue: the real rows hold `Kiaans` beside
    // `Kiaans Tooting` 18 m apart, `MBER` beside `MBER London` 47 m apart.
    //
    // Marking those would mean inventing a new notion of sameness on a review screen, which
    // `docs/08-place-identity.md` owns and `domain/places/name-key.ts` measured and rejected
    // (`Loveat` and `Loveat tel aviv` are different branches 880 m apart). The screen-level notice
    // is what covers this case, and `priorSaveNotice` below says so in words.
    expect(alreadyAddedFromSource(priorSaveKeys(LONDON), 'Kiaans Tooting')).toBe(false);
  });

  it('never marks a card on an empty or unresolvable name', () => {
    const keys = priorSaveKeys(LONDON);
    expect(alreadyAddedFromSource(keys, null)).toBe(false);
    expect(alreadyAddedFromSource(keys, '   ')).toBe(false);
    // A prior save whose name normalises to nothing contributes no key, so it can never match
    // another such name and mark an unrelated card.
    expect(alreadyAddedFromSource(priorSaveKeys([save('!!!')]), '???')).toBe(false);
  });

  it('matches on the place’s own name, not on the user’s rename', () => {
    // Renaming a save does not un-add the place. Matching on `display_name` would make the mark
    // vanish the moment somebody personalised their row.
    const renamed = [{ placeName: 'Kiaans', label: 'lunch spot with Dana' }];
    expect(alreadyAddedFromSource(priorSaveKeys(renamed), 'Kiaans')).toBe(true);
  });
});

describe('the notice the screen leads with', () => {
  it('is absent when this video has never been added from', () => {
    expect(priorSaveNotice([], 0)).toBeNull();
  });

  it('names one place in the singular and points at the card', () => {
    const notice = priorSaveNotice(RAGATZI, 1);
    expect(notice).not.toBeNull();
    expect(notice!.lead).toBe('Already on your map from this TikTok video:');
    expect(notice!.names).toEqual(['רגאצי']);
    expect(notice!.more).toBeNull();
    expect(notice!.tail).toBe('It’s not selected below. Select it to add it again.');
  });

  it('counts the rest rather than printing eighteen names', () => {
    const notice = priorSaveNotice(LONDON, 5)!;
    expect(notice.lead).toBe('5 places are already on your map from this TikTok video:');
    expect(notice.names).toEqual(['Kiaans', 'La Nonna Brixton', 'The Laughing Yak']);
    expect(notice.more).toBe('and 2 more');
    expect(notice.tail).toBe('They’re not selected below. Select one to add it again.');
  });

  it('refuses to point at the list when nothing below matches', () => {
    // The re-spelling case. The screen must not say "they're not selected below" when no card is
    // marked — that sentence would send the reader looking for something that is not there.
    expect(priorSaveNotice(LONDON, 0)!.tail).toBe(
      'Nothing found this time matches those names, so check before you add.',
    );
  });

  it('prints the user’s own word for a place they renamed', () => {
    expect(priorSaveNotice([{ placeName: 'Kiaans', label: 'lunch with Dana' }], 1)!.names).toEqual([
      'lunch with Dana',
    ]);
  });
});

describe('the strings pass `docs/voice-and-vocabulary.md`', () => {
  const strings = [
    ALREADY_ADDED_LINE,
    ...[
      priorSaveNotice(RAGATZI, 1)!,
      priorSaveNotice(LONDON, 5)!,
      priorSaveNotice(LONDON, 0)!,
      emptyImportPriorSaveNotice(RAGATZI)!,
      emptyImportPriorSaveNotice(LONDON)!,
    ].flatMap((n) => [n.lead, n.tail ?? '', n.more ?? '']),
  ];

  it('never says import, ingest, spot, venue, POI, or the banned machinery words', () => {
    for (const s of strings) {
      expect(s.toLowerCase()).not.toMatch(
        /\b(import|ingest|sync|scrape|spot|venue|poi|entry|item|extracted|detected|duplicate|dedupe|pipeline|metadata|api|payload)\b/,
      );
    }
  });

  it('never puts the product name on this surface', () => {
    // §2: banned on the review screen and on anything describing a place.
    for (const s of strings) expect(s.toLowerCase()).not.toContain('no crumbs');
  });

  it('uses TikTok as an adjective, and `video` only as an anaphor', () => {
    const lead = priorSaveNotice(RAGATZI, 1)!.lead;
    // §3.1: `a TikTok video`, never `a TikTok`. The card's own line says `this video`, which is the
    // allowed back-reference — the review screen names `TikTok video` in its source row and in this
    // very notice before the card is read.
    expect(lead).toContain('TikTok video');
    expect(lead).not.toMatch(/TikTok(?!\s+video)/);
    expect(ALREADY_ADDED_LINE).toBe('Already added from this video');
  });
});

/**
 * H2-T2 — the same fact on the screen ~73% of imports land on.
 *
 * A re-paste of a video someone has already added lands on `No places in this one.` with no
 * account of why they have been here before. `priorSaves` is already on the probe response, so
 * this is wiring rather than new data.
 */
describe('the notice on the no-places screen', () => {
  it('says nothing when this video has never been added from — the common path', () => {
    expect(emptyImportPriorSaveNotice([])).toBeNull();
  });

  it('is the same lead and the same list as the review screen’s, to the character', () => {
    // One fact, one spelling. If these ever drift, two screens are describing the same rows in two
    // different sentences and one of them is going to be updated without the other.
    for (const saves of [RAGATZI, LONDON]) {
      const empty = emptyImportPriorSaveNotice(saves)!;
      const review = priorSaveNotice(saves, 0)!;
      expect(empty.lead).toBe(review.lead);
      expect(empty.names).toEqual(review.names);
      expect(empty.more).toBe(review.more);
    }
  });

  it('turns the blank into an explanation, counting rather than listing eighteen names', () => {
    const notice = emptyImportPriorSaveNotice(LONDON)!;
    expect(notice.lead).toBe('5 places are already on your map from this TikTok video:');
    expect(notice.names).toEqual(['Kiaans', 'La Nonna Brixton', 'The Laughing Yak']);
    expect(notice.more).toBe('and 2 more');
  });

  it('has no tail, because every one of the review screen’s three endings would be false here', () => {
    /*
     * The two "not selected below" endings point at cards, and this screen has none. The third —
     * `Nothing found this time matches those names` — implies something *was* found, on a screen
     * whose headline is `No places in this one.`. There is no fourth true sentence, so the notice
     * stops after the list rather than inventing one.
     */
    expect(emptyImportPriorSaveNotice(RAGATZI)!.tail).toBeNull();
    expect(emptyImportPriorSaveNotice(LONDON)!.tail).toBeNull();
  });

  it('is wired into the screen as type rather than as the review screen’s warning panel', () => {
    const SCREEN = readFileSync('src/app/import/screens/no-places-screen.tsx', 'utf8');
    const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(CODE).toContain('emptyImportPriorSaveNotice(probe.priorSaves ?? [])');
    // §4.4: type, one hairline, one field, one caption panel. A bordered box would break that
    // sentence, and warning colour would mis-describe news that is not a warning.
    expect(CODE).not.toContain('border-warning');
    expect(CODE).not.toContain('bg-warning');
    // §8.2: the arrival is announced by the focus move. A live region here would announce this
    // after the headline as if it were a second, competing claim.
    expect(CODE).not.toContain('role="status"');
    // Half of these names are Hebrew and they sit in an English comma-separated sentence.
    // One name per line rather than a comma-separated run: the punctuation a bidi algorithm can
    // move is simply not there, on the screen that shows the most Hebrew in the product.
    expect(CODE).toContain('<bdi>{name}</bdi>');
    expect(CODE).not.toContain("{i > 0 && ', '}");
  });
});

describe('the review screen wires it the way the ruling requires', () => {
  const SCREEN = readFileSync('src/app/import/screens/review/review-screen.tsx', 'utf8');
  const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('withholds the tick from a place already added from this same video', () => {
    // The seed for `selected`, and the only place unticking may happen. H-T2.
    expect(CODE).toContain('!alreadyAddedFromSource(');
  });

  it('is information and not a block — nothing removes the card from the saveable set', () => {
    // `saveableIndices` decides what Save *can* write and what `Select all` reaches. If the marked
    // card left that set, the user could not deliberately add it again, which is the one thing
    // round-3 §12 asks this kind of screen not to do.
    const saveable = CODE.slice(CODE.indexOf('const saveableIndices'), CODE.indexOf('const [selected'));
    expect(saveable).not.toContain('alreadyAdded');
    expect(CODE).toContain('alreadyAdded={alreadyAdded(i)}');
  });

  it('still lets a pick or a note tick the marked card', () => {
    // Both are decisions about *this* place, and both already tick. Nothing in this change may
    // gate them on the mark.
    expect(CODE).toContain('function pick(');
    expect(CODE).toContain('function writeNote(');
    const controls = CODE.slice(CODE.indexOf('function pick('), CODE.indexOf('const selectedCount'));
    expect(controls).not.toContain('alreadyAdded');
  });
});
