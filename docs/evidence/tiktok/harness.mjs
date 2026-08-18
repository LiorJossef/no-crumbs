// Server-side Node oEmbed harness. Run: node harness.mjs urls.txt > out.json
// Node 22, global fetch, no deps. No credentials used or stored.
import { readFileSync } from 'node:fs';
const OEMBED = 'https://www.tiktok.com/oembed?url=';
const urls = readFileSync(process.argv[2], 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const out = [];
for (const u of urls) {
  const t0 = Date.now();
  let rec = { input: u };
  try {
    const r = await fetch(OEMBED + encodeURIComponent(u), { redirect: 'follow' });
    rec.status = r.status;
    rec.ms = Date.now() - t0;
    const body = await r.text();
    try { rec.json = JSON.parse(body); } catch { rec.raw = body.slice(0, 500); }
    if (rec.json?.title !== undefined) {
      rec.titleLen = [...rec.json.title].length;
      rec.titleBytes = Buffer.byteLength(rec.json.title, 'utf8');
      rec.endsAbrupt = /[…]$|\.\.\.$/.test(rec.json.title.trim());
      rec.hashtags = (rec.json.title.match(/#[\p{L}\p{N}_]+/gu) || []).length;
      rec.fields = Object.keys(rec.json).sort();
    }
  } catch (e) { rec.error = String(e); rec.ms = Date.now() - t0; }
  out.push(rec);
  process.stderr.write(`${rec.status ?? rec.error} ${rec.ms}ms len=${rec.titleLen ?? '-'} @${rec.json?.author_unique_id ?? '-'}\n`);
}
console.log(JSON.stringify(out, null, 2));
