import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALREADY_ADDED_ALL_LINE,
  candidateMeta,
  candidateProvenance,
  candidateTitle,
  everyPlaceAlreadyAdded,
  isSaveable,
  isTaggedAccountOnly,
  locationLine,
  saveButtonLabel,
  showsEvidence,
  skippedNotice,
} from '@/domain/import/candidate-presentation';
import type { PlaceCandidate } from '@/domain/types';

const base: PlaceCandidate = {
  rawName: 'La Nonna',
  cityHint: 'London',
  countryHint: 'United Kingdom',
  categoryHint: 'restaurant',
  evidence: 'La Nonna in Market Row, Brixton',
  modelConfidence: 0.95,
  addressHint: 'Market Row, Brixton',
  identifiedName: 'La Nonna Brixton',
  nameVariants: [],
  coordinates: { lat: 51.4619, lng: -0.1145 },
  areaHint: null,
  tags: [],
  dishes: [],
  whyGo: null,
};

describe('candidateTitle', () => {
  // The bug this pins: the card used to be titled `rawName` while the save wrote
  // `identifiedName ?? rawName`, so the user confirmed "La Nonna" and got "La Nonna Brixton".
  it('is the string the save path writes — the model identification when it has one', () => {
    expect(candidateTitle(base)).toBe('La Nonna Brixton');
  });

  it('falls back to the caption name when the model did not identify anything', () => {
    expect(candidateTitle({ ...base, identifiedName: null })).toBe('La Nonna');
    expect(candidateTitle({ ...base, identifiedName: '  ' })).toBe('La Nonna');
  });
});

describe('candidateProvenance', () => {
  it('hands back the caption’s own words when the title is our inference', () => {
    expect(candidateProvenance(base)).toBe('The caption called it “La Nonna”');
  });

  it('says so plainly when the title is already the caption’s words', () => {
    expect(candidateProvenance({ ...base, identifiedName: null })).toBe('Named in the caption');
    // Same string, different case, is still the caption's words — not an inference to disclose.
    expect(candidateProvenance({ ...base, identifiedName: 'la nonna' })).toBe('Named in the caption');
  });
});

describe('candidateMeta', () => {
  it('reads category then the most specific place hint', () => {
    expect(candidateMeta(base)).toBe('Restaurant · Market Row, Brixton, London');
  });

  it('does not repeat a city the caption already wrote into the address', () => {
    expect(candidateMeta({ ...base, addressHint: 'Market Row, Brixton, London' })).toBe(
      'Restaurant · Market Row, Brixton, London',
    );
  });

  // "LONDON, UNITED KINGDOM" down eight consecutive cards is noise, and the country never
  // distinguishes one candidate from another within a single post.
  it('drops the country whenever a city or address exists', () => {
    expect(candidateMeta({ ...base, addressHint: null })).toBe('Restaurant · London');
  });

  it('falls back to the country only when nothing more specific exists', () => {
    expect(candidateMeta({ ...base, addressHint: null, cityHint: null })).toBe(
      'Restaurant · United Kingdom',
    );
  });

  it('says the location is missing rather than rendering an empty line', () => {
    expect(
      candidateMeta({
        ...base,
        addressHint: null,
        cityHint: null,
        countryHint: null,
        categoryHint: null,
      }),
    ).toBe('Location not given');
  });

  it('renders every category in the extraction vocabulary as a word', () => {
    expect(candidateMeta({ ...base, categoryHint: 'cafe', addressHint: null })).toBe('Café · London');
    expect(candidateMeta({ ...base, categoryHint: 'bar', addressHint: null })).toBe('Bar · London');
    expect(candidateMeta({ ...base, categoryHint: 'restaurant', addressHint: null })).toBe(
      'Restaurant · London',
    );
    // No category is a normal answer, not a gap: the review card says where, and says nothing
    // about what, rather than calling it a "Place".
    expect(candidateMeta({ ...base, categoryHint: null, addressHint: null })).toBe('London');
  });
});

describe('showsEvidence', () => {
  it('shows a caption fragment that adds something the name does not', () => {
    expect(showsEvidence(base)).toBe(true);
  });

  it('hides a fragment that is just the name again', () => {
    expect(showsEvidence({ ...base, evidence: 'La Nonna' })).toBe(false);
    expect(showsEvidence({ ...base, evidence: null })).toBe(false);
  });
});

describe('the location statement', () => {
  it('says the pin is approximate rather than reporting a confidence figure', () => {
    expect(locationLine(base)).toBe('Pin is approximate');
  });

  // Knowable at render time, so it is stated before the button is pressed rather than apologised
  // for after it. `derivePlaceSave` skips exactly this candidate server-side.
  it('states plainly when the model gave no coordinate', () => {
    const unplaced = { ...base, coordinates: null };
    expect(isSaveable(unplaced)).toBe(false);
    expect(locationLine(unplaced)).toBe('We couldn’t place this one');
  });
});

describe('the primary action', () => {
  it('names how many places pressing it will save', () => {
    expect(saveButtonLabel(8)).toBe('Save 8 places →');
    expect(saveButtonLabel(1)).toBe('Save this place →');
  });

  it('asks for a selection instead of showing a dead arrow', () => {
    expect(saveButtonLabel(0)).toBe('Select a place to save');
  });
});

/**
 * H2-T1 — the button that was dead *and* wrong about why.
 *
 * Lane H unticks a candidate this person already added from this same video. On a post whose every
 * place is already on their map that leaves nothing selected, and `Select a place to save` then
 * says the reason is that they have not chosen — when the reason is that we chose for them. A dead
 * control paired with a false explanation is exactly what the owner rejected a global duplicate
 * check for on 2026-08-29, and re-taking that decision means not re-taking that defect with it.
 */
describe('when every place found is already on the map from this video', () => {
  it('recognises the state over every candidate, not just the saveable ones', () => {
    expect(everyPlaceAlreadyAdded(3, 3)).toBe(true);
    expect(everyPlaceAlreadyAdded(3, 2)).toBe(false);
    // A card we could not place is still something we found. Excluding it would let
    // "everything found here is already on your map" be printed over a place they have not got.
    expect(everyPlaceAlreadyAdded(1, 0)).toBe(false);
    // No candidates is the no-places screen's business, and this sentence must never appear there.
    expect(everyPlaceAlreadyAdded(0, 0)).toBe(false);
  });

  it('states the true reason, in the ratified words', () => {
    expect(ALREADY_ADDED_ALL_LINE).toBe('Everything found here is already on your map.');
    // `voice-and-vocabulary.md` §3: `found`, `place`, `your map`, `add`. §2: the product name is
    // banned on this surface. §4: no apology and no machinery.
    for (const s of [ALREADY_ADDED_ALL_LINE]) {
      expect(s.toLowerCase()).not.toMatch(
        /\b(import|ingest|spot|venue|poi|duplicate|dedupe|extracted|detected|sorry|oops|failed|error|no crumbs)\b/,
      );
    }
  });

  it('leaves the way back in to the notice that is already saying it', () => {
    /*
     * Seen on a 390x844 screen rather than asserted: a footer line reading `Select a place above to
     * add it again.` sat in the same viewport as the prior-saves notice's own
     * `They're not selected below. Select one to add it again.`, and the two pointed at each other
     * from opposite ends of the screen. The notice's is better placed — it is directly above the
     * cards it describes — so the footer says only what the notice does not: why there is no Save.
     */
    expect(ALREADY_ADDED_ALL_LINE).not.toContain('Select');
  });

  describe('and the screen renders a live control rather than a dead one', () => {
    const SCREEN = readFileSync('src/app/import/screens/review/review-screen.tsx', 'utf8');
    const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('branches before the Save button, so the dead label cannot be reached in this state', () => {
      expect(CODE).toContain('const nothingLeftToAdd =');
      expect(CODE).toContain('everyPlaceAlreadyAdded(n, markedCount)');
      // The order matters: the `nothingLeftToAdd` arm has to come before the arm that renders
      // `saveButtonLabel`, or the state falls through to the disabled button again.
      expect(CODE.indexOf('nothingLeftToAdd ? (')).toBeLessThan(CODE.indexOf('saveButtonLabel('));
    });

    it('makes the primary the way back to the map, from the one shared label', () => {
      expect(CODE).toContain('{IMPORT_ERROR_ACTION_LABEL.back_to_map} →');
      expect(CODE).toContain('{ALREADY_ADDED_ALL_LINE}');
    });

    it('leaves every way of adding it anyway alone', () => {
      // The cards, the checkboxes and `Select all` are untouched by this state: `saveableIndices`
      // does not know about it, and ticking one card takes `selectedCount` above zero, which puts
      // the Save button back. The 2026-08-29 ruling is that this is information, not a block.
      const saveable = CODE.slice(
        CODE.indexOf('const saveableIndices'),
        CODE.indexOf('const [selected'),
      );
      expect(saveable).not.toContain('nothingLeftToAdd');
      expect(CODE).toContain('selectedCount === 0 &&');
    });

    it('un-collapses the one-result layout, because that layout has no checkbox on it', () => {
      /*
       * Seen at `?state=review-added-one`, 390x844: the collapsed layout renders the pin line, the
       * shortlist and the note row and **no selection control**, while the notice above it read
       * "It's not selected below. Select it to add it again." The card layout gives that sentence
       * back the control it names, which is the reading that keeps the 2026-08-29 ruling — the
       * alternative, rewriting the sentence, would make the screen truthful by withdrawing the
       * offer.
       *
       * On `markedCount`, which does not move when the box is ticked: the layout must not change
       * under the user's thumb.
       */
      expect(CODE).toContain('collapsesToOneResult(views) && markedCount === 0');
    });

    it('does not show two ways out at once', () => {
      // The ghost `Back to the map` under a dead Save is the old answer to this state. With the
      // primary now being that same action, rendering both would be one action twice.
      const arm = CODE.slice(CODE.indexOf('nothingLeftToAdd ? ('), CODE.indexOf('saveableIndices.length === 0 ? ('));
      expect((arm.match(/onClick=\{onContinue\}/g) ?? []).length).toBe(1);
    });
  });
});

describe('skippedNotice', () => {
  it('is silent when every candidate can be saved', () => {
    expect(skippedNotice(0)).toBeNull();
  });

  it('states the consequence before the button is pressed', () => {
    expect(skippedNotice(1)).toBe('1 of these has no location — it won’t be saved.');
    expect(skippedNotice(3)).toBe('3 of these have no location — they won’t be saved.');
  });
});

describe('isTaggedAccountOnly', () => {
  const caption = '✨ Anwi Cafe ✨ Kro Bakery ✨ Kus Kolace ✨ @The Miners Coffee';
  const tagged: PlaceCandidate = { ...base, rawName: 'The Miners Coffee', identifiedName: null };

  it('says so when the caption only tagged the business (E-T3)', () => {
    // `filterPlausible` strips the `@`, so by render time this looks exactly like a prose name.
    expect(isTaggedAccountOnly(caption, tagged)).toBe(true);
  });

  it('says nothing when the prose names it too', () => {
    expect(isTaggedAccountOnly(`The Miners Coffee ☕️ ${caption}`, tagged)).toBe(false);
  });

  it('says nothing about a candidate read out of the prose', () => {
    expect(isTaggedAccountOnly(caption, { ...base, rawName: 'Anwi Cafe' })).toBe(false);
  });

  it('is false with no caption to decide it on', () => {
    expect(isTaggedAccountOnly(null, tagged)).toBe(false);
  });
});
