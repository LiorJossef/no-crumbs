/**
 * The ordering rule for the page's single `role="status"` line.
 *
 * The failure this exists to prevent is specific and invisible in a screenshot: marking two places
 * quickly fires two Server Actions that can resolve in either order, and if the region simply took
 * the last sentence to arrive, the *older* press could end up being the thing a screen-reader user
 * hears. A ticket is claimed when the user acts, so the order on screen is the order of the
 * gestures rather than of the responses.
 */
import { describe, expect, it } from 'vitest';

import { SILENT, latestSpoken } from '@/ui/place/announce';

describe('latestSpoken', () => {
  it('accepts the first announcement over silence', () => {
    expect(latestSpoken(SILENT, 1, 'Anat Bakery marked as been.')).toEqual({
      ticket: 1,
      message: 'Anat Bakery marked as been.',
    });
  });

  it('lets a newer interaction overwrite an older one', () => {
    const first = latestSpoken(SILENT, 1, 'first');
    expect(latestSpoken(first, 2, 'second')).toEqual({ ticket: 2, message: 'second' });
  });

  it('drops a slow response from an older interaction', () => {
    // Two quick presses: ticket 2 resolves first, ticket 1 arrives late. The user's second press is
    // what is true, so the late one must not be spoken.
    const current = latestSpoken(SILENT, 2, 'second');
    expect(latestSpoken(current, 1, 'first')).toBe(current);
  });

  it('lets a writer correct its own sentence at the same ticket', () => {
    const current = latestSpoken(SILENT, 3, 'draft');
    expect(latestSpoken(current, 3, 'corrected')).toEqual({ ticket: 3, message: 'corrected' });
  });

  it('can be silenced by a newer interaction with nothing to say', () => {
    // Clearing the search box announces `''`. That has to be able to replace a real sentence, or
    // the region would keep asserting a filter that is no longer on.
    const current = latestSpoken(SILENT, 1, 'Anat Bakery marked as been.');
    expect(latestSpoken(current, 2, '')).toEqual({ ticket: 2, message: '' });
  });

  it('starts silent at ticket zero, so any real announcement wins', () => {
    expect(SILENT).toEqual({ ticket: 0, message: '' });
  });
});
