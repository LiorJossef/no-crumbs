/**
 * **The one mark that stands for "this came from a TikTok", drawn in exactly one place.**
 *
 * TikTok is not one integration among several — it is the whole import path, the only VERIFIED
 * access mechanism (`04`), and the reason an Instagram or YouTube link is a *recognised redirect*
 * rather than a failure. Until now it was represented on five surfaces by Lucide's `Link2`: a chain
 * link standing in for the single platform the product is built around.
 *
 * ## Why this is a component and not five copies of an icon
 *
 * **Whether TikTok's own mark may be drawn here is a terms question, and the answer is no.** This
 * repository already enforces a third-party terms answer as *code* rather than as prose — `06` §3.1
 * gates Google Places content away from a non-Google renderer, and that gate is code on purpose. So
 * the mark is a seam: **every surface imports `PlatformMark` and nothing else knows what it draws.**
 * If written permission ever arrives, one file changes and no call site moves.
 *
 * `docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` is the ruling, and it is
 * VERIFIED against TikTok's own published sentence: *"You may not use TikTok logos, icons, symbols,
 * or designs, without our prior written permission."* We hold no such permission and no TikTok
 * product requires a mark here — we call the public oEmbed endpoint and use neither Login Kit nor
 * Share Kit, which are the documented *required-use* cases the logo licence is conditioned on. It
 * judges all four placements this component serves — the paste field, the import screens, the
 * source link and a list row — and refuses the mark on every one; §7 item 4 names *a play triangle
 * or a generic video card of our own drawing* as the permitted alternative, which is what is drawn
 * below. **What is permitted is the word, the `@handle` and the link back**, all three of which
 * ship, and III.3(n) makes the creator credit an obligation rather than a courtesy — so the
 * attribution lines beside these marks are not decoration and must not be refactored away.
 *
 * `platform-mark.test.ts` is the half of that promise a comment cannot keep. It asserts that no
 * screen in the import flow, and no place surface, draws a platform glyph of its own — which is the
 * property that makes "one file changed" true rather than aspirational.
 *
 * ## What ships today, and why it is not TikTok's mark
 *
 * A **portrait video frame with a play triangle**: what a person pasted is a vertical short-form
 * video, which is a fact about the artefact rather than a claim about its publisher. It carries no
 * trademark, so it needs no ruling to ship, and it is a real improvement over a chain link while
 * the ruling is outstanding. `data-platform-mark="neutral"` records which arm rendered.
 *
 * **No TikTok geometry is in the tree, and a redraw would not have helped.** The prohibition reaches
 * *"icons, symbols, or designs"*, which the ruling reads as covering a stylised approximation drawn
 * by us — and III.3(a) forbids alteration, so a note mark taking `currentColor` would be doubly
 * out. The mark below is not derived from TikTok's: it says *a vertical short-form video*, which is
 * a fact about the artefact the user pasted.
 *
 * ## What it must never say
 *
 * The mark means *this came from a TikTok*. It may not imply that the place is endorsed or
 * verified, that TikTok checked anything, or that this product has a relationship with TikTok —
 * Developer Terms III.3(o) and X make that a rule rather than a preference, and *"Powered by
 * TikTok"* and *"TikTok Partner"* are barred by both. That is why the mark is only ever drawn
 * beside a fact the product already states in words: `Open TikTok`, `@handle's TikTok`,
 * `Add a TikTok`.
 *
 * **And never on a list row or over the creator's own still.** Attribution attaches to the surface
 * that displays the content — the detail card and the review screen, which carry it — and a row in
 * the library is our record of a place rather than a reproduction of a TikTok. A glyph on every row
 * would also be a mark on the ~100% of rows that came from one, which distinguishes nothing.
 *
 * ## Colour: measured, and the answer is `currentColor`
 *
 * Measured at commit `8f8df84` with the repository's own instruments (CIEDE2000 as
 * `palette-tokens.test.ts` writes it; Machado, Oliveira & Fernandes 2009 at severity 1.0 as
 * `basemap-night.test.ts` writes it). **Neither TikTok brand pigment may enter this product's
 * colour system**, and each fails for its own reason:
 *
 *  - **TikTok cyan against the house mint: ΔE00 10.0, deuteranopic 7.8, protanopic 5.1**, 8° of hue
 *    and 1.2 L\* apart. Every colour floor in this repository is 18 normal / 7 under CVD. On the
 *    mint tile it measures **1.03:1** — invisible on the product's one saturated surface — and
 *    **1.31:1** on the light ground, so it is not usable as ink in daylight either.
 *  - **TikTok red against the restaurant category: ΔE00 13.4 night / 14.1 light, and 3.2 under
 *    deuteranopia.** That is below the pair the facelift *rejected and retuned* for being
 *    confusable. A platform mark that reads as a category is worse than a generic icon.
 *
 * So the glyph takes `currentColor` and inherits whatever role the surface already assigns — and
 * `platform-mark.test.ts` fences both hexes by value across `src/`, the same shape as the mascot
 * gold fence in `chrome-tokens.test.ts`. The fence exists whether or not the pigment ever does,
 * because the next author to reach for a brand colour will reach for those two.
 *
 * ## Two weights, and the rule is one sentence
 *
 * **`solid` marks the action; `outline` marks everything else.** There is exactly one role for the
 * heavy weight — the product's primary call to action, `Add a TikTok link` — and every other
 * surface takes the light one: the flow's kickers, the paste field's affordance, the three
 * thumbnail fallbacks, the source link. A second weight earns its place by having a rule; without
 * one it is two icons.
 *
 * **`outline`** is Lucide's construction — a 24 unit box, `stroke-width: 2`, round caps and joins —
 * because it sits inline beside Lucide glyphs (`ArrowUpRight` on the source link, `ChevronDown` on
 * the caption disclosure) and a mark visibly heavier than its neighbours reads as a logo dropped
 * into a toolbar. Its triangle is filled rather than stroked: at `size-3.5` a 3-stroke outline
 * closes into a blob, and the play shape is the half of the mark that survives at 14px.
 *
 * **`solid`** is the same geometry filled, with the triangle knocked *out* through `evenodd` so the
 * button's own ground shows through it. Compared against the outline weight on a real
 * `#A8ECE2` / `#123B35` button at 16, 20 and 24px: the outline disappears into 14px bold text at
 * button scale, and 24 is heavier than the label it sits beside. **20px at `gap-2` is what ships.**
 *
 * ## What the CTA deliberately does not do
 *
 * It keeps the glyph **centred with the label**, not pinned left with the label centred. That
 * second composition is the social-sign-in button shape — and it is the shape of the one button
 * TikTok actually licenses, `Continue with TikTok`, measured in its own developer pack at 315×44.
 * Borrowing a layout in order to evoke a platform whose mark we may not use is trade dress with
 * deniability, which is a worse position than using the mark. The glyph, the weight and the
 * placement are ours; the word is the permitted use.
 */

export function PlatformMark({
  className,
  variant = 'outline',
}: {
  className?: string;
  /** `solid` is reserved for the primary call to action. See the weight rule above. */
  variant?: 'outline' | 'solid';
}) {
  if (variant === 'solid') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        aria-hidden="true"
        data-platform-mark="neutral"
        data-platform-weight="solid"
        fill="currentColor"
      >
        {/* One path, `evenodd`: the frame is the outer subpath and the play triangle is the inner
            one, so the triangle is a hole rather than a second shape in a second colour. That is
            what keeps this weight `currentColor`-only like the other, and it is why the triangle
            reads mint on the mint CTA without anything here knowing the button's ground. */}
        <path
          fillRule="evenodd"
          d="M9 2h6a3.5 3.5 0 0 1 3.5 3.5v13A3.5 3.5 0 0 1 15 22H9a3.5 3.5 0 0 1-3.5-3.5v-13A3.5 3.5 0 0 1 9 2Zm1.4 6.6v6.8L16 12l-5.6-3.4Z"
        />
      </svg>
    );
  }

  return renderOutline(className);
}

function renderOutline(className: string | undefined) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      // Decorative on every surface it appears on: each one already names TikTok in words beside
      // it, and a second announcement would be the mark making a claim of its own.
      aria-hidden="true"
      data-platform-mark="neutral"
      data-platform-weight="outline"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The portrait frame. 13 x 20 of a 24 box is a 0.65 aspect — portrait enough to read as a
          phone-shaped video, wide enough to hold the triangle with air on both sides.

          **Rendered and compared rather than picked.** 12, 13 and 14 units wide were drawn at 14px
          and 16px, bare and inside the kicker's 28px disc: at 12 the mark is optically smaller than
          the Lucide glyphs it sits beside (7px of ink against `Link2`'s 14), and at 14 it stops
          reading as portrait. 13 at `size-4` matches the row's weight and keeps the aspect. */}
      <rect x="5.5" y="2" width="13" height="20" rx="3.5" />
      {/* The play shape, filled, inside the 11-unit interior the 2-unit walls leave. */}
      <path d="M10.4 9 15.4 12l-5 3Z" fill="currentColor" strokeWidth={1.4} />
    </svg>
  );
}
