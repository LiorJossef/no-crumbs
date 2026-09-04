import { expect, test, type Page } from '@playwright/test';

import { signInAsDemoUser } from './_lib/sign-in';

/**
 * FIX-ERR-QA — one paste must cost at most one `/api/imports/probe` request.
 *
 * `fix/honest-import-errors` made `Add →` clickable for any non-empty field, and `submit()` has no
 * in-flight guard of its own: the only thing that stops a second fire is that the paste screen
 * unmounts when `setScreen({ kind: 'rail' })` lands. That is a rendering accident, not a lock, so
 * it is measured here — the route spends a model call against a hard 500/day Gemini ceiling, and a
 * double-fire is a cost defect, not a cosmetic one.
 *
 * The URL used is one whose extraction is already cached locally, so a stray extra request costs an
 * oEmbed fetch and a cache read, never a model call.
 *
 * Measured on `fix/honest-import-errors`, both breakpoints: a real `dblclick` fires **once** (the
 * paste screen unmounts between the two input events), and `Enter` in the field fires **zero**
 * times (the field is not inside a `<form>`). Five clicks dispatched inside a single task fire
 * **five** times, on `Add →` and on `Retry` alike. So this is reachable by script, not by a
 * human's finger — which is why the two burst cases are the failing ones and the human-input
 * cases pass. It is also not new: `submit()` had no in-flight guard on `main` either, and a valid
 * link enabled the button there too.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.E2E_PASSWORD;

/** Cached in `sources` + `extractions` on the local database — see the file header. */
const CACHED = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';
/** A well-formed TikTok URL whose video id does not exist: fails at the source stage with
 *  `POST_UNAVAILABLE`, so it exercises the failure screen without ever reaching the model. */
const MISSING = 'https://www.tiktok.com/@nobody/video/70000000000000000001'.replace('70000000000000000001', '7259010845558983971');

async function signIn(page: Page): Promise<void> {
  await signInAsDemoUser(page, EMAIL, PASSWORD as string);
}

function probeCounter(page: Page): () => number {
  let n = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/imports/probe')) n += 1;
  });
  return () => n;
}

test.describe('one paste, one request', () => {
  test.skip(PASSWORD === undefined, 'set E2E_PASSWORD to run the signed-in checks');
  test.describe.configure({ timeout: 240_000 });

  test('a synchronous burst of clicks on Add fires the route once', async ({ page }) => {
    const probes = probeCounter(page);
    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(CACHED);

    // The worst case a real double-click approximates: several clicks dispatched inside one task,
    // with no chance for React to re-render between them.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add'));
      if (!button) throw new Error('Add button not found');
      for (let i = 0; i < 5; i += 1) button.click();
    });
    await page.waitForTimeout(6000);
    console.log(JSON.stringify({ case: 'synchronous burst x5', probeRequests: probes() }));
    expect(probes(), 'five synchronous clicks must not become five imports').toBe(1);
  });

  test('a real double-click on Add fires the route once', async ({ page }) => {
    const probes = probeCounter(page);
    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(CACHED);
    await page.getByRole('button', { name: 'Add →' }).dblclick();
    await page.waitForTimeout(6000);
    console.log(JSON.stringify({ case: 'dblclick', probeRequests: probes() }));
    expect(probes()).toBe(1);
  });

  test('Enter in the field either submits once or does nothing', async ({ page }) => {
    const probes = probeCounter(page);
    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    const field = page.getByPlaceholder('Paste a TikTok link');
    await field.fill(CACHED);
    await field.press('Enter');
    await page.waitForTimeout(4000);
    const submitted = probes();
    console.log(JSON.stringify({ case: 'Enter key', probeRequests: submitted, url: page.url() }));
    expect(submitted, 'Enter must never fire more than one import').toBeLessThanOrEqual(1);
    // Recorded, not asserted: whether Enter submits at all is a UX question for the orchestrator.
  });

  test('Retry on a failure screen re-POSTs the same url and cannot be spammed', async ({ page }) => {
    const bodies: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/imports/probe')) bodies.push(r.postData() ?? '');
    });
    await signIn(page);
    await page.goto('/import');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Paste a TikTok link').fill(MISSING);
    await page.getByRole('button', { name: 'Add →' }).click();

    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 60_000 });
    const afterFirst = bodies.length;

    // Five synchronous clicks on Retry, the same worst case as above.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry');
      if (!button) throw new Error('Retry button not found');
      for (let i = 0; i < 5; i += 1) button.click();
    });
    await page.waitForTimeout(8000);
    console.log(JSON.stringify({
      case: 'retry burst x5',
      firstSubmit: afterFirst,
      totalRequests: bodies.length,
      allSameUrl: bodies.every((b) => b === bodies[0]),
      body: bodies[0],
    }));
    expect(bodies.every((b) => b === bodies[0]), 'Retry must re-send the same url').toBe(true);
    expect(bodies.length - afterFirst, 'five synchronous Retry clicks must not become five imports').toBe(1);
  });
});
