/**
 * Draws the **summary pill** MapLibre renders as `icon-image` in the country and area bands
 * (`docs/ux-library-at-scale.md` §2.2, §2.3): a card-surface pill with a hairline border and the
 * disc's drop shadow, carrying an optional flag cap at its leading edge.
 *
 * ## Why a pill and not a bare disc
 *
 * The first version drew a disc and let the country's name and count fall on the basemap as bare
 * text with a halo. On the running map that is not a marker, it is map furniture: it collides with
 * CARTO's own labels (`United Kingdom 18` landing on the basemap's `ASIA`), the first letter sits
 * against the disc's ring, and nothing about it says *tap me*. The area band had the same defect in
 * a second form — a disc with the count in it and the area's name as bare text underneath, which
 * repeated the basemap's own city label directly below a disc sitting on that city.
 *
 * A pill fixes both at once and is what §2.2/§2.3 already claimed the two bands were: the same
 * object one zoom apart. It is drawn once as a **stretchable image** — `stretchX` plus `content`,
 * with `icon-text-fit: 'width'` on the layer — so the text inside it stays live text in a symbol
 * layer and the bitmap only supplies the surface. That is what keeps §2.2's "the count is plain
 * digits in a symbol layer, never baked into the image" true, and what lets `תל אביב-יפו` shape
 * through the RTL plugin.
 *
 * ## Why the flag is a bitmap and never a `text-field`
 *
 * Two independent blockers in the installed MapLibre (6.4.1), both read out of
 * `node_modules/maplibre-gl/src`:
 *
 * 1. `GlyphAtlas.image` is an `AlphaImage` — one channel — and `symbol_sdf.fragment.glsl` samples
 *    it as `texture(u_texture, tex).a`. A glyph carries coverage, never colour; the colour comes
 *    from the `text-color` uniform. A two-tone flag cannot exist in that pipeline.
 * 2. `shaping.ts` walks `for (const char of line.text)` and looks each code point up on its own
 *    (`glyph: codePoint`). There is no cluster or ligature substitution, so the regional-indicator
 *    pair U+1F1EF U+1F1F5 is two separate lookups and renders as two boxes, not 🇯🇵.
 *
 * ## The geometry contract, and why it is written down here
 *
 * `content` and `stretchX` are in **raw bitmap pixels**, not CSS pixels
 * (`maplibre-gl/src/symbol/quads.ts:65` derives `imageWidth` from `paddedRect`, and `quads.ts:134`
 * divides the fixed offsets by `pixelRatio`). Everything below is authored in CSS pixels and
 * multiplied by `pixelRatio` exactly once, at the end, the same way the canvas transform is.
 *
 * Two invariants the drawing must not break, both load-bearing:
 *
 * - **The stretched span must be flat.** `content` marks the region the text is mapped onto and
 *   `stretchX` marks the columns MapLibre may repeat; every column between them is smeared across
 *   the text's width, so both edges of `content` sit at or inside the pill's flat middle — never in
 *   a rounded end. `padX === radius` is what guarantees that on the capless pill.
 * - **`content` spans the image's full height.** With `icon-text-fit: 'width'` the vertical axis is
 *   not fitted, and `quads.ts` still maps `content`'s vertical band onto the icon's natural height:
 *   a shorter content band would scale the whole pill up vertically. Full height keeps it 1:1.
 *
 * Browser-only in effect, but safe to import anywhere: nothing touches `document` at module scope,
 * and every entry point returns an empty/neutral result when there is no canvas.
 */

/** The two themes the tokens below are mirrored for. */
export type DiscTheme = 'light' | 'dark';

export interface CountryDiscSpec {
  /**
   * ISO 3166-1 alpha-2. `null` — or anything that is not two ASCII letters — draws the **capless**
   * pill, which is both §2.5's area with no country and the area band's own marker.
   */
  readonly countryCode: string | null;
  /** The active area's country. The mint ring is the only state colour on the marker. */
  readonly active?: boolean;
}

export interface CountryDiscImage {
  readonly id: string;
  readonly data: ImageData;
  readonly pixelRatio: number;
  /** Raw-bitmap-pixel metadata for `map.addImage`. See the geometry contract above. */
  readonly stretchX: readonly [number, number][];
  readonly content: readonly [number, number, number, number];
}

export interface CountryDiscOptions {
  /** `window.devicePixelRatio`. The bitmap is drawn at this resolution and MapLibre lays it out at
   *  `width / pixelRatio` CSS pixels, so one call is crisp at 1x, 2x and 3x. */
  readonly pixelRatio: number;
  readonly theme: DiscTheme;
  /** Override the flag feature test. Omitted, it is measured once per document. */
  readonly flagGlyphs?: boolean;
  /** Canvas source. Omitted, `document.createElement('canvas')`. */
  readonly createCanvas?: () => HTMLCanvasElement | null;
}

/**
 * The pill's geometry in CSS pixels, before `devicePixelRatio`.
 *
 * `padX === radius` is not a taste decision: it is what keeps `content`'s edges out of the rounded
 * ends, which is what stops the stretch smearing a curve across the label.
 *
 * The flag cap is **concentric** with the pill's leading arc — its centre is at `radius` from the
 * pill's leading edge — so it is inset from the border by `radius - capDiameter / 2` all the way
 * round, and cannot touch it at any angle.
 */
export const SUMMARY_PILL = {
  height: 34,
  radius: 17,
  /** Horizontal padding on a side with no cap. Equal to `radius` — see above. */
  padX: 17,
  borderWidth: 1,
  /** The active state: the hairline border is replaced by a mint one at this width. Same outer
   *  geometry in both states, so a pill does not resize when its country becomes active. */
  ringWidth: 2,
  /** Transparent margin around the pill, holding the shadow. `shadowBlur + shadowOffsetY <= this`. */
  shadowPad: 8,
  shadowBlur: 5,
  shadowOffsetY: 1.5,
  /** The flag circle in the leading cap. */
  capDiameter: 24,
  /** Flag circle's trailing edge to the label's leading edge. */
  capGap: 8,
  /**
   * The box the flag's **inked** pixels are fitted into. Fitted rather than set as a font size
   * because Apple, Google and Noto flags share neither metrics nor side bearing: Apple pads its
   * advance, so scaling to the advance leaves the flag floating at ~60% of the cap.
   */
  flagWidth: 20,
  flagHeight: 15,
  /** The fallback two-letter code, drawn in the cap where the platform has no flag glyph. */
  codeFontPx: 12,
  codeWeight: 600,
  /** Natural width of the stretchable middle. Any positive number works — the rendered width comes
   *  from the text — so this is only the size of the atlas slot. */
  textSlot: 24,
} as const;

/** Bitmap height in CSS pixels. Also the marker's tap target height: `collision_feature.ts:76-81`
 *  expands the icon's collision box back out to the full image, so ≥44 here is ≥44 on screen. */
export const SUMMARY_PILL_HEIGHT = SUMMARY_PILL.height + 2 * SUMMARY_PILL.shadowPad;

/** The label's font size. `SUMMARY_TEXT_PX` in `summary-style.ts` is the same number and is the
 *  one the layer uses; that module imports *this* one, so it is restated here rather than imported
 *  and the two are coupled by name. */
const SUMMARY_LABEL_FONT_PX = 14;

/** Distance from the bitmap's leading edge to the label's leading edge, per cap kind. */
function leadingInset(capped: boolean): number {
  return capped
    ? SUMMARY_PILL.shadowPad +
        SUMMARY_PILL.radius +
        SUMMARY_PILL.capDiameter / 2 +
        SUMMARY_PILL.capGap
    : SUMMARY_PILL.shadowPad + SUMMARY_PILL.padX;
}

const TRAILING_INSET = SUMMARY_PILL.padX + SUMMARY_PILL.shadowPad;

/** Bitmap width in CSS pixels, per cap kind. */
export function summaryPillWidth(capped: boolean): number {
  return leadingInset(capped) + SUMMARY_PILL.textSlot + TRAILING_INSET;
}

/** One marker's label, as the camera has to reason about it: the text the symbol layer will shape,
 *  and whether the pill drawing it carries a flag cap (which widens its leading inset). */
export interface SummaryPillLabel {
  readonly text: string;
  readonly capped: boolean;
}

/**
 * **How much room the widest summary marker needs beside its own anchor point**, in CSS pixels.
 *
 * `summaryPillWidth` sizes the *atlas slot*; the pill on screen is `icon-text-fit: 'width'` fitted
 * to live text, so its rendered width is the two fixed insets plus however wide the label shapes.
 * `text-anchor: 'center'` (and the `CAPPED_PILL_CENTRING_EM` correction beside it) puts the anchor
 * in the middle of that, so a pill hangs half its width either side of the coordinate it marks.
 *
 * **Which is why fitting a box of anchors clips every marker on it, always.** `cameraForBounds`
 * frames the anchors to the padded edge; the pill drawn at an edge anchor then hangs half its width
 * off screen. On 2026-08-30 that was `United Kingdom 18` cut in half at the left edge and
 * `Israel 14` cut off at the right under the zoom controls — with a camera framing its box
 * perfectly correctly. The camera has to pad by what is *drawn*, not by what is fitted.
 *
 * **Taken over the labels this library actually has**, never a constant: the caller passes every
 * marker it is about to draw and gets the widest one back. A one-country library pays for its one
 * pill, `Bosnia and Herzegovina 12` pays for itself, and a Hebrew or Japanese label is measured the
 * same way as a Latin one rather than assumed to be the same width. An empty list is zero — a
 * surface with no summary bands (`/collections/[id]`) pays nothing.
 *
 * `y` is half the bitmap's height and is exact.
 */
export function summaryPillFitAllowance(labels: readonly SummaryPillLabel[]): {
  readonly x: number;
  readonly y: number;
} {
  let widest = 0;
  for (const label of labels) {
    const width = leadingInset(label.capped) + measureSummaryLabelPx(label.text) + TRAILING_INSET;
    if (width > widest) widest = width;
  }
  if (widest === 0) return { x: 0, y: 0 };
  return { x: widest / 2, y: SUMMARY_PILL_HEIGHT / 2 };
}

/**
 * How wide a label shapes, and it is the one **approximate** number in the allowance above.
 *
 * The exact answer lives inside the GL context: MapLibre shapes the label out of the basemap's
 * glyph PBFs (`styleTextFont` borrows Positron's own upright stack), and no function outside a
 * running map can ask for those advances. So this measures the same string in the same size in a
 * 2-D canvas and adds a margin for the typeface being a near neighbour rather than the same one.
 *
 * It is approximate **in width, not in behaviour**: it is driven by the real label, so it tracks
 * length, digits, script and case rather than assuming a shape. Where there is no canvas at all —
 * SSR, and every unit test, which run in Node — it falls back to a per-code-point model that keeps
 * the same property. The fallback is deliberately the wider of the two so a server-rendered first
 * frame never under-pads.
 */
function measureSummaryLabelPx(text: string): number {
  const context = measurementContext();
  if (context === null) return estimateSummaryLabelPx(text);
  context.font = `${SUMMARY_LABEL_FONT_PX}px ${SANS_FALLBACK_STACK}`;
  const measured = context.measureText(text).width;
  if (!Number.isFinite(measured) || measured <= 0) return estimateSummaryLabelPx(text);
  return measured * GLYPH_MARGIN;
}

/** The basemap's glyphs are not the platform's UI font, so a canvas measurement is a near miss
 *  rather than an answer. 8% is the margin the allowance carries for that; it is a judgement, and
 *  it is the only place in this file where one is spent. */
const GLYPH_MARGIN = 1.08;

let measurementCanvas: HTMLCanvasElement | null = null;
function measurementContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  measurementCanvas ??= document.createElement('canvas');
  return measurementCanvas.getContext('2d');
}

/**
 * Width without a canvas, per code point rather than per character, so an astral CJK ideograph
 * counts once and a Hebrew letter is not assumed to be as wide as a Latin capital.
 *
 * Three buckets, in ems: full-width scripts (CJK, Hangul, and the ideographic punctuation between
 * them) at 1, the space at a third, everything else — Latin, Hebrew, Arabic, Cyrillic, digits — at
 * 0.6, which is above Open Sans's mixed-case average and so errs wide.
 */
function estimateSummaryLabelPx(text: string): number {
  let ems = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === ' ') ems += 0.34;
    else if (isFullWidth(code)) ems += 1;
    else ems += 0.6;
  }
  return ems * SUMMARY_LABEL_FONT_PX;
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

const EMOJI_FONT_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
const SANS_FALLBACK_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * The pill's material, resolved from the design tokens. Exported because both bands' text layers
 * are painted from it — two independent readings of `--card` is how the two bands come to disagree
 * about what a summary marker is made of.
 */
export interface DiscTokens {
  readonly surface: string;
  readonly border: string;
  readonly ink: string;
  readonly ring: string;
  readonly fontFamily: string;
}

/**
 * Mirrors `src/app/globals.css`. Used when there is no document to read, or when the document's
 * theme is not the theme being asked for — a canvas cannot resolve a token for a theme the page is
 * not in, and guessing one is how an unsigned dark value gets invented.
 *
 * `ring` is `--pin` (`--mint-700`). It is the same in both rows because `.dark` overrides neither
 * `--pin` nor the mint ramp; the dark palette is an unsigned first pass and inventing a second mint
 * here would be a new unreviewed value, not a decision.
 */
const TOKEN_FALLBACK: Record<DiscTheme, Omit<DiscTokens, 'fontFamily'>> = {
  light: { surface: '#FFFFFF', border: '#E7E3DC', ink: '#1B1B1A', ring: '#2E7A70' },
  dark: { surface: '#1C232B', border: '#2A323B', ink: '#F2F5F7', ring: '#2E7A70' },
};

function defaultCreateCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  return document.createElement('canvas');
}

/** The same rule `components/ui/map.tsx` uses, so the pill and the basemap never disagree. */
function documentTheme(): DiscTheme | null {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  const attr = root.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return null;
}

function readVar(styles: CSSStyleDeclaration, name: string): string | null {
  const value = styles.getPropertyValue(name).trim();
  // An unsubstituted `var(` means the property is not really resolved on this element.
  if (!value || value.includes('var(')) return null;
  return value;
}

export function resolveDiscTokens(theme: DiscTheme): DiscTokens {
  const fallback = { ...TOKEN_FALLBACK[theme], fontFamily: SANS_FALLBACK_STACK };
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  if (documentTheme() !== theme) return fallback;

  const styles = getComputedStyle(document.documentElement);
  return {
    surface: readVar(styles, '--card') ?? fallback.surface,
    border: readVar(styles, '--border') ?? fallback.border,
    ink: readVar(styles, '--foreground') ?? fallback.ink,
    ring: readVar(styles, '--pin') ?? fallback.ring,
    fontFamily: readVar(styles, '--font-sans') ?? fallback.fontFamily,
  };
}

/**
 * Japan: two code points, and a red disc on white, so one probe answers both halves of the
 * question below.
 */
const FLAG_PROBE = '\u{1F1EF}\u{1F1F5}';
const FLAG_PROBE_FIRST = '\u{1F1EF}';
const PROBE_FONT_PX = 32;
const PROBE_BOX = 40;
/** Channel spread that counts as "the font supplied its own colour" rather than our black fill. */
const CHROMA_THRESHOLD = 24;

/**
 * Does this platform draw a country flag?
 *
 * Two questions, both of which must answer yes:
 *
 * - **Did the pair ligate?** A supported pair advances roughly one glyph; an unsupported one
 *   advances two boxed letters. Compared against the first code point alone rather than against a
 *   constant, so it holds whatever the emoji metrics are.
 * - **Did the font bring colour?** We fill black. If the raster comes back with a channel spread,
 *   the glyph painted itself, which only a colour emoji glyph does.
 *
 * Measured **once per document**, on one flag, never per marker and never from the user agent —
 * per-marker probing would put a `getImageData` on every country and UA sniffing is wrong the day
 * a platform ships flags.
 */
export function hasFlagGlyphs(createCanvas: () => HTMLCanvasElement | null = defaultCreateCanvas): boolean {
  const canvas = createCanvas();
  if (!canvas) return false;
  canvas.width = PROBE_BOX;
  canvas.height = PROBE_BOX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  ctx.font = `${PROBE_FONT_PX}px ${EMOJI_FONT_STACK}`;
  const pair = ctx.measureText(FLAG_PROBE).width;
  const first = ctx.measureText(FLAG_PROBE_FIRST).width;
  if (!(pair > 0) || !(first > 0) || pair > first * 1.5) return false;

  ctx.clearRect(0, 0, PROBE_BOX, PROBE_BOX);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  ctx.fillText(FLAG_PROBE, 0, 0);
  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, PROBE_BOX, PROBE_BOX);
  } catch {
    return false;
  }
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 8) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_THRESHOLD) return true;
  }
  return false;
}

let flagGlyphsMemo: boolean | null = null;

function flagGlyphsSupported(options: CountryDiscOptions): boolean {
  if (options.flagGlyphs !== undefined) return options.flagGlyphs;
  flagGlyphsMemo ??= hasFlagGlyphs(options.createCanvas ?? defaultCreateCanvas);
  return flagGlyphsMemo;
}

const REGIONAL_INDICATOR_A = 0x1f1e6;

/** `null` unless this is two ASCII letters — everything else is a capless pill, not a guess. */
export function normaliseCountryCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

/** The regional-indicator pair for a code. Exported so a test can assert the code points. */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 65)
  );
}

/**
 * The `icon-image` id. Pure and SSR-safe, so the layer can build its expression on the server or
 * before any canvas exists.
 *
 * The name is `country-disc:` for history, not accuracy — `summary-features.ts` and both bands
 * resolve their ids through this function, so the string itself is never written anywhere else.
 */
export function countryDiscImageId(spec: CountryDiscSpec, theme: DiscTheme): string {
  const code = normaliseCountryCode(spec.countryCode) ?? 'none';
  return `summary-pill:${theme}:${code}${spec.active ? ':active' : ''}`;
}

/**
 * Rasterised pills, keyed by id and pixel ratio. A device has one pixel ratio and a session has one
 * theme, so this is a handful of entries; the point is that panning and re-styling never rebuild a
 * canvas.
 */
const cache = new Map<string, CountryDiscImage>();

export function clearCountryDiscImageCache(): void {
  cache.clear();
  measured.clear();
  flagGlyphsMemo = null;
}

/** A rounded rectangle, built from arcs rather than `roundRect` — Safari shipped `roundRect` only
 *  in 16, and this runs on whatever phone the user has. */
function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.min(radius, w / 2, h / 2);
  const half = Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -half, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, half);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, half, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI + half);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  tokens: DiscTokens,
  active: boolean,
  widthCss: number
): void {
  const { shadowPad, height, radius, borderWidth, ringWidth } = SUMMARY_PILL;
  const w = widthCss - 2 * shadowPad;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 30, 28, 0.34)';
  ctx.shadowBlur = SUMMARY_PILL.shadowBlur;
  ctx.shadowOffsetY = SUMMARY_PILL.shadowOffsetY;
  ctx.fillStyle = tokens.surface;
  pillPath(ctx, shadowPad, shadowPad, w, height, radius);
  ctx.fill();
  ctx.restore();

  // The mint ring is the border, at twice the width — not an extra ring outside the pill. An outer
  // ring would change the bitmap's outer geometry between states, and `content` is measured from
  // that edge, so the pill would shift under its own label the moment a country became active.
  const line = active ? ringWidth : borderWidth;
  ctx.lineWidth = line;
  ctx.strokeStyle = active ? tokens.ring : tokens.border;
  pillPath(
    ctx,
    shadowPad + line / 2,
    shadowPad + line / 2,
    w - line,
    height - line,
    radius - line / 2
  );
  ctx.stroke();
}

/** Where a glyph actually puts pixels, relative to the text origin. */
interface PaintedBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const MEASURE_BOX = 96;
const MEASURE_ORIGIN_X = 24;
const MEASURE_ORIGIN_Y = 68;
const measured = new Map<string, PaintedBox | null>();

/**
 * Scan the rendered alpha for the glyph's real extent.
 *
 * `TextMetrics.actualBoundingBox*` is not usable for this: for a colour emoji Chromium reports a
 * generic font-level box, identical for every flag and much larger than the flag it paints, so
 * fitting the reported box shrinks the flag to two thirds of the cap. Reading the pixels is
 * font-independent and is the only measurement true of Apple, Noto and Segoe at once.
 *
 * Memoised per font-and-glyph: it is a fixed-size scan, run once per country per session, never per
 * marker and never per pixel ratio.
 */
function measurePaintedBox(
  font: string,
  text: string,
  createCanvas: () => HTMLCanvasElement | null
): PaintedBox | null {
  const key = `${font}|${text}`;
  const hit = measured.get(key);
  if (hit !== undefined) return hit;

  const box = scanPaintedBox(font, text, createCanvas);
  measured.set(key, box);
  return box;
}

function scanPaintedBox(
  font: string,
  text: string,
  createCanvas: () => HTMLCanvasElement | null
): PaintedBox | null {
  const canvas = createCanvas();
  if (!canvas) return null;
  canvas.width = MEASURE_BOX;
  canvas.height = MEASURE_BOX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, MEASURE_ORIGIN_X, MEASURE_ORIGIN_Y);

  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, MEASURE_BOX, MEASURE_BOX);
  } catch {
    return null;
  }
  const { data } = pixels;
  let minX = MEASURE_BOX;
  let minY = MEASURE_BOX;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < MEASURE_BOX; y += 1) {
    for (let x = 0; x < MEASURE_BOX; x += 1) {
      if ((data[(y * MEASURE_BOX + x) * 4 + 3] ?? 0) <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    left: minX - MEASURE_ORIGIN_X,
    top: minY - MEASURE_ORIGIN_Y,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/** The flag circle's centre, concentric with the pill's leading arc. */
const CAP_CENTRE_X = SUMMARY_PILL.shadowPad + SUMMARY_PILL.radius;
const CAP_CENTRE_Y = SUMMARY_PILL.shadowPad + SUMMARY_PILL.height / 2;
const CAP_RADIUS = SUMMARY_PILL.capDiameter / 2;

function drawFlag(
  ctx: CanvasRenderingContext2D,
  code: string,
  createCanvas: () => HTMLCanvasElement | null
): void {
  ctx.save();
  // Clip to the cap: a font whose flag overhangs its advance cannot bleed onto the label.
  ctx.beginPath();
  ctx.arc(CAP_CENTRE_X, CAP_CENTRE_Y, CAP_RADIUS - SUMMARY_PILL.borderWidth, 0, Math.PI * 2);
  ctx.clip();

  const glyph = flagEmoji(code);
  const font = `${PROBE_FONT_PX}px ${EMOJI_FONT_STACK}`;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(CAP_CENTRE_X, CAP_CENTRE_Y);

  const box = measurePaintedBox(font, glyph, createCanvas);
  if (box) {
    const fit = Math.min(
      SUMMARY_PILL.flagWidth / box.width,
      SUMMARY_PILL.flagHeight / box.height
    );
    ctx.scale(fit, fit);
    ctx.fillText(glyph, -(box.left + box.width / 2), -(box.top + box.height / 2));
  } else {
    // No readback: fit the advance and centre on the em box. Looser, but it still lands in the cap.
    const advance = ctx.measureText(glyph).width;
    const scale = advance > 0 ? SUMMARY_PILL.flagWidth / advance : 1;
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 0);
  }
  ctx.restore();
}

function drawCode(
  ctx: CanvasRenderingContext2D,
  tokens: DiscTokens,
  code: string,
  createCanvas: () => HTMLCanvasElement | null
): void {
  ctx.save();
  const font = `${SUMMARY_PILL.codeWeight} ${SUMMARY_PILL.codeFontPx}px ${tokens.fontFamily}`;
  ctx.font = font;
  ctx.fillStyle = tokens.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(CAP_CENTRE_X, CAP_CENTRE_Y);

  // Two capitals overrun the cap on a wide face; squeeze rather than clip, so `WW` stays inside the
  // ring on every font without changing the size the other codes read at.
  const limit = SUMMARY_PILL.capDiameter - 6;
  const box = measurePaintedBox(font, code, createCanvas);
  if (box) {
    // Optically centred on the caps: an all-caps pair has no descender, so a `middle` baseline
    // sits it visibly high in the cap.
    if (box.width > limit) ctx.scale(limit / box.width, 1);
    ctx.fillText(code, -(box.left + box.width / 2), -(box.top + box.height / 2));
  } else {
    const advance = ctx.measureText(code).width;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (advance > limit && advance > 0) ctx.scale(limit / advance, 1);
    ctx.fillText(code, 0, 0);
  }
  ctx.restore();
}

/** The hairline around the cap, so a flag with a white field (JP, FI, NG) still has an edge against
 *  the card surface it sits on. Drawn after the flag, over its clipped edge. */
function drawCapRing(ctx: CanvasRenderingContext2D, tokens: DiscTokens): void {
  ctx.lineWidth = SUMMARY_PILL.borderWidth;
  ctx.strokeStyle = tokens.border;
  ctx.beginPath();
  ctx.arc(CAP_CENTRE_X, CAP_CENTRE_Y, CAP_RADIUS - SUMMARY_PILL.borderWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function build(
  spec: CountryDiscSpec,
  options: CountryDiscOptions,
  tokens: DiscTokens,
  flags: boolean
): CountryDiscImage | null {
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;
  const canvas = createCanvas();
  if (!canvas) return null;

  const code = normaliseCountryCode(spec.countryCode);
  const capped = code !== null;
  const widthCss = summaryPillWidth(capped);

  canvas.width = Math.ceil(widthCss * options.pixelRatio);
  canvas.height = Math.ceil(SUMMARY_PILL_HEIGHT * options.pixelRatio);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Everything below is authored in CSS pixels; the transform is the whole of the DPR story.
  ctx.scale(options.pixelRatio, options.pixelRatio);
  drawPill(ctx, tokens, spec.active === true, widthCss);

  if (code) {
    if (flags) drawFlag(ctx, code, createCanvas);
    else drawCode(ctx, tokens, code, createCanvas);
    drawCapRing(ctx, tokens);
  }

  // Raw bitmap pixels, and rounded to the same integers the canvas was allocated at — a fractional
  // `content` edge is a fractional texture cut and shows up as a seam in the stretched middle.
  const contentLeft = Math.round(leadingInset(capped) * options.pixelRatio);
  const contentRight = canvas.width - Math.round(TRAILING_INSET * options.pixelRatio);

  return {
    id: countryDiscImageId(spec, options.theme),
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio: options.pixelRatio,
    // The whole content span stretches, so `fixedContentWidth` is 0 and the rendered middle is
    // exactly the label’s width (`quads.ts:93-108`). A narrower stretch zone would impose a
    // minimum width the shortest labels could not meet.
    stretchX: [[contentLeft, contentRight]],
    // Full height: see the geometry contract at the top of this file.
    content: [contentLeft, 0, contentRight, canvas.height],
  };
}

/**
 * Every pill the layers need, ready for
 * `map.addImage(id, data, { pixelRatio, stretchX, content })`.
 *
 * Duplicate specs collapse, already-built pills come from the cache, and a missing canvas yields
 * `[]` rather than throwing — the caller degrades to no summary icons instead of failing to mount.
 */
export function buildCountryDiscImages(
  specs: readonly CountryDiscSpec[],
  options: CountryDiscOptions
): CountryDiscImage[] {
  if (specs.length === 0) return [];
  const tokens = resolveDiscTokens(options.theme);
  const flags = flagGlyphsSupported(options);

  const images: CountryDiscImage[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const id = countryDiscImageId(spec, options.theme);
    if (seen.has(id)) continue;
    seen.add(id);

    const key = `${id}@${options.pixelRatio}`;
    const cached = cache.get(key);
    if (cached) {
      images.push(cached);
      continue;
    }
    const image = build(spec, options, tokens, flags);
    if (!image) return [];
    cache.set(key, image);
    images.push(image);
  }
  return images;
}

/**
 * The fallback code is baked into a bitmap, so it has to be drawn in the loaded face, not in the
 * swap fallback. Await this before the first build; it resolves immediately where there is no font
 * loading API to wait on.
 */
export async function whenDiscFontReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await document.fonts.ready;
}
