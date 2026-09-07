/**
 * The review card shows the tags the save is about to write — task `r3-tags-ui`, finding 2 of
 * `docs/archive/product-review-2026-08-31-r3.md`.
 *
 * **The ruling these guards protect is "show them, do not ask."** Every other fact on this card is
 * *stated* — the category, the address, the resolved name, where the pin came from — and pressing
 * Save is what confirms them. Tags were the one fact that was neither stated nor confirmable: they
 * were written on every import and rendered on no screen until the place was already on the map,
 * which is precisely the unconfirmed assertion `docs/archive/product-edge-2026-08-31.md` says this product
 * exists not to make. Showing them raises tags to the screen's existing standard rather than
 * inventing a second, higher one for a single field on the surface
 * `docs/archive/ui-review-2026-08-31.md` finding 11 already measures as the least responsive in the product.
 *
 * **That ruling is what licenses the database write**, and this is why these are not cosmetic
 * guards. `api/imports/confirm/route.ts` stamps `saved_places.tags_confirmed_at` — a record that
 * the user asserted this vocabulary — on the sole basis that this card rendered it first. Three
 * things therefore have to stay true, and each has a guard below:
 *
 *  1. The tags render **unconditionally** when there are any. Put them behind a disclosure, as the
 *     note and the shortlist quite rightly are, and the stamp becomes a claim about something the
 *     user may never have opened.
 *  2. **Both layouts** render them. The collapsed single-result layout deletes the card, so a tag
 *     row written only into the full card would leave the most *confident* result the one that
 *     saved tags silently.
 *  3. The array comes from `deriveSavedPlaceEnrichment` — the same call `confirmOne` writes with —
 *     not from a second reading of `candidate.tags`, which would look identical and be free to
 *     drift from what actually reaches the column.
 *
 * Source guards, which is the instrument this directory uses for its screens (there is no DOM
 * renderer in this suite). The rendered result was measured in a browser instead, at both gate
 * viewports, and is reported with the task.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SUB_TAG_KEYS, SUB_TAGS } from '@/domain/places/taxonomy';
import { MAX_TAGS_PER_CANDIDATE, tagDisplayLabel } from '@/domain/extraction/tags';

const CARD_PATH = 'src/app/import/screens/review/candidate-card.tsx';
const ROUTE_PATH = 'src/app/api/imports/confirm/route.ts';

/** Source with comments removed — this codebase documents the decisions it made *by name*, and a
 *  scan that read prose would match its own explanation. `review-note.test.ts`'s rule. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the review card shows what the save will file the place under', () => {
  it('derives the tags from the same function the confirm route writes with', () => {
    const card = code(CARD_PATH);

    expect(card).toContain('deriveSavedPlaceEnrichment(candidate)?.tags');
    // The near-miss that would pass every other guard in this file: identical on screen today,
    // and free to diverge from the column the moment either side gains a rule.
    expect(card).not.toContain('candidate.tags');

    // And the route's stamp reads the same object rather than re-deriving it.
    expect(code(ROUTE_PATH)).toContain('enrichment?.tags');
  });

  it('renders them with no disclosure in front of them', () => {
    const card = code(CARD_PATH);

    // The one condition on the row is "there are some". `noteOpen` and `optionsOpen` gate the two
    // blocks either side of it, on purpose; a third state variable here would silently remove the
    // basis for the stamp.
    expect(card).toContain('const tagRow = proposedTags.length > 0 && (');
    expect(card).not.toMatch(/tagsOpen|showTags|setTagsOpen/);
  });

  it('renders them in the collapsed layout too, not only on the full card', () => {
    const card = code(CARD_PATH);

    // Twice: once inside `body` (the full card) and once in the collapsed `<li>`, which has no
    // `body` because the screen's own H1 carries the name. One occurrence means one layout saves
    // tags without showing them — and it would be the *confident* one.
    expect(card.match(/\{tagRow\}/g)).toHaveLength(2);
  });

  it('caps the row at three chips and counts the remainder rather than dropping it', () => {
    const card = code(CARD_PATH);

    // The cap itself (`ux-overwhelm-audit-2026-09-02.md` §7 item 13).
    expect(card).toContain('const MAX_PROPOSED_TAGS_SHOWN = 3');
    expect(card).toContain('proposedTags.slice(0, MAX_PROPOSED_TAGS_SHOWN)');

    // **The consent argument is what makes the `+N` mandatory rather than decorative.** The stamp
    // on `tags_confirmed_at` rests on this row having shown what the save will write; a silent
    // truncation would file a word nobody was told about. The remainder is therefore counted on
    // screen, inside the same tickbox, and never merely dropped.
    expect(card).toContain('hiddenTagCount');
    expect(card).toContain('+{hiddenTagCount}');
    expect(card).not.toMatch(/slice\(0, \d\)/);
  });

  it('cannot be reached by any candidate the extractor can produce today', () => {
    // **The audit that asked for the cap counted six pills per card. The data ceiling is two.**
    // `normaliseTags` truncates to `MAX_TAGS_PER_CANDIDATE` before storage, so the slice above does
    // not bind on anything the probe can return, and the `+N` branch is unreachable in production
    // as the numbers stand.
    //
    // Pinned as a relationship rather than as two literals: the point is not that 3 > 2 today, it
    // is that **the display cap must never fall below the data cap**, because the gap between them
    // is exactly the set of tags that would be written without being shown. If someone raises the
    // taxonomy's ceiling, this fails and sends them to the card.
    expect(MAX_TAGS_PER_CANDIDATE).toBe(2);
    expect(MAX_TAGS_PER_CANDIDATE).toBeLessThanOrEqual(3);
  });

  it('uses the library’s own render rule for a stored tag, not a local casing pass', () => {
    const card = code(CARD_PATH);

    // Stored tags are lowercase keys (`specialty coffee`); casing is a render concern owned by
    // `domain/extraction/tags.ts`. A `toUpperCase` here would be a second answer to it.
    expect(card).toContain('tagDisplayLabel(tag)');
    expect(card).not.toMatch(/toUpperCase|charAt\(0\)/);
    // The same token pair the sheet's chips use. "See what will be stored" is only true if the
    // chip on this screen is the chip in the library.
    expect(card).toContain('bg-tag');
    expect(card).toContain('text-tag-foreground');
  });

  it('says “tag” by rendering the whitelist’s own labels and inventing no word for them', () => {
    const card = code(CARD_PATH);

    // `voice-and-vocabulary.md` §3: the noun is **tag** — never label, keyword or sub-tag. The row
    // ships no heading at all (chips in this product are tags), so the only user-facing strings it
    // can produce are `SUB_TAGS`' own labels. This asserts that rather than assuming it.
    expect(card).not.toMatch(/["'](Labels?|Keywords?|Sub-tags?|Topics?)["']/);

    // So the only user-facing strings this row can produce are `tagDisplayLabel` of a stored key.
    // Pinned as the **set that differs from the whitelist's own label**, not as "they all match",
    // because one does not — and asserting the tidier claim is how a divergence like this stays
    // invisible. `beer pub` is keyed that way because `normalise` drops the ampersand
    // (`taxonomy.ts`'s own note), and `tagDisplayLabel` title-cases the key rather than looking the
    // label up — so the model is offered `Beer & Pub` and every surface in the product renders
    // `Beer Pub`. Pre-existing and consistent across the sheet, the filter chips and now this card;
    // found by this guard on 2026-09-01 and reported rather than fixed, because the fix is in
    // `domain/**`, which this task does not own.
    const diverging = SUB_TAG_KEYS.filter((key) => tagDisplayLabel(key) !== SUB_TAGS[key]);
    expect(diverging).toEqual(['beer pub']);
  });
});
