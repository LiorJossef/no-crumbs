/**
 * **The one mark that stands for "this came from a TikTok", drawn in exactly one place.**
 *
 * TikTok is not one integration among several — it is the whole import path, the only VERIFIED
 * access mechanism (`04`), and the reason an Instagram or YouTube link is a *recognised redirect*
 * rather than a failure.
 *
 * ## This draws TikTok's note, and that reverses a written ruling
 *
 * **Owner decision, 2026-09-03.** `docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md`
 * ruled the mark out, VERIFIED against TikTok's own published sentence: *"You may not use TikTok
 * logos, icons, symbols, or designs, without our prior written permission."* We hold no such
 * permission, and the licence in Developer Terms II.2 covers only the cases a TikTok product
 * *requires* the mark — the Login Kit / Share Kit buttons, neither of which we use. So the ruling
 * was correct as written and it is still correct as written.
 *
 * It is overridden on **scale, not on law**: this is a university project with no users, due to come
 * down within days of this date. The owner weighed the exposure against the fact that every neutral
 * alternative — a play triangle, a video card, a portrait frame, a bare triangle — carries only
 * *"this is a video"* beside text that already says `Open on TikTok`, and judged the generic marks
 * not worth their place. That is a call the owner is entitled to make and it is recorded here rather
 * than argued again.
 *
 * **What that means for anyone picking this up later.** If this product ever acquires users, ships
 * commercially, or outlives the coursework, this file is the first thing to revisit: either obtain
 * written permission from TikTok, or return to the neutral mark, which is preserved in this file's
 * history and whose reasoning is intact in the evidence document. **The evidence document is not
 * wrong and must not be deleted** — §7 of it records this reversal; the ruling above it stands as
 * the analysis that a permission request would be built on.
 *
 * ## Monochrome, and that part is not a preference
 *
 * The note takes `currentColor`. **Neither TikTok brand pigment enters this product's colour
 * system**, measured at commit `8f8df84` with the repository's own instruments (CIEDE2000 as
 * `palette-tokens.test.ts` writes it; Machado, Oliveira & Fernandes 2009 at severity 1.0 as
 * `basemap-night.test.ts` writes it):
 *
 *  - **TikTok cyan against the house mint: ΔE00 10.0, deuteranopic 7.8, protanopic 5.1** — 8° of hue
 *    and 1.2 L\* apart, against floors of 18 normal / 7 under CVD. On the mint tile it measures
 *    **1.03:1**, invisible on the product's one saturated surface, and **1.31:1** on the light
 *    ground, so it is not usable as ink in daylight either.
 *  - **TikTok red against the restaurant category: ΔE00 13.4 night / 14.1 light, 3.2 under
 *    deuteranopia** — below the pair the facelift rejected and retuned for being confusable. A
 *    platform mark that reads as a category is worse than a generic icon.
 *
 * So the two-colour offset treatment is out on measurement, independently of the trademark
 * question, and `platform-mark.test.ts` fences both hexes by value across `src/`. That fence stays.
 * The glyph inherits whatever role the surface assigns and is correct in both themes by not having
 * an opinion.
 *
 * ## Why this is still one component
 *
 * **Every surface imports `PlatformMark` and nothing else knows what it draws.** That seam is what
 * made today's swap one file, and it is what makes the reversal above one file if it is ever taken.
 * `platform-mark.test.ts` asserts no screen in the import flow and no place surface draws a platform
 * glyph of its own, which is the property that makes "one file changed" true rather than
 * aspirational.
 *
 * ## What it must never say
 *
 * Unchanged by the swap, and more load-bearing now rather than less. The mark means *this came from
 * a TikTok*. It may not imply the place is endorsed or verified, that TikTok checked anything, or
 * that this product has a relationship with TikTok — Developer Terms III.3(o) and X make that a rule
 * rather than a preference, and *"Powered by TikTok"* and *"TikTok Partner"* are barred by both. The
 * mark is only ever drawn beside a fact the product already states in words: `Open on TikTok`,
 * `@handle's TikTok video`, `Add a TikTok link`. III.3(n) makes the creator credit an obligation
 * rather than a courtesy, so the attribution lines beside these marks must not be refactored away.
 *
 * **And never on a list row or over the creator's own still.** Attribution attaches to the surface
 * that displays the content — the detail card and the review screen, which carry it. A row in the
 * library is our record of a place, not a reproduction of a TikTok, and a glyph on every row would
 * mark the ~100% of rows that came from one, distinguishing nothing.
 *
 * ## The weights collapsed
 *
 * The old mark had an outline form and a filled form, and `solid` marked the primary CTA. **A note
 * is a single filled silhouette — there is no outline of it** — so that distinction died with the
 * disc. Both arms now render the same geometry; see the `variant` prop for the removal that owes.
 */
export function PlatformMark({
  className,
  variant = 'outline',
}: {
  className?: string;
  /**
   * **Vestigial as of 2026-09-03 and kept only so no call site had to move in the same change.**
   * The two weights existed because the neutral disc had an outline form and a filled form. The
   * note is a single filled silhouette — there is no outline of it — so both arms now render the
   * same geometry and the prop selects nothing. Delete it and the `solid` call sites together, as
   * one change, once `library-selection.tsx` and `place-sheet.tsx` are free; `platform-mark.test.ts`
   * pins the current behaviour so the removal cannot go unnoticed.
   */
  variant?: 'outline' | 'solid';
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      // Decorative on every surface it appears on: each one already names TikTok in words beside
      // it, and a second announcement would be the mark making a claim of its own.
      aria-hidden="true"
      data-platform-mark="tiktok"
      data-platform-weight={variant}
      fill="none"
    >
      {/* One filled subpath in `currentColor`. The note's counter is carved by the arc's own sweep
          rather than by a second subpath, so there is no hole to lose and no second `fill` for a
          pigment to sneak back in through — which is the invariant the evenodd disc was protecting
          and the one `platform-mark.test.ts` actually asserts. */}
      <path
        d="M14.2 2.5h-2.9v12.4a2.25 2.25 0 1 1-2.25-2.25c.2 0 .39.03.57.08v-2.9a5.3 5.3 0 1 0 4.55 5.24V9.35a6.8 6.8 0 0 0 3.9 1.22V7.75c-2.16 0-3.87-1.72-3.87-3.9z"
        fill="currentColor"
      />
    </svg>
  );
}
