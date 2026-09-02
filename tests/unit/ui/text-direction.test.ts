/**
 * `textDirection` decides the two direction scopes on the place card — the card's, from the
 * place, and the note's, from what the user typed. One function so the two cannot drift into two
 * heuristics; these cases are the ones the card actually meets.
 */
import { describe, expect, it } from 'vitest';
import { textDirection } from '@/ui/place/text-direction';

describe('textDirection', () => {
  it('reads the first strong character, not the majority', () => {
    expect(textDirection('אבו חסן')).toBe('rtl');
    expect(textDirection('Abu Hassan')).toBe('ltr');
    // A Hebrew name with a Latin tail, and its mirror: the *first* strong character wins, which is
    // what keeps `קפה קיוסק Rothschild` starting on the same edge as everything under it.
    expect(textDirection('קפה קיוסק Rothschild')).toBe('rtl');
    expect(textDirection('Rothschild קפה קיוסק')).toBe('ltr');
  });

  it('skips characters with no direction of their own', () => {
    // A caption that opens on an emoji, a pin, a digit or a quote mark still resolves from the
    // first letter — this is the common shape of a TikTok caption fragment.
    expect(textDirection('📍 אבן גבירול 26')).toBe('rtl');
    expect(textDirection('“best in town”')).toBe('ltr');
    expect(textDirection('26 אבן גבירול')).toBe('rtl');
  });

  it('answers ltr when there is nothing to go on', () => {
    expect(textDirection(null)).toBe('ltr');
    expect(textDirection(undefined)).toBe('ltr');
    expect(textDirection('')).toBe('ltr');
    expect(textDirection('123 · 🍕')).toBe('ltr');
  });

  it('covers the RTL scripts beyond Hebrew', () => {
    expect(textDirection('مقهى')).toBe('rtl');
  });
});
