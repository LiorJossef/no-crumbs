/**
 * **The motion vocabulary: five tiers, two curve families, and reduced motion written once.**
 *
 * This file began as press feedback alone — three strings, because `facelift-plan.md` §3a measured
 * three uses of `active:` in the whole codebase against ninety-seven of `focus-visible:`, a product
 * built for a phone that acknowledged a keyboard well and a finger almost never. The owner then
 * asked for the other end of it: *"opening/closing popups, modals, moving between pages, and
 * basically every transition should include animation. from micro to more dominant."*
 *
 * The answer is not more animations. It is **one scale**, because the failure mode of "add
 * animation" is fourteen durations with no reason for any of them — and this codebase was already
 * a third of the way there. Measured at `c585ce7` across `sheet/`, `add/`, `import/`, `ui/` and
 * `lib/`: **33 `transition-*` class strings, 12 carrying a duration.** The other 21 ran on
 * Tailwind's unnamed 150 ms default, which is not a decision anyone made. Two more (`duration-200`,
 * `duration-140`) were bare numbers that happen to equal `--duration-cross` and `--duration-enter`
 * exactly — the same value, written twice, with only one of the two spellings on the closed list.
 *
 * ## The scale
 *
 * Named for **what the motion is doing**, not for its milliseconds, so that a call site reads as a
 * decision rather than as a number. Every duration resolves to a token registered in
 * `globals.css`'s `@theme inline` block; `motion-scale.test.ts` compiles the real stylesheet and
 * fails if one of them stops generating a utility, which is this repository's one silent styling
 * failure mode (`design-tokens.test.ts`, and `--radius-md` before it).
 *
 * | tier | constant | token | ms | what it is for |
 * |---|---|---|---|---|
 * | **micro** | `PRESS_BEAT` | `duration-press` | 90 | a finger lands: press, and nothing else |
 * | **micro** | `TINT_BEAT` | `duration-enter` | 140 | an element already on screen changes colour |
 * | **small** | `COUPLE_BEAT` · `COUPLE_TINT` | `duration-couple` | 160 | one element answering another's hover |
 * | **small** | `REVEAL_BEAT` · `ENTER_REVEAL` | `duration-cross` | 200 | a chevron turns, a panel opens |
 * | **small** | `ENTER_POPOVER` | `duration-cross` | 200 | a popover or tooltip opens at its anchor |
 * | **medium** | `ENTER_SURFACE` | `duration-base` | 220 | a pane inside a surface already arriving |
 * | **medium** | `ENTER_MODAL` · `ENTER_SCRIM` | `duration-surface` | 300 | a surface arriving on its own |
 * | **large** | `ENTER_SCREEN` | `duration-screen` | 440 | a whole screen replaces another |
 *
 * The tiers are the orchestrator's, refined by what the token layer actually holds rather than
 * accepted as stated. **The medium tier is two numbers rather than one, and that is the whole of
 * the refinement:**
 *
 *  - **`ENTER_SURFACE` is 220 ms, not 280–320.** This product's sheets are vaul drawers whose open
 *    is a spring vaul owns, and 220 ms is what the contents can arrive in without lagging behind
 *    the surface carrying them. **A tier named for what it does should be timed by what it
 *    carries.** Ruled 2026-08-31 after the 280–320 band was proposed and this argument put against
 *    it; it is recorded here so the next reader does not "correct" the number back to the band.
 *  - **`ENTER_MODAL` is the 300 ms the band asked for**, and it exists because the first draft of
 *    this file had no surface that arrives *on its own*. The desktop import card and its scrim are
 *    one: nothing else is opening underneath them, so nothing is waiting for the contents.
 *
 * Both `--duration-surface` and `--duration-screen` were registered in `globals.css` for this
 * scale and are consumed **only through this file**, never at a call site. `ENTER_SCREEN` was
 * built against `--duration-tick` while that was pending — 400 ms is inside the band, but the
 * token is named for `count.tick` and a screen transition is not a count — and moving it cost
 * exactly one string literal, which is the entire argument for routing every call site here.
 *
 * ## The two curves, and why the exit one had no call site until now
 *
 * **Entrances use `ease-standard` or `ease-emphasised`; exits use `ease-exit`.** A thing arriving
 * deserves to be seen, so it decelerates into place; a thing leaving is in the way, so it
 * accelerates out. `--ease-exit: cubic-bezier(0.3, 0, 1, 1)` has been registered in `globals.css`
 * since W0 and, measured at `c585ce7`, **is referenced by nothing in `src/`** — the principle had a
 * token and no implementation. `LEAVE_*` below is the implementation.
 *
 * **Every exit runs at 140 ms, whatever it is leaving.** `LEAVE_SURFACE` is 140 against
 * `ENTER_SURFACE`'s 220; `LEAVE_REVEAL` is 140 against `ENTER_REVEAL`'s 200. One exit speed for the
 * whole product is a rule an author can hold and `motion-scale.test.ts` can check; *"an exit should
 * feel quicker"* is taste, and taste is how a system ends up with an exit per surface.
 *
 * **There is deliberately no `SURFACE_BEAT`.** A first draft of this file had one — 220 ms for "a
 * surface's own chrome settling" — and nothing in the product wanted it, because a surface's chrome
 * is buttons and rows and those already press. It was deleted rather than exported, which is the
 * lesson `--ease-exit` taught by sitting registered and unused for a whole iteration: an unused
 * constant is not a spare part, it is a claim the codebase does not support.
 *
 * ## Reduced motion, handled once
 *
 * **`motion-safe:`, not `motion-reduce:`.** The un-prefixed state *is* the reduced-motion case, so
 * an author cannot forget to write one (§3a rule 4). Every constant in this file bakes the prefix
 * in, which is what makes "reduced motion is handled once" true of the *vocabulary* rather than of
 * ninety call sites — and `motion-scale.test.ts` asserts it for every export, so a thirteenth
 * constant added without the prefix fails rather than ships.
 *
 * Under the preference: a press collapses to the colour change the element already had, a pane
 * change is a straight swap in one frame, and a screen arrives without its 8px rise. §3a's *"all
 * nine collapse to the opacity change alone, not to nothing"* is the target, and the `ENTER_*`
 * strings hold it exactly — the opacity ramp is un-prefixed and survives, only the transform arm is
 * behind `motion-safe:`.
 *
 * **No continuous loop is defined here and none may be added.** §3a bans continuous pin pulsing
 * outright, and a loop "collapsed" under the preference into an opacity loop produces precisely
 * what that rule forbids while appearing to obey it.
 *
 * ## Why class strings, and why `animate-in` rather than Motion
 *
 * No React and no JSX: these are class strings, which is what lets `src/lib/` hold them beside `cn`
 * rather than the `ui/` layer having to own a component nobody renders.
 *
 * The `ENTER_*` strings are `tw-animate-css`'s `animate-in` and **not** Motion variants, and the
 * reason is the defect `iteration-2-plan.md` §2.2 records: Motion writes a variant's initial state
 * into the server HTML, so `/` and `/sign-in` shipped ten and eleven inline `opacity: 0`
 * declarations and the only thing that removed them was React hydrating. Measured with scripting
 * *on* and every `.js` request aborted: minimum opacity 0, 0 of 7 controls visible. **Content that
 * depends on JavaScript to become visible is content that is conditionally absent.**
 *
 * `animate-in` cannot fail that way, and the property is worth stating precisely because it is not
 * the same one `globals.css`'s entrance relies on. That one uses `animation-fill-mode: both`, so
 * the resting state is the *end* of the animation. These carry **no fill mode at all** — verified
 * against the installed `tw-animate-css@1.4.0`, whose `--animate-in` ends in
 * `var(--tw-animation-fill-mode, none)` — so the element's resting state is its *natural* state and
 * the keyframe is only ever a departure from it. If the stylesheet loads, the thing animates in; if
 * it does not, the thing was never hidden. There is no third case, and adding a `delay-*` to one of
 * these would create one: a delayed animation with `fill-mode: none` renders the finished state
 * first and then snaps back to the start. Stagger with `fill-mode-backwards` or not at all.
 *
 * **`transition-none` rides every one of them, and it is not a contradiction.** Tailwind's
 * `duration-*` sets `transition-duration` as well as the `--tw-duration` the `animate-in` keyframe
 * reads, and CSS's initial `transition-property` is `all` — so `animate-in … duration-screen` alone
 * leaves the element with *every* property transitioning over 440 ms for the rest of its life. That
 * is a side effect nobody wrote and nobody would find: a class toggled on a screen root a minute
 * later would fade instead of switching. `transition-property: none` makes the stray duration inert
 * and does nothing to the animation, which is a separate timeline. Any call site that genuinely
 * wants a transition supplies its own `transition-*`, and `cn`'s tailwind-merge drops this one.
 *
 * ## Two things about the way the press strings are written, kept from the original
 *
 * **`transition`, not `transition-transform`.** The elements these strings are appended to already
 * carry a colour transition, and `motion-safe:transition-transform` would *replace* it for every
 * pointer user — a hover fade that silently stops fading is a worse regression than the press is a
 * gain. `transition`'s property list carries colour and transform together, so one declaration
 * covers both and there is one duration.
 *
 * **`scale-98`/`scale-99` rather than the matrix's `scale-[.985]`/`scale-[.995]`.** Bare numeric
 * scales compile under the installed Tailwind 4.3.3 (verified against the real `globals.css` with
 * the same `compile()` `tests/unit/design-system/design-tokens.test.ts` runs), and run rule 6a
 * makes a bracket a review failure. The half-percent difference is not visible at 90 ms; a
 * registered utility is.
 */

/* ------------------------------------------------------------------------------------------------
 * Tier 1 — micro. A finger lands, or a colour changes under one.
 * ---------------------------------------------------------------------------------------------- */

/** The shared beat every press rides: one transition, one duration, one easing. Exported because
 *  `button.tsx`'s cva base takes it without a scale — `ghost`, `outline` and `secondary` press with
 *  the base's `translate-y-px` alone, per the matrix. */
export const PRESS_BEAT =
  "motion-safe:transition motion-safe:duration-press motion-safe:ease-standard"

/** A filled button. The matrix's `scale-[.985]`, paired with the shadow dropping a level. Applied
 *  by `buttonVariants` in `components/ui/button.tsx`; exported for a filled control that cannot be
 *  a `<Button>`. */
export const PRESS_BUTTON = `${PRESS_BEAT} motion-safe:active:scale-98`

/** A list row. Shallower than a button — the matrix's `scale-[.995]` — because a full-width row
 *  scaling as hard as an 80px button reads as the whole list moving. */
export const PRESS_ROW = `${PRESS_BEAT} motion-safe:active:scale-99`

/** A chip, and an icon button: small targets, so the same 5% that would be violent on a row is
 *  what makes a 32px pill visibly respond. */
export const PRESS_CHIP = `${PRESS_BEAT} motion-safe:active:scale-95`

/**
 * A colour changing on something already on screen: a row tinting under a hover, a border warming,
 * a chip filling with its own ink.
 *
 * This is the tier that replaces the unnamed default. Twenty-one class strings carried
 * `transition-colors` with no duration at all and therefore ran at Tailwind's 150 ms — close enough
 * to 140 that nobody would ever have noticed, which is exactly the problem: the value was never
 * chosen, so it could never be changed. `duration-enter` is the closed list's `enter`, the one rule
 * §3a says is *"used everywhere, never elaborated"*.
 */
export const TINT_BEAT =
  'motion-safe:transition-colors motion-safe:duration-enter motion-safe:ease-standard'

/* ------------------------------------------------------------------------------------------------
 * Tier 2 — small. One element answering another, or a thing opening in place.
 * ---------------------------------------------------------------------------------------------- */

/**
 * `row ↔ pin`, and every other case of one element moving because a different element was hovered.
 *
 * 160 ms is `--duration-couple`, named on the closed list for exactly this. Slower than a tint
 * because the eye has to travel: the thing that moved is not the thing under the cursor, so it
 * needs long enough to be *found*, not just long enough to be seen.
 *
 * **Its call site is `place-sheet.tsx`'s two leading squares, and it is written out there rather
 * than imported.** `tests/unit/map/row-pin-coupling-row.test.ts` is a source-text guard that greps
 * that file for `motion-safe:transition-transform`, `motion-safe:transition-colors` and
 * `motion-safe:duration-couple` as literals, so routing the coupling through this constant makes
 * three of its assertions fail on a change that alters no rendered class at all — the *"test
 * asserting a proxy instead of an invariant"* species `iteration-2-record.md` §8.1 names. That file
 * carries another lane's assertions about `map-page-client.tsx` and `map-shell.tsx` and is not this
 * lane's to edit, so the substitution is deferred rather than forced. `motion-scale.test.ts`
 * asserts the two texts are byte-identical in the meantime, which is the drift guard that makes
 * "written out there" safe rather than merely duplicated.
 */
export const COUPLE_BEAT =
  'motion-safe:transition-transform motion-safe:duration-couple motion-safe:ease-standard'

/**
 * The same tier, for the colour half of a coupling: a row's secondary line darkening because the
 * row — not the line — is under the cursor.
 *
 * Separate from `COUPLE_BEAT` because the property list is deliberately narrow. `transition-colors`
 * touches nothing the compositor has to lay out, which is the note `category-filter-bar.tsx`
 * already carries, and a row whose ink and whose disc both animate wants one *timing* rather than
 * one *declaration* — the disc scales, the label does not.
 */
export const COUPLE_TINT =
  'motion-safe:transition-colors motion-safe:duration-couple motion-safe:ease-standard'

/**
 * A disclosure opening: the chevron turning, the panel arriving under it.
 *
 * 200 ms is `--duration-cross`. Paired with `LEAVE_REVEAL` at 140, because a panel closing is the
 * user asking for the space back and should not be made to wait for it.
 */
export const REVEAL_BEAT =
  'motion-safe:transition-transform motion-safe:duration-cross motion-safe:ease-standard'

/** `REVEAL_BEAT`'s exit: one tier down, on the accelerating curve. Applied to the *closed* branch
 *  of a toggle, so the same chevron turns out faster than it turned in. */
export const LEAVE_REVEAL =
  'motion-safe:transition-transform motion-safe:duration-enter motion-safe:ease-exit'

/** A disclosure panel arriving: it fades, and — pointer users only — drops the last 4px into
 *  place. The opacity arm is deliberately un-prefixed, so under `prefers-reduced-motion` this
 *  collapses to the fade rather than to nothing (§3a). */
export const ENTER_REVEAL =
  'animate-in fade-in-0 duration-cross ease-standard transition-none motion-safe:slide-in-from-top-1'

/**
 * A popover or a tooltip opening at the thing it belongs to.
 *
 * Same tier and same 200 ms as `ENTER_REVEAL`, and a different transform for a real reason: a
 * disclosure panel opens *downward from* the control that opened it, so it slides; a popover is
 * already positioned at its anchor and has nowhere to slide from, so it grows into place.
 *
 * **`motion-safe:zoom-in-95` — the prefix is the fix, not the value.** `components/ui/map.tsx`'s
 * three portalled surfaces (`MapPopup`, `MapTooltip`, and the anchored popup) carried
 * `animate-in fade-in-0 zoom-in-95 duration-200 ease-out` un-prefixed, so a reduced-motion user
 * got the 5% scale in full — §3a rule 4 inverted. `duration-200` was `--duration-cross` written as
 * a number, which is the bypass `K5` cannot see because it is not a bracket, and `ease-out` was
 * Tailwind's default curve rather than one of this system's three.
 */
export const ENTER_POPOVER =
  'animate-in fade-in-0 duration-cross ease-standard transition-none motion-safe:zoom-in-95'

/* ------------------------------------------------------------------------------------------------
 * Tier 3 — medium. A surface arrives: a sheet's pane, a dialog's contents.
 * ---------------------------------------------------------------------------------------------- */

/**
 * A pane arriving inside a sheet, or a dialog's card.
 *
 * `slide-in-from-right-2` rather than a rise: inside a drawer the vertical axis belongs to the
 * drawer itself, and a pane that also rises fights the surface carrying it. A sideways shift says
 * *"further in"*, which is what a pane change means.
 *
 * **The drawer's `Places / Collections` view switch used to be a documented exception here**, on
 * the grounds that the two views rest at the same stop so a rise fights nothing. It is now the
 * **view tier** below (`ENTER_VIEW_FORWARD` and its three siblings), which is a better answer to
 * the same argument: a peer swap wants an axis of its own rather than a borrowed one.
 *
 * **This replaced a Motion component**, and the swap took `motion/react` out of `/map`'s bundle
 * entirely — the add sheet was its only importer on that route.
 */
export const ENTER_SURFACE =
  'animate-in fade-in-0 duration-base ease-emphasised transition-none motion-safe:slide-in-from-right-2'

/** `ENTER_SURFACE`'s exit, one tier down at 140 ms on the accelerating curve. Only usable where
 *  the leaving element stays mounted long enough to run it. */
export const LEAVE_SURFACE =
  'animate-out fade-out-0 duration-enter ease-exit transition-none motion-safe:slide-out-to-left-2'

/**
 * A surface that arrives **on its own** rather than inside one already arriving: the desktop import
 * card floating over the dimmed map, and any dialog that grows a scrim of its own.
 *
 * `ENTER_SURFACE`'s 220 ms is deliberately not this. Nothing is opening underneath a modal, so
 * nothing is waiting for its contents, and the extra 80 ms is what makes a card land rather than
 * appear. A 2% zoom rather than a slide, because a centred modal has no edge to come from — it
 * comes from the plane behind the scrim.
 */
export const ENTER_MODAL =
  'animate-in fade-in-0 duration-surface ease-emphasised transition-none motion-safe:zoom-in-98'

/**
 * The scrim the modal above arrives on, at the same duration so the two read as one event rather
 * than as a backdrop and then a card.
 *
 * **Opacity and nothing else, which is why it carries no `motion-safe:` at all.** A scrim covers
 * the viewport, so a 2% zoom on it would show a 1% ring of un-dimmed page down every edge for the
 * first frames — the card can scale because it has somewhere to scale from, and this cannot. With
 * no transform there is nothing for the preference to drop, so `prefers-reduced-motion` gets the
 * identical 300 ms fade rather than a special case.
 */
export const ENTER_SCRIM = 'animate-in fade-in-0 duration-surface ease-emphasised transition-none'

/* ------------------------------------------------------------------------------------------------
 * Tier 4 — large. One screen replaces another.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The dominant end of the scale, and the only tier the user is meant to consciously notice.
 *
 * Worn by the root of every screen in the import flow, which at `c585ce7` hard-swapped: paste →
 * rail → review, or → "no places found", with no transition of any kind. That flow is the
 * product's one multi-step journey and the closest thing it has to moving between pages, so it is
 * where "more dominant" is spent.
 *
 * **It is on each screen's own root, not on a keyed wrapper in `import-shell.tsx`.** That file's
 * header forbids a `key` on its children by name — either one would remount the review screen and
 * silently discard every tick and every shortlist pick the user had made — and the screens are
 * different components, so each remounts on a kind change and its animation runs without anything
 * having to key it. The constraint and the animation want the same thing.
 *
 * 440 ms, an 8px rise, and a 1% zoom, which is the difference between a screen *arriving* and a
 * screen *appearing*. Both transforms are `motion-safe:`; the fade is not, so the reduced-motion
 * user gets a 440 ms cross-fade and a legible screen rather than a cut — measured at 390x844 as
 * *two* distinct transform values, the first an identity matrix, against 54 with the preference
 * unset.
 */
export const ENTER_SCREEN =
  'animate-in fade-in-0 duration-screen ease-emphasised transition-none motion-safe:slide-in-from-bottom-2 motion-safe:zoom-in-99'

/**
 * The same arrival for a screen's *contents* when the screen itself did not change — an inline
 * error appearing under a field, a partial-save notice replacing an action row.
 *
 * One tier down at 220 ms, because news inside a screen is smaller news than the screen. Kept in
 * the large section rather than the medium one because it is the large tier's companion: they are
 * only ever used on the same surface, and separating them is how the two drift apart.
 */
export const ENTER_NEWS =
  'animate-in fade-in-0 duration-base ease-emphasised transition-none motion-safe:slide-in-from-bottom-1'

/* ------------------------------------------------------------------------------------------------
 * Tier 5 — the view. One of a surface's peer views replaces another, along a shared axis.
 * ---------------------------------------------------------------------------------------------- */

/**
 * **A shared-axis view swap: the tier for two views that live in one slot.**
 *
 * The drawer at `/map` holds three views — places, the collections index, one collection — in one
 * `Drawer.Content`, addressed by search params so that switching never unmounts the map
 * (`app/map/_lib/drawer-view.ts`). Until now the switch wore `ENTER_SCREEN`: a 440 ms rise on a
 * freshly keyed subtree, with the outgoing list **gone in the same frame**. Nothing carried the
 * eye, the sheet showed its own empty card for the length of the fade, and the two directions —
 * *further in* and *back out* — looked identical.
 *
 * ## Why a horizontal axis, and why it is the control's own axis
 *
 * The switch is a segmented pair (`components/shell/map-shell.tsx`'s `DrawerViewSwitch`) with
 * `Places` on the left and `Collections` on the right, and every row in the index carries a
 * right-pointing chevron. The product's own chrome already says the three views are laid out
 * left-to-right, so the swap moves along that line: **the deeper view arrives from the right and
 * the shallower one arrives from the left.** A rise would be a third spatial claim on a surface
 * that already makes one, and `ENTER_SURFACE`'s *"further in"* sideways shift cannot say which way
 * because it only has one direction.
 *
 * This is where SmoothUI's `shared-axis-x` landed. Its **specification** transferred exactly — one
 * axis, signed by direction; a decelerating entrance against an accelerating exit; the outgoing and
 * incoming layers overlapping rather than sequenced — and its *implementation* did not, which
 * `components/ui/view-swap.tsx` records in full: it is a Motion phrase-cycler on a timer, and
 * putting `motion/react` back on `/map` to cross-fade a list reverses two measured rulings in this
 * repository (this file's `ENTER_SURFACE`, and `components/brand/chrome-motion.ts`).
 *
 * ## 300 ms, which is one tier below what this swap used to take
 *
 * `--duration-surface`, the same beat `ENTER_MODAL` takes, and for the same reason: nothing is
 * opening underneath a view swap either — the drawer is already at rest and stays at its stop — so
 * the contents are not waiting on a surface. **440 ms was the right number for a hard cut** and is
 * the wrong one for a hand-off: with the outgoing view held and leaving under its own beat there is
 * something on screen for the whole transition, so the arrival no longer has to be long enough to
 * be *noticed*. This is the product's most-used control, and 140 ms of that is now the entire gap
 * rather than the entire event.
 *
 * The 4 px displacement of the tiers above becomes **16 px** (`-4`), because a whole list moving
 * 4 px is a wobble rather than a direction. It is still small enough to stay inside the drawer's
 * own clip once `ViewSwap` adds `overflow-x-clip`, which it does for exactly this.
 *
 * Reduced motion, as everywhere in this file: the fade is un-prefixed and the slide is not, so the
 * preference gets a 300 ms cross-fade between two still compositions — §3a's *"the opacity change
 * alone, not nothing"* — and the two directions become indistinguishable, which is correct. A
 * direction is a *movement*, and movement is the thing that was asked not to happen.
 */
export const ENTER_VIEW_FORWARD =
  'animate-in fade-in-0 duration-surface ease-emphasised transition-none motion-safe:slide-in-from-right-4'

/** The same arrival, coming back out: from the left, because the view being returned to is the one
 *  on the left of the switch. */
export const ENTER_VIEW_BACK =
  'animate-in fade-in-0 duration-surface ease-emphasised transition-none motion-safe:slide-in-from-left-4'

/**
 * The outgoing view while a deeper one arrives — 140 ms on the accelerating curve, the one exit
 * speed the whole product leaves at.
 *
 * **This is the constant that makes the swap a swap.** It is only reachable because
 * `ViewSwap` keeps the outgoing subtree mounted for one exit beat instead of letting React drop it
 * with the key change; `LEAVE_SURFACE`'s note about needing the leaving element to stay mounted
 * long enough is the same requirement, and this is the first call site in the product that actually
 * satisfies it.
 *
 * It leaves **to the left** against an entrance from the right: two objects moving the same way
 * along one axis, which is what makes the pair read as one plane sliding rather than as two
 * unrelated animations.
 */
export const LEAVE_VIEW_FORWARD =
  'animate-out fade-out-0 fill-mode-forwards duration-enter ease-exit transition-none motion-safe:slide-out-to-left-4'

/** Its mirror: the deeper view leaving to the right as the shallower one comes back from the left. */
export const LEAVE_VIEW_BACK =
  'animate-out fade-out-0 fill-mode-forwards duration-enter ease-exit transition-none motion-safe:slide-out-to-right-4'

