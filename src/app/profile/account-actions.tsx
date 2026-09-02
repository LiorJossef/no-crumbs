'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { deleteAccount } from '@/app/actions/account';
import type { BlockingCollection } from '@/app/profile/_lib/blocking-collections';
import { INDEX_VIEW, collectionHref, drawerHref } from '@/app/map/_lib/drawer-view';
import { InlineConfirm } from '@/components/collections/collection-content';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * `Delete my data` — the last unbuilt L1 product feature (`L1-F8-T1`), and the two screens behind
 * it.
 *
 * Every string here is `docs/overnight-copy-deck.md` §5, verbatim. None was written for this file.
 * It is the copy most likely to be got wrong in a hurry, because it is the copy that tells somebody
 * their data is gone.
 *
 * ## Inline, not a modal, and that is the product's existing answer
 *
 * The deck calls these dialogs. The product does not have one: `collections-index-client.tsx`
 * records the ruling — *"a dialog for a single text input costs a focus trap, an escape handler and
 * a backdrop in exchange for nothing"* — and every confirm in the product is `InlineConfirm`, in
 * place, where the control was. Branch A is that component with one optional line added for its
 * second clause. Branch B is not a confirm at all — nothing is being confirmed — so it is its own
 * block rather than a confirm wearing a link.
 *
 * ## Branch B is a refusal, and the shape of it is the point
 *
 * `docs/overnight-deletion-review.md` §2 rules that deletion is refused while the user is the live
 * owner of a collection somebody else is in, because `collections.owner_id` is
 * `on delete cascade` and a cascade would take that collection away from every member. The refusal
 * has to be an instruction rather than a wall, so it **names the collections and links to them** —
 * each name goes to the collection itself, which is where both of the moves C152 offers already
 * live (delete it, or remove the other people). No new action is built for this and none should be.
 *
 * The names render inside `<bdi>` with `line-clamp-2`, never `truncate`: an ellipsis on a Hebrew
 * name inside an LTR box clips the *start* — the identifying half.
 *
 * ## What the server already knows
 *
 * `blocking` is computed at page render, so tapping the control opens the right branch immediately
 * rather than after a round trip. The action re-runs the same check twice regardless (review §3.3),
 * and if it comes back `blocked` — the invite race — this switches to Branch B with the action's
 * fresher list. The server's answer is a courtesy; the action's is the authority.
 *
 * When the pre-check could not be run at all, `blocking` is empty and the control is still offered:
 * the action fails closed and says so with C149. There is no deck string for "we could not tell",
 * and inventing one for a state the user cannot act on would be worse than the honest failure.
 */

const COPY = {
  heading: 'Your account',
  entry: 'Delete my data',
  entryLine:
    'This removes your places, anything you kept for later, your collections and your account.',
  confirmHeading: 'Delete your account?',
  confirmBody:
    'Your places, anything you kept for later, your collections and your account are removed. This can’t be undone.',
  confirm: 'Delete my account',
  deleting: 'Deleting…',
  cancel: 'Cancel',
  failed: 'Couldn’t delete your account. Try again in a moment.',
  blockedOne: '1 of your collections is shared.',
  blockedMany: (n: number) => `${n} of your collections are shared.`,
  blockedWhy: 'Deleting your account would take them away from the people you shared them with.',
  blockedHow:
    'Delete those collections, or remove the other people from them, and then come back here.',
  blockedList: 'Shared by you',
  blockedAction: 'Open my collections',
} as const;

export function AccountActions({
  blocking,
  align = 'center',
}: {
  blocking: readonly BlockingCollection[];
  /**
   * How the entry control's label sits, and it follows the host's other controls rather than
   * having an opinion of its own.
   *
   * On `/profile` the entry is the third of three full-width buttons and all three centre, which
   * is the page's own rule that *three controls in one column should be one shape*. In the account
   * menu the control directly above it is `Sign out`, drawn `justify-start` — so a centred label
   * there was the one thing in a ten-row menu that did not line up. The words and the two-step
   * behaviour are untouched either way.
   */
  align?: 'center' | 'start';
}) {
  const [view, setView] = useState<'idle' | 'confirm' | 'blocked'>('idle');
  const [blocked, setBlocked] = useState<readonly BlockingCollection[]>(blocking);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (view === 'blocked') {
    return (
      <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-sm font-medium">
          {blocked.length === 1 ? COPY.blockedOne : COPY.blockedMany(blocked.length)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.blockedWhy}</p>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.blockedHow}</p>

        <h3 className="mt-3 text-micro font-bold tracking-wide text-muted-foreground uppercase">
          {COPY.blockedList}
        </h3>
        <ul className="mt-1">
          {blocked.map((collection) => (
            <li key={collection.id} className="border-b border-border/60 last:border-b-0">
              <Link
                // `collectionsHref`, not the `/collections/<id>` path: that form is a redirect
                // shim now, and going through it costs a segment change on each leg — the drawer
                // torn down and rebuilt twice to reach a collection this screen is asking the user
                // to go and empty.
                href={collectionHref(collection.id) as '/map'}
                className="flex min-h-11 items-center rounded-lg px-1 text-sm font-medium underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <bdi className="line-clamp-2">{collection.name}</bdi>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <Button
            // `drawerHref`, not the literal: `/collections` is a redirect shim, and routing this
            // through it costs a segment change on each leg — the drawer torn down and rebuilt on
            // the way to the screen this copy is sending the user to.
            render={<Link href={drawerHref(INDEX_VIEW) as '/map'} />}
            nativeButton={false}
            size="lg"
            className="h-11 flex-1"
          >
            {COPY.blockedAction}
          </Button>
          <Button type="button" variant="ghost" size="lg" className="h-11" onClick={() => setView('idle')}>
            {COPY.cancel}
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'confirm') {
    return (
      <InlineConfirm
        prompt={COPY.confirmHeading}
        body={COPY.confirmBody}
        confirmLabel={pending ? COPY.deleting : COPY.confirm}
        pending={pending}
        error={error}
        onCancel={() => {
          setError(null);
          setView('idle');
        }}
        onConfirm={() =>
          startTransition(async () => {
            setError(null);
            const result = await deleteAccount();
            // Reached only on refusal: the success path redirects and never returns.
            if (result.reason === 'blocked') {
              setBlocked(result.collections);
              setView('blocked');
              return;
            }
            setError(result.message);
          })
        }
      />
    );
  }

  return (
    <>
      {/* Not `destructive`-styled, deliberately: this control opens a confirmation and destroys
          nothing. `profile/page.tsx` already rules that the palette's destructive role is for the
          things that do — the confirm button inside the branch above is the one that gets it. */}
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className={cn(
          'h-12 w-full text-base text-muted-foreground',
          align === 'start' && 'justify-start px-2',
        )}
        onClick={() => setView(blocking.length > 0 ? 'blocked' : 'confirm')}
      >
        {COPY.entry}
      </Button>
      {/* The scope, before the user commits to a confirmation rather than inside it. A destructive
          control whose blast radius is only revealed after you press it is one people press to find
          out what it does. */}
      {/* `text-start`, not `text-center`: every other line on `/profile` and in the account menu
          is aligned to the leading edge, and one centred paragraph under a stack of left-aligned
          buttons read as a different surface. Logical, so an RTL locale aligns it right. The words
          and the behaviour are untouched — this control is destructive and its copy is deliberate. */}
      <p className="mt-1 text-start text-xs text-muted-foreground">{COPY.entryLine}</p>
    </>
  );
}

export { COPY as ACCOUNT_COPY };
