/**
 * **The route file, and it exists to carry one thing across a seam: who arrived.**
 *
 * The screen itself is `sign-in-client.tsx` and is unchanged. What is here is the two-line server
 * component that reads the URL before anything renders, because both values it reads decide the
 * *first paint* and cannot be discovered afterwards:
 *
 *  - `?mode=` — which of the two audiences this screen serves is in front of it. A first-time
 *    invitee arrives from `/collections/join/<token>` and used to be shown *"Your places are
 *    waiting."* under a subhead offering to *pick up your saved map where you left it*. Both are
 *    false for the one person the product is trying to gain, on the product's only acquisition
 *    path. `mode.ts` carries the full argument, and the rule underneath it.
 *  - `?state=` — that the link they followed is dead, which `/auth/callback` is what decides.
 *
 * **Why a server component rather than a hook.** Reading either value on the client means one of
 * two bad outcomes: `useSearchParams`, which wraps a screen whose whole job is to render
 * immediately in a Suspense boundary, or `window.location` in a state initialiser, which renders
 * the wrong headline on the server and then hydrates into a mismatch. Neither is a trade — a server
 * page reading `searchParams` and passing two props costs one file and no behaviour.
 *
 * Reading `searchParams` opts this route into dynamic rendering, which is the correct cost for a
 * screen that must reflect the URL it was reached by. The submit-time `?next=` read stays on the
 * client, in the island, because that one is wanted once at submit rather than at paint.
 */
import { SignInScreen } from './sign-in-client';
import { signInModeFromParam, signInNotice } from './mode';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <SignInScreen
      initialMode={signInModeFromParam(params.mode)}
      notice={signInNotice(params.state)}
    />
  );
}
