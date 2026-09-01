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
import { MEMBER_NAME_MAX_LENGTH } from '@/domain/collections/collection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COPY = {
  heading: 'What people call you',
  blurb: 'Shown beside your name in a collection you share. Everything else about your account stays private.',
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
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="font-heading text-base font-bold tracking-tight">
        {COPY.heading}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{COPY.blurb}</p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
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
            // asserting the domain's constant while `name-prompt.tsx` rendered a local copy of it,
            // and this repo has recorded that trapdoor by name.
            maxLength={MEMBER_NAME_MAX_LENGTH}
            autoComplete="nickname"
            dir="auto"
            aria-describedby={hintId}
            className="h-11 text-base"
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {suggesting ? COPY.suggestion : stored === null ? COPY.current : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" size="lg" disabled={pending} className="h-11">
            {pending ? COPY.saving : COPY.save}
          </Button>
          <p
            role="status"
            aria-live="polite"
            className={error === null ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {error ?? (saved ? COPY.saved : '')}
          </p>
        </div>
      </form>
    </section>
  );
}

export { COPY as PEER_LABEL_COPY };
