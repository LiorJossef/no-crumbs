import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/app/_lib/supabase/server';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { emailLocalPart, isInviteRole } from '@/domain/collections/collection';
import { collectionHref } from '@/app/map/_lib/drawer-view';
import { JoinClient, JoinShell } from './join-client';

export const metadata = { title: 'Join a collection' };

/**
 * **What a stranger reads, and the seam rule it is here to hold.**
 *
 * This is the product's only unauthenticated acquisition surface. Charter §1 refuses discovery —
 * no feed, no public profile, no search — so a shared collection link is the *sole* way a second
 * person ever arrives, which makes the visitor reading this screen new by definition.
 *
 * Two things were wrong with what they were shown, and they are the same fifteen seconds
 * (`product-review-2026-08-31-r1.md` finding 5 and `ui-review-2026-08-31.md` finding 8), so they
 * are fixed together. Doing one without the other leaves a stranger who now knows what the product
 * is still being told their places are waiting.
 *
 *  1. **The handoff carried where to go and not who arrived.** The link was `/sign-in?next=…`, and
 *     `/sign-in` opened on its sign-in side unconditionally: *"Your places are waiting."* over
 *     *"Sign in to pick up your saved map right where you left it."*, under a button that had just
 *     said *sign in*. Three sentences, all false, at the moment the product is trying to gain a
 *     user. `mode=sign-up` is the missing half of the handoff.
 *
 *     **The general rule, which is worth more than the fix:** the entry point knew something the
 *     destination did not, and dropped it at the seam. Anywhere one screen routes into a screen
 *     that serves two audiences, the router passes what it knows — the destination *and* the state.
 *     That is the shape of every seam bug in this product.
 *
 *  2. **The screen never said what the product is.** A stranger was asked to create an account on
 *     the strength of the word *collection*, with no sentence anywhere telling them what they would
 *     be joining. `WHAT_THIS_IS` is that sentence, and it is the one line on this screen that is
 *     for someone who has never heard of us.
 *
 * **The name is not in it, deliberately.** `voice-and-vocabulary.md` §2 lists the six surfaces that
 * may carry the product's name and names *invite copy* in the banned list explicitly. The sentence
 * describes the thing rather than announcing the brand, which is also the better sentence.
 */
export const JOIN_SIGNED_OUT_COPY = {
  headline: "You've been invited to a collection",
  /** What the product is, for someone who has never heard of it. One clause, no adjectives about
   *  how good it is, and no brand word. */
  whatThisIs: 'A collection is a shared list of places, on a map built from TikTok links.',
  /** The primary action, and it is *create*, because an invitee is new by construction. */
  create: 'Create an account →',
  comeBack: "You'll come straight back here.",
  /** The returning user's route out. A real control, not a hint: the other audience for this screen
   *  is the person who already has an account and was sent a link by a friend. */
  existing: 'Already have an account?',
  existingAction: 'Sign in',
} as const;

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
    const next = `/collections/join/${token}`;

    /*
     * **This screen is drawn as `ChromeStage`, and adopting the composition is the fix rather than
     * a consequence of it.**
     *
     * It was the one message surface outside the system — its own shell, its own mark placement,
     * its own type and its own control sizes — and everything outside a system drifts. Five things
     * were measured against the six screens that *do* use `ChromeStage`
     * (`product-review-2026-08-31-r2.md` C3–C7), and every one of them is a value that was
     * re-decided by hand here and came out different:
     *
     *  - the `h1` set `leading-tight` over `text-display`, so 42.5px of leading where every other
     *    34px display headline in the product is 38.08;
     *  - the CTA was `h-14 text-base` — 56px at both breakpoints against `h-12 lg:h-13` (48 → 52)
     *    on all six siblings, and skipping the desktop 16 → 15.5px type step they all take;
     *  - one column carried two text alignments, `start` for the headline, subhead and CTA and
     *    `center` for the two lines under it;
     *  - the mark was `h-[30px] w-[30px]`, an arbitrary value with no desktop step, and **faceless**
     *    — a plain filled disc on the product's only acquisition surface;
     *  - and it was *stranded*: pinned to the top-left of the viewport at `x = 24` while the content
     *    block was centred at `x = 528`, 504px away at 1440, with roughly 400px of empty screen
     *    between the disc and the first word a stranger reads at 390.
     *
     * None of the five is fixed here individually. The composition carries the lockup, the type
     * scale, the control sizes and the alignment rule, so adopting it resolves all five at once and
     * leaves nothing on this file to drift *from*. The one thing this page still decides is the
     * words.
     *
     * **`ChromeGround` comes with it, and that is a deliberate reversal of a sentence in that
     * file.** Its docblock groups this screen with `error.tsx` and `not-found.tsx` as surfaces
     * "nobody is asked to admire", left on `--brand-wash`. That is right about the two failure
     * screens and wrong about this one: Charter §1 refuses discovery, so a shared collection link
     * is the *sole* way a second person ever arrives, and this is a front door one step from
     * `/sign-in` that a visitor bounces back to. `join-client.tsx` already says so — it claims the
     * "same `--brand-wash` atmosphere as `/sign-in`", which stopped being true the day `/sign-in`
     * moved to the mesh.
     */
    return (
      <main className="relative isolate min-h-dvh">
        <ChromeGround />

        <ChromeStage
          editorial={
            <>
              {/* No kicker, where the five siblings have one. Every kicker in the family is a
                  two-word orientation label — *Welcome back*, *Get started* — and the honest one
                  for this screen would restate the headline. Inventing a sixth is a copy decision
                  and `voice-and-vocabulary.md` §2 has this surface on a short leash already: the
                  product's name is banned from invite copy by name. Left to the copy owner. */}
              <ChromeItem step={1}>
                {/* `text-display lg:text-display-lg` and no leading override. The face and the size
                    joined the family in an earlier commit; the leading did not, and `text-display`
                    carries its own line height — which is the entire reason it is a token. */}
                <h1
                  className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                  style={DISPLAY_HEADING_AXES}
                >
                  {JOIN_SIGNED_OUT_COPY.headline}
                </h1>
              </ChromeItem>

              <ChromeItem step={2}>
                <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
                  {JOIN_SIGNED_OUT_COPY.whatThisIs}
                </p>
              </ChromeItem>
            </>
          }
          form={
            <ChromeItem step={3} className="flex flex-col">
              {/* `mode=sign-up` is the half of the handoff that was missing. `next` is unchanged and
                  is re-checked by `safeReturnPath` on arrival — this page is not trusted to have
                  produced a safe one just because it is ours. */}
              <Button
                render={<Link href={`/sign-in?mode=sign-up&next=${next}`} />}
                nativeButton={false}
                className="h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading"
              >
                {JOIN_SIGNED_OUT_COPY.create}
              </Button>

              {/* Centred, and so is the row below it — which is the family's rule rather than this
                  screen keeping its old alignment. Every `ChromeStage` surface sets the line
                  *under* the primary action centred (`/` twice, `/sign-in`, `/auth/reset` in both
                  its states) and everything above it on the column's rail; there is no
                  counterexample in the product. What C5 measured was one column carrying both,
                  which is a defect. Two columns carrying one each is the composition. */}
              <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
                {JOIN_SIGNED_OUT_COPY.comeBack}
              </p>

              {/* The other audience. `min-h-11` because it is a real route out of this screen and
                  not an inline link inside a sentence — the same 44px rule W7-6 applied to
                  `/sign-in`'s own account toggle, which this is styled after so the two read as one
                  control shape.

                  `PRESS_ROW`, not `PRESS_CHIP`: the target is the full-width row rather than the
                  two words inside it, and a 5% squeeze on something this wide reads as the screen
                  moving. On a phone there is no hover and no `focus-visible`, so without it a tap
                  on this link is confirmed only by the next screen arriving — which is the gap
                  `press-feedback.test.ts` was written after finding 12 of 12 controls carrying no
                  acknowledgement at all. */}
              <Link
                href={`/sign-in?next=${next}`}
                className={cn(
                  'group/switch mt-3 flex min-h-11 items-center justify-center gap-1 rounded-lg text-center text-sm font-medium text-muted-foreground outline-none motion-safe:transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                  PRESS_ROW,
                )}
              >
                {JOIN_SIGNED_OUT_COPY.existing}{' '}
                <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                  {JOIN_SIGNED_OUT_COPY.existingAction}
                </span>
              </Link>
            </ChromeItem>
          }
        />
      </main>
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
      /*
       * **This branch keeps `JoinShell` and the branch above does not, and the split is by role
       * rather than by accident.** A dead invite is a failure message — the same species as
       * `not-found.tsx` and `error.tsx`, which `chrome-ground.tsx` deliberately leaves on
       * `--brand-wash` because a gradient mesh and a drifting light field under *"this doesn't
       * work"* is the mascot-grinning-at-a-crash defect in another medium. The screen above is an
       * acquisition surface and takes the front-door composition; this one does not.
       *
       * What it does take is the two values that were simply wrong: the `leading-tight` override
       * over `text-display`'s own line height, and the `h-14` CTA that was 8px taller than every
       * other primary action in the product at 390 and 4px taller at 1440. Both were the signed-out
       * branch's, copied.
       */
      <JoinShell>
        {/* Same surface, same finding 8, same repair as the signed-out branch above. A dead invite
            is a full-screen message and is set like one. */}
        <h1
          className="font-display text-display font-bold tracking-tight text-foreground"
          style={DISPLAY_HEADING_AXES}
        >
          This link doesn&apos;t work any more.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The person who shared it can send you a new one.
        </p>
        {/* `not-found.tsx`'s button, class for class, because this is `not-found.tsx`'s job on a
            different URL. */}
        <Button
          render={<Link href="/map" />}
          nativeButton={false}
          variant="outline"
          className="mt-2 h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading"
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
