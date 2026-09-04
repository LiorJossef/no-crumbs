/**
 * Probe: does any raw Supabase error string reach the sign-in screen?
 *
 * Drives real failures against the running dev server and reads the rendered status line. It never
 * creates an account and never submits the demo user's real password more than the one wrong
 * attempt below, so nothing is locked out. Run: `node tests/manual/sign-in-error-leak.manual.mjs`.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3477';
const OUT = process.env.PROBE_OUT ?? '/tmp/sign-in-probe';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

const CASES = [
  { id: 'wrong-password', email: 'demo@example.com', password: 'definitely-not-the-password' },
  { id: 'empty-fields', email: '', password: '' },
  { id: 'malformed-email', email: 'not-an-email', password: 'whatever-123' },
  { id: 'unknown-account', email: 'nobody-here-9f2a@example.com', password: 'whatever-123' },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: scheme,
    });
    for (const c of CASES) {
      const page = await ctx.newPage();
      const consoleLines = [];
      page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
      await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
      if (c.email) await page.fill('#email', c.email);
      if (c.password) await page.fill('#password', c.password);
      await page.click('button[type=submit]');
      await page.waitForTimeout(2500);
      const shown = await page.locator('[role=status]').allInnerTexts();
      console.log(JSON.stringify({ vp: vp.name, scheme, case: c.id, shown, console: consoleLines }));
      await page.screenshot({ path: `${OUT}/${c.id}-${vp.name}-${scheme}.png` });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
