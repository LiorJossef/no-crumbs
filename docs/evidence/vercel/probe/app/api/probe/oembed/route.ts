// P1 — does TikTok oEmbed work from Vercel's egress IPs, and does it return the same captions?
import { URLS, OEMBED } from '../urls';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const results = [];
  for (const u of URLS) {
    const t0 = Date.now();
    try {
      const r = await fetch(OEMBED + encodeURIComponent(u), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - t0;
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* keep raw */ }
      results.push({
        input: u,
        status: r.status,
        ms,
        author: json?.author_unique_id ?? null,
        videoId: json?.embed_product_id ?? null,
        titleLen: typeof json?.title === 'string' ? [...json.title].length : null,
        titleSha: null as string | null,
        raw: json ? undefined : text.slice(0, 300),
      });
    } catch (e) {
      results.push({ input: u, status: null, ms: Date.now() - t0, error: String(e) });
    }
  }
  const ok = results.filter((r) => r.status === 200).length;
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  return Response.json({
    probe: 'oembed-16',
    region: process.env.VERCEL_REGION ?? null,
    env: process.env.VERCEL_ENV ?? null,
    at: new Date().toISOString(),
    ok, total: results.length,
    latency: { p50: lat[Math.floor(lat.length * 0.5)], p90: lat[Math.floor(lat.length * 0.9)], max: lat[lat.length - 1] },
    results,
  }, { headers: { 'cache-control': 'no-store' } });
}
