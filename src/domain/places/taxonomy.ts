/**
 * **The category and tagging taxonomy** — owner specification, 2026-08-29.
 *
 * One closed vocabulary, in one file, so that the extractor, the map, the filter row and the
 * library index cannot each hold a different idea of what a saved place *is*. Before this there
 * were three overlapping answers and they disagreed in ways a user could see: a gelateria read
 * `Shop` on the review card and `Dessert` on the saved row one tap later, `bakery` was
 * simultaneously a category and a tag, and `מאפייה` was a third spelling of that same one concept.
 *
 * ## Two levels, and the split between them is the whole design
 *
 * **A primary category** is what the venue *is*. Exactly one, always from `PRIMARY_CATEGORIES`.
 * It is the coarse fact the product is built on: it colours the pin, it draws the icon, and it is
 * what the top filter chips offer. Three values is a deliberate floor, not a first draft — the map
 * needs a legend a person can hold in their head, and a legend of eight is not one.
 *
 * **A sub-tag** is what the venue is *like*. Zero, one or two, always from `SUB_TAGS`. This is the
 * discriminating power the three categories give up, handed back as a closed list rather than as
 * free text, because a library index is only worth anything if two imports six months apart put
 * the same place under the same label.
 *
 * ## Why the sub-tags are a closed list now, having been open by design before
 *
 * `extraction/tags.ts` shipped an open vocabulary on the owner's 2026-08-23 instruction, and the
 * argument for it was sound: a closed list cannot say `Natural wine` or `Hotel restaurant`, and
 * canonicalisation-in-code was enough to keep spellings from fragmenting. What it could not stop
 * was *facet* fragmentation, and the live rows measured it — 31 saved places produced a vocabulary
 * mixing cuisine (`italian`), dish (`pasta`, `matcha`, `בורקס`), venue type (`market stall`),
 * neighbourhood (`marylebone`, which `locality` already holds), vibe (`hidden gem`) and outright
 * noise (`בקר`, a typo of "morning" that reads as "beef"). Every one of those is a legitimate thing
 * to say about a place and none of them filters a library, because no two of them are the same
 * *kind* of statement. Canonicalisation made the strings agree; nothing made the concepts agree.
 *
 * The cost is stated rather than buried: `Natural wine`, `Rooftop`, `Hidden gem` and `Market stall`
 * are no longer expressible, and captions that say them will now produce no tag at all rather than
 * a wrong one. That is the right trade for an index and the wrong one for prose, which is why
 * `whyGo` and `dishes` still carry the caption's specifics and are untouched by this.
 *
 * ## Open at the top, closed at the bottom
 *
 * `PRIMARY_CATEGORIES` is expected to grow — hotels and nightlife events are already named as
 * likely — and everything downstream derives from the array rather than restating it, so a fourth
 * value is one edit here plus whatever new pin colour it needs. What must *not* happen is a value
 * arriving in only one of the two vocabularies, so the display vocabulary in
 * `product-category.ts` proves the superset relation at compile time.
 *
 * ## What this file is not
 *
 * It is not the display vocabulary. `ProductCategory` still carries eight values and still must:
 * it renders rows saved before today (`dessert`, `shop`, `attraction`, `other`) and it reads the
 * resolver's provider category, which is Google's taxonomy and not ours. A place can therefore
 * *display* as `Dessert` while nothing new is ever *extracted* as one — see
 * `product-category.ts`'s header for why those two vocabularies are separate types on purpose.
 */

/**
 * The primary categories, in the order they are listed wherever the whole set is shown.
 *
 * Bakeries, patisseries, ice cream and dessert shops fold into `cafe`, per the specification: they
 * are places you sit down or stop at for something sweet, and splitting them off bought a fourth
 * pin colour for a distinction the filter row does not need. `bar` is evening drinks — cocktail
 * bars, wine bars, pubs, speakeasies — and each of those four keeps its own identity as a sub-tag.
 */
export const PRIMARY_CATEGORIES = ['restaurant', 'cafe', 'bar'] as const;

export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];

/** What each primary category covers, in the words the extraction prompt uses. One sentence each,
 *  because the prompt is generated from this rather than restating it — a category whose
 *  definition lives in two places is a category that will be defined two ways. */
export const PRIMARY_CATEGORY_SCOPE: Readonly<Record<PrimaryCategory, string>> = {
  restaurant: 'a place whose business is serving meals — casual through fine dining',
  cafe: 'coffee, bakeries, patisseries, ice cream and desserts — anywhere the reason to go is a drink or something sweet',
  bar: 'drinks in the evening — cocktail bars, wine bars, pubs, speakeasies',
};

export function isPrimaryCategory(value: unknown): value is PrimaryCategory {
  return typeof value === 'string' && (PRIMARY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The sub-tag whitelist: **stored key → display label**.
 *
 * The key is the string that reaches the database, and it is `tags.ts`'s `tagKey` of the label —
 * lowercased, accent-folded, punctuation-stripped. That relation is not a convention anyone has to
 * remember: `tests/unit/places/taxonomy.test.ts` asserts `tagKey(label) === key` for every
 * entry, so a label that does not canonicalise to its own key fails the build rather than storing
 * a tag no filter can find. It is why `Beer & Pub` is keyed `beer pub` — `normalise` drops the
 * ampersand — and why the label cannot simply be derived by title-casing the key.
 *
 * The model is shown the **labels**; the pipeline stores the **keys**.
 */
export const SUB_TAGS = {
  // — cuisines and dining styles, mostly for `restaurant` —
  italian: 'Italian',
  japanese: 'Japanese',
  asian: 'Asian',
  'middle eastern': 'Middle Eastern',
  mexican: 'Mexican',
  american: 'American',
  mediterranean: 'Mediterranean',
  // — sub-vibes and specialities, mostly for `cafe` and `bar` —
  bakery: 'Bakery',
  desserts: 'Desserts',
  'specialty coffee': 'Specialty Coffee',
  brunch: 'Brunch',
  cocktails: 'Cocktails',
  'wine bar': 'Wine Bar',
  'beer pub': 'Beer & Pub',
  speakeasy: 'Speakeasy',
} as const satisfies Readonly<Record<string, string>>;

export type SubTag = keyof typeof SUB_TAGS;

/** The keys, in specification order. The one thing that iterates the vocabulary. */
export const SUB_TAG_KEYS = Object.keys(SUB_TAGS) as readonly SubTag[];

/** The labels the model is offered, in the same order. */
export const SUB_TAG_LABELS: readonly string[] = SUB_TAG_KEYS.map((key) => SUB_TAGS[key]);

/**
 * At most two sub-tags on one place.
 *
 * Two rather than "as many as apply", and the reason is the chip row rather than the data: a place
 * carrying five labels stops being findable *by* any of them, because the row that renders them
 * truncates and the two that survive are whichever the model happened to emit first. Two is the
 * most a saved row shows without wrapping at 375 px, which is the width this product is designed
 * for.
 */
export const MAX_SUB_TAGS_PER_PLACE = 2;

/**
 * Spelling variants of the *listed* labels, and nothing else.
 *
 * The model is given the whitelist verbatim and told to copy from it; this is the small allowance
 * for it writing the same word slightly differently — a plural where the list has a singular, or
 * the ampersand in `Beer & Pub` spelled out. Each entry is the identical concept under a different
 * spelling, which is what separates it from a guess: `Cocktail` **is** `Cocktails`, whereas
 * `Natural wine` is not `Wine Bar` and must be dropped rather than rounded to its nearest
 * neighbour. Rounding is how a closed vocabulary quietly becomes an open one again.
 *
 * Keys are already `tagKey`-canonical, so a lookup happens after normalisation.
 */
const SUB_TAG_ALIASES: Readonly<Record<string, SubTag>> = {
  'beer and pub': 'beer pub',
  dessert: 'desserts',
  cocktail: 'cocktails',
  bakeries: 'bakery',
};

/** The whitelist entry a canonicalised tag belongs to, or `null` if it is not in the vocabulary. */
export function resolveSubTag(canonical: string): SubTag | null {
  if (isSubTag(canonical)) return canonical;
  return SUB_TAG_ALIASES[canonical] ?? null;
}

export function isSubTag(value: unknown): value is SubTag {
  return typeof value === 'string' && Object.hasOwn(SUB_TAGS, value);
}

/** How a stored sub-tag is written for a human. Falls back to the stored string for a tag saved
 *  before this vocabulary closed — those rows still exist and still render. */
export function subTagLabel(stored: string): string | null {
  return isSubTag(stored) ? SUB_TAGS[stored] : null;
}
