/**
 * MP4 → ADTS-framed AAC, in pure TypeScript with no dependency of any kind.
 *
 * The transcription step needs audio and only audio: sending the container costs roughly an order
 * of magnitude more model tokens than the AAC track alone
 * (`docs/evidence/deploy/audio-acquisition-hosting-2026-08-29.md` §3.4). Lifting that track out is
 * not a transcode — the stored samples are copied byte for byte, and the only thing we add is the
 * 7-byte ADTS header that puts the parameters the container held out-of-band back in front of each
 * frame. Which is why this is four small modules and not a 68 MB ffmpeg binary (§3.3).
 *
 * Two properties matter more than elegance here:
 *
 *  1. **Every byte is hostile.** These files come from a public CDN. Nothing is allocated from a
 *     length field before that field has been checked against the range it lives in; no loop can
 *     run without making progress; the total output is sized and rejected *before* the buffer is
 *     allocated; the whole parse runs on a fuel budget (`iso-bmff.ts`).
 *  2. **Never return audio we are not confident is complete.** A demuxer that silently drops half
 *     the frames produces a silently truncated transcript, and a wrong transcript is worse here
 *     than no transcript at all. So the sample count, the byte total and the container's own
 *     duration are cross-checked against each other, and any disagreement is a failure rather than
 *     a shorter file.
 *
 * What is deliberately *not* handled, because handling it badly is worse than refusing:
 * fragmented MP4 (`moof`/`traf` — no `stbl` sample tables to walk), the compact `stz2` sample-size
 * table, encrypted tracks (`enca`), non-AAC audio codecs, and edit lists (`elst`) — the few frames
 * an edit list would trim are priming samples a decoder discards anyway.
 */

import { internal } from '@/domain/errors';

import {
  ADTS_HEADER_BYTES,
  MAX_ADTS_FRAME_BYTES,
  SAMPLES_PER_AAC_FRAME,
  parseAudioSpecificConfig,
  writeAdtsHeader,
  type AacCodec,
  type AacConfig,
} from './aac';
import { mp4DemuxError } from './demux-errors';
import {
  createBoxBudget,
  findBox,
  readBoxes,
  requireBodyBytes,
  requireBox,
  requirePath,
  type Box,
  type BoxBudget,
} from './iso-bmff';

/** The product rule is ~2 minutes of audio per post; this is that rule with enough slack that a
 *  2:05 clip is transcribed rather than dropped. It is a parameter, not a constant, because the
 *  rule belongs to the pipeline and the fence belongs here. */
export const DEFAULT_MAX_DURATION_SECONDS = 150;

/** A 120 s TikTok is ~22 MB of MP4 (`docs/evidence/deploy/…` §3.1). This is the point at which we
 *  stop parsing rather than the point at which we expect to. */
export const DEFAULT_MAX_INPUT_BYTES = 64 * 1024 * 1024;

/** 150 s of 128 kbps AAC is ~2.4 MB; Gemini's inline ceiling is 20 MB for the whole request, and
 *  base64 costs a third on top. This sits between the two, well clear of both. */
export const DEFAULT_MAX_OUTPUT_BYTES = 12 * 1024 * 1024;

export interface Mp4DemuxOptions {
  readonly maxDurationSeconds?: number;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
}

export interface Mp4Audio {
  /** The AAC elementary stream, one ADTS frame per stored sample. Named `audio` (with `mimeType`
   *  beside it) so this object *is* a `TranscriptionInput` (`domain/ports.ts`) with no adapter
   *  between the two steps. */
  readonly audio: Uint8Array;
  readonly mimeType: 'audio/aac';
  readonly codec: AacCodec;
  readonly sampleRateHz: number;
  readonly channels: number;
  /** Wall-clock seconds of the stream we are returning — frames × 1024 ÷ sample rate, not the
   *  container's claim. Cross-checked against the container before we get here. */
  readonly durationSeconds: number;
  readonly frameCount: number;
}

interface Limits {
  readonly maxDurationSeconds: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A sample table, read straight off the file. Nothing is materialised into an array: every
 *  accessor is a bounds-checked `DataView` read, so a `stsz` claiming four billion entries costs
 *  us one comparison rather than 16 GB. */
interface Table {
  readonly count: number;
  at(index: number): number;
}

/**
 * Extracts the AAC track of an MP4 as an ADTS stream.
 *
 * Throws only `DomainError`; `mp4DemuxFailureReason()` recovers which of the eight failures it was.
 * Never returns a partial stream.
 */
export function extractAacFromMp4(
  input: Uint8Array | ArrayBuffer,
  options: Mp4DemuxOptions = {},
): Mp4Audio {
  const limits = resolveLimits(options);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength > limits.maxInputBytes) {
    throw mp4DemuxError('input_too_large', `${bytes.byteLength} bytes exceeds ${limits.maxInputBytes}`);
  }
  if (bytes.byteLength < 8) {
    throw mp4DemuxError('not_mp4', `${bytes.byteLength} bytes cannot hold a single box`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const budget = createBoxBudget();
  const { moov, mdats } = scanTopLevel(view, bytes.byteLength, budget);
  const track = findAudioTrack(view, moov, budget);

  return demuxTrack(view, bytes, track, mdats, budget, limits);
}

function resolveLimits(options: Mp4DemuxOptions): Limits {
  const limits: Limits = {
    maxDurationSeconds: options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS,
    maxInputBytes: options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      // Our own call site got it wrong, which is the definition of `INTERNAL` (`07` §9).
      throw internal(`extractAacFromMp4: ${name} must be a positive finite number, got ${value}`);
    }
  }
  return limits;
}

/**
 * The top-level box list: where `moov` is, and which ranges are `mdat` payload.
 *
 * This is also where "is this an MP4 at all?" gets decided. A JPEG, an HTML error page or a
 * truncated-to-nothing response all fail the very first header — their first four bytes read as a
 * box size far past EOF — and that is a different fact about the world from a real MP4 with a
 * broken table, so it gets a different failure.
 */
function scanTopLevel(
  view: DataView,
  length: number,
  budget: BoxBudget,
): { readonly moov: Box; readonly mdats: readonly ByteRange[] } {
  const mdats: ByteRange[] = [];
  let moov: Box | null = null;
  let recognised = false;

  try {
    for (const box of readBoxes(view, 0, length, budget, 'file')) {
      if (box.type === 'ftyp') recognised = true;
      else if (box.type === 'moov') moov = box;
      else if (box.type === 'mdat') mdats.push({ start: box.bodyStart, end: box.end });
    }
  } catch (error) {
    if (!recognised && moov === null) {
      throw mp4DemuxError('not_mp4', 'the first box header is not a box header');
    }
    throw error;
  }

  if (moov === null) {
    throw recognised
      ? mp4DemuxError('malformed', "'ftyp' present but the file has no 'moov'")
      : mp4DemuxError('not_mp4', "no 'ftyp' and no 'moov' at the top level");
  }
  return { moov, mdats };
}

/** The first `trak` whose `hdlr` says `soun`. First wins: a TikTok has one audio track, and a file
 *  with two gives us no basis for preferring either. */
function findAudioTrack(view: DataView, moov: Box, budget: BoxBudget): Box {
  for (const trak of readBoxes(view, moov.bodyStart, moov.end, budget, 'moov')) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(view, trak, 'mdia', budget);
    if (mdia === null) continue;
    const hdlr = findBox(view, mdia, 'hdlr', budget);
    if (hdlr === null) continue;
    requireBodyBytes(hdlr, 12, 'hdlr handler_type');
    if (readFourCC(view, hdlr.bodyStart + 8) === 'soun') return mdia;
  }
  throw mp4DemuxError('no_audio_track', 'no trak with a soun handler');
}

function demuxTrack(
  view: DataView,
  bytes: Uint8Array,
  mdia: Box,
  mdats: readonly ByteRange[],
  budget: BoxBudget,
  limits: Limits,
): Mp4Audio {
  const { timescale, durationSeconds: declaredSeconds } = readMediaHeader(view, mdia, budget);
  // The cheapest gate we have: refuse an hour-long file before touching a sample table.
  if (declaredSeconds !== null && declaredSeconds > limits.maxDurationSeconds) {
    throw mp4DemuxError(
      'audio_too_long',
      `mdhd declares ${declaredSeconds.toFixed(1)}s, ceiling is ${limits.maxDurationSeconds}s`,
    );
  }

  const stbl = requirePath(view, mdia, ['minf', 'stbl'], budget);
  const config = readAacConfig(view, requireBox(view, stbl, 'stsd', budget), budget);

  const sizes = readSampleSizes(view, requireBox(view, stbl, 'stsz', budget));
  const frameCount = sizes.count;
  if (frameCount === 0) {
    throw mp4DemuxError('no_audio_track', 'the audio track has no samples');
  }

  const maxFrames = Math.ceil((limits.maxDurationSeconds * config.sampleRateHz) / SAMPLES_PER_AAC_FRAME);
  if (frameCount > maxFrames) {
    throw mp4DemuxError('audio_too_long', `${frameCount} frames exceeds the ${maxFrames}-frame ceiling`);
  }

  const outputBytes = measureOutput(sizes, limits);
  const durationSeconds = (frameCount * SAMPLES_PER_AAC_FRAME) / config.sampleRateHz;
  checkAgainstTimeTable(view, requireBox(view, stbl, 'stts', budget), timescale, frameCount, durationSeconds);

  const chunks = readChunkOffsets(view, stbl, budget);
  const stsc = readSampleToChunk(view, requireBox(view, stbl, 'stsc', budget), frameCount, chunks.count);

  const audio = writeAdtsStream(bytes, { sizes, chunks, stsc, config, outputBytes, mdats });

  return {
    audio,
    mimeType: 'audio/aac',
    codec: config.codec,
    sampleRateHz: config.sampleRateHz,
    channels: config.channels,
    durationSeconds,
    frameCount,
  };
}

/** `mdhd`: the media timescale, and the duration the container claims. Duration 0 is legal (and
 *  normal in a file still being written), so it is `null` rather than a failure. */
function readMediaHeader(
  view: DataView,
  mdia: Box,
  budget: BoxBudget,
): { readonly timescale: number; readonly durationSeconds: number | null } {
  const mdhd = requireBox(view, mdia, 'mdhd', budget);
  requireBodyBytes(mdhd, 4, 'mdhd FullBox header');
  const version = view.getUint8(mdhd.bodyStart);
  let timescale: number;
  let duration: number;

  if (version === 1) {
    requireBodyBytes(mdhd, 32, 'mdhd v1');
    timescale = view.getUint32(mdhd.bodyStart + 20);
    const raw = view.getBigUint64(mdhd.bodyStart + 24);
    // 0xffff…ff is the "unknown duration" convention; anything past 2^53 is not arithmetic.
    duration = raw > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(raw);
  } else {
    requireBodyBytes(mdhd, 20, 'mdhd v0');
    timescale = view.getUint32(mdhd.bodyStart + 12);
    duration = view.getUint32(mdhd.bodyStart + 16);
    if (duration === 0xffffffff) duration = 0;
  }

  if (timescale === 0) {
    throw mp4DemuxError('malformed', 'mdhd timescale is 0');
  }
  return { timescale, durationSeconds: duration === 0 ? null : duration / timescale };
}

/**
 * `stsd` → the first sample entry → its `esds` → the `AudioSpecificConfig`.
 *
 * The sample entry's own `channelcount` and `samplerate` fields are deliberately ignored: for
 * HE-AAC they routinely disagree with the config the decoder will actually use, and the ADTS
 * header has to match the config.
 */
function readAacConfig(view: DataView, stsd: Box, budget: BoxBudget): AacConfig {
  requireBodyBytes(stsd, 8, 'stsd header');
  if (view.getUint32(stsd.bodyStart + 4) === 0) {
    throw mp4DemuxError('malformed', 'stsd declares no sample entries');
  }

  const entries = readBoxes(view, stsd.bodyStart + 8, stsd.end, budget, 'stsd').next();
  if (entries.done === true) {
    throw mp4DemuxError('malformed', 'stsd entry count disagrees with its contents');
  }
  const entry = entries.value;
  if (entry.type !== 'mp4a') {
    throw mp4DemuxError('unsupported_codec', `audio sample entry is '${entry.type}', not 'mp4a'`);
  }

  requireBodyBytes(entry, 28, 'AudioSampleEntry');
  // QuickTime sound sample entry versions 1 and 2 append 16 and 36 bytes before the child boxes.
  const soundVersion = view.getUint16(entry.bodyStart + 8);
  const extra = soundVersion === 1 ? 16 : soundVersion === 2 ? 36 : 0;
  const childrenStart = entry.bodyStart + 28 + extra;
  if (childrenStart > entry.end) {
    throw mp4DemuxError('malformed', `mp4a v${soundVersion} entry is shorter than its own header`);
  }

  const container: Box = { type: 'mp4a', start: entry.start, bodyStart: childrenStart, end: entry.end };
  const esds = findBox(view, container, 'esds', budget) ?? findEsdsInWave(view, container, budget);
  if (esds === null) {
    throw mp4DemuxError('malformed', "mp4a entry has no 'esds' descriptor");
  }
  return readEsds(view, esds);
}

/** QuickTime-flavoured files nest the descriptor one level down, inside `wave`. */
function findEsdsInWave(view: DataView, container: Box, budget: BoxBudget): Box | null {
  const wave = findBox(view, container, 'wave', budget);
  return wave === null ? null : findBox(view, wave, 'esds', budget);
}

interface Descriptor {
  readonly tag: number;
  readonly start: number;
  readonly end: number;
}

/** MPEG-4 descriptor header: a tag byte then a length in 7-bit groups, at most 4 of them. */
function readDescriptor(view: DataView, at: number, limit: number): Descriptor {
  if (at + 2 > limit) {
    throw mp4DemuxError('malformed', 'esds: descriptor header runs past the box');
  }
  const tag = view.getUint8(at);
  let offset = at + 1;
  let length = 0;
  for (let i = 0; i < 4; i++) {
    if (offset >= limit) {
      throw mp4DemuxError('malformed', 'esds: descriptor length runs past the box');
    }
    const byte = view.getUint8(offset++);
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  const end = offset + length;
  if (end > limit) {
    throw mp4DemuxError('malformed', `esds: descriptor 0x${tag.toString(16)} claims ${length} bytes past the box`);
  }
  return { tag, start: offset, end };
}

const ES_DESCRIPTOR = 0x03;
const DECODER_CONFIG_DESCRIPTOR = 0x04;
const DECODER_SPECIFIC_INFO = 0x05;

/** `objectTypeIndication` values that mean "the DecoderSpecificInfo is an AudioSpecificConfig for
 *  AAC": MPEG-4 Audio, and the three MPEG-2 AAC profiles. MP3 (0x69, 0x6b) is explicitly not one
 *  of them — it is a different codec in the same container, and remuxing it to ADTS is nonsense. */
const AAC_OBJECT_TYPES = new Set([0x40, 0x66, 0x67, 0x68]);

function readEsds(view: DataView, esds: Box): AacConfig {
  requireBodyBytes(esds, 4, 'esds FullBox header');
  const es = readDescriptor(view, esds.bodyStart + 4, esds.end);
  if (es.tag !== ES_DESCRIPTOR) {
    throw mp4DemuxError('malformed', `esds: expected an ES_Descriptor, got 0x${es.tag.toString(16)}`);
  }

  let at = es.start + 2;
  if (at >= es.end) throw mp4DemuxError('malformed', 'esds: ES_Descriptor is empty');
  const flags = view.getUint8(at++);
  if ((flags & 0x80) !== 0) at += 2;
  if ((flags & 0x40) !== 0) {
    if (at >= es.end) throw mp4DemuxError('malformed', 'esds: URL length runs past the descriptor');
    at += 1 + view.getUint8(at);
  }
  if ((flags & 0x20) !== 0) at += 2;

  const config = readDescriptor(view, at, es.end);
  if (config.tag !== DECODER_CONFIG_DESCRIPTOR) {
    throw mp4DemuxError('malformed', `esds: expected a DecoderConfigDescriptor, got 0x${config.tag.toString(16)}`);
  }
  if (config.end - config.start < 13) {
    throw mp4DemuxError('malformed', 'esds: DecoderConfigDescriptor is too short');
  }

  const objectType = view.getUint8(config.start);
  if (!AAC_OBJECT_TYPES.has(objectType)) {
    throw mp4DemuxError('unsupported_codec', `objectTypeIndication 0x${objectType.toString(16)} is not AAC`);
  }

  const dsi = readDescriptor(view, config.start + 13, config.end);
  if (dsi.tag !== DECODER_SPECIFIC_INFO || dsi.end - dsi.start < 2) {
    throw mp4DemuxError('malformed', 'esds: no usable AudioSpecificConfig');
  }
  return parseAudioSpecificConfig(view, dsi.start, dsi.end - dsi.start);
}

/** `stsz`, in both its forms: one shared size, or one 32-bit size per sample. */
function readSampleSizes(view: DataView, stsz: Box): Table {
  requireBodyBytes(stsz, 12, 'stsz header');
  const uniform = view.getUint32(stsz.bodyStart + 4);
  const count = view.getUint32(stsz.bodyStart + 8);

  if (uniform !== 0) {
    return { count, at: () => uniform };
  }

  const entriesStart = stsz.bodyStart + 12;
  if (stsz.end - entriesStart < count * 4) {
    throw mp4DemuxError('malformed', `stsz claims ${count} sizes but the box holds ${stsz.end - entriesStart} bytes`);
  }
  return { count, at: (index) => view.getUint32(entriesStart + index * 4) };
}

/** `stco` (32-bit) or `co64` (64-bit). Real files past ~4 GB use `co64`, and so do some that are
 *  nowhere near it, so both are first-class. */
function readChunkOffsets(view: DataView, stbl: Box, budget: BoxBudget): Table {
  const co64 = findBox(view, stbl, 'co64', budget);
  const box = co64 ?? findBox(view, stbl, 'stco', budget);
  if (box === null) {
    throw mp4DemuxError('malformed', "stbl has neither 'stco' nor 'co64'");
  }

  requireBodyBytes(box, 8, `${box.type} header`);
  const count = view.getUint32(box.bodyStart + 4);
  const entriesStart = box.bodyStart + 8;
  const width = co64 === null ? 4 : 8;
  if (box.end - entriesStart < count * width) {
    throw mp4DemuxError('malformed', `${box.type} claims ${count} offsets the box cannot hold`);
  }

  if (co64 === null) {
    return { count, at: (index) => view.getUint32(entriesStart + index * 4) };
  }
  return {
    count,
    at: (index) => {
      const raw = view.getBigUint64(entriesStart + index * 8);
      if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw mp4DemuxError('malformed', `co64 offset ${raw} is not a usable offset`);
      }
      return Number(raw);
    },
  };
}

interface SampleToChunk {
  readonly count: number;
  firstChunk(index: number): number;
  samplesPerChunk(index: number): number;
}

/** `stsc`, validated up front: first chunk 1, strictly ascending, and no entry claiming more
 *  samples per chunk than the file has samples. */
function readSampleToChunk(view: DataView, stsc: Box, sampleCount: number, chunkCount: number): SampleToChunk {
  requireBodyBytes(stsc, 8, 'stsc header');
  const count = view.getUint32(stsc.bodyStart + 4);
  const entriesStart = stsc.bodyStart + 8;
  if (stsc.end - entriesStart < count * 12) {
    throw mp4DemuxError('malformed', `stsc claims ${count} entries the box cannot hold`);
  }
  if (count === 0) {
    throw mp4DemuxError('malformed', 'stsc is empty but the track has samples');
  }

  const firstChunk = (index: number): number => view.getUint32(entriesStart + index * 12);
  const samplesPerChunk = (index: number): number => view.getUint32(entriesStart + index * 12 + 4);

  if (firstChunk(0) !== 1) {
    throw mp4DemuxError('malformed', `stsc starts at chunk ${firstChunk(0)}, not 1`);
  }
  for (let i = 0; i < count; i++) {
    if (i > 0 && firstChunk(i) <= firstChunk(i - 1)) {
      throw mp4DemuxError('malformed', 'stsc first_chunk is not strictly ascending');
    }
    if (firstChunk(i) > chunkCount) {
      throw mp4DemuxError('malformed', `stsc references chunk ${firstChunk(i)} of ${chunkCount}`);
    }
    const per = samplesPerChunk(i);
    if (per < 1 || per > sampleCount) {
      throw mp4DemuxError('malformed', `stsc entry ${i} claims ${per} samples per chunk`);
    }
  }
  return { count, firstChunk, samplesPerChunk };
}

/** The output buffer's exact size, computed and checked before a byte of it is allocated. */
function measureOutput(sizes: Table, limits: Limits): number {
  let total = 0;
  for (let i = 0; i < sizes.count; i++) {
    const size = sizes.at(i);
    if (size < 1 || size > MAX_ADTS_FRAME_BYTES - ADTS_HEADER_BYTES) {
      throw mp4DemuxError('malformed', `sample ${i} is ${size} bytes, which no AAC frame is`);
    }
    total += size + ADTS_HEADER_BYTES;
    if (total > limits.maxOutputBytes) {
      throw mp4DemuxError('output_too_large', `ADTS stream exceeds ${limits.maxOutputBytes} bytes`);
    }
  }
  return total;
}

/**
 * The anti-silent-truncation check. `stts` states, independently of `stsz`/`stsc`, how many
 * samples the track has and how long they last; if our frame count or our duration disagrees with
 * it, we have mis-walked something and the right answer is to fail rather than to return a short
 * file that looks fine.
 *
 * The tolerance is wide on purpose — encoder priming and an edit list legitimately move the
 * container's duration by a fraction of a second — but it is nowhere near wide enough to hide a
 * dropped chunk.
 */
function checkAgainstTimeTable(
  view: DataView,
  stts: Box,
  timescale: number,
  frameCount: number,
  durationSeconds: number,
): void {
  requireBodyBytes(stts, 8, 'stts header');
  const count = view.getUint32(stts.bodyStart + 4);
  const entriesStart = stts.bodyStart + 8;
  if (stts.end - entriesStart < count * 8) {
    throw mp4DemuxError('malformed', `stts claims ${count} entries the box cannot hold`);
  }

  let samples = 0;
  let units = 0;
  for (let i = 0; i < count; i++) {
    const runLength = view.getUint32(entriesStart + i * 8);
    const delta = view.getUint32(entriesStart + i * 8 + 4);
    samples += runLength;
    units += runLength * delta;
    if (samples > frameCount) break;
  }

  if (samples !== frameCount) {
    throw mp4DemuxError('malformed', `stts counts ${samples} samples, stsz counts ${frameCount}`);
  }

  const containerSeconds = units / timescale;
  const drift = Math.abs(containerSeconds - durationSeconds);
  if (drift > 1 && drift > containerSeconds * 0.05) {
    throw mp4DemuxError(
      'malformed',
      `container says ${containerSeconds.toFixed(2)}s, the frames say ${durationSeconds.toFixed(2)}s`,
    );
  }
}

interface WritePlan {
  readonly sizes: Table;
  readonly chunks: Table;
  readonly stsc: SampleToChunk;
  readonly config: AacConfig;
  readonly outputBytes: number;
  readonly mdats: readonly ByteRange[];
}

/** Walks chunk by chunk, writing a header and copying a sample at a time. Every source range is
 *  checked against both the file and the `mdat` it claims to live in before it is read. */
function writeAdtsStream(bytes: Uint8Array, plan: WritePlan): Uint8Array {
  const { sizes, chunks, stsc, config, outputBytes, mdats } = plan;
  const out = new Uint8Array(outputBytes);

  let entry = 0;
  let sample = 0;
  let written = 0;

  for (let chunk = 0; chunk < chunks.count && sample < sizes.count; chunk++) {
    while (entry + 1 < stsc.count && stsc.firstChunk(entry + 1) <= chunk + 1) entry++;
    const perChunk = stsc.samplesPerChunk(entry);
    let offset = chunks.at(chunk);

    for (let i = 0; i < perChunk && sample < sizes.count; i++, sample++) {
      const size = sizes.at(sample);
      if (offset < 0 || offset + size > bytes.byteLength) {
        throw mp4DemuxError('truncated', `sample ${sample} ends past EOF (${offset}+${size})`);
      }
      if (!isInsideMdat(mdats, offset, offset + size)) {
        throw mp4DemuxError('malformed', `sample ${sample} at ${offset} is not inside any mdat`);
      }
      writeAdtsHeader(out, written, config, size + ADTS_HEADER_BYTES);
      written += ADTS_HEADER_BYTES;
      out.set(bytes.subarray(offset, offset + size), written);
      written += size;
      offset += size;
    }
  }

  if (sample !== sizes.count) {
    throw mp4DemuxError('malformed', `the chunk table covers ${sample} of ${sizes.count} samples`);
  }
  if (written !== outputBytes) {
    throw mp4DemuxError('malformed', `wrote ${written} bytes, planned ${outputBytes}`);
  }
  return out;
}

function isInsideMdat(mdats: readonly ByteRange[], start: number, end: number): boolean {
  for (const range of mdats) {
    if (start >= range.start && end <= range.end) return true;
  }
  return false;
}

function readFourCC(view: DataView, at: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += String.fromCharCode(view.getUint8(at + i));
  return out;
}
