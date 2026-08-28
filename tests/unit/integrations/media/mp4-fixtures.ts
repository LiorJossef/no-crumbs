/**
 * Fixture machinery for the MP4 demuxer tests: a real file, surgery on that real file, and a
 * builder for the structures a real file will not give us (co64, 64-bit box sizes, a video track
 * in front of the audio one, a deliberately broken table).
 *
 * The real fixtures are synthesised locally by `say` + `afconvert` — see `fixtures/README.md`.
 * Nothing here touches the network and no third-party media is involved.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

export function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_DIR + name));
}

// --- reading and editing an existing file ------------------------------------------------

export interface FoundBox {
  readonly type: string;
  readonly start: number;
  readonly bodyStart: number;
  readonly end: number;
}

/** Containers whose children do not start immediately after the 8-byte header. */
const BODY_SKIP: Record<string, number> = { stsd: 8, mp4a: 28 };

function children(bytes: Uint8Array, start: number, end: number): FoundBox[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: FoundBox[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = view.getUint32(offset);
    let type = '';
    for (let i = 0; i < 4; i++) type += String.fromCharCode(view.getUint8(offset + 4 + i));
    let headerBytes = 8;
    let size = size32;
    if (size32 === 1) {
      size = Number(view.getBigUint64(offset + 8));
      headerBytes = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    const skip = BODY_SKIP[type] ?? 0;
    found.push({ type, start: offset, bodyStart: offset + headerBytes + skip, end: offset + size });
    offset += size;
  }
  return found;
}

/** Locates a box by path, e.g. `['moov', 'trak', 'mdia', 'hdlr']`. */
export function locate(bytes: Uint8Array, path: readonly string[]): FoundBox {
  let start = 0;
  let end = bytes.byteLength;
  let box: FoundBox | undefined;
  for (const type of path) {
    box = children(bytes, start, end).find((c) => c.type === type);
    if (box === undefined) throw new Error(`fixture has no ${path.join('/')} (missing '${type}')`);
    start = box.bodyStart;
    end = box.end;
  }
  if (box === undefined) throw new Error('empty path');
  return box;
}

export function withBytesAt(bytes: Uint8Array, offset: number, replacement: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  copy.set(replacement, offset);
  return copy;
}

export function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

/**
 * Rewrites a real file's `stco` as a `co64`, in place, by borrowing the 8 extra bytes per entry
 * from the `free` padding that `afconvert` leaves before `mdat`. Nothing moves, so every chunk
 * offset in the file stays correct — which is the point: this exercises the 64-bit path against
 * real sample data rather than against a builder's idea of it.
 */
export function stcoToCo64(bytes: Uint8Array): Uint8Array {
  const stco = locate(bytes, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
  const free = locate(bytes, ['free']);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(stco.bodyStart + 4);
  const grow = count * 4;
  if (free.end - free.start < grow + 8) throw new Error('free box is too small to borrow from');

  const co64 = new Uint8Array(stco.end - stco.start + grow);
  const out = new DataView(co64.buffer);
  out.setUint32(0, co64.byteLength);
  co64.set(ascii('co64'), 4);
  co64.set(bytes.subarray(stco.bodyStart, stco.bodyStart + 8), 8); // version/flags + count
  for (let i = 0; i < count; i++) {
    out.setBigUint64(16 + i * 8, BigInt(view.getUint32(stco.bodyStart + 8 + i * 4)));
  }

  const result = new Uint8Array(bytes.byteLength);
  result.set(bytes.subarray(0, stco.start), 0);
  result.set(co64, stco.start);
  // Everything between the old stco and the free box slides up by `grow`; free absorbs it.
  result.set(bytes.subarray(stco.end, free.start), stco.start + co64.byteLength);
  const newFreeStart = free.start + grow;
  const newFreeSize = free.end - free.start - grow;
  const freeHeader = new Uint8Array(8);
  new DataView(freeHeader.buffer).setUint32(0, newFreeSize);
  freeHeader.set(ascii('free'), 4);
  result.set(freeHeader, newFreeStart);
  result.set(bytes.subarray(free.end), free.end);

  for (const path of [
    ['moov'],
    ['moov', 'trak'],
    ['moov', 'trak', 'mdia'],
    ['moov', 'trak', 'mdia', 'minf'],
    ['moov', 'trak', 'mdia', 'minf', 'stbl'],
  ]) {
    const ancestor = locate(bytes, path);
    new DataView(result.buffer).setUint32(ancestor.start, ancestor.end - ancestor.start + grow);
  }
  return result;
}

// --- building a file from nothing --------------------------------------------------------

export function u8(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

export function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value);
  return out;
}

export function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** A box with a 32-bit size, or a 64-bit one when `large` is set. */
export function box(type: string, parts: readonly Uint8Array[], large = false): Uint8Array {
  const body = concat(parts);
  if (!large) return concat([u32(body.byteLength + 8), ascii(type), body]);
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  header.set(ascii(type), 4);
  view.setBigUint64(8, BigInt(body.byteLength + 16));
  return concat([header, body]);
}

/** A descriptor with a single-byte length; every descriptor we build is far under 128 bytes. */
function descriptor(tag: number, body: Uint8Array): Uint8Array {
  return concat([u8(tag, body.byteLength), body]);
}

function audioSpecificConfig(objectType: number, sampleRateIndex: number, channels: number, coreObjectType?: number): Uint8Array {
  const bits: number[] = [];
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(objectType, 5);
  push(sampleRateIndex, 4);
  push(channels, 4);
  if (coreObjectType !== undefined) {
    push(sampleRateIndex, 4); // extension sample rate
    push(coreObjectType, 5);
  }
  while (bits.length % 8 !== 0) bits.push(0);
  const out = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => {
    if (bit === 1) out.set([(out.at(i >> 3) ?? 0) | (1 << (7 - (i & 7)))], i >> 3);
  });
  return out;
}

export interface BuildOptions {
  frames?: readonly Uint8Array[];
  sampleRateIndex?: number;
  channels?: number;
  objectType?: number;
  /** Set to build an explicit-SBR config wrapping this core object type. */
  coreObjectType?: number;
  objectTypeIndication?: number;
  sampleEntryType?: string;
  handler?: string;
  /** A `vide` track emitted before the audio one, to prove selection is by handler. */
  videoTrackFirst?: boolean;
  co64?: boolean;
  largeMdat?: boolean;
  samplesPerChunk?: number;
  timescale?: number;
  sttsDelta?: number;
  sttsCountOverride?: number;
  stszCountOverride?: number;
  chunkOffsetDelta?: number;
  /** Overrides the duration `mdhd` claims; 0 is the "unknown" convention. */
  mdhdDuration?: number;
  omit?: readonly string[];
}

const DEFAULT_FRAMES = [new Uint8Array(80).fill(0x21), new Uint8Array(90).fill(0x22), new Uint8Array(70).fill(0x23)];

/**
 * Builds a minimal but genuinely well-formed MP4 around a set of frames. `mvhd`/`tkhd` are
 * omitted on purpose — the demuxer never reads them, and a fixture that carries boxes the code
 * under test ignores hides which fields are actually load-bearing.
 */
export function buildMp4(options: BuildOptions = {}): Uint8Array {
  const frames = options.frames ?? DEFAULT_FRAMES;
  const sampleRateIndex = options.sampleRateIndex ?? 4;
  const sampleRate = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][sampleRateIndex] ?? 44100;
  const channels = options.channels ?? 2;
  const objectType = options.objectType ?? 2;
  const timescale = options.timescale ?? sampleRate;
  const sttsDelta = options.sttsDelta ?? 1024;
  const samplesPerChunk = options.samplesPerChunk ?? 1;
  const omit = new Set(options.omit ?? []);
  const chunkCount = Math.ceil(frames.length / samplesPerChunk);

  const asc = audioSpecificConfig(objectType, sampleRateIndex, channels, options.coreObjectType);
  const esds = box('esds', [
    u32(0),
    descriptor(
      0x03,
      concat([
        u16(1),
        u8(0),
        descriptor(0x04, concat([u8(options.objectTypeIndication ?? 0x40, 0x15), u8(0, 0, 0), u32(0), u32(0), descriptor(0x05, asc)])),
        descriptor(0x06, u8(0x02)),
      ]),
    ),
  ]);

  const sampleEntry = box(options.sampleEntryType ?? 'mp4a', [
    new Uint8Array(6),
    u16(1),
    u16(0),
    u16(0),
    u32(0),
    u16(channels),
    u16(16),
    u16(0),
    u16(0),
    u32(sampleRate << 16),
    ...(omit.has('esds') ? [] : [esds]),
  ]);

  const stsd = box('stsd', [u32(0), u32(1), sampleEntry]);
  const stts = box('stts', [u32(0), u32(1), u32(options.sttsCountOverride ?? frames.length), u32(sttsDelta)]);
  const stsc = box('stsc', [u32(0), u32(1), u32(1), u32(samplesPerChunk), u32(1)]);
  const stsz = box('stsz', [u32(0), u32(0), u32(options.stszCountOverride ?? frames.length), ...frames.map((f) => u32(f.byteLength))]);

  const mediaDuration = frames.length * sttsDelta;
  const mdhd = box('mdhd', [u32(0), u32(0), u32(0), u32(timescale), u32(options.mdhdDuration ?? mediaDuration), u16(0x55c4), u16(0)]);
  const hdlr = box('hdlr', [u32(0), u32(0), ascii(options.handler ?? 'soun'), new Uint8Array(12), u8(0)]);

  const videoTrak = box('trak', [
    box('mdia', [
      box('mdhd', [u32(0), u32(0), u32(0), u32(1000), u32(1000), u16(0x55c4), u16(0)]),
      box('hdlr', [u32(0), u32(0), ascii('vide'), new Uint8Array(12), u8(0)]),
      box('minf', [box('stbl', [box('stsd', [u32(0), u32(0)])])]),
    ]),
  ]);

  // Two passes: the chunk offsets depend on where mdat lands, which depends on the size of the
  // table that holds them — but not on their values, so the second pass is the same size.
  const assemble = (chunkOffsets: readonly number[]): { file: Uint8Array; dataStart: number } => {
    const offsetBox = options.co64 === true
      ? box('co64', [u32(0), u32(chunkCount), ...chunkOffsets.map((o) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(o)); return b; })])
      : box('stco', [u32(0), u32(chunkCount), ...chunkOffsets.map(u32)]);

    const stbl = box('stbl', [
      ...(omit.has('stsd') ? [] : [stsd]),
      ...(omit.has('stts') ? [] : [stts]),
      ...(omit.has('stsc') ? [] : [stsc]),
      ...(omit.has('stsz') ? [] : [stsz]),
      ...(omit.has('stco') ? [] : [offsetBox]),
    ]);
    const trak = box('trak', [
      box('mdia', [...(omit.has('mdhd') ? [] : [mdhd]), hdlr, box('minf', [stbl])]),
    ]);
    const moov = box('moov', options.videoTrackFirst === true ? [videoTrak, trak] : [trak]);
    const ftyp = box('ftyp', [ascii('isom'), u32(512), ascii('isomiso2mp41')]);
    const mdatHeader = options.largeMdat === true ? 16 : 8;
    const dataStart = ftyp.byteLength + moov.byteLength + mdatHeader;
    const mdat = box('mdat', frames, options.largeMdat === true);
    return { file: concat([ftyp, moov, mdat]), dataStart };
  };

  const probe = assemble(new Array<number>(chunkCount).fill(0));
  const offsets: number[] = [];
  let at = probe.dataStart + (options.chunkOffsetDelta ?? 0);
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    offsets.push(at);
    for (let i = 0; i < samplesPerChunk; i++) {
      at += frames[chunk * samplesPerChunk + i]?.byteLength ?? 0;
    }
  }
  return assemble(offsets).file;
}
