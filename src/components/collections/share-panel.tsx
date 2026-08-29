'use client';

/**
 * Sharing a collection: the owner's link + members panel, and the read-only member list everyone
 * else sees.
 *
 * ## It renders in place, and that is the whole architectural point
 *
 * This is not a dialog and must never become one. `use-non-modal-background.ts` exists because a
 * drawer once put `aria-hidden` on `<main>` and made the entire map page unreachable to a screen
 * reader; `ux-collections.md` §8.1 names a share panel stacked over the vaul sheet as the single
 * most likely way to reintroduce that. So: no Radix `Dialog`, no portal, no `aria-hidden` written
 * anywhere but on decoration. The caller gives us a container, we fill it, and `onBack` pops us.
 *
 * ## What the copy is allowed to say
 *
 * `PRIVACY_BLOCK` is verbatim from §4.4 and is load-bearing. Its second and third sentences are a
 * matched pair naming *fields* — if a field ever moves between shared and private, both sentences
 * change together. It is never compressed into "your private data stays private": that is a claim
 * about a category, and it is not checkable.
 */

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createInvite,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from '@/app/actions/collections';
import {
  canManage,
  memberLabel,
  type CollectionRole,
  type InviteRole,
} from '@/domain/collections/collection';
import type { CollectionInvite, CollectionMember } from '@/app/collections/_lib/get-collections';
import { cn } from '@/lib/utils';

// ── pure helpers, exported so they can be tested without a DOM ────────────────────────────────

/** `ux-collections.md` §4.4, verbatim. Three sentences, in this order. Do not paraphrase. */
export const PRIVACY_BLOCK: readonly string[] = [
  'Anyone with this link who signs in can open this collection.',
  "They'll see each place's name, category and address, the notes added for everyone, and who added what.",
  "They won't see your own notes, your been marks, your tags, or the links you saved places from.",
];

export const JOIN_PATH_PREFIX = '/collections/join/';

/** The link an owner hands to someone. `origin` comes from `window.location.origin` at the call
 *  site, never from a constant: preview, local and production are three different hosts and a
 *  baked-in one would ship a link to the wrong deployment. */
export function joinLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${JOIN_PATH_PREFIX}${token}`;
}

/** What the primary button says. Web Share is the better gesture on a phone (it reaches the chat
 *  app the link is actually going to), clipboard is the fallback, and `Copied` is the 2s
 *  acknowledgement — a copy affordance with no visible result is the usual failure in this
 *  pattern (§4.2). */
export function shareButtonLabel(args: {
  readonly canShare: boolean;
  readonly copied: boolean;
}): string {
  if (args.copied) return 'Copied';
  return args.canShare ? 'Share link' : 'Copy link';
}

export function memberRoleLabel(role: CollectionRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'editor':
      return 'Can edit';
    case 'viewer':
      return 'Can view';
  }
}

/** The two words on the segmented control. Shorter than the member row's labels on purpose: the
 *  sentence above it already reads "People with the link can". */
export function inviteRoleLabel(role: InviteRole): string {
  return role === 'editor' ? 'Edit' : 'View';
}

/**
 * What to say when the owner picks the role the live link does not carry.
 *
 * §4.2 specifies `This is a different link. The one you shared before still works.` **That copy is
 * wrong against this implementation and I have not shipped it.** `createInvite` revokes the
 * previous invite before inserting the new one (see its docstring: one live link per collection,
 * deliberately), so the old link stops working — the spec's sentence would be a false promise in
 * the one panel whose entire job is telling the truth about access. Same reason the switch
 * confirms first: it is a destructive act on a link that is already out in someone's chat.
 */
export function roleSwitchNotice(
  current: InviteRole | null,
  selected: InviteRole,
): string | null {
  if (current === null || current === selected) return null;
  return 'Switching makes a new link. The one you shared before stops working.';
}

/** `useSyncExternalStore` needs a subscription; these two values never change while the panel is
 *  open, so the store is inert and only the snapshot matters. */
const subscribeToNothing = () => () => {};
const readOrigin = () => window.location.origin;
const readNoOrigin = () => null;
const readCanShare = () => typeof navigator.share === 'function';
const readCannotShare = () => false;

// ── the panel ─────────────────────────────────────────────────────────────────────────────────

const ROW = 'flex min-h-11 w-full items-center gap-3';
const SECTION_LABEL = 'text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase';

export function SharePanel({
  collectionId,
  collectionName,
  role,
  members,
  invite,
  currentUserId,
  onBack,
}: {
  collectionId: string;
  collectionName: string;
  role: CollectionRole;
  members: readonly CollectionMember[];
  invite: CollectionInvite | null;
  currentUserId: string;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState('');

  // §8.2: pushing a panel moves focus to its heading, or a keyboard user is left on a control that
  // no longer exists. `preventScroll` because the sheet owns its own scroll position.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const isOwner = canManage(role);

  return (
    /*
      The panel owns its own padding and its own scroll region. `Drawer.Content` is edge-to-edge by
      design so a view can go full-bleed, which means every view that is not full-bleed has to say
      so — without `px-4` the segmented control clips off the right edge at 375px. The bottom pad
      clears the home indicator, or the last member row sits under it.
    */
    <div
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]"
      data-vaul-no-drag
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Back"
          onClick={onBack}
          className="-ml-2 size-11 rounded-full text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-lg font-extrabold tracking-tight outline-none"
        >
          {isOwner ? 'Share' : 'In this collection'}
        </h2>
      </div>

      {isOwner ? (
        <OwnerLinkSection
          collectionId={collectionId}
          collectionName={collectionName}
          invite={invite}
          onStatus={setStatus}
        />
      ) : null}

      <MemberList
        collectionId={collectionId}
        members={members}
        currentUserId={currentUserId}
        isOwner={isOwner}
        showHeading={isOwner}
      />

      {isOwner ? null : (
        <LeaveCollection
          collectionId={collectionId}
          collectionName={collectionName}
          currentUserId={currentUserId}
        />
      )}

      {/*
        A live region local to this panel rather than the page's single `role="status"`
        (`src/ui/place/announce.ts`). §8.3 asks for the shared one; the panel is also rendered on
        surfaces that have no announcer provider — the join flow and the collections index — and a
        copy that silently announces nothing on two of three surfaces is worse than a second
        region that is only ever mounted while this panel is open. Flagged to the orchestrator.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}

function OwnerLinkSection({
  collectionId,
  collectionName,
  invite,
  onStatus,
}: {
  collectionId: string;
  collectionName: string;
  invite: CollectionInvite | null;
  onStatus: (message: string) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<InviteRole>(invite?.role ?? 'viewer');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<'replace' | 'off' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldRef = useRef<HTMLInputElement>(null);

  // `window` does not exist while this renders on the server and `navigator.share` is absent on
  // desktop, so both are read through `useSyncExternalStore`: the server snapshot is the honest
  // "don't know yet" and the client snapshot arrives at hydration, with no effect writing state
  // and no first paint that disagrees with the markup.
  const origin = useSyncExternalStore(subscribeToNothing, readOrigin, readNoOrigin);
  const canShare = useSyncExternalStore(subscribeToNothing, readCanShare, readCannotShare);

  // There is deliberately no local copy of `invite`. Every action here calls `revalidatePath` on
  // this collection, so the freshly issued token arrives as a prop before the transition ends —
  // and a local mirror is how a panel starts showing a link the server has already revoked.

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const link = invite && origin ? joinLink(origin, invite.token) : '';
  const notice = roleSwitchNotice(invite?.role ?? null, selectedRole);

  function issueLink(role: InviteRole) {
    setError(null);
    startTransition(async () => {
      const result = await createInvite(collectionId, role);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Never `Copied` on a link the user has not copied yet (§4.2): a new link has to be taken
      // deliberately, or the owner pastes the dead one.
      setCopied(false);
      setSelectedRole(result.role);
      onStatus('New link ready.');
    });
  }

  function replaceLink() {
    setConfirming(null);
    issueLink(selectedRole);
  }

  function turnOffLink() {
    setConfirming(null);
    setError(null);
    startTransition(async () => {
      const result = await revokeInvite(collectionId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCopied(false);
      onStatus('Link turned off.');
    });
  }

  async function shareOrCopy() {
    if (!link) return;
    setError(null);

    if (canShare) {
      try {
        await navigator.share({ title: collectionName, url: link });
        return;
      } catch (shareError) {
        // A cancelled share sheet is not a failure and gets no message; anything else falls
        // through to the clipboard rather than leaving the user with a dead button.
        if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        onStatus('Link copied.');
        return;
      } catch {
        // Clipboard permission refused — fall through to the manual path below.
      }
    }

    // No Web Share, no clipboard: select the text so one keystroke finishes the job, and say so.
    fieldRef.current?.select();
    onStatus('Copy the link above.');
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          People with the link can
        </legend>
        <div className="flex gap-2" role="radiogroup" aria-label="What people with the link can do">
          {(['viewer', 'editor'] as const).map((option) => {
            const selected = selectedRole === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedRole(option)}
                className={cn(
                  'h-12 flex-1 rounded-lg border text-sm font-bold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {inviteRoleLabel(option)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {notice ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <p className="text-sm leading-relaxed text-foreground">{notice}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-11 px-4"
              disabled={pending}
              onClick={() => issueLink(selectedRole)}
            >
              {pending ? 'Working…' : 'Make a new link'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-4"
              disabled={pending}
              onClick={() => setSelectedRole(invite?.role ?? selectedRole)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : invite === null ? (
        <Button
          type="button"
          className="h-14 w-full text-base font-bold"
          disabled={pending}
          onClick={() => issueLink(selectedRole)}
        >
          {pending ? 'Working…' : 'Create a link'}
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              ref={fieldRef}
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(event) => event.currentTarget.select()}
              onClick={() => void shareOrCopy()}
              className="h-12 flex-1 bg-card px-3 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              aria-label="Copy the invite link"
              className="size-12 shrink-0 rounded-lg"
              onClick={() => void shareOrCopy()}
            >
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>

          <Button
            type="button"
            className="h-14 w-full text-base font-bold"
            onClick={() => void shareOrCopy()}
          >
            {shareButtonLabel({ canShare, copied })}
          </Button>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
        {PRIVACY_BLOCK.map((sentence) => (
          <p key={sentence} className="text-sm leading-relaxed text-muted-foreground">
            {sentence}
          </p>
        ))}
      </div>

      {invite !== null ? (
        confirming !== null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed text-foreground">
              {confirming === 'replace'
                ? 'Replace the link? The old one stops working.'
                : 'Turn the link off? Nobody new can join. Everyone already in stays in.'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                className="h-11 px-4"
                disabled={pending}
                autoFocus
                onClick={confirming === 'replace' ? replaceLink : turnOffLink}
              >
                {pending ? 'Working…' : confirming === 'replace' ? 'Replace' : 'Turn it off'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-4"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setConfirming('replace')}
              className="flex min-h-11 items-center text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
            >
              Replace link
            </button>
            <button
              type="button"
              onClick={() => setConfirming('off')}
              className="flex min-h-11 items-center text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
            >
              Turn the link off
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

function MemberList({
  collectionId,
  members,
  currentUserId,
  isOwner,
  showHeading,
}: {
  collectionId: string;
  members: readonly CollectionMember[];
  currentUserId: string;
  isOwner: boolean;
  showHeading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {showHeading ? <p className={cn(SECTION_LABEL, 'mb-1')}>In this collection</p> : null}
      <ul className="flex flex-col">
        {members.map((member) => (
          <li key={member.userId} className="border-b border-border/50 last:border-b-0">
            <MemberRow
              collectionId={collectionId}
              member={member}
              isYou={member.userId === currentUserId}
              manageable={isOwner && member.role !== 'owner'}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberRow({
  collectionId,
  member,
  isYou,
  manageable,
}: {
  collectionId: string;
  member: CollectionMember;
  isYou: boolean;
  manageable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const name = memberLabel({ displayName: member.displayName, isYou });

  function setRole(role: InviteRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(collectionId, member.userId, role);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(collectionId, member.userId);
      if (!result.ok) {
        setConfirmingRemoval(false);
        setError(result.message);
        return;
      }
      setOpen(false);
      setConfirmingRemoval(false);
    });
  }

  return (
    <div className="flex flex-col py-1">
      <div className={ROW}>
        {/* Name and role are separate elements with a literal gap between them: concatenated,
            a Hebrew display name puts the role label on the wrong side of the row (§8.7).
            `text-left` beside `dir="auto"` on purpose — auto gets the characters and any
            punctuation in the right order, but it also right-aligns a Hebrew name inside its cell,
            which parks it flush against the role label and reads as one phrase. The row frame is
            LTR; the name starts where the row starts. */}
        <span dir="auto" className="min-w-0 flex-1 line-clamp-2 text-left text-sm font-medium">
          {name}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {memberRoleLabel(member.role)}
        </span>
        {manageable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-expanded={open}
            aria-label={`Change what ${name} can do`}
            onClick={() => {
              setOpen((wasOpen) => !wasOpen);
              setConfirmingRemoval(false);
            }}
            className="size-11 shrink-0 rounded-full text-muted-foreground"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {open && !confirmingRemoval ? (
        <div className="flex flex-col pb-2 pl-1">
          <button
            type="button"
            disabled={pending || member.role === 'editor'}
            onClick={() => setRole('editor')}
            className="flex min-h-11 items-center text-sm font-medium disabled:text-muted-foreground"
          >
            Can edit
          </button>
          <button
            type="button"
            disabled={pending || member.role === 'viewer'}
            onClick={() => setRole('viewer')}
            className="flex min-h-11 items-center text-sm font-medium disabled:text-muted-foreground"
          >
            Can view
          </button>
          <button
            type="button"
            onClick={() => setConfirmingRemoval(true)}
            className="flex min-h-11 items-center text-sm font-bold text-destructive"
          >
            Remove from collection
          </button>
        </div>
      ) : null}

      {confirmingRemoval ? (
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm leading-relaxed text-foreground">
            Remove <span dir="auto" className="font-bold">{name}</span>
            <span>? They&apos;ll lose access.</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              className="h-11 px-4"
              disabled={pending}
              autoFocus
              onClick={remove}
            >
              {pending ? 'Removing…' : 'Remove'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-4"
              disabled={pending}
              onClick={() => setConfirmingRemoval(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="pb-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LeaveCollection({
  collectionId,
  collectionName,
  currentUserId,
}: {
  collectionId: string;
  collectionName: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function leave() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(collectionId, currentUserId);
      if (!result.ok) {
        setConfirming(false);
        setError(result.message);
        return;
      }
      // Leaving removes the read policy that makes this page renderable, so staying here would
      // show an empty collection until something else navigated.
      router.push('/collections');
    });
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="flex min-h-11 items-center self-start text-sm font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Leave collection
        </button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
      {/* The name sits on its own line rather than inside the sentence: §9 rules out
          `Leave "מסעדות טובות"?` — the quote marks land on the wrong ends of an RTL name. */}
      <p dir="auto" className="text-sm font-bold">
        {collectionName}
      </p>
      <p className="text-sm leading-relaxed text-foreground">
        Leave this collection? You can rejoin with the link.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          className="h-11 px-4"
          disabled={pending}
          autoFocus
          onClick={leave}
        >
          {pending ? 'Leaving…' : 'Leave'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-4"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
