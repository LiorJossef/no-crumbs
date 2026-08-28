/**
 * The words the been / not-been capability puts on screen.
 *
 * The interesting assertion here is a negative one and it is the reason this file exists: the
 * column is `visit_state`, its values are `want_to_go` and `visited`, and none of those may ever
 * reach a user (`docs/product-ruling-after-the-save.md` §6, `brand-and-product-foundation.md` §4
 * rule 2). Every string the feature can render is produced by one module, so that rule is checkable
 * by machine rather than by remembering to look.
 */
import { describe, expect, it } from 'vitest';

import {
  BEEN_ACTION_LABEL,
  BEEN_ROW_ANNOTATION,
  BEEN_STATE_LABEL,
  NOT_BEEN_FILTER_LABEL,
  visitChangeAnnouncement,
  visitToggleAccessibleName,
} from '@/ui/place/visit-state';
import { ALL_BEEN_HEADING } from '@/ui/place/active-area';
import { rowAccessibleName } from '@/ui/place/enrichment';

/** Everything this feature can put in front of a user, in one list. */
const EVERY_STRING = [
  BEEN_ACTION_LABEL,
  BEEN_STATE_LABEL,
  BEEN_ROW_ANNOTATION,
  NOT_BEEN_FILTER_LABEL,
  ALL_BEEN_HEADING,
  visitToggleAccessibleName('Anat Bakery', true),
  visitToggleAccessibleName('Anat Bakery', false),
  visitChangeAnnouncement('Anat Bakery', true),
  visitChangeAnnouncement('Anat Bakery', false),
  rowAccessibleName('Anat Bakery', ['בורקס'], true),
];

describe('the schema never reaches the screen', () => {
  it.each(['visit_state', 'want_to_go', 'visited'])('never says %s', (word) => {
    for (const string of EVERY_STRING) {
      expect(string.toLowerCase()).not.toContain(word);
    }
  });

  it('says "been" instead, in every one of them', () => {
    for (const string of EVERY_STRING) {
      expect(string.toLowerCase()).toContain('been');
    }
  });
});

describe('visitToggleAccessibleName', () => {
  it('names the place and the state, in both directions', () => {
    expect(visitToggleAccessibleName('Anat Bakery', false)).toBe('Been here, Anat Bakery');
    expect(visitToggleAccessibleName('Anat Bakery', true)).toBe('Been, Anat Bakery');
  });

  it('carries a Hebrew name through untouched', () => {
    // `האחים` is a real row in this database. The name is not normalised, cased or transliterated:
    // a screen reader should say what the list says.
    expect(visitToggleAccessibleName('האחים', false)).toBe('Been here, האחים');
  });
});

describe('visitChangeAnnouncement', () => {
  it('states the outcome rather than the gesture, and names the place', () => {
    // Named because with the `Not been yet` filter on, the row this refers to has already left the
    // list by the time the sentence is read.
    expect(visitChangeAnnouncement('Anat Bakery', true)).toBe('Anat Bakery marked as been.');
    expect(visitChangeAnnouncement('Anat Bakery', false)).toBe(
      'Anat Bakery moved back to not been yet.',
    );
  });

  it('says something different in each direction, so a live region re-announces', () => {
    // A `role="status"` node whose text does not change is not re-read. Mark, unmark, mark must
    // therefore produce two distinct strings.
    expect(visitChangeAnnouncement('Anat Bakery', true)).not.toBe(
      visitChangeAnnouncement('Anat Bakery', false),
    );
  });
});

describe('rowAccessibleName with the state folded in', () => {
  it('leaves an unvisited row exactly as it was', () => {
    expect(rowAccessibleName('Anat Bakery', ['hidden gem'])).toBe(
      'Open Anat Bakery, tagged Hidden Gem',
    );
  });

  it('puts the state before the tags, because it decides whether to open the row at all', () => {
    expect(rowAccessibleName('Anat Bakery', ['hidden gem'], true)).toBe(
      'Open Anat Bakery, already been, tagged Hidden Gem',
    );
  });

  it('still names the state on a row with no tags', () => {
    expect(rowAccessibleName('HaKosem', [], true)).toBe('Open HaKosem, already been');
    expect(rowAccessibleName('HaKosem', [], false)).toBe('Open HaKosem');
  });
});
