// P2 — per-IP quota detection. N sequential oEmbed calls from one Vercel egress IP.
// Every status is recorded; we are looking for a 429, a sudden run of 400s, or latency collapse.
import { OEMBED } from '../urls';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TARGET = 'https://www.tiktok.com/@exploringlondon/video/7346702347491446049';

export async function GET(req: Request) {
  const n = Math.min(Number(new URL(req.url).searchParams.get('n') ?? 200), 500);
  const statuses: number[] = [];
  const timings: number[] = [];
  const anomalies: unknown[] = [];
  let firstNon200 = -1;

  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      const r = await fetch(OEMBED + encodeURIComponent(TARGET), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      statuses.push(r.status);
      timings.push(Date.now() - t0);
      if (r.status !== 200) {
        if (firstNon200 < 0) firstNon200 = i;
        anomalies.push({
          i, status: r.status,
          retryAfter: r.headers.get('retry-after'),
          rateLimit: r.headers.get('x-ratelimit-remaining'),
          body: (await r.text()).slice(0, 200),
        });
      }
    } catch (e) {
      statuses.push(-1);
      timings.push(Date.now() - t0);
      if (firstNon200 < 0) firstNon200 = i;
      anomalies.push({ i, error: String(e) });
    }
  }

  const counts: Record<string, number> = {};
  for (const s of statuses) counts[String(s)] = (counts[String(s)] ?? 0) + 1;
  const sorted = [...timings].sort((a, b) => a - b);
  return Response.json({
    probe: `burst-${n}`,
    region: process.env.VERCEL_REGION ?? null,
    at: new Date().toISOString(),
    counts, firstNon200Index: firstNon200,
    latency: { p50: sorted[Math.floor(n * 0.5)], p90: sorted[Math.floor(n * 0.9)], max: sorted[n - 1] },
    firstTen: timings.slice(0, 10), lastTen: timings.slice(-10),
    anomalies: anomalies.slice(0, 25),
  }, { headers: { 'cache-control': 'no-store' } });
}
