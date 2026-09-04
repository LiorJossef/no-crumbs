import { chromium } from 'playwright';
const b = await chromium.launch();
for (const vp of [{n:'phone',width:390,height:844},{n:'desktop',width:1280,height:900}]) {
  for (const scheme of ['light','dark']) {
    const ctx = await b.newContext({ viewport:{width:vp.width,height:vp.height}, colorScheme: scheme });
    const page = await ctx.newPage();
    const lines=[]; page.on('console', m=>lines.push(m.text()));
    await page.route('**/auth/v1/token*', (route) => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'unexpected_failure', error_code: 'unexpected_failure',
        msg: 'Database error querying schema: relation "auth.users" for user +972-5x-xxx, phone provider disabled' }),
    }));
    await page.goto('http://localhost:3477/sign-in', { waitUntil:'networkidle' });
    await page.fill('#email','demo@example.com'); await page.fill('#password','anything-1234');
    await page.click('button[type=submit]'); await page.waitForTimeout(2000);
    const shown = await page.locator('[role=status]').allInnerTexts();
    const body = await page.locator('body').innerText();
    console.log(JSON.stringify({vp:vp.n,scheme,shown,
      leakedOnScreen: /Database error|auth\.users|phone|provider/i.test(body),
      diagnostic: lines.filter(l=>l.startsWith('sign-in failed'))}));
    await page.screenshot({path:`/tmp/sign-in-probe/unmapped-${vp.n}-${scheme}.png`});
    await ctx.close();
  }
}
await b.close();
