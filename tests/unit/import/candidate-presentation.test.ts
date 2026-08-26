import { describe, expect, it } from 'vitest';

import {
  candidateMeta,
  candidateProvenance,
  candidateTitle,
  isSaveable,
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
  coordinates: { lat: 51.4619, lng: -0.1145 },
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
    expect(candidateMeta({ ...base, categoryHint: 'other', addressHint: null })).toBe('Place · London');
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

describe('skippedNotice', () => {
  it('is silent when every candidate can be saved', () => {
    expect(skippedNotice(0)).toBeNull();
  });

  it('states the consequence before the button is pressed', () => {
    expect(skippedNotice(1)).toBe('1 of these has no location — it won’t be saved.');
    expect(skippedNotice(3)).toBe('3 of these have no location — they won’t be saved.');
  });
});
