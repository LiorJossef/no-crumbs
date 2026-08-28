import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { TranscriptionInput } from '@/domain/ports';
import { SAMPLES_PER_AAC_FRAME } from '@/integrations/media/aac';
import { extractAacFromMp4 } from '@/integrations/media/mp4-aac-demux';

import { buildMp4, loadFixture, stcoToCo64 } from './mp4-fixtures';

/** `speech-aac.m4a`, per `fixtures/README.md`: 44.1 kHz mono AAC-LC, 362 packets. Those numbers
 *  come from CoreAudio's own `afinfo`, not from this parser. */
const FIXTURE_FRAMES = 362;
const FIXTURE_RATE = 44100;

const hasCoreAudio = process.platform === 'darwin';

describe('extractAacFromMp4, on a real MP4', () => {
  const mp4 = loadFixture('speech-aac.m4a');

  it('reports the parameters CoreAudio reports for the same file', () => {
    const track = extractAacFromMp4(mp4);

    expect(track.mimeType).toBe('audio/aac');
    expect(track.codec).toBe('aac-lc');
    expect(track.sampleRateHz).toBe(FIXTURE_RATE);
    expect(track.channels).toBe(1);
    expect(track.frameCount).toBe(FIXTURE_FRAMES);
    expect(track.durationSeconds).toBeCloseTo((FIXTURE_FRAMES * SAMPLES_PER_AAC_FRAME) / FIXTURE_RATE, 6);
  });

  it('hands the transcriber its input with nothing in between', () => {
    // Structural, and deliberately so: if `TranscriptionInput` or `Mp4Audio` drifts, this stops
    // compiling rather than growing an adapter nobody decided to add.
    const input: TranscriptionInput = extractAacFromMp4(mp4);
    expect(input.mimeType).toBe('audio/aac');
    expect(input.audio.byteLength).toBeGreaterThan(0);
  });

  it('emits one ADTS frame per stored sample, and copies the payload verbatim', () => {
    const track = extractAacFromMp4(mp4);

    // Walk the output the way a decoder does: syncword, then the frame length field.
    let offset = 0;
    let frames = 0;
    let payload = 0;
    while (offset < track.audio.byteLength) {
      expect(track.audio[offset]).toBe(0xff);
      expect(track.audio[offset + 1]).toBe(0xf1);
      const length = ((track.audio[offset + 3]! & 3) << 11) | (track.audio[offset + 4]! << 3) | (track.audio[offset + 5]! >> 5);
      expect(length).toBeGreaterThan(7);
      payload += length - 7;
      offset += length;
      frames++;
    }

    expect(offset).toBe(track.audio.byteLength);
    expect(frames).toBe(FIXTURE_FRAMES);
    // 66,603 audio bytes, per afinfo. Nothing added, nothing dropped.
    expect(payload).toBe(66603);
    expect(track.audio.byteLength).toBe(payload + frames * 7);
  });

  it('reads the same stream out of a co64 file with 64-bit chunk offsets', () => {
    const original = extractAacFromMp4(mp4);
    const converted = extractAacFromMp4(stcoToCo64(mp4));

    expect(converted.frameCount).toBe(original.frameCount);
    expect(converted.sampleRateHz).toBe(original.sampleRateHz);
    expect(Buffer.from(converted.audio)).toEqual(Buffer.from(original.audio));
  });

  it.skipIf(!hasCoreAudio)('round-trips through CoreAudio at the duration the frames imply', () => {
    const track = extractAacFromMp4(mp4);
    const dir = mkdtempSync(join(tmpdir(), 'mp4-demux-'));
    const aacPath = join(dir, 'out.aac');
    const wavPath = join(dir, 'out.wav');
    writeFileSync(aacPath, track.audio);

    // afinfo/afconvert are Apple's decoder, not ours: a header we got wrong decodes to silence or
    // to the wrong length, and neither assertion below would hold.
    const info = execFileSync('/usr/bin/afinfo', [aacPath], { encoding: 'utf8' });
    expect(info).toContain('adts');
    expect(info).toMatch(/1 ch,\s+44100 Hz, aac/);
    expect(info).toMatch(new RegExp(`audio packets:\\s+${FIXTURE_FRAMES}\\b`));

    execFileSync('/usr/bin/afconvert', [aacPath, '-d', 'LEI16', '-f', 'WAVE', wavPath]);
    const wav = execFileSync('/usr/bin/afinfo', [wavPath], { encoding: 'utf8' });
    const seconds = Number(/estimated duration: ([\d.]+) sec/.exec(wav)?.[1]);
    expect(seconds).toBeCloseTo(track.durationSeconds, 2);

    // And the decoded PCM is not silence — a wrong profile or sample-rate index decodes cleanly
    // to zeros, which is the failure this whole test exists to catch.
    const pcm = readFileSync(wavPath);
    expect(pcm.subarray(44).some((byte) => byte !== 0)).toBe(true);
  });
});

describe('extractAacFromMp4, on structures a real fixture cannot supply', () => {
  it('picks the soun track even when a vide track comes first', () => {
    const track = extractAacFromMp4(buildMp4({ videoTrackFirst: true }));
    expect(track.frameCount).toBe(3);
    expect(track.channels).toBe(2);
  });

  it('reads samples out of an mdat with a 64-bit box size', () => {
    const plain = extractAacFromMp4(buildMp4());
    const large = extractAacFromMp4(buildMp4({ largeMdat: true }));
    expect(Buffer.from(large.audio)).toEqual(Buffer.from(plain.audio));
  });

  it('walks multi-sample chunks in order', () => {
    const frames = Array.from({ length: 9 }, (_, i) => new Uint8Array(20 + i).fill(0x40 + i));
    const track = extractAacFromMp4(buildMp4({ frames, samplesPerChunk: 4 }));

    expect(track.frameCount).toBe(9);
    let offset = 0;
    for (const frame of frames) {
      const body = track.audio.subarray(offset + 7, offset + 7 + frame.byteLength);
      expect(Buffer.from(body)).toEqual(Buffer.from(frame));
      offset += 7 + frame.byteLength;
    }
  });

  it('unwraps explicit SBR signalling to the core profile the ADTS header can express', () => {
    const track = extractAacFromMp4(buildMp4({ objectType: 5, coreObjectType: 2, sampleRateIndex: 6 }));

    expect(track.codec).toBe('he-aac');
    expect(track.sampleRateHz).toBe(24000);
    // profile bits = core object type - 1 = 1 (LC), sample-rate index 6.
    expect(track.audio[2]! >> 6).toBe(1);
    expect((track.audio[2]! >> 2) & 0xf).toBe(6);
  });

  it('accepts a constant-size stsz', () => {
    const frames = [new Uint8Array(64).fill(1), new Uint8Array(64).fill(2)];
    const track = extractAacFromMp4(buildMp4({ frames }));
    expect(track.audio.byteLength).toBe(2 * (64 + 7));
  });
});
