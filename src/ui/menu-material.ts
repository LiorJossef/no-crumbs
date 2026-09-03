/**
 * **The menu material as plain strings, in a module with no `'use client'` on it.**
 *
 * These constants used to live in `components/ui/inline-menu.tsx`, which is a client module, and
 * that is a trap with no error behind it: a **non-component export of a `'use client'` module
 * arrives in a Server Component as a client reference, not as a string**. `cn()` then drops it
 * silently — no throw, no warning, no type failure — and the element renders with none of these
 * classes on it. Measured on 2026-09-03: `/profile`'s `Account settings` row rendered its label and
 * its chevron on two separate lines, because `MENU_ROW` had arrived there as an object.
 * `bottom-nav-metrics.ts` records the same trap costing a `padding-bottom: 0`.
 *
 * **So: never add `'use client'` to this file, and never import React into it.** If you do, every
 * Server Component that reads a constant from here loses its styling and nothing tells you.
 * `tests/unit/ui/menu-material-plain-module.test.ts` fails if the directive appears.
 *
 * `inline-menu.tsx` re-exports all three, so every existing client call site imports them from
 * exactly where it always did. A Server Component must import from **here**.
 */

/**
 * **The surface a menu paints on, and there is exactly one of it** — the desktop popup and the
 * phone's inline panel wear the same border, radius, padding and elevation, so the split is where
 * the list is drawn and not what it is.
 *
 * `--popover` rather than `--card`: both resolve to `#FFFFFF` / `#201F1C` today, but `--popover` is
 * the role that exists for this, and it is what lets a future menu ground move without moving every
 * card. Over a live map canvas the hairline border does more work than the shadow — and there is no
 * `backdrop-blur`, which is banned over the canvas, and no glow, which Charter §6 bans outright.
 */
export const PANEL_SURFACE =
  'rounded-lg border border-border/60 bg-popover p-1 shadow-raised outline-none';

/**
 * **One row of a menu.** No fill, no border and no elevation at rest; the highlight is a full-width
 * ground, and what says "this one" is the indicator and a weight rather than a filled pill.
 *
 * **40 px of paint inside a 44 px target**, the same technique the triggers use. 12 px of radius,
 * which is the panel's 16 minus its 4 px of padding, so the corners nest. The indicator
 * column is always present (`keepMounted`) so the label sits at the same inline offset in every row
 * of every menu, and the count is in an end-aligned column that cannot jitter. Logical properties
 * throughout — both swap edges under RTL, and half this library is Hebrew.
 */
export const MENU_ROW = 'group/row flex min-h-11 cursor-pointer select-none items-center outline-none';

/**
 * **The highlight is `bg-card-2`, and `bg-muted/60` was a real accessibility defect.** Base UI's
 * `data-highlighted` is the pointer hover *and* the keyboard-active row. `--muted` is `#FAF9F6`
 * light and `#201F1C` dark; the popup is painted `--card`, `#FFFFFF` / `#201F1C`. So the composite
 * was `#FCFBFA` on white — about 1 %, effectively invisible — and in dark it was **identical to the
 * ground**: a keyboard user arrowed through the menu with no visible position at all.
 *
 * `--card-2` is `#F3F1EB` / `#2A2825`, a real step on both, and it is the product's own documented
 * neutral hover (`facelift-plan.md` §3a, row "Icon button": *surface → `card-2`*). It also keeps
 * the count legible without a second ink — `globals.css:235-240` measures `--muted-foreground`
 * at 4.76 on `--card-2` in light and 5.81 in dark. Not `bg-accent`: `--accent` is `--mint-100`,
 * a 2 % step on white, which is the same defect wearing mint.
 */
export const MENU_ROW_PAINT =
  'flex h-10 w-full items-center gap-2 rounded-sm px-2 text-xs font-medium text-foreground ' +
  // `data-highlighted` is Base UI's, on the menu rows; `group-hover` is what the inline radio rows
  // have instead, and both land on the same ground so one list cannot feel different from the other.
  'group-data-highlighted/row:bg-card-2 group-hover/row:bg-card-2 ' +
  'group-focus-visible/row:ring-3 group-focus-visible/row:ring-ring/50 ' +
  'motion-safe:transition-colors motion-safe:duration-press';
