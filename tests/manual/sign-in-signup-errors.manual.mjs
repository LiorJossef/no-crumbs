/**
 * Probe: the sign-up side of the same screen. Neither case can create an account — one is refused
 * for a short password, the other for an address that already exists.
 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const CASES = [
  { id: 'weak-password', email: 'demo@example.com', password: '12345' },
  { id: 'existing-account', email: 'demo@example.com', password: 'local-dev-preview-1234' },
];
for (const vp of [{n:'phone',width:390,height:844},{n:'desktop',width:1280,height:900}]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
  for (const c of CASES) {
    const page = await ctx.newPage();
    const lines=[]; page.on('console', m=>lines.push(m.text()));
    await page.goto('http://localhost:3477/sign-in?mode=sign-up', { waitUntil:'networkidle' });
    await page.fill('#first-name','Probe');
    await page.fill('#email', c.email); await page.fill('#password', c.password);
    await page.click('button[type=submit]'); await page.waitForTimeout(2500);
    console.log(JSON.stringify({ vp: vp.n, case: c.id,
      shown: await page.locator('[role=status]').allInnerTexts(),
      diagnostic: lines.filter(l=>l.startsWith('sign-in failed')) }));
    await page.screenshot({ path: `/tmp/sign-in-probe/signup-${c.id}-${vp.n}.png` });
    await page.close();
  }
  await ctx.close();
}
await b.close();
