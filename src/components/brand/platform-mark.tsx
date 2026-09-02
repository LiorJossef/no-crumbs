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
 * A **play triangle in a circle**: what a person pasted is a short-form video, which is a fact
 * about the artefact rather than a claim about its publisher. It carries no trademark, so it needs
 * no ruling to ship. `data-platform-mark="neutral"` records which arm rendered.
 *
 * **Changed 2026-09-02, owner's choice, from a portrait video frame with a play triangle inside
 * it.** The owner's report was that the frame "doesn't look good"; drawn beside the alternatives at
 * 14px, 20px and on the live mint CTA, the reason is legible — the frame was two shapes competing
 * inside a 13-unit-wide box, and at `size-3.5`, which is where this mark is used most, the triangle
 * had roughly two units of air on either side and closed up. The disc gives the triangle the whole
 * interior and matches Lucide's own circle glyphs, which is what the outline weight's construction
 * rule was always aiming at.
 *
 * **What was NOT lost with the frame.** The portrait aspect was carrying one extra fact — *vertical*
 * short-form video — and the disc drops it. That is an acceptable trade because no surface depends
 * on it: every one of them names TikTok in words beside the mark, so the glyph never had to carry
 * the platform, only the medium. What it must not become is a shape that says *press me* — see the
 * note on the bare triangle below.
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
 * beside a fact the product already states in words: `Open on TikTok`, `@handle's TikTok video`,
 * `Add a TikTok link`.
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
 * **`solid` marks the action; `outline` marks everything else.** One role for the heavy weight —
 * **a primary mint button whose action is adding a TikTok link** — and every other surface takes
 * the light one: the flow's kickers, the two field affordances, the three thumbnail fallbacks, the
 * source link. A second weight earns its place by having a rule; without one it is two icons.
 *
 * There are **three** such buttons and `platform-mark.test.ts` enumerates them, so a fourth surface
 * reaching for the heavy weight fails rather than ships. It was written naming one and the third
 * arrived within the hour — `add-sheet.tsx`, which is the arm the map's `＋` actually routes
 * through and therefore the live one. The guard firing is the ratchet working; extending an
 * enumeration with the reason recorded is what it is for, and it is not the same thing as the
 * single-source rule above, which may not be extended at all.
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
 *
 * **And that licence is the stronger half of the argument, not the optics.** Developer Terms II.2
 * grants the logo licence only where a TikTok product *requires* the mark, and the documented
 * required-use case is the Login Kit / Share Kit button. **So the social-sign-in silhouette is
 * specifically the silhouette of an integration we do not have** — a button copying it moves us
 * toward implying the one thing the licence would have covered and we were never granted. That is
 * trade dress with deniability, which is a worse position than using the mark outright.
 *
 * ## The candidate that was rejected, and why it is worth writing down
 *
 * A **bare play triangle** was drawn alongside and is the simplest mark available — it survives any
 * size and needs no construction rule at all. It was rejected on meaning rather than on optics: a
 * bare triangle is the universal *press to play* affordance, so beside a source link it names an
 * action this product does not offer. We do not play the video; we point at it. The enclosing shape
 * is what turns the triangle from a button into a noun.
 *
 * The glyph, the weight and the placement are ours; the word is the permitted use.
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
        {/* One path, `evenodd`: the disc is the outer subpath and the play triangle is the inner
            one, so the triangle is a hole rather than a second shape in a second colour. That is
            what keeps this weight `currentColor`-only like the other, and it is why the triangle
            reads mint on the mint CTA without anything here knowing the button's ground. */}
        <path
          fillRule="evenodd"
          d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm-2 7 6 3.5-6 3.5v-7Z"
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
      {/* A 9.5-radius disc, which is Lucide's own circle geometry (`circle-play`, `circle-check`)
          rather than a size picked here — the point of matching it is that this mark sits inline
          with Lucide glyphs and must not read as a logo dropped into a toolbar. */}
      <circle cx="12" cy="12" r="9.5" />
      {/* The play shape, filled, centred in the disc. Filled rather than stroked for the same
          reason the frame's triangle was: at `size-3.5` a 2-unit stroke closes into a blob, and the
          triangle is the half of the mark that has to survive at 14px. */}
      <path d="M10 8.5 16 12l-6 3.5Z" fill="currentColor" strokeWidth={1.4} />
    </svg>
  );
}
