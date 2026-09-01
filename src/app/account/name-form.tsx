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
 * form with a separate submit on the same page.
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
 */

import { useId, useState, useTransition } from 'react';

import { updateAccountName } from '@/app/actions/profile';
import { NAME_MAX_LENGTH } from '@/app/account/_lib/account-name';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COPY = {
  heading: 'Your name',
  /** The whole of the privacy claim, in the one place a person would look for it. It is a promise
   *  the schema keeps rather than one this component makes: there is no peer policy on
   *  `profile_names`, no `anon` grant and no `service_role` grant. */
  blurb: 'Only you can see this. It is how No Crumbs addresses you, and it is never shown to anyone you share a collection with.',
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
    <section aria-labelledby={headingId} className="mt-4">
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
            // `dir="auto"` on the input, as every other name field in this product does: the local
            // database's own display name is `מאיה`.
            dir="auto"
            className="h-11 text-base"
          />
        </div>

        <div className="flex flex-col gap-1.5">
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
            className="h-11 text-base"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pending} className="h-11">
            {pending ? COPY.saving : COPY.save}
          </Button>
          {/* One live region for both outcomes, so a screen reader hears the result of the press
              rather than nothing. It says what happened and not who did it — a toast that used a
              name here would be the marketing-email register the brief rules out. */}
          <p
            id={statusId}
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

export { COPY as ACCOUNT_NAME_COPY };
