/**
 * Where a pin's name is allowed to break, when the name is half Hebrew and half Latin.
 *
 * ## The bug this exists for
 *
 * MapLibre chooses line breaks **before** it applies bidi, and it applies bidi **per line**
 * (`shapeText` in `maplibre-gl`: `determineLineBreaks` runs over the logical string, then
 * `processStyledBidirectionalText` reorders each resulting line on its own). So a name whose two
 * halves run in opposite directions gets cut at whatever index the width algorithm liked, and the
 * two halves of that cut are then re-ordered *independently*. The result is a label whose lines do
 * not read in the order the name is written.
 *
 * Measured against the vendored plugin itself (`@mapbox/mapbox-gl-rtl-text@0.4.0`, the same build
 * MapLibre loads in its worker), breaking `Black store-בלאק סטור תל אביב` at the index the width
 * algorithm picks returns, in visual order:
 *
 * ```
 *   line 0: Black store-לת רוטס קאלב
 *   line 1: ביבא
 * ```
 *
 * — the Hebrew name's last word alone on line 2, under a line that mixes both scripts. Handing the
 * plugin the same string with a break **at the direction boundary** returns:
 *
 * ```
 *   line 0: Black store-
 *   line 1: ביבא לת רוטס קאלב
 * ```
 *
 * which is the name, in order, one script per line.
 *
 * ## Why a hard break and not the pills' bitmap
 *
 * `country-flag-image.ts` fixed the *summary pills* by drawing them as one image, because their bug
 * was different: a name and a count in one run, where the count is placed at the paragraph's end
 * and the paragraph's direction comes from the name. There is no line-break in a pill. Here the
 * whole bug **is** the line break, so taking the break decision back is the whole fix — and a pin
 * label is one per saved place rather than one per country, so a bitmap per label would trade a
 * bounded set of images for an unbounded one (`06` §9.1's 2 000-place ceiling).
 *
 * ## Why MapLibre still gets to wrap
 *
 * A `\n` is `breakable` in MapLibre with a penalty of −10 000, which enters the badness function
 * squared: no line width a place name can reach comes close to overriding it, so a break we insert
 * is always taken. Every break MapLibre adds on top of ours therefore falls *inside* one of our
 * segments — and a break inside a single-direction run is harmless, because that line still holds
 * one direction. So `text-max-width` keeps doing the width work and this file only guarantees the
 * one property the renderer cannot recover from: **no line spans a direction boundary.**
 */

/** Hebrew, Arabic and the other right-to-left blocks, plus their presentation forms. Hebrew is the
 *  one this product is measured on (`p002-hebrew-english-is-the-language-scope`); the rest are here
 *  because the failure mode is identical and excluding them would be arbitrary. */
const RTL_CHAR =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

/** Any letter that is not one of those. Digits, spaces and punctuation are deliberately *not*
 *  strong: `Cafe 12 קפה` has two runs, not four, and the neutral `12 ` belongs to the run before
 *  it exactly as Unicode would place it. */
const LETTER = /\p{L}/u;

type Direction = 'rtl' | 'ltr';

function directionOf(char: string): Direction | null {
  if (RTL_CHAR.test(char)) return 'rtl';
  if (LETTER.test(char)) return 'ltr';
  return null;
}

/**
 * The name split into one segment per strong-direction run, in the order it is written.
 *
 * Neutral characters — the hyphen in `Black store-בלאק`, the space in `בית קפה יפני Kohi` — attach
 * to the run *before* them, so a trailing `-` stays with the Latin half rather than becoming the
 * first thing on the Hebrew line. Segments are trimmed, so the space at a boundary disappears
 * instead of becoming a leading space on the next line.
 */
export function directionRuns(name: string): string[] {
  const runs: string[] = [];
  let current = '';
  let currentDirection: Direction | null = null;
  let pending = '';

  for (const char of name) {
    const direction = directionOf(char);
    if (direction === null) {
      pending += char;
      continue;
    }
    if (currentDirection === null || direction === currentDirection) {
      current += pending + char;
      pending = '';
      currentDirection = direction;
      continue;
    }
    current += pending;
    pending = '';
    runs.push(current);
    current = char;
    currentDirection = direction;
  }
  runs.push(current + pending);

  return runs.map((run) => run.trim()).filter((run) => run !== '');
}

/**
 * The string the pin layer's `text-field` reads: the name, with a hard line break at every point
 * where it changes direction.
 *
 * A name written in one script comes back untouched — same string, same object identity for the
 * common case — so nothing about a pure-Hebrew or pure-Latin library changes, including how
 * MapLibre wraps it.
 */
export function pinLabelText(name: string): string {
  const runs = directionRuns(name);
  if (runs.length <= 1) return name;
  return runs.join('\n');
}
