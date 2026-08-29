import { beforeEach, describe, expect, it } from 'vitest';

import {
  SUMMARY_PILL,
  SUMMARY_PILL_HEIGHT,
  buildCountryDiscImages,
  clearCountryDiscImageCache,
  countryDiscImageId,
  flagEmoji,
  hasFlagGlyphs,
  normaliseCountryCode,
  summaryPillWidth,
} from '@/components/map/country-flag-image';

/**
 * The vitest environment is `node`: there is no canvas, which is the point. Everything the module
 * does to a 2D context is recorded here, so the drawing is assertable without a rasteriser. The
 * real pixels are checked on screen, not by this file.
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
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
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

/** The pill canvases only. The painted-box scan takes a scratch canvas of its own, and it never
 *  draws a path. */
function pills(f: { made: FakeCanvas[] }): FakeCanvas[] {
  return f.made.filter((c) => c.ops.some((o) => o.op === 'moveTo'));
}

function strokes(canvas: FakeCanvas): { colour: string; width: number }[] {
  return canvas.ops
    .filter((o) => o.op === 'stroke')
    .map((o) => ({ colour: String(o.args[0]), width: Number(o.args[1]) }));
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
    expect(countryDiscImageId({ countryCode: 'il' }, 'light')).toBe('summary-pill:light:IL');
    expect(countryDiscImageId({ countryCode: 'IL', active: true }, 'light')).toBe(
      'summary-pill:light:IL:active'
    );
    expect(countryDiscImageId({ countryCode: 'IL' }, 'dark')).toBe('summary-pill:dark:IL');
  });

  it('collapses every unusable code onto one capless id', () => {
    expect(countryDiscImageId({ countryCode: null }, 'light')).toBe('summary-pill:light:none');
    expect(countryDiscImageId({ countryCode: 'ISR' }, 'light')).toBe('summary-pill:light:none');
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
    expect(textOps(pills(f)[0]!)).toEqual([JP]);
  });

  it('draws the two-letter code in the same cap when it does not', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'gb' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: f.create,
    });
    expect(textOps(pills(f)[0]!)).toEqual(['GB']);
    const codeOp = pills(f)[0]!.ops.find((o) => o.op === 'fillText');
    expect(codeOp?.args[4]).toContain(`${SUMMARY_PILL.codeFontPx}px`);
    // The code is ink, never the mint reserved for the active ring.
    expect(codeOp?.args[3]).toBe('#1B1B1A');
  });

  it('draws a capless pill for an area, and for a country we cannot name', () => {
    const f = factory();
    const [image] = buildCountryDiscImages([{ countryCode: null }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(image?.id).toBe('summary-pill:light:none');
    expect(textOps(pills(f)[0]!)).toEqual([]);
    // Only the pill's own border: no cap means no cap ring.
    expect(strokes(pills(f)[0]!)).toEqual([
      { colour: '#E7E3DC', width: SUMMARY_PILL.borderWidth },
    ]);
  });

  it('rings the active country in the mint token and nothing else', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'IL' }, { countryCode: 'IL', active: true }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    // Inactive: hairline pill border, then the hairline round the flag cap.
    expect(strokes(pills(f)[0]!)).toEqual([
      { colour: '#E7E3DC', width: SUMMARY_PILL.borderWidth },
      { colour: '#E7E3DC', width: SUMMARY_PILL.borderWidth },
    ]);
    // Active: the *pill's* border becomes mint, at the ring width. The cap ring is untouched.
    expect(strokes(pills(f)[1]!)).toEqual([
      { colour: '#2E7A70', width: SUMMARY_PILL.ringWidth },
      { colour: '#E7E3DC', width: SUMMARY_PILL.borderWidth },
    ]);
  });

  it('keeps the two states the same size, so an active pill does not resize under its label', () => {
    const f = factory();
    const [plain, active] = buildCountryDiscImages(
      [{ countryCode: 'IL' }, { countryCode: 'IL', active: true }],
      { ...base, flagGlyphs: true, createCanvas: f.create }
    );
    expect(active?.content).toEqual(plain?.content);
    expect(active?.stretchX).toEqual(plain?.stretchX);
    expect(pills(f)[1]!.width).toBe(pills(f)[0]!.width);
  });

  it('uses the dark surface and the same mint ring in the dark theme', () => {
    const f = factory();
    buildCountryDiscImages([{ countryCode: 'IL', active: true }], {
      pixelRatio: 2,
      theme: 'dark',
      flagGlyphs: true,
      createCanvas: f.create,
    });
    const pill = pills(f)[0]!;
    expect(pill.ops.filter((o) => o.op === 'fill').map((o) => String(o.args[0]))).toContain(
      '#1C232B'
    );
    expect(strokes(pill).map((s) => s.colour)).toEqual(['#2E7A70', '#2A323B']);
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
        const pill = pills(f)[0]!;
        expect(pill.width).toBe(Math.ceil(summaryPillWidth(true) * dpr));
        expect(pill.height).toBe(Math.ceil(SUMMARY_PILL_HEIGHT * dpr));
        // The first scale is the DPR one: the geometry below it is authored in CSS pixels.
        expect(pill.ops.filter((o) => o.op === 'scale')[0]!.args).toEqual([dpr, dpr]);
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
    expect(pills(f)).toHaveLength(1);
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
    expect(pills(f)).toHaveLength(4);
  });

  it('degrades to no icons rather than throwing when there is no canvas', () => {
    expect(buildCountryDiscImages([{ countryCode: 'IL' }], { ...base, createCanvas: () => null }))
      .toEqual([]);
    // The default factory reads `document`, which does not exist in this environment.
    expect(buildCountryDiscImages([{ countryCode: 'IL' }], base)).toEqual([]);
    expect(buildCountryDiscImages([], base)).toEqual([]);
  });
});

/**
 * The half MapLibre reads. `content` and `stretchX` are raw bitmap pixels
 * (`maplibre-gl/src/symbol/quads.ts:65`, `:134`), and getting either of them wrong is not a
 * rendering wobble — it is the label falling out of its own pill, which is the defect this whole
 * change exists to remove.
 */
describe('the stretchable-image geometry', () => {
  const build = (countryCode: string | null, pixelRatio: number) => {
    const f = factory();
    const [image] = buildCountryDiscImages([{ countryCode }], {
      pixelRatio,
      theme: 'light',
      flagGlyphs: true,
      createCanvas: f.create,
    });
    return { image: image!, canvas: pills(f)[0]! };
  };

  for (const dpr of [1, 2, 3]) {
    it(`states content in raw bitmap pixels at ${dpr}x, not CSS pixels`, () => {
      const { image } = build('IL', dpr);
      const [left, top, right, bottom] = image.content;
      // Multiplied by the pixel ratio exactly once, like the canvas transform.
      const capped = SUMMARY_PILL.shadowPad +
        SUMMARY_PILL.radius +
        SUMMARY_PILL.capDiameter / 2 +
        SUMMARY_PILL.capGap;
      expect(left).toBe(Math.round(capped * dpr));
      expect(top).toBe(0);
      expect(right).toBe(
        Math.ceil(summaryPillWidth(true) * dpr) -
          Math.round((SUMMARY_PILL.padX + SUMMARY_PILL.shadowPad) * dpr)
      );
      expect(bottom).toBe(Math.ceil(SUMMARY_PILL_HEIGHT * dpr));
    });
  }

  it('spans the full bitmap height, so `icon-text-fit: width` leaves the vertical axis 1:1', () => {
    // A shorter content band is not a crop: `quads.ts` maps it onto the icon's natural height, so
    // the whole pill would be scaled up vertically by imageHeight / contentHeight.
    for (const code of ['IL', null]) {
      const { image, canvas } = build(code, 2);
      expect(image.content[1]).toBe(0);
      expect(image.content[3]).toBe(canvas.height);
    }
  });

  it('stretches exactly the content span, so the pill can be as narrow as its shortest label', () => {
    const { image } = build(null, 2);
    // `fixedContentWidth` is then 0 and the rendered middle is exactly the label's width. A
    // narrower stretch zone would impose a minimum width a one-digit count could not meet.
    expect(image.stretchX).toEqual([[image.content[0], image.content[2]]]);
  });

  it('keeps both content edges inside the pill’s flat middle', () => {
    // The stretched columns are repeated across the label's width. A content edge inside a rounded
    // end would smear that curve the whole way along the pill.
    for (const capped of [true, false]) {
      const { image } = build(capped ? 'IL' : null, 2);
      const flatFrom = (SUMMARY_PILL.shadowPad + SUMMARY_PILL.radius) * 2;
      const flatTo = (summaryPillWidth(capped) - SUMMARY_PILL.shadowPad - SUMMARY_PILL.radius) * 2;
      expect(image.content[0]).toBeGreaterThanOrEqual(flatFrom);
      expect(image.content[2]).toBeLessThanOrEqual(flatTo);
    }
  });

  it('gives the capless pill equal padding on both sides', () => {
    const { image, canvas } = build(null, 2);
    expect(image.content[0]).toBe(canvas.width - image.content[2]);
  });

  it('leaves room for the flag between the pill edge and the label', () => {
    const capped = build('IL', 2);
    const capless = build(null, 2);
    expect(capped.image.content[0] - capless.image.content[0]).toBe(
      (SUMMARY_PILL.capDiameter / 2 + SUMMARY_PILL.capGap) * 2
    );
  });
});

describe('geometry', () => {
  it('clears §6’s 44 px tap floor on the bitmap alone', () => {
    // `collision_feature.ts:76-81` adds the icon's collisionPadding back onto the fitted box, so
    // the hit box is the whole image, height included.
    expect(SUMMARY_PILL_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('keeps the shadow inside the transparent margin, so the pill stays centred on its label', () => {
    expect(SUMMARY_PILL.shadowBlur + SUMMARY_PILL.shadowOffsetY).toBeLessThanOrEqual(
      SUMMARY_PILL.shadowPad
    );
  });

  it('pads a capless side by exactly the corner radius', () => {
    // Not a taste decision: it is what keeps `content`'s edges out of the rounded ends.
    expect(SUMMARY_PILL.padX).toBe(SUMMARY_PILL.radius);
  });

  it('sits the flag cap concentric with the pill’s leading arc', () => {
    expect(SUMMARY_PILL.capDiameter / 2).toBeLessThan(SUMMARY_PILL.radius);
    // Inset equally all round, so the cap cannot touch the border on any side.
    expect(SUMMARY_PILL.radius - SUMMARY_PILL.capDiameter / 2).toBeGreaterThanOrEqual(
      SUMMARY_PILL.borderWidth * 2
    );
    expect(SUMMARY_PILL.height / 2 - SUMMARY_PILL.capDiameter / 2).toBeGreaterThanOrEqual(
      SUMMARY_PILL.borderWidth * 2
    );
  });
});

describe('fitting the glyph to the cap', () => {
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
    // advance and the reported metrics both overstate the glyph.
    const f = factory({ painted: painted(0, -40, 54, 40), fallbackWidth: 90 });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    const ops = pills(f)[0]!.ops;
    expect(ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      SUMMARY_PILL.flagWidth / 54,
      SUMMARY_PILL.flagWidth / 54,
    ]);
    const text = ops.find((o) => o.op === 'fillText');
    expect([text?.args[1], text?.args[2]]).toEqual([-27, 20]);
  });

  it('takes the tighter of the two constraints so a tall glyph cannot overflow the cap', () => {
    const f = factory({ painted: painted(0, -60, 40, 60) });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(pills(f)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      SUMMARY_PILL.flagHeight / 60,
      SUMMARY_PILL.flagHeight / 60,
    ]);
  });

  it('falls back to the advance when the raster cannot be read back', () => {
    const f = factory({ fallbackWidth: 56, throwOnScan: true });
    buildCountryDiscImages([{ countryCode: 'JP' }], {
      ...base,
      flagGlyphs: true,
      createCanvas: f.create,
    });
    expect(pills(f)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      SUMMARY_PILL.flagWidth / 56,
      SUMMARY_PILL.flagWidth / 56,
    ]);
  });

  it('squeezes a two-letter code that would overrun the cap, and leaves a narrow one alone', () => {
    const wide = factory({ painted: painted(0, -10, 60, 10) });
    buildCountryDiscImages([{ countryCode: 'WW' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: wide.create,
    });
    expect(pills(wide)[0]!.ops.filter((o) => o.op === 'scale').at(-1)?.args).toEqual([
      (SUMMARY_PILL.capDiameter - 6) / 60,
      1,
    ]);

    const narrow = factory({ painted: painted(0, -10, 12, 10) });
    buildCountryDiscImages([{ countryCode: 'IL' }], {
      ...base,
      flagGlyphs: false,
      createCanvas: narrow.create,
    });
    // Only the device-pixel-ratio scale; the code is drawn at its natural width.
    expect(pills(narrow)[0]!.ops.filter((o) => o.op === 'scale')).toHaveLength(1);
  });
});
