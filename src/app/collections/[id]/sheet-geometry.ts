/**
 * `/collections/[id]`'s sheet and camera geometry, as three numbers with no React around them.
 *
 * Extracted from `collection-client.tsx` for the reason `query-rect.ts`'s own header gives for
 * existing at all: that file transitively imports `server-only` through `MapSurface`, so nothing in
 * it can be imported from a unit test, and the numbers are the part most worth testing. Two of the
 * three below have already produced a measured camera defect between them (`L2-COLL-CAM-2`), and a
 * third consumer has since appeared — the bottom nav bar floats over this route's map at a height
 * that only stays harmless while `RESTING_SHEET_FRACTION` is larger than it. That is an arithmetic
 * relationship between two files, which is exactly the kind that breaks silently.
 */

/** The sheet's stops, matching `place-sheet.tsx` so the two surfaces feel like one product — the
 *  peek height is that file's `PEEK_PX`, duplicated with the coupling named because it is not
 *  exported (`query-rect.ts`'s `SHEET_PEEK_PX` mirrors the same number the same way). */
export const PEEK_PX = 128;

/**
 * Where the sheet **rests** here, and the one difference from `/map` the camera has to know about:
 * this surface opens at `half` and stays there, so more than half the map is permanently covered.
 *
 * This is the single source for that number and `SNAP_POINTS` is built *from* it, rather than the
 * camera reading it back out of the array by index. The index version failed open: it was
 * `SNAP_POINTS[1] ?? 0.55` narrowed with a `typeof === 'number'` test, so reordering the stops so
 * that index 1 held a `px` string made the fraction `undefined`, the prop was dropped by the
 * conditional spread, the camera silently reverted to framing for a 128 px peek, and no test
 * anywhere failed. Deriving in this direction there is nothing to fail: the value the sheet rests
 * at and the value the camera frames for are the same constant.
 */
export const RESTING_SHEET_FRACTION = 0.55;

/** This surface puts **nothing** over the top edge of its map: no account chip, no post-import
 *  strip, no floating filter row — its whole UI is the sheet below `lg` and the left panel at
 *  `lg+`, and MapLibre's own controls sit bottom-right. Declaring that is not cosmetic. The camera
 *  used to be charged `/map`'s 100 px allowance anyway, and on a short container that phantom band
 *  was the whole overflow: at 640×360 (a landscape Pixel/Galaxy) the padding came to 394 px of a
 *  360 px container, `clampFitPadding` scaled the box down, and the lowest pin landed under this
 *  sheet — measured in a browser, its tip at 163 px against a sheet top of 162 px, and 10 px under
 *  at 568×320. At zero the same fit is 294 px of 360, never reaches the clamp, and every pin clears
 *  the sheet by the full 48 px. If this surface ever grows floating top chrome, this is the number
 *  that has to grow with it.
 *
 *  **The bottom nav bar is not that chrome.** It is at the bottom, and it is inside the band this
 *  route's sheet already occludes at every stop — see `tests/unit/collections/collection-map-geometry.test.ts`
 *  for the arithmetic, which is checked rather than asserted in prose. */
export const FLOATING_TOP_CHROME_PX = 0;
