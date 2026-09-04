/**
 * E2-T0 — the owner-corpus library: the corpus schema, the fixture store, and the three stages
 * (caption → extraction → resolution) that both the seeder and the grader run.
 *
 * NOT a test file — the name deliberately lacks `.manual`, so `vitest.manual.config.ts`'s
 * `include` never picks it up as a suite. Same convention as `recognition-ranking.ts`.
 *
 * ## Why this exists
 *
 * Every number this project quotes about extraction — "27% hit rate", "zero wrong options", the
 * `postIntent` accuracy — was measured on **16 TikToks found by web search**, and the document
 * that produced them says so about itself (`docs/evidence/tiktok/07-caption-content-scoring.md`,
 * "Sample bias, stated honestly"): *"This must be re-measured on the project owner's labelled set
 * of real saved TikToks — that is the only sample whose distribution matches the actual
 * product."* That re-measurement has never happened, so every one of those numbers is a property
 * of a borrowed sample.
 *
 * This library is the machinery for the re-measurement. The only remaining step it does not do is
 * the one nobody else can: the owner pasting in their own links and saying, per post, what the
 * right answer was.
 *
 * ## The one label that matters, and why it is one label
 *
 * `class` — E7's four classes, already in use in `tests/manual/caption-sufficiency-trigger.manual.ts`
 * and reused verbatim here rather than re-invented:
 *
 *   `sufficient`   the caption names a venue you could resolve
 *   `recoverable`  a place post whose venue the caption does NOT name but the video does
 *   `futile`       a place post where the venue is named nowhere — a question, a withheld name
 *   `not-a-place`  not about places at all
 *
 * From that one word three expectations follow deterministically, which is what makes labelling
 * 50 posts a job rather than a project:
 *
 *  1. the expected `postIntent` (`INTENT_FOR_CLASS`) — overridable per case with `expectedIntent`
 *     when the owner disagrees, because the mapping is a default and not a fact;
 *  2. whether an escalation past the caption could ever pay (`recoverable`, and only that);
 *  3. for `futile` and `not-a-place`, the true place set is **empty by the definition of the
 *     class** — so no place names have to be typed for those rows at all. That is an entailment,
 *     not an invention: `futile` *means* the venue is named nowhere.
 *
 * ## Never invent a label
 *
 * `classSource` and `placesSource` are `'draft'` until the owner changes them to `'owner'`. A
 * draft row is `unadjudicated`: it is reported, separately and by name, and counts toward neither
 * the numerator nor the denominator of anything. The seeder pre-fills a draft **guess** so the
 * owner corrects rather than composes — but a guess the model made about itself can never be the
 * evidence that the model is right, and the two flags are what keep those apart.
 *
 * ## Fixtures, cost and the one thing that may not be committed
 *
 * Captions and model replies are stored under `docs/evidence/extraction/owner-corpus/` and are
 * meant to be committed: that is what lets a graded run replay with **no network and no spend**,
 * and it is the only way this measurement can ever live in CI.
 *
 * Provider rows are different, and the difference is legal rather than tidiness. Google's Service
 * Specific Terms §5.4 caps caching of lat/lng at 30 consecutive days (`06` §3.1, VERIFIED), so
 * Google Text Search answers are written to `docs/evidence/.local/`, which is gitignored — the
 * same rule `tiktok-recognition.manual.ts` already follows. **Consequence, stated plainly: the
 * extraction and intent half of this measurement can run in CI; the place-resolution half cannot,
 * without a provider whose terms allow the rows to be committed.**
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { POST_INTENTS, type PostIntent } from '@/domain/extraction/schema';
import { normalise } from '@/domain/places/normalise';
import { DomainError } from '@/domain/errors';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { PlaceCandidate, RawSource } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * The vocabulary
 * ------------------------------------------------------------------------------------------- */

export const OWNER_CLASSES = ['sufficient', 'recoverable', 'futile', 'not-a-place'] as const;
export type OwnerClass = (typeof OWNER_CLASSES)[number];

/**
 * The expected `postIntent` for each class. A **default**, not a fact — a post can be a genuine
 * recommendation whose name is withheld, and a reasonable person would call that
 * `place_recommendation` while this table says `place_question`. That is exactly the case
 * `expectedIntent` exists for, and the grader reports accuracy on explicitly-labelled rows
 * separately from accuracy on derived ones so the two are never silently merged.
 */
export const INTENT_FOR_CLASS: Readonly<Record<OwnerClass, PostIntent>> = {
  sufficient: 'place_recommendation',
  recoverable: 'place_recommendation',
  futile: 'place_question',
  'not-a-place': 'not_a_place',
};

/**
 * The only class where escalating past the caption — a transcript, a cover frame, video OCR — can
 * recover the answer. `futile` sits with the negatives on purpose: the caption *is* insufficient
 * there, and no escalation can fix it, so a gate that fires costs money for nothing. Same
 * positive class as `caption-sufficiency-trigger.manual.ts`, so the two measurements compare.
 */
export const ESCALATION_POSITIVE: OwnerClass = 'recoverable';

/** Classes whose true place set is empty by definition — see the header. */
export const CLASSES_WITH_NO_TRUE_PLACE: ReadonlySet<OwnerClass> = new Set<OwnerClass>([
  'futile',
  'not-a-place',
]);

/* ------------------------------------------------------------------------------------------- *
 * The corpus file
 * ------------------------------------------------------------------------------------------- */

export const TruePlaceSchema = z.object({
  /** The venue as a human would name it. Matched as a substring of the offered name after
   *  `normalise()`, so "Cafe Fiori" accepts "Cafe Fiori Tel Aviv-Yafo". */
  name: z.string().min(1),
  /** Optional regex, applied to `normalise(offered.name)`, replacing the substring rule entirely.
   *  Use it when a venue is known under two names or in two scripts. Write it lowercase. */
  pattern: z.string().min(1).optional(),
  /** Free text for the human reading the record. Never matched on. */
  note: z.string().optional(),
});

export const OwnerCaseSchema = z.object({
  url: z.string().min(1),
  /** Filled by the seeder from `canonicaliseTikTokUrl`; the stable key for every fixture. */
  externalId: z.string().nullable().optional(),
  /** THE label. `null` when the seeder could not even guess. */
  class: z.enum(OWNER_CLASSES).nullable().optional(),
  /**
   * Who ruled on `class`.
   *
   *  `draft`  a guess, adjudicated by nobody. Counts toward nothing.
   *  `owner`  the project owner, watching their own saved video. **The sample this file exists
   *           to produce**, and the only one whose distribution matches the product.
   *  `e7`     hand-labelled on 2026-08-18 in `docs/evidence/tiktok/07-caption-content-scoring.md`
   *           and `caption-sufficiency-trigger.manual.ts`, by watching the videos. Real labels,
   *           but on the **borrowed** 16-post web-search sample whose bias `07` documents about
   *           itself. Reported separately from `owner` and never merged into it — keeping those
   *           two apart is the entire point of this task.
   */
  classSource: z.enum(['draft', 'owner', 'e7']).default('draft'),
  /** The venues the post genuinely recommends, if the owner knows them. Optional for
   *  `futile`/`not-a-place`, where the empty set is entailed by the class. */
  places: z.array(TruePlaceSchema).optional(),
  placesSource: z.enum(['draft', 'owner', 'e7']).default('draft'),
  /** Overrides `INTENT_FOR_CLASS[class]` for this row. Only set it when the mapping is wrong. */
  expectedIntent: z.enum(POST_INTENTS).optional(),
  /** Copied in by the seeder so the owner can label without opening another file. Never matched
   *  on, never an input to any metric — the grader always re-reads the caption fixture. */
  caption: z.string().optional(),
  /**
   * The extraction fixture this case replays, written by the seeder.
   *
   * It exists so the grader can find the fixture **without building an extractor**. The filename
   * is keyed on the model and prompt version, so deriving it needs a `PlaceExtractor`, so deriving
   * it needs an API key — and a replay that needs a key to replay something it is not going to
   * call is not a replay. With this field a checkout with no credentials at all can grade the
   * extraction and intent half of the corpus, which is the whole point of committing fixtures.
   */
  extractionFixture: z.string().optional(),
  /** How the seeder arrived at its draft guess. Rewritten on every seed. */
  draftNote: z.string().optional(),
  /** The owner's own notes. Never touched by the seeder. */
  notes: z.string().optional(),
});

export const OwnerCorpusSchema = z.object({
  _readme: z.array(z.string()).optional(),
  cases: z.array(OwnerCaseSchema),
});

export type TruePlace = z.infer<typeof TruePlaceSchema>;
export type OwnerCase = z.infer<typeof OwnerCaseSchema>;
export type OwnerCorpus = z.infer<typeof OwnerCorpusSchema>;

export const CORPUS_PATH = fileURLToPath(new URL('./owner-corpus.json', import.meta.url));
export const LINKS_PATH = fileURLToPath(new URL('./owner-corpus-links.txt', import.meta.url));

export function readCorpus(): OwnerCorpus {
  return OwnerCorpusSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, 'utf8')));
}

/** One URL per line; blank lines and `#` comments ignored. The whole owner-facing input format. */
export function readLinks(): readonly string[] {
  if (!existsSync(LINKS_PATH)) return [];
  return readFileSync(LINKS_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** True when this row has been ruled on by a human and may enter a numerator or a denominator. */
export function classAdjudicated(c: OwnerCase): boolean {
  return c.classSource !== 'draft' && c.class !== null && c.class !== undefined;
}

/** Which sample an adjudicated row belongs to, or `null` when nobody has ruled on it. */
export function sampleOf(c: OwnerCase): 'owner' | 'e7' | null {
  return classAdjudicated(c) ? (c.classSource as 'owner' | 'e7') : null;
}

/**
 * The adjudicated true place set, or `null` when nobody has ruled. `null` is not the empty set and
 * must never be treated as one: "the owner listed no venues" and "the owner has not looked yet"
 * are the two answers this whole file exists to keep apart.
 */
export function truePlacesOf(c: OwnerCase): readonly TruePlace[] | null {
  if (c.placesSource !== 'draft') return c.places ?? [];
  if (classAdjudicated(c) && CLASSES_WITH_NO_TRUE_PLACE.has(c.class as OwnerClass)) return [];
  return null;
}

/** Does an offered place name match this expectation? Substring after `normalise`, or `pattern`. */
export function placeMatches(expected: TruePlace, offeredName: string): boolean {
  const subject = normalise(offeredName);
  if (expected.pattern !== undefined) return new RegExp(expected.pattern, 'iu').test(subject);
  return subject.includes(normalise(expected.name));
}

/* ------------------------------------------------------------------------------------------- *
 * The fixture store
 * ------------------------------------------------------------------------------------------- */

/**
 * `repo` (default) writes caption and extraction fixtures into `docs/evidence/extraction/`, where
 * they are committed and a replay can run in CI. `local` writes them into the gitignored
 * `docs/evidence/.local/` instead.
 *
 * **This is an owner decision and it is not ours to make.** `repo` puts the captions of the
 * owner's own saved TikToks into git history; that is what CI replay costs. Provider rows are not
 * affected either way — they are always local (see the file header).
 */
const FIXTURE_SCOPE = process.env.OWNER_CORPUS_FIXTURES === 'local' ? 'local' : 'repo';

const REPO_FIXTURES = fileURLToPath(
  new URL('../../docs/evidence/extraction/owner-corpus/', import.meta.url),
);
const LOCAL_FIXTURES = fileURLToPath(
  new URL('../../docs/evidence/.local/owner-corpus/', import.meta.url),
);

export const FIXTURE_ROOT = FIXTURE_SCOPE === 'local' ? LOCAL_FIXTURES : REPO_FIXTURES;
export const CAPTION_DIR = `${FIXTURE_ROOT}captions/`;
export const EXTRACTION_DIR = `${FIXTURE_ROOT}extractions/`;
/** Always gitignored — Google Service Specific Terms §5.4, 30-day lat/lng cache cap. */
export const PROVIDER_DIR = fileURLToPath(
  new URL('../../docs/evidence/.local/owner-corpus-provider/', import.meta.url),
);
export const RECORD_DIR = fileURLToPath(
  new URL('../../docs/evidence/extraction/owner-corpus/', import.meta.url),
);

export function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function safeKey(text: string): string {
  return text.replace(/[^a-zA-Z0-9._-]/gu, '_').slice(0, 100);
}

export function readFixture<T>(dir: string, file: string): T | null {
  const path = `${dir}${file}`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    // A corrupt fixture is a miss, never a silent pass. Loud, because the alternative is a run
    // that quietly measured fewer posts than it says it did.
    console.warn(`[owner-corpus] unreadable fixture ${dir}${file}; treating as absent`);
    return null;
  }
}

export function writeFixture(dir: string, file: string, payload: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${file}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/* ------------------------------------------------------------------------------------------- *
 * Stage 1 — the caption
 * ------------------------------------------------------------------------------------------- */

export interface CaptionFixture {
  readonly externalId: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string;
  /** Where the bytes came from. `e7-oembed-set1-raw` is the 16-post probe already committed at
   *  `docs/evidence/tiktok/oembed-set1-raw.json`; reusing it costs no network. */
  readonly origin: 'live-oembed' | 'e7-oembed-set1-raw';
  readonly fetchedAt: string;
}

export function captionFile(externalId: string): string {
  return `oembed-${safeKey(externalId)}.json`;
}

const E7_RAW_PATH = fileURLToPath(
  new URL('../../docs/evidence/tiktok/oembed-set1-raw.json', import.meta.url),
);

interface E7Row {
  readonly input?: string;
  readonly status?: number;
  readonly json?: {
    readonly title?: string;
    readonly author_unique_id?: string;
    readonly author_name?: string;
    readonly thumbnail_url?: string;
  };
}

/** The committed E7 probe, indexed by external id — a free caption source for the 16 posts every
 *  existing extraction number in this repo was measured on. */
export function e7Captions(): ReadonlyMap<string, CaptionFixture> {
  const out = new Map<string, CaptionFixture>();
  if (!existsSync(E7_RAW_PATH)) return out;
  const rows = JSON.parse(readFileSync(E7_RAW_PATH, 'utf8')) as readonly E7Row[];
  for (const row of rows) {
    const input = row.input ?? '';
    const id = /\/video\/(\d{17,20})/u.exec(input)?.[1];
    const title = row.json?.title;
    if (id === undefined || title === undefined || title.trim() === '') continue;
    out.set(id, {
      externalId: id,
      authorHandle: row.json?.author_unique_id ?? null,
      authorName: row.json?.author_name ?? null,
      canonicalUrl: input,
      thumbnailUrl: row.json?.thumbnail_url ?? null,
      caption: title,
      origin: 'e7-oembed-set1-raw',
      fetchedAt: 'unknown (committed probe, 2026-08-18)',
    });
  }
  return out;
}

/** The in-memory stand-in for `public.sources`, so the adapter's real fetch, parse and error
 *  mapping run while nothing is written to a database this harness does not own. Copied in shape
 *  from `tiktok-recognition.manual.ts`, for the same reason. */
function inMemorySourcesDb(externalId: string): unknown {
  const noop = { data: null, error: null };
  return {
    from(table: string) {
      if (table !== 'sources') throw new Error(`unexpected table ${table}`);
      const chain = {
        eq: () => chain,
        neq: () => Promise.resolve(noop),
        maybeSingle: () => Promise.resolve(noop),
        single: () => Promise.resolve({ data: { id: externalId }, error: null }),
        then: (onFulfilled?: ((v: typeof noop) => unknown) | null) =>
          Promise.resolve(noop).then(onFulfilled),
      };
      return {
        select: () => chain,
        upsert: () => Promise.resolve(noop),
        update: () => chain,
      };
    },
  };
}

export function ctxOf(
  onEvent?: (name: string, fields: Record<string, string | number | boolean>) => void,
): OpCtx {
  return {
    signal: AbortSignal.timeout(60_000),
    importId: null,
    log: { event: onEvent ?? (() => {}) },
  };
}

export type CaptionOutcome =
  | { readonly ok: true; readonly fixture: CaptionFixture; readonly from: 'fixture' | 'e7' | 'live' }
  | { readonly ok: false; readonly reason: string; readonly externalId: string | null };

/**
 * Caption for one URL, cheapest source first: the fixture store, then the committed E7 probe, then
 * a live oEmbed fetch — and only when `allowLive` says a live call is in budget.
 */
export async function getCaption(url: string, allowLive: boolean): Promise<CaptionOutcome> {
  const canonical = canonicaliseTikTokUrl(url);
  if (!canonical.ok) {
    return { ok: false, reason: `bad_url: ${canonical.error.code}`, externalId: null };
  }

  let externalId: string;
  if (canonical.value.kind === 'video') {
    externalId = canonical.value.externalId;
  } else {
    // A short link cannot be turned into an id without a network round trip, so it is only
    // resolvable on a live run. Paste `/video/<id>` links to keep the corpus replayable.
    if (!allowLive) {
      return {
        ok: false,
        reason: 'short_link_needs_live: a vt.tiktok.com/vm.tiktok.com link cannot be resolved offline',
        externalId: null,
      };
    }
    try {
      const adapter = oembedSourceAdapter(inMemorySourcesDb('pending') as never);
      externalId = (await adapter.resolveShortLink(canonical.value, ctxOf())).externalId;
    } catch (e) {
      const code = e instanceof DomainError ? e.code : String(e);
      return { ok: false, reason: `short_link_failed: ${code}`, externalId: null };
    }
  }

  const file = captionFile(externalId);
  const hit = readFixture<CaptionFixture>(CAPTION_DIR, file);
  if (hit !== null) return { ok: true, fixture: hit, from: 'fixture' };

  const e7 = e7Captions().get(externalId);
  if (e7 !== undefined) {
    writeFixture(CAPTION_DIR, file, e7);
    return { ok: true, fixture: e7, from: 'e7' };
  }

  if (!allowLive) {
    return {
      ok: false,
      reason: 'no_caption_fixture: nothing on disk for this post and live fetching is off',
      externalId,
    };
  }

  try {
    const raw = await oembedSourceAdapter(inMemorySourcesDb(externalId) as never).fetch(
      externalId,
      ctxOf(),
    );
    const caption = raw.texts.find((t) => t.kind === 'caption')?.text ?? '';
    const fixture: CaptionFixture = {
      externalId: raw.externalId,
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      canonicalUrl: raw.canonicalUrl,
      thumbnailUrl: raw.thumbnailUrl,
      caption,
      origin: 'live-oembed',
      fetchedAt: new Date().toISOString(),
    };
    // An empty caption is never written: `postUnavailable` treats a 400 as transient, and caching
    // an empty answer would turn one bad afternoon into a permanent hole in the corpus.
    if (caption.trim() !== '') writeFixture(CAPTION_DIR, file, fixture);
    return { ok: true, fixture, from: 'live' };
  } catch (e) {
    const code = e instanceof DomainError ? e.code : String(e);
    return { ok: false, reason: `oembed_failed: ${code}`, externalId };
  }
}

/** The shipped `RawSource` shape, rebuilt from a fixture so `captionContentExtractor` runs for
 *  real rather than being bypassed with a bare string. */
export function rawSourceOf(f: CaptionFixture): RawSource {
  return {
    id: f.externalId,
    externalId: f.externalId,
    authorHandle: f.authorHandle,
    authorName: f.authorName,
    canonicalUrl: f.canonicalUrl,
    thumbnailUrl: f.thumbnailUrl,
    texts: [{ kind: 'caption', text: f.caption }],
    media: [],
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Stage 2 — the extraction
 * ------------------------------------------------------------------------------------------- */

export interface ExtractionFixture {
  readonly candidates: readonly PlaceCandidate[];
  readonly cityHint: string | null;
  readonly postIntent: PostIntent | null;
  readonly extractorVersion: string;
  readonly promptVersion: string;
  readonly captionSha: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costUsd: number | null;
  readonly costModel: string | null;
  readonly extractedAt: string;
}

/** Keyed by everything that can change the answer — model, prompt, caption — and by nothing else.
 *  A prompt bump therefore invalidates every fixture, which is correct and is the point. */
export function extractionFile(extractor: PlaceExtractor, caption: string): string {
  return `extract-${safeKey(extractor.version)}-${safeKey(extractor.promptVersion)}-${sha(caption).slice(0, 16)}.json`;
}

export type ExtractionOutcome =
  | { readonly ok: true; readonly fixture: ExtractionFixture; readonly from: 'fixture' | 'live' }
  | { readonly ok: false; readonly reason: string };

export async function getExtraction(
  extractor: PlaceExtractor | null,
  caption: string,
  raw: RawSource,
  allowLive: boolean,
  /** The fixture the corpus already names for this case. Given, no extractor is needed to replay. */
  fixtureFile: string | null = null,
): Promise<ExtractionOutcome> {
  const file = fixtureFile ?? (extractor === null ? null : extractionFile(extractor, caption));
  if (file !== null) {
    const hit = readFixture<ExtractionFixture>(EXTRACTION_DIR, file);
    if (hit !== null) return { ok: true, fixture: hit, from: 'fixture' };
  }

  if (extractor === null) {
    return {
      ok: false,
      reason:
        file === null
          ? 'no_extractor: this case names no `extractionFixture` and an extraction filename is ' +
            'keyed on the model and prompt version, so with no extractor configured there is ' +
            'nothing to look for. Seed the case, or set LLM_PROVIDER=gemini and GEMINI_API_KEY.'
          : `no_extraction_fixture: ${file} is named by the corpus but is not on disk, and no ` +
            'extractor is configured to re-create it. Re-run the seeder.',
    };
  }
  if (!allowLive) {
    return {
      ok: false,
      reason: `no_extraction_fixture: ${file ?? '(unnamed)'} is not on disk and live model calls are off`,
    };
  }

  const cost: Record<string, string | number | boolean> = {};
  const ctx = ctxOf((name, fields) => {
    if (name === 'extraction.cost') Object.assign(cost, fields);
  });

  try {
    const parts = await captionContentExtractor.extract(raw, ctx);
    const out = await extractor.extract(parts, ctx);
    const fixture: ExtractionFixture = {
      candidates: out.candidates,
      cityHint: out.cityHint,
      postIntent: out.postIntent,
      extractorVersion: extractor.version,
      promptVersion: extractor.promptVersion,
      captionSha: sha(caption),
      inputTokens: typeof cost.inputTokens === 'number' ? cost.inputTokens : null,
      outputTokens: typeof cost.outputTokens === 'number' ? cost.outputTokens : null,
      costUsd: typeof cost.costUsd === 'number' ? cost.costUsd : null,
      costModel: typeof cost.costModel === 'string' ? cost.costModel : null,
      extractedAt: new Date().toISOString(),
    };
    writeFixture(EXTRACTION_DIR, extractionFile(extractor, caption), fixture);
    return { ok: true, fixture, from: 'live' };
  } catch (e) {
    const code = e instanceof DomainError ? e.code : e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `extraction_failed: ${code}` };
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Cost
 * ------------------------------------------------------------------------------------------- */

/**
 * Google Places Text Search (Pro) list price, **documented not measured**: ~$32 per 1,000
 * (`06-map-and-places-decision.md` §11, `scale.md`). The first 5,000 calls a month are free, so
 * the marginal cost of every run so far is genuinely $0 — the figure below is what a run would
 * cost once the free tier is gone, and the report says so rather than presenting it as a bill.
 */
export const GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP = 0.032;
export const GOOGLE_TEXT_SEARCH_FREE_PER_MONTH = 5000;

/**
 * The model's per-token price is deliberately **unknown** for the shipped Gemini adapter:
 * `integrations/llm/cost.ts` logs `costModel: 'unmeasured'` because no verified price is on
 * record. So this harness reports token counts and refuses to multiply them by a number nobody
 * has checked. Do not add a price here — add it to `cost.ts`, with its source, and it will flow.
 */
export const MODEL_PRICE_IS_UNMEASURED = true;
