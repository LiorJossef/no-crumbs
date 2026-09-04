'use client';

/**
 * `Your name` — the private one. The first identifying field this product lets a person change.
 *
 * ## What it may not do, and the rule is load-bearing
 *
 * `profile_names` is private to its owner and `profiles.display_name` is the peer-visible label;
 * **nothing derives one from the other**. A trigger that did was written, reviewed and removed
 * under a security veto (`0035_names_at_sign_up.sql`). So this form writes exactly two columns
 * through `updateAccountName`, which reaches one table, and the peer-visible label is a separate
 * form with a separate submit on the same page. **The two never share a submit**: one `Save` over
 * both would make correcting a typo in your first name a silent write of that name into the column
 * strangers read, which is the withdrawn trigger wearing a different hat.
 *
 * ## Required-ness, and why it differs from sign-up
 *
 * The sign-up form refuses an empty first name (`sign-in/name-fields.ts`), because a sign-up that
 * lets it through produces an account with no name forever — which is the state all eight
 * pre-`0035` accounts are in. **This form allows an empty one**, because `0035` says clearing a
 * name is `set first_name = null` in as many words, and a settings screen that will not let you
 * take back a name you gave is a different rule wearing the sign-up form's clothes. There is no
 * `Optional` marker on the first name for the same reason there is one on the last: the marker
 * describes what the form does with an empty field at *submit*, and here both are accepted.
 *
 * ## Why the field is not a controlled mirror of the server value
 *
 * The inputs are seeded from the props on mount and owned by the browser afterwards. A save
 * revalidates `/account`, so the server sends the stored value back; re-seeding the fields from
 * that would fight a person who kept typing while the action was in flight. `saved` is the only
 * thing the response changes on screen.
 *
 * ## `Save` stays live, and that reverses an earlier call of mine
 *
 * It was disabled until the fields differed from what was stored — the rule `saved-place-edits.tsx`
 * applies to a note. The owner rejected it on sight (2026-09-03): *"only when I update the state it
 * gives me the opportunity to click on save, but there's no way in the UI that says that."* A
 * control that greys itself out for a reason the screen never states is a dead end, and the honest
 * fixes are all worse than the problem — a line of explanatory copy under a button, or a tooltip on
 * a surface with no tooltips. Pressing `Save` with nothing changed simply rewrites the same value.
 */

import { useId, useState, useTransition } from 'react';

import { updateAccountName } from '@/app/actions/profile';
import { NAME_MAX_LENGTH } from '@/app/account/_lib/account-name';
import {
  SETTINGS_FIELD,
  SETTINGS_FIELD_COLUMN,
  SETTINGS_ROW,
  SETTINGS_SAVE,
} from '@/app/account/_lib/field-style';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COPY = {
  heading: 'Your name',
  /** Four words, and every one of them load-bearing. The audience is the whole point of this line:
   *  it is what tells a person that *this* name is not the one strangers read, and `0035`'s
   *  boundary is invisible in the interface without it. It is a promise the schema keeps rather
   *  than one this component makes — there is no peer policy on `profile_names`, no `anon` grant
   *  and no `service_role` grant.
   *
   *  It ran to three clauses until the owner cut it on 2026-09-03 (*too much space and too many
   *  words for "your name"*). The two clauses that went were a friendly gloss and a restatement;
   *  one of them also broke `voice-and-vocabulary.md` §2, which bans the product's name outside
   *  six named surfaces and a settings blurb is not one of them. */
  blurb: 'Only you see this.',
  first: 'First name',
  last: 'Last name',
  optional: 'Optional',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
} as const;

export function AccountNameForm({
  firstName,
  lastName,
}: {
  readonly firstName: string | null;
  readonly lastName: string | null;
}) {
  const headingId = useId();
  const firstId = useId();
  const lastId = useId();
  const statusId = useId();

  const [first, setFirst] = useState(firstName ?? '');
  const [last, setLast] = useState(lastName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAccountName({ firstName: first, lastName: last });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The stored values, echoed back: the trigger collapses whitespace and turns `''` into
      // `null`, so what the person typed and what the row holds are not always the same string.
      setFirst(result.firstName ?? '');
      setLast(result.lastName ?? '');
      setSaved(true);
    });
  }

  return (
    // A card, the same one `/profile`'s library summary draws. Owner, 2026-09-03, having seen it
    // both ways: *"I liked it when it was in the white wrapper."* Taking the card off was an
    // earlier pass's idea, not a ruling, and the version without it left three fields floating on
    // the page background with only a hairline to say where one section ended. The card is what
    // bounds the section, which is also why this form and the peer one carry no rule between them.
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
        {/* One row: two fields and the save that writes them, on one line, stacking below `sm`.
            Owner, 2026-09-03. `SETTINGS_ROW` carries the alignment argument. */}
        <div className={SETTINGS_ROW}>
          <div className={SETTINGS_FIELD_COLUMN}>
            <Label htmlFor={firstId}>{COPY.first}</Label>
            <Input
              id={firstId}
              name="firstName"
              value={first}
              onChange={(event) => {
                setFirst(event.target.value);
                setSaved(false);
              }}
              // `maxLength` as well as the action's own check: the constraint is
              // `profile_names_first_name_check`, and a person who pastes 300 characters should be
              // stopped at the field rather than told off after a round trip. The action still
              // refuses, because an attribute is a courtesy and not a control.
              maxLength={NAME_MAX_LENGTH}
              autoComplete="given-name"
              // `dir="auto"` on the input, as every other name field in this product does: the
              // local database's own display name is `מאיה`.
              dir="auto"
              className={SETTINGS_FIELD}
            />
          </div>

          <div className={SETTINGS_FIELD_COLUMN}>
            <Label htmlFor={lastId}>
              {COPY.last}
              <span className="text-xs font-medium text-muted-foreground">{COPY.optional}</span>
            </Label>
            <Input
              id={lastId}
              name="lastName"
              value={last}
              onChange={(event) => {
                setLast(event.target.value);
                setSaved(false);
              }}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="family-name"
              dir="auto"
              className={SETTINGS_FIELD}
            />
          </div>

          {/* Exactly as tall as the fields it ends — the owner's rule is *match the field*, and no
              `size` variant is 40px. `SETTINGS_SAVE` holds the number so both saves keep it. */}
          <Button type="submit" size="lg" className={SETTINGS_SAVE} disabled={pending}>
            {pending ? COPY.saving : COPY.save}
          </Button>
        </div>

        {/* One live region for both outcomes, so a screen reader hears the result of the press
            rather than nothing. Under the row rather than beside the button: in a row it would be
            a fourth column that is empty most of the time and reflows the fields when it fills.
            It says what happened and not who did it — a toast that used a name here would be the
            marketing-email register the brief rules out. */}
        <p
          id={statusId}
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

export { COPY as ACCOUNT_NAME_COPY };
