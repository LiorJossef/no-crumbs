import Link from 'next/link';
import { createClient } from '@/app/_lib/supabase/server';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * S1, the landing screen (`docs/brand-and-product-foundation.md` §6): "one line of what this is,
 * one CTA", explicitly **pruned from a marketing page**. It replaces MS2's deploy placeholder,
 * which was still shipping `Milestone MS2 — toolchain and deploy pipeline` to users and rendered
 * both of its paragraphs in `var(--muted)` — the *surface* token (`#FAF9F6`), byte-identical to
 * the page background, so the only sentence describing the product was invisible. Body text is
 * `--muted-foreground`; `--muted` is never a text colour.
 *
 * `BUILD_INFO` is not read here any more. It is still the deploy check's payload in
 * `app/healthz/route.ts`, which is the surface that is actually asserted on — a stage name is
 * operator information, not something a visitor has any use for.
 *
 * Composition is `ChromeStage`, the same component `/sign-in` renders — not "the same language" as
 * it, the same object. Landing and sign-in are adjacent in the demo path; if they do not read as
 * one product, that is the first thing anyone notices, and two files agreeing by convention is how
 * that drifts.
 *
 * **This is also `I2-5`, the dead-space package.** Q1 finding S3 measured 45–60% of the mobile
 * viewport empty across six screens, and this screen was one of the worst: mark and editorial
 * pinned to the top, the three steps and the CTA pinned to the bottom by `mt-auto`, and a single
 * stretched gap between them that grew with the phone. The fix is the composition the codebase
 * already had an answer for — the desktop no-places screen is a centred card sized to its content —
 * so the slack became the room around one object instead of a hole inside it. **Nothing was
 * invented to fill space:** no section, no illustration, no testimonial. The content is the same
 * six strings it was.
 *
 * No marketing claims, no counts, no testimonials, no screenshots: every line on this page is
 * either what the product does or the state the visitor is in.
 */

// Static so the copy is diffable in one place rather than inline in three ternaries.
const KICKER = 'A personal map';
const HEADLINE = ['Your saved places,', 'on one map.'] as const;
const SUBHEAD =
  'Paste a TikTok link and the place lands on your map. Organised by where, not by when.';
// The honest boundary, stated in the product rather than in a footnote
// (`brand-and-product-foundation.md` §1). The string is unchanged and still true; its old reason
// is not. It used to say the manual-add recovery path for an Instagram or YouTube link "does not
// exist yet" — that shipped on 2026-08-30 as `components/add/add-sheet.tsx`. What the sentence
// promises is still exactly what the *import* pipeline reads, which is TikTok and nothing else, so
// the line stays: a recovery path is not the same claim as support.
const BOUNDARY = 'Works with TikTok links today.';
// What actually happens, in the product's own three steps — not a feature list and not a claim
// about how well it works. Step 2 is deliberately "check what we found" rather than anything that
// promises a result: at LEVEL B the modal import outcome is *no places in this post*
// (`mvp-plan.md`), and the review screen is where the user confirms, not where we celebrate.
const STEPS = [
  'Paste a link from TikTok',
  'Check what we found',
  'It lands on your map',
] as const;

/**
 * The session, or `null` if it cannot be read for any reason — unconfigured, unreachable, or
 * failing. Never throws, so nothing here can take the landing page down.
 */
async function currentUserOrNull() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export default async function Home() {
  // The proxy (`src/proxy.ts`) only guards `/map`, so `/` renders for signed-out and signed-in
  // visitors alike and the single CTA has to be correct for both. Read rather than redirected:
  // bouncing a signed-in visitor straight to `/map` would remove the landing screen from the demo
  // path, and S1 is a surface the product is graded on.
  //
  // Wrapped, and this is not defensive padding. Reading the session made `/` the first public
  // surface that depends on Supabase being configured at all — and CI proved the consequence
  // immediately: with no Supabase env vars, `createClient()` throws, the page 500s, and
  // Playwright's webServer never comes up. `current-state.md` §5.1 records that **production is
  // in exactly that state right now**, so unguarded this would have taken the landing page down
  // in production the moment it deployed.
  //
  // A landing page is the one screen that must render when everything else is broken: it is what
  // a visitor sees first and it is the route to sign-in, which is where a misconfigured
  // deployment gets diagnosed. So a failure to answer "is anyone signed in?" degrades to "nobody
  // is" — the signed-out view is correct for every visitor who has not signed in, which is every
  // first-time visitor, and a signed-in one loses only the `Open your map` shortcut.
  const user = await currentUserOrNull();

  return (
    <main className="relative isolate min-h-dvh">
      <ChromeGround />

      <ChromeStage
        editorial={
          <>
            <ChromeItem>
              <ChromeKicker>{KICKER}</ChromeKicker>
            </ChromeItem>

            <ChromeItem>
              {/* The one editorial heading on this screen, so it takes the display face with the
                  wordmark in the lockup above it — §3.1's split is `h1`/`h2` and the wordmark in
                  Fraunces, everything functional in Manrope. Leaving this in Manrope would have put
                  a serif word directly above a grotesque headline, which is the near-miss pairing
                  §3.1 retired Archivo over, reproduced inside one column.

                  `text-display lg:text-display-lg`, both tokens, and both are the design system's
                  Display step — 34px and its specified 40px cap. `text-hero` was here and is wrong
                  now that the headline lives in a card column rather than in a full-bleed one: it
                  is `clamp(2.5rem, 5.5vw, 4rem)`, so it reads the *viewport* and resolves to 64px
                  at 1440, about 24px past what the column can set two words in and 24px past
                  anything that document specifies.

                  The old values are named in prose rather than quoted, and that is not fussiness:
                  `token-call-sites.test.ts` counts arbitrary-value classes with a regex over the
                  source and cannot tell a comment from a call site, so a bracket quoted here is a
                  bracket on the ledger. Same rule as the hex literals K12 counts. */}
              <h1
                className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                style={DISPLAY_HEADING_AXES}
              >
                {HEADLINE[0]}
                <br />
                {HEADLINE[1]}
              </h1>
            </ChromeItem>

            <ChromeItem>
              <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-md lg:text-base">
                {SUBHEAD}
              </p>
            </ChromeItem>
          </>
        }
        form={
          <div className="flex flex-col">
            {/* The numerals use `--tag` / `--tag-foreground`, whose whole definition is "a label,
                never an action" — which is what a step number is. No new colour is introduced. */}
            <ChromeItem>
              <ol className="mb-7 flex flex-col gap-3 lg:mb-8">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tag font-heading text-micro font-extrabold text-tag-foreground"
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </ChromeItem>

            <ChromeItem className="flex flex-col">
              {user ? (
                <>
                  <Link
                    href="/map"
                    className={cn(
                      buttonVariants(),
                      'h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading',
                    )}
                  >
                    Open your map →
                  </Link>
                  <p className="mt-3 truncate text-center text-sm font-medium text-muted-foreground">
                    Signed in as <span className="font-bold text-foreground">{user.email}</span>
                  </p>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    className={cn(
                      buttonVariants(),
                      'h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading',
                    )}
                  >
                    Sign in →
                  </Link>
                  <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
                    New here?{' '}
                    <Link href="/sign-in" className="font-bold text-brand">
                      Create an account
                    </Link>
                  </p>
                </>
              )}

              <p className="mt-6 text-center text-xs font-medium text-muted-foreground lg:mt-8">
                {BOUNDARY}
              </p>
            </ChromeItem>
          </div>
        }
      />
    </main>
  );
}
