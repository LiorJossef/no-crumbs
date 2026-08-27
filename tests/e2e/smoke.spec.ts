import { expect, test } from '@playwright/test';

test('the landing page renders', async ({ page }) => {
  await page.goto('/');
  // Was `getByRole('heading', { name: 'P-002' })` — the h1 used to be the repo codename because
  // the page was still MS2's deploy placeholder. The codename is now a small label beside the
  // mark (and stays a placeholder: the product name is an open owner decision, L1-F1-T1), and the
  // h1 is what the page is actually about.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your saved places');
  await expect(page.getByRole('link', { name: /Sign in/ })).toBeVisible();
});

test('no landing-page text renders in its own background colour', async ({ page }) => {
  // A regression test for a real defect, not a hypothetical one: both paragraphs on the old
  // landing page were `color: var(--muted)`, which is the *surface* token (#FAF9F6) and identical
  // to the page background. The only sentence describing the product rendered invisible, and
  // nothing — not a type error, not a lint rule, not a screenshot diff — caught it. shadcn's
  // convention is that `--muted` is a surface and `--muted-foreground` is the text colour, so the
  // mistake is one character wide and easy to make again.
  await page.goto('/');

  const offenders = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    // Resolve any CSS colour — including oklab()/color-mix() output — through the canvas rather
    // than a regex, so nothing is skipped for being in a format the test did not anticipate.
    const rgba = (value: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]!];
    };
    const backgroundOf = (el: Element): [number, number, number, number] => {
      let node: Element | null = el;
      while (node) {
        const c = rgba(getComputedStyle(node).backgroundColor);
        if (c[3] > 2) return c;
        node = node.parentElement;
      }
      return [255, 255, 255, 255];
    };
    const luminance = ([r, g, b]: [number, number, number, number]) => {
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join(' ')
        .trim();
      if (!own) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (Number(style.opacity) === 0) continue;

      const fg = rgba(style.color);
      const bg = backgroundOf(el);
      const ratio =
        (Math.max(luminance(fg), luminance(bg)) + 0.05) /
        (Math.min(luminance(fg), luminance(bg)) + 0.05);
      // 4.5:1 is WCAG AA for normal-size text, and every string on this page is normal-size text.
      // The original defect scored 1.00 — the assertion would hold at almost any threshold, but a
      // real one keeps it from silently degrading to "technically not invisible".
      if (ratio < 4.5) bad.push(`${own.slice(0, 40)} — ${style.color} on rgb(${bg.slice(0, 3)}) = ${ratio.toFixed(2)}:1`);
    }
    return bad;
  });

  expect(offenders).toEqual([]);
});

test('the health endpoint answers ok', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.ok()).toBe(true);
  expect((await res.json()).ok).toBe(true);
});
