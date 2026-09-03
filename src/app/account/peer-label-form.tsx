'use client';

/**
 * `What people call you` — the **peer-visible** label, `profiles.display_name`.
 *
 * ## Prefill, never fallback
 *
 * The argument is not mine and predates this page. `emailLocalPart`
 * (`src/domain/collections/collection.ts:159-168`):
 *
 * > *"Prefill, never fallback. The suggestion is shown to the person it is about, in a field they
 * > have to confirm, which makes it consent; deriving a visible name from someone's address
 * > without that confirmation would put a fragment of their email in front of collaborators who
 * > were never given it."*
 *
 * `0035` quotes that paragraph back and applies it to the given name: a name typed into a sign-up
 * form so the product can address you is not consent to show it to strangers in a shared
 * collection, and a trigger copying one into the other launders the first into the second
 * silently. That trigger was removed under a security veto.
 *
 * So: where `display_name` is already set, this field shows it. Where it is not and a first name
 * exists, the field is **seeded** with the first name — visible, editable, and written only when
 * this form's own `Save` is pressed. That press is the confirmation. It is the same shape
 * `NamePrompt` uses in the sharing flow, and it deliberately uses the *first name* rather than the
 * email local part: this page has a better suggestion available, and the page never receives the
 * address.
 *
 * **Clearing it and saving is allowed and writes null**, which is how a person goes back to being
 * `A collaborator` — `memberLabel`'s fallback, which is what every account on this product shows
 * today, because `display_name` is null for all of them.
 *
 * ## Two forms, two buttons, one page
 *
 * This does not share a submit with `AccountNameForm`. A single `Save` would make fixing a typo in
 * your first name a silent write into the column strangers read, which is the withdrawn trigger
 * wearing a different hat.
 *
 * ## It calls the writer that already exists
 *
 * `updateDisplayName` in `actions/collections.ts` — the same action `NamePrompt` calls, with the
 * same trimming, the same 80-character bound and the same revalidation. A second writer for one
 * column is how two surfaces come to store two different shapes of the same name.
 */

import { useId, useState, useTransition } from 'react';

import { updateDisplayName } from '@/app/actions/collections';
import {
  SETTINGS_FIELD,
  SETTINGS_FIELD_COLUMN,
  SETTINGS_ROW,
  SETTINGS_SAVE,
} from '@/app/account/_lib/field-style';
import { MEMBER_NAME_MAX_LENGTH } from '@/domain/collections/collection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COPY = {
  heading: 'What people call you',
  /** The mirror of `Your name`'s line, and the pair only works as a pair: one says *only you*, this
   *  one names the audience. That contrast is `0035`'s security boundary drawn in seven words, and
   *  it is why the owner's 2026-09-03 cut kept a line here rather than deleting both.
   *
   *  The clause that went — *"everything else about your account stays private"* — was reassurance
   *  about the fields this form is not, which is a promise the other form already makes about
   *  itself. `voice-and-vocabulary.md` §3 rules the noun: `collection`, and never *member* or
   *  *collaborator* for the people in one. */
  blurb: 'Shown to people you share a collection with.',
  field: 'Name in shared collections',
  /** What peers see with nothing stored. `memberLabel` returns exactly this string, so the page
   *  states the product's real behaviour rather than a paraphrase of it. */
  current: 'Right now people see “A collaborator”.',
  suggestion: 'Suggested from your first name. It is only saved if you save it.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
} as const;

export function PeerLabelForm({
  displayName,
  suggestion,
}: {
  readonly displayName: string | null;
  /** The first name, or `null`. **Never an email address** — see the header. */
  readonly suggestion: string | null;
}) {
  const headingId = useId();
  const fieldId = useId();
  const hintId = useId();

  /** Stored value first; the suggestion only fills a genuinely empty field. */
  const seeded = displayName ?? suggestion ?? '';
  const [value, setValue] = useState(seeded);
  const [stored, setStored] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /** The field is carrying an unconfirmed suggestion rather than a stored value. Shown as a hint,
   *  because a person looking at their own name in a box has no other way to tell whether it is
   *  already in front of other people. */
  const suggesting = stored === null && suggestion !== null && value === suggestion;

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateDisplayName(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const trimmed = value.trim().replace(/\s+/g, ' ');
      setStored(trimmed === '' ? null : trimmed);
      setSaved(true);
    });
  }

  return (
    // The same card as `Your name` above it, and for the same reason — owner, 2026-09-03: *"I
    // liked it when it was in the white wrapper."* The card is the section's edge, so there is no
    // rule between the two: a border and a hairline draw the same line twice.
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 id={headingId} className="font-heading text-base font-bold tracking-tight">
        {COPY.heading}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{COPY.blurb}</p>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className={SETTINGS_ROW}>
          <div className={SETTINGS_FIELD_COLUMN}>
            <Label htmlFor={fieldId}>{COPY.field}</Label>
            <Input
              id={fieldId}
              name="displayName"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              // `MEMBER_NAME_MAX_LENGTH`, imported rather than restated: `share-panel.test.ts` was
              // asserting the domain's constant while `name-prompt.tsx` rendered a local copy of
              // it, and this repo has recorded that trapdoor by name.
              maxLength={MEMBER_NAME_MAX_LENGTH}
              autoComplete="nickname"
              dir="auto"
              aria-describedby={hintId}
              className={SETTINGS_FIELD}
            />
          </div>

          {/* The same shape as `Your name`'s save, from the same constant. Two buttons is the
              security rule above; two *sizes* was an accident that read as two kinds of action. */}
          <Button type="submit" size="lg" className={SETTINGS_SAVE} disabled={pending}>
            {pending ? COPY.saving : COPY.save}
          </Button>
        </div>

        {/* The hint and the outcome sit under the row, not inside the field's column: a two-line
            hint inside the column would push the column's bottom edge down and take `Save` with
            it, since the row aligns on `items-end`. */}
        <p id={hintId} className="empty:hidden text-xs text-muted-foreground">
          {suggesting ? COPY.suggestion : stored === null ? COPY.current : ''}
        </p>
        <p
          role="status"
          aria-live="polite"
          className={
            error === null
              ? 'empty:hidden text-sm text-muted-foreground'
              : 'empty:hidden text-sm text-destructive'
          }
        >
          {error ?? (saved ? COPY.saved : '')}
        </p>
      </form>
    </section>
  );
}

export { COPY as PEER_LABEL_COPY };
