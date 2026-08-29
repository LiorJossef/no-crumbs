/**
 * The vocabulary of a collection: a named, shareable container of places, and the rules about what
 * a member of one may do.
 *
 * ## Why a collection holds *places*, not *saved places*
 *
 * A saved place is a per-user row and carries a private overlay — the user's note, their been /
 * not-been mark, the TikTok that made them save it. If a collection item pointed at that row, then
 * sharing a collection would mean handing a collaborator someone else's private column set, and
 * every `saved_places` policy would have to move from `user_id = auth.uid()` to a membership test.
 * Pointing at `places` instead — the shared, canonical identity row — keeps the entire private
 * overlay out of the sharing path, so exactly one new read is opened (`places`, migration `0024`)
 * and nothing about anybody's library becomes visible to anybody else.
 *
 * The concrete rule that follows, and it is a privacy decision rather than an implementation
 * detail: **`visit_state` does not travel.** Sharing "I want to go here" discloses *future*
 * location intent, which is a stronger disclosure than a past visit, and no collection surface
 * shows it.
 *
 * ## Roles
 *
 * Three, and the middle one is the point: `editor` is what makes a collection collaborative rather
 * than merely visible. `viewer` exists because "here, look at my list" is a real and common ask
 * that should not require handing over write access. `owner` is exactly one person per collection
 * (a partial unique index in `0024` enforces it) and is the only role that can rename, delete,
 * share, or change who else is in.
 */

/** `collection_members.role`'s three values, verbatim (migration `0024`'s CHECK). */
export type CollectionRole = 'owner' | 'editor' | 'viewer';

/** The two roles an invite link may carry. `owner` is not grantable: it is created with the
 *  collection and never transferred, so it cannot appear on a link. */
export type InviteRole = Exclude<CollectionRole, 'owner'>;

export const COLLECTION_NAME_MAX_LENGTH = 80;
export const COLLECTION_DESCRIPTION_MAX_LENGTH = 500;
/** Shorter than a saved place's own note (2000): this one is read by other people, in a list, on a
 *  phone. The limit is the product saying what the field is for. */
export const COLLECTION_ITEM_NOTE_MAX_LENGTH = 500;

export function canEdit(role: CollectionRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

/** Renaming, deleting, sharing and membership changes. Deliberately narrower than `canEdit`: an
 *  editor contributes places, they do not get to rename someone else's collection or remove its
 *  other members. */
export function canManage(role: CollectionRole | null): boolean {
  return role === 'owner';
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

/**
 * A collection name as typed. Trimmed, required, and length-checked against the same number the
 * column's CHECK uses — the duplication is deliberate for the reason `domain/places/note.ts` gives:
 * the database constraint stays the authority, this one exists so the user is told before the
 * round trip rather than after it.
 *
 * Interior whitespace is collapsed, unlike a note. A name is a label rendered on one line in a
 * list, so `"Tel  Aviv \n eats"` and `"Tel Aviv eats"` are the same label and storing both would
 * give one collection two spellings.
 */
export function validateCollectionName(raw: string): Validated<string> {
  const name = raw.trim().replace(/\s+/g, ' ');

  if (name.length === 0) {
    return { ok: false, message: 'Give the collection a name.' };
  }
  if (name.length > COLLECTION_NAME_MAX_LENGTH) {
    const over = name.length - COLLECTION_NAME_MAX_LENGTH;
    return {
      ok: false,
      message: `That name is ${over} character${over === 1 ? '' : 's'} too long. The limit is ${COLLECTION_NAME_MAX_LENGTH}.`,
    };
  }
  return { ok: true, value: name };
}

/** A description, or `null` for "there isn't one". Newlines survive; it is prose, not a label. */
export function validateCollectionDescription(raw: string): Validated<string | null> {
  const trimmed = raw.trim();

  if (trimmed.length > COLLECTION_DESCRIPTION_MAX_LENGTH) {
    const over = trimmed.length - COLLECTION_DESCRIPTION_MAX_LENGTH;
    return {
      ok: false,
      message: `That description is ${over} character${over === 1 ? '' : 's'} too long. The limit is ${COLLECTION_DESCRIPTION_MAX_LENGTH}.`,
    };
  }
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

/** The shared note on one place inside one collection — "book ahead", "go before 11". Same
 *  empty-means-null rule as a saved place's note, so a cleared note is `NULL` and not `''`. */
export function validateItemNote(raw: string): Validated<string | null> {
  const trimmed = raw.trim();

  if (trimmed.length > COLLECTION_ITEM_NOTE_MAX_LENGTH) {
    const over = trimmed.length - COLLECTION_ITEM_NOTE_MAX_LENGTH;
    return {
      ok: false,
      message: `That note is ${over} character${over === 1 ? '' : 's'} too long. The limit is ${COLLECTION_ITEM_NOTE_MAX_LENGTH}.`,
    };
  }
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

export function isCollectionRole(value: unknown): value is CollectionRole {
  return value === 'owner' || value === 'editor' || value === 'viewer';
}

export function isInviteRole(value: unknown): value is InviteRole {
  return value === 'editor' || value === 'viewer';
}

/**
 * How a member is named on screen. `profiles.display_name` is nullable and is usually null — the
 * signup trigger fills it only from `raw_user_meta_data`, which our sign-up form does not send —
 * so every attribution surface needs one answer to "who is this" rather than four fallbacks
 * scattered across components.
 *
 * `isYou` wins over a set name on purpose: "You" is more useful than your own name on your own
 * screen, and it is what makes "added by" scannable in a list where most rows are yours.
 */
export function memberLabel(args: {
  readonly displayName: string | null;
  readonly isYou: boolean;
}): string {
  if (args.isYou) return 'You';
  const trimmed = (args.displayName ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'A collaborator';
}

/**
 * A display name is a label under someone else's eyes — rendered beside a role on a 44 px row, not
 * a field of prose — so it is shorter than the 80 the profiles column allows (`§6`).
 *
 * **The one definition**, and `NamePrompt` imports it rather than keeping its own. It held a second
 * copy of `40` until 2026-08-29 while `share-panel.test.ts` asserted on *this* one, so the test was
 * guarding a number the rendered `maxLength` did not read — the same trapdoor
 * `RESTING_SHEET_FRACTION` and `PEEK_PX` each fell through. It also has to live here rather than
 * beside the component for the reason that test records: every export of a `'use client'` module is
 * a client *reference*, so a Server Component importing one gets a proxy.
 */
export const MEMBER_NAME_MAX_LENGTH = 40;

/**
 * The part of an email address before the `@`, for prefilling the "what should people call you"
 * field.
 *
 * Prefill, never fallback. The suggestion is shown to the person it is about, in a field they have
 * to confirm, which makes it consent; deriving a visible name from someone's address *without* that
 * confirmation would put a fragment of their email in front of collaborators who were never given
 * it. That is why `memberLabel` above falls back to `A collaborator` and not to this.
 *
 * `''` for anything that is not an address with a non-empty local part — an empty prefill is
 * honest, and `Continue` on an empty field simply leaves the person as `A collaborator`.
 */
export function emailLocalPart(email: string | null | undefined): string {
  const address = email ?? '';
  const at = address.indexOf('@');
  if (at <= 0) return '';
  return address.slice(0, at).trim().slice(0, MEMBER_NAME_MAX_LENGTH);
}

/** What an item's attribution reads as once its adder has deleted their account: `added_by` is
 *  `on delete set null`, so the item survives de-identified rather than vanishing out of someone
 *  else's collection. */
export const FORMER_MEMBER_LABEL = 'A former collaborator';
