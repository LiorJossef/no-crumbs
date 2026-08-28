import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import { mp4DemuxFailureReason, type Mp4DemuxFailure } from '@/integrations/media/demux-errors';
import { extractAacFromMp4, type Mp4DemuxOptions } from '@/integrations/media/mp4-aac-demux';

import { ascii, buildMp4, loadFixture, locate, withBytesAt } from './mp4-fixtures';

/** Runs the demuxer expecting failure, and returns the `DomainError` it must have thrown. Anything
 *  else — a raw `TypeError` out of a bad offset, a `RangeError` out of an allocation, a partial
 *  result — fails here, because the whole point of the seam is that nothing else escapes it. */
function failure(input: Uint8Array, options?: Mp4DemuxOptions): DomainError {
  let thrown: unknown;
  try {
    extractAacFromMp4(input, options);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, 'expected the demuxer to refuse this input').toBeInstanceOf(DomainError);
  return thrown as DomainError;
}

function reasonOf(input: Uint8Array, options?: Mp4DemuxOptions): Mp4DemuxFailure | null {
  return mp4DemuxFailureReason(failure(input, options));
}

const aacFixture = loadFixture('speech-aac.m4a');

describe('not an MP4 at all', () => {
  it.each([
    ['empty', new Uint8Array(0)],
    ['four bytes', new Uint8Array([0, 0, 0, 32])],
    ['a JPEG', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0])],
    ['an HTML error page', ascii('<!DOCTYPE html><html><body>404 not found</body></html>')],
    ['random-looking bytes', new Uint8Array(64).fill(0x9c)],
  ])('rejects %s as not_mp4', (_label, bytes) => {
    expect(reasonOf(bytes)).toBe('not_mp4');
  });

  it('rejects a well-formed box structure with no ftyp and no moov', () => {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 16);
    bytes.set(ascii('junk'), 4);
    expect(reasonOf(bytes)).toBe('not_mp4');
  });
});

describe('truncated files', () => {
  it.each([1000, 4000, 40000, aacFixture.byteLength - 1])(
    'reports truncated when the file stops at %i bytes',
    (length) => {
      expect(reasonOf(aacFixture.slice(0, length))).toBe('truncated');
    },
  );

  it('reports truncated when a sample range runs past EOF', () => {
    // An mdat with size 0 runs to EOF by definition, so a short download is only visible in the
    // sample table — exactly the case that would otherwise yield a silently short stream.
    const mdat = locate(aacFixture, ['mdat']);
    const zeroed = withBytesAt(aacFixture, mdat.start, new Uint8Array(4));
    expect(reasonOf(zeroed.slice(0, mdat.bodyStart + 1000))).toBe('truncated');
  });
});

describe('no audio track', () => {
  it('reports no_audio_track when the only track is video', () => {
    const hdlr = locate(aacFixture, ['moov', 'trak', 'mdia', 'hdlr']);
    const asVideo = withBytesAt(aacFixture, hdlr.bodyStart + 8, ascii('vide'));
    expect(reasonOf(asVideo)).toBe('no_audio_track');
  });

  it('reports no_audio_track for a soun track with no samples', () => {
    expect(reasonOf(buildMp4({ frames: [] }))).toBe('no_audio_track');
  });
});

describe('codecs we do not read', () => {
  it('rejects a real ALAC file', () => {
    expect(reasonOf(loadFixture('speech-alac.m4a'))).toBe('unsupported_codec');
  });

  it.each([
    ['an ac-3 sample entry', buildMp4({ sampleEntryType: 'ac-3' })],
    ['an encrypted mp4a entry', buildMp4({ sampleEntryType: 'enca' })],
    ['MP3 in an mp4a entry', buildMp4({ objectTypeIndication: 0x6b })],
    ['an object type with no ADTS profile', buildMp4({ objectType: 23 })],
    ['a channel configuration ADTS cannot name', buildMp4({ channels: 0 })],
    ['an explicit sample rate', buildMp4({ sampleRateIndex: 15 })],
    ['a reserved sample-rate index', buildMp4({ sampleRateIndex: 13 })],
  ])('rejects %s', (_label, bytes) => {
    expect(reasonOf(bytes)).toBe('unsupported_codec');
  });
});

describe('malformed structure', () => {
  it.each([
    ['no stco or co64', buildMp4({ omit: ['stco'] })],
    ['no stsz', buildMp4({ omit: ['stsz'] })],
    ['no stsc', buildMp4({ omit: ['stsc'] })],
    ['no stts', buildMp4({ omit: ['stts'] })],
    ['no stsd', buildMp4({ omit: ['stsd'] })],
    ['no mdhd', buildMp4({ omit: ['mdhd'] })],
    ['no esds in the mp4a entry', buildMp4({ omit: ['esds'] })],
    ['stts and stsz disagreeing on the sample count', buildMp4({ sttsCountOverride: 5 })],
    ['a sample table that points outside every mdat', buildMp4({ chunkOffsetDelta: -50 })],
  ])('reports malformed: %s', (_label, bytes) => {
    expect(reasonOf(bytes)).toBe('malformed');
  });

  it('reports malformed when the container duration contradicts the frames emitted', () => {
    // Ten times the real frame duration: a file whose own tables cannot both be true. Returning
    // the frames anyway would be a confidently wrong, silently short stream.
    expect(reasonOf(buildMp4({ frames: manyFrames(400), sttsDelta: 10240 }))).toBe('malformed');
  });

  it('tolerates the sub-second drift a real edit list produces', () => {
    // afconvert's own output: 362 frames of 1024 samples, trimmed by 2112 priming samples.
    expect(() => extractAacFromMp4(aacFixture)).not.toThrow();
  });
});

describe('ceilings', () => {
  it('refuses an input larger than the input ceiling before parsing it', () => {
    expect(reasonOf(aacFixture, { maxInputBytes: 1000 })).toBe('input_too_large');
  });

  it('refuses audio longer than the duration ceiling, from the container header', () => {
    expect(reasonOf(aacFixture, { maxDurationSeconds: 4 })).toBe('audio_too_long');
  });

  it('refuses audio longer than the duration ceiling even when mdhd claims no duration', () => {
    const noDeclaredDuration = buildMp4({ frames: manyFrames(400), mdhdDuration: 0 });
    expect(reasonOf(noDeclaredDuration, { maxDurationSeconds: 5 })).toBe('audio_too_long');
  });

  it('refuses an ADTS stream larger than the output ceiling', () => {
    expect(reasonOf(aacFixture, { maxOutputBytes: 10_000 })).toBe('output_too_large');
  });

  it('treats a nonsensical ceiling as our own bug rather than the file being bad', () => {
    expect(failure(aacFixture, { maxDurationSeconds: 0 }).code).toBe('INTERNAL');
  });
});

describe('what crosses the seam', () => {
  // Every reason maps to the same code, and the reason itself rides on `cause` for operators.
  // One code because the caller's decision is identical in all five cases — drop the transcript
  // part, keep going on the caption — and a second code would imply a branch nobody takes.
  it.each([
    ['not_mp4', new Uint8Array(64).fill(0x9c)],
    ['truncated', aacFixture.slice(0, 4000)],
    ['malformed', buildMp4({ omit: ['stco'] })],
    ['no_audio_track', buildMp4({ handler: 'vide' })],
    ['unsupported_codec', loadFixture('speech-alac.m4a')],
  ])('maps %s to MEDIA_UNREADABLE', (reason, bytes) => {
    const error = failure(bytes);
    expect(error.code).toBe('MEDIA_UNREADABLE');
    // Not retryable: the same bytes demux the same way. Re-fetching is the fetcher's call.
    expect(error.retryable).toBe(false);
    expect(mp4DemuxFailureReason(error)).toBe(reason);
  });

  it('never puts parser detail on the wire', () => {
    const view = failure(new Uint8Array(64).fill(0x9c)).toView();
    expect(Object.keys(view).sort()).toEqual(['code', 'retryable']);
    expect(JSON.stringify(view)).not.toContain('box');
  });
});

function manyFrames(count: number): Uint8Array[] {
  return Array.from({ length: count }, () => new Uint8Array(64).fill(0x33));
}
