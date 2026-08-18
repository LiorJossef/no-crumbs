import { expect, test } from '@playwright/test';

test('the landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'P-002' })).toBeVisible();
});

test('the health endpoint answers ok', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.ok()).toBe(true);
  expect((await res.json()).ok).toBe(true);
});
