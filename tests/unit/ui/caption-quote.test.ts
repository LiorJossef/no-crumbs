import { describe, expect, it } from 'vitest';

import { formatCaptionQuote, quoteAddsSomething } from '@/ui/place/caption-quote';
import {
  categoryDisplay,
  categoryLocalityLine,
  UNCATEGORISED_COLOR,
} from '@/ui/place/category-display';

describe('formatCaptionQuote', () => {
  it('drops the creator formatting that leads a caption fragment', () => {
    expect(formatCaptionQuote('📍האחים, אבן גבירול 26')).toBe('האחים, אבן גבירול 26');
    expect(formatCaptionQuote('✨ Sycamore Restaurant for seasonal Italian plates')).toBe(
      'Sycamore Restaurant for seasonal Italian plates'
    );
    expect(formatCaptionQuote('  •  La Nonna in Market Row')).toBe('La Nonna in Market Row');
  });

  it('keeps punctuation that ends a sentence', () => {
    expect(formatCaptionQuote('Go on a weeknight — the queue starts at seven.')).toBe(
      'Go on a weeknight — the queue starts at seven.'
    );
    expect(formatCaptionQuote('Is it worth it? 🍕')).toBe('Is it worth it?');
  });

  it('flattens the layout a creator typed into the caption', () => {
    expect(formatCaptionQuote('Kiaans Tooting\n\n  pan-Asian   inside\nTooting Market')).toBe(
      'Kiaans Tooting pan-Asian inside Tooting Market'
    );
  });

  it('is empty for nothing, rather than undefined', () => {
    expect(formatCaptionQuote(null)).toBe('');
    expect(formatCaptionQuote(undefined)).toBe('');
    expect(formatCaptionQuote('📍')).toBe('');
  });
});

describe('quoteAddsSomething', () => {
  const anat = { name: 'האחים', addressLine: 'אבן גבירול 26', locality: 'תל אביב - יפו' };

  it('hides a quote that is the name and the address again', () => {
    expect(quoteAddsSomething(formatCaptionQuote('📍האחים, אבן גבירול 26'), anat)).toBe(false);
  });

  it('shows a quote that says something the identity block does not', () => {
    expect(
      quoteAddsSomething('האחים, בראנץ׳ בחממה עם מאפים', anat)
    ).toBe(true);
  });

  it('hides an empty quote', () => {
    expect(quoteAddsSomething('', anat)).toBe(false);
    expect(quoteAddsSomething('   ', anat)).toBe(false);
  });

  it('works the same in Latin script', () => {
    const kiaans = { name: 'Kiaans', addressLine: null, locality: 'London' };
    expect(quoteAddsSomething('Kiaans London', kiaans)).toBe(false);
    expect(quoteAddsSomething('Kiaans Tooting pan-Asian inside Tooting Market', kiaans)).toBe(true);
  });
});

describe('category display', () => {
  it('names a category the way a person writes it', () => {
    expect(categoryDisplay('cafe').label).toBe('Café');
    expect(categoryDisplay('restaurant').label).toBe('Restaurant');
  });

  it('draws an uncategorised place, and says nothing about what it is', () => {
    // The pair the 2026-08-29 narrowing turns on: a colour is always needed, a word is not. The
    // label used to be "Place", which read as a category and was only ever a refusal to say.
    expect(categoryDisplay('nightclub').label).toBeNull();
    expect(categoryDisplay(null).label).toBeNull();
    expect(categoryDisplay('other').label).toBeNull();
    expect(categoryDisplay(null).color).toBe(UNCATEGORISED_COLOR);
    expect(categoryDisplay('nightclub').color).toBe(UNCATEGORISED_COLOR);
  });

  it('drops the category half of the line entirely when there is none', () => {
    expect(categoryLocalityLine(null, 'Tel Aviv-Yafo')).toBe('Tel Aviv-Yafo');
    expect(categoryLocalityLine('shop', 'Tel Aviv-Yafo')).toBe('Tel Aviv-Yafo');
    expect(categoryLocalityLine(null, null)).toBe('');
  });

  it('drops the separator when half the line is missing', () => {
    expect(categoryLocalityLine('cafe', 'Tel Aviv-Yafo')).toBe('Café · Tel Aviv-Yafo');
    expect(categoryLocalityLine('cafe', null)).toBe('Café');
    expect(categoryLocalityLine('cafe', '   ')).toBe('Café');
  });
});
