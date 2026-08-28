/**
 * The two AAC bit-level pieces the demuxer needs: reading an `AudioSpecificConfig` out of the
 * `esds` descriptor, and writing the 7-byte ADTS header that turns each stored sample back into a
 * self-describing frame.
 *
 * The header is the only place this whole path can go wrong *silently*. Every field in it is
 * duplicated information that the MP4 container carried out-of-band; get the profile, the
 * sample-rate index or the channel configuration wrong and a decoder does not error, it returns
 * plausible-length silence — which would reach a transcription model as an empty transcript and
 * reach a user as "no places found". That is why the acceptance test for this file is a decode by
 * someone else's decoder, not a byte count.
 */

import { mp4DemuxError } from './demux-errors';

/** ISO 14496-3 Table 1.18: the 13 sample rates an ADTS header's 4-bit index can name. Index 13
 *  and 14 are reserved; 15 means "the rate is written out in 24 bits", which ADTS has no room
 *  for — both are rejected rather than guessed at. */
const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** ADTS `aac_frame_length` is 13 bits. Nothing above this can be expressed, so a stored sample
 *  bigger than this is a bad `stsz` rather than a large frame. */
export const MAX_ADTS_FRAME_BYTES = 8191;

export const ADTS_HEADER_BYTES = 7;

/** Samples per AAC frame. Fixed at 1024 for every profile we accept, and the reason frame count
 *  alone is enough to state a duration. */
export const SAMPLES_PER_AAC_FRAME = 1024;

export type AacCodec = 'aac-main' | 'aac-lc' | 'aac-ssr' | 'aac-ltp' | 'he-aac' | 'he-aac-v2';

export interface AacConfig {
  /** ADTS `profile` bits: the audio object type minus one, and so 0–3. */
  readonly profile: number;
  readonly sampleRateIndex: number;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly codec: AacCodec;
}

/** A big-endian bit reader over a byte range, bounded by construction. */
class BitReader {
  private bit = 0;

  constructor(
    private readonly view: DataView,
    private readonly start: number,
    private readonly length: number,
  ) {}

  read(bits: number): number {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const byteIndex = this.bit >> 3;
      if (byteIndex >= this.length) {
        throw mp4DemuxError('malformed', 'AudioSpecificConfig ends mid-field');
      }
      const byte = this.view.getUint8(this.start + byteIndex);
      value = (value << 1) | ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return value;
  }
}

/** 5 bits, with the 6-bit escape at 31 (ISO 14496-3 §1.6.2.1). */
function readObjectType(reader: BitReader): number {
  const value = reader.read(5);
  return value === 31 ? 32 + reader.read(6) : value;
}

function codecName(objectType: number, wrapper: 5 | 29 | null): AacCodec {
  if (wrapper === 5) return 'he-aac';
  if (wrapper === 29) return 'he-aac-v2';
  switch (objectType) {
    case 1:
      return 'aac-main';
    case 2:
      return 'aac-lc';
    case 3:
      return 'aac-ssr';
    default:
      return 'aac-ltp';
  }
}

/**
 * Parses an `AudioSpecificConfig` into exactly the four numbers ADTS needs.
 *
 * HE-AAC is not rejected: an AOT of 5 (SBR) or 29 (PS) wraps a core AAC object type, and the
 * standard way to carry that in ADTS is to declare the *core* profile and the *core* sample rate
 * and let the decoder discover SBR implicitly. So we unwrap to the core rather than refusing a
 * file we can in fact frame correctly — but the duration we report stays wall-clock, because an
 * SBR frame still covers 1024 core samples.
 */
export function parseAudioSpecificConfig(view: DataView, start: number, length: number): AacConfig {
  const reader = new BitReader(view, start, length);

  let objectType = readObjectType(reader);
  const sampleRateIndex = reader.read(4);
  if (sampleRateIndex === 15) {
    throw mp4DemuxError('unsupported_codec', 'explicit sample rate: not expressible in an ADTS header');
  }
  const sampleRateHz = SAMPLE_RATES[sampleRateIndex];
  if (sampleRateHz === undefined) {
    throw mp4DemuxError('unsupported_codec', `reserved sample-rate index ${sampleRateIndex}`);
  }

  const channels = reader.read(4);

  let wrapper: 5 | 29 | null = null;
  if (objectType === 5 || objectType === 29) {
    wrapper = objectType;
    const extensionRateIndex = reader.read(4);
    if (extensionRateIndex === 15) reader.read(24);
    objectType = readObjectType(reader);
  }

  // `channel_configuration` 0 means the layout is carried in a program config element inside the
  // first frame. We would have to parse audio payload to state a channel count, and stating one we
  // have not read would be exactly the confident-but-wrong answer this codebase forbids.
  if (channels < 1 || channels > 7) {
    throw mp4DemuxError('unsupported_codec', `channel configuration ${channels} is not an ADTS layout`);
  }
  if (objectType < 1 || objectType > 4) {
    throw mp4DemuxError('unsupported_codec', `audio object type ${objectType} has no ADTS profile`);
  }

  return {
    profile: objectType - 1,
    sampleRateIndex,
    sampleRateHz,
    channels,
    codec: codecName(objectType, wrapper),
  };
}

/**
 * Writes one 7-byte ADTS header (MPEG-4, no CRC, one raw data block) at `at`.
 * `frameBytes` is the payload length *plus* this header, which is what the field means.
 */
export function writeAdtsHeader(out: Uint8Array, at: number, config: AacConfig, frameBytes: number): void {
  const { profile, sampleRateIndex, channels } = config;
  out[at] = 0xff;
  out[at + 1] = 0xf1;
  out[at + 2] = (profile << 6) | (sampleRateIndex << 2) | ((channels >> 2) & 1);
  out[at + 3] = ((channels & 3) << 6) | ((frameBytes >> 11) & 3);
  out[at + 4] = (frameBytes >> 3) & 0xff;
  out[at + 5] = ((frameBytes & 7) << 5) | 0x1f;
  out[at + 6] = 0xfc;
}
