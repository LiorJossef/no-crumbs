'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

import { deleteAccount } from '@/app/actions/account';
import type { BlockingCollection } from '@/app/profile/_lib/blocking-collections';
import { INDEX_VIEW, collectionHref, drawerHref } from '@/app/map/_lib/drawer-view';
import { InlineConfirm } from '@/components/collections/collection-content';
import { Button } from '@/components/ui/button';
import { SECTION_LABEL } from '@/ui/place/section-label';
import { ENTER_REVEAL, LEAVE_REVEAL, REVEAL_BEAT } from '@/lib/interaction';
import { cn } from '@/lib/utils';

/**
 * `Delete my data` — the last unbuilt L1 product feature (`L1-F8-T1`), and the two screens behind
 * it.
 *
 * This is the copy most likely to be got wrong in a hurry, because it is the copy that tells
 * somebody their data is gone. It came from `docs/archive/overnight-copy-deck.md` §5 verbatim until
 * 2026-09-03, when the owner ruled it too long — see the copy section below. The deck was updated
 * in the same commit, which `voice-and-vocabulary.md` §6 requires: a deck that disagrees with the
 * screen is how a third version gets written.
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
 * `docs/archive/overnight-deletion-review.md` §2 rules that deletion is refused while the user is the live
 * owner of a collection somebody else is in, because `collections.owner_id` is
 * `on delete cascade` and a cascade would take that collection away from every member. The refusal
 * has to be an instruction rather than a wall, so it **names the collections and links to them** —
 * each name goes to the collection itself, which is where both of the moves C152 offers already
 * live (delete it, or remove the other people). No new action is built for this and none should be.
 *
 * The names render inside `<bdi>` with `line-clamp-2`, never `truncate`: an ellipsis on a Hebrew
 * name inside an LTR box clips the *start* — the identifying half.
 *
 * ## A disclosure, not a fourth button — owner, 2026-09-03
 *
 * *"Too prominent, and it looks wrong."* The entry was a full-width ghost button whose muted,
 * centred label read as a section heading, with the scope sentence loose under it as the last
 * paragraph on the page — a permanent explanation of a thing nobody had asked to do. It is now the
 * product's own disclosure idiom (`add-by-note.tsx`, `candidate-card.tsx`): a small row under a
 * hairline, deliberately quieter than `Sign out` above it, with the flow revealed only once it is
 * opened. **Opening reveals; it destroys nothing** — the destructive press is still the confirm
 * inside, and it is still the only `destructive` control on the page.
 *
 * It renders on `/account` and nowhere else. The account menu offered it beside `Sign out` until
 * the same ruling took it off that surface, and the file stays under `app/profile/` because the
 * `_lib` pair that computes its pre-check lives here.
 *
 * ## The copy is shorter than the deck wrote it — owner, 2026-09-03
 *
 * *"Too much text."* Two changes, and the second is the one that mattered:
 *
 * **C143 is gone.** `entryLine` said *"This removes your places, anything you kept for later, your
 * collections and your account"* one line above `confirmBody`, which said the same list again in
 * the same panel. It earned its place when it sat on the page as a permanent caption under a
 * button; once the disclosure moved it inside, it was the same sentence twice in one viewport.
 *
 * **C145 lost a clause, and that clause has a condition behind it.**
 * *"anything you kept for later"* names `place_mentions`, and it was written into C143/C145 by
 * `entity-proposal.md` §10.4 as **condition 10** of the E1 security ruling — ahead of the feature,
 * so the deletion copy could not be caught understating what it removes.
 *
 * **E1 has not shipped.** `0031` creates the table; no application code writes or reads it (one
 * comment in `domain/places/score.ts` is the only reference in `src/`), there is no *keep for
 * later* control on any screen, and `0031` is not applied to production — measured at `0026` on
 * 2026-08-30. A user cannot create a mention, so the clause names a data class that does not exist
 * for them and removing it understates nothing today.
 *
 * **It comes back with the feature, and condition 10 is not discharged by this cut.** Whoever
 * builds *keep for later* restores the clause to C145 in the same commit. The deck says so at C145.
 *
 * **What could not be cut, and was not:** the confirmation still names what is removed *and* says
 * it cannot be undone, before the destructive press. That is the deck's own principle — a
 * destructive control whose blast radius is only revealed after you commit is one people press to
 * find out what it does — and it survives the shortening because opening the disclosure is not the
 * press that acts. Scope, then a second, separate, destructive press.
 *
 * §5.3's refusal branch is untouched. It is not a warning, it is an instruction somebody has to be
 * able to follow, and length is what makes it followable.
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
  confirmHeading: 'Delete your account?',
  confirmBody: 'Your places, collections and account are removed. This can’t be undone.',
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

export function AccountActions({ blocking }: { blocking: readonly BlockingCollection[] }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  // Which screen the panel opens on. Seeded from the server's pre-check so the first press lands on
  // the right branch with no round trip; the action can move it to `blocked` afterwards, and the
  // action is the authority.
  const [view, setView] = useState<'confirm' | 'blocked'>(
    blocking.length > 0 ? 'blocked' : 'confirm',
  );
  const [blocked, setBlocked] = useState<readonly BlockingCollection[]>(blocking);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Cancel closes the disclosure rather than stepping back into an idle panel: the row above is
   *  where the flow started and it is where cancelling should leave you. */
  function close() {
    setError(null);
    setOpen(false);
  }

  return (
    // Under a hairline and below `Sign out`, at the very bottom: the exits are ordered by how much
    // they cost, and this one is last and quietest.
    <div className="mt-4 border-t border-border/60 pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex min-h-9 items-center gap-1 rounded-md text-start text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {COPY.entry}
        <ChevronDown
          className={cn('size-3.5 shrink-0', open ? `${REVEAL_BEAT} rotate-180` : LEAVE_REVEAL)}
          aria-hidden
        />
      </button>

      {open ? (
        <div id={panelId} className={ENTER_REVEAL}>
          {view === 'blocked' ? (
            /* The page's own box — `rounded-xl border border-border bg-card p-4`, the string the
               two name cards above use. It was `rounded-lg … bg-muted/40 p-3`, the only tinted box
               anywhere in settings, which made a refusal read as an alert; it is a section of the
               page that happens to say no. */
            <div className="mt-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">
                {blocked.length === 1 ? COPY.blockedOne : COPY.blockedMany(blocked.length)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{COPY.blockedWhy}</p>
              <p className="mt-1 text-sm text-muted-foreground">{COPY.blockedHow}</p>

              <h3 className={cn('mt-3', SECTION_LABEL)}>
                {COPY.blockedList}
              </h3>
              <ul className="mt-1">
                {blocked.map((collection) => (
                  <li key={collection.id}>
                    <Link
                      // `collectionHref`, not the `/collections/<id>` path: that form is a redirect
                      // shim now, and going through it costs a segment change on each leg — the
                      // drawer torn down and rebuilt twice to reach a collection this screen is
                      // asking the user to go and empty.
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
                  // `drawerHref`, not the literal: `/collections` is a redirect shim, and routing
                  // this through it costs a segment change on each leg — the drawer torn down and
                  // rebuilt on the way to the screen this copy is sending the user to.
                  render={<Link href={drawerHref(INDEX_VIEW) as '/map'} />}
                  nativeButton={false}
                  size="lg"
                  className="h-11 flex-1"
                >
                  {COPY.blockedAction}
                </Button>
                <Button type="button" variant="ghost" size="lg" className="h-11" onClick={close}>
                  {COPY.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <InlineConfirm
              prompt={COPY.confirmHeading}
              body={COPY.confirmBody}
              confirmLabel={pending ? COPY.deleting : COPY.confirm}
              pending={pending}
              error={error}
              onCancel={close}
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
          )}
        </div>
      ) : null}
    </div>
  );
}

export { COPY as ACCOUNT_COPY };
