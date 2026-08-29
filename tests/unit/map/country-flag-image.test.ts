import { beforeEach, describe, expect, it } from 'vitest';

import {
  COUNTRY_DISC,
  COUNTRY_DISC_CENTRE,
  COUNTRY_DISC_SIZE,
  buildCountryDiscImages,
  clearCountryDiscImageCache,
  countryDiscImageId,
  flagEmoji,
  hasFlagGlyphs,
  normaliseCountryCode,
} from '@/components/map/country-flag-image';

/**
 * The vitest environment is `node`: there is no canvas, which is the point. Everything the module
 * does to a 2D context is recorded here, so the drawing is assertable without a rasteriser. The
 * real pixels are checked by the Playwright render script, not by this file.
 */
interface Op {
  readonly op: string;
  readonly args: readonly unknown[];
}

interface FakeCanvas {
  width: number;
  height: number;
  readonly ops: Op[];
  readonly state: { fillStyle: string; strokeStyle: string; font: string; lineWidth: number };
  getContext(): unknown;
}

interface FakeOptions {
  /** Advance width returned by `measureText`, per string. Anything else gets `fallbackWidth`. */
  readonly widths?: Record<string, number>;
  readonly fallbackWidth?: number;
  /**
   * Alpha the fake `getImageData` reports, as a rectangle in canvas coordinates. This is how the
   * painted-box scan is driven: no rectangle means nothing was painted, and the module falls back
   * to the advance.
   */
  readonly painted?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** RGBA quadruple `getImageData` fills the probe raster with. */
  readonly pixel?: readonly [number, number, number, number];
  readonly noContext?: boolean;
  readonly throwOnGetImageData?: boolean;
  /** Fail only the 96px painted-box scan, the way a fingerprint-blocking browser would. */
  readonly throwOnScan?: boolean;
}

function makeCanvas(options: FakeOptions = {}): FakeCanvas {
  const ops: Op[] = [];
  const state = { fillStyle: '', strokeStyle: '', font: '', lineWidth: 0 };
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      ops.push({ op, args });
    };

  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    ops,
    state,
    getContext() {
      if (options.noContext) return null;
      return ctx;
    },
  };

  const ctx = {
    save: record('save'),
    restore: record('restore'),
    scale: record('scale'),
    translate: record('translate'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    arc: record('arc'),
    clip: record('clip'),
    stroke(...args: unknown[]) {
      ops.push({ op: 'stroke', args: [state.strokeStyle, state.lineWidth, ...args] });
    },
    fill(...args: unknown[]) {
      ops.push({ op: 'fill', args: [state.fillStyle, ...args] });
    },
    fillText(text: string, x: number, y: number) {
      ops.push({ op: 'fillText', args: [text, x, y, state.fillStyle, state.font] });
    },
    measureText(text: string) {
      return { width: options.widths?.[text] ?? options.fallbackWidth ?? 20 };
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      if (options.throwOnGetImageData) throw new Error('tainted');
      if (options.throwOnScan && w === 96) throw new Error('tainted');
      const [r, g, b, a] = options.pixel ?? [0, 0, 0, 255];
      const data = new Uint8ClampedArray(w * h * 4);
      const rect = options.painted;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const inside =
            !rect || (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h);
          if (!inside) continue;
          const i = (y * w + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
      return { width: w, height: h, data };
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set font(value: string) {
      state.font = value;
    },
    get font() {
      return state.font;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
  };

  return canvas;
}

/** A factory plus the canvases it handed out, so "did this rebuild?" is a length assertion. */
function factory(options: FakeOptions = {}) {
  const made: FakeCanvas[] = [];
  return {
    made,
    create: () => {
      const canvas = makeCanvas(options);
      made.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
  };
}

const JP = '\u{1F1EF}\u{1F1F5}';

/** The disc canvases only. The painted-box scan takes a scratch canvas of its own. */
function discs(f: { made: FakeCanvas[] }): FakeCanvas[] {
  return f.made.filter((c) => c.ops.some((o) => o.op === 'arc'));
}

beforeEach(() => {
  clearCountryDiscImageCache();
});

describe('normaliseCountryCode', () => {
  it('accepts two ASCII letters in any case', () => {
    expect(normaliseCountryCode('il')).toBe('IL');
    expect(normaliseCountryCode(' gb ')).toBe('GB');
  });

  it('rejects anything that is not a country code rather than guessing', () => {
    for (const input of ['ISR', 'G', '', '12', 'G1', null, undefined, 'ג']) {
      expect(normaliseCountryCode(input)).toBeNull();
    }
  });
});

describe('flagEmoji', () => {
  it('maps letters onto regional indicators', () => {
    expect(flagEmoji('JP')).toBe(JP);
    expect([...flagEmoji('GB')].map((c) => c.codePointAt(0))).toEqual([0x1f1ec, 0x1f1e7]);
  });
});

describe('countryDiscImageId', () => {
  it('is pure, deterministic, and safe to call with no document', () => {
    expect(countryDiscImageId({ countryCode: 'il' }, 'light')).toBe('country-disc:light:IL');
    expect(countryDiscImageId({ countryCode: 'IL', active: true }, 'light')).toBe(
      'country-disc:light:IL:active'
    );
    expect(countryDiscImageId({ countryCode: 'IL' }, 'dark')).toBe('country-disc:dark:IL');
  });

  it('collapses every unusable code onto one unflagged id', () => {
    expect(countryDiscImageId({ countryCode: null }, 'light')).toBe('country-disc:light:none');
    expect(countryDiscImageId({ countryCode: 'ISR' }, 'light')).toBe('country-disc:light:none');
  });
});

describe('hasFlagGlyphs — the feature test, forced both ways', () => {
  it('is true when the pair ligates and the font brings its own colour', () => {
    const f = factory({ widths: { [JP]: 36, '\u{1F1EF}': 36 }, pixel: [220, 40, 40, 255] });
    expect(hasFlagGlyphs(f.create)).toBe(true);
  });

  it('is false when the pair does not ligate, however colourful the result', () => {
    // Two boxed letters: the pair advances twice the single code point.
    const f = factory({ widths: { [JP]: 64, '\u{1F1EF}': 32 }, pixel: [220, 40, 40, 255] });
    expect(hasFlagGlyphs(f.create)).toBe(false);
  });

  it('is false when the pair ligates into a single monochrome glyph', () => {
    // One tofu box, drawn in our own black fill: no channel spread, so no colour glyph.
    const f = factory({ widths: { [JP]: 34, '\u{1F1EF}': 32 }, pixel: [0, 0, 0, 255] });
    expect(hasFlagGlyphs(f.create)).toBe(false);
  });

  it('fails closed when the raster cannot be read back', () => {
    const f = factory({ widths: { [JP]: 36, '\u{1F1EF}': 36 }, throwOnGetImageData: true });
    expect(hasFlagGlyphs(f.create)).toBe(false);
  });

  it('fails closed with no canvas and with no 2D context', () => {
    expect(hasFlagGlyphs(() => null)).toBe(false);
    expect(hasFlagGlyphs(factory({ noContext: true }).create)).toBe(false);
  });
});

describe('buildCountryDiscImages', () => {
  const base = { pixelRatio: 2, theme: 'light' } as const;

  function textOps(canvas: FakeCanvas): string[] {
    return canvas.ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
  }

  it('draws the flag glyph when the platform has flags', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(textOps(discs(f)[0]!)).toEqual([JP]);
  });

  it('draws the two-letter code in the same disc when it does not', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'gb' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: f.create,
    });
    expect(textOps(discs(f)[0]!)).toEqual(['GB']);
    const codeOp = discs(f)[0]!.ops.find((o) => o.op === 'fillText');
    expect(codeOp?.args[4]).toContain(`${COUNTRY_DISC.codeFontPx}px`);
    // The code is ink, never the mint reserved for the active ring.
    expect(codeOp?.args[3]).toBe('#1B1B1A');
  });

  it('draws an empty disc for an area with no country', () => {
    const f = factory();
    const [image] = buildCountryDiscImages([{ countryCode: null }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(image?.id).toBe('country-disc:light:none');
    expect(textOps(discs(f)[0]!)).toEqual([]);
  });

  it('rings the active country in the mint token and nothing else', () => {
    const f = factory();
    buildCountryDiscImages(
      [{ countryCode: 'IL' }, { countryCode: 'IL', active: true }],
      { ...base, flagGlyphs: true, createCanvas: f.create }
    );
    const strokes = (c: FakeCanvas) =>
      c.ops.filter((o) => o.op === 'stroke').map((o) => String(o.args[0]));
    expect(strokes(discs(f)[0]!)).toEqual(['#E7E3DC']);
    expect(strokes(discs(f)[1]!)).toEqual(['#E7E3DC', '#2E7A70']);
  });

  it('uses the dark surface and the same mint ring in the dark theme', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'IL', active: true }], {
      pixelRatio: 2,
      theme: 'dark',
      flagGlyphs: true,
      createCanvas: f.create,
    });
    const disc = discs(f)[0]!;
    expect(disc.ops.filter((o) => o.op === 'fill').map((o) => String(o.args[0]))).toContain('#1C232B');
    expect(disc.ops.filter((o) => o.op === 'stroke').map((o) => String(o.args[0]))).toEqual([
      '#2A323B',
      '#2E7A70',
    ]);
  });

  describe('device pixel ratio', () => {
    for (const dpr of [1, 2, 3]) {
      it(`allocates and scales the bitmap at ${dpr}x`, () => {
        const f = factory();
        const [image] = buildCountryDiscImages([{ countryCode: 'IL' }], {
          pixelRatio: dpr,
          theme: 'light',
          flagGlyphs: true,
          createCanvas: f.create,
        });
        const disc = discs(f)[0]!;
        expect(disc.width).toBe(Math.ceil(COUNTRY_DISC_SIZE * dpr));
        expect(disc.height).toBe(Math.ceil(COUNTRY_DISC_SIZE * dpr));
        // The first scale is the DPR one: the geometry below it is authored in CSS pixels.
        expect(disc.ops.filter((o) => o.op === 'scale')[0]!.args).toEqual([dpr, dpr]);
        // MapLibre lays the bitmap out at width / pixelRatio, so this is what keeps 1x, 2x and
        // 3x the same size on screen instead of three different sizes.
        expect(image?.pixelRatio).toBe(dpr);
      });
    }
  });

  it('never rebuilds the same country at the same pixel ratio', () => {
    const f = factory();
    const opts = { ...base, flagGlyphs: true, createCanvas: f.create };
    buildCountryDiscImages([{ countryCode: 'IL' }, { countryCode: 'IL' }], opts);
    buildCountryDiscImages([{ countryCode: 'IL' }], opts);
    expect(discs(f)).toHaveLength(1);
    // The painted-box scan is memoised too: one scratch canvas for the whole run.
    expect(f.made).toHaveLength(2);
  });

  it('rebuilds when the pixel ratio, the theme or the state differs', () => {
    const f = factory();
    const at = (pixelRatio: number, theme: 'light' | 'dark', active: boolean) =>
      buildCountryDiscImages([{ countryCode: 'IL', active }], {
        pixelRatio,
        theme,
        flagGlyphs: true,
        createCanvas: f.create,
      });
    at(2, 'light', false);
    at(3, 'light', false);
    at(2, 'dark', false);
    at(2, 'light', true);
    expect(discs(f)).toHaveLength(4);
  });

  it('degrades to no icons rather than throwing when there is no canvas', () => {
    expect(buildCountryDiscImages([{ countryCode: 'IL' }], { ...base, createCanvas: () => null }))
      .toEqual([]);
    // The default factory reads `document`, which does not exist in this environment.
    expect(buildCountryDiscImages([{ countryCode: 'IL' }], base)).toEqual([]);
    expect(buildCountryDiscImages([], base)).toEqual([]);
  });
});

describe('fitting the glyph to the disc', () => {
  const base = { pixelRatio: 1, theme: 'light' } as const;

  /** A painted rectangle in the scan canvas, expressed relative to the scan's text origin. */
  const painted = (left: number, top: number, w: number, h: number) => ({
    x: 24 + left,
    y: 68 + top,
    w,
    h,
  });

  it('scales the painted pixels, not the advance, and centres on them', () => {
    // Chromium reports the same generic box for every flag while painting 28x21 of it, so the
    // advance and the reported metrics both overstate the glyph. 54x40 painted fits at 0.5.
    const f = factory({ painted: painted(0, -40, 54, 40), fallbackWidth: 90 });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    const ops = discs(f)[0]!.ops;
    expect(ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      COUNTRY_DISC.flagWidth / 54,
      COUNTRY_DISC.flagWidth / 54,
    ]);
    const text = ops.find((o) => o.op === 'fillText');
    expect([text?.args[1], text?.args[2]]).toEqual([-27, 20]);
  });

  it('takes the tighter of the two constraints so a tall glyph cannot overflow the disc', () => {
    const f = factory({ painted: painted(0, -60, 40, 60) });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(discs(f)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      COUNTRY_DISC.flagHeight / 60,
      COUNTRY_DISC.flagHeight / 60,
    ]);
  });

  it('falls back to the advance when the raster cannot be read back', () => {
    const f = factory({ fallbackWidth: 56, throwOnScan: true });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(discs(f)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      COUNTRY_DISC.flagWidth / 56,
      COUNTRY_DISC.flagWidth / 56,
    ]);
  });

  it('squeezes a two-letter code that would overrun the disc, and leaves a narrow one alone', () => {
    const wide = factory({ painted: painted(0, -10, 60, 10) });
    buildCountryDiscImages([{ countryCode: 'WW' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: wide.create,
    });
    expect(discs(wide)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      (COUNTRY_DISC.diameter - 10) / 60,
      1,
    ]);

    const narrow = factory({ painted: painted(0, -10, 20, 10) });
    buildCountryDiscImages([{ countryCode: 'IL' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: narrow.create,
    });
    // Only the device-pixel-ratio scale; the code is drawn at its natural width.
    expect(discs(narrow)[0]!.ops.filter((o) => o.op === 'scale')).toHaveLength(1);
  });
});

describe('geometry', () => {
  it('reserves ring room in every bitmap so the disc centre never moves', () => {
    expect(COUNTRY_DISC_CENTRE).toBe(COUNTRY_DISC_SIZE / 2);
    const ringOuter = COUNTRY_DISC.diameter / 2 + COUNTRY_DISC.ringGap + COUNTRY_DISC.ringWidth;
    expect(COUNTRY_DISC_SIZE).toBeGreaterThanOrEqual(2 * ringOuter);
  });
});
