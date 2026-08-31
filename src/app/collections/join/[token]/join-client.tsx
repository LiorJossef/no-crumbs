'use client';

/**
 * The join screen, and the shell every state of this route is drawn in.
 *
 * ## It never auto-joins
 *
 * A link in a group chat gets opened by accident, and joining is a membership fact about someone
 * else's collection (`ux-collections.md` §5). So the route reads the invite, shows what it says,
 * and waits for a tap — in both signed states, including after the sign-in round trip.
 *
 * ## What is on screen is everything the token carries
 *
 * Name, inviter, role. No place count, no member count, no places: `preview_collection_invite`
 * returns exactly five fields and refuses to return the aggregates, because a count is a fact
 * about content this visitor has no permission to read.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { PinMark } from '@/components/brand/pin-mark';
import { NamePrompt } from '@/components/collections/name-prompt';
import { joinCollection } from '@/app/actions/collections';
import { memberLabel, type InviteRole } from '@/domain/collections/collection';
import { collectionHref } from '@/app/map/_lib/drawer-view';

/** §5.2's third line. Two roles, two sentences, and neither is a list of permissions. */
export function roleSentence(role: InviteRole): string {
  return role === 'editor'
    ? "You'll be able to add and remove places."
    : "You'll be able to see the places in it.";
}

/** §4.4's block, from the joiner's side of it. One sentence, so the boundary is learned by both
 *  people from their own point of view. */
export const JOINER_PRIVACY_LINE = "They won't see your notes or your been marks either.";

/**
 * A signed-out surface: no session, no map behind it, its heading is the page `<h1>`
 * (`ux-collections.md` §8.10). Same `--brand-wash` atmosphere as `/sign-in`, because this screen
 * and that one are two steps of one flow and a visitor bounces between them.
 */
export function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-14 pb-8"
      style={{ background: 'var(--brand-wash)' }}
    >
      <PinMark className="h-[30px] w-[30px] shrink-0" />
      <div className="mt-auto flex w-full max-w-sm flex-col gap-4 pb-6 lg:mx-auto lg:my-auto lg:pb-0">
        {children}
      </div>
    </main>
  );
}

export function JoinClient({
  token,
  collectionId,
  collectionName,
  inviterName,
  role,
  needsName,
  suggestedName,
}: {
  token: string;
  collectionId: string;
  collectionName: string;
  /** `profiles.display_name` of whoever made the link — null far more often than not. */
  inviterName: string | null;
  role: InviteRole;
  /** Whether this account still has no display name, so the §6 prompt is worth asking. */
  needsName: boolean;
  /** The local part of the caller's email, derived server-side. Never the address. */
  suggestedName: string;
}) {
  const router = useRouter();
  const [askingName, setAskingName] = useState(false);
  const [nameAsked, setNameAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inviter = memberLabel({ displayName: inviterName, isYou: false });

  function enterCollection() {
    // **The search-param form, not the path form.** `/collections/<id>` still works — it is a
    // permanent redirect shim — but going through it costs a second navigation *and* a segment
    // change on each leg, which is exactly the sheet remount the drawer merge removed
    // (`app/collections/_lib/drawer-view.ts`). Arriving on a shared collection is the one moment a
    // stranger judges this product, so it lands on the canonical URL directly.
    router.push(collectionHref(collectionId) as '/map');
  }

  function performJoin() {
    startTransition(async () => {
      const result = await joinCollection(token);
      if (!result.ok) {
        setAskingName(false);
        setError(result.message);
        return;
      }
      enterCollection();
    });
  }

  function join() {
    setError(null);

    // §5.4 keeps the offline case as its own sentence: "try again" is bad advice while the radio
    // is off, and the browser already knows.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError("You're offline. Check your connection and try again.");
      return;
    }

    /*
     * §6's prompt: after the tap, before the write.
     *
     * §5.3 puts it after `Join collection` so nothing stands between a person and the thing they
     * clicked, and this satisfies that — the tap has already happened and the join is the next
     * thing that runs. It does NOT run *after* the join, which is where the spec's wording points,
     * and that is a measured constraint rather than a preference: `joinCollection` is a Server
     * Action, every Server Action re-renders the route it was called from, and the re-render finds
     * `already_member` true and redirects to the collection (§5.4). The prompt was destroyed
     * within 300ms every time. Asking first is the only ordering on this route that survives.
     */
    if (needsName && !nameAsked) {
      setAskingName(true);
      return;
    }

    performJoin();
  }

  if (askingName) {
    return (
      <JoinShell>
        <NamePrompt
          suggestedName={suggestedName}
          onDone={() => {
            setNameAsked(true);
            performJoin();
          }}
        />
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      {/* Inviter and sentence are separate elements: a Hebrew display name concatenated into an
          English sentence reorders around the verb (§9). */}
      <h1 className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-foreground">
        <span dir="auto">{inviter}</span> <span>invited you to a collection</span>
      </h1>

      <p dir="auto" className="line-clamp-2 text-xl font-extrabold text-foreground">
        {collectionName}
      </p>

      <p className="text-sm leading-relaxed text-muted-foreground">{roleSentence(role)}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{JOINER_PRIVACY_LINE}</p>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="mt-2 h-14 w-full text-base font-bold"
        disabled={pending}
        onClick={join}
      >
        {pending ? 'Joining…' : 'Join collection'}
      </Button>

      <Button
        render={<Link href="/map" />}
        nativeButton={false}
        variant="ghost"
        className="h-11 w-full text-sm font-medium text-muted-foreground"
      >
        Not now
      </Button>
    </JoinShell>
  );
}
