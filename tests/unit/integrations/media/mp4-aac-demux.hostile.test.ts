import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import { mp4DemuxFailureReason, type Mp4DemuxFailure } from '@/integrations/media/demux-errors';
import { extractAacFromMp4 } from '@/integrations/media/mp4-aac-demux';

import { ascii, box, buildMp4, concat, locate, u32, withBytesAt } from './mp4-fixtures';

/**
 * Files a hostile CDN could serve. The assertion is always the same pair: a `DomainError` rather
 * than a `RangeError`/`TypeError`/hang, and a wall-clock time that proves we neither looped nor
 * allocated from a length field. The budget is generous — the real numbers are sub-millisecond —
 * because the failure this catches is "minutes or a heap crash", not "slower than it could be".
 */
const TIME_BUDGET_MS = 250;

function refuses(bytes: Uint8Array): Mp4DemuxFailure | null {
  const started = performance.now();
  let thrown: unknown;
  try {
    extractAacFromMp4(bytes);
  } catch (error) {
    thrown = error;
  }
  const elapsed = performance.now() - started;
  expect(thrown, 'a hostile input must fail, not return audio').toBeInstanceOf(DomainError);
  expect(elapsed, `took ${elapsed.toFixed(1)}ms`).toBeLessThan(TIME_BUDGET_MS);
  return mp4DemuxFailureReason(thrown);
}

/** A raw box header with an arbitrary size field — the thing a builder would never emit. */
function header(size: number, type: string): Uint8Array {
  return concat([u32(size), ascii(type)]);
}

const ftyp = concat([u32(16), ascii('ftyp'), ascii('isom'), u32(512)]);

describe('adversarial box headers', () => {
  it('refuses a box claiming four gigabytes', () => {
    expect(refuses(concat([ftyp, header(0xffffffff, 'moov'), new Uint8Array(64)]))).toBe('truncated');
  });

  it('refuses a 64-bit size that is not an offset', () => {
    const large = concat([u32(1), ascii('moov'), new Uint8Array(8).fill(0xff)]);
    expect(refuses(concat([ftyp, large, new Uint8Array(64)]))).toBe('malformed');
  });

  it('refuses a 64-bit size field with no room for the size field', () => {
    expect(refuses(concat([ftyp, header(1, 'moov'), new Uint8Array(4)]))).toBe('truncated');
  });

  it('refuses a box smaller than its own header', () => {
    expect(refuses(concat([ftyp, header(4, 'moov'), new Uint8Array(64)]))).toBe('malformed');
  });

  it('refuses a box type that is not four printable bytes', () => {
    expect(refuses(concat([ftyp, u32(16), new Uint8Array([0, 1, 2, 3]), new Uint8Array(8)]))).toBe('malformed');
  });

  it('terminates on a zero-length box, which legally swallows the rest of the file', () => {
    // `size == 0` means "to the end of the container". It is legal, it must not loop, and what it
    // swallows here is the moov — so the file has no moov, which is the answer we must give.
    const swallowed = concat([ftyp, header(0, 'free'), buildMp4()]);
    expect(refuses(swallowed)).toBe('malformed');
  });

  it('refuses trailing bytes that cannot hold a header', () => {
    expect(refuses(concat([ftyp, buildMp4(), new Uint8Array(3)]))).toBe('truncated');
  });

  it('refuses a box that ends past EOF', () => {
    expect(refuses(concat([ftyp, header(10_000, 'moov'), new Uint8Array(32)]))).toBe('truncated');
  });
});

describe('adversarial structure', () => {
  it('does not care how deeply boxes nest', () => {
    // 10,000 boxes, each the sole child of the last. Depth costs nothing because the demuxer only
    // ever descends the fixed moov/trak/mdia/minf/stbl path — it never recurses on the file.
    const depth = 10_000;
    const nested = concat(Array.from({ length: depth }, (_, i) => header((depth - i) * 8, 'moov')));
    expect(refuses(concat([ftyp, nested]))).toBe('no_audio_track');
  });

  it('refuses a box whose body is exactly the end of the file', () => {
    // The last box in the file, with an empty body. Reading its first byte without checking would
    // be an out-of-range DataView read — a RangeError, which is precisely what must never escape.
    const emptyMdhd = concat([
      ftyp,
      box('moov', [
        box('trak', [
          box('mdia', [
            box('hdlr', [u32(0), u32(0), ascii('soun'), new Uint8Array(13)]),
            box('mdhd', []),
          ]),
        ]),
      ]),
    ]);
    expect(refuses(emptyMdhd)).toBe('malformed');
  });

  it('stops on a file that fans out into hundreds of thousands of siblings', () => {
    const siblings = 200_000;
    const children = concat(Array.from({ length: siblings }, () => header(8, 'free')));
    const moov = concat([u32(children.byteLength + 8), ascii('moov'), children]);
    expect(refuses(concat([ftyp, moov]))).toBe('malformed');
  });
});

describe('adversarial sample tables', () => {
  const valid = buildMp4();

  function patch(path: readonly string[], offset: number, value: Uint8Array): Uint8Array {
    return withBytesAt(valid, locate(valid, path).bodyStart + offset, value);
  }

  const STBL = ['moov', 'trak', 'mdia', 'minf', 'stbl'] as const;

  it('refuses a stsz claiming four billion samples', () => {
    expect(refuses(patch([...STBL, 'stsz'], 8, u32(0xfffffff0)))).toBe('malformed');
  });

  it('refuses a stco claiming four billion chunks', () => {
    expect(refuses(patch([...STBL, 'stco'], 4, u32(0xfffffff0)))).toBe('malformed');
  });

  it('refuses a stts claiming four billion entries', () => {
    expect(refuses(patch([...STBL, 'stts'], 4, u32(0xfffffff0)))).toBe('malformed');
  });

  it('refuses a stsc claiming four billion entries', () => {
    expect(refuses(patch([...STBL, 'stsc'], 4, u32(0xfffffff0)))).toBe('malformed');
  });

  it('refuses a single sample claiming to be four gigabytes', () => {
    expect(refuses(patch([...STBL, 'stsz'], 12, u32(0xfffffff0)))).toBe('malformed');
  });

  it('refuses a samples-per-chunk that would run forever', () => {
    expect(refuses(patch([...STBL, 'stsc'], 12, u32(0xffffffff)))).toBe('malformed');
  });

  it('refuses a stsc that does not start at chunk 1', () => {
    expect(refuses(patch([...STBL, 'stsc'], 8, u32(7)))).toBe('malformed');
  });

  it('refuses a chunk offset past EOF', () => {
    expect(refuses(patch([...STBL, 'stco'], 8, u32(0xfffffff0)))).toBe('truncated');
  });

  it('refuses a co64 offset beyond 2^53', () => {
    const withCo64 = buildMp4({ co64: true });
    const co64 = locate(withCo64, [...STBL, 'co64']);
    expect(refuses(withBytesAt(withCo64, co64.bodyStart + 8, new Uint8Array(8).fill(0xff)))).toBe('malformed');
  });

  it('refuses an esds descriptor that claims more bytes than the box holds', () => {
    const esds = locate(valid, [...STBL, 'stsd', 'mp4a', 'esds']);
    expect(refuses(withBytesAt(valid, esds.bodyStart + 5, new Uint8Array([0x7f])))).toBe('malformed');
  });

  it('refuses a stsd whose entry count disagrees with its contents', () => {
    const stsd = locate(valid, [...STBL, 'stsd']);
    expect(refuses(withBytesAt(valid, stsd.start + 8 + 4, u32(0)))).toBe('malformed');
  });
});
