/**
 * **The search intent, and the clamp** — `docs/nls-plan.md` §2.1 and §4.1, Stage 1.
 *
 * A sentence goes to a small model; the model answers with an *intent* — a category, up to two
 * sub-tags, a visit state, an origin and a keyword — and the deterministic filter code that
 * already ships does the filtering. The model never returns places, and it never gets to invent a
 * filter value: everything below is enum-shaped against `places/taxonomy.ts`, and then clamped
 * against the vocabulary of **this user's** library.
 *
 * ## The clamp is the design, not a validation nicety
 *
 * An intent may only select values that exist in the library it will be applied to. Three
 * properties follow, and they are the reason this file is pure and has a test for every branch:
 *
 *  - **A hallucinated filter can never be the reason a list is empty.** Every value that survives
 *    had rows behind it *before* combination, so an empty result is a genuine combination problem
 *    ("Italian bars you have not been to") rather than a fabrication the user cannot see.
 *  - **Prompt injection is structurally inert.** The model's whole output space is four enums and
 *    one string; a caption or a query telling it to "list every place" can at most produce enum
 *    values, and a value with nothing behind it never renders. Golden case `nls-020` is exactly
 *    that attack and it is scored as a gate.
 *  - **The keyword stays the user's own words.** `keyword` is the one free-text field, and it is
 *    admitted only when it is genuinely *in* the query the user typed — see `groundKeyword`. A
 *    keyword the model composed, translated or invented is dropped. That is the same
 *    extracted-vs-inferred line `domain/extraction/grounding.ts` draws for dishes.
 *
 * ## Applied twice, on purpose
 *
 * Once server-side against the vocabulary the client sent (which is itself untrusted and is
 * intersected with the closed taxonomy first — `sanitiseVocabulary`), and once client-side against
 * the live facets before render. The second pass costs one `filter()` and closes the window where
 * the library changed between the two.
 *
 * ## No I/O, no React, no model
 *
 * Everything here is a pure function over plain data. The adapter
 * (`integrations/llm/query-intent.ts`) produces the raw reply; this file decides what any of it is
 * allowed to mean.
 */

import { canonicaliseTag } from '@/domain/extraction/tags';
import { normalise } from '@/domain/places/normalise';
import {
  MAX_SUB_TAGS_PER_PLACE,
  PRIMARY_CATEGORIES,
  isPrimaryCategory,
  resolveSubTag,
  type PrimaryCategory,
  type SubTag,
} from '@/domain/places/taxonomy';

/**
 * Bumped whenever the *shape* below changes — a field added, removed or re-typed.
 *
 * Separate from `INTENT_PROMPT_VERSION` (the adapter's), because the two move for different
 * reasons: a prompt reword changes what the model says, a schema change changes what an intent
 * *is*. Both are recorded on a run so a benchmark number can be traced to the pair that produced
 * it.
 */
export const SEARCH_INTENT_SCHEMA_VERSION = 'nls-intent-v1';

/**
 * The visit axis, restated here rather than imported.
 *
 * `VisitFilter` lives in `src/ui/place/visit-state.ts` and `domain/` may not import `ui/`
 * (`eslint.config.mjs`'s layer zones, proved by `scripts/check-layer-guard.sh`). The three strings
 * are identical by construction and `tests/unit/search/intent.test.ts` holds them to that with a
 * compile-time assignability assertion in both directions — that test may import both layers, this
 * module may not. Moving `VisitFilter` into `domain/` is the right long-term answer and it is
 * `nextjs-architect`'s file to move, not this lane's.
 */
export const SEARCH_VISIT_VALUES = ['all', 'not-been', 'been'] as const;
export type IntentVisit = (typeof SEARCH_VISIT_VALUES)[number];

/**
 * The origin axis — `saved_places.origin`, `import` | `manual` (`nls-plan.md` §4.2).
 *
 * Included because it is the only *real* second provenance axis: `sources.platform` is
 * `CHECK IN ('tiktok')`, a single value, and cannot discriminate anything.
 *
 * **It has no executor today, and that is stated rather than hidden.** `Spot` does not expose
 * `origin` (`app/map/_lib/get-spots.ts` does not select it) and there is no `filterByOrigin`, so
 * a caller has no way to declare `origins: ['import','manual']` truthfully. The clamp therefore
 * collapses this field to `'all'` for every caller that exists right now — which is the correct
 * behaviour, not a stub: an axis with no rows behind it is exactly what the clamp is for. When the
 * read path grows the column, declaring it in the vocabulary is the whole of the change here.
 */
export const SEARCH_ORIGIN_VALUES = ['all', 'import', 'manual'] as const;
export type IntentOrigin = (typeof SEARCH_ORIGIN_VALUES)[number];

/** The longest keyword we will carry. A query is capped well below this upstream; this is the
 *  belt on a model that decides to answer with an essay. Over-long is dropped, never truncated —
 *  a keyword cut mid-word is a wrong filter, not a shorter one (`tags.ts` makes the same call). */
export const MAX_KEYWORD_LENGTH = 80;

/**
 * What the user asked for, expressed only in values this product can execute.
 *
 * Every field is total: `null` and `'all'` are real answers meaning "the user did not say", never
 * "we failed". `tags` is `readonly SubTag[]` of length 0–2.
 */
export interface SearchIntent {
  readonly category: PrimaryCategory | null;
  readonly tags: readonly SubTag[];
  readonly visit: IntentVisit;
  readonly origin: IntentOrigin;
  readonly keyword: string | null;
}

/** The intent that filters nothing. What an unreadable reply, an empty query and a fully clamped
 *  answer all collapse to — one "nothing understood" state, not three. */
export const EMPTY_INTENT: SearchIntent = {
  category: null,
  tags: [],
  visit: 'all',
  origin: 'all',
  keyword: null,
};

/** Whether an intent would narrow anything at all. The panel's "nothing understood" state is this
 *  predicate, and it is deliberately here rather than in the surface: "the model said nothing
 *  usable" and "the clamp removed everything it said" must be one screen, and they are only one
 *  screen if one function decides. */
export function isEmptyIntent(intent: SearchIntent): boolean {
  return (
    intent.category === null &&
    intent.tags.length === 0 &&
    intent.visit === 'all' &&
    intent.origin === 'all' &&
    intent.keyword === null
  );
}

/**
 * The values that have rows behind them in the library the intent will be applied to.
 *
 * Sent by the client and therefore **untrusted** — `sanitiseVocabulary` intersects it with the
 * closed taxonomy before the clamp ever reads it, so a caller cannot widen its own vocabulary into
 * accepting a value the product does not have.
 *
 * An empty array means "no rows carry any value on this axis", which clamps that whole axis away.
 * That is why the fields are required rather than optional: a caller that forgets to send `tags`
 * gets no tags, which is the safe direction.
 */
export interface LibraryVocabulary {
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  /** Which of `been` / `not-been` actually has rows. `all` is not listed; it is the resting
   *  state and is always available. */
  readonly visit: readonly string[];
  /** Which of `import` / `manual` actually has rows. See `SEARCH_ORIGIN_VALUES` — no caller can
   *  populate this yet. */
  readonly origins: readonly string[];
}

/** The vocabulary of a library with nothing in it. Everything clamps away. */
export const EMPTY_VOCABULARY: LibraryVocabulary = {
  categories: [],
  tags: [],
  visit: [],
  origins: [],
};

export type IntentField = 'category' | 'tags' | 'visit' | 'origin' | 'keyword';

/**
 * Why a value the model emitted did not survive.
 *
 *  - `not-in-vocabulary` — not a member of the closed taxonomy at all. The model invented it.
 *  - `not-in-library`    — a real value, but this user has no row carrying it.
 *  - `duplicate`         — the same tag twice, after canonicalisation.
 *  - `over-cap`          — a third tag; `MAX_SUB_TAGS_PER_PLACE` is two.
 *  - `not-in-query`      — a keyword that is not in the sentence the user typed.
 */
export type IntentDropReason =
  | 'not-in-vocabulary'
  | 'not-in-library'
  | 'duplicate'
  | 'over-cap'
  | 'not-in-query';

export interface DroppedIntentValue {
  readonly field: IntentField;
  /** The offending value, already bounded in length. Safe to log: it is either an enum member or
   *  a fragment of the user's own query, never a model sentence. */
  readonly value: string;
  readonly reason: IntentDropReason;
}

export interface ClampResult {
  readonly intent: SearchIntent;
  /** Everything removed, in the order it was removed. The benchmark scores `not-in-vocabulary`
   *  and `not-in-library` as *caught* false filters; the UI shows none of this. */
  readonly dropped: readonly DroppedIntentValue[];
}

/** The raw shape an adapter hands over. Every field `unknown`: this is a parsed model reply and
 *  nothing about it is guaranteed, including that it is an object. */
export interface RawIntentReply {
  readonly category?: unknown;
  readonly tags?: unknown;
  readonly visit?: unknown;
  readonly origin?: unknown;
  readonly keyword?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Bound anything before it is put in a drop record or a log line. */
function short(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * The client's claim about its own library, reduced to values this product actually has.
 *
 * Categories and tags are canonicalised the same way the model's answer will be, so
 * `Italian`, `italian` and `ITALIAN` are one vocabulary entry — otherwise the clamp would drop a
 * correct tag because the facet was spelled differently, which is the failure mode that looks
 * exactly like a model error and is not one.
 */
export function sanitiseVocabulary(raw: unknown): LibraryVocabulary {
  const source = (raw ?? {}) as Partial<Record<keyof LibraryVocabulary, unknown>>;
  const list = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  const categories = new Set<string>();
  for (const value of list(source.categories)) {
    const key = normalise(value);
    if (isPrimaryCategory(key)) categories.add(key);
  }

  const tags = new Set<string>();
  for (const value of list(source.tags)) {
    const resolved = toSubTag(value);
    if (resolved !== null) tags.add(resolved);
  }

  const visit = new Set<string>();
  for (const value of list(source.visit)) {
    const key = normalise(value).replace(/\s+/g, '-');
    if (key === 'been' || key === 'not-been') visit.add(key);
  }

  const origins = new Set<string>();
  for (const value of list(source.origins)) {
    const key = normalise(value);
    if (key === 'import' || key === 'manual') origins.add(key);
  }

  return {
    categories: [...categories],
    tags: [...tags],
    visit: [...visit],
    origins: [...origins],
  };
}

/**
 * One model-emitted tag, reduced to a whitelist key or `null`.
 *
 * Reuses `canonicaliseTag` + `resolveSubTag` rather than string-comparing, so the intent path and
 * the extraction path agree on what a tag *is*: the same alias table admits `pizza` → `italian`
 * and `מאפייה` → `bakery`, and the same rule refuses `natural wine`. Two vocabularies of one
 * concept is the defect `taxonomy.ts` was written to end, and a second matcher here would restore
 * it.
 */
function toSubTag(raw: string): SubTag | null {
  const cleaned = canonicaliseTag(raw);
  if (cleaned === null) return null;
  return resolveSubTag(cleaned);
}

/**
 * Whether a keyword is really the user's own words.
 *
 * The prompt says "copied verbatim, never translated", and this is the check that makes that a
 * property rather than a request. Comparison is on `normalise()` output — case, accents and
 * punctuation folded, so `Pistachio Croissant` from `the place with the pistachio croissant`
 * survives and `שניצל` from `schnitzel` does not.
 *
 * **Why refuse a translation the user might have wanted.** `filterBySearch` is a substring match
 * over the library's own strings; a translated keyword is the model asserting an equivalence
 * nothing checked, and when it is wrong it silently hides the row the user asked for — the same
 * cost the "never invent a filter" rule is priced against. Cross-language keyword matching is
 * Stage 3's problem (`nls-plan.md` §8) and it is expected to arrive as *expansion*: several
 * candidate keywords, all matched, each able to say why. One quiet substitution is not that.
 */
export function isKeywordGrounded(keyword: string, query: string): boolean {
  const needle = normalise(keyword);
  if (needle === '') return false;
  return normalise(query).includes(needle);
}

/**
 * The clamp. A raw model reply plus the library it will run against, in; an intent this product
 * can execute, out.
 *
 * `query` is the sentence the user typed, and it is required rather than optional because
 * `keyword` cannot be checked without it — an overload that let a caller skip it would be a
 * grounding check that is off by default.
 *
 * Total: it never throws, and every unreadable input maps to `EMPTY_INTENT` with the reason
 * recorded.
 */
export function clampIntent(
  raw: unknown,
  vocabulary: LibraryVocabulary,
  query: string,
): ClampResult {
  const dropped: DroppedIntentValue[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { intent: EMPTY_INTENT, dropped };
  }
  const reply = raw as RawIntentReply;

  // — category —
  let category: PrimaryCategory | null = null;
  const rawCategory = asString(reply.category);
  if (rawCategory !== null) {
    const key = normalise(rawCategory);
    if (!isPrimaryCategory(key)) {
      dropped.push({ field: 'category', value: short(rawCategory), reason: 'not-in-vocabulary' });
    } else if (!vocabulary.categories.includes(key)) {
      dropped.push({ field: 'category', value: key, reason: 'not-in-library' });
    } else {
      category = key;
    }
  }

  // — tags —
  const tags: SubTag[] = [];
  const rawTags: readonly unknown[] = Array.isArray(reply.tags) ? reply.tags : [];
  for (const item of rawTags) {
    const text = asString(item);
    if (text === null) continue;
    const resolved = toSubTag(text);
    if (resolved === null) {
      dropped.push({ field: 'tags', value: short(text), reason: 'not-in-vocabulary' });
      continue;
    }
    if (!vocabulary.tags.includes(resolved)) {
      dropped.push({ field: 'tags', value: resolved, reason: 'not-in-library' });
      continue;
    }
    if (tags.includes(resolved)) {
      dropped.push({ field: 'tags', value: resolved, reason: 'duplicate' });
      continue;
    }
    if (tags.length >= MAX_SUB_TAGS_PER_PLACE) {
      dropped.push({ field: 'tags', value: resolved, reason: 'over-cap' });
      continue;
    }
    tags.push(resolved);
  }

  // — visit —
  let visit: IntentVisit = 'all';
  const rawVisit = asString(reply.visit);
  if (rawVisit !== null && normalise(rawVisit).replace(/\s+/g, '-') !== 'all') {
    const key = normalise(rawVisit).replace(/\s+/g, '-');
    if (key !== 'been' && key !== 'not-been') {
      dropped.push({ field: 'visit', value: short(rawVisit), reason: 'not-in-vocabulary' });
    } else if (!vocabulary.visit.includes(key)) {
      dropped.push({ field: 'visit', value: key, reason: 'not-in-library' });
    } else {
      visit = key;
    }
  }

  // — origin —
  let origin: IntentOrigin = 'all';
  const rawOrigin = asString(reply.origin);
  if (rawOrigin !== null && normalise(rawOrigin) !== 'all') {
    const key = normalise(rawOrigin);
    if (key !== 'import' && key !== 'manual') {
      dropped.push({ field: 'origin', value: short(rawOrigin), reason: 'not-in-vocabulary' });
    } else if (!vocabulary.origins.includes(key)) {
      dropped.push({ field: 'origin', value: key, reason: 'not-in-library' });
    } else {
      origin = key;
    }
  }

  // — keyword —
  let keyword: string | null = null;
  const rawKeyword = asString(reply.keyword);
  if (rawKeyword !== null) {
    if (rawKeyword.length > MAX_KEYWORD_LENGTH) {
      dropped.push({ field: 'keyword', value: short(rawKeyword), reason: 'not-in-vocabulary' });
    } else if (!isKeywordGrounded(rawKeyword, query)) {
      dropped.push({ field: 'keyword', value: short(rawKeyword), reason: 'not-in-query' });
    } else {
      keyword = rawKeyword;
    }
  }

  return { intent: { category, tags, visit, origin, keyword }, dropped };
}

/** The three categories, for a caller building the prompt or a facet list. Re-exported so the
 *  adapter has one import for the whole intent vocabulary. */
export const INTENT_CATEGORIES = PRIMARY_CATEGORIES;
