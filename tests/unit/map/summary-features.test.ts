/**
 * The area band's features (`src/components/map/summary-features.ts`).
 *
 * One rule, and it is the one that was missing: **the pill never draws a bare number.** The label
 * and the count are concatenated into a single text field, so an empty label is not a hedge on
 * screen — it is `4` floating over Prague, which reads as a label that failed to load.
 */

import { describe, expect, it } from 'vitest';

import { toAreaFeatures } from '@/components/map/summary-features';
import { UNNAMED_OTHER_AREA_LABEL } from '@/ui/place/active-area';

const area = (label: string | null) => ({ id: 'a', label, count: 4, lat: 50, lng: 14 });
const labelOf = (label: string | null) =>
  toAreaFeatures([area(label)]).features[0]?.properties.label;

describe('an area marker always carries a noun', () => {
  it('draws the area’s own name when it has one', () => {
    expect(labelOf('תל אביב-יפו')).toBe(
      'תל אביב-יפו',
    );
  });

  it('falls back rather than drawing the count alone when there is no name', () => {
    expect(labelOf(null)).toBe(UNNAMED_OTHER_AREA_LABEL);
  });

  it('treats a whitespace-only name as absent, not as a valid empty string', () => {
    // The shape the `?? ''` guard could never catch: a locality of `' '` is not null, and it
    // reaches the text field as nothing at all.
    expect(labelOf('   ')).toBe(UNNAMED_OTHER_AREA_LABEL);
    expect(labelOf('')).toBe(UNNAMED_OTHER_AREA_LABEL);
  });

  it('trims a name it does keep, so the pill is not padded by its data', () => {
    expect(labelOf('  London  ')).toBe('London');
  });

  it('says the same word the list and /profile say for the same gap', () => {
    expect(UNNAMED_OTHER_AREA_LABEL).toBe('Another area');
  });
});
