'use client';

/**
 * "What should people in this collection call you?" — asked once, at the two moments a person has
 * just decided to be visible to someone else: generating the first share link, and tapping
 * `Join collection` (`ux-collections.md` §6).
 *
 * ## Prefilled, not defaulted — the one deliberate deviation from §6
 *
 * §6 also makes the email local-part the *fallback* when `display_name` is null. It is not, here.
 * A prefilled field the user then confirms is consent: they saw `maya`, they pressed Continue,
 * they chose it. A fallback renders a name derived from someone's email address to a second person
 * who was never asked — a small privacy leak into a shared surface, and the surface where it
 * lands is the one place in the product another human is reading. So the prefill stays and the
 * fallback stays `memberLabel`'s `A collaborator`.
 *
 * The email itself never reaches this component. The caller passes the local part, already
 * derived on the server (`emailLocalPart`, in this route's `page.tsx`), because a component that
 * took an address could render one.
 *
 * ## No skip control, on purpose
 *
 * With a prefilled value, `Continue` *is* the skip — §6's own argument. Clearing the field and
 * pressing Continue is also allowed and writes null, which is how someone stays `A collaborator`.
 */

import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateDisplayName } from '@/app/actions/collections';
import { MEMBER_NAME_MAX_LENGTH } from '@/domain/collections/collection';

export function NamePrompt({
  suggestedName,
  onDone,
}: {
  /** Usually `emailLocalPart(user.email)`. Never the address itself. */
  suggestedName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateDisplayName(name);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-vaul-no-drag
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-lg font-extrabold tracking-tight outline-none"
      >
        What should people in this collection call you?
      </h2>

      <Input
        autoFocus
        dir="auto"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Your name in collections"
        aria-invalid={error !== null}
        aria-describedby={error ? 'display-name-error' : undefined}
        enterKeyHint="done"
        maxLength={MEMBER_NAME_MAX_LENGTH}
        className="h-12 bg-card px-3 text-base"
      />

      {error ? (
        <p id="display-name-error" role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-14 w-full text-base font-bold" disabled={pending}>
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
