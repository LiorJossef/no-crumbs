# E6 — Does it work from a datacenter IP? (PARTIALLY VERIFIED)
Date: 2026-08-18

## What was verified
1. **IL residential/ISP IP (62.0.96.200)** — 16/16 posts OK, 40 sequential + 30 parallel OK. See E1/E5.
2. **A non-residential, US-based cloud egress** — the same oEmbed URL was fetched through
   Anthropic's server-side fetch infrastructure (a datacenter IP, not this laptop, not a browser)
   and returned a **byte-identical JSON body including the full 488-char caption**:
   `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@nom_life/video/7220925199297039662`
   -> full `title`, `author_unique_id":"nom_life"`, `embed_product_id":"7220925199297039662"`.
   This is real evidence that TikTok oEmbed is **not** residential-IP-gated and returns identical
   caption content from a datacenter, from a different country.

## What is NOT verified
- **Never tested from Vercel itself.** Vercel egress IPs (AWS ranges, shared across all customers)
  are the single most likely place for a per-IP quota to bite. Anthropic's egress is not Vercel's.
- No evidence about sustained volume from one datacenter IP over hours/days.
- No evidence about region-locked posts from any IP.

## Required verification before this is called VERIFIED (30 min of work, do it week 1)
Deploy a throwaway Next.js route to Vercel:
```ts
// app/api/probe/route.ts  — no secrets, no DB
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('u')!;
  const t0 = Date.now();
  const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url));
  return Response.json({ status: r.status, ms: Date.now() - t0, body: await r.json().catch(() => null) });
}
```
Then: (a) run all 16 URLs from `urls-set1.txt`; (b) run 200 sequential calls and log every status
to detect a daily/hourly cap; (c) repeat from both `iad1` and `fra1` regions to detect geo variance;
(d) commit the output here as `06b-vercel-probe.json`.
**This is a GO/NO-GO gate. Do not build the import pipeline before it passes.**
