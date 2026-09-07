/**
 * The micro-label that names a section of a place card — `Category`, `Your note`, `Shared note`,
 * `Dishes mentioned`.
 *
 * One string, in one place, because the same type value had been written out character-for-character
 * in six files and drifted into three spellings at two letterspacings while it was there
 * (`docs/archive/ux-place-card-unification-2026-09-02.md` §3.2 has the inventory).
 *
 * **It is quiet on purpose, as of 2026-09-02.** It used to be 11 px bold, uppercase, letterspaced
 * `.1em` — which made the smallest text on the card the loudest thing on it, and put a shout above
 * every block a person actually reads. The value now is 11 px / 500 / normal tracking / muted:
 *
 *  - `text-micro` rather than `text-[11px]`: the same size, taken from the ramp instead of written
 *    as an arbitrary value. That duplicate spelling is how the audit found "two labels" where the
 *    source held one intent.
 *  - **sentence case in the source string.** No `uppercase` utility, so a screen reader reads
 *    `Your note` rather than announcing it letter by letter, and the markup says what the screen
 *    says.
 *  - ink stays `text-muted-foreground`, measured at 5.37:1 on light `--card` and 6.51:1 on dark —
 *    both clear AA, so no bespoke ink is forked here.
 *
 * Not every 11 px label in the product is this one. `FILTER_KICKER` (`place-enrichment.tsx`) names
 * a *control* and stays uppercase; the brand kickers on the import and error screens name a whole
 * screen in brand ink. The three auth-screen field labels should adopt this and are a named
 * follow-up — they carry a `group-focus-within` behaviour that is a form concern, not a card one.
 *
 * A class string rather than a component: the label is a `<p>` in one place and a `<label>` in
 * another, and which element names a section is a question about the form on the screen, not about
 * the type ramp.
 */
export const SECTION_LABEL = 'text-micro font-medium text-muted-foreground';
