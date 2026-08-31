import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/app/_lib/supabase/server';
import { Button } from '@/components/ui/button';
import { emailLocalPart, isInviteRole } from '@/domain/collections/collection';
import { collectionHref } from '@/app/map/_lib/drawer-view';
import { JoinClient, JoinShell } from './join-client';

export const metadata = { title: 'Join a collection' };

/** One row of `preview_collection_invite` (migration `0024`). Five fields, deliberately: no place
 *  count, no member count, no member list — see the function's own header. */
interface InvitePreview {
  readonly collection_id: string;
  readonly collection_name: string;
  readonly inviter_name: string | null;
  readonly role: string;
  readonly already_member: boolean;
}

export default async function JoinCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    /*
     * DELIBERATE DEVIATION from `ux-collections.md` §5.3, which shows a signed-out visitor the
     * collection's name and the inviter's name so they know what they are signing in for.
     *
     * Doing that requires `preview_collection_invite` to be executable by `anon`, and migration
     * `0024` refuses that on purpose: it would be the product's first unauthenticated read, over a
     * token-guessable path, returning a real person's collection name and display name. The
     * generic screen costs the visitor one unknown for the length of a sign-in; the anon grant
     * would cost every owner a permanent enumeration surface. Revisit with `security-privacy` if
     * the round trip measurably loses people.
     */
    return (
      <JoinShell>
        <h1 className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-foreground">
          You&apos;ve been invited to a collection
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sign in to see it and join.
        </p>
        <Button
          render={<Link href={`/sign-in?next=/collections/join/${token}`} />}
          nativeButton={false}
          className="mt-2 h-14 w-full text-base font-bold"
        >
          Sign in to join →
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          You&apos;ll come straight back here.
        </p>
      </JoinShell>
    );
  }

  const { data, error } = await supabase.rpc('preview_collection_invite', { p_token: token });

  if (error) {
    // A malformed token is a `22P02` from the uuid cast and is simply a bad link. Anything else is
    // ours to notice, so the code is logged and the visitor still gets the one honest sentence.
    console.error('preview_collection_invite failed', { code: error.code });
  }

  const preview = (data as InvitePreview[] | null)?.[0];

  // Zero rows covers unknown, revoked and expired alike — the function cannot tell them apart, and
  // deliberately so: a screen that could would be an oracle for guessed tokens.
  if (!preview || !isInviteRole(preview.role)) {
    return (
      <JoinShell>
        <h1 className="font-heading text-2xl leading-tight font-extrabold tracking-tight text-foreground">
          This link doesn&apos;t work any more.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The person who shared it can send you a new one.
        </p>
        <Button
          render={<Link href="/map" />}
          nativeButton={false}
          variant="outline"
          className="mt-2 h-14 w-full text-base font-bold"
        >
          Go to your map
        </Button>
      </JoinShell>
    );
  }

  // Already in — including the owner opening their own link. Straight through, with no
  // "you're already in" message: it tells them nothing they cannot see on the next screen.
  if (preview.already_member) {
    // The canonical URL, not the `/collections/<id>` shim — see `join-client.tsx`'s
    // `enterCollection` for why one redirect is better than two.
    redirect(collectionHref(preview.collection_id) as '/map');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = (profile as { display_name: string | null } | null)?.display_name ?? null;

  return (
    <JoinClient
      token={token}
      collectionId={preview.collection_id}
      collectionName={preview.collection_name}
      inviterName={preview.inviter_name}
      role={preview.role}
      needsName={displayName === null || displayName.trim().length === 0}
      // Derived here, on the server, from a value that never reaches the client: the prompt gets
      // `maya`, never `maya@gmail.com` (§6 — a full address must not reach a shared surface).
      suggestedName={emailLocalPart(user.email)}
    />
  );
}
