/**
 * The one row shape the two settings forms use, so they cannot drift apart. It lives here rather
 * than in either form because both draw it and neither owns it.
 *
 * Owner, 2026-09-03, after seeing the stacked version: *"first name, last name and save button in
 * the same line, with save matching the size of it."* So the layout is a row — label over field,
 * fields flexing, `Save` at the end on the same baseline — and it **stacks below `sm`**, because
 * three columns do not fit a 375px phone.
 *
 * `h-10`, not the `h-11` these forms carried: the owner's report was *"the inputs are really big
 * and massive"* (2026-09-03). `Input`'s own default of `h-8` is the other extreme — 32px is fine
 * inside a dense sheet and too short to aim at in a form you fill in.
 *
 * `SETTINGS_SAVE` carries the same `h-10` **on purpose, and it is the one number here that is not
 * negotiable**: the owner's rule is *match the field*, not *pick a size name*. No `size` variant on
 * `Button` is 40px — `lg` is 36px — so the height is set once here rather than hand-tuned twice at
 * the call sites, which is also what keeps the two saves identical to each other.
 *
 * `sm:max-w-48` (192px) on the column rather than a flat width. On a phone the viewport *is* the
 * column, so a field that runs its width is the native shape; the defect the owner saw was a 560px
 * box around a first name at 1440.
 *
 * **The cap is 192px because that is what the two name fields naturally get**, and the two cards
 * have to share one rhythm. At 1440 the card's content box is ~496px, so `First name` and
 * `Last name` divide what is left after `Save` and the gaps — about 192px each. An earlier
 * `max-w-xs` (320px) was above that, so it bound only the peer form's single field: the two cards
 * then drew fields at two different widths, one 192 and one 320, which reads as arbitrary rather
 * than chosen (owner, 2026-09-03). Capping at the width the name row lands on anyway makes every
 * field on the page the same size, and costs the name fields nothing.
 *
 * **No font size here on purpose.** `Input` already ships `text-base md:text-sm`, and the 16px on
 * small screens is load-bearing rather than stylistic: iOS Safari zooms the whole viewport when a
 * field smaller than 16px takes focus.
 */

/** The `<input>` itself. Height only — the width belongs to the column around it. */
export const SETTINGS_FIELD = 'h-10';

/** The label-over-field column. Flexes inside the row, full width once the row stacks. */
export const SETTINGS_FIELD_COLUMN = 'flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-48';

/**
 * The row. `items-end` is what puts `Save` on the field's line rather than the label's, since each
 * column is taller than the control it ends with. `self-start sm:self-auto` on the button keeps it
 * from stretching to full width while the row is a column.
 */
export const SETTINGS_ROW = 'flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3';

/** `Save`, exactly as tall as the field beside it. */
export const SETTINGS_SAVE = 'h-10 self-start px-4 sm:self-auto';
