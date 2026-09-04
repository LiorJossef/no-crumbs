import type { Transition, Variants } from 'motion/react';

/**
 * **The signature entrance, as a specification. `globals.css` is the executor.**
 *
 * One orchestrated page-load moment for `/sign-in` and `/` (`iteration-2-plan.md` §3, `I2-6`), kept
 * in one file so the two screens cannot drift into two different arrivals.
 *
 * ## This file used to run the entrance, and running it in JavaScript shipped a blank front door
 *
 * These variants drove Motion components. Motion writes a variant's initial state into the server
 * HTML — correct, and what stops a flash of finished layout — so `/` and `/sign-in` shipped **10 and
 * 11 inline `opacity: 0` declarations**, the card among them, and the only thing that removed them
 * was React hydrating. Measured by aborting every `.js` request with scripting still *enabled*, the
 * shape of a slow connection or a hydration error: **minimum opacity 0, 0 of 7 controls visible.**
 * The `<noscript>` fallback could not help, because scripting was on and the code that would have
 * revealed the content was the code that failed.
 *
 * The entrance is now `@keyframes` in `globals.css`, driven by `data-entrance` attributes. A CSS
 * animation needs no framework, and `animation-fill-mode: both` makes the resting state the *end*
 * of the animation rather than something a script must apply: if the stylesheet loads the page
 * reveals itself, and if it does not the page was never hidden. There is no third case.
 *
 * ## So what is this file still for
 *
 * **The numbers and the argument**, in one place a reader can find, and the shape assertion in
 * `tests/unit/design-system/chrome-tokens.test.ts` — which is worth keeping for a reason that
 * outlived the executor: it holds every variant to `opacity` and `transform` only. A `height` or a
 * `filter` in this sequence would survive `prefers-reduced-motion` untouched, and the media query in
 * `globals.css` that collapses the entrance can only collapse what it can name.
 *
 * **The values are duplicated into `globals.css` and nothing yet guards the pair.** That is the
 * `palette.ts` arrangement without `palette-tokens.test.ts`, and it is a known gap rather than an
 * oversight: the test file belongs to another lane as of 2026-08-31 and the assertion has to be
 * added there. Until it is, changing a number here changes documentation and not behaviour.
 *
 * ## The sequence, and the one hard constraint on it
 *
 * | | |
 * |---|---|
 * | 60 ms | the card rises — opacity, 18px of `y`, and 1.5% of scale |
 * | 180 ms | its children begin, 45 ms apart: the lockup, kicker, headline, subhead, then the form |
 * | ~790 ms | the last child has settled |
 *
 * **It must not delay the field being focusable**, which is `I2-6`'s exit criterion and the reason
 * every value here is `opacity`/`transform` only. Nothing is conditionally mounted, nothing is
 * `display: none`, nothing waits on an animation callback: the whole form is in the DOM and
 * hit-testable at first paint, and an entrance that gated it would be a worse screen than a still
 * one. Verified by focusing `#email` at t=0 rather than by reading this paragraph.
 *
 * ## Reduced motion, and why there is no `reduced` branch in this file
 *
 * `facelift-plan.md` §3a — the nine collapse **to the opacity change, not to nothing**. That is
 * exactly what Motion's own `<MotionConfig reducedMotion="user">` does: with the preference set it
 * drops transform and layout animations and lets opacity and colour through, and it drops them at
 * *animation* time rather than at render time. `ChromeStage` and `ChromeGround` each declare it.
 *
 * **What that measures as, stated plainly rather than as the number this file first claimed.** With
 * `prefers-reduced-motion: reduce` at 1440×900: no `y`, no `scale`, no `rotate`, and the two ambient
 * blooms snap to their end keyframe and never move again — verified by sampling their `transform`
 * 2.5 s apart, which is identical, against a normal context where it is not. What survives is the
 * opacity ramp **and its stagger**, so the sequence still takes about 700 ms rather than the 140 ms
 * an earlier draft of this comment promised. That is a deliberate acceptance and not an oversight:
 * `staggerChildren` is a transition rather than a transform, so Motion does not drop it, and a
 * sequence of 340 ms cross-fades carries none of the vestibular risk the preference exists to
 * avoid. Every field is focusable throughout, which is the property that actually matters here and
 * is measured separately.
 *
 * **The first version of this file branched on `useReducedMotion()` instead, and both ways of
 * getting that wrong are worth recording, because the second one is invisible.**
 *
 *  1. *The stuck transform.* The reduced variants named `opacity` and omitted the rest, so there
 *     was no target to animate the transforms back to. The hook cannot know the preference during
 *     the server render, so motion applied the *motion* `hidden` — `scale(0.985) translateY(18px)`
 *     on the card, `scale(0.62) rotate(-12deg)` on the mark — and then swapped to variants that
 *     never mentioned them. Measured at 1440×900 with `prefers-reduced-motion: reduce`: the card
 *     sat permanently 18px low and the mascot permanently at 61% and rotated 12°, forever. The
 *     reduced-motion user got the only broken rendering of this screen.
 *  2. *The hydration mismatch.* Naming every property fixed the rendering and left the real
 *     problem: `useReducedMotion()` reads `matchMedia` synchronously on the client and returns
 *     `false` on the server, so the two renders emitted **different `style` attributes** and React
 *     logged *"a tree hydrated but some attributes … didn't match … this won't be patched up"* on
 *     the product's front door — for reduced-motion users only, which is why nothing caught it
 *     until the console was read in that context. Any render-time branch on a device preference has
 *     this bug. `MotionConfig` does not, because both renders emit the same markup.
 */

/** `--ease-emphasised`, as the four control points Motion wants. */
export const EASE_EMPHASISED = [0.05, 0.7, 0.1, 1] as const;
/** `--ease-standard`. */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

/** The container. It paints nothing and animates nothing; it exists to hold the stagger. */
export const STAGE_VARIANTS: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: 0.06 } },
};

/** The card itself: the one object on the screen, so it arrives as one object. */
export const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.42,
      ease: [...EASE_EMPHASISED],
      delayChildren: 0.12,
      staggerChildren: 0.045,
    },
  },
};

/** Every staggered child inside the card. */
export const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [...EASE_STANDARD] } },
};

/**
 * The mark, which is the one element that gets a spring rather than a curve.
 *
 * It is the product's face and it is the first thing on the screen, so it lands with a little
 * weight instead of sliding in with the type. `visualDuration` keeps the perceived length in step
 * with the 0.34 s curves around it — a spring's `duration` is not its settling time.
 */
export const MARK_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.62, rotate: -12 },
  shown: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: 'spring', visualDuration: 0.34, bounce: 0.3 },
  },
};

/**
 * The ambient field: two blooms that drift behind the card, forever, at a speed nobody watches.
 *
 * ## This is a permitted exception, and the licence is written here so the next reader finds it
 *
 * **It is the only motion in the product that no closed list contains**, and that is worth stating
 * plainly rather than leaving someone to discover it as a violation.
 * `no-crumbs-design-system.html` §The system names six moments and says *"everything else stays
 * still"*; `facelift-plan.md` §3a names nine and says the same. This is neither.
 *
 * It is licensed by `iteration-2-plan.md` §2.1, which is an owner ruling and postdates both lists:
 * the system splits in two, and on **chrome** — sign-in, landing, the empty state, the edges —
 * *"an entrance, an ambient field, a signature moment"* are permitted. Both closed lists are about
 * the **data** surface, where colour is information and a thing that moves is saying something
 * happened. Nothing here is on that surface.
 *
 * **Three conditions, ruled 2026-08-31, and it keeps its place only while all three hold:**
 *
 *  1. **Behind the reading surface, never on it.** The same distinction that removed
 *     `--chrome-panel-wash`: the mesh, the blooms, the glow and the lit edge are painted *around*
 *     the card; a gradient behind the headline was painted *on* it. A drifting light under ink
 *     would be the panel wash's defect with a timeline attached.
 *  2. **Ambient, never signalling.** It may not speed up, change colour, or respond to state. The
 *     moment it means something, it is a tenth animation on a closed list rather than atmosphere.
 *  3. **Dead under `prefers-reduced-motion`.** Measured, not assumed: the two `transform` values
 *     are byte-identical 2.5 s apart with the preference set, and different without it.
 *
 * ## The implementation, and why it is cheap
 *
 * `x`/`y`/`scale` only — compositor properties on two elements that paint a radial gradient and
 * nothing else, so a frame costs a transform and no repaint. `repeatType: 'mirror'` rather than a
 * loop because a bloom that snaps back to its start is a cut, and a cut is the one thing an ambient
 * layer must never be. All three are transforms, which is what makes condition 3 automatic under
 * `reducedMotion="user"` rather than something a branch has to remember.
 */
export const BLOOM_DRIFT: Transition = {
  duration: 24,
  repeat: Infinity,
  repeatType: 'mirror',
  ease: 'easeInOut',
};

/* ------------------------------------------------------------------------------------------------
 * The ground under all of that: a city, and deliberately not a mesh gradient
 * ---------------------------------------------------------------------------------------------- */

/**
 * **The moving map behind the sign-in card**, specified here for the same reason the entrance is:
 * so the numbers are in one place with the argument for them, and `chrome-ground.tsx` is the
 * executor rather than the author.
 *
 * ## What it is, and the thing it is not
 *
 * `iteration-6-plan.md` §5.2 asked for *"two parallax layers of city blocks — not a uniform
 * lattice, which reads as graph paper rather than cartography — drifting slowly on a diagonal at
 * very low contrast"*, with a few longer runs reading as arterial roads and one or two mint points
 * sitting on the grid and breathing. It names the failure mode explicitly, and it is the failure
 * mode this brief produces by default: **an animated mesh gradient**. There is already a mesh on
 * this screen — `--chrome-mesh`, four radials and two blooms — and a second, moving one would have
 * been decoration indistinguishable from every other product's front door.
 *
 * It also rejects the more romantic option, and that rejection is load-bearing: **a real MapLibre
 * canvas drifting over Tel Aviv** would put a tile fetch, a WebGL context and a style request in
 * front of the one screen that must be instant, and would drag CARTO's attribution onto an
 * unauthenticated page. Nothing here fetches anything.
 *
 * ## Why the fabric reads as a map rather than as a texture
 *
 * Four properties, and each one is a line in `planGround()`:
 *
 *  1. **Irregular block sizes.** The cuts across a tile are jittered and then normalised back to
 *     the tile's own width, so the gaps differ by up to `jitter` while still summing to the period.
 *     Equal gaps are graph paper; unequal gaps are a city.
 *  2. **Streets that stop.** An ordinary street runs between two crossing streets rather than from
 *     edge to edge, so the fabric has T-junctions and dead ends. This is the single strongest
 *     cartographic signal and the cheapest — a lattice where every line spans the frame cannot look
 *     like anywhere.
 *  3. **A road hierarchy.** Two runs per axis are arterials: thicker, full length, and at roughly
 *     twice the ink of a street. It is the hierarchy rather than the lines that says *map*: a fabric
 *     of one weight is a texture whatever its geometry.
 *  4. **Service lanes.** A third of the blocks are halved by a short lane at the lightest weight,
 *     which is the grain that separates *city fabric* from *street network*.
 *
 * ## Two layers, one drift direction
 *
 * `far` has smaller blocks, less ink and less speed; `near` has larger blocks, more ink and more
 * speed. That is parallax in the only sense a flat ground can have one, and the two tile periods
 * are deliberately **not** multiples of each other (384 and 512), so the combined fabric only
 * repeats every 1536 px rather than every 512.
 *
 * Both drift along the *same screen* diagonal at different speeds while sitting at different
 * angles. A shared direction is what makes it parallax rather than two things sliding past each
 * other; the differing angles — 22° and 6° — are the two street grids any real city has, and they
 * are the reason the ground has more than two directions in it. **A 45° boulevard was the first
 * answer to that and it was built and removed**; see `renderTile` in `chrome-ground.tsx` for why a
 * diagonal cannot be one run among the others.
 *
 * ## The mint points, and the rule they are held against
 *
 * `globals.css` states a measured rule for this ground: *"on the light chrome surfaces mint appears
 * only on things you press or follow"*, because a large mint bloom put roughly a seventh of the page
 * inside the CTA's own hue family and the `Sign in` button stopped separating from what it sat on.
 * §5.2 nevertheless asks for mint here, and it is right to: the product's whole subject is *places
 * on a map*, and a map with no places on it is a texture.
 *
 * The two are reconciled by **area**, which is what the original measurement was actually about.
 * A point is a 5 px core with a 13 px falloff and there are one or two of them on a screen. The
 * competing-area metric that condemned the bloom is re-run against this ground rather than assumed
 * to be unaffected, and the number is in the commit. Nothing else here is mint.
 *
 * ## Reduced motion
 *
 * **A still frame, not an empty one.** The composition is the point and the movement is not, so the
 * preference stops the clock at `GROUND_STILL_PHASE_SECONDS` — far enough in that the two layers
 * have separated and the points are lit — and never advances it. This is the same distinction the
 * mascot's halo already draws (`chrome-mark-breathe` stops with the halo *lit*, not dark), and the
 * opposite of what "respects reduced motion" usually ships as, which is nothing at all.
 */
export interface GroundLayerSpec {
  readonly id: 'far' | 'near';
  /** Fixed, so the city is the same city on every load and in every test. */
  readonly seed: number;
  /** The period of the fabric in CSS px. Also the lattice the mint points sit on. */
  readonly tile: number;
  /** Cuts per tile on each axis. `tile / count` is the average block. */
  readonly avenues: number;
  readonly streets: number;
  /** 0 is graph paper. 0.5 means a block can be half again as wide as its neighbour. */
  readonly jitter: number;
  /** Probability that a block is halved by a service lane. */
  readonly laneChance: number;
  /** Degrees the whole fabric is rotated on screen. */
  readonly angle: number;
  /** CSS px per second along `GROUND_DRIFT_DEGREES`. */
  readonly speed: number;
  /** Stroke widths in CSS px, before the compact scale. */
  readonly width: { readonly lane: number; readonly street: number; readonly arterial: number };
  /** Alpha on `--chrome-accent`. The only numbers here that are not geometry. */
  readonly ink: { readonly lane: number; readonly street: number; readonly arterial: number };
}

export const GROUND_LAYERS: readonly GroundLayerSpec[] = [
  {
    id: 'far',
    seed: 0x5eed_1a11,
    tile: 384,
    avenues: 8,
    streets: 8,
    jitter: 0.42,
    laneChance: 0.2,
    angle: -22,
    speed: 2.6,
    width: { lane: 0.6, street: 0.8, arterial: 1.5 },
    ink: { lane: 0.026, street: 0.044, arterial: 0.092 },
  },
  {
    id: 'near',
    seed: 0x5eed_2b22,
    tile: 512,
    avenues: 7,
    streets: 7,
    jitter: 0.5,
    laneChance: 0.28,
    angle: -6,
    speed: 4.6,
    width: { lane: 0.7, street: 1.0, arterial: 2.1 },
    ink: { lane: 0.040, street: 0.072, arterial: 0.155 },
  },
];

/**
 * The heading both layers drift along, in screen degrees (0° is to the right, 90° is down).
 *
 * 208° is up and to the left — the fabric moving the way a map moves when someone drags it
 * south-east. Off both axes far enough that neither the streets nor the avenues appear to slide
 * along themselves, which is the one direction that would read as a scrolling texture.
 */
export const GROUND_DRIFT_DEGREES = 208;

/** Below this width the whole fabric scales down, so a 390 px phone gets a city and not four
 *  blocks. It scales the pattern rather than regenerating it, so a rotation costs no work. */
export const GROUND_COMPACT_MAX_WIDTH = 640;
export const GROUND_COMPACT_SCALE = 0.72;

/**
 * The points, on the tile lattice.
 *
 * `GROUND_POINT_DENSITY` is the fraction of tile cells that carry one. **0.75, which is far more
 * than §5.2's "one or two" sounds like, and every step between the two numbers was measured.**
 *
 * The first build used 0.3 — a 1440×900 screen holds about five cells of the near layer's tile, so
 * 0.3 is a mean of 1.5 — and it rendered **no point at all**, because the cells in view happened to
 * be cells that carry none. At 4.6 px/s the next one enters the frame about ninety seconds later,
 * on a screen people are on for five. 0.55 fixed the *empty* case and left a worse one: sampled
 * every 1.5 s over forty seconds at 1440×900, the number of points actually drawn was **0 or 1**,
 * and the drift is slow enough that a bad configuration is a bad minute rather than a bad frame.
 *
 * Two things make the honest number much higher than the number a reader expects:
 *
 *  1. **The card covers the middle of the screen**, which is where a point is most likely to be.
 *     What matters is not the count on the ground but the count in the *surround*.
 *  2. **The count is only the mean of a lottery.** For any process where cells decide
 *     independently, an expected count of two means an empty screen about one time in seven, and
 *     the only cure for the tail is the mean.
 *
 * At 0.75, measured on three fresh loads at each viewport: **4–5 points drawn at 1440×900, of which
 * one or two fall outside the card**, and 2–3 at 390×844, where the card covers almost everything.
 * So what a person *sees* is §5.2's one or two, and an empty ground is not a case that arises.
 *
 * The breath is 5.6 s and it never reaches zero — 0.34 to 1 of the base ink. A point that goes out
 * and comes back is a blink, and a blink is a signal; the same reasoning, and the same shape of
 * range, as `chrome-mark-breathe`'s 0.72-to-1 halo.
 */
export const GROUND_POINT_DENSITY = 0.75;
export const GROUND_POINT_BREATH_SECONDS = 5.6;
export const GROUND_POINT_BREATH_FLOOR = 0.34;
/** How much the point swells across its breath. 16% on a 5 px core is a millimetre on a phone: the
 *  scale is there so the fade has something to be *attached* to, not to be seen on its own. */
export const GROUND_POINT_BREATH_SWELL = 0.16;
/** Alpha on `--brand` at the top of the breath. */
export const GROUND_POINT_INK = 0.5;
/** The mark itself, in CSS px: a small solid core inside a soft falloff, at the falloff's own
 *  strength. It is a *place*, so it is a dot with light around it rather than a ring or a pin —
 *  neither of which may appear here, because both are the data surface's vocabulary. */
export const GROUND_POINT_CORE_RADIUS = 2.4;
export const GROUND_POINT_HALO_RADIUS = 15;
export const GROUND_POINT_HALO_INK = 0.42;

/**
 * The arrival, and it is 600 ms because that is what the blooms take.
 *
 * The ground cannot use `data-entrance`: that attribute means *a staggered beat of the card's
 * arrival* and carries `animation-fill-mode: both`, and this element is neither in the stagger nor
 * able to have a resting state before its first paint. It fades itself in from the effect that
 * paints it, which is safe here for the reason the rest of this file is anxious about — the canvas
 * has no content, so a hydration that never happens leaves an empty transparent element rather than
 * hiding anything.
 *
 * **This 600 and the 600 in `globals.css` are the same number written twice and nothing guards the
 * pair**, which is the gap this file already records for the entrance's values.
 */
export const GROUND_ARRIVAL_SECONDS = 0.6;

/**
 * **The frame budget the ground holds itself to, and what happens when it cannot.**
 *
 * 3 ms of frame time — under a fifth of a 60 Hz frame for a decoration nobody is looking at, and
 * comfortably between the two cases it has to tell apart. Measured either side of that line, at
 * 1440×900 and 390×844 and at both pixel ratios: on a GPU-backed canvas the two pattern fills are
 * **free**, and running is indistinguishable from paused at 8.3 ms median; on a software rasteriser
 * the same fills take the page from 8.7 ms to 24.6 ms at 390×844 and from 41 ms to 75 ms at
 * 1440×900. The two are an order of magnitude apart, so 3 ms is not a guess at where the boundary
 * is — it is a value with nothing near it.
 *
 * **Each side is 400 ms rather than a fixed number of frames**, with a floor of eight samples so a
 * median means something. A count is the obvious way to write this and it is the wrong way: fifty
 * frames on the device that needs the check take three to seven seconds, and the ruling landed six
 * to nine seconds into the page — several seconds of exactly the thing it exists to avoid. A
 * duration costs the same wall-clock on every device, which is the property wanted. The probe starts
 * 1.5 s in so it is clear of the 1.1 s entrance.
 * `chrome-ground.tsx`'s `tick` is the implementation, and it records why this is an A/B against the
 * same page rather than a stopwatch around the draw call.
 */
export const GROUND_BUDGET_MS = 3;
export const GROUND_BUDGET_SETTLE_MS = 1500;
export const GROUND_BUDGET_WINDOW_MS = 400;
export const GROUND_BUDGET_MIN_SAMPLES = 8;

/**
 * **The phase the ground starts at, and the phase it stops at under `prefers-reduced-motion`** —
 * one number, deliberately, so the still frame is exactly the frame the animation begins on rather
 * than a second composition nobody looks at.
 *
 * Not 0. At t=0 both layers sit at the origin their generator produced, which is the one phase
 * where the two fabrics have not yet moved relative to each other. 9.4 s in, the near layer has
 * travelled 43 px against the far layer's 24, so the two grids are visibly two grids — which is the
 * whole of what the parallax is for, and a reduced-motion user is entitled to see it.
 */
export const GROUND_STILL_PHASE_SECONDS = 9.4;
