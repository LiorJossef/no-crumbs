/**
 * Draws the country disc MapLibre renders as `icon-image` at world zoom: a flag in a disc, with a
 * mint ring when the disc is the active area's country (`docs/ux-library-at-scale.md` §2.2).
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
 * The count is **not** in this bitmap. It is a separate symbol layer, so it stays live data.
 *
 * Browser-only in effect, but safe to import anywhere: nothing touches `document` at module scope,
 * and every entry point returns an empty/neutral result when there is no canvas.
 */

/** The two themes the tokens below are mirrored for. */
export type DiscTheme = 'light' | 'dark';

export interface CountryDiscSpec {
  /**
   * ISO 3166-1 alpha-2. `null` — or anything that is not two ASCII letters — draws an empty disc,
   * which is what §2.5 needs for an area whose members all lack a country.
   */
  readonly countryCode: string | null;
  /** The active area's country. The mint ring is the only state colour on the marker. */
  readonly active?: boolean;
}

export interface CountryDiscImage {
  readonly id: string;
  readonly data: ImageData;
  readonly pixelRatio: number;
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
 * Geometry in CSS pixels, before `devicePixelRatio`. Exported because the count layer has to offset
 * itself from the disc, and the disc must not be measured twice.
 *
 * The bitmap always reserves room for the ring, ring or no ring, so the disc centre sits at the
 * same place in every image and the layer's anchor and count offset are constant across states.
 */
export const COUNTRY_DISC = {
  diameter: 36,
  borderWidth: 1,
  ringWidth: 2.5,
  ringGap: 2,
  shadowPad: 7,
  shadowBlur: 5,
  shadowOffsetY: 1.5,
  /**
   * The box the flag's **inked** pixels are fitted into — roughly the widest 4:3 rectangle inside
   * the disc, less the border. Fitted rather than set as a font size because Apple, Google and Noto
   * flags share neither metrics nor side bearing: Apple pads its advance, so scaling to the advance
   * leaves the flag floating at ~60% of the disc.
   */
  flagWidth: 27,
  flagHeight: 20,
  /** The fallback two-letter code. Same weight and size as the count layer. */
  codeFontPx: 14,
  codeWeight: 600,
} as const;

const RING_OUTER_RADIUS =
  COUNTRY_DISC.diameter / 2 + COUNTRY_DISC.ringGap + COUNTRY_DISC.ringWidth;

/** Bitmap edge in CSS pixels, and the disc centre inside it. Square, so both are one number. */
export const COUNTRY_DISC_SIZE = Math.ceil(2 * (RING_OUTER_RADIUS + COUNTRY_DISC.shadowPad));
export const COUNTRY_DISC_CENTRE = COUNTRY_DISC_SIZE / 2;

const EMOJI_FONT_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
const SANS_FALLBACK_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

interface DiscTokens {
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

/** The same rule `components/ui/map.tsx` uses, so the disc and the basemap never disagree. */
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

function resolveTokens(theme: DiscTheme): DiscTokens {
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

/** `null` unless this is two ASCII letters — everything else is an empty disc, not a guess. */
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
 */
export function countryDiscImageId(spec: CountryDiscSpec, theme: DiscTheme): string {
  const code = normaliseCountryCode(spec.countryCode) ?? 'none';
  return `country-disc:${theme}:${code}${spec.active ? ':active' : ''}`;
}

/**
 * Rasterised discs, keyed by id and pixel ratio. A device has one pixel ratio and a session has one
 * theme, so this is a handful of entries; the point is that panning and re-styling never rebuild a
 * canvas.
 */
const cache = new Map<string, CountryDiscImage>();

export function clearCountryDiscImageCache(): void {
  cache.clear();
  measured.clear();
  flagGlyphsMemo = null;
}

function drawDisc(ctx: CanvasRenderingContext2D, tokens: DiscTokens, active: boolean): void {
  const centre = COUNTRY_DISC_CENTRE;
  const radius = COUNTRY_DISC.diameter / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 30, 28, 0.34)';
  ctx.shadowBlur = COUNTRY_DISC.shadowBlur;
  ctx.shadowOffsetY = COUNTRY_DISC.shadowOffsetY;
  ctx.fillStyle = tokens.surface;
  ctx.beginPath();
  ctx.arc(centre, centre, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = COUNTRY_DISC.borderWidth;
  ctx.strokeStyle = tokens.border;
  ctx.beginPath();
  ctx.arc(centre, centre, radius - COUNTRY_DISC.borderWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  if (active) {
    ctx.lineWidth = COUNTRY_DISC.ringWidth;
    ctx.strokeStyle = tokens.ring;
    ctx.beginPath();
    ctx.arc(centre, centre, RING_OUTER_RADIUS - COUNTRY_DISC.ringWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
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
 * fitting the reported box shrinks the flag to two thirds of the disc. Reading the pixels is
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

function drawFlag(
  ctx: CanvasRenderingContext2D,
  code: string,
  createCanvas: () => HTMLCanvasElement | null
): void {
  const centre = COUNTRY_DISC_CENTRE;
  ctx.save();
  // Clip to the disc: a font whose flag overhangs its advance cannot bleed over the border.
  ctx.beginPath();
  ctx.arc(centre, centre, COUNTRY_DISC.diameter / 2 - COUNTRY_DISC.borderWidth, 0, Math.PI * 2);
  ctx.clip();

  const glyph = flagEmoji(code);
  const font = `${PROBE_FONT_PX}px ${EMOJI_FONT_STACK}`;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(centre, centre);

  const box = measurePaintedBox(font, glyph, createCanvas);
  if (box) {
    const fit = Math.min(
      COUNTRY_DISC.flagWidth / box.width,
      COUNTRY_DISC.flagHeight / box.height
    );
    ctx.scale(fit, fit);
    ctx.fillText(glyph, -(box.left + box.width / 2), -(box.top + box.height / 2));
  } else {
    // No readback: fit the advance and centre on the em box. Looser, but it still lands in the disc.
    const advance = ctx.measureText(glyph).width;
    const scale = advance > 0 ? COUNTRY_DISC.flagWidth / advance : 1;
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
  const centre = COUNTRY_DISC_CENTRE;
  ctx.save();
  const font = `${COUNTRY_DISC.codeWeight} ${COUNTRY_DISC.codeFontPx}px ${tokens.fontFamily}`;
  ctx.font = font;
  ctx.fillStyle = tokens.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(centre, centre);

  // Two capitals at 14px overrun the inner disc on a wide face; squeeze rather than clip, so `WW`
  // stays inside the border on every font without changing the size the other codes read at.
  const limit = COUNTRY_DISC.diameter - 10;
  const box = measurePaintedBox(font, code, createCanvas);
  if (box) {
    // Optically centred on the caps: an all-caps pair has no descender, so a `middle` baseline
    // sits it visibly high in the disc.
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

function build(
  spec: CountryDiscSpec,
  options: CountryDiscOptions,
  tokens: DiscTokens,
  flags: boolean
): CountryDiscImage | null {
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;
  const canvas = createCanvas();
  if (!canvas) return null;
  canvas.width = Math.ceil(COUNTRY_DISC_SIZE * options.pixelRatio);
  canvas.height = Math.ceil(COUNTRY_DISC_SIZE * options.pixelRatio);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Everything below is authored in CSS pixels; the transform is the whole of the DPR story.
  ctx.scale(options.pixelRatio, options.pixelRatio);
  drawDisc(ctx, tokens, spec.active === true);

  const code = normaliseCountryCode(spec.countryCode);
  if (code) {
    if (flags) drawFlag(ctx, code, createCanvas);
    else drawCode(ctx, tokens, code, createCanvas);
  }

  return {
    id: countryDiscImageId(spec, options.theme),
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio: options.pixelRatio,
  };
}

/**
 * Every disc the layer needs, ready for `map.addImage(id, data, { pixelRatio })`.
 *
 * Duplicate specs collapse, already-built discs come from the cache, and a missing canvas yields
 * `[]` rather than throwing — the caller degrades to no country icons instead of failing to mount.
 */
export function buildCountryDiscImages(
  specs: readonly CountryDiscSpec[],
  options: CountryDiscOptions
): CountryDiscImage[] {
  if (specs.length === 0) return [];
  const tokens = resolveTokens(options.theme);
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
