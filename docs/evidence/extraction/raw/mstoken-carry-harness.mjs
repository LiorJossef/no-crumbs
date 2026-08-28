/**
 * L0-TRANSCRIPT-T4 measurement: does carrying TikTok's own `msToken` cookie between attempts
 * raise the rate at which the public post page is server-rendered?
 *
 * Two arms, interleaved so TikTok's own load-shedding rate over the run cannot favour one:
 *   A "cold"  — every fetch sends no cookie, as the committed probe does today.
 *   B "jar"   — a single cookie jar per arm, seeded from each response's own `set-cookie`.
 *
 * Hard cap: FETCH_BUDGET total requests, and the run aborts on the first hard-block signal.
 * Records headers and byte counts only; no payload is parsed and no media is downloaded.
 */
const POSTS = [
  ['briancantstopeating', '7245648559981350186'],
  ['nom_life', '7220925199297039662'],
  ['yallabikestlv', '7494360070369709354'],
  ['alexandramoulavi', '7347722826654305578'],
  ['ysabellahazan', '7081307157660241157'],
];

const ROUNDS = 4;
const FETCH_BUDGET = 40;
const MIN_INTERVAL_MS = 2500;
const MARKER = '__UNIVERSAL_DATA_FOR_REHYDRATION__';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

let spent = 0;
let lastAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isHardBlock(status, body) {
  const low = body.slice(0, 200000).toLowerCase();
  return (
    status === 403 ||
    status === 429 ||
    low.includes('tiktok-verify') ||
    low.includes('verify to continue') ||
    low.includes('slide to verify') ||
    low.includes('access denied') ||
    low.includes('unusual traffic')
  );
}

function mergeJar(jar, res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return raw.map((c) => c.split('=')[0].trim());
}

async function once(arm, jar, handle, videoId, round) {
  if (spent >= FETCH_BUDGET) throw new Error('budget exhausted');
  const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
  if (wait > 0) await sleep(wait);

  const url = `https://www.tiktok.com/@${handle}/video/${videoId}`;
  const headers = {
    'user-agent': BROWSER_UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
  };
  if (jar && jar.size > 0) {
    headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const started = Date.now();
  spent += 1;
  lastAt = Date.now();
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    const body = await res.text();
    const setNames = jar ? mergeJar(jar, res) : (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((c) => c.split('=')[0].trim());
    return {
      arm,
      round,
      handle,
      videoId,
      n: spent,
      status: res.status,
      ms: Date.now() - started,
      bytes: body.length,
      hasPayload: body.includes(MARKER),
      csrFallback: res.headers.get('x-csr-fallback') === '1',
      hardBlock: isHardBlock(res.status, body),
      renderMs: res.headers.get('x-bytefaas-execution-duration'),
      setCookieNames: setNames,
      cookiesSent: jar ? [...jar.keys()] : [],
      error: null,
    };
  } catch (e) {
    return { arm, round, handle, videoId, n: spent, status: null, ms: Date.now() - started, bytes: 0, hasPayload: false, csrFallback: false, hardBlock: false, renderMs: null, setCookieNames: [], cookiesSent: jar ? [...jar.keys()] : [], error: e instanceof Error ? e.name : 'unknown' };
  }
}

const jar = new Map();
const results = [];
let aborted = null;

outer: for (let round = 1; round <= ROUNDS; round += 1) {
  for (const [handle, videoId] of POSTS) {
    for (const arm of ['cold', 'jar']) {
      if (spent >= FETCH_BUDGET) break outer;
      const r = await once(arm, arm === 'jar' ? jar : null, handle, videoId, round);
      results.push(r);
      process.stderr.write(`${String(r.n).padStart(2)} ${arm.padEnd(4)} r${round} ${handle.slice(0, 16).padEnd(16)} ${r.status} ${String(r.bytes).padStart(7)}B csr=${r.csrFallback ? 1 : 0} payload=${r.hasPayload ? 1 : 0} render=${r.renderMs ?? '-'} jar=${r.cookiesSent.join(',') || '-'}\n`);
      if (r.hardBlock) { aborted = 'hard-block'; break outer; }
    }
  }
}

const rate = (arm) => {
  const a = results.filter((r) => r.arm === arm);
  return { arm, n: a.length, payload: a.filter((r) => r.hasPayload).length, csrShed: a.filter((r) => !r.hasPayload && r.csrFallback).length, other: a.filter((r) => !r.hasPayload && !r.csrFallback).length };
};

const out = {
  task: 'L0-TRANSCRIPT-T4',
  measuredAt: new Date().toISOString(),
  egress: 'residential (IL ISP), local Node',
  node: process.version,
  design: { rounds: ROUNDS, posts: POSTS.length, arms: ['cold', 'jar'], minIntervalMs: MIN_INTERVAL_MS, fetchBudget: FETCH_BUDGET },
  aborted,
  fetchesSpent: spent,
  summary: { cold: rate('cold'), jar: rate('jar') },
  results,
};
process.stdout.write(JSON.stringify(out, null, 2));
