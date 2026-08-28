import { describe, expect, it } from 'vitest';

import {
  ADTS_HEADER_BYTES,
  parseAudioSpecificConfig,
  writeAdtsHeader,
  type AacConfig,
} from '@/integrations/media/aac';
import { mp4DemuxFailureReason } from '@/integrations/media/demux-errors';

function configFrom(...bytes: number[]): AacConfig {
  const buffer = new Uint8Array(bytes);
  return parseAudioSpecificConfig(new DataView(buffer.buffer), 0, buffer.byteLength);
}

describe('parseAudioSpecificConfig', () => {
  it('reads AAC-LC, 44.1 kHz, stereo', () => {
    // 00010 (AOT 2) 0100 (index 4) 0010 (2 channels), padded.
    expect(configFrom(0x12, 0x10)).toEqual({
      profile: 1,
      sampleRateIndex: 4,
      sampleRateHz: 44100,
      channels: 2,
      codec: 'aac-lc',
    });
  });

  it('reads the 6-bit escape form of the object type', () => {
    // 11111 (escape) 000010 (32 + 2 = AOT 34), then index 4 and 2 channels. AOT 34 is a valid
    // object type with no ADTS profile, so the escape has to be read before it can be refused.
    const error = catchOf(() => configFrom(0xf8, 0x48, 0x20));
    expect(mp4DemuxFailureReason(error)).toBe('unsupported_codec');
    expect((error as Error).message).toContain('audio object type 34');
  });

  it('refuses a config that ends mid-field', () => {
    expect(mp4DemuxFailureReason(catchOf(() => configFrom(0x12)))).toBe('malformed');
  });
});

describe('writeAdtsHeader', () => {
  const lcStereo: AacConfig = {
    profile: 1,
    sampleRateIndex: 4,
    sampleRateHz: 44100,
    channels: 2,
    codec: 'aac-lc',
  };

  it('lays the fields out where a decoder looks for them', () => {
    const out = new Uint8Array(ADTS_HEADER_BYTES);
    writeAdtsHeader(out, 0, lcStereo, 1000);

    // syncword | MPEG-4, layer 0, no CRC | profile 1, rate index 4, channel hi 0 | ...
    expect([...out]).toEqual([0xff, 0xf1, 0x50, 0x80, 0x7d, 0x1f, 0xfc]);
  });

  it('splits the 13-bit frame length across three bytes', () => {
    const out = new Uint8Array(ADTS_HEADER_BYTES);
    writeAdtsHeader(out, 0, lcStereo, 8191);

    const length = ((out[3]! & 3) << 11) | (out[4]! << 3) | (out[5]! >> 5);
    expect(length).toBe(8191);
  });

  it('splits the 3-bit channel configuration across two bytes', () => {
    const out = new Uint8Array(ADTS_HEADER_BYTES);
    writeAdtsHeader(out, 0, { ...lcStereo, channels: 6 }, 500);

    const channels = ((out[2]! & 1) << 2) | (out[3]! >> 6);
    expect(channels).toBe(6);
  });

  it('writes at an offset without touching what came before it', () => {
    const out = new Uint8Array(ADTS_HEADER_BYTES + 3).fill(0xaa);
    writeAdtsHeader(out, 3, lcStereo, 100);

    expect([...out.subarray(0, 3)]).toEqual([0xaa, 0xaa, 0xaa]);
    expect(out[3]).toBe(0xff);
  });
});

describe('mp4DemuxFailureReason', () => {
  it.each([
    ['a plain Error', new Error('nope')],
    ['an error with an unrelated cause', new Error('nope', { cause: { kind: 'other' } })],
    ['a string', 'nope'],
    ['null', null],
  ])('returns null for %s', (_label, value) => {
    expect(mp4DemuxFailureReason(value)).toBeNull();
  });
});

function catchOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}
