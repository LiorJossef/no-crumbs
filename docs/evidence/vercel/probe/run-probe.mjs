#!/usr/bin/env node
// Runs the three probes against a DEPLOYED Vercel URL and writes the evidence JSON.
// Usage: node run-probe.mjs https://<deployment>.vercel.app [region-label]
// No credentials. Reads nothing from the environment.
import { writeFileSync } from 'node:fs';

const base = process.argv[2];
const label = process.argv[3] ?? 'unknown-region';
if (!base) { console.error('usage: node run-probe.mjs <deployment-url> [region-label]'); process.exit(1); }

const out = { probedAt: new Date().toISOString(), base, regionLabel: label };

// ---- P1: the 16 URLs from Vercel egress
console.error('P1 oembed-16 ...');
out.p1_oembed16 = await (await fetch(`${base}/api/probe/oembed`, { cache: 'no-store' })).json();
console.error(`   ok=${out.p1_oembed16.ok}/${out.p1_oembed16.total} region=${out.p1_oembed16.region} p90=${out.p1_oembed16.latency?.p90}ms`);

// ---- P2: 200 sequential, per-IP quota detection
console.error('P2 burst-200 ... (may take ~2 min)');
out.p2_burst200 = await (await fetch(`${base}/api/probe/burst?n=200`, { cache: 'no-store' })).json();
console.error(`   counts=${JSON.stringify(out.p2_burst200.counts)} firstNon200=${out.p2_burst200.firstNon200Index}`);

// ---- P3: incremental streaming + 30 s duration. Arrival offsets measured HERE, client-side.
async function streamRun(pad) {
  const t0 = Date.now();
  const r = await fetch(`${base}/api/probe/stream?seconds=30&every=2000&pad=${pad}`, { cache: 'no-store' });
  const lines = [];
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let obj = null; try { obj = JSON.parse(line); } catch {}
      lines.push({ clientMs: Date.now() - t0, serverMs: obj?.serverMs ?? null, event: obj?.event ?? null, i: obj?.i ?? null });
    }
  }
  const totalMs = Date.now() - t0;
  const ticks = lines.filter((l) => l.event === 'tick');
  const firstTick = ticks[0]?.clientMs ?? null;
  const gaps = ticks.slice(1).map((l, k) => l.clientMs - ticks[k].clientMs);
  const maxSkew = Math.max(...lines.map((l) => Math.abs((l.clientMs ?? 0) - (l.serverMs ?? 0))));
  return {
    pad,
    httpStatus: r.status,
    contentType: r.headers.get('content-type'),
    contentEncoding: r.headers.get('content-encoding'),
    transferEncoding: r.headers.get('transfer-encoding'),
    lineCount: lines.length,
    completed: lines.at(-1)?.event === 'done',
    totalMs,
    firstTickClientMs: firstTick,
    tickGapsMs: gaps,
    maxClientServerSkewMs: maxSkew,
    // VERDICT: incremental if the first tick landed near 2 s, not near 30 s, and gaps ~2 s.
    verdict_incremental: firstTick !== null && firstTick < 6000 && gaps.every((g) => g < 6000),
    verdict_duration30sOk: lines.at(-1)?.event === 'done' && totalMs > 29000,
    lines,
  };
}
console.error('P3 stream (unpadded) ...');
out.p3_stream_unpadded = await streamRun(0);
console.error(`   incremental=${out.p3_stream_unpadded.verdict_incremental} firstTick=${out.p3_stream_unpadded.firstTickClientMs}ms total=${out.p3_stream_unpadded.totalMs}ms done=${out.p3_stream_unpadded.completed}`);
if (!out.p3_stream_unpadded.verdict_incremental) {
  console.error('P3 stream (padded 2048B — testing whether a buffer threshold is the cause) ...');
  out.p3_stream_padded = await streamRun(2048);
  console.error(`   incremental=${out.p3_stream_padded.verdict_incremental}`);
}

out.summary = {
  oembedWorksFromVercel: out.p1_oembed16.ok === out.p1_oembed16.total,
  perIpQuotaObserved: out.p2_burst200.firstNon200Index >= 0,
  streamingIncremental: out.p3_stream_unpadded.verdict_incremental || out.p3_stream_padded?.verdict_incremental === true,
  paddingRequired: out.p3_stream_unpadded.verdict_incremental === false && out.p3_stream_padded?.verdict_incremental === true,
  thirtySecondHandlerCompletes: out.p3_stream_unpadded.verdict_duration30sOk,
};
const file = `07a-stream-and-duration-probe.${label}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.error('\nSUMMARY', JSON.stringify(out.summary, null, 2));
console.error(`wrote ${file}`);
