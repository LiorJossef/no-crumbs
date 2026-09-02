/**
 * The reading direction of a piece of text, from its first strong-directional character.
 *
 * **Why this exists rather than another `dir="auto"`.** `dir="auto"` is the same algorithm applied
 * per element, and applying it per element is the defect: on one Hebrew place the card resolved
 * six directions down one column — the heading isolated inside an LTR block (start edge left), the
 * category line auto (right), the address LTR chrome (left), the quote auto (right), the note auto
 * (right), the dish line's outer paragraph LTR (left). The eye jumps back and forth instead of
 * following a vertical scan. The fix is not a better per-block heuristic; it is **fewer scopes** —
 * the card resolves one direction from the place itself, the note resolves one from what the user
 * typed, and every block inherits. Deciding both from one function is what keeps them from drifting
 * into two heuristics.
 *
 * Foreign runs *inside* either scope keep their `<bdi>` isolation, which is what preserves the
 * mixed-run ordering `docs/rtl-audit-2026-08-31.md` verified. This decides alignment, never
 * ordering.
 *
 * Deliberately coarse: first strong character wins, and `ltr` is the answer for a string with no
 * strong character at all (a number, an emoji, punctuation, empty, absent). A Hebrew caption on a
 * Latin-named place therefore renders LTR-aligned with correct ordering — accepted in the spec
 * (§6), because the alternative is the flipping this replaces.
 */
export function textDirection(sample: string | null | undefined): 'rtl' | 'ltr' {
  if (!sample) return 'ltr';
  for (const character of sample) {
    const code = character.codePointAt(0) ?? 0;
    // Hebrew through the Arabic Extended blocks, plus the Arabic presentation forms. Hebrew is the
    // one measured daily here; the rest cost nothing and would otherwise be silently mis-aligned.
    if (
      (code >= 0x0590 && code <= 0x08ff) ||
      (code >= 0xfb1d && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      return 'rtl';
    }
    // Latin, Greek, Cyrillic, Armenian, the Indic blocks and CJK — everything strong that is not
    // the above. Checked in the same pass, which is what makes this *first* strong character
    // rather than "contains any".
    if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a) ||
      (code >= 0x00c0 && code <= 0x024f) ||
      (code >= 0x0370 && code <= 0x058f) ||
      (code >= 0x0900 && code <= 0x1fff) ||
      (code >= 0x2c00 && code <= 0xd7ff) ||
      (code >= 0xf900 && code <= 0xfb17)
    ) {
      return 'ltr';
    }
  }
  return 'ltr';
}
