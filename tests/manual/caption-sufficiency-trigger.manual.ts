/**
 * RICH-EXT-1 probe — "is the caption insufficient?" as a measurable trigger.
 *
 * Throwaway investigation script, not production code and not a test. It answers one question the
 * evidence cascade (caption -> escalate only if insufficient -> stop) depends on entirely:
 * **what cheap signal predicts that the caption did not name the venue?**
 *
 * Denominator is E7 (`docs/evidence/tiktok/07-caption-content-scoring.md`), because those 16 posts
 * carry a *human* verdict on whether the caption names a resolvable venue, hand-labelled by
 * watching the video. `tests/manual/tiktok-recognition-corpus.json` cannot be the denominator here:
 * it is caption-rich by construction, so any trigger measured on it would look better than it is.
 *
 * Two passes:
 *   1. deterministic signals over the cached captions — free, no network, always runs.
 *   2. the real `PlaceExtractor` on a capped subset — only with `LIVE=1`, and capped at
 *      `MAX_LIVE_CALLS` because the Gemini budget is 500 calls/day, shared.
 *
 * Run:
 *   npx tsx tests/manual/caption-sufficiency-trigger.manual.ts
 *   LIVE=1 LLM_PROVIDER=gemini npx tsx tests/manual/caption-sufficiency-trigger.manual.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createPlaceExtractor,
  type PlaceExtractorEnv,
} from '../../src/integrations/llm/place-extractor-factory';

const REPO = resolve(import.meta.dirname, '../..');
const E7_RAW = resolve(REPO, 'docs/evidence/tiktok/oembed-set1-raw.json');
const OUT = resolve(REPO, 'docs/evidence/extraction/raw/caption-sufficiency-trigger-2026-08-28.json');
/**
 * Live results go to their own file. An offline re-run used to overwrite `OUT` and destroy the live
 * record — which is exactly what happened once on 2026-08-28, and re-running would have breached the
 * live-call cap. Two files, so the cheap pass can never cost the expensive one.
 */
const OUT_LIVE = resolve(
  REPO,
  'docs/evidence/extraction/raw/caption-sufficiency-trigger-live-2026-08-28.json',
);

// 10 minus the one call burned by a crashed first attempt (missing `log.event` stub).
const MAX_LIVE_CALLS = 9;

/**
 * E7's hand labels, transcribed from the table in
 * `docs/evidence/tiktok/07-caption-content-scoring.md`. `class` is the ground truth this probe is
 * scored against:
 *   sufficient      — caption names a resolvable venue; escalation would be wasted spend
 *   recoverable     — place post, caption does not name the venue, but the video demonstrably does
 *   futile          — place post, caption does not name the venue, and neither does the video
 *                     (question posts, "comment for the name" gimmicks, "drop recs below")
 *   not-a-place     — control post; escalation would be wasted spend
 */
const LABELS: Record<string, { readonly n: number; readonly class: string; readonly note: string }> =
  {
    '7245648559981350186': { n: 1, class: 'recoverable', note: '6 Tokyo spots, named in-video' },
    '7220925199297039662': { n: 2, class: 'recoverable', note: 'Tokyo rec list, named in-video' },
    '7290074173500706079': { n: 3, class: 'not-a-place', note: 'cats, control' },
    '7402198592712215841': { n: 4, class: 'not-a-place', note: 'app promo, control' },
    '7508758330035195158': { n: 5, class: 'not-a-place', note: '2 hashtags only, control' },
    '7448327861636943150': { n: 6, class: 'futile', note: '"drop cafe recs below" — no venue exists' },
    '7496222617053990175': { n: 7, class: 'sufficient', note: 'Cafe Fiori + street + city' },
    '7494360070369709354': { n: 8, class: 'recoverable', note: 'Simhovich, on-screen/spoken only' },
    '7395598157620497696': { n: 9, class: 'sufficient', note: 'Nomena Roasters + street + city' },
    '7325134418991942945': { n: 10, class: 'not-a-place', note: 'comedy, city only' },
    '7323274629865295137': { n: 11, class: 'not-a-place', note: 'repost of #10' },
    '7347722826654305578': { n: 12, class: 'recoverable', note: 'Nomena, on-screen/spoken only' },
    '7081307157660241157': { n: 13, class: 'recoverable', note: '"Tel Aviv >" — city only' },
    '7205629856716000517': { n: 14, class: 'futile', note: 'question post, asks the audience' },
    '7346702347491446049': { n: 15, class: 'sufficient', note: '8 restaurants + neighbourhoods' },
    '7541775954906041622': { n: 16, class: 'futile', note: 'name withheld in caption AND speech' },
  };

interface Row {
  readonly id: string;
  readonly n: number;
  readonly class: string;
  readonly note: string;
  readonly caption: string;
  readonly signals: Record<string, boolean>;
  extraction?: {
    readonly candidateCount: number;
    readonly rawNames: readonly string[];
    readonly cityHints: readonly (string | null)[];
    readonly confidences: readonly number[];
  };
}

/** Everything here is deterministic, cheap and runs before any model call. */
function signalsFor(caption: string): Record<string, boolean> {
  const trimmed = caption.trim();
  const withoutTags = trimmed.replace(/#[^\s#]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  const wordsOutsideTags = withoutTags.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length;

  return {
    /** The "📍" convention — E7 and the corpus both show it marks an explicit venue line. */
    noPinMarker: !trimmed.includes('📍'),
    shortCaption: trimmed.length < 60,
    /** Hashtag/emoji salad: almost nothing left once hashtags are stripped. */
    hashtagOnly: wordsOutsideTags <= 2,
    /** No @-mention, which for a business handle is a resolvable identity in its own right. */
    noAtMention: !/@[A-Za-z0-9._]{2,}/u.test(trimmed),
    /** No street-address shape in any of our three scripts. */
    noStreetHint:
      !/\b\d{1,4}\b/u.test(withoutTags) ||
      !/(st\.?|street|rd\.?|road|ave\.?|avenue|blvd|רחוב|שדרות|דרך)/iu.test(withoutTags),
    /** Names a city but nothing narrower — the "city-only" class E7 says is the biggest bucket. */
    cityWordOnly:
      /(tel aviv|tlv|tokyo|london|jaffa|תל אביב|יפו)/iu.test(withoutTags) &&
      !trimmed.includes('📍'),
  };
}

function main(): void {
  const raw = JSON.parse(readFileSync(E7_RAW, 'utf8')) as ReadonlyArray<{
    readonly input: string;
    readonly status: number;
    readonly json?: { readonly title?: string };
  }>;

  const rows: Row[] = [];
  for (const entry of raw) {
    const id = /\/video\/(\d{17,20})/u.exec(entry.input)?.[1];
    if (id === undefined) continue;
    const label = LABELS[id];
    if (label === undefined) throw new Error(`Unlabelled E7 post ${id}`);
    const caption = entry.json?.title ?? '';
    rows.push({
      id,
      n: label.n,
      class: label.class,
      note: label.note,
      caption,
      signals: signalsFor(caption),
    });
  }
  rows.sort((a, b) => a.n - b.n);

  /**
   * A trigger should fire on `recoverable` (escalation would help) and stay silent on
   * `sufficient` / `not-a-place` / `futile` (escalation is wasted spend). `futile` sits with the
   * negatives deliberately: the caption *is* insufficient there, but no escalation can fix it, so
   * a trigger that fires costs money for nothing.
   */
  const shouldFire = (r: Row): boolean => r.class === 'recoverable';
  const signalNames = Object.keys(rows[0]!.signals);
  const scores: Record<string, Record<string, number>> = {};
  for (const s of signalNames) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const r of rows) {
      const fired = r.signals[s] === true;
      if (fired && shouldFire(r)) tp += 1;
      else if (fired) fp += 1;
      else if (shouldFire(r)) fn += 1;
      else tn += 1;
    }
    scores[s] = {
      tp,
      fp,
      fn,
      tn,
      precision: tp + fp === 0 ? 0 : Number((tp / (tp + fp)).toFixed(2)),
      recall: tp + fn === 0 ? 0 : Number((tp / (tp + fn)).toFixed(2)),
    };
  }

  console.log('post  class         ' + signalNames.map((s) => s.slice(0, 9).padEnd(10)).join(''));
  for (const r of rows) {
    console.log(
      `#${String(r.n).padEnd(4)} ${r.class.padEnd(13)} ` +
        signalNames.map((s) => (r.signals[s] === true ? 'FIRE' : '.').padEnd(10)).join(''),
    );
  }
  console.log('\nsignal                tp fp fn tn  prec  recall   (positive class = "recoverable")');
  for (const s of signalNames) {
    const v = scores[s]!;
    console.log(
      `${s.padEnd(22)}${String(v.tp).padStart(2)} ${String(v.fp).padStart(2)} ` +
        `${String(v.fn).padStart(2)} ${String(v.tn).padStart(2)}  ${v.precision!.toFixed(2)}  ${v.recall!.toFixed(2)}`,
    );
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.class] = (acc[r.class] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nclass distribution:', counts);

  const record = {
    _comment:
      'RICH-EXT-1. Deterministic caption-sufficiency signals scored against E7 hand labels. ' +
      'Positive class is "recoverable" — the only class where escalating past the caption could help.',
    run_at: new Date().toISOString(),
    denominator: 'docs/evidence/tiktok/07-caption-content-scoring.md (n=16)',
    class_distribution: counts,
    signal_scores: scores,
    rows,
    live_extraction: false as boolean,
  };

  if (process.env.LIVE === '1') {
    void runLive(rows, record);
    return;
  }
  writeFileSync(OUT, JSON.stringify(record, null, 2));
  console.log(`\nwrote ${OUT}`);
}

/**
 * The one trigger that matters most — "the extractor returned zero candidates" — cannot be derived
 * from the caption text alone, so it needs real model calls. Capped hard: the shared Gemini budget
 * is 500/day and this probe is not worth a meaningful slice of it.
 */
async function runLive(rows: readonly Row[], record: Record<string, unknown>): Promise<void> {
  // `process.env` is `ProcessEnv`, whose index signature shares no declared property with
  // `PlaceExtractorEnv`, and `exactOptionalPropertyTypes` forbids passing an explicit `undefined`
  // for an optional key — so each var is spread in only when it is actually set.
  const envKeys = [
    'LLM_PROVIDER',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
  ] as const;
  const env: PlaceExtractorEnv = Object.fromEntries(
    envKeys.flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
  );
  const extractor = createPlaceExtractor(env);
  // The posts where the trigger decision is actually load-bearing: every caption E7 says does NOT
  // name a venue, plus two that do, as controls for false silence.
  const targets = rows
    .filter((r) => r.class !== 'not-a-place')
    .sort((a, b) => (a.class === 'sufficient' ? 1 : 0) - (b.class === 'sufficient' ? 1 : 0))
    .slice(0, MAX_LIVE_CALLS);

  console.log(`\nLIVE: ${targets.length} extractor calls (cap ${MAX_LIVE_CALLS})\n`);
  const costEvents: Record<string, string | number | boolean>[] = [];
  const ctx = {
    signal: AbortSignal.timeout(60_000),
    importId: null,
    log: {
      // The adapter emits `extraction.cost` here — captured so the probe reports real token
      // counts and dollars per import rather than assuming they are negligible.
      event: (name: string, fields: Record<string, string | number | boolean>) => {
        if (name === 'extraction.cost') costEvents.push(fields);
      },
    },
  } satisfies Parameters<typeof extractor.extract>[1];

  for (const target of targets) {
    const out = await extractor.extract(
      [{ kind: 'caption', text: target.caption, origin: `tiktok:video:${target.id}` }],
      ctx,
    );
    target.extraction = {
      candidateCount: out.candidates.length,
      rawNames: out.candidates.map((c) => c.rawName),
      cityHints: out.candidates.map((c) => c.cityHint),
      confidences: out.candidates.map((c) => c.modelConfidence ?? -1),
    };
    console.log(
      `#${target.n} ${target.class.padEnd(13)} candidates=${out.candidates.length} ` +
        `[${target.extraction.rawNames.join(' | ')}] cityHint=${out.cityHint ?? 'null'}`,
    );
  }

  record.live_extraction = true;
  record.extractor = { version: extractor.version, promptVersion: extractor.promptVersion };
  record.live_calls = targets.length;
  record.cost_events = costEvents;
  writeFileSync(OUT_LIVE, JSON.stringify(record, null, 2));
  console.log(`\nwrote ${OUT_LIVE}`);
}

main();
