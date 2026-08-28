/**
 * A deliberately small, deliberately paranoid ISO base-media-file-format (MP4) box walker.
 *
 * Every number this module reads came off the public internet, so nothing here trusts a length
 * field: a box may not end past its parent, a header must fit before it is read, a type must be
 * four printable bytes, and the whole parse runs on a shared fuel budget so that a file built to
 * fan out into a million siblings stops rather than spins. Nesting needs no depth counter — the
 * demuxer only ever descends fixed paths (`moov/trak/mdia/minf/stbl`), so depth is bounded by the
 * code rather than by the file.
 *
 * It allocates nothing per box beyond the descriptor, and never copies payload bytes.
 */

import { mp4DemuxError } from './demux-errors';

/** A box header is 8 bytes, or 16 when `size == 1` puts a 64-bit `largesize` after the type. */
const HEADER_BYTES = 8;
const LARGE_HEADER_BYTES = 16;

/** `Number.MAX_SAFE_INTEGER`, as the ceiling on a 64-bit `largesize` before it stops being an
 *  offset we can do arithmetic on. Any real file is many orders of magnitude below it. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Fuel for one whole parse. Enumerating a container costs one unit per child, so a file whose
 *  `moov` holds a million empty `free` boxes runs out here instead of running for a minute. Real
 *  files spend a few dozen: we enumerate the top level, `moov`, each `trak`, and one `stbl`. */
const BOX_BUDGET = 8192;

export interface Box {
  readonly type: string;
  /** Offset of the box header. */
  readonly start: number;
  /** Offset of the first payload byte, after the header. */
  readonly bodyStart: number;
  /** Exclusive end of the whole box. */
  readonly end: number;
}

export interface BoxBudget {
  left: number;
}

export function createBoxBudget(): BoxBudget {
  return { left: BOX_BUDGET };
}

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

/**
 * Reads one box header at `offset`. Returns `null` only when `offset` is exactly the container
 * end. Throws for everything else, including the 1–7 trailing bytes that cannot hold a header —
 * that is what a cut-off download looks like.
 */
function readHeader(view: DataView, offset: number, containerEnd: number, where: string): Box | null {
  const remaining = containerEnd - offset;
  if (remaining === 0) return null;
  if (remaining < HEADER_BYTES) {
    throw mp4DemuxError('truncated', `${where}: ${remaining} trailing bytes cannot hold a box header`);
  }

  let type = '';
  for (let i = 0; i < 4; i++) {
    const byte = view.getUint8(offset + 4 + i);
    if (!isPrintableAscii(byte)) {
      throw mp4DemuxError('malformed', `${where}: box type at ${offset} is not printable ASCII`);
    }
    type += String.fromCharCode(byte);
  }

  const size32 = view.getUint32(offset);
  let headerBytes = HEADER_BYTES;
  let size: number;

  if (size32 === 1) {
    if (remaining < LARGE_HEADER_BYTES) {
      throw mp4DemuxError('truncated', `${where}: '${type}' claims a 64-bit size with no room for it`);
    }
    const large = view.getBigUint64(offset + HEADER_BYTES);
    if (large > MAX_SAFE) {
      throw mp4DemuxError('malformed', `${where}: '${type}' 64-bit size ${large} is not a usable offset`);
    }
    size = Number(large);
    headerBytes = LARGE_HEADER_BYTES;
  } else if (size32 === 0) {
    // Legal, and used by live-muxed files: the box runs to the end of its container.
    size = remaining;
  } else {
    size = size32;
  }

  if (size < headerBytes) {
    throw mp4DemuxError('malformed', `${where}: '${type}' declares size ${size}, below its own header`);
  }
  if (size > remaining) {
    throw mp4DemuxError('truncated', `${where}: '${type}' at ${offset} ends ${size - remaining} bytes past EOF`);
  }

  return { type, start: offset, bodyStart: offset + headerBytes, end: offset + size };
}

/**
 * Enumerates the direct children of a byte range. Each step advances by at least a full header,
 * so the loop cannot stall; the budget bounds it from the other side.
 */
export function* readBoxes(
  view: DataView,
  start: number,
  end: number,
  budget: BoxBudget,
  where: string,
): Generator<Box> {
  let offset = start;
  while (offset < end) {
    if (budget.left-- <= 0) {
      throw mp4DemuxError('malformed', `${where}: box budget exhausted; this file fans out abnormally`);
    }
    const box = readHeader(view, offset, end, where);
    if (box === null) return;
    yield box;
    offset = box.end;
  }
}

/** The first child of `parent` with this type, or `null`. */
export function findBox(view: DataView, parent: Box, type: string, budget: BoxBudget): Box | null {
  for (const child of readBoxes(view, parent.bodyStart, parent.end, budget, parent.type)) {
    if (child.type === type) return child;
  }
  return null;
}

/** `findBox`, for a box whose absence means the file is not one we can read. */
export function requireBox(view: DataView, parent: Box, type: string, budget: BoxBudget): Box {
  const box = findBox(view, parent, type, budget);
  if (box === null) {
    throw mp4DemuxError('malformed', `'${parent.type}' has no '${type}' child`);
  }
  return box;
}

/** Descends a fixed chain of single children, e.g. `mdia → minf → stbl`. */
export function requirePath(view: DataView, parent: Box, path: readonly string[], budget: BoxBudget): Box {
  let box = parent;
  for (const type of path) {
    box = requireBox(view, box, type, budget);
  }
  return box;
}

/** Asserts a box's payload is at least `bytes` long before anything reads inside it. */
export function requireBodyBytes(box: Box, bytes: number, what: string): void {
  if (box.end - box.bodyStart < bytes) {
    throw mp4DemuxError('malformed', `'${box.type}' is too short for ${what} (${bytes} bytes)`);
  }
}
