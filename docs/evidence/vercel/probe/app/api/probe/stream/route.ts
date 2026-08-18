// P3 — the architect's assertion (docs/07-import-execution-model.md §2):
//   (a) a Node-runtime Route Handler streams NDJSON INCREMENTALLY rather than buffering, and
//   (b) a ~30 s handler COMPLETES on the Hobby plan.
// Non-buffering cannot be proven server-side. Each line carries the server emit offset; the
// CLIENT (run-probe.mjs) records arrival offsets. Buffered => all lines arrive together at ~30 s.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // the value docs/07 declares for the real import route

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const seconds = Math.min(Number(q.get('seconds') ?? 30), 55);
  const every = Math.max(Number(q.get('every') ?? 2000), 250);
  // Optional padding: some intermediaries hold a response until a buffer threshold is reached.
  // If the unpadded run shows buffering and the padded run does not, THAT is the finding.
  const pad = Number(q.get('pad') ?? 0);
  const padding = pad > 0 ? 'x'.repeat(pad) : undefined;

  const t0 = Date.now();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) =>
        controller.enqueue(enc.encode(JSON.stringify({ ...obj, serverMs: Date.now() - t0, ...(padding ? { padding } : {}) }) + '\n'));

      emit({ event: 'open', region: process.env.VERCEL_REGION ?? null, env: process.env.VERCEL_ENV ?? null, seconds, every, pad });

      const ticks = Math.floor((seconds * 1000) / every);
      for (let i = 1; i <= ticks; i++) {
        await new Promise((r) => setTimeout(r, every));
        emit({ event: 'tick', i, of: ticks });
      }

      emit({ event: 'done', totalMs: Date.now() - t0 });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
