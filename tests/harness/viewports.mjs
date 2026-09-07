/**
 * The two viewports the quality gates are written against, and the reason they are declared here
 * rather than taken from Playwright's device registry.
 *
 * `docs/archive/overnight-run-plan.md` §8a Q1 names **390×844 and 1440×900**, and six package exit criteria
 * repeat those numbers (W1-1's zero state, W3-2's row↔pin coupling, and so on). Playwright's
 * built-in profiles do not produce either: measured at commit 55698ae with
 * `require('@playwright/test').devices`, **`Pixel 7` is 412×839** and **`Desktop Chrome` is
 * 1280×720**. A screenshot taken on those and filed against a 390×844 criterion is 22 px wider than
 * the thing being judged, which is exactly the width at which a two-column grid decides to be a
 * two-column grid.
 *
 * So these are stated as literals. 390×844 is the iPhone 12/13/14 logical viewport, which is what
 * "390" means in the run plan; `deviceScaleFactor: 3` matches that hardware and makes the PNG
 * legible when someone zooms in on a 2 px hairline.
 */
export const GATE_VIEWPORTS = [
  {
    id: '390x844',
    label: 'mobile',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    id: '1440x900',
    label: 'desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
  },
];
