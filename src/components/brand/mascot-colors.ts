/**
 * The mascot's own palette, and the five constructions it is drawn in.
 *
 * ## Why this is not in `brand-colors.ts`
 *
 * Because gold is not a brand colour, and that distinction is the load-bearing one in the whole
 * identity. `docs/no-crumbs-design-system.html` §`colour` states it as a refusal: the obvious move
 * is to make toast-gold the brand colour, *"I am not doing that, because gold sits a few degrees
 * from the café category amber, and the entire point of the facelift's colour work is that on this
 * map colour means what a place is."* So there are three colour jobs, kept in three modules:
 *
 *  - **`brand-colors.ts`** — *what you can press.* Mint, ink, paper. Its unit test asserts it holds
 *    no warm colour at all, and that assertion is still correct.
 *  - **this file** — *who we are.* Gold, crust, keyline, blush. Five surfaces, and never a UI role.
 *  - **`ui/place/palette.ts`** — *what a place is.* Every pin, chip and row.
 *
 * ## The rule this file breaks, on the owner's instruction, and what actually changed
 *
 * §`colour` also says gold and mint *"never appear on the same surface"*, and until I2-W the app
 * icon was drawn as the mint silhouette on mint for that reason. **The rendered design system
 * contradicts its own sentence**: §`apps` draws the app icon and the link preview as the *gold
 * mascot on a mint tile*, at 180/64/32/16px, and the team lead's ruling against that was withdrawn
 * on 2026-08-31 once the drawing was actually opened. Build it as drawn.
 *
 * The sentence is not wrong, it is narrower than it reads. What it protects is **the map**: rule 5,
 * *"gold stays off the map — the mascot's palette never appears where category colour lives, or
 * colour stops meaning what a place is."* An app icon is not where category colour lives. Nothing
 * in this module may be imported by `components/map/**`, and a unit test holds that line.
 *
 * Literals rather than tokens, for the same four reasons `brand-colors.ts` gives: `icon.svg` is a
 * static file with no document, `apple-icon.tsx` and `opengraph-image.tsx` render through satori,
 * which has no cascade and no custom properties, and the character has to be identical across all
 * three.
 */

/** The body, and the whole reason gold may not also be the brand colour: it sits a few degrees
 *  from the café category amber. The value is on the next line rather than in this sentence — a
 *  hex quoted in prose is a snapshot that stops being true the moment the one below it moves. */
export const MASCOT_GOLD = '#F2C46B';

/** The crust — the darker underside, drawn clipped to the outline. */
export const MASCOT_CRUST = '#E0A845';

/** The keyline and every ink feature of the face. */
export const MASCOT_INK = '#3A2A15';

/** The blush, at 50% (60% on Flat, which has no keyline to carry the edge). */
export const MASCOT_BLUSH = '#F0866A';

/** The catchlight, at 28%. */
export const MASCOT_SHINE = '#FFFFFF';

/** Flat's warmer ink. It has no keyline, so its features carry the whole character and a
 *  near-black would read as a different, colder drawing. */
export const MASCOT_INK_FLAT = '#6B4A1E';

/**
 * Night's deeper keyline, *"so the edge does not glow"* on a dark ground.
 *
 * **Measured 2026-08-31, and it is not the fix for a mascot on a dark card.** §`styles`' sentence
 * protects against a keyline that is too *light* on the night **map**, where the ground is a
 * basemap. On a dark **card** there is no glow to prevent, and going deeper removes the edge
 * instead: against `--card` `#201F1C` this reads ΔE00 **6.3** where `MASCOT_INK` reads **11.9**.
 * What Night improves is keyline-against-body — the character's internal drawing, 64.6 → 71.5 —
 * which was never the question. Correct about a narrower case than its reader assumes.
 */
export const MASCOT_INK_NIGHT = '#20170B';

/**
 * **The keyline's two values, and why it is the one part of the character that follows the theme.**
 *
 * The keyline exists because gold on paper barely separates from it: `MASCOT_GOLD` against
 * `--card` in light is **1.63:1**, ΔE00 26.3. Without an outline the shape's edge dissolves. On a
 * dark card the same gold is **10.11:1**, ΔE00 71.3 — the body separates itself by a mile, and the
 * keyline stops being what makes the character visible.
 *
 * **So this is a fidelity fix and not an accessibility one, and the distinction is worth keeping**
 * because the first report of it — mine — overstated it as *"the keyline is near-invisible, so the
 * crumb reads as a gold disc without an edge."* Measured, `MASCOT_INK` on the dark card is ΔE00
 * **11.9**: a quiet rim, not an absent one, and the character is legible either way. What is
 * actually wrong is that **Outlined renders as very nearly Flat on dark** — one construction
 * drawing two different characters depending on the theme.
 *
 * `MASCOT_KEYLINE_DARK` doubles the edge, to **ΔE00 23.9**, and it is deliberately the same value
 * as `MASCOT_INK_FLAT`: Flat's ink was chosen warm because a near-black reads as a colder drawing
 * against gold, and that is the identical reason a keyline needs warmth to sit on a dark ground
 * without going to charcoal. Two names for one value because they are two decisions that happen to
 * agree — if either moves, the other should be re-argued rather than dragged along.
 *
 * **Light is untouched.** Swapping the whole keyline to the warm value would cost the light theme
 * the edge it actually needs: rendered side by side on `#FFFFFF`, the warm rim is visibly softer
 * than `MASCOT_INK`'s. Theming it is the point.
 */
export const MASCOT_KEYLINE_LIGHT = MASCOT_INK;
export const MASCOT_KEYLINE_DARK = MASCOT_INK_FLAT;

/**
 * The token the DOM reads for it, with the light value as the literal fallback.
 *
 * **The fallback is not decoration.** An unresolved `var()` makes the whole declaration invalid, so
 * a `stroke` that names a token which does not exist yet resolves to `none` and the keyline
 * *vanishes* — the opposite of the defect being fixed. With the fallback this renders exactly as it
 * does today until `--mascot-keyline` lands in `globals.css`, and follows the theme the moment it
 * does. Safe in either order, which is what lets the component and the token land in separate
 * commits held by separate lanes.
 *
 * The image routes do not use it: satori has no cascade and a `<canvas>` has no stylesheet, so
 * `apple-icon`, `opengraph-image` and the map's marker routine take the literals above. That is the
 * same split `ui/place/palette.ts` documents at length for the category colours.
 */
export const MASCOT_KEYLINE_VAR = `var(--mascot-keyline, ${MASCOT_KEYLINE_LIGHT})`;

/**
 * **The trail's three crumbs**, and they are a ramp rather than three picks: the furthest crumb is
 * the crust and each one after it steps toward the body, so the trail reads as the character
 * gathering itself rather than as three objects of three colours. `#motion` draws exactly these.
 *
 * Not exported as a general "gold ramp": there is no other consumer and inventing one would invite
 * gold onto a surface `#rules` rule 5 keeps it off.
 */
export const MASCOT_TRAIL = ['#E0A845', '#E8B457', '#EFBE64'] as const;

/**
 * **The seven animations, and where each one is allowed.** `#motion`'s constraint is the one that
 * decides the set: *"none of them may imply progress the product cannot measure. The import call is
 * request/response with no percentage, so an animation that fills, counts down or completes would
 * be a lie told sixty times a day."*
 *
 *  - `stir` — **the idle state, added 2026-08-31 on the owner's *"it should be alive! not just a
 *    logo"*.** A 17s cycle, a measured 85.6% of it rest pose, two dissimilar stirs at unequal
 *    gaps of 7.8s and 6.7s. It
 *    is the only one of these licensed on the map, and the licence is a fact rather than a
 *    judgement: it rotates, and rotation is the one gesture the data surface has never used —
 *    `icon-rotate` appears nowhere in `components/map/`, whose whole motion vocabulary is
 *    `icon-opacity` (the landing fade) and `icon-translate: [0,-3]` (the selected pin's lift). Bob
 *    would say *selected* on a loop and a halo pulse would say *landing*; a rotation says nothing
 *    that surface has ever said. `globals.css` carries the argument at the keyframe.
 *  - `bob` — the workhorse. Squash-and-stretch on a 1.15s loop, anywhere a spinner would have gone.
 *  - `wobble` — **the import wait.** Calmer, slower, no vertical travel: *"seven to thirty-four
 *    seconds is a long time to watch something bounce. Wobble reads as patient; Bob reads as
 *    impatient by about second six."*
 *  - `scan` — eyes track left to right. The only one that says *working on your thing* rather than
 *    *working*.
 *  - `land` — **one-shot, never a loop.** The success beat, timed to the pins dropping. *"If it
 *    loops it stops being an event and becomes wallpaper."*
 *  - `halo` — a slow pulse behind the body. Locating. Reads as a signal, not as progress.
 *  - `none` — the resting mark, and the default.
 *
 * **`trail` is not in this union** because it is not a property of the character: it is three
 * crumbs *and* a character, so it is a component of its own (`CrumbTrail`).
 *
 * **`nibble` is not built at all.** `#motion` lists it seventh and restricts it to marketing —
 * *"it implies a countdown we cannot honour, so: marketing only, never the import rail."* This
 * product has no marketing surface, so building it would be an animation with no screen behind it,
 * which is `#rules` rule 6 in the same shape the mood rule takes. It arrives with the surface or
 * not at all.
 *
 * `spark` is absent for a different reason: it is not one of the seven. It is the `found` mood's
 * own decoration and rides with that mood rather than being chosen.
 */
export type CrumbAnimation = 'none' | 'stir' | 'bob' | 'wobble' | 'scan' | 'land' | 'halo';

/**
 * **Five constructions, one silhouette** — §`styles`. Contexts, not alternates: pick by the surface,
 * never by taste, and the outline is identical in all five.
 *
 *  - `outlined` — the default. Heavy dark keyline, flat fill. Best above 40px.
 *  - `flat` — no keyline, warmer ink. Reads cleaner small and sits better inside an app-icon mask.
 *  - `chunky` — thicker line, more toy-like. Strongest large; muddies below 32px. Merch.
 *  - `mono` — silhouette only, takes `currentColor`. **This is the pin, the favicon, and any
 *    single-colour context.** Every feature is dropped, including the face: a mono mascot is a
 *    shape, and that is what makes one path serve 16px and 168px.
 *  - `night` — the same gold on a dark ground with a deeper keyline.
 */
export type CrumbConstruction = 'outlined' | 'flat' | 'chunky' | 'mono' | 'night';

export interface CrumbPalette {
  /** The body fill. `currentColor` on Mono, which is what lets the pin take a category colour. */
  readonly body: string;
  /** The crust, or `null` where the construction drops it. */
  readonly crust: string | null;
  /** The catchlight, or `null`. */
  readonly shine: string | null;
  /** The keyline colour, or `null` where there is no keyline (Flat, Mono). */
  readonly keyline: string | null;
  /** Ink for the face's features, or `null` where the construction has no face at all (Mono). */
  readonly ink: string | null;
  /** The blush, or `null`. */
  readonly blush: string | null;
  readonly blushOpacity: number;
  readonly shineOpacity: number;
  /** Stroke width of the keyline, in the 100-square. */
  readonly keylineWidth: number;
  /** Stroke width of a stroked face feature — an eye arc, a mouth. */
  readonly featureWidth: number;
}

const SHINE_OPACITY = 0.28;

export const CRUMB_CONSTRUCTIONS: Readonly<Record<CrumbConstruction, CrumbPalette>> = {
  outlined: {
    body: MASCOT_GOLD,
    crust: MASCOT_CRUST,
    shine: MASCOT_SHINE,
    keyline: MASCOT_INK,
    ink: MASCOT_INK,
    blush: MASCOT_BLUSH,
    blushOpacity: 0.5,
    shineOpacity: SHINE_OPACITY,
    keylineWidth: 4.5,
    featureWidth: 4.2,
  },
  flat: {
    body: MASCOT_GOLD,
    crust: MASCOT_CRUST,
    shine: MASCOT_SHINE,
    keyline: null,
    ink: MASCOT_INK_FLAT,
    blush: MASCOT_BLUSH,
    blushOpacity: 0.6,
    shineOpacity: SHINE_OPACITY,
    keylineWidth: 0,
    featureWidth: 4.2,
  },
  chunky: {
    body: MASCOT_GOLD,
    crust: MASCOT_CRUST,
    shine: MASCOT_SHINE,
    keyline: MASCOT_INK,
    ink: MASCOT_INK,
    blush: MASCOT_BLUSH,
    blushOpacity: 0.5,
    shineOpacity: SHINE_OPACITY,
    keylineWidth: 7,
    featureWidth: 5.6,
  },
  mono: {
    body: 'currentColor',
    crust: null,
    shine: null,
    keyline: null,
    ink: null,
    blush: null,
    blushOpacity: 0,
    shineOpacity: 0,
    keylineWidth: 0,
    featureWidth: 0,
  },
  night: {
    body: MASCOT_GOLD,
    crust: MASCOT_CRUST,
    shine: MASCOT_SHINE,
    keyline: MASCOT_INK_NIGHT,
    ink: MASCOT_INK_NIGHT,
    blush: MASCOT_BLUSH,
    blushOpacity: 0.5,
    shineOpacity: SHINE_OPACITY,
    keylineWidth: 4.5,
    featureWidth: 4.2,
  },
};
