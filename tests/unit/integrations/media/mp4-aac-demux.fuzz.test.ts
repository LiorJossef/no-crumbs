import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import { extractAacFromMp4 } from '@/integrations/media/mp4-aac-demux';

import { buildMp4, loadFixture } from './mp4-fixtures';

/**
 * The blanket assertion, over inputs nobody hand-wrote: whatever these bytes are, the demuxer
 * either returns a stream or throws a `DomainError`. Never a `RangeError` out of a `DataView`
 * read, never a `TypeError`, never a hang.
 *
 * This is not decoration. Writing it found a real escape — a `mdhd` whose body started exactly at
 * EOF read one byte past the buffer and threw `RangeError` straight through the seam, which the
 * hand-written cases had all missed. Everything is deterministic: fixed corpora, a fixed value
 * set, and a seeded generator, so a failure here is reproducible from the seed alone.
 */
function assertContained(bytes: Uint8Array, label: string): void {
  try {
    extractAacFromMp4(bytes);
  } catch (error) {
    if (!(error instanceof DomainError)) {
      expect.fail(`${label} escaped the seam as ${(error as Error).name}: ${(error as Error).message}`);
    }
  }
}

const built = buildMp4();
const real = loadFixture('speech-aac.m4a');
/** The real fixture's header region: ftyp, moov and the free padding, up to mdat at 4088. Mutating
 *  payload bytes cannot change control flow, so those offsets buy nothing. */
const REAL_HEADER_END = 4100;

describe('every input either parses or raises a DomainError', () => {
  it('survives truncation at any length', () => {
    for (let length = 0; length <= built.byteLength; length++) {
      assertContained(built.slice(0, length), `built truncated to ${length}`);
    }
    for (let length = 0; length <= real.byteLength; length += 31) {
      assertContained(real.slice(0, length), `fixture truncated to ${length}`);
    }
  });

  it('survives a single hostile byte anywhere in the structure', () => {
    for (const value of [0x00, 0x80, 0xff]) {
      for (let at = 0; at < built.byteLength; at++) {
        const copy = built.slice();
        copy[at] = value;
        assertContained(copy, `built[${at}] = ${value}`);
      }
      for (let at = 0; at < REAL_HEADER_END; at += 3) {
        const copy = real.slice();
        copy[at] = value;
        assertContained(copy, `fixture[${at}] = ${value}`);
      }
    }
  });

  it('survives seeded multi-byte corruption', () => {
    let seed = 20260829;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };

    for (let round = 0; round < 3000; round++) {
      const source = round % 2 === 0 ? built : real;
      const copy = source.slice();
      const limit = source === real ? REAL_HEADER_END : copy.byteLength;
      const edits = 1 + (next() % 4);
      for (let i = 0; i < edits; i++) {
        copy[next() % limit] = next() % 256;
      }
      assertContained(copy, `round ${round}`);
    }
  });
});
