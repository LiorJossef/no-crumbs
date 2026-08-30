/**
 * The pure half of manual add — what the typed name has to satisfy, what we ask the provider, and
 * the one decision that must never be taken loosely: whether there is anything real to save.
 *
 * Split out of `manual-add.ts` because that file carries `'use server'`, and a `'use server'`
 * module may only export async functions. These three are the parts worth asserting without a
 * database, a network or a session, so they live one file across.
 */

import { validateDisplayName } from '@/domain/places/display-name';
import type { RankedPlace, ResolveQuery, ResolveResult } from '@/domain/types';

/** Typed nothing, or typed only spaces. Not an error the server invented — the row that submits
 *  this is offered even with an empty field (`add-sheet.tsx`), so "" is a reachable state. */
export const NEEDS_A_NAME = 'Type the place’s name first.';

export type ManualNameValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * The name to look up.
 *
 * Delegates to `validateDisplayName` rather than growing a second rule: that function already owns
 * "what a place name may be here" (trimmed, interior whitespace collapsed, 200 characters, the
 * same number `saved_places_display_name_check` uses). The one thing it does differently is that
 * an empty string is legal there — it means *go back to the real name* — and here it is the user
 * pressing a button with nothing typed, which has no answer but to say so.
 */
export function validateManualName(raw: string): ManualNameValidation {
  const validated = validateDisplayName(raw);
  if (!validated.ok) return { ok: false, message: validated.message };
  if (validated.value === null) return { ok: false, message: NEEDS_A_NAME };
  return { ok: true, value: validated.value };
}

/**
 * What we ask the resolver, from what the user typed and nothing else.
 *
 * Every hint is `null`, deliberately. The import path fills `cityHint`/`countryHint`/`categoryHint`
 * from an extraction — facts a caption stated. Here there is no caption, so the only fact is the
 * string in the field. The map's current viewport was available and is **not** used: a user typing
 * a Lisbon restaurant while looking at Tel Aviv would have the camera silently narrow their search,
 * and "where you happen to be looking" is not something they said. If they want the city in the
 * query they can type it, and Google's Text Search reads `Cafe Levinsky Tel Aviv` as one string.
 */
export function manualAddQuery(name: string): ResolveQuery {
  return {
    text: name,
    cityHint: null,
    countryHint: null,
    categoryHint: null,
    near: null,
    maxResults: null,
  };
}

export type ManualPlaceChoice =
  | { readonly kind: 'save'; readonly ranked: RankedPlace }
  | { readonly kind: 'not_found' };

/**
 * Whether the provider's answer contains a place to save.
 *
 * **An empty shortlist is a terminal, honest state and never a reason to invent a coordinate.**
 * The import path has a fallback when resolution fails — the model's own guessed point, saved under
 * `provider: 'llm_guess'` and drawn with a dashed ring — and manual add deliberately has no
 * equivalent, because there is nothing to fall back *to*: nobody guessed a coordinate for a name
 * someone typed. A city centroid, a country centroid or the map's current centre would each look
 * exactly like a real pin. So: nothing found, nothing saved, and the user is told.
 *
 * The band is **not** a gate here, and that is a judgement rather than an oversight. `no_match`
 * (top score under 0.8) is a statement about how well the provider's row matches the *string*, and
 * a user typing a half-remembered name is exactly the case that scores badly while still returning
 * the venue they meant. What protects them is not a refusal, it is that the save is legible and
 * reversible: the place is named back to them, its detail card opens on the map, `resolution_score`
 * records how weak the match was, and Remove is one tap. Refusing on band would turn "we are not
 * sure" into "we found nothing", which is the same lie in the other direction.
 */
export function chooseManualPlace(result: ResolveResult): ManualPlaceChoice {
  const top = result.shortlist[0];
  return top === undefined ? { kind: 'not_found' } : { kind: 'save', ranked: top };
}
